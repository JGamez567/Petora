// → app/oauth/login/route.ts   (URL: /oauth/login)
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

export const runtime = "nodejs"; // needs node crypto + Buffer

const DISCOVERY = "https://apis.roblox.com/oauth/.well-known/openid-configuration";
let _cfg: any = null;
async function discovery() {
  if (!_cfg) _cfg = await (await fetch(DISCOVERY)).json();
  return _cfg;
}
const b64url = (b: Buffer) => b.toString("base64url");

export async function GET() {
  const { authorization_endpoint } = await discovery();

  // CSRF state + PKCE verifier/challenge
  const state = crypto.randomBytes(16).toString("hex");
  const nonce = crypto.randomBytes(16).toString("hex");
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());

  const jar = await cookies(); // await works on both Next 14 (sync) and 15 (async)
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // off on http://localhost
    sameSite: "lax" as const, // survives the redirect back from Roblox
    path: "/",
    maxAge: 600, // 10 min to complete the flow
  };
  jar.set("rbx_state", state, opts);
  jar.set("rbx_verifier", verifier, opts);
  jar.set("rbx_nonce", nonce, opts);

  const params = new URLSearchParams({
    client_id: process.env.ROBLOX_CLIENT_ID!,
    redirect_uri: process.env.ROBLOX_REDIRECT_URI!,
    scope: "openid profile",
    response_type: "code",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return NextResponse.redirect(`${authorization_endpoint}?${params.toString()}`);
}