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
  baseValue: number | null; // Normal / No-Potion value on the DISPLAYED source
  highTier: boolean;        // pet's NORMAL FLY & RIDE Elvebredd value >= HIGH_TIER_ELVE
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
  highTier: boolean;   // this exact variant is >= HIGH_TIER_ELVE on Elvebredd
};

// 18 pets per side; the board shows 3×3 and scrolls for the rest.
const MAX_PER_SIDE = 18;
const MIN_CELLS = 9;
// Max copies you can add in ONE Select. Capped at 9 deliberately: nobody adds
// 18 of the same pet, and a shorter list keeps the dropdown compact.
const MAX_QTY = 9;

// ── Demand → tradeability multiplier ─────────────────────────────────────────
// Demand (1–3, scraped from AMVGG) discounts a pet's *practical* trade value:
// a low-demand pet is worth less in the real trading market than its listed
// value because it's harder to move. Unrated pets get no penalty — missing
// data isn't low demand.
//
// These are trader heuristics, not measured market data. They're deliberately
// firm: a 1-heart pet routinely sits in inventory for weeks, so treating it as
// "worth 85% of list" was far too generous — it let a pile of junk read as a
// fair swap for one clean, in-demand pet.
const MAX_DEMAND = 3;
const DEMAND_MULT: Record<number, number> = { 1: 0.70, 2: 0.90, 3: 1.0 };
const DEMAND_LABELS = ["", "Low", "Medium", "High"] as const;

// ── High tier ────────────────────────────────────────────────────────────────
// A "high tier" is a pet whose NORMAL FLY & RIDE value on Elvebredd is at or
// above 100 — the pets every trader actively wants. They move fast regardless of
// what a demand list says, so a low demand rating shouldn't discount them the
// way it discounts a common.
//
// Two things this is deliberately NOT:
//   - NOT the placed variant's value. A 20-value pet that reaches 100 as a Mega
//     is a cheap pet with an expensive form, not a high tier. The rating belongs
//     to the PET and applies to every variant of it equally.
//   - NOT measured on AMVGG, even when the user is viewing AMVGG prices. High
//     tier is a property of the pet, not of the scale you read it on, and
//     hardcoding an AMVGG-equivalent threshold would mean guessing a conversion
//     ratio that drifts every time either list updates.
//
// Normal Fly & Ride is the same canonical variant get_movers uses, so "what is
// this pet worth" means the same thing across the site. (The catalog GRID still
// displays Normal / No-Potion — that difference is intentional, invariant #6.)
const HIGH_TIER_ELVE = 100;
// A high-tier pet's demand rating is treated as this much higher (capped at
// MAX_DEMAND) before the multiplier applies. +1 turns a 1-heart high tier from
// x0.70 into x0.90, and a 2-heart into x1.0. Tune against trades you already
// know the answer to.
const HIGH_TIER_DEMAND_BUMP = 1;

// Demand rating AFTER the high-tier bump. null (unrated) stays null — missing
// data still isn't low demand.
const effectiveDemand = (d: number | null, highTier: boolean): number | null => {
  if (d == null) return null;
  return highTier ? Math.min(MAX_DEMAND, d + HIGH_TIER_DEMAND_BUMP) : d;
};

const demandMult = (d: number | null, highTier = false) => {
  const eff = effectiveDemand(d, highTier);
  return eff != null && DEMAND_MULT[eff] != null ? DEMAND_MULT[eff] : 1.0;
};

// ── Offer shape ("many small pets for one big pet") ──────────────────────────
// Independent of demand: a side stacking far more pets than the other is worth
// less than its raw total, because the receiver ends up holding clutter and
// gives up a clean 1-for-1. Traders expect multi-pet offers to overpay. Only
// the side with MORE pets is penalized, 2% per extra pet, capped at 12%.
// NOTE: quantity counts here — adding 3 copies of a pet is 3 pets.
const SPREAD_PER_PET = 0.02;
const SPREAD_CAP = 0.12;
const spreadFactor = (mine: number, theirs: number) =>
  1 - Math.min(SPREAD_CAP, Math.max(0, mine - theirs) * SPREAD_PER_PET);

// Verdict thresholds on the demand-adjusted totals: within ±FAIR_BAND = Fair.
const FAIR_BAND = 0.05;

// ── VALUE SOURCE ─────────────────────────────────────────────────────────────
// pet_values holds BOTH Elvebredd and AMVGG rows, and current_pet_values
// returns one row per (variant, source). Every value read MUST pick a source
// explicitly — without it, current_pet_values[0] grabs whichever row comes
// back first and the calculator silently mixes two completely different
// scales (a Frost Dragon is thousands on Elvebredd, 1.675 on AMVGG Baseless).
//
// Read from profiles.value_source; anonymous visitors get Elvebredd.
type ValueSource = "elvebredd" | "amvgg";
const DEFAULT_SOURCE: ValueSource = "elvebredd";

const SOURCE_META: Record<ValueSource, { label: string; accent: string; site: string }> = {
  elvebredd: { label: "Elvebredd", accent: "168,85,247", site: "https://elvebredd.com" },
  amvgg:     { label: "AMVGG",     accent: "56,189,248", site: "https://amvgg.com" },
};

// Pull the value for `source` out of an embedded current_pet_values array.
const pickValue = (rows: any, source: ValueSource): number | null => {
  if (!Array.isArray(rows)) return null;
  const hit = rows.find((r: any) => r?.source === source);
  return hit?.value == null ? null : Number(hit.value);
};

