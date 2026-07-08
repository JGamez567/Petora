"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { AVATARS, AvatarCircle } from "@/lib/avatars";

// Owner-curated avatar picker. Logged-in users choose one of the presets from
// lib/avatars.tsx (or the default); the choice is saved to profiles.avatar_id
// and shown next to their name on the leaderboard once they're public.
// There is intentionally NO upload path — the set is fixed by the site owner.
export default function AvatarPicker() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // id being saved
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles").select("avatar_id").eq("id", uid).single();
        setCurrent(prof?.avatar_id ?? null);
      }
      setAuthChecked(true);
    });
  }, []);

  async function choose(id: string | null) {
    if (!userId || saving !== null || id === current) return;
    const prev = current;
    setCurrent(id);          // optimistic
    setSaving(id ?? "default");
    setError(null);
    const { error: err } = await supabase
      .from("profiles").update({ avatar_id: id }).eq("id", userId);
    setSaving(null);
    if (err) {
      setCurrent(prev);      // revert on failure
      setError("Couldn't save that — please try again.");
      return;
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  }

  if (!authChecked) {
    return (
      <div className="petora-card p-5">
        <div className="ptra-skel h-5 w-40 rounded-md" />
        <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ptra-skel aspect-square rounded-full" />
          ))}
        </div>
        <style>{`
          @keyframes ptraSkel { from{background-position:200% 0} to{background-position:-200% 0} }
          .ptra-skel {
            background: linear-gradient(90deg, rgba(168,139,250,0.07) 25%, rgba(168,139,250,0.16) 50%, rgba(168,139,250,0.07) 75%);
            background-size: 200% 100%;
            animation: ptraSkel 1.4s linear infinite;
          }
          @media (prefers-reduced-motion: reduce) { .ptra-skel { animation: none !important; } }
        `}</style>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="petora-card p-6 text-center" style={{ borderStyle: "dashed" }}>
        <p className="font-semibold text-[color:var(--text)] [font-family:var(--font-display)]">Profile avatar</p>
        <p className="mx-auto mt-1 max-w-xs text-[13px] text-[color:var(--muted)]">
          Log in to pick the avatar that shows next to your name on the leaderboard.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-[#1a1030] transition hover:brightness-110 active:scale-95 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
        >
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="petora-card p-5">
      <style>{`
        @keyframes ptraPop { 0%{transform:scale(1)} 50%{transform:scale(1.12)} 100%{transform:scale(1)} }
        @keyframes ptraIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .ptra-in { opacity:0; animation: ptraIn .4s cubic-bezier(.22,1,.36,1) forwards; }
        .ptra-selected { animation: ptraPop .3s ease-out; }
        .ptra-opt { transition: transform .15s ease, box-shadow .15s ease; }
        .ptra-opt:hover { transform: translateY(-2px) scale(1.06); }
        .ptra-opt:active { transform: scale(.94); }
        @media (prefers-reduced-motion: reduce) {
          .ptra-in,.ptra-selected { animation:none!important; opacity:1!important; }
          .ptra-opt,.ptra-opt:hover,.ptra-opt:active { transition:none!important; transform:none!important; }
        }
      `}</style>

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AvatarCircle avatarId={current} className="h-12 w-12" fontSize={22} />
          <div className="min-w-0">
            <p className="font-semibold text-[color:var(--text)] [font-family:var(--font-display)]">Profile avatar</p>
            <p className="text-[12.5px] text-[color:var(--muted)]">Shown next to your name on the leaderboard.</p>
          </div>
        </div>
        <span
          aria-live="polite"
          className={`flex-none text-[12px] font-semibold text-[color:var(--up)] transition-opacity duration-300 ${savedFlash ? "opacity-100" : "opacity-0"}`}
        >
          ✓ Saved
        </span>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6">
        {/* default option first */}
        <button
          type="button"
          onClick={() => choose(null)}
          disabled={saving !== null}
          aria-label="Default avatar"
          aria-pressed={current === null}
          className={`ptra-opt ptra-in relative grid aspect-square place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--violet)] ${
            current === null ? "ptra-selected ring-2 ring-[color:var(--violet)] ring-offset-2 ring-offset-[color:var(--surface)]" : ""
          }`}
        >
          <AvatarCircle avatarId={null} className="h-full w-full" />
          <span className="absolute text-[10px] font-semibold uppercase tracking-wider text-white/80">Default</span>
        </button>

        {AVATARS.map((a, i) => {
          const selected = current === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => choose(a.id)}
              disabled={saving !== null}
              aria-label={a.label}
              aria-pressed={selected}
              title={a.label}
              className={`ptra-opt ptra-in relative aspect-square rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--violet)] ${
                selected ? "ptra-selected ring-2 ring-[color:var(--violet)] ring-offset-2 ring-offset-[color:var(--surface)]" : ""
              }`}
              style={{ animationDelay: `${(i + 1) * 30}ms` }}
            >
              <AvatarCircle avatarId={a.id} className="h-full w-full" fontSize={26} />
              {selected && (
                <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-[color:var(--violet)] text-[11px] text-white shadow">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error && <p className="mt-3 text-[13px] text-[color:var(--down)]">{error}</p>}
      <p className="mt-3 text-[11.5px] text-[color:var(--muted)]">
        Avatars are a fixed set chosen by Petora — new ones get added over time.
      </p>
    </div>
  );
}