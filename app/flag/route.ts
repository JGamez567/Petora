// app/flag/route.ts
// POST — a user requests a manual review of their latest leaderboard submission,
// optionally marking which specific pets the scanner got wrong.
//
// Body (optional): { flagged: [{ name, pet_variant_id, neon, fly, ride, count }] }
// An empty/missing body still creates a review request (legacy "flag everything").
//
// The flagged list is advisory — the authoritative scan data (every pet plus its
// confidence rating) is read by the admin page from the linked snapshot's
// holdings, which the user cannot tamper with. We sanitize and cap the client
// list rather than trusting it.

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

type FlaggedPet = {
  name: string;
  pet_variant_id: number | null;
  neon: string;
  fly: boolean;
  ride: boolean;
  count: number;
};

function sanitizeFlagged(raw: unknown): FlaggedPet[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 100).flatMap((x: any) => {
    if (!x || typeof x.name !== "string") return [];
    return [{
      name: x.name.slice(0, 80),
      pet_variant_id:
        typeof x.pet_variant_id === "number" && Number.isFinite(x.pet_variant_id)
          ? x.pet_variant_id
          : null,
      neon: x.neon === "neon" || x.neon === "mega" ? x.neon : "normal",
      fly: !!x.fly,
      ride: !!x.ride,
      count: Math.max(1, Math.min(500, Math.floor(Number(x.count)) || 1)),
    }];
  });
}

export async function POST(req: Request) {
  // who's asking (cookie auth, same pattern as the scan route)
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  // optional flagged-pets body (absent for the legacy flag-all behavior)
  let flagged: FlaggedPet[] = [];
  try {
    const body = await req.json();
    flagged = sanitizeFlagged(body?.flagged);
  } catch {
    /* no JSON body — fine */
  }

  // review_queue is service-role territory
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // link the user's latest leaderboard submission — the snapshot the admin
  // page resolves into the full pet list with confidence ratings
  const { data: snaps } = await admin
    .from("portfolio_snapshots")
    .select("id")
    .eq("user_id", user.id)
    .eq("source", "submit")
    .order("recorded_at", { ascending: false })
    .limit(1);
  const snapshot_id = snaps?.[0]?.id ?? null;
  if (!snapshot_id) {
    return NextResponse.json({ error: "no_submission" }, { status: 400 });
  }

  // one pending review per user: re-flagging updates the existing request
  // instead of stacking duplicates in the queue
  const { data: existing } = await admin
    .from("review_queue")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .limit(1);

  if (existing && existing.length > 0) {
    const { error } = await admin
      .from("review_queue")
      .update({ snapshot_id, flagged_pets: flagged.length ? flagged : null })
      .eq("id", existing[0].id);
    if (error) return NextResponse.json({ error: "write_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, updated: true });
  }

  const { error } = await admin.from("review_queue").insert({
    user_id: user.id,
    snapshot_id,
    status: "pending",
    flagged_pets: flagged.length ? flagged : null,
  });
  if (error) return NextResponse.json({ error: "write_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}