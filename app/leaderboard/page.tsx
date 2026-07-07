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

function Sparkle({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2 13.8 10.2 22 12 13.8 13.8 12 22 10.2 13.8 2 12 10.2 10.2Z" />
    </svg>
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

// Shimmering placeholder bar for loading states.
function Skel({ className = "" }: { className?: string }) {
  return <div className={`ptrb-skel rounded-md ${className}`} aria-hidden="true" />;
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

  // modal open: lock body scroll + close on Escape
  useEffect(() => {
    if (!openUser) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenUser(null); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [openUser]);

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

  const hasPodium = rows.length >= 3;
  const podium = hasPodium ? [rows[1], rows[0], rows[2]] : []; // display order: 2nd, 1st, 3rd
  const listRows = hasPodium ? rows.slice(3) : rows;

  function PodiumCard({ r, place }: { r: Row; place: 1 | 2 | 3 }) {
    const first = place === 1;
    const isMe = userId != null && r.user_id === userId;
    return (
      <button
        onClick={() => openRow(r)}
        className={`ptrb-reveal ptrb-lift petora-card relative flex w-full flex-col items-center px-2 pb-4 text-center ${
          first ? "pt-6" : "pt-4"
        }`}
        style={{
          animationDelay: first ? "80ms" : place === 2 ? "160ms" : "240ms",
          borderColor: first ? "var(--line-2)" : undefined,
          boxShadow: first ? "0 20px 50px -24px rgba(124,58,237,0.65)" : undefined,
        }}
        aria-label={`Rank ${r.rank}: ${r.username}, ${fmt(r.total_value)}`}
      >
        {first && (
          <Sparkle className="ptrb-twinkle absolute -top-2.5 left-1/2 h-5 w-5 -translate-x-1/2 text-[color:var(--lilac)]" />
        )}
        <span
          className={`relative flex-none rounded-full [background-image:linear-gradient(135deg,#3a2b66,#6d52c4)] ${
            first ? "h-14 w-14 ring-2 ring-[color:var(--violet)] ring-offset-2 ring-offset-[color:var(--surface)]" : "h-11 w-11"
          }`}
        />
        <span
          className={`-mt-2.5 grid place-items-center rounded-full text-[12px] font-bold text-[#1a1030] shadow-[0_0_14px_rgba(168,85,247,0.55)] [background-image:var(--ramp)] [font-family:var(--font-data)] ${
            first ? "h-6 w-6" : "h-5 w-5"
          }`}
        >
          {r.rank}
        </span>
        <span className="mt-2 flex max-w-full items-center gap-1 px-1">
          <span className={`truncate font-semibold text-[color:var(--text)] ${first ? "text-[15px]" : "text-[13.5px]"}`}>
            {r.username}
          </span>
          {r.is_premium && <PremiumBadge />}
        </span>
        {isMe && (
          <span className="mt-1 rounded-full bg-[rgba(168,85,247,0.16)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--lilac)]">
            You
          </span>
        )}
        <span className={`mt-1 font-bold text-[color:var(--lilac)] tabular-nums [font-family:var(--font-data)] ${first ? "text-[17px]" : "text-[14px]"}`}>
          {fmt(r.total_value)}
        </span>
      </button>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <style>{`
        @keyframes ptrbFadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ptrbFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes ptrbModalIn {
          from{opacity:0;transform:translateY(16px) scale(.96)}
          to{opacity:1;transform:translateY(0) scale(1)}
        }
        @keyframes ptrbSkelShimmer { from{background-position:200% 0} to{background-position:-200% 0} }
        @keyframes ptrbTwinkle { 0%,100%{opacity:.25;transform:translateX(-50%) scale(.75)} 50%{opacity:1;transform:translateX(-50%) scale(1)} }
        .ptrb-reveal { opacity:0; animation: ptrbFadeUp .45s cubic-bezier(.22,1,.36,1) forwards; }
        .ptrb-fade { animation: ptrbFadeIn .25s ease-out; }
        .ptrb-backdrop { animation: ptrbFadeIn .2s ease-out both; }
        .ptrb-modal { animation: ptrbModalIn .28s cubic-bezier(.22,1,.36,1) both; }
        .ptrb-skel {
          background: linear-gradient(90deg,
            rgba(168,139,250,0.07) 25%,
            rgba(168,139,250,0.16) 50%,
            rgba(168,139,250,0.07) 75%);
          background-size:200% 100%;
          animation: ptrbSkelShimmer 1.4s linear infinite;
        }
        .ptrb-twinkle { animation: ptrbTwinkle 2.8s ease-in-out infinite; }
        .ptrb-lift { transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
        .ptrb-lift:hover { transform: translateY(-3px); box-shadow: 0 14px 34px -16px rgba(168,85,247,0.55); border-color: var(--line-2); }
        .ptrb-row { transition: background .15s ease, padding-left .15s ease; }
        .ptrb-row:hover { padding-left: 1.25rem; }
        @media (prefers-reduced-motion: reduce) {
          .ptrb-reveal,.ptrb-fade,.ptrb-backdrop,.ptrb-modal,.ptrb-twinkle {
            animation:none!important; opacity:1!important; transform:none!important;
          }
          .ptrb-twinkle { transform:translateX(-50%)!important; }
          .ptrb-skel { animation:none!important; }
          .ptrb-lift,.ptrb-lift:hover { transition:none!important; transform:none!important; }
          .ptrb-row,.ptrb-row:hover { transition:none!important; padding-left:1rem!important; }
        }
      `}</style>

      {/* premium-badge gradient, defined once */}
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <linearGradient id="ptr-prem" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E9D5FF" />
            <stop offset="100%" stopColor="#A855F7" />
          </linearGradient>
        </defs>
      </svg>

      <div className="ptrb-reveal">
        <p className="petora-eyebrow">Verified rankings</p>
        <h1 className="mt-1.5 text-3xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">
          Leaderboard
        </h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          Top traders by total value, across verified accounts. Tap a row to see their pets.
        </p>
      </div>

      {userId && !verified && (
        <div className="ptrb-reveal mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[rgba(245,200,120,0.28)] bg-[rgba(245,200,120,0.08)] px-4 py-3 text-sm text-[#F3D08A]" style={{ animationDelay: "60ms" }}>
          <span>Verify your Roblox account before you can submit to the leaderboard.</span>
          <Link href="/settings" className="font-semibold text-[color:var(--lilac)] underline-offset-2 hover:underline">
            Verify now →
          </Link>
        </div>
      )}

      {userId && (
        <div className="ptrb-reveal mb-7 mt-5 flex items-center justify-between gap-4" style={{ animationDelay: "100ms" }}>
          <span className="text-sm text-[color:var(--text)]">Show my portfolio on the leaderboard</span>
          <button
            type="button"
            role="switch"
            aria-checked={isPublic}
            aria-label="Show my portfolio on the leaderboard"
            onClick={togglePublic}
            className={`relative h-7 w-[52px] shrink-0 rounded-full transition-all duration-200 ${
              isPublic
                ? "[background-image:var(--ramp-h)] shadow-[0_0_14px_rgba(168,85,247,0.45)]"
                : "border border-[color:var(--line-2)] bg-[color:var(--surface-2)]"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
                isPublic ? "left-[26px]" : "left-1"
              }`}
            />
          </button>
        </div>
      )}

      {loading ? (
        <>
          {/* podium skeleton */}
          <div className="mb-5 grid grid-cols-3 items-end gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`petora-card flex flex-col items-center px-2 pb-4 ${i === 1 ? "pt-6" : "pt-4"}`}>
                <Skel className={`rounded-full ${i === 1 ? "h-14 w-14" : "h-11 w-11"}`} />
                <Skel className="mt-3 h-3.5 w-16" />
                <Skel className="mt-2 h-4 w-12" />
              </div>
            ))}
          </div>
          {/* row skeletons */}
          <div className="petora-card overflow-hidden">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="grid grid-cols-[44px_1fr_auto] items-center gap-3 px-4 py-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[color:var(--line)]">
                <Skel className="h-5 w-8 justify-self-center" />
                <div className="flex items-center gap-3">
                  <Skel className="h-7 w-7 flex-none rounded-full" />
                  <div>
                    <Skel className="h-4 w-28" />
                    <Skel className="mt-1.5 h-3 w-20" />
                  </div>
                </div>
                <Skel className="h-4 w-16" />
              </div>
            ))}
          </div>
        </>
      ) : rows.length === 0 ? (
        <div className="petora-card ptrb-reveal p-10 text-center" style={{ borderStyle: "dashed" }}>
          <div className="mb-2 text-2xl" aria-hidden="true">🏆</div>
          <p className="font-semibold text-[color:var(--text)] [font-family:var(--font-display)]">The board is empty</p>
          <p className="mx-auto mt-1 max-w-xs text-[13px] text-[color:var(--muted)]">
            No one is on the leaderboard yet — verify, opt in above, and scan to be the first name on it.
          </p>
        </div>
      ) : (
        <>
          {/* top-3 podium */}
          {hasPodium && (
            <div className="mb-5 grid grid-cols-3 items-end gap-3">
              <PodiumCard r={podium[0]} place={2} />
              <PodiumCard r={podium[1]} place={1} />
              <PodiumCard r={podium[2]} place={3} />
            </div>
          )}

          {/* the rest of the board */}
          {listRows.length > 0 && (
            <div className="petora-card overflow-hidden">
              {listRows.map((r, i) => {
                const isMe = userId != null && r.user_id === userId;
                return (
                  <button
                    key={`${r.rank}-${r.username}`}
                    onClick={() => openRow(r)}
                    className={`ptrb-reveal ptrb-row grid w-full cursor-pointer grid-cols-[44px_1fr_auto] items-center gap-3 px-4 py-3 text-left hover:bg-[rgba(168,139,250,0.06)] [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[color:var(--line)] ${
                      isMe ? "bg-[rgba(168,85,247,0.08)]" : ""
                    }`}
                    style={{ animationDelay: `${300 + Math.min(i, 14) * 40}ms` }}
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
                          {isMe && (
                            <span className="flex-none rounded-full bg-[rgba(168,85,247,0.16)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--lilac)]">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-[11.5px] text-[color:var(--muted)]">Verified owner</div>
                      </div>
                    </div>

                    <div className="text-right font-bold text-[color:var(--lilac)] tabular-nums [font-family:var(--font-data)]">
                      {r.total_value.toLocaleString()}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* user pets modal */}
      {openUser && (
        <div
          onClick={() => setOpenUser(null)}
          className="ptrb-backdrop fixed inset-0 z-50 flex items-center justify-center p-5"
          style={{ background: "rgba(5,3,12,0.72)", backdropFilter: "blur(4px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`${openUser.username}'s submitted pets`}
            className="petora-card ptrb-modal flex max-h-[85vh] w-full max-w-2xl flex-col p-6"
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
                className="flex-none rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)] active:scale-90"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="min-h-[120px] overflow-y-auto">
              {petsLoading ? (
                <div>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 py-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[color:var(--line)]">
                      <Skel className="h-10 w-10 flex-none rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <Skel className="h-4 w-32 max-w-[55%]" />
                        <Skel className="mt-2 h-3 w-20 max-w-[35%]" />
                      </div>
                      <Skel className="h-4 w-14" />
                    </div>
                  ))}
                </div>
              ) : !pets || pets.length === 0 ? (
                <p className="text-[color:var(--muted)]">This trader hasn&apos;t submitted any pets to the leaderboard yet.</p>
              ) : (
                <ul className="divide-y divide-[color:var(--line)]">
                  {pets.map((it, i) => (
                    <li key={it.pet_variant_id} className="ptrb-reveal flex items-center gap-3 py-3" style={{ animationDelay: `${Math.min(i, 14) * 35}ms` }}>
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