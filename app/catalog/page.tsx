"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type Pet = { id: number; name: string; rarity: string | null; icon_url: string | null; value: number | null };
type Mover = { pet_id: number; name: string; icon_url: string | null; current_value: number; change: number };

// Pet tier -> the `neon` column ("normal" | "neon" | "mega")
const TIERS = [
  { key: "normal", label: "Normal" },
  { key: "neon",   label: "Neon" },
  { key: "mega",   label: "Mega" },
] as const;

// Potions -> the fly + ride booleans. Applies to ANY tier, so Neon Fly & Ride,
// Mega Ride, etc. are all reachable now.
const POTIONS = [
  { key: "none",    label: "No Potions", fly: false, ride: false },
  { key: "fly",     label: "Fly",        fly: true,  ride: false },
  { key: "ride",    label: "Ride",       fly: false, ride: true  },
  { key: "flyride", label: "Fly & Ride", fly: true,  ride: true  },
] as const;

const DEFAULT_TIER = "normal";
const DEFAULT_POTION = POTIONS[3]; // Normal Fly & Ride is the default view

const RANGES = [
  { key: "day",   label: "Day",   days: 1 },
  { key: "week",  label: "Week",  days: 7 },
  { key: "month", label: "Month", days: 30 },
] as const;

export default function Catalog() {
  const [premium, setPremium] = useState(false);
  const [premiumChecked, setPremiumChecked] = useState(false);

  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [tab, setTab] = useState<"all" | "rising" | "falling">("all");
  const [movers, setMovers] = useState<Mover[]>([]);

  const [selected, setSelected] = useState<Pet | null>(null);
  const [tier, setTier] = useState<string>(DEFAULT_TIER);
  const [potion, setPotion] = useState<(typeof POTIONS)[number]>(DEFAULT_POTION);
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[2]);
  const [history, setHistory] = useState<{ ts: number; value: number }[]>([]);
  const [graphLoading, setGraphLoading] = useState(false);

  // premium check  (standardized on is_premium — was reading a non-existent
  // `premium` column, which made everyone fail the gate. See handoff §5.)
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

  // load grid
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("pets")
        .select(`id, name, rarity, icon_url,
          pet_variants!inner ( neon, fly, ride, current_pet_values ( value ) )`)
        .eq("pet_variants.neon", "normal")
        .eq("pet_variants.fly", false)
        .eq("pet_variants.ride", false)
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

  // load movers (rising / falling)
  useEffect(() => {
    supabase.rpc("get_movers", { window_hours: 168 }).then(({ data, error }) => {
      if (error) { console.error(error); return; }
      setMovers((data ?? []).map((r: any) => ({
        pet_id: r.pet_id, name: r.name, icon_url: r.icon_url,
        current_value: Number(r.current_value), change: Number(r.change),
      })));
    });
  }, []);

  // load history (on pet / tier / potion / range change)
  useEffect(() => {
    if (!selected) return;
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
  }, [selected, tier, potion, range]);

  const filtered = pets.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const rising = movers.filter((m) => m.change > 0).sort((a, b) => b.change - a.change);
  const falling = movers.filter((m) => m.change < 0).sort((a, b) => a.change - b.change);

  function openPet(pet: Pet) {
    setSelected(pet);
    setTier(DEFAULT_TIER);
    setPotion(DEFAULT_POTION);
    setRange(RANGES[2]);
  }

  function openMover(m: Mover) {
    openPet({ id: m.pet_id, name: m.name, rarity: null, icon_url: m.icon_url, value: m.current_value });
  }

  // premium gate
  if (premiumChecked && !premium) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24 text-center">
        <div className="petora-card mx-auto p-10" style={{ borderColor: "var(--line-2)" }}>
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl text-[color:var(--lilac)]" style={{ background: "rgba(168,139,250,0.10)", border: "1px solid var(--line-2)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </span>
          <h1 className="mt-5 text-2xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">The full catalog is Premium</h1>
          <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[color:var(--muted)]">
            Value graphs and Rising / Falling trends across every pet are a Premium feature.
          </p>
          <button
            onClick={() => alert("Premium checkout coming soon — Stripe will go here.")}
            className="mt-6 rounded-full px-7 py-3 text-[15px] font-semibold text-[#1a1030] shadow-[0_12px_34px_-12px_rgba(168,85,247,0.7)] transition hover:brightness-110 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
          >
            Upgrade to Premium
          </button>
          <p className="mt-6 text-[13px] text-[color:var(--muted)]">
            Free includes your portfolio tracker and the leaderboard.
          </p>
        </div>
      </main>
    );
  }

  const tabBtn = (key: typeof tab, label: string) => (
    <button
      onClick={() => setTab(key)}
      className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
        tab === key ? "bg-[color:var(--surface-2)] text-[color:var(--text)]" : "text-[color:var(--muted)] hover:text-[color:var(--text)]"
      }`}
    >
      {label}
    </button>
  );

  function MoverList({ list, up }: { list: Mover[]; up: boolean }) {
    if (list.length === 0) {
      return <p className="text-[color:var(--muted)]">No {up ? "rising" : "falling"} pets in the last 7 days yet. This fills in as more history is collected.</p>;
    }
    return (
      <div className="petora-card overflow-hidden">
        {list.map((m) => (
          <div
            key={m.pet_id}
            onClick={() => openMover(m)}
            className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-[rgba(168,139,250,0.06)] [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[color:var(--line)]"
          >
            {m.icon_url && <img src={m.icon_url} alt="" className="h-10 w-10 object-contain" />}
            <div className="flex-1 font-semibold text-[color:var(--text)]">{m.name}</div>
            <div className="text-right">
              <div className="font-bold text-[color:var(--lilac)] [font-family:var(--font-data)]">{m.current_value.toLocaleString()}</div>
              <div className="text-[13px] font-bold [font-family:var(--font-data)]" style={{ color: up ? "var(--up)" : "var(--down)" }}>
                {up ? "▲ +" : "▼ "}{m.change.toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <p className="petora-eyebrow">Live market</p>
      <h1 className="mt-1.5 text-3xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">Pet catalog</h1>
      <p className="mt-2 text-sm text-[color:var(--muted)]">{pets.length} pets · tap one to see its value history</p>

      <div className="mt-6 mb-5 inline-flex rounded-[10px] bg-[rgba(168,139,250,0.07)] p-1">
        {tabBtn("all", "All pets")}
        {tabBtn("rising", `Rising ${rising.length ? `(${rising.length})` : ""}`)}
        {tabBtn("falling", `Falling ${falling.length ? `(${falling.length})` : ""}`)}
      </div>

      {tab === "all" && (
        <>
          <input
            placeholder="Search pets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-6 w-full rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-2.5 text-[15px] text-[color:var(--text)] outline-none transition placeholder:text-[color:var(--muted)] focus:border-[color:var(--violet)]"
          />
          {loading ? (
            <p className="text-[color:var(--muted)]">Loading…</p>
          ) : (
            <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
              {filtered.map((pet) => (
                <div
                  key={pet.id}
                  onClick={() => openPet(pet)}
                  className="petora-card cursor-pointer p-4 text-center transition hover:border-[color:var(--line-2)] hover:bg-[rgba(168,139,250,0.06)]"
                >
                  {pet.icon_url && <img src={pet.icon_url} alt={pet.name} className="mx-auto h-[72px] w-[72px] object-contain" />}
                  <div className="mt-2 text-sm font-semibold text-[color:var(--text)]">{pet.name}</div>
                  <div className="text-xs capitalize text-[color:var(--muted)]">{pet.rarity}</div>
                  <div className="mt-1.5 font-bold text-[color:var(--lilac)] [font-family:var(--font-data)]">
                    {pet.value != null ? pet.value.toLocaleString() : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "rising" && <MoverList list={rising} up={true} />}
      {tab === "falling" && <MoverList list={falling} up={false} />}

      {selected && (
        <div
          onClick={() => setSelected(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-5"
          style={{ background: "rgba(5,3,12,0.72)", backdropFilter: "blur(4px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="petora-card w-full max-w-2xl p-6"
            style={{ borderColor: "var(--line-2)", boxShadow: "0 30px 80px -30px rgba(124,58,237,0.6)" }}
          >
            <div className="mb-4 flex items-center gap-3">
              {selected.icon_url && <img src={selected.icon_url} alt={selected.name} className="h-12 w-12 object-contain" />}
              <h2 className="m-0 flex-1 text-xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">{selected.name}</h2>
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)]"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Tier: Normal / Neon / Mega */}
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">Type</div>
            <div className="mb-3 flex flex-wrap gap-2">
              {TIERS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTier(t.key)}
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
                    tier === t.key
                      ? "border border-[color:var(--violet)] bg-[rgba(168,85,247,0.16)] text-[color:var(--lilac)]"
                      : "border border-[color:var(--line)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Potions: combine with any tier */}
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">Potions</div>
            <div className="mb-4 flex flex-wrap gap-2">
              {POTIONS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPotion(p)}
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
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
                  className={`rounded-lg px-3.5 py-1 text-xs font-medium transition ${
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
              {graphLoading ? (
                <p className="text-[color:var(--muted)]">Loading graph…</p>
              ) : history.length === 0 ? (
                <p className="text-[color:var(--muted)]">No data for this variant in the selected range yet.</p>
              ) : history.length === 1 ? (
                <p className="text-[color:var(--muted)]">Only one data point so far — fills in as more is collected.</p>
              ) : (
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
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}