// app/api/admin/check/route.ts
//
// Tells the client whether the SIGNED-IN user is an admin, without ever
// shipping the admin email list to the browser. The nav uses this to decide
// whether to render the Admin button.
//
// This is cosmetic only — the real gate is the server-side check inside
// /admin and /admin/review, which re-verifies on every request. Someone who
// forges `{admin:true}` in devtools just gets a button that leads to a
// "Not authorized." page.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email?.toLowerCase() ?? null;
    return NextResponse.json({ admin: !!email && ADMIN_EMAILS.includes(email) });
  } catch {
    return NextResponse.json({ admin: false });
  }
}