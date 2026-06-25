"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Row = {
  rank: number;
  user_id: string;
  username: string;
  total_value: number;
  is_premium: boolean;
};

type SubPet = {
  pet_variant_id: number;
  pet_id: number;
  name: string;
  icon_url: string | null;
  neon: string;
  fly: boolean;
  ride: boolean;
  quantity: number;
  unit_value: number | null;
  subtotal: number | null;
};

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function PremiumBadge() {
  return (
    <span title="Premium member" aria-label="Premium member" className="inline-flex flex-none items-center">
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path d="M3 7l4.5 3L12 4l4.5 6L21 7l-1.8 10.2a1 1 0 0 1-1 .8H5.8a1 1 0 0 1-1-.8L3 7z" fill="url(#ptr-prem)" />
      </svg>
    </span>
  );
}

function Chips({ neon, fly, ride }: { neon: string; fly: boolean; ride: boolean }) {
  const chips: { label: string; cls: string }[] = [];
  if (neon === "mega") chips.push({ label: "Mega", cls: "bg-[rgba(168,85,247,0.16)] text-[#D8B4FE]" });
  else if (neon === "neon") chips.push({ label: "Neon", cls: "bg-[rgba(93,230,168,0.14)] text-[#5DE6A8]" });
  if (fly) chips.push({ label: "Fly", cls: "bg-[rgba(56,189,248,0.14)] text-[#7DD3FC]" });
  if (ride) chips.push({ label: "Ride", cls: "bg-[rgba(244,114,182,0.14)] text-[#F9A8D4]" });
  if (chips.length === 0) return null;
  return (
    <span className="flex gap-1">
      {chips.map((c) => (
        <span key={c.label} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${c.cls}`}>{c.label}</span>
      ))}
    </span>
  );
}

export default function Leaderboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [verified, setVerified] = useState(false);

  // user-pets modal
  const [openUser, setOpenUser] = useState<Row | null>(null);
  const [pets, setPets] = useState<SubPet[] | null>(null);
  const [petsLoading, setPetsLoading] = useState(false);

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
      rank: Number(r.rank),
      user_id: r.user_id,
      username: r.username,
      total_value: Number(r.total_value),
      is_premium: !!r.is_premium,
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

  async function openRow(r: Row) {
    setOpenUser(r);
    setPets(null);
    setPetsLoading(true);
    const { data, error } = await supabase.rpc("get_submission_pets", { p_user_id: r.user_id });
    if (error) console.error(error);
    setPets((data ?? []).map((p: any) => ({
      pet_variant_id: Number(p.pet_variant_id),
      pet_id: Number(p.pet_id),
      name: p.name,
      icon_url: p.icon_url,
      neon: p.neon,
      fly: !!p.fly,
      ride: !!p.ride,
      quantity: Number(p.quantity),
      unit_value: p.unit_value == null ? null : Number(p.unit_value),
      subtotal: p.subtotal == null ? null : Number(p.subtotal),
    })));
    setPetsLoading(false);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      {/* premium-badge gradient, defined once */}
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <linearGradient id="ptr-prem" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E9D5FF" />
            <stop offset="100%" stopColor="#A855F7" />
          </linearGradient>
        </defs>
      </svg>

      <p className="petora-eyebrow">Verified rankings</p>
      <h1 className="mt-1.5 text-3xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">
        Leaderboard
      </h1>
      <p className="mt-2 text-sm text-[color:var(--muted)]">
        Top traders by total value, across verified accounts. Tap a row to see their pets.
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
            <button
              key={`${r.rank}-${r.username}`}
              onClick={() => openRow(r)}
              className="grid w-full cursor-pointer grid-cols-[44px_1fr_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-[rgba(168,139,250,0.06)] [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[color:var(--line)]"
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
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14.5px] font-semibold text-[color:var(--text)]">{r.username}</span>
                    {r.is_premium && <PremiumBadge />}
                  </div>
                  <div className="text-[11.5px] text-[color:var(--muted)]">Verified owner</div>
                </div>
              </div>

              <div className="text-right font-bold text-[color:var(--lilac)] [font-family:var(--font-data)]">
                {r.total_value.toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* user pets modal */}
      {openUser && (
        <div
          onClick={() => setOpenUser(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-5"
          style={{ background: "rgba(5,3,12,0.72)", backdropFilter: "blur(4px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="petora-card flex max-h-[85vh] w-full max-w-2xl flex-col p-6"
            style={{ borderColor: "var(--line-2)", boxShadow: "0 30px 80px -30px rgba(124,58,237,0.6)" }}
          >
            <div className="mb-4 flex items-center gap-3">
              <span className="h-10 w-10 flex-none rounded-full [background-image:linear-gradient(135deg,#3a2b66,#6d52c4)]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h2 className="m-0 truncate text-xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">{openUser.username}</h2>
                  {openUser.is_premium && <PremiumBadge />}
                </div>
                <div className="text-xs text-[color:var(--muted)]">
                  Rank #{openUser.rank} · {fmt(openUser.total_value)} submitted
                </div>
              </div>
              <button
                onClick={() => setOpenUser(null)}
                className="flex-none rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)]"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="min-h-[120px] overflow-y-auto">
              {petsLoading ? (
                <p className="text-[color:var(--muted)]">Loading pets…</p>
              ) : !pets || pets.length === 0 ? (
                <p className="text-[color:var(--muted)]">This trader hasn&apos;t submitted any pets to the leaderboard yet.</p>
              ) : (
                <ul className="divide-y divide-[color:var(--line)]">
                  {pets.map((it) => (
                    <li key={it.pet_variant_id} className="flex items-center gap-3 py-3">
                      {it.icon_url && <img src={it.icon_url} alt={it.name} className="h-10 w-10 flex-none object-contain" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-[color:var(--text)]">{it.name}</span>
                          {it.quantity > 1 && (
                            <span className="rounded bg-[rgba(168,139,250,0.12)] px-1.5 py-0.5 text-[11px] font-medium text-[color:var(--lilac)]">×{it.quantity}</span>
                          )}
                          <Chips neon={it.neon} fly={it.fly} ride={it.ride} />
                        </div>
                      </div>
                      <div className="text-right tabular-nums [font-family:var(--font-data)]">
                        <div className="font-medium text-[color:var(--lilac)]">{it.subtotal == null ? "—" : fmt(it.subtotal)}</div>
                        {it.quantity > 1 && it.unit_value != null && (
                          <div className="text-xs text-[color:var(--muted)]">{fmt(it.unit_value)} each</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="mt-4 flex-none text-[11px] text-[color:var(--muted)]">
              Pet values shown are current market values.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}