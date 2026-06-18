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

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-xl font-semibold">Roblox verification</h1>

      {roblox && (
        <p className={`rounded-lg px-3 py-2 text-sm ${
          roblox === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
        }`}>
          {messages[roblox] ?? "Unknown status."}
        </p>
      )}

      {!user ? (
        <p className="text-sm text-gray-600">Please sign in to verify your Roblox account.</p>
      ) : verified ? (
        <div className="space-y-3">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            ✓ Verified as <span className="font-semibold">{robloxUsername}</span>.
          </p>
          <a href="/oauth/login" className="inline-block text-sm text-gray-500 underline">
            Re-verify (after a Roblox username change)
          </a>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Verify your Roblox account to submit to the leaderboard.
          </p>
          <a href="/oauth/login" className="inline-block rounded-lg bg-gray-900 px-4 py-2 font-medium text-white">
            Verify with Roblox
          </a>
        </div>
      )}
    </div>
  );
}