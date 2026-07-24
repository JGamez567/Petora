"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Category = "pet" | "egg" | "pet_wear";
type CatalogItem = {
  id: number;
  name: string;
  rarity: string | null;
  icon_url: string | null;
  category: Category;
  demand: number | null;
  baseValue: number | null; // Normal / No-Potion value (picker display + sort)
};

type TierKey = "normal" | "neon" | "mega";

// One pet placed on the trade board: the item + the exact variant + its value.
type CalcItem = {
  uid: number;          // unique per placement (same pet can be added twice)
  item: CatalogItem;
  tier: TierKey;
  fly: boolean;
  ride: boolean;
  value: number;
};

// 18 pets per side; the board shows 3×3 and scrolls for the rest.
const MAX_PER_SIDE = 18;
const MIN_CELLS = 9;

// ── Demand → tradeability multiplier ─────────────────────────────────────────
// Demand (1–3, scraped from AMVGG) discounts a pet's *practical* trade value:
// a low-demand pet is worth less in the real trading market than its listed
// value because it's harder to move. Unrated pets get no penalty — missing
// data isn't low demand.
const MAX_DEMAND = 3;
const DEMAND_MULT: Record<number, number> = { 1: 0.85, 2: 0.95, 3: 1.0 };
const DEMAND_LABELS = ["", "Low", "Medium", "High"] as const;
const demandMult = (d: number | null) => (d != null && DEMAND_MULT[d] != null ? DEMAND_MULT[d] : 1.0);

// Verdict thresholds on the demand-adjusted totals: within ±FAIR_BAND = Fair.
const FAIR_BAND = 0.05;

const FETCH_PAGE = 1000;
// picker renders in slices as you scroll — keeps the DOM light with 750+ tiles
const PICKER_PAGE = 48;

const fmt = (n: number) => n.toLocaleString();

const variantLabel = (tier: TierKey, fly: boolean, ride: boolean) => {
  const parts: string[] = [];
  if (tier === "neon") parts.push("Neon");
  if (tier === "mega") parts.push("Mega");
  if (fly && ride) parts.push("Fly & Ride");
  else if (fly) parts.push("Fly");
  else if (ride) parts.push("Ride");
  return parts.length ? parts.join(" ") : "Normal";
};

// Color-coded variant badges (Adopt-Me-style): Mega purple, Neon green,
// Fly blue, Ride red. Rendered as little circles overlapping the pet icon.
const BADGE_META: Record<string, { bg: string; fg: string }> = {
  M: { bg: "#A855F7", fg: "#FFFFFF" },
  N: { bg: "#4ADE80", fg: "#0A1A10" },
  F: { bg: "#38BDF8", fg: "#FFFFFF" },
  R: { bg: "#FB7185", fg: "#FFFFFF" },
};

function VariantBadges({ tier, fly, ride, size = 18 }: { tier: TierKey; fly: boolean; ride: boolean; size?: number }) {
  const letters = [
    tier === "mega" ? "M" : tier === "neon" ? "N" : null,
    fly ? "F" : null,
    ride ? "R" : null,
  ].filter(Boolean) as string[];
  if (!letters.length) return null;
  return (
    <span className="flex items-center justify-center gap-[3px]" aria-label={variantLabel(tier, fly, ride)}>
      {letters.map((l) => (
        <span
          key={l}
          className="grid place-items-center rounded-full font-extrabold shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
          style={{ width: size, height: size, fontSize: size * 0.58, background: BADGE_META[l].bg, color: BADGE_META[l].fg }}
          aria-hidden="true"
        >
          {l}
        </span>
      ))}
    </span>
  );
}

// ── Small shared bits (Galaxy style) ─────────────────────────────────────────

function Heart({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={
        filled
          ? { fill: "var(--violet)", filter: "drop-shadow(0 0 3px rgba(168,85,247,0.55))" }
          : { fill: "rgba(168,139,250,0.14)" }
      }
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function DemandHearts({ level, size = 10 }: { level: number | null; size?: number }) {
  if (level == null) return null;
  const filled = Math.max(0, Math.min(MAX_DEMAND, level));
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`Demand ${filled} out of ${MAX_DEMAND}`}
      title={`Demand: ${DEMAND_LABELS[filled]} (${filled}/${MAX_DEMAND})`}
    >
      {Array.from({ length: MAX_DEMAND }).map((_, i) => (
        <Heart key={i} filled={i < filled} size={size} />
      ))}
    </span>
  );
}

function Skel({ className = "" }: { className?: string }) {
  return <div className={`ptrc-skel rounded-md ${className}`} aria-hidden="true" />;
}

