// → app/settings/page.tsx   (URL: /settings)
// The OAuth callback redirects here with ?roblox=ok | taken | error.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ roblox?: string }>;
}) {
  const { roblox } = await searchParams;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  let verified = false;
  let robloxUsername: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("roblox_verified_at, roblox_username")
      .eq("id", user.id)
      .single();
    verified = !!profile?.roblox_verified_at;
    robloxUsername = profile?.roblox_username ?? null;
  }

  const messages: Record<string, string> = {
    ok: "✓ Roblox account verified.",
    taken: "That Roblox account is already linked to another account here.",
    error: "Verification didn't complete — please try again.",
  };

  // green banner for success, amber for taken/error
  const bannerCls =
    roblox === "ok"
      ? "border border-[rgba(93,230,168,0.28)] bg-[rgba(93,230,168,0.10)] text-[color:var(--up)]"
      : "border border-[rgba(245,200,120,0.28)] bg-[rgba(245,200,120,0.08)] text-[#F5C878]";

  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <p className="petora-eyebrow">Account</p>
      <h1 className="mt-1.5 text-3xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">Roblox verification</h1>

      {roblox && (
        <p className={`mt-5 rounded-lg px-3.5 py-2.5 text-sm ${bannerCls}`}>
          {messages[roblox] ?? "Unknown status."}
        </p>
      )}

      <div className="petora-card mt-5 p-6" style={{ borderColor: "var(--line-2)" }}>
        {!user ? (
          <div className="space-y-4">
            <p className="text-sm text-[color:var(--muted)]">Please sign in to verify your Roblox account.</p>
            <a href="/login"
              className="inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-[#1a1030] transition hover:brightness-110 [background-image:var(--ramp-h)] [font-family:var(--font-display)]">
              Log in
            </a>
          </div>
        ) : verified ? (
          <div className="space-y-4">
            <p className="rounded-lg border border-[rgba(93,230,168,0.28)] bg-[rgba(93,230,168,0.10)] px-3.5 py-2.5 text-sm text-[color:var(--up)]">
              ✓ Verified as <span className="font-semibold">{robloxUsername}</span>.
            </p>
            <a href="/oauth/login" className="inline-block text-sm text-[color:var(--lilac)] underline underline-offset-2 transition hover:text-[color:var(--text)]">
              Re-verify (after a Roblox username change)
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[color:var(--muted)]">
              Verify your Roblox account to submit to the leaderboard.
            </p>
            <a href="/oauth/login"
              className="inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-[#1a1030] shadow-[0_12px_34px_-12px_rgba(168,85,247,0.7)] transition hover:brightness-110 [background-image:var(--ramp-h)] [font-family:var(--font-display)]">
              Verify with Roblox
            </a>
          </div>
        )}
      </div>
    </main>
  );
}