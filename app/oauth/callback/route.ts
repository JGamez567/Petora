// → app/oauth/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";   // ← add

export const runtime = "nodejs";

const DISCOVERY = "https://apis.roblox.com/oauth/.well-known/openid-configuration";
let _cfg: any = null;
async function discovery() {
  if (!_cfg) _cfg = await (await fetch(DISCOVERY)).json();
  return _cfg;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const jar = await cookies();
  const savedState = jar.get("rbx_state")?.value;
  const verifier = jar.get("rbx_verifier")?.value;

  const back = (status: string) =>
    NextResponse.redirect(new URL(`/settings?roblox=${status}`, req.url));

  if (!code || !state || !savedState || state !== savedState || !verifier) {
    return back("error");
  }

  const { token_endpoint, userinfo_endpoint } = await discovery();

  const basic = Buffer.from(
    `${process.env.ROBLOX_CLIENT_ID}:${process.env.ROBLOX_CLIENT_SECRET}`,
  ).toString("base64");
  const tokenRes = await fetch(token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.ROBLOX_REDIRECT_URI!,
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) return back("error");
  const { access_token } = await tokenRes.json();

  const uiRes = await fetch(userinfo_endpoint, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!uiRes.ok) return back("error");
  const claims = await uiRes.json();
  const robloxUserId = claims.sub as string;
  const robloxUsername = (claims.preferred_username ?? claims.name) as string;

  // Session client — used ONLY to identify the signed-in user (trusted via getUser).
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (toSet) =>
          toSet.forEach(({ name, value, options }) => jar.set(name, value, options)),
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  // Service-role client — the protected-column write must run as service_role
  // so the profiles_protect trigger lets it through.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { error } = await admin
    .from("profiles")
    .update({
      roblox_user_id: robloxUserId,
      roblox_username: robloxUsername,
      roblox_verified_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error?.code === "23505") return back("taken"); // unique index still fires under service role
  if (error) return back("error");

  jar.delete("rbx_state");
  jar.delete("rbx_verifier");
  jar.delete("rbx_nonce");
  return back("ok");
}