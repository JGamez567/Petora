// app/scan/route.ts
//
// UNIFIED scanner. Replaces app/submit/route.ts AND app/personal-scan/route.ts.
// One route, one `leaderboard` flag.
//
// Every scan (regardless of the flag):
//   auth -> profile -> unified daily limit -> server-side rescan -> REPLACE-write
//   portfolio_items (erase-and-replace; no merge/add) -> snapshot -> stamp limit.
//
// The flag only changes the ending:
//   leaderboard === true  -> requires roblox_verified_at, runs the OCR username gate,
//                            writes a 'submit' snapshot, sets is_public = true.
//   leaderboard === false -> no gate, writes a 'personal' snapshot, sets is_public = false.
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
function usernameMatches(detected: string | null, expected: string): boolean {
  if (!detected || !expected) return false;
  return levenshtein(detected.toLowerCase(), expected.toLowerCase()) <= 1;
}

export async function POST(req: Request) {
  // user-scoped client (cookies) — ONLY to prove who's calling
  const cookieStore = await cookies(); // Next 15. On Next 14, drop the await.
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

  // 3) inputs: images + the single leaderboard toggle
  const form = await req.formData();
  const files = form.getAll('files');
  const wantsLeaderboard = String(form.get('leaderboard') ?? 'false') === 'true';
  if (files.length < 1 || files.length > 7) {
    return NextResponse.json({ error: 'expected_1_to_7_images' }, { status: 400 });
  }

  // 4) UNIFIED daily limit — one scan/day on free tier, premium unlimited, no matter
  //    which way the toggle is set (so toggling can't buy a second free scan).
  //    Checked BEFORE the expensive rescan and BEFORE the verification check, so a
  //    verified user who is merely rate-limited isn't told to "verify".
  if (!profile.is_premium && profile.last_personal_scan_at) {
    const elapsed = Date.now() - new Date(profile.last_personal_scan_at).getTime();
    const DAY = 24 * 60 * 60 * 1000;
    if (elapsed < DAY) {
      return NextResponse.json(
        { error: 'rate_limited', hours_left: Math.ceil((DAY - elapsed) / 3_600_000) },
        { status: 429 }
      );
    }
  }

  // 5) leaderboard path requires verification — fail early, before we spend a rescan
  if (wantsLeaderboard && !profile.roblox_verified_at) {
    return NextResponse.json({ error: 'roblox_verification_required' }, { status: 403 });
  }

  // 6) re-scan server-side. Leaderboard mode asks the scanner for the OCR username
  //    gate; personal mode skips it. The browser never supplies items/values.
  const scanForm = new FormData();
  for (const f of files) scanForm.append('files', f as Blob);
  scanForm.append('mode', wantsLeaderboard ? 'leaderboard' : 'personal');

  const scanUrl = process.env.SCAN_URL ?? process.env.NEXT_PUBLIC_SCAN_URL;
  const scanRes = await fetch(`${scanUrl}/scan`, { method: 'POST', body: scanForm });
  const scan = await scanRes.json();
  if (scan.status !== 'ok') {
    // includes needs_consolidation — the front end re-surfaces `scan` for that case
    return NextResponse.json({ error: 'scan_not_ok', scan }, { status: 422 });
  }

  // 7) leaderboard anti-cheat: OCR'd header(s) must match the trusted profile name
  if (wantsLeaderboard) {
    const detected: string[] = (scan.gate?.detected ?? []).filter(Boolean);
    if (detected.length === 0) {
      return NextResponse.json({ error: 'username_unreadable' }, { status: 422 });
    }
    if (detected.some((d) => !usernameMatches(d, profile.roblox_username))) {
      return NextResponse.json(
        { error: 'username_mismatch', detected, expected: profile.roblox_username },
        { status: 422 }
      );
    }
  }

  // 8) authoritative write with the SERVICE ROLE (bypasses RLS + the §10 trigger,
  //    which only blocks the 'authenticated'/'anon' roles)
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const now = new Date().toISOString();

  // Scanned pets are tagged source='scan' so a scan only ever replaces its OWN rows.
  // Manually-added pets (source='manual') are left completely untouched.
  const scanned = (scan.items ?? [])
    .filter((r: any) => r.pet_variant_id != null)
    .map((r: any) => ({
      user_id: user.id,
      pet_variant_id: r.pet_variant_id,
      quantity: r.count,
      source: 'scan',
      updated_at: now,
    }));

  // Replace ONLY previously-scanned rows. NOTE: delete+insert isn't transactional;
  // if the insert fails after the delete, scanned rows are gone and the user can
  // retry (the daily limit isn't stamped until step 10, so a failed write doesn't
  // burn their scan). Manual rows are never part of this delete.
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

  // 9) snapshot. Two totals on purpose:
  //    - LEADERBOARD ('submit'): verified pets only = the scanned total. Manual adds
  //      must never inflate the board, so use the scanner's trusted total as-is.
  //    - PERSONAL ('personal'): the WHOLE portfolio (manual + scanned), valued from
  //      current_pet_values, so the progress graph lines up with the daily scraper's
  //      whole-portfolio points instead of dropping every time you scan.
  const scannedTotal = scan.totals?.total ?? 0; // full scanned total, NOT confident_total
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
    // missing 'submit' snapshot => they wouldn't show on the board -> hard fail.
    // missing 'personal' snapshot => only one graph point lost -> soft fail.
    if (wantsLeaderboard) {
      return NextResponse.json({ error: 'write_failed', detail: snapErr.message }, { status: 500 });
    }
    console.error('PERSONAL SNAPSHOT FAILED:', snapErr);
  }

  // 10) leaderboard membership IS the toggle: opt in -> public, opt out -> drop off.
  //     Also stamp the unified daily limiter, and keep last_submitted_at fresh on the
  //     leaderboard path. (is_public isn't a protected column, but routing it through
  //     this verified path keeps the *value* behind it trustworthy.)
  // only stamp the daily limiter when the scan actually produced pets,
  // so a no-result scan doesn't burn the user's one free daily scan
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
  });
}