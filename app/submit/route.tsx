// app/submit/route.ts
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
  // user-scoped client (cookies) — ONLY for proving who's calling
  const cookieStore = await cookies(); // Next 15. On Next 14, drop the await.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  // 1) auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });

  // 2) verification requirement — trusted name comes from HERE, never the client
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('roblox_verified_at, roblox_username, is_premium, last_submitted_at')
    .eq('id', user.id)
    .single();
  if (pErr || !profile?.roblox_verified_at) {
    return NextResponse.json({ error: 'roblox_verification_required' }, { status: 403 });
  }
  // rate limit: free tier = 1 successful submission per 24h
  if (!profile.is_premium && profile.last_submitted_at) {
    const elapsed = Date.now() - new Date(profile.last_submitted_at).getTime();
    const DAY = 24 * 60 * 60 * 1000;
    if (elapsed < DAY) {
      return NextResponse.json(
        { error: 'rate_limited', hours_left: Math.ceil((DAY - elapsed) / 3_600_000) },
        { status: 429 }
      );
    }
  }

  // 3) take the images and RE-SCAN server-side (browser never supplies items/values)
  const form = await req.formData();
  const files = form.getAll('files');
  if (files.length < 1 || files.length > 7) {
    return NextResponse.json({ error: 'expected_1_to_7_images' }, { status: 400 });
  }
  const scanForm = new FormData();
  for (const f of files) scanForm.append('files', f as Blob);
  scanForm.append('mode', 'leaderboard');

  const scanUrl = process.env.SCAN_URL ?? process.env.NEXT_PUBLIC_SCAN_URL;
  const scanRes = await fetch(`${scanUrl}/scan`, { method: 'POST', body: scanForm });
  const scan = await scanRes.json();
  if (scan.status !== 'ok') {
    return NextResponse.json({ error: 'scan_not_ok', scan }, { status: 422 });
  }

  // 4) REAL username gate: OCR'd header(s) vs the trusted profile.roblox_username
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

  // 5) authoritative write with the SERVICE ROLE (bypasses RLS; the browser cannot)
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // mappings confirmed against a real /scan response
  const items = (scan.items ?? []).map((r: any) => ({
    user_id: user.id,
    pet_variant_id: r.pet_variant_id,
    quantity: r.count,
    updated_at: new Date().toISOString(),
  }));
  const total = scan.totals?.total ?? 0; // full total, NOT confident_total

  // replace the user's portfolio
  await admin.from('portfolio_items').delete().eq('user_id', user.id);
  if (items.length) {
    const { error } = await admin.from('portfolio_items').insert(items);
    if (error) return NextResponse.json({ error: 'write_failed', detail: error.message }, { status: 500 });
  }

  // snapshot so the leaderboard reflects it immediately
  const { error: snapErr } = await admin.from('portfolio_snapshots').insert({
    user_id: user.id,
    total_value: total,
    holdings: scan.items,
    recorded_at: new Date().toISOString(),
  });
if (snapErr) return NextResponse.json({ error: 'write_failed', detail: snapErr.message }, { status: 500 });

  const { error: stampErr } = await admin.from('profiles')
    .update({ last_submitted_at: new Date().toISOString() })
    .eq('id', user.id);
  if (stampErr) console.error('STAMP FAILED:', stampErr);

  return NextResponse.json({ status: 'ok', total, pets: items.length, items: scan.items });
}