// rAF count-up (snaps under reduced motion).
function useCountUp(target: number, duration = 500): number {
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

// ── The page ─────────────────────────────────────────────────────────────────

export default function Calculator() {
  // full catalog for the picker (all three categories, paginated)
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  // premium gate for the Demand verdict bar (client-side, same model as the
  // movers teaser — acceptable leak per the freemium gating approach)
  const [premium, setPremium] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles").select("is_premium").eq("id", uid).single();
        setPremium(prof?.is_premium ?? false);
      }
      setAuthChecked(true);
    });
  }, []);

  const [you, setYou] = useState<CalcItem[]>([]);
  const [them, setThem] = useState<CalcItem[]>([]);
  const uidRef = useRef(1);

  // picker modal state
  const [pickerSide, setPickerSide] = useState<"you" | "them" | null>(null);
  const [search, setSearch] = useState("");
  const [pickCat, setPickCat] = useState<Category>("pet");
  const [pickerVisible, setPickerVisible] = useState(PICKER_PAGE);
  // variant toggles (Elvebredd-style pills at the bottom of the picker)
  const [selTier, setSelTier] = useState<TierKey>("normal");
  const [selFly, setSelFly] = useState(false);
  const [selRide, setSelRide] = useState(false);
  // per-tile feedback
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ id: number; ok: boolean } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerScrollRef = useRef<HTMLDivElement | null>(null);

  // ── load the catalog once (paginated past the 1,000-row REST cap) ─────────
  // The sort key must be UNIQUE for .range() paging to be stable: this query
  // spans all three categories and Elvebredd reuses names across categories,
  // so name alone can duplicate rows across pages. name+id is unique; the Map
  // dedupes as a second line of defense.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setCatalogLoading(true);
      const byId = new Map<number, any>();
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("pets")
          .select(`id, name, rarity, icon_url, category, demand,
            pet_variants!inner ( neon, fly, ride, current_pet_values ( value ) )`)
          .eq("pet_variants.neon", "normal")
          .eq("pet_variants.fly", false)
          .eq("pet_variants.ride", false)
          .order("name")
          .order("id")
          .range(from, from + FETCH_PAGE - 1);
        if (cancelled) return;
        if (error) { console.error(error); setCatalogLoading(false); return; }
        for (const row of data ?? []) byId.set(row.id, row);
        if (!data || data.length < FETCH_PAGE) break;
        from += FETCH_PAGE;
      }
      if (cancelled) return;
      setCatalog([...byId.values()].map((p: any) => ({
        id: p.id, name: p.name, rarity: p.rarity, icon_url: p.icon_url,
        category: (p.category ?? "pet") as Category,
        demand: p.demand ?? null,
        baseValue: p.pet_variants?.[0]?.current_pet_values?.[0]?.value != null
          ? Number(p.pet_variants[0].current_pet_values[0].value)
          : null,
      })));
      setCatalogLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // esc closes the picker; lock body scroll while it's open
  useEffect(() => {
    if (!pickerSide) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePicker(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [pickerSide]);

  // search / category change → back to the first slice, scrolled to top
  useEffect(() => {
    setPickerVisible(PICKER_PAGE);
    pickerScrollRef.current?.scrollTo({ top: 0 });
  }, [search, pickCat]);

  function openPicker(side: "you" | "them") {
    setPickerSide(side);
    setSearch("");
    setPickerVisible(PICKER_PAGE);
    // NOTE: selTier / selFly / selRide / pickCat deliberately NOT reset —
    // the variant you toggled stays selected across both boxes and re-opens,
    // so building a Mega Fly Ride offer on both sides doesn't mean re-toggling
    // every time.
  }
  function closePicker() {
    setPickerSide(null);
    setPendingId(null);
  }

  const sideList = pickerSide === "you" ? you : them;
  const sideFull = pickerSide != null && sideList.length >= MAX_PER_SIDE;

  function showFlash(id: number, ok: boolean) {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash({ id, ok });
    flashTimer.current = setTimeout(() => setFlash(null), 700);
  }

  // Quick-add: click a tile → the currently toggled variant is added.
  // The modal STAYS OPEN so users can stack up a whole offer in one go.
  async function quickAdd(c: CatalogItem) {
    if (!pickerSide || sideFull || pendingId != null) return;

    const isPet = c.category === "pet";
    const t: TierKey = isPet ? selTier : "normal";
    const f = isPet ? selFly : false;
    const r = isPet ? selRide : false;

    let value: number | null;
    if (!isPet || (t === "normal" && !f && !r)) {
      value = c.baseValue; // already loaded — instant
    } else {
      // fetch the exact variant's value
      setPendingId(c.id);
      const { data } = await supabase
        .from("pet_variants")
        .select("id, current_pet_values ( value )")
        .eq("pet_id", c.id)
        .eq("neon", t)
        .eq("fly", f)
        .eq("ride", r)
        .limit(1);
      setPendingId(null);
      const v = (data?.[0] as any)?.current_pet_values?.[0]?.value;
      value = v == null ? null : Number(v);
    }

    if (value == null) { showFlash(c.id, false); return; } // no value for this variant

    const entry: CalcItem = { uid: uidRef.current++, item: c, tier: t, fly: f, ride: r, value };
    if (pickerSide === "you") setYou((s) => (s.length < MAX_PER_SIDE ? [...s, entry] : s));
    else setThem((s) => (s.length < MAX_PER_SIDE ? [...s, entry] : s));
    showFlash(c.id, true);
  }

  function removeItem(side: "you" | "them", uid: number) {
    if (side === "you") setYou((s) => s.filter((i) => i.uid !== uid));
    else setThem((s) => s.filter((i) => i.uid !== uid));
  }

  function swapSides() {
    setYou(them);
    setThem(you);
  }

  // ── the math ──────────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const sum = (list: CalcItem[]) => list.reduce((a, i) => a + i.value, 0);
    const sumAdj = (list: CalcItem[]) => list.reduce((a, i) => a + i.value * demandMult(i.item.demand), 0);

    const youRaw = sum(you);
    const themRaw = sum(them);
    const youAdj = sumAdj(you);
    const themAdj = sumAdj(them);

    const empty = you.length === 0 && them.length === 0;

    // Positive diff → good for YOU (you receive more than you give).
    const base = Math.max(youAdj, themAdj, 1);
    const ratioAdj = (themAdj - youAdj) / base;
    const baseRaw = Math.max(youRaw, themRaw, 1);
    const ratioRaw = (themRaw - youRaw) / baseRaw;

    const verdictOf = (r: number): "win" | "fair" | "lose" =>
      r > FAIR_BAND ? "win" : r < -FAIR_BAND ? "lose" : "fair";
    const verdict = verdictOf(ratioAdj);
    const rawVerdict = verdictOf(ratioRaw);

    // meters: 0 = full lose, 50 = fair, 100 = full win (clamped at ±35%)
    const toPos = (r: number) => 50 + Math.max(-35, Math.min(35, r * 100)) * (50 / 35);
    const meterPos = toPos(ratioAdj);      // demand-adjusted (Premium bar)
    const meterPosRaw = toPos(ratioRaw);   // raw value (free bar)

    // demand note — only when demand actually moved the needle
    const lowIncoming = them.filter((i) => i.item.demand === 1).length;
    const lowOutgoing = you.filter((i) => i.item.demand === 1).length;
    let demandNote: string | null = null;
    if (!empty) {
      if (rawVerdict !== verdict) {
        if (rawVerdict === "win" && lowIncoming > 0) {
          demandNote = `By raw value alone this is a Win for you — but ${lowIncoming === 1 ? "one of the pets" : `${lowIncoming} of the pets`} you'd receive ${lowIncoming === 1 ? "is" : "are"} low demand (hard to re-trade), which pulls the rating down to ${verdict === "fair" ? "Fair" : "a Lose"}.`;
        } else if (rawVerdict === "lose" && lowOutgoing > 0) {
          demandNote = `By raw value alone this is a Lose for you — but ${lowOutgoing === 1 ? "one of the pets" : `${lowOutgoing} of the pets`} you'd give away ${lowOutgoing === 1 ? "is" : "are"} low demand (hard to re-trade), which pulls the rating up to ${verdict === "fair" ? "Fair" : "a Win"}.`;
        } else {
          demandNote = "Demand ratings shifted this verdict compared to raw values alone.";
        }
      } else if (lowIncoming > 0 && (verdict === "win" || verdict === "fair")) {
        demandNote = `Heads up: ${lowIncoming === 1 ? "one pet" : `${lowIncoming} pets`} on their side ${lowIncoming === 1 ? "is" : "are"} low demand — fine to keep, but harder to re-trade later.`;
      }
    }

    return { youRaw, themRaw, youAdj, themAdj, ratioAdj, verdict, rawVerdict, meterPos, meterPosRaw, demandNote, empty };
  }, [you, them]);

  const youDisplay = useCountUp(Math.round(calc.youRaw));
  const themDisplay = useCountUp(Math.round(calc.themRaw));

  // Free users' headline verdict is VALUE-only; Premium's headline is the
  // demand-adjusted "true" verdict. (Showing free users the adjusted one
  // would give away exactly what the Premium bar sells.)
  const headlineVerdict = premium ? calc.verdict : calc.rawVerdict;
  const verdictColorOf = (v: "win" | "fair" | "lose") =>
    v === "win" ? "var(--up)" : v === "lose" ? "var(--down)" : "var(--lilac)";
  const verdictTextOf = (v: "win" | "fair" | "lose") =>
    v === "win" ? "WIN for you" : v === "lose" ? "LOSE for you" : "FAIR trade";
  const verdictColor = verdictColorOf(headlineVerdict);
  const verdictText = calc.empty ? "Add pets to both sides" : verdictTextOf(headlineVerdict);

  // Picker list: filtered, then sorted BIGGEST value first (no-value items
  // sink to the bottom). The whole catalog is reachable — tiles render in
  // slices of PICKER_PAGE as you scroll, so the DOM stays light.
  const pickerFiltered = useMemo(() =>
    catalog
      .filter((c) => c.category === pickCat)
      .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (b.baseValue ?? -1) - (a.baseValue ?? -1)),
    [catalog, pickCat, search]
  );
  const pickerList = pickerFiltered.slice(0, pickerVisible);

  // infinite scroll inside the picker: near the bottom → grow the slice
  function onPickerScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) {
      setPickerVisible((v) => (v < pickerFiltered.length ? Math.min(v + PICKER_PAGE, pickerFiltered.length) : v));
    }
  }

  // ── one side of the board (plain render function — NOT a nested component,
  // so the scrollable board doesn't remount and lose scroll position on every
  // state change) ───────────────────────────────────────────────────────────
  function renderBoard(side: "you" | "them", list: CalcItem[], title: string, display: number) {
    const canAdd = list.length < MAX_PER_SIDE;
    // filled cells + one add-cell (if allowed); padded to at least 9 cells and
    // always rounded UP to a complete row of 3 — the board never shows a
    // ragged bottom row, it just grows 3 boxes at a time as pets are added.
    const rawCells = list.length + (canAdd ? 1 : 0);
    const cellCount = Math.max(MIN_CELLS, Math.ceil(rawCells / 3) * 3);
    return (
      <div className="min-w-0 flex-1">
        <div className="petora-card overflow-hidden">
          {/* board header */}
          <div className="flex items-center justify-between gap-1 border-b border-[color:var(--line)] px-2.5 py-2 sm:px-4 sm:py-3">
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
              <h2 className="truncate text-[10.5px] font-bold uppercase tracking-wider text-[color:var(--text)] sm:text-[13px] [font-family:var(--font-display)]">{title}</h2>
              <span className="flex-none rounded-full border border-[color:var(--line-2)] px-1.5 py-0.5 text-[9.5px] font-semibold tabular-nums text-[color:var(--muted)] sm:px-2 sm:text-[11px]">
                {list.length}/{MAX_PER_SIDE}
              </span>
            </div>
            <span className="flex-none text-[14px] font-bold tabular-nums text-[color:var(--lilac)] sm:text-lg [font-family:var(--font-data)]">
              {fmt(display)}
            </span>
          </div>

          {/* 3-wide grid — square tiles on mobile (icon + badges only, like the
              in-game trade window), full detail cards on larger screens */}
          <div className="ptrc-scroll max-h-[380px] overflow-y-auto p-1.5 sm:p-3">
            <div className="grid grid-cols-3 gap-1 sm:gap-2">
              {Array.from({ length: cellCount }).map((_, i) => {
                const entry = list[i];
                if (entry) {
                  return (
                    <button
                      key={entry.uid}
                      onClick={() => removeItem(side, entry.uid)}
                      title={`${entry.item.name} (${variantLabel(entry.tier, entry.fly, entry.ride)}) — tap to remove`}
                      className="ptrc-pop group relative aspect-square rounded-lg border border-[color:var(--line-2)] p-1 transition hover:border-[color:var(--down)] hover:bg-[rgba(251,113,133,0.06)] active:scale-95 sm:aspect-auto sm:h-[112px] sm:rounded-xl sm:p-1.5"
                      style={{ background: "rgba(168,139,250,0.07)" }}
                    >
                      {entry.item.icon_url && (
                        <img src={entry.item.icon_url} alt={entry.item.name} className="mx-auto h-[58%] w-[58%] object-contain transition-transform duration-200 group-hover:scale-90 sm:h-11 sm:w-11" loading="lazy" decoding="async" />
                      )}
                      <div className="-mt-1 sm:-mt-2">
                        <span className="sm:hidden"><VariantBadges tier={entry.tier} fly={entry.fly} ride={entry.ride} size={12} /></span>
                        <span className="hidden sm:block"><VariantBadges tier={entry.tier} fly={entry.fly} ride={entry.ride} size={18} /></span>
                      </div>
                      <div className="hidden truncate text-center text-[10px] font-semibold leading-tight text-[color:var(--text)] sm:block">{entry.item.name}</div>
                      <div className="hidden text-center text-[11px] font-bold tabular-nums leading-tight text-[color:var(--lilac)] sm:block [font-family:var(--font-data)]">{fmt(entry.value)}</div>
                      <div className="hidden items-center justify-center sm:flex">
                        <DemandHearts level={entry.item.demand} size={7} />
                      </div>
                      <span className="absolute right-0.5 top-0.5 hidden h-4 w-4 place-items-center rounded-full bg-[color:var(--down)] text-[10px] font-bold leading-none text-white group-hover:grid sm:right-1 sm:top-1" aria-hidden="true">×</span>
                    </button>
                  );
                }
                const isNext = canAdd && i === list.length;
                return (
                  <button
                    key={`empty-${i}`}
                    onClick={() => isNext && openPicker(side)}
                    disabled={!isNext}
                    aria-label={isNext ? `Add a pet to ${title}` : undefined}
                    className={`ptrc-slot aspect-square rounded-lg border transition sm:aspect-auto sm:h-[112px] sm:rounded-xl ${
                      isNext
                        ? "ptrc-glow cursor-pointer border-[color:var(--violet)] bg-[rgba(168,85,247,0.10)] hover:bg-[rgba(168,85,247,0.16)] active:scale-95"
                        : "border-[color:var(--line-2)] bg-[rgba(168,139,250,0.05)]"
                    }`}
                    style={!isNext ? { boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" } : undefined}
                  >
                    {isNext && (
                      <span className="ptrc-plus grid h-full w-full place-items-center text-2xl font-light text-[color:var(--lilac)] sm:text-3xl">+</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── variant toggle pill (picker footer) — big + color-coded ───────────────
  function togglePill(label: string, active: boolean, onClick: () => void, disabled: boolean, bg: string, fg: string) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        aria-pressed={active}
        className="w-full rounded-full px-2 py-2 text-[13px] font-bold transition active:scale-95 disabled:opacity-35 sm:w-auto sm:px-6 sm:py-2.5 sm:text-[15px] [font-family:var(--font-display)]"
        style={
          active
            ? { background: bg, color: fg, boxShadow: `0 8px 22px -8px ${bg}` }
            : { border: "1px solid var(--line-2)", color: "var(--muted)", background: "transparent" }
        }
      >
        {label}
      </button>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-2 py-6 sm:px-6 sm:py-10">
      <style>{`
        @keyframes ptrcFade { from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:translateY(0)} }
        @keyframes ptrcPop { from{opacity:0; transform:scale(.85)} to{opacity:1; transform:scale(1)} }
        @keyframes ptrcSkelShimmer { from{background-position:200% 0} to{background-position:-200% 0} }
        @keyframes ptrcBackdrop { from{opacity:0} to{opacity:1} }
        @keyframes ptrcModalIn { from{opacity:0; transform:translateY(16px) scale(.96)} to{opacity:1; transform:translateY(0) scale(1)} }
        @keyframes ptrcPulseGlow { 0%,100%{box-shadow:0 0 0 0 rgba(168,85,247,0)} 50%{box-shadow:0 0 18px 2px rgba(168,85,247,0.35)} }
        @keyframes ptrcSlotGlow { 0%,100%{box-shadow:inset 0 0 0 0 rgba(168,85,247,0)} 50%{box-shadow:inset 0 0 16px 0 rgba(168,85,247,0.18)} }
        @keyframes ptrcFlashOk { 0%{box-shadow:0 0 0 0 rgba(93,230,168,0.0)} 30%{box-shadow:0 0 0 3px rgba(93,230,168,0.8)} 100%{box-shadow:0 0 0 0 rgba(93,230,168,0)} }
        @keyframes ptrcFlashBad { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 50%{transform:translateX(4px)} 75%{transform:translateX(-2px)} }
        .ptrc-reveal { opacity:0; animation: ptrcFade .45s cubic-bezier(.22,1,.36,1) forwards; }
        .ptrc-pop { animation: ptrcPop .25s cubic-bezier(.22,1,.36,1) both; }
        .ptrc-skel {
          background: linear-gradient(90deg, rgba(168,139,250,0.07) 25%, rgba(168,139,250,0.16) 50%, rgba(168,139,250,0.07) 75%);
          background-size: 200% 100%; animation: ptrcSkelShimmer 1.4s linear infinite;
        }
        .ptrc-backdrop { animation: ptrcBackdrop .2s ease-out both; }
        .ptrc-modal { animation: ptrcModalIn .28s cubic-bezier(.22,1,.36,1) both; }
        .ptrc-plus { transition: transform .2s ease; }
        .ptrc-slot:hover .ptrc-plus { transform: scale(1.25) rotate(90deg); }
        .ptrc-glow { animation: ptrcSlotGlow 2.6s ease-in-out infinite; }
        .ptrc-marker { transition: left .5s cubic-bezier(.22,1,.36,1); }
        .ptrc-verdict { animation: ptrcPulseGlow 2.4s ease-in-out infinite; }
        .ptrc-flash-ok { animation: ptrcFlashOk .7s ease-out; }
        .ptrc-flash-bad { animation: ptrcFlashBad .35s ease-in-out; }
        .ptrc-scroll { scrollbar-width: thin; scrollbar-color: rgba(168,139,250,0.35) transparent; }
        .ptrc-scroll::-webkit-scrollbar { width: 6px; }
        .ptrc-scroll::-webkit-scrollbar-thumb { background: rgba(168,139,250,0.3); border-radius: 999px; }
        @media (prefers-reduced-motion: reduce) {
          .ptrc-reveal, .ptrc-pop, .ptrc-backdrop, .ptrc-modal, .ptrc-flash-ok, .ptrc-flash-bad { animation:none!important; opacity:1!important; transform:none!important; }
          .ptrc-skel { animation:none!important; }
          .ptrc-marker { transition:none!important; }
          .ptrc-verdict, .ptrc-glow { animation:none!important; }
          .ptrc-plus, .ptrc-slot:hover .ptrc-plus { transition:none!important; transform:none!important; }
        }
      `}</style>

      {/* header */}
      <div className="ptrc-reveal px-1 sm:px-0">
        <p className="petora-eyebrow">Trade smarter</p>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[26px] font-bold text-[color:var(--text)] sm:text-3xl [font-family:var(--font-display)]">Trade Calculator</h1>
          <Link href="/catalog" className="rounded-full border border-[color:var(--line-2)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)] active:scale-95 sm:px-4 sm:text-[13px]">
            &larr; Back to catalog
          </Link>
        </div>
        <p className="mt-2 max-w-2xl text-[13px] text-[color:var(--muted)] sm:text-sm">
          Most calculators only compare values. Petora&apos;s verdict weighs{" "}
          <span className="font-semibold text-[color:var(--text)]">value</span> <em>and</em>{" "}
          <span className="font-semibold text-[color:var(--text)]">demand</span> — because a trade
          that wins on paper can still leave you holding pets nobody wants.
        </p>
      </div>

      {/* verdict panel */}
      <div className="petora-card ptrc-reveal mt-5 p-3.5 sm:mt-6 sm:p-5" style={{ animationDelay: "60ms", borderColor: "var(--line-2)" }}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
          {/* you give */}
          <div className="min-w-0 text-left">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[color:var(--muted)] sm:text-[10px]">You give</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums text-[color:var(--text)] sm:text-2xl [font-family:var(--font-data)]">{fmt(youDisplay)}</div>
            {premium && <div className="text-[10px] tabular-nums text-[color:var(--muted)] sm:text-[11px]">adj. {fmt(Math.round(calc.youAdj))}</div>}
          </div>
          {/* verdict */}
          <div className="text-center">
            <span
              className="ptrc-verdict inline-block rounded-full border px-3 py-1.5 text-[12px] font-bold sm:px-6 sm:py-2 sm:text-base [font-family:var(--font-display)]"
              style={{ color: verdictColor, borderColor: verdictColor, background: "rgba(168,139,250,0.06)" }}
              aria-live="polite"
            >
              {verdictText}
            </span>
            <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-wider text-[color:var(--muted)] sm:text-[11px]">
              {premium ? <>Value <span className="text-[color:var(--lilac)]">+</span> Demand <Heart filled size={9} /></> : "By value"}
            </p>
          </div>
          {/* you receive */}
          <div className="min-w-0 text-right">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[color:var(--muted)] sm:text-[10px]">You receive</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums text-[color:var(--text)] sm:text-2xl [font-family:var(--font-data)]">{fmt(themDisplay)}</div>
            {premium && <div className="text-[10px] tabular-nums text-[color:var(--muted)] sm:text-[11px]">adj. {fmt(Math.round(calc.themAdj))}</div>}
          </div>
        </div>

        {/* ── VALUE bar (free — raw values only) ── */}
        <div className="mt-5">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--text)]">Value</span>
            {!calc.empty && (
              <>
                <span className="text-[11px] text-[color:var(--muted)]" aria-hidden="true">&middot;</span>
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: verdictColorOf(calc.rawVerdict) }}>
                  {calc.rawVerdict}
                </span>
              </>
            )}
          </div>
          <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
            <span style={{ color: "var(--down)" }}>Lose</span>
            <span style={{ color: "var(--lilac)" }}>Fair</span>
            <span style={{ color: "var(--up)" }}>Win</span>
          </div>
          <div className="relative h-3 rounded-full" style={{ background: "linear-gradient(to right, var(--down), var(--lilac) 50%, var(--up))", opacity: calc.empty ? 0.35 : 1 }}>
            <span className="absolute top-[-3px] h-[18px] w-px bg-[rgba(255,255,255,0.35)]" style={{ left: "45%" }} aria-hidden="true" />
            <span className="absolute top-[-3px] h-[18px] w-px bg-[rgba(255,255,255,0.35)]" style={{ left: "55%" }} aria-hidden="true" />
            {!calc.empty && (
              <span
                className="ptrc-marker absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                style={{ left: `${calc.meterPosRaw}%`, background: verdictColorOf(calc.rawVerdict), boxShadow: `0 0 12px ${verdictColorOf(calc.rawVerdict)}` }}
                aria-hidden="true"
              />
            )}
          </div>
        </div>

        {/* ── DEMAND bar (Premium — the demand-adjusted "true" verdict) ── */}
        <div className="mt-5">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[color:var(--lilac)]">
              Demand verdict <Heart filled size={10} />
              <span className="rounded-full border border-[color:var(--line-2)] px-1.5 py-px text-[9px] font-bold tracking-wider text-[color:var(--lilac)]" style={{ background: "rgba(168,85,247,0.12)" }}>
                Premium
              </span>
            </span>
            {premium && !calc.empty && (
              <>
                <span className="text-[11px] text-[color:var(--muted)]" aria-hidden="true">&middot;</span>
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: verdictColorOf(calc.verdict) }}>
                  {calc.verdict}
                </span>
              </>
            )}
          </div>

          {!authChecked ? (
            <Skel className="h-[46px] w-full rounded-xl" />
          ) : premium ? (
            <>
              <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                <span style={{ color: "#7C3AED" }}>Lose</span>
                <span style={{ color: "var(--lilac)" }}>Fair</span>
                <span style={{ color: "#E9D5FF" }}>Win</span>
              </div>
              <div className="relative h-3 rounded-full" style={{ background: "linear-gradient(to right, #4C1D95, #8B5CF6 50%, #DDD6FE)", opacity: calc.empty ? 0.35 : 1 }}>
                <span className="absolute top-[-3px] h-[18px] w-px bg-[rgba(255,255,255,0.35)]" style={{ left: "45%" }} aria-hidden="true" />
                <span className="absolute top-[-3px] h-[18px] w-px bg-[rgba(255,255,255,0.35)]" style={{ left: "55%" }} aria-hidden="true" />
                {!calc.empty && (
                  <span
                    className="ptrc-marker absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                    style={{ left: `${calc.meterPos}%`, background: verdictColorOf(calc.verdict), boxShadow: `0 0 12px ${verdictColorOf(calc.verdict)}` }}
                    aria-hidden="true"
                  />
                )}
              </div>
              {calc.demandNote && (
                <div className="ptrc-pop mt-3 flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "rgba(168,139,250,0.07)", border: "1px solid var(--line-2)" }}>
                  <span
                    className="grid h-9 w-9 flex-none place-items-center rounded-lg"
                    style={{ background: "rgba(168,85,247,0.14)", border: "1px solid var(--line-2)" }}
                    aria-hidden="true"
                  >
                    <Heart filled size={16} />
                  </span>
                  <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-[color:var(--text)]">{calc.demandNote}</p>
                </div>
              )}
            </>
          ) : (
            <div className="relative overflow-hidden rounded-xl">
              {/* blurred decoy bar — static, no real data */}
              <div className="pointer-events-none select-none blur-[6px] px-1 py-2" aria-hidden="true">
                <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                  <span style={{ color: "#7C3AED" }}>Lose</span>
                  <span style={{ color: "var(--lilac)" }}>Fair</span>
                  <span style={{ color: "#E9D5FF" }}>Win</span>
                </div>
                <div className="relative h-3 rounded-full" style={{ background: "linear-gradient(to right, #4C1D95, #8B5CF6 50%, #DDD6FE)" }}>
                  <span className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: "62%", background: "#A855F7" }} />
                </div>
              </div>
              {/* lock overlay */}
              <div
                className="absolute inset-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 text-center"
                style={{ background: "linear-gradient(to bottom, rgba(10,6,20,0.35), rgba(10,6,20,0.65))" }}
              >
                <span className="grid h-7 w-7 flex-none place-items-center rounded-lg text-[color:var(--lilac)]" style={{ background: "rgba(168,139,250,0.14)", border: "1px solid var(--line-2)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                </span>
                <p className="text-[13px] font-semibold text-[color:var(--text)]">
                  Does this trade <em>actually</em> win? The demand verdict knows.
                </p>
                <Link
                  href="/premium"
                  className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold text-[#1a1030] shadow-[0_8px_24px_-10px_rgba(168,85,247,0.8)] transition hover:brightness-110 active:scale-95 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
                >
                  Unlock with Premium
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* the two boards, always side by side (like the in-game trade window),
          with VS + the value difference in the narrow middle column */}
      <div className="ptrc-reveal mt-5 flex items-stretch sm:mt-6" style={{ animationDelay: "120ms" }}>
        {renderBoard("you", you, "Your offer", youDisplay)}
        <div className="flex flex-none flex-col items-center justify-center gap-1.5 px-1 sm:gap-2.5 sm:px-3">
          <span
            className="grid h-8 w-8 flex-none place-items-center rounded-full border text-[10px] font-bold text-[#1a1030] shadow-[0_8px_24px_-8px_rgba(168,85,247,0.7)] sm:h-11 sm:w-11 sm:text-[13px] [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
            style={{ borderColor: "var(--line-2)" }}
            aria-hidden="true"
          >
            VS
          </span>
          {!calc.empty && (() => {
            // raw value difference: + = they're overpaying you, − = you're overpaying them
            const diff = Math.round(calc.themRaw - calc.youRaw);
            if (diff === 0) {
              return (
                <div className="w-[52px] text-center sm:w-auto">
                  <div className="text-[13px] font-bold tabular-nums text-[color:var(--lilac)] sm:text-lg [font-family:var(--font-data)]">0</div>
                  <div className="text-[8.5px] font-semibold uppercase leading-tight tracking-wider text-[color:var(--muted)] sm:text-[10px]">Dead even</div>
                </div>
              );
            }
            const up = diff > 0;
            return (
              <div className="w-[52px] text-center sm:w-auto" aria-live="polite">
                <div className="text-[13px] font-bold tabular-nums sm:text-xl [font-family:var(--font-data)]" style={{ color: up ? "var(--up)" : "var(--down)" }}>
                  {up ? "+" : "\u2212"}{fmt(Math.abs(diff))}
                </div>
                <div className="text-[8.5px] font-semibold uppercase leading-tight tracking-wider sm:text-[10px]" style={{ color: up ? "var(--up)" : "var(--down)" }}>
                  {up ? "They overpay" : "You overpay"}
                </div>
              </div>
            );
          })()}
        </div>
        {renderBoard("them", them, "Their offer", themDisplay)}
      </div>

      {(you.length > 0 || them.length > 0) && (
        <div className="ptrc-reveal mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={swapSides}
            className="rounded-full border border-[color:var(--line-2)] px-5 py-2 text-[13px] font-semibold text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)] active:scale-95"
          >
            &#8644; Swap sides
          </button>
          <button
            onClick={() => { setYou([]); setThem([]); }}
            className="rounded-full border border-[color:var(--line-2)] px-5 py-2 text-[13px] font-semibold text-[color:var(--muted)] transition hover:text-[color:var(--text)] hover:bg-[rgba(168,139,250,0.08)] active:scale-95"
          >
            Clear both sides
          </button>
        </div>
      )}

      {/* how the verdict works + attribution */}
      <div className="petora-card ptrc-reveal mt-8 p-4 text-[13px] sm:p-5 leading-relaxed text-[color:var(--muted)]" style={{ animationDelay: "180ms" }}>
        <p className="mb-2 font-semibold text-[color:var(--text)] [font-family:var(--font-display)]">Why value alone isn&apos;t enough</p>
        <p>
          A pet&apos;s value tells you what it&apos;s <em>listed</em> at. Demand tells you whether anyone
          will actually give you that. Two trades can be identical on paper while one leaves you
          with pets that fly out of your inventory and the other leaves you stuck for weeks.
        </p>
        <p className="mt-2">
          So Petora shows two verdicts. The <span className="font-semibold text-[color:var(--text)]">Value bar</span> (free)
          compares raw listed values. The <span className="font-semibold text-[color:var(--lilac)]">Demand verdict</span>{" "}
          (Premium) re-weighs every pet by its demand — High <span className="whitespace-nowrap">(<Heart filled size={10} /><Heart filled size={10} /><Heart filled size={10} />)</span>{" "}
          counts in full, Medium ×0.95, Low ×0.85 — and tells you whether the trade <em>actually</em> wins,
          with a plain-English explanation whenever demand changes the answer. Within ±5% is Fair
          either way. It&apos;s the closest thing to how experienced traders actually think —
          but it&apos;s still a guide, not a guarantee: the market is people, and people surprise you.
        </p>
        <p className="mt-3 border-t border-[color:var(--line)] pt-3">
          Pet values are sourced from{" "}
          <a href="https://elvebredd.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-[color:var(--lilac)] underline decoration-[rgba(168,139,250,0.4)] underline-offset-2 hover:decoration-[color:var(--lilac)]">
            Elvebredd
          </a>{" "}
          and demand ratings from AMVGG. Petora is not affiliated with or endorsed by either site.
        </p>
      </div>

      {/* ── picker modal (quick-add, stays open) ── */}
      {pickerSide && (
        <div
          onClick={closePicker}
          className="ptrc-backdrop fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5"
          style={{ background: "rgba(5,3,12,0.72)", backdropFilter: "blur(4px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Add pets to the trade"
            className="petora-card ptrc-modal flex h-[92vh] w-full max-w-3xl flex-col overflow-hidden p-3 sm:h-auto sm:max-h-[88vh] sm:p-5"
            style={{ borderColor: "var(--line-2)", boxShadow: "0 30px 80px -30px rgba(124,58,237,0.6)" }}
          >
            {/* header: side + live count + close */}
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-[color:var(--text)] [font-family:var(--font-display)]">
                  {pickerSide === "you" ? "Your offer" : "Their offer"}
                </h2>
                <span
                  className="rounded-full border px-2.5 py-0.5 text-[12px] font-bold tabular-nums"
                  style={sideFull
                    ? { borderColor: "var(--down)", color: "var(--down)", background: "rgba(251,113,133,0.10)" }
                    : { borderColor: "var(--line-2)", color: "var(--muted)" }}
                  aria-live="polite"
                >
                  {sideList.length}/{MAX_PER_SIDE}
                </span>
              </div>
              <button onClick={closePicker} aria-label="Done — close" className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)] active:scale-90">&times;</button>
            </div>

            {sideFull && (
              <div className="ptrc-pop mb-3 rounded-xl px-4 py-2.5 text-center text-[13px] font-semibold" style={{ background: "rgba(251,113,133,0.10)", border: "1px solid var(--down)", color: "var(--down)" }}>
                Limit reached — {MAX_PER_SIDE} pets on this side. Remove some from the board, or close this to see the verdict.
              </div>
            )}

            {/* category pills + search */}
            <div className="mb-3 flex flex-wrap gap-2">
              {([["pet", "Pets"], ["egg", "Eggs"], ["pet_wear", "Pet Wear"]] as [Category, string][]).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setPickCat(k)}
                  className={`rounded-full px-3.5 py-1 text-[13px] font-semibold transition active:scale-95 ${
                    pickCat === k
                      ? "text-[#1a1030] [background-image:var(--ramp-h)]"
                      : "border border-[color:var(--line)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <input
              autoFocus
              placeholder={"Search\u2026 (sorted by value, highest first)"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-2.5 w-full rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)] px-3.5 py-2 text-[14.5px] sm:mb-3 sm:px-4 sm:py-2.5 sm:text-[15px] text-[color:var(--text)] outline-none transition placeholder:text-[color:var(--muted)] focus:border-[color:var(--violet)] focus:shadow-[0_0_0_3px_rgba(168,85,247,0.15)]"
            />

            {/* tile grid — the whole catalog, biggest value first, infinite scroll */}
            <div ref={pickerScrollRef} onScroll={onPickerScroll} className="ptrc-scroll min-h-0 flex-1 overflow-y-auto pr-1">
              {catalogLoading ? (
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 sm:gap-2">
                  {Array.from({ length: 10 }).map((_, i) => <Skel key={i} className="h-[104px] rounded-xl" />)}
                </div>
              ) : pickerFiltered.length === 0 ? (
                <p className="py-10 text-center text-[color:var(--muted)]">No matches — try a different name.</p>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 sm:gap-2">
                    {pickerList.map((c) => {
                      const isFlash = flash?.id === c.id;
                      const isPending = pendingId === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => quickAdd(c)}
                          disabled={sideFull || (c.category !== "pet" && c.baseValue == null)}
                          className={`relative rounded-xl border border-[color:var(--line)] p-2 text-center transition hover:border-[color:var(--violet)] hover:bg-[rgba(168,85,247,0.08)] active:scale-95 disabled:opacity-40 disabled:hover:border-[color:var(--line)] disabled:hover:bg-transparent ${
                            isFlash ? (flash!.ok ? "ptrc-flash-ok" : "ptrc-flash-bad") : ""
                          }`}
                        >
                          {c.icon_url && <img src={c.icon_url} alt={c.name} className="mx-auto h-12 w-12 object-contain" loading="lazy" decoding="async" />}
                          <div className="mt-1 truncate text-[11px] font-semibold text-[color:var(--text)]">{c.name}</div>
                          <div className="text-[11px] font-bold tabular-nums text-[color:var(--lilac)] [font-family:var(--font-data)]">
                            {c.baseValue != null ? fmt(c.baseValue) : "\u2014"}
                          </div>
                          <div className="flex items-center justify-center">
                            <DemandHearts level={c.demand} size={8} />
                          </div>
                          {isPending && (
                            <span className="absolute inset-0 grid place-items-center rounded-xl" style={{ background: "rgba(10,6,20,0.45)" }}>
                              <Skel className="h-4 w-10" />
                            </span>
                          )}
                          {isFlash && flash!.ok && (
                            <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold text-[#0a1a10]" style={{ background: "var(--up)" }} aria-hidden="true">✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {pickerVisible < pickerFiltered.length && (
                    <p className="py-3 text-center text-[12px] text-[color:var(--muted)]">
                      Scroll for more &middot; {pickerFiltered.length - pickerVisible} left
                    </p>
                  )}
                </>
              )}
            </div>

            {/* variant toggle bar — pick the variation, then tap pets to add it */}
            <div className="mt-2.5 border-t border-[color:var(--line)] pt-2.5 sm:mt-3 sm:pt-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
                  {togglePill("Fly", selFly, () => setSelFly((v) => !v), pickCat !== "pet", BADGE_META.F.bg, BADGE_META.F.fg)}
                  {togglePill("Ride", selRide, () => setSelRide((v) => !v), pickCat !== "pet", BADGE_META.R.bg, BADGE_META.R.fg)}
                  {togglePill("Neon", selTier === "neon", () => setSelTier((t) => (t === "neon" ? "normal" : "neon")), pickCat !== "pet", BADGE_META.N.bg, BADGE_META.N.fg)}
                  {togglePill("Mega", selTier === "mega", () => setSelTier((t) => (t === "mega" ? "normal" : "mega")), pickCat !== "pet", BADGE_META.M.bg, BADGE_META.M.fg)}
                </div>
                <span className="text-center text-[12px] font-semibold text-[color:var(--muted)] sm:text-right">
                  Adding as: <span className="text-[color:var(--lilac)]">{pickCat === "pet" ? variantLabel(selTier, selFly, selRide) : "Normal"}</span>
                </span>
              </div>
              <p className="mt-1.5 hidden text-[11.5px] text-[color:var(--muted)] sm:block">
                Toggle a variation, then tap pets to add them — keep tapping to build the whole offer. Tap &times; when you&apos;re done.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}