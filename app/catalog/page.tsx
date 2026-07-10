"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type Category = "pet" | "egg" | "pet_wear";
type Pet = { id: number; name: string; rarity: string | null; icon_url: string | null; value: number | null; category: Category };
type Mover = { pet_id: number; name: string; icon_url: string | null; current_value: number; change: number };

// Graph access resolves per selected pet:
// pending      → still figuring out who's logged in
// allowed      → premium, or a free user within (or re-viewing) today's quota
// locked-auth  → not logged in (graphs require an account)
// locked-limit → free user, out of free graphs today
type GraphAccess = "pending" | "allowed" | "locked-auth" | "locked-limit";

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "pet",      label: "Pets" },
  { key: "egg",      label: "Eggs" },
  { key: "pet_wear", label: "Pet Wear" },
];

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
const DEFAULT_POTION = POTIONS[3]; // Normal Fly & Ride (pets)
const PLAIN_POTION = POTIONS[0];   // eggs & pet wear have one plain variant

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

// Free LOGGED-IN users get 3 unique-item graphs per day, keyed per user id.
const FREE_GRAPHS_PER_DAY = 3;
const freeKeyFor = (uid: string) => `petora_free_graphs_${uid}`;
const today = () => new Date().toISOString().slice(0, 10);

// ── Performance knobs (old phones / weak PCs) ────────────────────────────────
// The grid renders in slices of PAGE_SIZE instead of dumping 700–950 cards
// into the DOM at once; more load as you scroll (or via the Show-more button).
const PAGE_SIZE = 60;
// Supabase REST caps any single select at 1,000 rows, so the catalog is
// fetched in FETCH_PAGE-row pages until a short page comes back. This is what
// keeps Pet Wear (954 and growing) from silently truncating at 1,000.
const FETCH_PAGE = 1000;

function loadFreeGraphs(uid: string): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(freeKeyFor(uid)) || "null");
    if (raw && raw.date === today() && Array.isArray(raw.ids)) return raw.ids;
  } catch {}
  return [];
}
function saveFreeGraphs(uid: string, ids: number[]) {
  try { localStorage.setItem(freeKeyFor(uid), JSON.stringify({ date: today(), ids })); } catch {}
}

const fmt = (n: number) => n.toLocaleString();

// Animated count-up toward `target`. Eases out via rAF; snaps under reduced motion.
function useCountUp(target: number, duration = 600): number {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { fromRef.current = target; setDisplay(target); return; }
    const from = fromRef.current;
    if (from === target) { setDisplay(target); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); fromRef.current = target; };
  }, [target, duration]);
  return display;
}

function Sparkle({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2 13.8 10.2 22 12 13.8 13.8 12 22 10.2 13.8 2 12 10.2 10.2Z" />
    </svg>
  );
}

function LockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

// Shimmering placeholder bar for loading states.
function Skel({ className = "" }: { className?: string }) {
  return <div className={`ptrm-skel rounded-md ${className}`} aria-hidden="true" />;
}

// Skeleton stand-in for one card while the catalog loads.
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

