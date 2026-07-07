"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type Pet = { id: number; name: string; rarity: string | null; icon_url: string | null; value: number | null };
type Mover = { pet_id: number; name: string; icon_url: string | null; current_value: number; change: number };

const TIERS = [
  { key: "normal", label: "Normal" },
  { key: "neon",   label: "Neon" },
  { key: "mega",   label: "Mega" },
] as const;

const POTIONS = [
  { key: "none",    label: "No Potions", fly: false, ride: false },
  { key: "fly",     label: "Fly",        fly: true,  ride: false },
  { key: "ride",    label: "Ride",       fly: false, ride: true  },
  { key: "flyride", label: "Fly & Ride", fly: true,  ride: true  },
] as const;

const DEFAULT_TIER = "normal";
const DEFAULT_POTION = POTIONS[3]; // Normal Fly & Ride

const RANGES = [
  { key: "day",   label: "Day",   days: 1 },
  { key: "week",  label: "Week",  days: 7 },
  { key: "month", label: "Month", days: 30 },
] as const;

const RARITIES = [
  { key: "legendary", label: "Legendary",  dot: "#0A0A0F", ring: "#6B7280", color: "#C9CDD6" },
  { key: "ultrarare", label: "Ultra Rare", dot: "#F87171", ring: "#F87171", color: "#F87171" },
  { key: "rare",      label: "Rare",       dot: "#4ADE80", ring: "#4ADE80", color: "#4ADE80" },
  { key: "uncommon",  label: "Uncommon",   dot: "#C084FC", ring: "#C084FC", color: "#C084FC" },
  { key: "common",    label: "Common",     dot: "#60A5FA", ring: "#60A5FA", color: "#60A5FA" },
] as const;

const normRarity = (r: string | null) => (r ?? "").toLowerCase().replace(/[^a-z]/g, "");
const rarityMeta = (r: string | null) => RARITIES.find((x) => x.key === normRarity(r)) ?? null;

// Free users get 3 unique-pet graphs per day (client-side; works logged-out too).
const FREE_GRAPHS_PER_DAY = 3;
const FREE_KEY = "petora_free_graphs";
const today = () => new Date().toISOString().slice(0, 10);

function loadFreeGraphs(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(FREE_KEY) || "null");
    if (raw && raw.date === today() && Array.isArray(raw.ids)) return raw.ids;
  } catch {}
  return [];
}
function saveFreeGraphs(ids: number[]) {
  try { localStorage.setItem(FREE_KEY, JSON.stringify({ date: today(), ids })); } catch {}
}

const fmt = (n: number) => n.toLocaleString();

// Shimmering placeholder bar for loading states.
function Skel({ className = "" }: { className?: string }) {
  return <div className={`ptrm-skel rounded-md ${className}`} aria-hidden="true" />;
}

// Skeleton stand-in for one pet card while the catalog loads.
function SkelCard({ delay }: { delay: number }) {
  return (
    <div className="petora-card ptrm-reveal p-4 text-center" style={{ animationDelay: `${delay}ms` }}>
      <Skel className="mx-auto h-[72px] w-[72px] rounded-xl" />
      <Skel className="mx-auto mt-3 h-4 w-20" />
      <Skel className="mx-auto mt-2 h-3 w-14" />
      <Skel className="mx-auto mt-2 h-4 w-16" />
    </div>
  );
}

