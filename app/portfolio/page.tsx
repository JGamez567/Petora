"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type PetLite = { id: number; name: string; icon_url: string | null };
type Item = {
  rowId: number;            // the portfolio_items row id (for deleting)
  petId: number; name: string; icon_url: string | null;
  variantLabel: string; unitValue: number; quantity: number;
};
type Mover = {
  variantId: number; petId: number; name: string; icon_url: string | null;
  variantLabel: string; currentValue: number; change: number;
};

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

// graph time ranges. days = null means "all time" (no cutoff).
const RANGES = [
  { key: "day",   label: "Daily",    days: 1 },
  { key: "week",  label: "Weekly",   days: 7 },
  { key: "month", label: "Monthly",  days: 30 },
  { key: "year",  label: "Yearly",   days: 365 },
  { key: "all",   label: "All time", days: null },
] as const;

function variantLabel(neon: string, fly: boolean, ride: boolean): string {
  const tier = neon === "neon" ? "Neon" : neon === "mega" ? "Mega" : "";
  const pot = fly && ride ? "Fly & Ride" : fly ? "Fly" : ride ? "Ride" : "";
  const parts = [tier, pot].filter(Boolean);
  return parts.length ? parts.join(" ") : "Normal";
}

const MAX_QTY = 500; // hard cap on how many of one pet a single portfolio entry can hold

// Parse the (string) qty field into a clean integer in [1, MAX_QTY].
// Empty / non-numeric / <1 all fall back to 1; anything over the cap is clamped.
function clampQty(raw: string | number): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_QTY, n);
}

// Animated count-up toward `target`. Eases out over `duration` ms via rAF.
// Respects prefers-reduced-motion (snaps instantly). Re-animates from the
// previous displayed value when the target changes, so add/remove feels alive.
function useCountUp(target: number, duration = 800): number {
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
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); fromRef.current = target; };
  }, [target, duration]);

  return display;
}

// Shimmering placeholder bar for loading states.
function Skel({ className = "" }: { className?: string }) {
  return <div className={`ptr-skel rounded-md ${className}`} aria-hidden="true" />;
}

// Skeleton for a holdings/movers-style row inside a card.
function SkelRow() {
  return (
    <div className="petora-card flex items-center gap-3 p-3">
      <Skel className="h-10 w-10 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <Skel className="h-4 w-32 max-w-[60%]" />
        <Skel className="mt-2 h-3 w-24 max-w-[45%]" />
      </div>
      <div className="flex flex-col items-end">
        <Skel className="h-4 w-16" />
        <Skel className="mt-2 h-3 w-10" />
      </div>
    </div>
  );
}

