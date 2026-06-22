// app/api/scan/route.ts
//
// UNIFIED scanner. Replaces app/submit/route.ts AND app/personal-scan/route.ts.
// One route, one `leaderboard` flag.
//
// FIX (v3 - windowed username gate):
//   usernameMatches() now tolerates OCR junk glued to the front/back of the real
//   username (e.g. "_PetoraTrackerx", "IJGamez567x") via a sliding window, while
//   STILL rejecting a different account's name. Plain Levenshtein-1 was rejecting
//   legitimate gray-board reads (which arrive 2+ edits off due to edge junk),
//   locking users out of their own portfolios.
//
//   Security: the windowed path only applies when the expected username makes up
//   >= WINDOW_COVERAGE of the OCR token, so a short name cannot match as a
//   substring of an unrelated, longer username (e.g. "Gamez" claiming a
//   "JGamez567" board). A different-length, different name still fails outright.
//
// PERF (v4 - OCR gate early-exit):
//   We now pass the verified `account` (profile.roblox_username) to the scanner so
//   its OCR gate can stop the moment it reads a matching name instead of running
//   all six Tesseract passes. This route STAYS the authoritative gate — it
//   re-checks every candidate the scanner returns with usernameMatches() below —
//   so the early-exit can only save OCR time, never change the accept/reject
//   decision. If roblox_username is null we send "", and the scanner falls back to
//   its full multi-pass behaviour.
//
// FIX (v2):
//   Personal scans now also run a soft username check against the OCR gate.
//   Previously, personal mode skipped the gate entirely, which meant anyone
//   could submit another user's screenshot under their own account.
//   Now:
//     - leaderboard mode: hard gate (rejects if username doesn't match)
//     - personal mode:    soft gate (warns but still writes if username unreadable,
//                         hard rejects if a username IS detected but doesn't match)
//
// Every scan (regardless of the flag):
//   auth -> profile -> unified daily limit -> server-side rescan -> REPLACE-write
//   portfolio_items (erase-and-replace; no merge/add) -> snapshot -> stamp limit.
//
// The flag only changes the ending:
//   leaderboard === true  -> requires roblox_verified_at, runs the OCR username gate
//                            (hard), writes a 'submit' snapshot, sets is_public = true.
//   leaderboard === false -> runs the OCR username gate (soft), writes a 'personal'
//                            snapshot, sets is_public = false.
//
// INVARIANT PRESERVED: 'submit' is the ONLY source get_leaderboard counts, and the
// only path that writes one is the verified path here. Personal scans can never
// reach the board.

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// trusted username compare (tolerance baked in; mirrors the Python gate)
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Minimum edit distance between `expected` and any window of `candidate` the same
// length as `expected`. Lets OCR junk on the front/back fall outside the window so
// the real username can still match cleanly. If the candidate is shorter than the
// expected name there is no window to slide, so we fall back to a full compare.
function windowedDistance(candidate: string, expected: string): number {
  const c = candidate.toLowerCase();
  const e = expected.toLowerCase();
  if (c.length < e.length) return levenshtein(c, e);
  let best = Infinity;
  for (let i = 0; i + e.length <= c.length; i++) {
    const d = levenshtein(c.slice(i, i + e.length), e);
    if (d < best) best = d;
    if (best === 0) break;
  }
  return best;
}

// The matched username must make up at least this fraction of the OCR token for the
// windowed (junk-trimming) path to apply. Stops a short name from matching as a
// substring buried inside a longer, unrelated username. Tune up to be stricter.
const WINDOW_COVERAGE = 0.7;

// FIX: now accepts a list of candidates (Python returns multiple OCR attempts).
// Returns true if ANY candidate matches the expected username.
function usernameMatches(detected: string[] | string | null, expected: string): boolean {
  if (!detected || !expected) return false;
  const candidates = Array.isArray(detected) ? detected : [detected];
  const e = expected.toLowerCase();
  return candidates.some((raw) => {
    if (!raw) return false;
    const d = raw.toLowerCase();
    // 1) Direct tolerant match — clean reads and a single OCR character slip.
    if (levenshtein(d, e) <= 1) return true;
    // 2) Windowed match — tolerate junk glued to the front/back of the real
    //    username, but ONLY when the username makes up most of the token, so a
    //    short name can't match as a substring of an unrelated, longer name.
    if (d.length >= e.length && e.length >= WINDOW_COVERAGE * d.length) {
      return windowedDistance(d, e) <= 1;
    }
    return false;
  });
}

