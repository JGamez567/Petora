// app/admin/review/page.tsx  (URL: /admin/review)
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

// Auth-gated admin page — never prerender it. This also avoids the build-time
// Supabase-client error from trying to statically generate the route.
export const dynamic = "force-dynamic";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function currentAdminEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase() ?? null;
  return email && ADMIN_EMAILS.includes(email) ? email : null;
}

async function resolveReview(formData: FormData) {
  "use server";
  if (!(await currentAdminEmail())) return;          // re-check on the server
  const id = formData.get("id");
  if (!id) return;
  await adminClient().from("review_queue").update({ status: "resolved" }).eq("id", id);
  revalidatePath("/admin/review");
}

const fmt = (n: number) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default async function AdminReviewPage() {
  if (!(await currentAdminEmail())) {
    return <div className="mx-auto max-w-lg p-6 text-sm text-gray-600">Not authorized.</div>;
  }

  const db = adminClient();
  const { data: reviews } = await db
    .from("review_queue")
    .select("id, user_id, snapshot_id, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const rows = reviews ?? [];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const snapIds = [...new Set(rows.map((r) => r.snapshot_id).filter(Boolean))];

  const profiles = userIds.length
    ? (await db.from("profiles").select("id, roblox_username").in("id", userIds)).data ?? []
    : [];
  const snaps = snapIds.length
    ? (await db.from("portfolio_snapshots").select("id, total_value, holdings").in("id", snapIds)).data ?? []
    : [];

  const nameOf = new Map(profiles.map((p: any) => [p.id, p.roblox_username]));
  const snapOf = new Map(snaps.map((s: any) => [s.id, s]));

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Review queue</h1>
      <p className="text-sm text-gray-500">{rows.length} pending {rows.length === 1 ? "request" : "requests"}.</p>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing to review right now.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => {
            const snap: any = r.snapshot_id ? snapOf.get(r.snapshot_id) : null;
            const holdings: any[] = Array.isArray(snap?.holdings) ? snap.holdings : [];
            return (
              <li key={r.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{nameOf.get(r.user_id) ?? "(unknown user)"}</p>
                    <p className="text-xs text-gray-400">
                      flagged {new Date(r.created_at).toLocaleString()}
                      {snap ? ` · total ${fmt(snap.total_value)}` : " · no snapshot"}
                    </p>
                  </div>
                  <form action={resolveReview}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      Mark resolved
                    </button>
                  </form>
                </div>

                {holdings.length > 0 && (
                  <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-100 text-sm">
                    {holdings.map((it, i) => (
                      <li key={i} className="flex items-center justify-between px-3 py-1.5">
                        <span className="text-gray-700">
                          {it.name}{it.count > 1 ? ` ×${it.count}` : ""}
                          {it.neon === "neon" ? " (neon)" : it.neon === "mega" ? " (mega)" : ""}
                          {it.fly ? " F" : ""}{it.ride ? " R" : ""}
                          {it.confidence && it.confidence !== "confident" ? ` · ${it.confidence}` : ""}
                        </span>
                        <span className="tabular-nums text-gray-500">{it.subtotal != null ? fmt(it.subtotal) : "—"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}