// The 3 quota pips — remaining ones glow violet, used ones dim out.
function QuotaPips({ used, compact = false }: { used: number; compact?: boolean }) {
  const size = compact ? "h-2 w-2" : "h-2.5 w-2.5";
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${Math.max(0, FREE_GRAPHS_PER_DAY - used)} of ${FREE_GRAPHS_PER_DAY} free graphs left today`}>
      {Array.from({ length: FREE_GRAPHS_PER_DAY }).map((_, i) => {
        const spent = i < used;
        return (
          <span
            key={i}
            className={`ptrm-pip ${size} rounded-full transition-all duration-300`}
            style={
              spent
                ? { background: "rgba(168,139,250,0.18)", border: "1px solid var(--line-2)" }
                : { background: "var(--violet)", boxShadow: "0 0 8px rgba(168,85,247,0.75)" }
            }
          />
        );
      })}
    </span>
  );
}

export default function Catalog() {
  const [userId, setUserId] = useState<string | null>(null);
  const [premium, setPremium] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const [category, setCategory] = useState<Category>("pet");
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

  // current value of the exact variant picked in the modal
  const [variantValue, setVariantValue] = useState<number | null>(null);
  const [variantValueLoading, setVariantValueLoading] = useState(false);
  const animatedVariantValue = useCountUp(variantValue ?? 0);

  const [freeGraphIds, setFreeGraphIds] = useState<number[]>([]);
  const [access, setAccess] = useState<GraphAccess>("pending");

  // how many grid cards are currently rendered (incremental rendering)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const usedFree = Math.min(FREE_GRAPHS_PER_DAY, freeGraphIds.length);
  const remainingFree = Math.max(0, FREE_GRAPHS_PER_DAY - usedFree);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles").select("is_premium").eq("id", uid).single();
        setPremium(prof?.is_premium ?? false);
      }
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    if (userId) setFreeGraphIds(loadFreeGraphs(userId));
  }, [userId]);

  // Load the grid for the active category. Pets are valued at their Normal
  // Fly & Ride variant (§6 invariant); eggs and pet wear have exactly one
  // plain (normal, no-potion) variant, so that's what we join on for them.
  //
  // Fetched in FETCH_PAGE-row pages via .range() — Supabase REST silently
  // caps a single select at 1,000 rows, and Pet Wear is already at ~954.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const isPet = category === "pet";
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("pets")
          .select(`id, name, rarity, icon_url, category,
            pet_variants!inner ( neon, fly, ride, current_pet_values ( value ) )`)
          .eq("category", category)
          .eq("pet_variants.neon", "normal")
          .eq("pet_variants.fly", isPet)
          .eq("pet_variants.ride", isPet)
          .order("name")
          .range(from, from + FETCH_PAGE - 1);
        if (cancelled) return;
        if (error) { console.error(error); setLoading(false); return; }
        all.push(...(data ?? []));
        if (!data || data.length < FETCH_PAGE) break; // short page → done
        from += FETCH_PAGE;
      }
      if (cancelled) return;
      setPets(all.map((p: any) => ({
        id: p.id, name: p.name, rarity: p.rarity, icon_url: p.icon_url,
        category: (p.category ?? "pet") as Category,
        value: p.pet_variants?.[0]?.current_pet_values?.[0]?.value ?? null,
      })));
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [category]);

  useEffect(() => {
    supabase.rpc("get_movers", { window_hours: 168 }).then(({ data, error }) => {
      if (error) { console.error(error); return; }
      setMovers((data ?? []).map((r: any) => ({
        pet_id: r.pet_id, name: r.name, icon_url: r.icon_url,
        current_value: Number(r.current_value), change: Number(r.change),
      })));
    });
  }, []);

  // Any change that reshapes the grid resets incremental rendering back to
  // the first slice — keeps the DOM small on weak devices.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [category, search, rarityFilter, sortDir, tab]);

  // Resolve graph access for the selected item (reactive — see v2 notes).
  useEffect(() => {
    if (!selected) return;
    if (!authChecked) { setAccess("pending"); return; }
    if (!userId) { setAccess("locked-auth"); return; }
    if (premium) { setAccess("allowed"); return; }
    const ids = loadFreeGraphs(userId);
    if (ids.includes(selected.id)) {
      setFreeGraphIds(ids);
      setAccess("allowed");
      return;
    }
    if (ids.length < FREE_GRAPHS_PER_DAY) {
      const next = [...ids, selected.id];
      saveFreeGraphs(userId, next);
      setFreeGraphIds(next);
      setAccess("allowed");
    } else {
      setFreeGraphIds(ids);
      setAccess("locked-limit");
    }
  }, [selected, authChecked, userId, premium]);

  // Current value of the selected variant — shown next to the name in the
  // modal header and refreshed whenever the tier/potion picks change. Values
  // are public data (the grid already shows them), so this is NOT behind the
  // graph gate; only the history graph is.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setVariantValueLoading(true);
    supabase
      .from("pet_variants")
      .select("id, current_pet_values ( value )")
      .eq("pet_id", selected.id)
      .eq("neon", tier)
      .eq("fly", potion.fly)
      .eq("ride", potion.ride)
      .limit(1)
      .then(({ data }) => {
        if (cancelled) return;
        const v = (data?.[0] as any)?.current_pet_values?.[0]?.value;
        setVariantValue(v == null ? null : Number(v));
        setVariantValueLoading(false);
      });
    return () => { cancelled = true; };
  }, [selected, tier, potion]);

  useEffect(() => {
    if (!selected || access !== "allowed") return;
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
  }, [selected, tier, potion, range, access]);

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

  // only this slice is actually in the DOM; the sentinel below grows it
  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // Auto-load the next slice when the sentinel scrolls into view. The
  // Show-more button underneath does the same thing for browsers without
  // IntersectionObserver (and as a manual fallback).
  useEffect(() => {
    if (tab !== "all" || loading || !hasMore) return;
    const el = sentinelRef.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length));
        }
      },
      { rootMargin: "600px 0px" } // start loading well before it's visible
    );
    io.observe(el);
    return () => io.disconnect();
  }, [tab, loading, hasMore, filtered.length]);

  const rising = movers.filter((m) => m.change > 0).sort((a, b) => b.change - a.change);
  const falling = movers.filter((m) => m.change < 0).sort((a, b) => a.change - b.change);

  function openPet(pet: Pet) {
    setSelected(pet);
    setTier(DEFAULT_TIER);
    // pets default to the Normal Fly & Ride graph; eggs/pet wear only have the
    // plain variant, so the pickers are hidden and we query that directly
    setPotion(pet.category === "pet" ? DEFAULT_POTION : PLAIN_POTION);
    setRange(RANGES[2]);
    setHistory([]);
    setAccess("pending"); // resolved by the access effect
  }

  function openMover(m: Mover) {
    openPet({ id: m.pet_id, name: m.name, rarity: null, icon_url: m.icon_url, value: m.current_value, category: "pet" });
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
      {locked && <LockIcon />}
    </button>
  );

  // The always-visible graph-access strip under the header.
  function AccessStrip() {
    if (!authChecked) {
      return <Skel className="mt-4 h-[52px] w-full rounded-xl" />;
    }
    if (!userId) {
      return (
        <div className="petora-card ptrm-reveal mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderColor: "var(--line-2)" }}>
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-lg text-[color:var(--lilac)]" style={{ background: "rgba(168,139,250,0.10)", border: "1px solid var(--line-2)" }}>
              <LockIcon size={15} />
            </span>
            <p className="text-[13.5px] text-[color:var(--muted)]">
              <span className="font-semibold text-[color:var(--text)]">Value graphs need a free account</span>
              {" "}— log in to unlock {FREE_GRAPHS_PER_DAY} graphs a day.
            </p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <Link href="/login" className="rounded-full px-4 py-1.5 text-[13px] font-semibold text-[#1a1030] transition hover:brightness-110 active:scale-95 [background-image:var(--ramp-h)] [font-family:var(--font-display)]">
              Log in
            </Link>
            <Link href="/signup" className="rounded-full border border-[color:var(--line-2)] px-4 py-1.5 text-[13px] font-semibold text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)] active:scale-95">
              Sign up free
            </Link>
          </div>
        </div>
      );
    }
    if (premium) {
      return (
        <div className="ptrm-reveal mt-4 inline-flex items-center gap-2 rounded-full border border-[color:var(--line-2)] bg-[rgba(168,139,250,0.07)] px-4 py-2">
          <Sparkle className="ptrm-pulse h-3.5 w-3.5 text-[color:var(--lilac)]" />
          <span className="text-[13px] font-semibold text-[color:var(--text)]">
            Premium — <span className="ptrm-shimmer">unlimited graphs</span> on everything in the catalog
          </span>
        </div>
      );
    }
    return (
      <div className="petora-card ptrm-reveal mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderColor: "var(--line-2)" }}>
        <div className="flex min-w-0 items-center gap-3">
          <QuotaPips used={usedFree} />
          <p className="text-[13.5px] text-[color:var(--muted)]">
            <span className="font-semibold text-[color:var(--text)]">
              {remainingFree > 0
                ? `${remainingFree} of ${FREE_GRAPHS_PER_DAY} free graphs left today`
                : "Free graphs used up for today"}
            </span>
            {remainingFree > 0 ? " — each new item you open uses one." : " — quota resets at midnight."}
          </p>
        </div>
        <Link href="/premium" className="flex-none rounded-full px-4 py-1.5 text-[13px] font-semibold text-[#1a1030] transition hover:brightness-110 active:scale-95 [background-image:var(--ramp-h)] [font-family:var(--font-display)]">
          Go unlimited
        </Link>
      </div>
    );
  }

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
            <p className="text-xs text-[color:var(--muted)]">Pets only &middot; last 7 days &middot; Normal Fly &amp; Ride &middot; tap to open</p>
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
                  {m.icon_url && <img src={m.icon_url} alt="" width={40} height={40} loading="lazy" decoding="async" className="h-10 w-10 object-contain" />}
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
          <LockIcon size={22} />
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

  // Free user out of graphs for today.
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
            <LockIcon size={20} />
          </span>
          <div className="mt-3 flex items-center justify-center gap-2">
            <QuotaPips used={FREE_GRAPHS_PER_DAY} compact />
            <p className="font-semibold text-[color:var(--text)]">All {FREE_GRAPHS_PER_DAY} free graphs used today</p>
          </div>
          <p className="mx-auto mt-1 max-w-xs text-[13px] text-[color:var(--muted)]">
            Your quota resets at midnight — or go Premium for unlimited value history on everything.
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

  // Not logged in — graphs live behind a free account.
  function LockedGraphAuth() {
    return (
      <div className="relative grid h-full place-items-center overflow-hidden rounded-xl border border-[color:var(--line)]">
        <div className="pointer-events-none absolute inset-0 opacity-20 blur-[2px]" aria-hidden="true">
          <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="h-full w-full">
            <path className="ptrm-draw" d="M0,86 L50,80 L100,84 L150,62 L200,70 L250,44 L300,52 L350,28 L400,18" fill="none" stroke="#A855F7" strokeWidth="2.5" pathLength={1} />
          </svg>
        </div>
        <div className="relative px-6 text-center">
          <span className="ptrm-float mx-auto grid h-11 w-11 place-items-center rounded-xl text-[color:var(--lilac)]" style={{ background: "rgba(168,139,250,0.10)", border: "1px solid var(--line-2)" }}>
            <LockIcon size={20} />
          </span>
          <p className="mt-3 font-semibold text-[color:var(--text)]">Log in to see this item&apos;s value history</p>
          <p className="mx-auto mt-1 max-w-xs text-[13px] text-[color:var(--muted)]">
            A free account unlocks {FREE_GRAPHS_PER_DAY} graphs a day. Premium makes it unlimited.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/login"
              className="rounded-full px-6 py-2.5 text-[14px] font-semibold text-[#1a1030] shadow-[0_12px_34px_-12px_rgba(168,85,247,0.7)] transition hover:brightness-110 active:scale-95 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-full border border-[color:var(--line-2)] px-5 py-2.5 text-[14px] font-semibold text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)] active:scale-95"
            >
              Sign up free
            </Link>
          </div>
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
        @keyframes ptrmShimmerText { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
        @keyframes ptrmPipPop { 0%{transform:scale(1)} 50%{transform:scale(1.5)} 100%{transform:scale(1)} }
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
        .ptrm-shimmer {
          background: linear-gradient(100deg,#A855F7,#C4B5FD,#FFFFFF,#C4B5FD,#A855F7);
          background-size:200% auto; -webkit-background-clip:text; background-clip:text;
          color:transparent; animation: ptrmShimmerText 6s linear infinite;
        }
        .ptrm-pip { animation: ptrmPipPop .35s ease-out; }
        .ptrm-card-hover {
          transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease, background .2s ease;
        }
        .ptrm-card-hover:hover {
          transform: translateY(-3px);
          box-shadow: 0 14px 34px -16px rgba(168,85,247,0.5);
        }
        @media (prefers-reduced-motion: reduce) {
          .ptrm-row, .ptrm-reveal, .ptrm-bar, .ptrm-backdrop, .ptrm-modal,
          .ptrm-float, .ptrm-pulse, .ptrm-draw, .ptrm-pip {
            animation:none!important; opacity:1!important; transform:none!important;
            stroke-dashoffset:0!important;
          }
          .ptrm-skel { animation:none!important; }
          .ptrm-shimmer { animation:none!important; color:var(--lilac)!important; }
          .ptrm-card-hover, .ptrm-card-hover:hover { transition:none!important; transform:none!important; }
        }
      `}</style>

      <div className="ptrm-reveal">
        <p className="petora-eyebrow">Live market</p>
        <h1 className="mt-1.5 text-3xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">Catalog</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          {loading ? "Loading" : `${filtered.length} ${CATEGORIES.find((c) => c.key === category)?.label.toLowerCase()}`} &middot; tap one to see its value history
        </p>
      </div>

      {/* graph access strip — always tells the visitor what their plan gets */}
      <AccessStrip />

      <div className="ptrm-reveal mt-6 mb-5 inline-flex rounded-[10px] bg-[rgba(168,139,250,0.07)] p-1" style={{ animationDelay: "60ms" }}>
        {tabBtn("all", "Browse", false)}
        {tabBtn("rising", `Rising ${rising.length && premium ? `(${rising.length})` : ""}`.trim(), !premium)}
        {tabBtn("falling", `Falling ${falling.length && premium ? `(${falling.length})` : ""}`.trim(), !premium)}
      </div>

      {tab === "all" && (
        <div key="all" className="ptrm-reveal">
          {/* category pills */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => { setCategory(c.key); setRarityFilter(null); setSearch(""); }}
                className={`rounded-full px-4 py-1.5 text-[13.5px] font-semibold transition active:scale-95 [font-family:var(--font-display)] ${
                  category === c.key
                    ? "text-[#1a1030] shadow-[0_6px_20px_-8px_rgba(168,85,247,0.7)] [background-image:var(--ramp-h)]"
                    : "border border-[color:var(--line)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <input
            placeholder={`Search ${CATEGORIES.find((c) => c.key === category)?.label.toLowerCase()}\u2026`}
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
              <p className="font-semibold text-[color:var(--text)] [font-family:var(--font-display)]">
                {pets.length === 0 && !search && !rarityFilter ? "Nothing here yet" : "No matches"}
              </p>
              <p className="mx-auto mt-1 max-w-xs text-[13px] text-[color:var(--muted)]">
                {pets.length === 0 && !search && !rarityFilter
                  ? "This category fills in on the next value sync — check back soon."
                  : `Try a different name${rarityFilter ? ", or clear the rarity filter" : ""}.`}
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
            <>
              <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                {visible.map((pet, idx) => {
                  const meta = rarityMeta(pet.rarity);
                  // only the first slice gets staggered reveal delays; cards
                  // loaded by scrolling appear immediately (no delay math)
                  const delay = idx < PAGE_SIZE ? Math.min(idx, 20) * 25 : 0;
                  return (
                    <div
                      key={pet.id}
                      onClick={() => openPet(pet)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPet(pet); } }}
                      className="petora-card ptrm-reveal ptrm-card-hover group cursor-pointer p-4 text-center hover:border-[color:var(--line-2)] hover:bg-[rgba(168,139,250,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--violet)]"
                      style={{ animationDelay: `${delay}ms` }}
                    >
                      {pet.icon_url && (
                        <img
                          src={pet.icon_url}
                          alt={pet.name}
                          width={72}
                          height={72}
                          loading="lazy"
                          decoding="async"
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

              {/* incremental-load footer: invisible sentinel auto-loads the
                  next slice as you approach it; the button is the fallback */}
              {hasMore && (
                <div className="mt-6 text-center">
                  <div ref={sentinelRef} aria-hidden="true" />
                  <button
                    onClick={() => setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length))}
                    className="rounded-full border border-[color:var(--line-2)] px-6 py-2.5 text-[14px] font-semibold text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)] active:scale-95"
                  >
                    Show more ({filtered.length - visibleCount} left)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "rising" && (
        <div key="rising" className="ptrm-reveal">
          {!authChecked ? (
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
          {!authChecked ? (
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
              {selected.icon_url && <img src={selected.icon_url} alt={selected.name} width={48} height={48} decoding="async" className="h-12 w-12 object-contain" />}
              <div className="min-w-0 flex-1">
                <h2 className="m-0 truncate text-xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">{selected.name}</h2>
                {authChecked && (
                  premium ? (
                    <p className="flex items-center gap-1 text-xs text-[color:var(--muted)]">
                      <Sparkle className="h-2.5 w-2.5 text-[color:var(--lilac)]" /> Premium · unlimited graphs
                    </p>
                  ) : !userId ? (
                    <p className="text-xs text-[color:var(--muted)]">Graphs require a free account</p>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs text-[color:var(--muted)]">
                      <QuotaPips used={usedFree} compact />
                      {access === "locked-limit" ? "Free graph limit reached today" : `${remainingFree} free graph${remainingFree === 1 ? "" : "s"} left today`}
                    </span>
                  )
                )}
              </div>
              <div className="flex-none text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                  Value
                </div>
                {variantValueLoading ? (
                  <Skel className="ml-auto mt-1 h-6 w-16" />
                ) : (
                  <div
                    className="mt-0.5 text-xl font-bold leading-none text-[color:var(--lilac)] tabular-nums [font-family:var(--font-data)]"
                    aria-live="polite"
                  >
                    {variantValue == null ? "\u2014" : fmt(animatedVariantValue)}
                  </div>
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

            {/* tier & potion pickers only make sense for pets — eggs and pet
                wear have a single plain variant */}
            {selected.category === "pet" && (
              <>
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
              </>
            )}

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
              {access === "pending" ? (
                <Skel className="h-full w-full rounded-xl" />
              ) : access === "locked-auth" ? (
                <LockedGraphAuth />
              ) : access === "locked-limit" ? (
                <LockedGraph />
              ) : graphLoading ? (
                <Skel className="h-full w-full rounded-xl" />
              ) : history.length === 0 ? (
                <div className="grid h-full place-items-center rounded-xl border border-dashed border-[color:var(--line)] px-6 text-center">
                  <p className="text-[color:var(--muted)]">No data for this {selected.category === "pet" ? "variant" : "item"} in the selected range yet.</p>
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