const FETCH_PAGE = 1000;
// picker renders in slices as you scroll — keeps the DOM light with 750+ tiles
const PICKER_PAGE = 48;

// Free users get this many Demand-verdict reveals per day. The limit is
// enforced SERVER-SIDE (get_demand_status / spend_demand_check RPCs), tied to
// the account so it can't be reset by switching browsers or clearing storage.
// This constant is only a UI fallback label; the server is the source of truth.
const FREE_DEMAND_PER_DAY = 3;

// Values carry decimals (a Turtle is 22.5, not 23) — never round them away.
// Up to 2 decimal places, trailing zeros dropped, thousands separated.
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });
const round2 = (n: number) => Math.round(n * 100) / 100;

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
      setDisplay(round2(from + (target - from) * eased));
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

  // Demand-bar gate. The daily free-check limit is enforced SERVER-SIDE and
  // read on load via get_demand_status(); revealing spends one via
  // spend_demand_check(). remaining=null means unlimited (premium).
  const [premium, setPremium] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [demandRemaining, setDemandRemaining] = useState<number | null>(0); // null = unlimited
  const [demandShown, setDemandShown] = useState(false); // revealed this session
  const [revealBusy, setRevealBusy] = useState(false);
  // null = preference not resolved yet; the picker waits for it rather than
  // showing Elvebredd prices that then swap to AMVGG.
  const [valueSource, setValueSource] = useState<ValueSource | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles").select("value_source").eq("id", uid).single();
        setValueSource(prof?.value_source === "amvgg" ? "amvgg" : DEFAULT_SOURCE);
      } else {
        setValueSource(DEFAULT_SOURCE);
      }
      const { data: status } = await supabase.rpc("get_demand_status");
      if (status) {
        setPremium(!!status.premium);
        setDemandRemaining(status.premium ? null : (status.remaining ?? 0));
      }
      setAuthChecked(true);
    })();
  }, []);

  const [you, setYou] = useState<CalcItem[]>([]);
  const [them, setThem] = useState<CalcItem[]>([]);
  const uidRef = useRef(1);

  // picker modal state
  const [pickerSide, setPickerSide] = useState<"you" | "them" | null>(null);
  const [search, setSearch] = useState("");
  const [pickCat, setPickCat] = useState<Category>("pet");
  const [pickerVisible, setPickerVisible] = useState(PICKER_PAGE);
  const pickerScrollRef = useRef<HTMLDivElement | null>(null);

  // ── item-detail modal (tap a pet → choose variant + quantity → Select) ────
  // Defaults to Fly & Ride on EVERY open (the most-traded form). This replaces
  // the old persistent global toggle bar in the picker footer — deliberate
  // product change: the toggles used to persist across opens, they no longer do.
  const [detail, setDetail] = useState<CatalogItem | null>(null);
  const [dTier, setDTier] = useState<TierKey>("normal");
  const [dFly, setDFly] = useState(true);
  const [dRide, setDRide] = useState(true);
  const [dQty, setDQty] = useState(1);
  const [qtyOpen, setQtyOpen] = useState(false);
  // undefined = still resolving, null = no value exists for this variant
  const [dValue, setDValue] = useState<number | null | undefined>(undefined);

  // Cache of variant values so re-toggling back and forth doesn't refetch.
  // Key = `${petId}|${tier}|${fly}|${ride}`.
  const [variantValues, setVariantValues] = useState<Map<string, number | null>>(new Map());
  const vkey = (id: number, t: TierKey, f: boolean, r: boolean) => `${id}|${t}|${f}|${r}`;

  // ── load the catalog once (paginated past the 1,000-row REST cap) ─────────
  // The sort key must be UNIQUE for .range() paging to be stable: this query
  // spans all three categories and Elvebredd reuses names across categories,
  // so name alone can duplicate rows across pages. name+id is unique; the Map
  // dedupes as a second line of defense.
  useEffect(() => {
    if (valueSource == null) return; // wait for the preference
    let cancelled = false;
    async function load() {
      setCatalogLoading(true);
      const byId = new Map<number, any>();
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("pets")
          .select(`id, name, rarity, icon_url, category, demand,
            pet_variants!inner ( neon, fly, ride, current_pet_values ( value, source ) )`)
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

      // ── which pets are HIGH TIER ──────────────────────────────────────
      // High tier is the pet's NORMAL FLY & RIDE value on Elvebredd, which the
      // query above doesn't fetch (it pulls Normal / No-Potion for the grid).
      // So: one extra paginated pass over the Fly & Ride variants, Elvebredd
      // rows only. ~760 rows, but paginated anyway — REST caps every select at
      // 1,000 regardless of the limit asked for, and ordering by a unique key
      // (pet_id) keeps .range() paging stable.
      const highTierIds = new Set<number>();
      let hFrom = 0;
      while (true) {
        const { data: hv, error: hErr } = await supabase
          .from("pet_variants")
          .select("pet_id, current_pet_values ( value, source )")
          .eq("neon", "normal")
          .eq("fly", true)
          .eq("ride", true)
          .order("pet_id")
          .range(hFrom, hFrom + FETCH_PAGE - 1);
        if (cancelled) return;
        if (hErr) { console.error(hErr); break; } // degrade: nothing marked high tier
        for (const row of hv ?? []) {
          const elve = pickValue((row as any).current_pet_values, "elvebredd");
          if (elve != null && elve >= HIGH_TIER_ELVE) highTierIds.add((row as any).pet_id);
        }
        if (!hv || hv.length < FETCH_PAGE) break;
        hFrom += FETCH_PAGE;
      }

      setCatalog([...byId.values()].map((p: any) => ({
        id: p.id, name: p.name, rarity: p.rarity, icon_url: p.icon_url,
        category: (p.category ?? "pet") as Category,
        demand: p.demand ?? null,
        baseValue: pickValue(p.pet_variants?.[0]?.current_pet_values, valueSource!),
        highTier: highTierIds.has(p.id),
      })));
      setCatalogLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [valueSource]);

  const sideList = pickerSide === "you" ? you : them;
  const slotsLeft = pickerSide == null ? 0 : MAX_PER_SIDE - sideList.length;
  const sideFull = pickerSide != null && slotsLeft <= 0;
  const qtyMax = Math.max(1, Math.min(MAX_QTY, slotsLeft));

  function closePicker() {
    setPickerSide(null);
    setDetail(null);
    setQtyOpen(false);
  }

  // esc closes the qty list, then the detail modal, then the picker.
  // Also locks body scroll while the picker is open.
  useEffect(() => {
    if (!pickerSide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (qtyOpen) setQtyOpen(false);
      else if (detail) setDetail(null);
      else closePicker();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [pickerSide, detail, qtyOpen]);

  // ── Re-lock the demand verdict when the trade is cleared ───────────────
  // A reveal buys ONE trade, not a session. Previously demandShown stayed true
  // until a refresh, so a free user could reveal once, clear the boards, and
  // read unlimited verdicts without spending another check — the daily limit was
  // only enforced on page load.
  //
  // Clearing both sides ends the trade, so the verdict re-locks and the next
  // reveal spends another server-side check. Tweaking a trade in place (adding
  // or removing a pet while something is still on the board) deliberately does
  // NOT re-lock — that's the affordance the reveal is meant to buy.
  useEffect(() => {
    if (you.length === 0 && them.length === 0 && demandShown) {
      setDemandShown(false);
    }
  }, [you.length, them.length, demandShown]);

  // Switching value source invalidates everything already priced: the variant
  // cache holds old-scale numbers, and so do any pets already on the boards.
  // Mixing 4.97 and 22,000 in one total would produce a nonsense verdict.
  const prevSourceRef = useRef<ValueSource | null>(null);
  useEffect(() => {
    if (valueSource == null) return;
    if (prevSourceRef.current != null && prevSourceRef.current !== valueSource) {
      setVariantValues(new Map());
      setYou([]);
      setThem([]);
    }
    prevSourceRef.current = valueSource;
  }, [valueSource]);

  // search / category change → back to the first slice, scrolled to top
  useEffect(() => {
    setPickerVisible(PICKER_PAGE);
    pickerScrollRef.current?.scrollTo({ top: 0 });
  }, [search, pickCat]);

  function openPicker(side: "you" | "them") {
    setPickerSide(side);
    setSearch("");
    setPickerVisible(PICKER_PAGE);
    setDetail(null);
  }

  // Tap a tile → open the detail modal, defaulting to Fly & Ride for pets.
  function openDetail(c: CatalogItem) {
    if (sideFull) return;
    const isPet = c.category === "pet";
    setDetail(c);
    setDTier("normal");
    setDFly(isPet);
    setDRide(isPet);
    setDQty(1);
    setDValue(undefined);
  }

  // Resolve the value of the exact variant currently selected in the detail
  // modal. Normal / No-Potion (and every non-pet) is already loaded as
  // baseValue — no query needed.
  useEffect(() => {
    if (!detail) return;
    const isPet = detail.category === "pet";
    const t: TierKey = isPet ? dTier : "normal";
    const f = isPet ? dFly : false;
    const r = isPet ? dRide : false;

    // Normal / No-Potion (and every non-pet) is already loaded from the catalog
    if (!isPet || (t === "normal" && !f && !r)) { setDValue(detail.baseValue); return; }
    const k = vkey(detail.id, t, f, r);
    if (variantValues.has(k)) { setDValue(variantValues.get(k) ?? null); return; }

    let cancelled = false;
    setDValue(undefined);
    (async () => {
      const { data } = await supabase
        .from("pet_variants")
        .select("id, current_pet_values ( value, source )")
        .eq("pet_id", detail.id)
        .eq("neon", t)
        .eq("fly", f)
        .eq("ride", r)
        .limit(1);
      if (cancelled) return;
      const v = pickValue((data?.[0] as any)?.current_pet_values, valueSource!);
      setVariantValues((prev) => new Map(prev).set(k, v));
      setDValue(v);
    })();
    return () => { cancelled = true; };
  }, [detail, dTier, dFly, dRide, valueSource]);

  // clamp quantity if the side fills up while the modal is open
  useEffect(() => {
    if (detail && dQty > qtyMax) setDQty(qtyMax);
  }, [detail, qtyMax, dQty]);

  // close the qty list whenever the detail modal opens/closes
  useEffect(() => { setQtyOpen(false); }, [detail]);

  // Select → add `dQty` copies, then TAB OUT of both modals. Adding another
  // pet means pressing the + slot again (per the redesign).
  function confirmSelect() {
    if (!detail || !pickerSide || dValue == null || dValue === undefined) return;
    const isPet = detail.category === "pet";
    const t: TierKey = isPet ? dTier : "normal";
    const f = isPet ? dFly : false;
    const r = isPet ? dRide : false;

    const room = MAX_PER_SIDE - sideList.length;
    const n = Math.max(0, Math.min(dQty, room));
    if (n === 0) return;

    // High tier belongs to the PET (its Normal Fly & Ride Elvebredd value), so
    // every variant of a high-tier pet carries the flag and no variant of a
    // cheap pet earns it.
    const entries: CalcItem[] = Array.from({ length: n }, () => ({
      uid: uidRef.current++, item: detail, tier: t, fly: f, ride: r, value: dValue,
      highTier: detail.highTier,
    }));

    if (pickerSide === "you") setYou((s) => [...s, ...entries].slice(0, MAX_PER_SIDE));
    else setThem((s) => [...s, ...entries].slice(0, MAX_PER_SIDE));

    setDetail(null);
    setPickerSide(null);
    setQtyOpen(false);
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
    const sumAdj = (list: CalcItem[]) =>
      list.reduce((a, i) => a + i.value * demandMult(i.item.demand, i.highTier), 0);

    const youRaw = sum(you);
    const themRaw = sum(them);

    // demand weighting, then the offer-shape penalty on whichever side is
    // stacking more pets
    const youSpread = spreadFactor(you.length, them.length);
    const themSpread = spreadFactor(them.length, you.length);
    const youAdj = sumAdj(you) * youSpread;
    const themAdj = sumAdj(them) * themSpread;

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

    // ── explain WHY the demand verdict differs from raw value ──────────────
    // Count on EFFECTIVE demand — a high-tier pet bumped up to 2 hearts is no
    // longer being penalised, so calling it "low demand" in the explanation
    // would contradict the maths above it.
    const lowIncoming = them.filter((i) => effectiveDemand(i.item.demand, i.highTier) === 1).length;
    const lowOutgoing = you.filter((i) => effectiveDemand(i.item.demand, i.highTier) === 1).length;
    const bumped = [...you, ...them].filter(
      (i) => i.highTier && i.item.demand != null && i.item.demand < MAX_DEMAND
    ).length;
    const themStacking = them.length - you.length; // >0 → they're the multi-pet side
    const reasons: string[] = [];
    if (!empty) {
      if (lowIncoming > 0) {
        reasons.push(`${lowIncoming} of the ${them.length} pet${them.length === 1 ? "" : "s"} you'd receive ${lowIncoming === 1 ? "is" : "are"} low demand (hard to re-trade)`);
      }
      if (lowOutgoing > 0) {
        reasons.push(`${lowOutgoing} of the pets you'd give away ${lowOutgoing === 1 ? "is" : "are"} low demand, which costs you less than the sticker price`);
      }
      if (bumped > 0) {
        reasons.push(`${bumped} high-tier pet${bumped === 1 ? "" : "s"} (${HIGH_TIER_ELVE}+ on Elvebredd) ${bumped === 1 ? "was" : "were"} counted as more in-demand than ${bumped === 1 ? "its" : "their"} rating suggests — top pets move fast whatever the list says`);
      }
      if (themStacking >= 2) {
        reasons.push(`they're sending ${them.length} pets for your ${you.length} — multi-pet offers are expected to overpay, since you're the one giving up a clean trade`);
      } else if (themStacking <= -2) {
        reasons.push(`you're sending ${you.length} pets for their ${them.length} — stacking small pets counts for a little less than the raw total`);
      }
    }

    let demandNote: string | null = null;
    if (!empty && reasons.length) {
      const shift =
        rawVerdict === verdict
          ? null
          : `${rawVerdict === "win" ? "A Win on raw value" : rawVerdict === "lose" ? "A Lose on raw value" : "A Fair trade on raw value"} becomes ${verdict === "win" ? "a Win" : verdict === "lose" ? "a Lose" : "Fair"} once demand is counted`;
      const body = reasons.join("; and ");
      demandNote = shift ? `${shift} — ${body}.` : `Worth knowing: ${body}.`;
    }

    return { youRaw, themRaw, youAdj, themAdj, ratioAdj, verdict, rawVerdict, meterPos, meterPosRaw, demandNote, empty };
  }, [you, them]);

  const youDisplay = useCountUp(calc.youRaw);
  const themDisplay = useCountUp(calc.themRaw);

  // Headline verdict: VALUE-only until the demand bar is unlocked (premium, or
  // a free user who spent a try), then it upgrades to the demand-adjusted
  // "true" verdict. Showing the adjusted one before unlock would give away
  // exactly what the reveal is for.
  const headlineIsDemand = premium || demandShown;
  const headlineVerdict = headlineIsDemand ? calc.verdict : calc.rawVerdict;
  const verdictColorOf = (v: "win" | "fair" | "lose") =>
    v === "win" ? "var(--up)" : v === "lose" ? "var(--down)" : "var(--lilac)";
  const verdictTextOf = (v: "win" | "fair" | "lose") =>
    v === "win" ? "WIN for you" : v === "lose" ? "LOSE for you" : "FAIR trade";
  const verdictColor = verdictColorOf(headlineVerdict);
  const verdictText = calc.empty ? "Add pets to both sides" : verdictTextOf(headlineVerdict);

  // Demand-bar access. Premium sees it always (remaining === null). A free
  // user reveals it by spending one server-side check; once revealed it stays
  // visible for the session so they can keep tweaking the trade. The SERVER
  // decides whether a spend is allowed — the client just calls and obeys.
  const demandVisible = premium || demandShown;
  const freeRemaining = demandRemaining ?? 0;

  async function revealDemand() {
    if (premium || demandShown || revealBusy || calc.empty) return;
    setRevealBusy(true);
    try {
      const { data, error } = await supabase.rpc("spend_demand_check");
      if (!error && data?.allowed) {
        setDemandShown(true);
        setDemandRemaining(data.premium ? null : (data.remaining ?? 0));
      } else if (data && !data.allowed) {
        // server says no (limit hit on another device, etc.) — sync the count
        setDemandRemaining(0);
      }
    } finally {
      setRevealBusy(false);
    }
  }

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

  // ── variant toggle pill (detail modal) — big + color-coded ────────────────
  function togglePill(label: string, active: boolean, onClick: () => void, disabled: boolean, bg: string, fg: string) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        aria-pressed={active}
        title={label}
        className="grid h-11 w-11 place-items-center rounded-full text-[15px] font-extrabold transition active:scale-90 disabled:opacity-30 sm:h-12 sm:w-12 sm:text-base [font-family:var(--font-display)]"
        style={
          active
            ? { background: bg, color: fg, boxShadow: `0 8px 22px -8px ${bg}` }
            : { border: "1px solid var(--line-2)", color: "var(--muted)", background: "rgba(168,139,250,0.06)" }
        }
      >
        {label}
      </button>
    );
  }

  const detailIsPet = detail?.category === "pet";
  const detailVariant = detail
    ? variantLabel(detailIsPet ? dTier : "normal", detailIsPet ? dFly : false, detailIsPet ? dRide : false)
    : "";

  return (
    <main className="mx-auto max-w-5xl px-2 py-6 sm:px-6 sm:py-10">
      <style>{`
        @keyframes ptrcFade { from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:translateY(0)} }
        @keyframes ptrcPop { from{opacity:0; transform:scale(.85)} to{opacity:1; transform:scale(1)} }
        @keyframes ptrcSkelShimmer { from{background-position:200% 0} to{background-position:-200% 0} }
        @keyframes ptrcBackdrop { from{opacity:0} to{opacity:1} }
        @keyframes ptrcModalIn { from{opacity:0; transform:translateY(16px) scale(.96)} to{opacity:1; transform:translateY(0) scale(1)} }
        @keyframes ptrcDetailIn { from{opacity:0; transform:translateY(10px) scale(.92)} to{opacity:1; transform:translateY(0) scale(1)} }
        @keyframes ptrcQtyIn { from{opacity:0; transform:translateY(-6px)} to{opacity:1; transform:translateY(0)} }
        @keyframes ptrcPulseGlow { 0%,100%{box-shadow:0 0 0 0 rgba(168,85,247,0)} 50%{box-shadow:0 0 18px 2px rgba(168,85,247,0.35)} }
        @keyframes ptrcSlotGlow { 0%,100%{box-shadow:inset 0 0 0 0 rgba(168,85,247,0)} 50%{box-shadow:inset 0 0 16px 0 rgba(168,85,247,0.18)} }
        @keyframes ptrcFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .ptrc-reveal { opacity:0; animation: ptrcFade .45s cubic-bezier(.22,1,.36,1) forwards; }
        .ptrc-pop { animation: ptrcPop .25s cubic-bezier(.22,1,.36,1) both; }
        .ptrc-skel {
          background: linear-gradient(90deg, rgba(168,139,250,0.07) 25%, rgba(168,139,250,0.16) 50%, rgba(168,139,250,0.07) 75%);
          background-size: 200% 100%; animation: ptrcSkelShimmer 1.4s linear infinite;
        }
        .ptrc-backdrop { animation: ptrcBackdrop .2s ease-out both; }
        .ptrc-modal { animation: ptrcModalIn .28s cubic-bezier(.22,1,.36,1) both; }
        .ptrc-detail { animation: ptrcDetailIn .24s cubic-bezier(.22,1,.36,1) both; }
        .ptrc-qtylist { animation: ptrcQtyIn .16s ease-out both; transform-origin: top center; }
        .ptrc-float { animation: ptrcFloat 3.2s ease-in-out infinite; }
        .ptrc-plus { transition: transform .2s ease; }
        .ptrc-slot:hover .ptrc-plus { transform: scale(1.25) rotate(90deg); }
        .ptrc-glow { animation: ptrcSlotGlow 2.6s ease-in-out infinite; }
        .ptrc-marker { transition: left .5s cubic-bezier(.22,1,.36,1); }
        .ptrc-verdict { animation: ptrcPulseGlow 2.4s ease-in-out infinite; }
        .ptrc-scroll { scrollbar-width: thin; scrollbar-color: rgba(168,139,250,0.35) transparent; }
        .ptrc-scroll::-webkit-scrollbar { width: 6px; }
        .ptrc-scroll::-webkit-scrollbar-thumb { background: rgba(168,139,250,0.3); border-radius: 999px; }
        @media (prefers-reduced-motion: reduce) {
          .ptrc-reveal, .ptrc-pop, .ptrc-backdrop, .ptrc-modal, .ptrc-detail, .ptrc-qtylist { animation:none!important; opacity:1!important; transform:none!important; }
          .ptrc-skel, .ptrc-float { animation:none!important; }
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
        {valueSource && (
          <Link
            href="/settings"
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold transition hover:brightness-110 active:scale-95"
            style={{
              borderColor: `rgba(${SOURCE_META[valueSource].accent},0.5)`,
              background: `rgba(${SOURCE_META[valueSource].accent},0.10)`,
              color: `rgb(${SOURCE_META[valueSource].accent})`,
            }}
            title="Change your value source in Settings"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: `rgb(${SOURCE_META[valueSource].accent})` }} aria-hidden="true" />
            Values: {SOURCE_META[valueSource].label}
            <span className="opacity-60" aria-hidden="true">·</span>
            <span className="font-medium opacity-80">change</span>
          </Link>
        )}
      </div>

      {/* verdict panel */}
      <div className="petora-card ptrc-reveal mt-5 p-3.5 sm:mt-6 sm:p-5" style={{ animationDelay: "60ms", borderColor: "var(--line-2)" }}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
          {/* you give */}
          <div className="min-w-0 text-left">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[color:var(--muted)] sm:text-[10px]">You give</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums text-[color:var(--text)] sm:text-2xl [font-family:var(--font-data)]">{fmt(youDisplay)}</div>
            {headlineIsDemand && <div className="text-[10px] tabular-nums text-[color:var(--muted)] sm:text-[11px]">adj. {fmt(round2(calc.youAdj))}</div>}
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
              {headlineIsDemand ? <>Value <span className="text-[color:var(--lilac)]">+</span> Demand <Heart filled size={9} /></> : "By value"}
            </p>
          </div>
          {/* you receive */}
          <div className="min-w-0 text-right">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[color:var(--muted)] sm:text-[10px]">You receive</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums text-[color:var(--text)] sm:text-2xl [font-family:var(--font-data)]">{fmt(themDisplay)}</div>
            {headlineIsDemand && <div className="text-[10px] tabular-nums text-[color:var(--muted)] sm:text-[11px]">adj. {fmt(round2(calc.themAdj))}</div>}
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

        {/* ── DEMAND bar (demand-adjusted "true" verdict) ── */}
        <div className="mt-5">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[color:var(--lilac)]">
              Demand verdict <Heart filled size={10} />
            </span>
            {premium ? (
              <span className="rounded-full border border-[color:var(--line-2)] px-1.5 py-px text-[9px] font-bold tracking-wider text-[color:var(--lilac)]" style={{ background: "rgba(168,85,247,0.12)" }}>
                Premium · unlimited
              </span>
            ) : authChecked && userId ? (
              <span className="rounded-full border border-[color:var(--line-2)] px-1.5 py-px text-[9px] font-bold tracking-wider text-[color:var(--muted)]">
                {freeRemaining}/{FREE_DEMAND_PER_DAY} free today
              </span>
            ) : null}
            {demandVisible && !calc.empty && (
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
          ) : demandVisible ? (
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
              {!premium && (
                <p className="mt-2 text-center text-[11.5px] text-[color:var(--muted)]">
                  {freeRemaining > 0
                    ? <>You have <span className="font-semibold text-[color:var(--lilac)]">{freeRemaining}</span> more demand check{freeRemaining === 1 ? "" : "s"} today · </>
                    : <>That was your last free demand check today · </>}
                  <Link href="/premium" className="font-semibold text-[color:var(--lilac)] underline underline-offset-2">go unlimited</Link>
                </p>
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
              {/* overlay: reveal button (free, has tries) OR upgrade (out / logged out) */}
              <div
                className="absolute inset-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 text-center"
                style={{ background: "linear-gradient(to bottom, rgba(10,6,20,0.4), rgba(10,6,20,0.7))" }}
              >
                {!userId ? (
                  <>
                    <p className="text-[13px] font-semibold text-[color:var(--text)]">Log in to check demand — 3 free checks a day.</p>
                    <Link href="/login" className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold text-[#1a1030] transition hover:brightness-110 active:scale-95 [background-image:var(--ramp-h)] [font-family:var(--font-display)]">
                      Log in
                    </Link>
                  </>
                ) : freeRemaining > 0 ? (
                  <>
                    <p className="text-[13px] font-semibold text-[color:var(--text)]">
                      Does this trade <em>actually</em> win? Check the demand verdict.
                    </p>
                    <button
                      onClick={revealDemand}
                      disabled={calc.empty || revealBusy}
                      className="rounded-full px-5 py-1.5 text-[12.5px] font-semibold text-[#1a1030] shadow-[0_8px_24px_-10px_rgba(168,85,247,0.8)] transition hover:brightness-110 active:scale-95 disabled:opacity-40 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
                    >
                      {revealBusy ? "Checking\u2026" : "Reveal demand verdict"}
                    </button>
                    <span className="w-full text-[11px] font-semibold text-[color:var(--lilac)]">
                      {freeRemaining} of {FREE_DEMAND_PER_DAY} free checks left today
                    </span>
                  </>
                ) : (
                  <>
                    <span className="grid h-7 w-7 flex-none place-items-center rounded-lg text-[color:var(--lilac)]" style={{ background: "rgba(168,139,250,0.14)", border: "1px solid var(--line-2)" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                    </span>
                    <p className="text-[13px] font-semibold text-[color:var(--text)]">
                      You&apos;ve used all {FREE_DEMAND_PER_DAY} free demand checks today.
                    </p>
                    <Link href="/premium" className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold text-[#1a1030] shadow-[0_8px_24px_-10px_rgba(168,85,247,0.8)] transition hover:brightness-110 active:scale-95 [background-image:var(--ramp-h)] [font-family:var(--font-display)]">
                      Go unlimited with Premium
                    </Link>
                  </>
                )}
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
            const diff = round2(calc.themRaw - calc.youRaw);
            if (Math.abs(diff) < 0.005) {
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

      {/* why demand matters + attribution (kept short) */}
      <div className="petora-card ptrc-reveal mt-8 p-4 text-[13px] sm:p-5 leading-relaxed text-[color:var(--muted)]" style={{ animationDelay: "180ms" }}>
        <p className="mb-2 font-semibold text-[color:var(--text)] [font-family:var(--font-display)]">Why demand matters</p>
        <p>
          A pet&apos;s value is what it&apos;s <em>listed</em> at. Demand is whether anyone will actually
          give you that. Two trades can look identical on paper while one leaves you with pets that
          fly out of your inventory and the other leaves you stuck for weeks — so the demand verdict
          weighs both. It&apos;s a strong second opinion, not a guarantee.
        </p>
        <p className="mt-3 border-t border-[color:var(--line)] pt-3 text-[12px]">
          Values from{" "}
          <a
            href={SOURCE_META[valueSource ?? DEFAULT_SOURCE].site}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[color:var(--lilac)] underline decoration-[rgba(168,139,250,0.4)] underline-offset-2 hover:decoration-[color:var(--lilac)]"
          >
            {SOURCE_META[valueSource ?? DEFAULT_SOURCE].label}
          </a>, demand from AMVGG. Petora is not affiliated with either site.{" "}
          <Link href="/settings" className="font-semibold text-[color:var(--lilac)] underline underline-offset-2">
            Change value source
          </Link>
        </p>
      </div>

      {/* ── picker modal (tap a pet → detail modal) ── */}
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
            aria-label="Add a pet to the trade"
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
              <button onClick={closePicker} aria-label="Close" className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)] active:scale-90">&times;</button>
            </div>

            {sideFull && (
              <div className="ptrc-pop mb-3 rounded-xl px-4 py-2.5 text-center text-[13px] font-semibold" style={{ background: "rgba(251,113,133,0.10)", border: "1px solid var(--down)", color: "var(--down)" }}>
                Limit reached — {MAX_PER_SIDE} pets on this side. Remove some from the board first.
              </div>
            )}

            {/* category pills */}
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

            {/* tile grid — tap a tile to open its variant + quantity menu */}
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
                    {pickerList.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => openDetail(c)}
                        disabled={sideFull || (c.category !== "pet" && c.baseValue == null)}
                        className="relative rounded-xl border border-[color:var(--line)] p-2 text-center transition hover:border-[color:var(--violet)] hover:bg-[rgba(168,85,247,0.08)] active:scale-95 disabled:opacity-40 disabled:hover:border-[color:var(--line)] disabled:hover:bg-transparent"
                      >
                        {c.icon_url && <img src={c.icon_url} alt={c.name} className="mx-auto h-12 w-12 object-contain" loading="lazy" decoding="async" />}
                        <div className="mt-1 truncate text-[11px] font-semibold text-[color:var(--text)]">{c.name}</div>
                        <div className="text-[11px] font-bold tabular-nums text-[color:var(--lilac)] [font-family:var(--font-data)]">
                          {c.baseValue != null ? fmt(c.baseValue) : "\u2014"}
                        </div>
                        <div className="flex items-center justify-center">
                          <DemandHearts level={c.demand} size={8} />
                        </div>
                      </button>
                    ))}
                  </div>
                  {pickerVisible < pickerFiltered.length && (
                    <p className="py-3 text-center text-[12px] text-[color:var(--muted)]">
                      Scroll for more &middot; {pickerFiltered.length - pickerVisible} left
                    </p>
                  )}
                </>
              )}
            </div>

            <p className="mt-2.5 border-t border-[color:var(--line)] pt-2.5 text-center text-[11.5px] text-[color:var(--muted)] sm:mt-3 sm:pt-3">
              Tap a pet to pick its variation and how many. Values shown are Normal / No-Potion.
            </p>
          </div>

          {/* ── item detail: variant + quantity + Select ── */}
          {detail && (
            <div
              onClick={(e) => { e.stopPropagation(); setDetail(null); }}
              className="ptrc-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4"
              style={{ background: "rgba(5,3,12,0.62)", backdropFilter: "blur(3px)" }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={`Add ${detail.name}`}
                className="petora-card ptrc-detail relative w-full max-w-[400px] px-5 pb-5 pt-10 text-center sm:px-7 sm:pb-7"
                style={{ borderColor: "var(--line-2)", boxShadow: "0 30px 80px -24px rgba(124,58,237,0.75)" }}
              >
                <button
                  onClick={() => setDetail(null)}
                  aria-label="Cancel"
                  className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl text-[17px] font-bold text-white transition hover:brightness-110 active:scale-90"
                  style={{ background: "var(--down)" }}
                >
                  &times;
                </button>

                {/* icon + live value badge */}
                <div className="relative mx-auto h-[120px] w-[120px] sm:h-[136px] sm:w-[136px]">
                  {detail.icon_url && (
                    <img src={detail.icon_url} alt={detail.name} className="ptrc-float h-full w-full object-contain" decoding="async" />
                  )}
                  <span
                    className="absolute bottom-0 right-0 min-w-[42px] rounded-full border px-2 py-1 text-[12.5px] font-bold tabular-nums text-[color:var(--lilac)] [font-family:var(--font-data)]"
                    style={{ background: "var(--surface-2)", borderColor: "var(--line-2)" }}
                    aria-live="polite"
                  >
                    {dValue === undefined ? "\u2026" : dValue == null ? "\u2014" : fmt(dValue)}
                  </span>
                </div>

                <h3 className="mt-2 text-[22px] font-bold leading-tight text-[color:var(--text)] sm:text-2xl [font-family:var(--font-display)]">
                  {detail.name}
                </h3>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                  <span className="text-[12px] font-semibold text-[color:var(--lilac)]">{detailVariant}</span>
                  <DemandHearts level={detail.demand} size={10} />
                  {detail.highTier && (
                    <span
                      className="rounded-full border px-2 py-px text-[10px] font-bold uppercase tracking-wider"
                      style={{ borderColor: "rgba(251,191,36,0.5)", background: "rgba(251,191,36,0.12)", color: "#FBBF24" }}
                      title={`Normal Fly & Ride is ${HIGH_TIER_ELVE}+ on Elvebredd — counted as more in-demand`}
                    >
                      High tier
                    </span>
                  )}
                </div>

                {/* variant toggles — default Fly & Ride, pets only */}
                {detailIsPet ? (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full p-1.5" style={{ background: "rgba(168,139,250,0.07)", border: "1px solid var(--line)" }}>
                    {togglePill("F", dFly, () => setDFly((v) => !v), false, BADGE_META.F.bg, BADGE_META.F.fg)}
                    {togglePill("R", dRide, () => setDRide((v) => !v), false, BADGE_META.R.bg, BADGE_META.R.fg)}
                    {togglePill("N", dTier === "neon", () => setDTier((t) => (t === "neon" ? "normal" : "neon")), false, BADGE_META.N.bg, BADGE_META.N.fg)}
                    {togglePill("M", dTier === "mega", () => setDTier((t) => (t === "mega" ? "normal" : "mega")), false, BADGE_META.M.bg, BADGE_META.M.fg)}
                  </div>
                ) : (
                  <p className="mt-3 text-[12px] text-[color:var(--muted)]">No variations for this item.</p>
                )}

                {/* quantity — custom dropdown so it ALWAYS opens downward.
                    A native <select> flips upward when the option list won't
                    fit below the field, and no CSS can override that. */}
                <div className="mt-4 flex items-center justify-center gap-2">
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">Qty</span>
                  <div className="relative">
                    <button
                      onClick={() => setQtyOpen((v) => !v)}
                      aria-haspopup="listbox"
                      aria-expanded={qtyOpen}
                      className="flex w-[78px] items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[15px] font-bold tabular-nums text-[color:var(--text)] transition active:scale-95"
                      style={{ background: "var(--surface)", borderColor: qtyOpen ? "var(--violet)" : "var(--line-2)" }}
                    >
                      {dQty}
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        style={{ transform: qtyOpen ? "rotate(180deg)" : "none", transition: "transform .18s ease" }}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    {qtyOpen && (
                      <>
                        {/* click-away catcher */}
                        <div className="fixed inset-0 z-[70]" onClick={() => setQtyOpen(false)} aria-hidden="true" />
                        <ul
                          role="listbox"
                          aria-label="Quantity"
                          className="ptrc-qtylist ptrc-scroll absolute left-0 top-full z-[80] mt-1.5 max-h-[196px] w-[78px] overflow-y-auto rounded-xl border py-1 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.8)]"
                          style={{ background: "var(--surface-2)", borderColor: "var(--line-2)" }}
                        >
                          {Array.from({ length: qtyMax }, (_, i) => i + 1).map((n) => (
                            <li key={n}>
                              <button
                                role="option"
                                aria-selected={n === dQty}
                                onClick={() => { setDQty(n); setQtyOpen(false); }}
                                className="block w-full px-3 py-1.5 text-left text-[14.5px] font-bold tabular-nums transition"
                                style={n === dQty
                                  ? { background: "rgba(168,85,247,0.22)", color: "var(--text)" }
                                  : { color: "var(--muted)" }}
                              >
                                {n}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                  <span className="text-[11.5px] text-[color:var(--muted)]">{slotsLeft} slot{slotsLeft === 1 ? "" : "s"} left</span>
                </div>

                {dValue === null && (
                  <p className="mt-3 text-[12.5px] font-semibold" style={{ color: "var(--down)" }}>
                    No value listed for {detailVariant} — try another variation.
                  </p>
                )}

                <button
                  onClick={confirmSelect}
                  disabled={dValue == null || dValue === undefined || slotsLeft <= 0}
                  className="mt-5 w-full rounded-xl px-6 py-3 text-[15px] font-bold text-[#1a1030] shadow-[0_10px_30px_-12px_rgba(168,85,247,0.9)] transition hover:brightness-110 active:scale-95 disabled:opacity-35 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
                >
                  {dValue === undefined
                    ? "Checking value\u2026"
                    : dQty > 1
                      ? `Select ${dQty} \u00b7 ${dValue == null ? "\u2014" : fmt(dValue * dQty)}`
                      : "Select"}
                </button>
                <p className="mt-2 text-[11px] text-[color:var(--muted)]">
                  Adds to <span className="font-semibold text-[color:var(--text)]">{pickerSide === "you" ? "your offer" : "their offer"}</span> and closes — tap a <span className="font-semibold text-[color:var(--lilac)]">+</span> slot for the next pet.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}