// app/admin/page.tsx  (URL: /admin)
//
// Petora admin dashboard — signups, premium conversions, scan activity, and
// scraper health at a glance. Server component, service-role reads, gated on
// ADMIN_EMAILS (same gate as /admin/review).
//
// DEFENSIVE BY DESIGN: some tables' column names aren't guaranteed (which
// timestamp column portfolio_snapshots or stripe_events uses, etc), so every
// stat is fetched inside a helper that returns null on failure and renders as
// "—". A missing table degrades one card instead of 500-ing the whole page.

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import Link from "next/link";

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

const fmt = (n: number) => Number(n).toLocaleString();
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");

function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export default async function AdminDashboard() {
  const who = await currentAdminEmail();
  if (!who) {
    return <div className="mx-auto max-w-lg p-6 text-sm text-[color:var(--muted)]">Not authorized.</div>;
  }

  const db = adminClient();
  const now = Date.now();
  const since = (hours: number) => new Date(now - hours * 3600_000).toISOString();

  // ── generic, failure-tolerant helpers ────────────────────────────────────
  async function countAll(table: string): Promise<number | null> {
    const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
    return error ? null : count ?? 0;
  }
  async function countSince(table: string, col: string | null, iso: string): Promise<number | null> {
    if (!col) return null;
    const { count, error } = await db.from(table).select("*", { count: "exact", head: true }).gte(col, iso);
    return error ? null : count ?? 0;
  }
  // Peek at one row to discover which timestamp column a table actually uses.
  async function timeCol(table: string): Promise<string | null> {
    const { data, error } = await db.from(table).select("*").limit(1);
    if (error || !data?.[0]) return null;
    const row = data[0] as Record<string, unknown>;
    for (const c of ["created_at", "recorded_at", "captured_at", "inserted_at", "scanned_at", "attempted_at", "taken_at"]) {
      if (c in row) return c;
    }
    return null;
  }

  // ── auth users (the real signup record — profiles has no join date) ──────
  type AuthUser = { id: string; email?: string; created_at: string; last_sign_in_at?: string | null };
  const users: AuthUser[] = [];
  try {
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) break;
      const batch = (data?.users ?? []) as unknown as AuthUser[];
      users.push(...batch);
      if (batch.length < 1000) break;
    }
  } catch { /* listUsers unavailable → user stats degrade to "—" */ }
  users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const newSince = (hours: number) =>
    users.filter((u) => new Date(u.created_at).getTime() >= now - hours * 3600_000).length;

  // ── profiles (premium state) — paginated past the 1,000-row REST cap ─────
  const profiles: any[] = [];
  {
    let from = 0;
    for (;;) {
      const { data, error } = await db.from("profiles").select("*").order("id").range(from, from + 999);
      if (error) break;
      profiles.push(...(data ?? []));
      if (!data || data.length < 1000) break;
      from += 1000;
    }
  }
  const premiumProfiles = profiles.filter((p) => p.is_premium);
  const emailOf = new Map(users.map((u) => [u.id, u.email ?? "(no email)"]));
  const joinedOf = new Map(users.map((u) => [u.id, u.created_at]));

  // ── activity + health ────────────────────────────────────────────────────
  const snapCol = await timeCol("portfolio_snapshots");
  const scans24 = await countSince("portfolio_snapshots", snapCol, since(24));
  const scans7d = await countSince("portfolio_snapshots", snapCol, since(24 * 7));

  const stripeCol = await timeCol("stripe_events");
  const stripe7d = await countSince("stripe_events", stripeCol, since(24 * 7));
  const stripe30d = await countSince("stripe_events", stripeCol, since(24 * 30));

  const { count: pendingReviews } = await db
    .from("review_queue").select("*", { count: "exact", head: true }).eq("status", "pending");

  const petCount = await countAll("pets");
  const { count: demandCount } = await db
    .from("pets").select("*", { count: "exact", head: true }).not("demand", "is", null);

  const { data: lastVal } = await db
    .from("pet_values").select("recorded_at").order("recorded_at", { ascending: false }).limit(1);
  const lastValueAt: string | null = lastVal?.[0]?.recorded_at ?? null;
  // NOTE: pet_values only gets a row when a value actually CHANGES, so a gap
  // here means "Elvebredd's values have been quiet" OR "the scraper is down" —
  // it can't tell them apart. A day of no changes is normal; 36h+ is unusual
  // enough to be worth a look, but it's a nudge, not an error.
  const valueQuiet = lastValueAt ? Date.now() - new Date(lastValueAt).getTime() > 36 * 3600_000 : true;

  // ── 14-day signup series ────────────────────────────────────────────────
  const days: { key: string; label: string; n: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 86400_000);
    days.push({ key: dayKey(d), label: d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }), n: 0 });
  }
  const dayIdx = new Map(days.map((d, i) => [d.key, i]));
  for (const u of users) {
    const i = dayIdx.get(dayKey(new Date(u.created_at)));
    if (i != null) days[i].n++;
  }
  const maxDay = Math.max(...days.map((d) => d.n), 1);

  const totalUsers = users.length;
  const stat = (v: number | null | undefined) => (v == null ? "—" : fmt(v));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 text-[color:var(--text)]">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="petora-eyebrow">Admin</p>
          <h1 className="mt-1.5 text-3xl font-bold [font-family:var(--font-display)]">Dashboard</h1>
          <p className="mt-1 text-[13px] text-[color:var(--muted)]">
            Signed in as {who} · generated {new Date().toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/review"
            className="rounded-full px-4 py-1.5 text-[13px] font-semibold text-[#1a1030] transition hover:brightness-110 active:scale-95 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
          >
            Review queue{pendingReviews ? ` (${pendingReviews})` : ""}
          </Link>
          <Link
            href="/"
            className="rounded-full border border-[color:var(--line-2)] px-4 py-1.5 text-[13px] font-semibold transition hover:bg-[rgba(168,139,250,0.08)] active:scale-95"
          >
            Back to site
          </Link>
        </div>
      </div>

      {/* alerts — the things worth knowing before anything else */}
      {(valueQuiet || (pendingReviews ?? 0) > 0) && (
        <div className="mt-5 grid gap-2">
          {valueQuiet && (
            <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: "rgba(245,200,120,0.10)", border: "1px solid rgba(245,200,120,0.35)", color: "#F5C878" }}>
              <span className="font-semibold">No value changes in {ago(lastValueAt).replace(" ago", "")}</span> — the scraper only
              writes a row when a value actually moves, so this is usually just a quiet market. If it keeps
              climbing, check the tracker repo&apos;s Actions tab for a failed run.
            </div>
          )}
          {(pendingReviews ?? 0) > 0 && (
            <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: "rgba(245,200,120,0.10)", border: "1px solid rgba(245,200,120,0.35)", color: "#F5C878" }}>
              <span className="font-semibold">{pendingReviews} scan{pendingReviews === 1 ? "" : "s"} waiting for review</span> — users flagged pets the scanner got wrong.
            </div>
          )}
        </div>
      )}

      {/* headline stats */}
      <section className="mt-6 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
        <StatCard label="Total accounts" value={stat(totalUsers)} sub={`${stat(newSince(24))} new today`} />
        <StatCard label="New this week" value={stat(newSince(24 * 7))} sub={`${stat(newSince(24 * 30))} in 30 days`} />
        <StatCard label="Premium members" value={stat(premiumProfiles.length)} sub={`${pct(premiumProfiles.length, totalUsers)} of accounts`} accent />
        <StatCard label="Scans (24h)" value={stat(scans24)} sub={`${stat(scans7d)} this week`} />
        <StatCard label="Stripe events (7d)" value={stat(stripe7d)} sub={`${stat(stripe30d)} in 30 days`} />
        <StatCard label="Pending reviews" value={stat(pendingReviews)} sub="scanner disputes" />
        <StatCard label="Catalog items" value={stat(petCount)} sub={`${stat(demandCount)} with demand`} />
        <StatCard label="Last value change" value={ago(lastValueAt)} sub={valueQuiet ? "quiet — worth a check" : "market moving normally"} />
      </section>

      {/* signups, last 14 days */}
      <section className="petora-card mt-6 p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-base font-bold [font-family:var(--font-display)]">New accounts · last 14 days</h2>
          <span className="text-[13px] text-[color:var(--muted)]">
            {fmt(days.reduce((a, d) => a + d.n, 0))} total
          </span>
        </div>
        <div className="flex h-[140px] items-end gap-1.5">
          {days.map((d) => (
            <div key={d.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`${d.label}: ${d.n} signup${d.n === 1 ? "" : "s"}`}>
              <span className="text-[10px] font-bold tabular-nums text-[color:var(--lilac)]">{d.n || ""}</span>
              <div
                className="w-full rounded-t-md transition-all"
                style={{
                  height: `${Math.max(d.n > 0 ? 6 : 2, (d.n / maxDay) * 100)}%`,
                  background: d.n > 0 ? "var(--ramp)" : "rgba(168,139,250,0.12)",
                  minHeight: 3,
                }}
                aria-hidden="true"
              />
              <span className="truncate text-[9px] text-[color:var(--muted)]">{d.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* recent signups + premium members */}
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* recent signups */}
        <div className="petora-card overflow-hidden">
          <div className="border-b border-[color:var(--line)] px-5 py-3">
            <h2 className="text-base font-bold [font-family:var(--font-display)]">Newest accounts</h2>
          </div>
          {users.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-[color:var(--muted)]">No accounts found (or the auth admin API is unavailable).</p>
          ) : (
            <ul className="divide-y divide-[color:var(--line)]">
              {users.slice(0, 10).map((u) => {
                const prof = profiles.find((p) => p.id === u.id);
                return (
                  <li key={u.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium">{u.email ?? "(no email)"}</p>
                      <p className="text-[11.5px] text-[color:var(--muted)]">
                        joined {ago(u.created_at)}
                        {u.last_sign_in_at ? ` · last seen ${ago(u.last_sign_in_at)}` : " · never signed in"}
                      </p>
                    </div>
                    {prof?.is_premium && (
                      <span className="flex-none rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1a1030] [background-image:var(--ramp-h)]">
                        Premium
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* premium members */}
        <div className="petora-card overflow-hidden">
          <div className="flex items-baseline justify-between border-b border-[color:var(--line)] px-5 py-3">
            <h2 className="text-base font-bold [font-family:var(--font-display)]">Premium members</h2>
            <span className="text-[13px] text-[color:var(--muted)]">{fmt(premiumProfiles.length)}</span>
          </div>
          {premiumProfiles.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-[color:var(--muted)]">No premium members yet — the first one is coming.</p>
          ) : (
            <ul className="divide-y divide-[color:var(--line)]">
              {premiumProfiles
                .slice()
                .sort((a, b) => new Date(joinedOf.get(b.id) ?? 0).getTime() - new Date(joinedOf.get(a.id) ?? 0).getTime())
                .slice(0, 10)
                .map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium">{emailOf.get(p.id) ?? p.id}</p>
                      <p className="truncate text-[11.5px] text-[color:var(--muted)]">
                        {p.roblox_username ? `${p.roblox_username} · ` : ""}
                        {p.stripe_customer_id ? "Stripe customer" : "no Stripe id (manual?)"}
                        {joinedOf.get(p.id) ? ` · joined ${ago(joinedOf.get(p.id))}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
            </ul>
          )}
          <p className="border-t border-[color:var(--line)] px-5 py-2.5 text-[11.5px] text-[color:var(--muted)]">
            Purchase dates and revenue live in the Stripe dashboard — Petora only stores whether a user is premium.
          </p>
        </div>
      </section>

      <p className="mt-8 text-center text-[12px] text-[color:var(--muted)]">
        Any stat showing &ldquo;&mdash;&rdquo; means that table or column couldn&apos;t be read — the page degrades instead of failing.
      </p>
    </main>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div
      className="petora-card p-4"
      style={accent ? { borderColor: "var(--line-2)", background: "rgba(168,85,247,0.07)" } : undefined}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums [font-family:var(--font-data)] ${accent ? "text-[color:var(--lilac)]" : ""}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11.5px] text-[color:var(--muted)]">{sub}</p>}
    </div>
  );
}