export default function Portfolio() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [premium, setPremium] = useState(false);
  const [premiumChecked, setPremiumChecked] = useState(false);

  const [pets, setPets] = useState<PetLite[]>([]);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<PetLite | null>(null);
  const [tier, setTier] = useState<string>("normal");
  const [potion, setPotion] = useState<(typeof POTIONS)[number]>(POTIONS[0]);
  const [quantity, setQuantity] = useState<string>("1"); // string: lets mobile clear the field mid-edit without snapping back to 1
  const [items, setItems] = useState<Item[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [movers, setMovers] = useState<Mover[]>([]);
  const [moversLoading, setMoversLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<{ ts: number; value: number }[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[4]); // default: All time

  // who's logged in + premium status
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUserId(data.user?.id ?? null);
      if (data.user) {
        const { data: prof } = await supabase
          .from("profiles").select("is_premium").eq("id", data.user.id).single();
        setPremium(prof?.is_premium ?? false);
      }
      setPremiumChecked(true);
      setAuthChecked(true);
    });
  }, []);

  // pet list for the picker
  useEffect(() => {
    supabase.from("pets").select("id, name, icon_url").order("name")
      .then(({ data }) => setPets(data ?? []));
  }, []);

  // load this user's saved portfolio (all personal rows — manual + scan).
  // unitValue comes from current_pet_values, so holdings always show the LIVE
  // market value on load (nothing is frozen at add-time).
  useEffect(() => {
    if (!userId) return;
    async function loadItems() {
      const { data } = await supabase
        .from("portfolio_items")
        .select(`
          id, quantity,
          pet_variants (
            neon, fly, ride,
            pets ( id, name, icon_url ),
            current_pet_values ( value )
          )
        `)
        .eq("user_id", userId);

      const loaded: Item[] = (data ?? []).map((r: any) => {
        const pv = r.pet_variants;
        return {
          rowId: r.id,
          petId: pv.pets.id,
          name: pv.pets.name,
          icon_url: pv.pets.icon_url,
          variantLabel: variantLabel(pv.neon, pv.fly, pv.ride),
          unitValue: Number(pv.current_pet_values?.[0]?.value ?? 0),
          quantity: r.quantity,
        };
      });
      setItems(loaded);
      setItemsLoading(false);
    }
    loadItems();
  }, [userId]);

  // load which of THIS user's pets moved up/down in value over the last 7 days.
  // get_my_portfolio_movers mirrors the catalog's get_movers logic (most recent
  // value step within the window), scoped to the variants this user owns.
  // PREMIUM ONLY — free users see the locked upsell instead, so we don't even
  // call the RPC for them (UI-side gating, consistent with the catalog).
  useEffect(() => {
    if (!userId || !premiumChecked) return;
    if (!premium) { setMoversLoading(false); return; }
    supabase.rpc("get_my_portfolio_movers", { window_hours: 168 }).then(({ data, error }) => {
      if (error) { console.error(error); setMoversLoading(false); return; }
      setMovers((data ?? []).map((r: any) => ({
        variantId: r.pet_variant_id,
        petId: r.pet_id,
        name: r.name,
        icon_url: r.icon_url,
        variantLabel: variantLabel(r.neon, r.fly, r.ride),
        currentValue: Number(r.current_value ?? 0),
        change: Number(r.change ?? 0),
      })));
      setMoversLoading(false);
    });
  }, [userId, premium, premiumChecked]);

  // load this user's net-worth history for the selected range (all sources — it's their own progress)
  useEffect(() => {
    if (!userId) return;
    setSnapshotsLoading(true);
    let q = supabase
      .from("portfolio_snapshots")
      .select("total_value, recorded_at")
      .eq("user_id", userId);
    if (range.days != null) {
      const cutoff = new Date(Date.now() - range.days * 86400000).toISOString();
      q = q.gte("recorded_at", cutoff);
    }
    q.order("recorded_at", { ascending: true }).then(({ data }) => {
      setSnapshots((data ?? []).map((r: any) => ({
        ts: new Date(r.recorded_at).getTime(),
        value: Number(r.total_value),
      })));
      setSnapshotsLoading(false);
    });
  }, [userId, range]);

  const suggestions = search
    ? pets.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  async function addToPortfolio() {
    if (!picked || !userId) return;
    const pet = picked;
    setAdding(true);
    setAddError(null);

    const { data: vRows } = await supabase
      .from("pet_variants").select("id")
      .eq("pet_id", pet.id).eq("neon", tier)
      .eq("fly", potion.fly).eq("ride", potion.ride).limit(1);
    const variantId = vRows?.[0]?.id;
    const label = variantLabel(tier, potion.fly, potion.ride);
    if (!variantId) { setAddError(`No ${label} variant exists for ${pet.name}.`); setAdding(false); return; }

    const { data: vVal } = await supabase
      .from("current_pet_values").select("value").eq("pet_variant_id", variantId).limit(1);
    const unitValue = vVal?.[0]?.value != null ? Number(vVal[0].value) : null;
    if (unitValue == null) { setAddError(`No value recorded yet for that variant.`); setAdding(false); return; }

    const qty = clampQty(quantity);

    // Upsert-increment via RPC. Inserts a new MANUAL row, or — if this variant is
    // already held manually — adds to the existing row's quantity (capped at 500).
    // The function runs SECURITY DEFINER scoped to auth.uid(): it needs no UPDATE
    // RLS policy and can never touch another user's rows (user_id is server-side).
    // It only conflicts against source='manual' rows, so a scanned copy of the same
    // variant is left untouched (a re-scan must be free to replace its own rows).
    // Returns the resulting row { id, quantity }.
    const { data: rpcRows, error } = await supabase
      .rpc("add_manual_pet", { p_variant_id: variantId, p_qty: qty });

    if (error || !rpcRows || (rpcRows as any[]).length === 0) {
      setAddError(error?.message ?? "Couldn't add that pet. Please try again.");
      setAdding(false);
      return;
    }

    const { id: rowId, quantity: newQty } = (rpcRows as any[])[0] as { id: number; quantity: number };

    setItems((prev) => {
      const idx = prev.findIndex((x) => x.rowId === rowId);
      if (idx >= 0) {
        // existing manual row was incremented — reflect the new total in place
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: newQty };
        return next;
      }
      // brand-new manual row
      return [...prev, {
        rowId, petId: pet.id, name: pet.name, icon_url: pet.icon_url,
        variantLabel: label, unitValue, quantity: newQty,
      }];
    });

    setPicked(null); setSearch(""); setTier("normal"); setPotion(POTIONS[0]); setQuantity("1"); setAdding(false);
  }

  async function removeItem(rowId: number) {
    await supabase.from("portfolio_items").delete().eq("id", rowId);
    setItems((prev) => prev.filter((x) => x.rowId !== rowId));
  }

  const total = items.reduce((s, i) => s + i.unitValue * i.quantity, 0);
  const animatedTotal = useCountUp(total);

  // largest absolute change among movers — drives the magnitude bars
  const maxMove = movers.reduce((m, x) => Math.max(m, Math.abs(x.change)), 0);

  // Scoped animation system for this page. ptr- prefix keeps it collision-free
  // with the home/premium blocks; everything is guarded for reduced motion.
  const pageStyles = (
    <style>{`
      @keyframes ptrFadeUp {
        from { opacity: 0; transform: translateY(14px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes ptrFadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes ptrSkelShimmer {
        from { background-position: 200% 0; }
        to   { background-position: -200% 0; }
      }
      @keyframes ptrBarGrow {
        from { transform: scaleX(0); }
        to   { transform: scaleX(1); }
      }
      @keyframes ptrLockPulse {
        0%, 100% { transform: translateY(0); }
        50%      { transform: translateY(-4px); }
      }
      .ptr-reveal {
        opacity: 0;
        animation: ptrFadeUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      }
      .ptr-fade {
        animation: ptrFadeIn 0.25s ease-out;
      }
      .ptr-skel {
        background: linear-gradient(
          90deg,
          rgba(168, 139, 250, 0.07) 25%,
          rgba(168, 139, 250, 0.16) 50%,
          rgba(168, 139, 250, 0.07) 75%
        );
        background-size: 200% 100%;
        animation: ptrSkelShimmer 1.4s linear infinite;
      }
      .ptr-bar {
        transform-origin: left center;
        animation: ptrBarGrow 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .ptr-lock-icon {
        animation: ptrLockPulse 2.6s ease-in-out infinite;
      }
      .ptr-lift {
        transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
      }
      .ptr-lift:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 30px -14px rgba(168, 85, 247, 0.45);
        border-color: var(--line-2);
      }
      @media (prefers-reduced-motion: reduce) {
        .ptr-reveal, .ptr-fade, .ptr-bar, .ptr-lock-icon {
          animation: none !important;
          opacity: 1 !important;
          transform: none !important;
        }
        .ptr-skel { animation: none !important; }
        .ptr-lift, .ptr-lift:hover { transition: none !important; transform: none !important; }
      }
    `}</style>
  );

  // not logged in
  if (authChecked && !userId) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24 text-center">
        {pageStyles}
        <div className="petora-card ptr-reveal mx-auto p-10" style={{ borderColor: "var(--line-2)" }}>
          <h1 className="text-2xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">My Portfolio</h1>
          <p className="mx-auto mt-3 max-w-sm text-[15px] text-[color:var(--muted)]">Log in to build and save your portfolio.</p>
          <a href="/login"
            className="mt-6 inline-block rounded-full px-7 py-3 text-[15px] font-semibold text-[#1a1030] shadow-[0_12px_34px_-12px_rgba(168,85,247,0.7)] transition hover:brightness-110 [background-image:var(--ramp-h)] [font-family:var(--font-display)]">
            Log in
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      {pageStyles}

      <div className="ptr-reveal">
        <p className="petora-eyebrow">Your account</p>
        <h1 className="mt-1.5 text-3xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">My portfolio</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">Add your pets to track your total Elve value.</p>
      </div>

      {/* add a pet */}
      <div className="petora-card ptr-reveal mt-6 mb-6 p-5" style={{ animationDelay: "60ms" }}>
        <input
          placeholder="Search a pet to add…"
          value={picked ? picked.name : search}
          onChange={(e) => { setPicked(null); setSearch(e.target.value); }}
          className="w-full rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-2.5 text-[15px] text-[color:var(--text)] outline-none transition placeholder:text-[color:var(--muted)] focus:border-[color:var(--violet)] focus:shadow-[0_0_0_3px_rgba(168,85,247,0.15)]"
        />
        {!picked && suggestions.length > 0 && (
          <div className="ptr-fade mt-1.5 overflow-hidden rounded-lg border border-[color:var(--line)]">
            {suggestions.map((p) => (
              <div key={p.id} onClick={() => { setPicked(p); setSearch(""); }}
                className="flex cursor-pointer items-center gap-2.5 px-3 py-2 transition hover:bg-[rgba(168,139,250,0.08)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.icon_url && <img src={p.icon_url} alt="" className="h-7 w-7 object-contain" />}
                <span className="text-[15px] text-[color:var(--text)]">{p.name}</span>
              </div>
            ))}
          </div>
        )}

        {picked && (
          <div className="ptr-fade mt-4">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">Type</div>
            <div className="mb-3 flex flex-wrap gap-2">
              {TIERS.map((t) => (
                <button key={t.key} onClick={() => setTier(t.key)}
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition active:scale-95 ${
                    tier === t.key
                      ? "border border-[color:var(--violet)] bg-[rgba(168,85,247,0.16)] text-[color:var(--lilac)]"
                      : "border border-[color:var(--line)] text-[color:var(--muted)] hover:text-[color:var(--text)]"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">Potions</div>
            <div className="mb-4 flex flex-wrap gap-2">
              {POTIONS.map((p) => (
                <button key={p.key} onClick={() => setPotion(p)}
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition active:scale-95 ${
                    potion.key === p.key
                      ? "border border-[color:var(--violet)] bg-[rgba(168,85,247,0.16)] text-[color:var(--lilac)]"
                      : "border border-[color:var(--line)] text-[color:var(--muted)] hover:text-[color:var(--text)]"}`}>
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-[color:var(--muted)]">
                <span>Qty:</span>
                <div className="inline-flex items-center overflow-hidden rounded-md border border-[color:var(--line)] bg-[color:var(--surface)]">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() => setQuantity(String(Math.max(1, clampQty(quantity) - 1)))}
                    disabled={clampQty(quantity) <= 1}
                    className="px-3 py-1.5 text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.10)] active:scale-90 disabled:opacity-40">
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={quantity}
                    onChange={(e) => {
                      const v = e.target.value;
                      // allow an empty field while typing; accept digits only — never snap back to 1 mid-edit
                      if (v === "" || /^\d+$/.test(v)) setQuantity(v);
                    }}
                    onBlur={() => setQuantity(String(clampQty(quantity)))}
                    className="w-14 border-x border-[color:var(--line)] bg-transparent px-1 py-1.5 text-center text-[color:var(--text)] outline-none focus:bg-[rgba(168,139,250,0.06)]" />
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={() => setQuantity(String(Math.min(MAX_QTY, clampQty(quantity) + 1)))}
                    disabled={clampQty(quantity) >= MAX_QTY}
                    className="px-3 py-1.5 text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.10)] active:scale-90 disabled:opacity-40">
                    +
                  </button>
                </div>
                <span className="text-[11px] text-[color:var(--muted)]">max {MAX_QTY}</span>
              </div>
              <button onClick={addToPortfolio} disabled={adding}
                className="rounded-lg px-5 py-2 text-sm font-semibold text-[#1a1030] transition hover:brightness-110 active:scale-95 disabled:opacity-40 [background-image:var(--ramp-h)] [font-family:var(--font-display)]">
                {adding ? "Adding…" : `Add ${picked.name}`}
              </button>
            </div>
            {addError && <p className="ptr-fade mt-2 text-[13px] text-[color:var(--down)]">{addError}</p>}
          </div>
        )}
      </div>

      {/* net worth over time (premium) */}
      {premium ? (
        <div className="petora-card ptr-reveal mb-5 p-5" style={{ animationDelay: "120ms" }}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="petora-eyebrow">Net worth over time</div>
            <div className="flex flex-wrap gap-1.5">
              {RANGES.map((r) => (
                <button key={r.key} onClick={() => setRange(r)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition active:scale-95 ${
                    range.key === r.key
                      ? "border border-[color:var(--violet)] bg-[rgba(168,85,247,0.16)] text-[color:var(--lilac)]"
                      : "border border-[color:var(--line)] text-[color:var(--muted)] hover:text-[color:var(--text)]"}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {snapshotsLoading ? (
            <div className="h-[240px]">
              <Skel className="h-full w-full rounded-lg" />
            </div>
          ) : snapshots.length === 0 ? (
            <p className="text-[13px] text-[color:var(--muted)]">No snapshots in this range yet. Try a wider range, or scan to add a data point.</p>
          ) : snapshots.length === 1 ? (
            <p className="text-[13px] text-[color:var(--muted)]">One data point in this range — the line fills in as more snapshots accumulate.</p>
          ) : (
            <div className="ptr-fade h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={snapshots}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,139,250,0.12)" />
                  <XAxis dataKey="ts" tickFormatter={(t) => new Date(t).toLocaleDateString()} fontSize={12} tick={{ fill: "#988FB0" }} axisLine={{ stroke: "rgba(168,139,250,0.2)" }} tickLine={{ stroke: "rgba(168,139,250,0.2)" }} />
                  <YAxis tickFormatter={(v) => v.toLocaleString()} fontSize={12} width={70} tick={{ fill: "#988FB0" }} axisLine={{ stroke: "rgba(168,139,250,0.2)" }} tickLine={{ stroke: "rgba(168,139,250,0.2)" }} />
                  <Tooltip
                    labelFormatter={(t) => new Date(t).toLocaleString()}
                    formatter={(v: any) => [Number(v).toLocaleString(), "Net worth"]}
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
      ) : (
        <div className="petora-card ptr-reveal mb-5 p-6 text-center" style={{ borderStyle: "dashed", animationDelay: "120ms" }}>
          <div className="font-semibold text-[color:var(--text)] [font-family:var(--font-display)]">📈 Net worth over time</div>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-[color:var(--muted)]">See how your account value changes over time with Premium.</p>
          <a href="/premium"
            className="mt-4 inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-[#1a1030] transition hover:brightness-110 active:scale-95 [background-image:var(--ramp-h)] [font-family:var(--font-display)]">
            Upgrade to Premium
          </a>
        </div>
      )}

      {/* total */}
      <div className="petora-card ptr-reveal mb-5 p-6 text-center" style={{ animationDelay: "180ms" }}>
        <div className="text-sm text-[color:var(--muted)]">Total portfolio value</div>
        <div className="petora-gradient mt-1 text-4xl font-bold tabular-nums [font-family:var(--font-data)]">
          {itemsLoading ? <Skel className="mx-auto h-10 w-40" /> : animatedTotal.toLocaleString()}
        </div>
        <div className="mt-1 text-[13px] text-[color:var(--muted)]">
          {itemsLoading ? "\u00A0" : `${items.length} pet${items.length !== 1 ? "s" : ""}`}
        </div>
      </div>

      {/* recent value changes in the user's own pets (last 7 days) — PREMIUM */}
      {premium ? (
        moversLoading ? (
          <div className="petora-card ptr-reveal mb-5 p-5" style={{ animationDelay: "240ms" }}>
            <div className="petora-eyebrow mb-3">Recent changes in your pets · last 7 days</div>
            <div className="flex flex-col gap-2.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skel className="h-9 w-9 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <Skel className="h-4 w-28 max-w-[55%]" />
                    <Skel className="mt-2 h-3 w-20 max-w-[40%]" />
                  </div>
                  <Skel className="h-8 w-16" />
                </div>
              ))}
            </div>
          </div>
        ) : movers.length > 0 ? (
          <div className="petora-card ptr-reveal mb-5 p-5" style={{ animationDelay: "240ms" }}>
            <div className="petora-eyebrow mb-3">Recent changes in your pets · last 7 days</div>
            <div className="flex flex-col gap-3">
              {movers.map((m, idx) => {
                const up = m.change > 0;
                const magnitude = maxMove > 0 ? Math.max(0.06, Math.abs(m.change) / maxMove) : 0;
                return (
                  <div key={m.variantId} className="ptr-reveal" style={{ animationDelay: `${280 + idx * 50}ms` }}>
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {m.icon_url && <img src={m.icon_url} alt="" className="h-9 w-9 object-contain" />}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-[color:var(--text)]">{m.name}</div>
                        <div className="text-[12px] text-[color:var(--muted)]">{m.variantLabel}</div>
                      </div>
                      <div className="text-right tabular-nums [font-family:var(--font-data)]">
                        <div className="font-bold text-[color:var(--lilac)]">{m.currentValue.toLocaleString()}</div>
                        <div className="text-[13px] font-bold" style={{ color: up ? "var(--up)" : "var(--down)" }}>
                          {up ? "▲ +" : "▼ "}{m.change.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    {/* magnitude bar — relative size of this move vs the biggest one */}
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[rgba(168,139,250,0.10)]">
                      <div
                        className="ptr-bar h-full rounded-full"
                        style={{
                          width: `${magnitude * 100}%`,
                          background: up ? "var(--up)" : "var(--down)",
                          opacity: 0.75,
                          animationDelay: `${340 + idx * 50}ms`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null
      ) : (
        /* locked upsell — mirrors the catalog's LockedMovers pattern */
        <div className="petora-card ptr-reveal mb-5 p-6 text-center" style={{ borderStyle: "dashed", animationDelay: "240ms" }}>
          <div className="ptr-lock-icon mx-auto mb-2 w-fit text-2xl" aria-hidden="true">🔒</div>
          <div className="font-semibold text-[color:var(--text)] [font-family:var(--font-display)]">Rising &amp; dropping pets in your portfolio</div>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-[color:var(--muted)]">
            See which of your pets gained or lost value in the last 7 days — before you trade them away.
          </p>
          <a href="/premium"
            className="mt-4 inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-[#1a1030] transition hover:brightness-110 active:scale-95 [background-image:var(--ramp-h)] [font-family:var(--font-display)]">
            Upgrade to Premium
          </a>
        </div>
      )}

      {/* holdings */}
      {itemsLoading ? (
        <div className="flex flex-col gap-2.5">
          <SkelRow />
          <SkelRow />
          <SkelRow />
        </div>
      ) : items.length === 0 ? (
        <div className="petora-card ptr-reveal p-8 text-center" style={{ borderStyle: "dashed", animationDelay: "300ms" }}>
          <div className="mb-1.5 text-2xl" aria-hidden="true">🐾</div>
          <p className="font-semibold text-[color:var(--text)] [font-family:var(--font-display)]">No pets yet</p>
          <p className="mx-auto mt-1 max-w-xs text-[13px] text-[color:var(--muted)]">
            Search above to add pets by hand, or scan your inventory to import them all at once.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((i, idx) => (
            <div key={i.rowId}
              className="petora-card ptr-reveal ptr-lift flex items-center gap-3 p-3"
              style={{ animationDelay: `${300 + Math.min(idx, 12) * 40}ms` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {i.icon_url && <img src={i.icon_url} alt="" className="h-10 w-10 object-contain" />}
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-[color:var(--text)]">{i.name}</div>
                <div className="text-[13px] text-[color:var(--muted)]">{i.variantLabel} · {i.unitValue.toLocaleString()} each</div>
              </div>
              <div className="text-right tabular-nums [font-family:var(--font-data)]">
                <div className="font-bold text-[color:var(--lilac)]">{(i.unitValue * i.quantity).toLocaleString()}</div>
                <div className="text-[13px] text-[color:var(--muted)]">×{i.quantity}</div>
              </div>
              <button onClick={() => removeItem(i.rowId)}
                className="rounded-md border border-[rgba(251,113,133,0.28)] bg-[rgba(251,113,133,0.10)] px-2.5 py-1 text-sm text-[#FCA5B6] transition hover:bg-[rgba(251,113,133,0.18)] active:scale-90" aria-label={`Remove ${i.name}`}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}