"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ValueSource = "elvebredd" | "amvgg";

// The two community value lists Petora can read. Petora is not affiliated
// with either — we mirror their numbers, we don't set them.
//
// IMPORTANT: these are DIFFERENT SCALES, not different opinions about the
// same number. A Frost Dragon is thousands on Elvebredd and 1.675 on AMVGG
// (AMVGG denominates in Frost Dragons — 0.5 means half a Frost Dragon).
// Totals from one are meaningless against totals from the other, which is
// why the leaderboard stays Elvebredd-only regardless of this setting.
export const SOURCES: {
  id: ValueSource;
  name: string;
  tagline: string;
  detail: string;
  site: string;
  accent: string;
}[] = [
  {
    id: "elvebredd",
    name: "Elvebredd",
    tagline: "The community standard since 2022",
    detail:
      "Whole-number values most traders quote by default. Years of price history, so graphs and Rising/Falling are fully populated.",
    site: "https://elvebredd.com",
    accent: "168,85,247",
  },
  {
    id: "amvgg",
    name: "AMVGG",
    tagline: "Updated daily by active traders",
    detail:
      "Weighs real in-game trades and demand, not just rarity. Petora reads their Baseless mode. Runs on a different scale than Elvebredd — don't compare totals across the two.",
    site: "https://amvgg.com",
    accent: "56,189,248",
  },
];

export default function ValueSourcePicker({
  onSaved,
  compact = false,
}: {
  onSaved?: (s: ValueSource) => void;
  compact?: boolean;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [current, setCurrent] = useState<ValueSource>("elvebredd");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles").select("value_source").eq("id", uid).single();
        if (prof?.value_source === "amvgg" || prof?.value_source === "elvebredd") {
          setCurrent(prof.value_source);
        }
      }
      setAuthChecked(true);
    });
  }, []);

  async function choose(id: ValueSource) {
    if (!userId || saving || id === current) return;
    const prev = current;
    setCurrent(id); // optimistic
    setSaving(true);
    setError(null);

    // upsert rather than update: a profiles row normally exists by now, but a
    // brand-new signup arriving straight from /signup may race the row-creation
    // trigger. The "own profile" RLS policy is ALL with auth.uid() = id, so an
    // insert by the owner is allowed. value_source is NOT in the
    // protect_profile_columns blacklist, so this is a legitimate user write.
    const { error: err } = await supabase
      .from("profiles")
      .upsert({ id: userId, value_source: id }, { onConflict: "id" });

    setSaving(false);
    if (err) {
      setCurrent(prev); // revert
      setError("Couldn't save that — please try again.");
      return;
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
    onSaved?.(id);
  }

  if (!authChecked) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="ptrv-skel h-[150px] rounded-2xl" />
        ))}
        <style>{`
          @keyframes ptrvSkel { from{background-position:200% 0} to{background-position:-200% 0} }
          .ptrv-skel {
            background: linear-gradient(90deg, rgba(168,139,250,0.07) 25%, rgba(168,139,250,0.16) 50%, rgba(168,139,250,0.07) 75%);
            background-size: 200% 100%; animation: ptrvSkel 1.4s linear infinite;
          }
          @media (prefers-reduced-motion: reduce) { .ptrv-skel { animation:none!important; } }
        `}</style>
      </div>
    );
  }

  if (!userId) {
    return (
      <p className="text-sm text-[color:var(--muted)]">
        Log in to choose which value list Petora shows you.
      </p>
    );
  }

  return (
    <div>
      <style>{`
        @keyframes ptrvIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .ptrv-in { opacity:0; animation: ptrvIn .4s cubic-bezier(.22,1,.36,1) forwards; }
        .ptrv-opt { transition: transform .18s ease, border-color .18s ease, background .18s ease; }
        .ptrv-opt:hover { transform: translateY(-2px); }
        .ptrv-opt:active { transform: translateY(0) scale(.99); }
        @media (prefers-reduced-motion: reduce) {
          .ptrv-in { animation:none!important; opacity:1!important; transform:none!important; }
          .ptrv-opt, .ptrv-opt:hover, .ptrv-opt:active { transition:none!important; transform:none!important; }
        }
      `}</style>

      <div className="grid gap-3 sm:grid-cols-2">
        {SOURCES.map((s, i) => {
          const selected = current === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => choose(s.id)}
              disabled={saving}
              aria-pressed={selected}
              className="ptrv-opt ptrv-in relative rounded-2xl border p-4 text-left disabled:opacity-60 sm:p-5"
              style={{
                animationDelay: `${i * 70}ms`,
                borderColor: selected ? `rgb(${s.accent})` : "var(--line)",
                background: selected ? `rgba(${s.accent},0.10)` : "rgba(168,139,250,0.04)",
                boxShadow: selected ? `0 12px 30px -16px rgba(${s.accent},0.8)` : "none",
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p
                    className="text-[17px] font-bold leading-tight [font-family:var(--font-display)]"
                    style={{ color: selected ? `rgb(${s.accent})` : "var(--text)" }}
                  >
                    {s.name}
                  </p>
                  <p className="mt-0.5 text-[12px] font-semibold text-[color:var(--muted)]">{s.tagline}</p>
                </div>
                <span
                  className="grid h-6 w-6 flex-none place-items-center rounded-full text-[13px] font-bold"
                  style={
                    selected
                      ? { background: `rgb(${s.accent})`, color: "#0F0A1A" }
                      : { border: "1px solid var(--line-2)", color: "transparent" }
                  }
                  aria-hidden="true"
                >
                  ✓
                </span>
              </div>
              {!compact && (
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-[color:var(--muted)]">{s.detail}</p>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          aria-live="polite"
          className={`text-[12px] font-semibold text-[color:var(--up)] transition-opacity duration-300 ${savedFlash ? "opacity-100" : "opacity-0"}`}
        >
          ✓ Saved
        </span>
        {error && <span className="text-[13px] text-[color:var(--down)]">{error}</span>}
      </div>

      <p className="mt-1 text-[11.5px] leading-relaxed text-[color:var(--muted)]">
        Changes the values on the Catalog and Trade Calculator. The leaderboard always uses
        Elvebredd so everyone&apos;s net worth stays comparable. Petora is not affiliated with
        either site.
      </p>
    </div>
  );
}