export async function POST(req: Request) {
  // user-scoped client (cookies) — ONLY to prove who's calling
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  // 1) auth — every scan saves to YOUR portfolio, so you must be signed in
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });

  // 2) one profile fetch covers both paths
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('roblox_verified_at, roblox_username, is_premium, last_personal_scan_at')
    .eq('id', user.id)
    .single();
  if (pErr || !profile) {
    return NextResponse.json({ error: 'profile_not_found' }, { status: 403 });
  }

  // service-role client (bypasses RLS) — used for the attempt counter/log below
  // and for the authoritative portfolio writes later. Created once, reused.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // 3) inputs: images + the single leaderboard toggle
  const form = await req.formData();
  const files = form.getAll('files');
  const wantsLeaderboard = String(form.get('leaderboard') ?? 'false') === 'true';
  if (files.length < 1 || files.length > 7) {
    return NextResponse.json({ error: 'expected_1_to_7_images' }, { status: 400 });
  }

  // 4) UNIFIED daily limit — rolling 24h cap on ALL scans (personal + leaderboard
  //    combined). Free: 2/day. Premium: 10/day. Every scan writes a
  //    portfolio_snapshots row ('personal' or 'submit'), so we count this user's
  //    snapshots in the trailing 24h instead of keeping a separate counter. The
  //    check runs BEFORE the expensive server-side rescan, so an over-limit request
  //    fails fast. Note: only scans that actually wrote a snapshot count — a
  //    rejected scan (bad OCR match, scanner error) returns before the snapshot and
  //    so does NOT burn a slot. Premium gating here relies on is_premium being set
  //    correctly (see the premium/is_premium standardization, §5).
  // 4) UNIFIED daily limits — rolling 24h, all scans (personal + leaderboard).
  //
  //    Two caps work together:
  //      SUCCESS_LIMIT  counts scans that produced a snapshot ('personal'/'submit').
  //                     This is the user-facing quota — bad photos never touch it.
  //                     Free 2 / Premium 10.
  //      ATTEMPT_LIMIT  counts EVERY pipeline run (scan_attempts), pass or fail.
  //                     This is the compute-abuse guard: it bounds someone firing
  //                     endless garbage that fails and would otherwise never count.
  //                     Set above SUCCESS_LIMIT to leave room for genuine retries.
  //                     Free 6 / Premium 25.
  //
  //    Checked here BEFORE the expensive rescan so an over-limit request fails fast.
  //    Premium gating relies on is_premium being set correctly (see §5).
  const DAY = 24 * 60 * 60 * 1000;
  const SCAN_LIMIT = profile.is_premium ? 10 : 2;       // successful scans/day
  const ATTEMPT_LIMIT = profile.is_premium ? 25 : 6;    // total pipeline runs/day
  const windowStart = new Date(Date.now() - DAY).toISOString();

  // successful scans in the window (from snapshots)
  const { data: recentScans, error: limitErr } = await supabase
    .from('portfolio_snapshots')
    .select('recorded_at')
    .eq('user_id', user.id)
    .in('source', ['personal', 'submit'])
    .gte('recorded_at', windowStart)
    .order('recorded_at', { ascending: true });
  if (limitErr) console.error('SCAN LIMIT COUNT FAILED:', limitErr);
  const usedToday = limitErr ? 0 : (recentScans?.length ?? 0);

  // total attempts in the window (pass or fail) — abuse guard
  const { data: recentAttempts, error: attErr } = await admin
    .from('scan_attempts')
    .select('created_at')
    .eq('user_id', user.id)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: true });
  if (attErr) console.error('ATTEMPT COUNT FAILED:', attErr);
  const attemptsToday = attErr ? 0 : (recentAttempts?.length ?? 0);

  // success quota reached → normal "you've used your scans" message
  if (usedToday >= SCAN_LIMIT) {
    const resetAt = new Date(recentScans![0].recorded_at).getTime() + DAY;
    const hoursLeft = Math.max(1, Math.ceil((resetAt - Date.now()) / 3_600_000));
    return NextResponse.json(
      {
        error: 'rate_limited',
        limit: SCAN_LIMIT,
        used: usedToday,
        is_premium: profile.is_premium,
        hours_left: hoursLeft,
        reset_at: new Date(resetAt).toISOString(),
        message: profile.is_premium
          ? `You've used all ${SCAN_LIMIT} scans for today. Your next one opens in about ${hoursLeft}h.`
          : `Free accounts get ${SCAN_LIMIT} scans per day. Try again in about ${hoursLeft}h, or upgrade to Premium for 10 per day.`,
      },
      { status: 429 }
    );
  }

  // attempt cap reached (mostly failed scans) → slow-down message
  if (attemptsToday >= ATTEMPT_LIMIT) {
    const resetAt = new Date(recentAttempts![0].created_at).getTime() + DAY;
    const hoursLeft = Math.max(1, Math.ceil((resetAt - Date.now()) / 3_600_000));
    return NextResponse.json(
      {
        error: 'too_many_attempts',
        attempt_limit: ATTEMPT_LIMIT,
        attempts: attemptsToday,
        hours_left: hoursLeft,
        reset_at: new Date(resetAt).toISOString(),
        message: `Too many scan attempts today. Make sure you're uploading clear screenshots of your pet menu, then try again in about ${hoursLeft}h.`,
      },
      { status: 429 }
    );
  }

  // 5) leaderboard path requires Roblox verification — fail early
  if (wantsLeaderboard && !profile.roblox_verified_at) {
    return NextResponse.json({ error: 'roblox_verification_required' }, { status: 403 });
  }

  // 5b) Log this attempt BEFORE the expensive rescan. Everything past this point
  //     runs the full scanner pipeline, so it counts against ATTEMPT_LIMIT whether
  //     it ultimately succeeds or fails. Cheap early rejects above (auth, roblox
  //     verification) happen before this line and don't consume an attempt.
  const { error: attLogErr } = await admin
    .from('scan_attempts')
    .insert({ user_id: user.id });
  if (attLogErr) console.error('ATTEMPT LOG FAILED:', attLogErr);

  // 6) re-scan server-side. Both modes now request the OCR username gate.
  //    leaderboard mode: 'leaderboard' (hard gate)
  //    personal mode:    'personal_gated' (soft gate — scanner still returns
  //                      detected usernames so we can cross-check)
  //
  //    We also pass `account` (the verified roblox_username) so the scanner's OCR
  //    gate can early-exit on a matching read. This route still re-checks every
  //    returned candidate below, so the gate decision is unchanged — only faster.
  const scanForm = new FormData();
  for (const f of files) scanForm.append('files', f as Blob);
  scanForm.append('mode', wantsLeaderboard ? 'leaderboard' : 'personal_gated');
  scanForm.append('account', profile.roblox_username ?? '');

  const scanUrl = process.env.SCAN_URL ?? process.env.NEXT_PUBLIC_SCAN_URL;
  const scanRes = await fetch(`${scanUrl}/scan`, { method: 'POST', body: scanForm });
  const scan = await scanRes.json();
  if (scan.status !== 'ok') {
    return NextResponse.json({ error: 'scan_not_ok', scan }, { status: 422 });
  }

  // 7) USERNAME GATE — now runs for BOTH modes.
  //
  //    leaderboard (hard): must detect a username AND it must match. No exceptions.
  //    personal (soft):    if a username IS detected and does NOT match → reject.
  //                        if no username detected → allow (OCR can fail on some
  //                        devices; we don't want to lock out legitimate users
  //                        whose headers are hard to read).
  //
  //    This closes the hole where someone could submit another user's screenshot
  //    in personal mode with zero resistance.
  const detected: string[] = (scan.gate?.detected ?? []).filter(Boolean);

  if (wantsLeaderboard) {
    // Hard gate — same as before
    if (detected.length === 0) {
      return NextResponse.json({ error: 'username_unreadable' }, { status: 422 });
    }
    if (!usernameMatches(detected, profile.roblox_username)) {
      return NextResponse.json(
        { error: 'username_mismatch', detected, expected: profile.roblox_username },
        { status: 422 }
      );
    }
  } else {
    // FIX: Soft gate for personal scans.
    // Only reject if we successfully read a username AND it clearly doesn't match.
    // If OCR returns nothing, we give the benefit of the doubt and allow the scan.
    if (detected.length > 0 && !usernameMatches(detected, profile.roblox_username)) {
      return NextResponse.json(
        {
          error: 'username_mismatch',
          detected,
          expected: profile.roblox_username,
          message: "The screenshot doesn't appear to belong to your account. Please submit your own screenshots."
        },
        { status: 422 }
      );
    }
  }

  // 8) authoritative write with the SERVICE ROLE (admin client created above)
  const now = new Date().toISOString();

  const scanned = (scan.items ?? [])
    .filter((r: any) => r.pet_variant_id != null)
    .map((r: any) => ({
      user_id: user.id,
      pet_variant_id: r.pet_variant_id,
      quantity: r.count,
      source: 'scan',
      updated_at: now,
    }));

  const { error: delErr } = await admin
    .from('portfolio_items')
    .delete()
    .eq('user_id', user.id)
    .eq('source', 'scan');
  if (delErr) return NextResponse.json({ error: 'write_failed', detail: delErr.message }, { status: 500 });
  if (scanned.length) {
    const { error: insErr } = await admin.from('portfolio_items').insert(scanned);
    if (insErr) return NextResponse.json({ error: 'write_failed', detail: insErr.message }, { status: 500 });
  }

  // 9) snapshot
  const scannedTotal = scan.totals?.total ?? 0;
  let snapTotal = scannedTotal;
  let snapHoldings: any = scan.items;

  if (!wantsLeaderboard) {
    const { data: allItems } = await admin
      .from('portfolio_items')
      .select('pet_variant_id, quantity')
      .eq('user_id', user.id);
    const rows = allItems ?? [];
    if (rows.length) {
      const ids = rows.map((r) => r.pet_variant_id);
      const { data: vals } = await admin
        .from('current_pet_values')
        .select('pet_variant_id, value')
        .in('pet_variant_id', ids);
      const valueById = new Map<number, number>();
      for (const v of vals ?? []) valueById.set(v.pet_variant_id, Number(v.value));
      snapTotal = rows.reduce((s, r) => s + (valueById.get(r.pet_variant_id) ?? 0) * r.quantity, 0);
      snapHoldings = rows.map((r) => ({ pet_variant_id: r.pet_variant_id, quantity: r.quantity }));
    } else {
      snapTotal = 0;
      snapHoldings = [];
    }
  }

  const { error: snapErr } = await admin.from('portfolio_snapshots').insert({
    user_id: user.id,
    total_value: snapTotal,
    holdings: snapHoldings,
    recorded_at: now,
    source: wantsLeaderboard ? 'submit' : 'personal',
  });
  if (snapErr) {
    if (wantsLeaderboard) {
      return NextResponse.json({ error: 'write_failed', detail: snapErr.message }, { status: 500 });
    }
    console.error('PERSONAL SNAPSHOT FAILED:', snapErr);
  }

  // 10) leaderboard membership toggle + daily limiter stamp
  const producedPets = scanned.length > 0;
  const { error: profErr } = await admin.from('profiles')
    .update({
      is_public: wantsLeaderboard,
      ...(producedPets ? { last_personal_scan_at: now } : {}),
      ...(wantsLeaderboard && producedPets ? { last_submitted_at: now } : {}),
    })
    .eq('id', user.id);
  if (profErr) console.error('PROFILE UPDATE FAILED:', profErr);

  return NextResponse.json({
    status: 'ok',
    leaderboard: wantsLeaderboard,
    total: scannedTotal,
    pets: scanned.length,
    items: scan.items,
    // Submission budget so the scan UI can show "X scans left today".
    // usedToday was the count BEFORE this scan; this scan adds one snapshot.
    submissions: {
      limit: SCAN_LIMIT,
      used: usedToday + 1,
      remaining: Math.max(0, SCAN_LIMIT - (usedToday + 1)),
    },
  });
}