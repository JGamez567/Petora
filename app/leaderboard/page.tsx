"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Row = { rank: number; username: string; total_value: number };

export default function Leaderboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!userId) return;
    supabase.from("profiles").select("is_public, roblox_verified_at").eq("id", userId).single()
      .then(({ data }) => {
        setIsPublic(data?.is_public ?? false);
        setVerified(!!data?.roblox_verified_at);
      });
  }, [userId]);

  async function loadBoard() {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_leaderboard", { limit_count: 100 });
    if (error) console.error(error);
    setRows((data ?? []).map((r: any) => ({
      rank: Number(r.rank), username: r.username, total_value: Number(r.total_value),
    })));
    setLoading(false);
  }

  useEffect(() => { loadBoard(); }, []);

  async function togglePublic() {
    if (!userId) return;
    const next = !isPublic;
    setIsPublic(next);
    await supabase.from("profiles").update({ is_public: next }).eq("id", userId);
    loadBoard();
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="petora-eyebrow">Verified rankings</p>
      <h1 className="mt-1.5 text-3xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">
        Leaderboard
      </h1>
      <p className="mt-2 text-sm text-[color:var(--muted)]">
        Top traders by total value, across verified accounts.
      </p>

      {userId && !verified && (
        <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[rgba(245,200,120,0.28)] bg-[rgba(245,200,120,0.08)] px-4 py-3 text-sm text-[#F3D08A]">
          <span>Verify your Roblox account before you can submit to the leaderboard.</span>
          <Link href="/settings" className="font-semibold text-[color:var(--lilac)] underline-offset-2 hover:underline">
            Verify now →
          </Link>
        </div>
      )}

      {userId && (
        <label className="mb-7 mt-5 flex cursor-pointer items-center gap-2.5 text-sm text-[color:var(--text)]">
          <input type="checkbox" checked={isPublic} onChange={togglePublic} className="h-4 w-4 accent-[#8B5CF6]" />
          Show my portfolio on the leaderboard
        </label>
      )}

      {loading ? (
        <p className="text-[color:var(--muted)]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-[color:var(--muted)]">No one on the leaderboard yet — opt in above to be the first.</p>
      ) : (
        <div className="petora-card overflow-hidden">
          {rows.map((r) => (
            <div
              key={`${r.rank}-${r.username}`}
              className="grid grid-cols-[44px_1fr_auto] items-center gap-3 px-4 py-3 transition hover:bg-[rgba(168,139,250,0.06)] [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[color:var(--line)]"
            >
              {r.rank <= 3 ? (
                <span className="grid place-items-center rounded-[9px] py-1 text-sm font-bold text-[#1a1030] shadow-[0_0_16px_rgba(168,85,247,0.5)] [background-image:var(--ramp)] [font-family:var(--font-data)]">
                  {r.rank}
                </span>
              ) : (
                <span className="text-center text-sm font-bold text-[color:var(--muted)] [font-family:var(--font-data)]">
                  #{r.rank}
                </span>
              )}

              <div className="flex min-w-0 items-center gap-3">
                <span className="h-7 w-7 flex-none rounded-full [background-image:linear-gradient(135deg,#3a2b66,#6d52c4)]" />
                <div className="min-w-0">
                  <div className="truncate text-[14.5px] font-semibold text-[color:var(--text)]">{r.username}</div>
                  <div className="text-[11.5px] text-[color:var(--muted)]">Verified owner</div>
                </div>
              </div>

              <div className="text-right font-bold text-[color:var(--lilac)] [font-family:var(--font-data)]">
                {r.total_value.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}