export default function Catalog() {
  const [premium, setPremium] = useState(false);
  const [premiumChecked, setPremiumChecked] = useState(false);

  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [rarityFilter, setRarityFilter] = useState<string | null>(null);

  const [tab, setTab] = useState<"all" | "rising" | "falling">("all");
  const [movers, setMovers] = useState<Mover[]>([]);

  const [selected, setSelected] = useState<Pet | null>(null);
  const [tier, setTier] = useState<string>(DEFAULT_TIER);
  const [potion, setPotion] = useState<(typeof POTIONS)[number]>(DEFAULT_POTION);
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[2]);
  const [history, setHistory] = useState<{ ts: number; value: number }[]>([]);
  const [graphLoading, setGraphLoading] = useState(false);

  const [freeGraphIds, setFreeGraphIds] = useState<number[]>([]);
  const [graphAllowed, setGraphAllowed] = useState(true);

  const remainingFree = Math.max(0, FREE_GRAPHS_PER_DAY - freeGraphIds.length);

  useEffect(() => { setFreeGraphIds(loadFreeGraphs()); }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: prof } = await supabase
          .from("profiles").select("is_premium").eq("id", data.user.id).single();
        setPremium(prof?.is_premium ?? false);
      }
      setPremiumChecked(true);
    });
  }, []);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("pets")
        .select(`id, name, rarity, icon_url,
          pet_variants!inner ( neon, fly, ride, current_pet_values ( value ) )`)
        .eq("pet_variants.neon", "normal")
        .eq("pet_variants.fly", true)
        .eq("pet_variants.ride", true)
        .order("name");
      if (error) { console.error(error); setLoading(false); return; }
      setPets((data ?? []).map((p: any) => ({
        id: p.id, name: p.name, rarity: p.rarity, icon_url: p.icon_url,
        value: p.pet_variants?.[0]?.current_pet_values?.[0]?.value ?? null,
      })));
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    supabase.rpc("get_movers", { window_hours: 168 }).then(({ data, error }) => {
      if (error) { console.error(error); return; }
      setMovers((data ?? []).map((r: any) => ({
        pet_id: r.pet_id, name: r.name, icon_url: r.icon_url,
        current_value: Number(r.current_value), change: Number(r.change),
      })));
    });
  }, []);

  useEffect(() => {
    if (!selected || !graphAllowed) return;
    const pet = selected;
    async function loadHistory() {
      setGraphLoading(true);
      const { data: vRows } = await supabase
        .from("pet_variants").select("id")
        .eq("pet_id", pet.id).eq("neon", tier)
        .eq("fly", potion.fly).eq("ride", potion.ride).limit(1);
      const variantId = vRows?.[0]?.id;
      if (!variantId) { setHistory([]); setGraphLoading(false); return; }
      const cutoff = new Date(Date.now() - range.days * 86400000).toISOString();
      const { data: vals } = await supabase
        .from("pet_values").select("value, recorded_at")
        .eq("pet_variant_id", variantId)
        .gte("recorded_at", cutoff)
        .order("recorded_at", { ascending: true });
      setHistory((vals ?? []).map((r: any) => ({
        ts: new Date(r.recorded_at).getTime(), value: Number(r.value),
      })));
      setGraphLoading(false);
    }
    loadHistory();
  }, [selected, tier, potion, range, graphAllowed]);

  // modal open: lock body scroll + close on Escape
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [selected]);

  const filtered = pets
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => !rarityFilter || normRarity(p.rarity) === rarityFilter)
    .sort((a, b) => {
      if (a.value == null && b.value == null) return 0;
      if (a.value == null) return 1;
      if (b.value == null) return -1;
      return sortDir === "desc" ? b.value - a.value : a.value - b.value;
    });

  const rising = movers.filter((m) => m.change > 0).sort((a, b) => b.change - a.change);
  const falling = movers.filter((m) => m.change < 0).sort((a, b) => a.change - b.change);

  function resolveGraphAccess(petId: number) {
    if (!premiumChecked) { setGraphAllowed(true); return; }
    if (premium) { setGraphAllowed(true); return; }
    const ids = loadFreeGraphs();
    if (ids.includes(petId)) { setGraphAllowed(true); return; }
    if (ids.length < FREE_GRAPHS_PER_DAY) {
      const next = [...ids, petId];
      saveFreeGraphs(next);
      setFreeGraphIds(next);
      setGraphAllowed(true);
    } else {
      setFreeGraphIds(ids);
      setGraphAllowed(false);
    }
  }

  function openPet(pet: Pet) {
    setSelected(pet);
    setTier(DEFAULT_TIER);
    setPotion(DEFAULT_POTION);
    setRange(RANGES[2]);
    setHistory([]);
    resolveGraphAccess(pet.id);
  }

  function openMover(m: Mover) {
    openPet({ id: m.pet_id, name: m.name, rarity: null, icon_url: m.icon_url, value: m.current_value });
  }

  const tabBtn = (key: typeof tab, label: string, locked: boolean) => (
    <button
      onClick={() => setTab(key)}
      className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-200 active:scale-95 ${
        tab === key
          ? "bg-[color:var(--surface-2)] text-[color:var(--text)] shadow-[0_2px_10px_-4px_rgba(168,85,247,0.5)]"
          : "text-[color:var(--muted)] hover:text-[color:var(--text)]"
      }`}
    >
      {label}
      {locked && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      )}
    </button>
  );

  function MoverList({ list, up }: { list: Mover[]; up: boolean }) {
    if (list.length === 0) {
      return (
        <div className="petora-card ptrm-reveal p-8 text-center text-[color:var(--muted)]">
          No {up ? "rising" : "falling"} pets in the last 7 days yet — this fills in as more history is collected.
        </div>
      );
    }
    const maxAbs = Math.max(...list.map((m) => Math.abs(m.change)), 1);
    const accent = up ? "var(--up)" : "var(--down)";
    return (
      <div>
        <div className="ptrm-reveal mb-4 flex items-center gap-3">
          <span
            className="grid h-9 w-9 flex-none place-items-center rounded-xl"
            style={{ background: up ? "rgba(93,230,168,0.12)" : "rgba(251,113,133,0.12)", border: `1px solid ${accent}` }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {up ? <path d="M5 15l7-7 7 7" /> : <path d="M5 9l7 7 7-7" />}
            </svg>
          </span>
          <div>
            <h2 className="text-lg font-bold text-[color:var(--text)] [font-family:var(--font-display)]">
              {up ? "Biggest gainers" : "Biggest drops"}
            </h2>
            <p className="text-xs text-[color:var(--muted)]">Last 7 days &middot; Normal Fly &amp; Ride &middot; tap to open</p>
          </div>
        </div>

        <div className="petora-card overflow-hidden">
          {list.map((m, i) => {
            const prev = m.current_value - m.change;
            const pct = prev > 0 ? (m.change / prev) * 100 : null;
            const barW = Math.max(6, (Math.abs(m.change) / maxAbs) * 100);
            const topMover = i === 0;
            return (
              <button
                key={m.pet_id}
                onClick={() => openMover(m)}
                className="ptrm-row grid w-full grid-cols-[28px_40px_1fr_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-[rgba(168,139,250,0.06)] active:bg-[rgba(168,139,250,0.10)] [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[color:var(--line)]"
                style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
              >
                <span
                  className="text-center text-sm font-bold [font-family:var(--font-data)]"
                  style={{ color: topMover ? accent : "var(--muted)" }}
                >
                  {i + 1}
                </span>

                <span className="relative grid h-10 w-10 place-items-center">
                  {m.icon_url && <img src={m.icon_url} alt="" className="h-10 w-10 object-contain" />}
                  {topMover && (
                    <span className="ptrm-pulse absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
                  )}
                </span>

                <div className="min-w-0">
                  <div className="truncate font-semibold text-[color:var(--text)]">{m.name}</div>
                  <div className="mt-1.5 h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-[rgba(168,139,250,0.10)]">
                    <div className="ptrm-bar h-full rounded-full" style={{ width: `${barW}%`, background: accent, animationDelay: `${100 + Math.min(i, 12) * 45}ms` }} />
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-bold text-[color:var(--lilac)] [font-family:var(--font-data)]">{fmt(m.current_value)}</div>
                  <div className="text-[13px] font-bold [font-family:var(--font-data)]" style={{ color: accent }}>
                    {up ? "\u25B2 +" : "\u25BC "}{fmt(m.change)}
                    {pct != null && <span className="ml-1 opacity-80">({up ? "+" : ""}{pct.toFixed(1)}%)</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function LockedMovers() {
    return (
      <div className="petora-card ptrm-reveal relative overflow-hidden p-10 text-center">
        <div className="pointer-events-none absolute inset-0 opacity-[0.13]" aria-hidden="true">
          <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="h-full w-full">
            <path className="ptrm-draw" d="M0,90 L60,80 L120,86 L180,60 L240,66 L300,38 L360,46 L400,20" fill="none" stroke="#A855F7" strokeWidth="3" pathLength={1} />
          </svg>
        </div>
        <span className="ptrm-float relative mx-auto grid h-12 w-12 place-items-center rounded-xl text-[color:var(--lilac)]" style={{ background: "rgba(168,139,250,0.10)", border: "1px solid var(--line-2)" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </span>
        <h2 className="relative mt-5 text-xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">
          Rising &amp; Falling is a Premium feature
        </h2>
        <p className="relative mx-auto mt-2 max-w-sm text-[14.5px] leading-relaxed text-[color:var(--muted)]">
          See live gainers and losers across every pet &mdash; exactly what to trade for and what to trade away &mdash; updated continuously.
        </p>
        <Link
          href="/premium"
          className="relative mt-6 inline-block rounded-full px-7 py-3 text-[15px] font-semibold text-[#1a1030] shadow-[0_12px_34px_-12px_rgba(168,85,247,0.7)] transition hover:brightness-110 active:scale-95 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
        >
          Upgrade to Premium
        </Link>
      </div>
    );
  }

  function LockedGraph() {
    return (
      <div className="relative grid h-full place-items-center overflow-hidden rounded-xl border border-[color:var(--line)]">
        <div className="pointer-events-none absolute inset-0 opacity-20 blur-[2px]" aria-hidden="true">
          <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="h-full w-full">
            <path className="ptrm-draw" d="M0,86 L50,80 L100,84 L150,62 L200,70 L250,44 L300,52 L350,28 L400,18" fill="none" stroke="#A855F7" strokeWidth="2.5" pathLength={1} />
          </svg>
        </div>
        <div className="relative px-6 text-center">
          <span className="ptrm-float mx-auto grid h-11 w-11 place-items-center rounded-xl text-[color:var(--lilac)]" style={{ background: "rgba(168,139,250,0.10)", border: "1px solid var(--line-2)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </span>
          <p className="mt-3 font-semibold text-[color:var(--text)]">You&apos;ve used your {FREE_GRAPHS_PER_DAY} free graphs today</p>
          <p className="mx-auto mt-1 max-w-xs text-[13px] text-[color:var(--muted)]">
            Premium unlocks unlimited value history on every pet and variant.
          </p>
          <Link
            href="/premium"
            className="mt-4 inline-block rounded-full px-6 py-2.5 text-[14px] font-semibold text-[#1a1030] shadow-[0_12px_34px_-12px_rgba(168,85,247,0.7)] transition hover:brightness-110 active:scale-95 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
          >
            Upgrade for unlimited graphs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <style>{`
        @keyframes ptrmFade { from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:translateY(0)} }
        @keyframes ptrmBar { from{width:0} }
        @keyframes ptrmSkelShimmer { from{background-position:200% 0} to{background-position:-200% 0} }
        @keyframes ptrmBackdrop { from{opacity:0} to{opacity:1} }
        @keyframes ptrmModalIn {
          from{opacity:0; transform:translateY(16px) scale(0.96)}
          to{opacity:1; transform:translateY(0) scale(1)}
        }
        @keyframes ptrmFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes ptrmPulse { 0%,100%{opacity:1; transform:scale(1)} 50%{opacity:0.55; transform:scale(0.8)} }
        @keyframes ptrmDraw { from{stroke-dashoffset:1} to{stroke-dashoffset:0} }
        .ptrm-row { opacity:0; animation: ptrmFade .4s ease forwards; }
        .ptrm-reveal { opacity:0; animation: ptrmFade .45s cubic-bezier(.22,1,.36,1) forwards; }
        .ptrm-bar { animation: ptrmBar .8s cubic-bezier(.2,.7,.2,1) both; }
        .ptrm-skel {
          background: linear-gradient(90deg,
            rgba(168,139,250,0.07) 25%,
            rgba(168,139,250,0.16) 50%,
            rgba(168,139,250,0.07) 75%);
          background-size: 200% 100%;
          animation: ptrmSkelShimmer 1.4s linear infinite;
        }
        .ptrm-backdrop { animation: ptrmBackdrop .2s ease-out both; }
        .ptrm-modal { animation: ptrmModalIn .28s cubic-bezier(.22,1,.36,1) both; }
        .ptrm-float { animation: ptrmFloat 2.8s ease-in-out infinite; }
        .ptrm-pulse { animation: ptrmPulse 1.8s ease-in-out infinite; }
        .ptrm-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: ptrmDraw 1.6s ease-out .2s both; }
        .ptrm-card-hover {
          transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease, background .2s ease;
        }
        .ptrm-card-hover:hover {
          transform: translateY(-3px);
          box-shadow: 0 14px 34px -16px rgba(168,85,247,0.5);
        }
        @media (prefers-reduced-motion: reduce) {
          .ptrm-row, .ptrm-reveal, .ptrm-bar, .ptrm-backdrop, .ptrm-modal,
          .ptrm-float, .ptrm-pulse, .ptrm-draw {
            animation:none!important; opacity:1!important; transform:none!important;
            stroke-dashoffset:0!important;
          }
          .ptrm-skel { animation:none!important; }
          .ptrm-card-hover, .ptrm-card-hover:hover { transition:none!important; transform:none!important; }
        }
      `}</style>

      <div className="ptrm-reveal">
        <p className="petora-eyebrow">Live market</p>
        <h1 className="mt-1.5 text-3xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">Pet catalog</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          {loading ? "Loading pets" : `${filtered.length} pets`} &middot; tap one to see its value history
        </p>

        {premiumChecked && !premium && (
          <p className="mt-2 text-[13px] text-[color:var(--muted)]">
            Free plan: {remainingFree} of {FREE_GRAPHS_PER_DAY} pet graphs left today.{" "}
            <Link href="/premium" className="font-semibold text-[color:var(--lilac)] hover:underline">
              Go Premium for unlimited graphs + Rising / Falling &rarr;
            </Link>
          </p>
        )}
      </div>

      <div className="ptrm-reveal mt-6 mb-5 inline-flex rounded-[10px] bg-[rgba(168,139,250,0.07)] p-1" style={{ animationDelay: "60ms" }}>
        {tabBtn("all", "All pets", false)}
        {tabBtn("rising", `Rising ${rising.length && premium ? `(${rising.length})` : ""}`.trim(), !premium)}
        {tabBtn("falling", `Falling ${falling.length && premium ? `(${falling.length})` : ""}`.trim(), !premium)}
      </div>

      {tab === "all" && (
        <div key="all" className="ptrm-reveal">
          <input
            placeholder="Search pets&hellip;"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-4 w-full rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-2.5 text-[15px] text-[color:var(--text)] outline-none transition placeholder:text-[color:var(--muted)] focus:border-[color:var(--violet)] focus:shadow-[0_0_0_3px_rgba(168,85,247,0.15)]"
          />

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">Rarity</span>
            <button
              onClick={() => setRarityFilter(null)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition active:scale-95 ${
                rarityFilter === null
                  ? "border border-[color:var(--violet)] bg-[rgba(168,85,247,0.16)] text-[color:var(--lilac)]"
                  : "border border-[color:var(--line)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
              }`}
            >
              All
            </button>
            {RARITIES.map((r) => {
              const active = rarityFilter === r.key;
              return (
                <button
                  key={r.key}
                  onClick={() => setRarityFilter(active ? null : r.key)}
                  className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition active:scale-95"
                  style={active ? { borderColor: r.ring, background: `${r.color}1A`, color: r.color } : { borderColor: "var(--line)", color: "var(--muted)" }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.dot, boxShadow: `0 0 0 1px ${r.ring}` }} />
                  {r.label}
                </button>
              );
            })}
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">Sort</span>
            {([
              { key: "desc", label: "Value: High \u2192 Low" },
              { key: "asc",  label: "Value: Low \u2192 High" },
            ] as const).map((s) => (
              <button
                key={s.key}
                onClick={() => setSortDir(s.key)}
                className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition active:scale-95 ${
                  sortDir === s.key
                    ? "border border-[color:var(--violet)] bg-[rgba(168,85,247,0.16)] text-[color:var(--lilac)]"
                    : "border border-[color:var(--line)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <SkelCard key={i} delay={i * 30} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="petora-card ptrm-reveal p-10 text-center" style={{ borderStyle: "dashed" }}>
              <div className="mb-2 text-2xl" aria-hidden="true">🔭</div>
              <p className="font-semibold text-[color:var(--text)] [font-family:var(--font-display)]">No pets match</p>
              <p className="mx-auto mt-1 max-w-xs text-[13px] text-[color:var(--muted)]">
                Try a different name{rarityFilter ? ", or clear the rarity filter" : ""}.
              </p>
              {(search || rarityFilter) && (
                <button
                  onClick={() => { setSearch(""); setRarityFilter(null); }}
                  className="mt-4 rounded-lg border border-[color:var(--line-2)] px-4 py-2 text-sm font-medium text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)] active:scale-95"
                >
                  Clear search &amp; filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
              {filtered.map((pet, idx) => {
                const meta = rarityMeta(pet.rarity);
                return (
                  <div
                    key={pet.id}
                    onClick={() => openPet(pet)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPet(pet); } }}
                    className="petora-card ptrm-reveal ptrm-card-hover group cursor-pointer p-4 text-center hover:border-[color:var(--line-2)] hover:bg-[rgba(168,139,250,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--violet)]"
                    style={{ animationDelay: `${Math.min(idx, 20) * 25}ms` }}
                  >
                    {pet.icon_url && (
                      <img
                        src={pet.icon_url}
                        alt={pet.name}
                        className="mx-auto h-[72px] w-[72px] object-contain transition-transform duration-200 group-hover:scale-110"
                      />
                    )}
                    <div className="mt-2 text-sm font-semibold text-[color:var(--text)]">{pet.name}</div>
                    <div className="mt-1 flex items-center justify-center gap-1.5">
                      {meta && <span className="h-2 w-2 rounded-full" style={{ background: meta.dot, boxShadow: `0 0 0 1px ${meta.ring}` }} />}
                      <span className="text-xs capitalize text-[color:var(--muted)]">{pet.rarity}</span>
                    </div>
                    <div className="mt-1.5 font-bold text-[color:var(--lilac)] [font-family:var(--font-data)]">
                      {pet.value != null ? fmt(pet.value) : "\u2014"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "rising" && (
        <div key="rising" className="ptrm-reveal">
          {!premiumChecked ? (
            <div className="petora-card p-5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <Skel className="h-10 w-10 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <Skel className="h-4 w-28 max-w-[50%]" />
                    <Skel className="mt-2 h-2 w-40 max-w-[70%]" />
                  </div>
                  <Skel className="h-8 w-16" />
                </div>
              ))}
            </div>
          ) : premium ? <MoverList list={rising} up={true} /> : <LockedMovers />}
        </div>
      )}
      {tab === "falling" && (
        <div key="falling" className="ptrm-reveal">
          {!premiumChecked ? (
            <div className="petora-card p-5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <Skel className="h-10 w-10 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <Skel className="h-4 w-28 max-w-[50%]" />
                    <Skel className="mt-2 h-2 w-40 max-w-[70%]" />
                  </div>
                  <Skel className="h-8 w-16" />
                </div>
              ))}
            </div>
          ) : premium ? <MoverList list={falling} up={false} /> : <LockedMovers />}
        </div>
      )}

      {selected && (
        <div
          onClick={() => setSelected(null)}
          className="ptrm-backdrop fixed inset-0 z-50 flex items-center justify-center p-5"
          style={{ background: "rgba(5,3,12,0.72)", backdropFilter: "blur(4px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.name} value history`}
            className="petora-card ptrm-modal max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6"
            style={{ borderColor: "var(--line-2)", boxShadow: "0 30px 80px -30px rgba(124,58,237,0.6)" }}
          >
            <div className="mb-4 flex items-center gap-3">
              {selected.icon_url && <img src={selected.icon_url} alt={selected.name} className="h-12 w-12 object-contain" />}
              <div className="min-w-0 flex-1">
                <h2 className="m-0 truncate text-xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">{selected.name}</h2>
                {premiumChecked && !premium && (
                  <p className="text-xs text-[color:var(--muted)]">
                    {graphAllowed ? `Free graph \u00B7 ${remainingFree} left today` : "Free graph limit reached today"}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="flex-none rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)] active:scale-90"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">Type</div>
            <div className="mb-3 flex flex-wrap gap-2">
              {TIERS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTier(t.key)}
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition active:scale-95 ${
                    tier === t.key
                      ? "border border-[color:var(--violet)] bg-[rgba(168,85,247,0.16)] text-[color:var(--lilac)]"
                      : "border border-[color:var(--line)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">Potions</div>
            <div className="mb-4 flex flex-wrap gap-2">
              {POTIONS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPotion(p)}
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition active:scale-95 ${
                    potion.key === p.key
                      ? "border border-[color:var(--violet)] bg-[rgba(168,85,247,0.16)] text-[color:var(--lilac)]"
                      : "border border-[color:var(--line)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="mb-4 flex gap-2">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r)}
                  className={`rounded-lg px-3.5 py-1 text-xs font-medium transition active:scale-95 ${
                    range.key === r.key
                      ? "border border-[color:var(--violet)] bg-[rgba(168,85,247,0.16)] text-[color:var(--lilac)]"
                      : "border border-[color:var(--line)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="h-[280px]">
              {!graphAllowed ? (
                <LockedGraph />
              ) : graphLoading ? (
                <Skel className="h-full w-full rounded-xl" />
              ) : history.length === 0 ? (
                <div className="grid h-full place-items-center rounded-xl border border-dashed border-[color:var(--line)] px-6 text-center">
                  <p className="text-[color:var(--muted)]">No data for this variant in the selected range yet.</p>
                </div>
              ) : history.length === 1 ? (
                <div className="grid h-full place-items-center rounded-xl border border-dashed border-[color:var(--line)] px-6 text-center">
                  <p className="text-[color:var(--muted)]">Only one data point so far &mdash; fills in as more is collected.</p>
                </div>
              ) : (
                <div className="ptrm-reveal h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,139,250,0.12)" />
                      <XAxis dataKey="ts" tickFormatter={(t) => new Date(t).toLocaleDateString()} fontSize={12} tick={{ fill: "#988FB0" }} axisLine={{ stroke: "rgba(168,139,250,0.2)" }} tickLine={{ stroke: "rgba(168,139,250,0.2)" }} />
                      <YAxis tickFormatter={(v) => v.toLocaleString()} fontSize={12} width={60} tick={{ fill: "#988FB0" }} axisLine={{ stroke: "rgba(168,139,250,0.2)" }} tickLine={{ stroke: "rgba(168,139,250,0.2)" }} />
                      <Tooltip
                        labelFormatter={(t) => new Date(t).toLocaleString()}
                        formatter={(v: any) => [Number(v).toLocaleString(), "Value"]}
                        contentStyle={{ background: "#1D1536", border: "1px solid rgba(168,139,250,0.28)", borderRadius: 10 }}
                        labelStyle={{ color: "#988FB0" }}
                        itemStyle={{ color: "#DDD6FE" }}
                      />
                      <Line type="monotone" dataKey="value" stroke="#A855F7" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}