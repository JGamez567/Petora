"use client";
// → app/welcome/page.tsx   (URL: /welcome)
//
// Post-signup onboarding. Two choices, both changeable later in Settings:
//   1. Which value list to read (Elvebredd vs AMVGG)
//   2. Profile avatar
//
// Both child components save themselves the moment you pick — there's no
// submit button for them. "Finish" only stamps profiles.onboarded_at and
// sends you on, so bailing out early still keeps whatever you picked.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AvatarPicker from "@/components/AvatarPicker";
import ValueSourcePicker from "@/components/ValueSourcePicker";

function Sparkle({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M12 2 13.8 10.2 22 12 13.8 13.8 12 22 10.2 13.8 2 12 10.2 10.2Z" />
    </svg>
  );
}

export default function WelcomePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setAuthChecked(true);
    });
  }, []);

  async function finish() {
    if (finishing) return;
    setFinishing(true);
    if (userId) {
      // Stamp onboarding as done. Failure here is not worth blocking on — the
      // actual preferences already saved themselves when they were picked.
      await supabase
        .from("profiles")
        .upsert({ id: userId, onboarded_at: new Date().toISOString() }, { onConflict: "id" });
    }
    router.push("/portfolio");
  }

  return (
    <main className="relative mx-auto max-w-2xl px-6 py-12">
      <style>{`
        @keyframes ptrwFadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ptrwTwinkle { 0%,100%{opacity:.15;transform:scale(.7)} 50%{opacity:1;transform:scale(1)} }
        @keyframes ptrwGlow { 0%,100%{opacity:.28;transform:scale(1)} 50%{opacity:.5;transform:scale(1.1)} }
        @keyframes ptrwShimmer { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
        .ptrw-reveal { opacity:0; animation: ptrwFadeUp .55s cubic-bezier(.22,1,.36,1) forwards; }
        .ptrw-twinkle { animation: ptrwTwinkle 3.2s ease-in-out infinite; }
        .ptrw-glow { animation: ptrwGlow 7s ease-in-out infinite; }
        .ptrw-shimmer {
          background: linear-gradient(100deg,#A855F7,#C4B5FD,#FFFFFF,#C4B5FD,#A855F7);
          background-size:200% auto; -webkit-background-clip:text; background-clip:text;
          color:transparent; animation: ptrwShimmer 6s linear infinite;
        }
        .ptrw-cta { transition: transform .2s ease, filter .2s ease; }
        .ptrw-cta:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.1); }
        .ptrw-cta:active:not(:disabled) { transform: translateY(0) scale(.98); }
        @media (prefers-reduced-motion: reduce) {
          .ptrw-reveal,.ptrw-twinkle,.ptrw-glow,.ptrw-shimmer {
            animation:none!important; opacity:1!important; transform:none!important;
          }
          .ptrw-shimmer { color:var(--lilac)!important; }
          .ptrw-cta,.ptrw-cta:hover,.ptrw-cta:active { transform:none!important; transition:none!important; }
        }
      `}</style>

      <div
        className="ptrw-glow pointer-events-none absolute -top-12 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(168,85,247,0.22), transparent 70%)" }}
        aria-hidden="true"
      />
      <Sparkle className="ptrw-twinkle pointer-events-none absolute left-4 top-14 h-3.5 w-3.5 text-[color:var(--lilac)]" style={{ animationDelay: "0s" }} />
      <Sparkle className="ptrw-twinkle pointer-events-none absolute right-8 top-24 h-2.5 w-2.5 text-[#C4B5FD]" style={{ animationDelay: "1.4s" }} />

      <div className="ptrw-reveal relative">
        <p className="petora-eyebrow">Welcome to Petora</p>
        <h1 className="mt-2 text-[30px] font-bold leading-tight text-[color:var(--text)] sm:text-4xl [font-family:var(--font-display)]">
          Two quick <span className="ptrw-shimmer">choices</span>
        </h1>
        <p className="mt-2.5 max-w-lg text-[14.5px] leading-relaxed text-[color:var(--muted)]">
          Both save as soon as you tap them, and both can be changed any time in Settings.
        </p>
      </div>

      {authChecked && !userId && (
        <div className="ptrw-reveal petora-card mt-6 p-6 text-center" style={{ borderStyle: "dashed" }}>
          <p className="font-semibold text-[color:var(--text)] [font-family:var(--font-display)]">
            You&apos;re not signed in
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-[color:var(--muted)]">
            If you just created an account, check your email for the confirmation link, then log in
            — you&apos;ll land right back here.
          </p>
          <Link
            href="/login"
            className="ptrw-cta mt-4 inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-[#1a1030] [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
          >
            Log in
          </Link>
        </div>
      )}

      {(!authChecked || userId) && (
        <>
          {/* ── 1. value source ── */}
          <section className="ptrw-reveal mt-8" style={{ animationDelay: "80ms" }}>
            <div className="mb-3 flex items-baseline gap-2.5">
              <span
                className="grid h-7 w-7 flex-none place-items-center rounded-lg text-[13px] font-bold text-[#1a1030] [background-image:var(--ramp-h)] [font-family:var(--font-data)]"
                aria-hidden="true"
              >
                1
              </span>
              <div>
                <h2 className="text-[18px] font-bold text-[color:var(--text)] [font-family:var(--font-display)]">
                  Which values do you trade by?
                </h2>
                <p className="mt-0.5 text-[13px] text-[color:var(--muted)]">
                  Most traders use Elvebredd. Pick whichever your trading circle quotes.
                </p>
              </div>
            </div>
            <ValueSourcePicker />
          </section>

          {/* ── 2. avatar ── */}
          <section className="ptrw-reveal mt-9" style={{ animationDelay: "160ms" }}>
            <div className="mb-3 flex items-baseline gap-2.5">
              <span
                className="grid h-7 w-7 flex-none place-items-center rounded-lg text-[13px] font-bold text-[#1a1030] [background-image:var(--ramp-h)] [font-family:var(--font-data)]"
                aria-hidden="true"
              >
                2
              </span>
              <div>
                <h2 className="text-[18px] font-bold text-[color:var(--text)] [font-family:var(--font-display)]">
                  Pick your avatar
                </h2>
                <p className="mt-0.5 text-[13px] text-[color:var(--muted)]">
                  Shows next to your name on the leaderboard.
                </p>
              </div>
            </div>
            <AvatarPicker />
          </section>

          {/* ── done ── */}
          <div className="ptrw-reveal mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: "240ms" }}>
            <button
              onClick={finish}
              disabled={finishing}
              className="ptrw-cta rounded-full px-7 py-3 text-[15px] font-semibold text-[#1a1030] shadow-[0_12px_34px_-12px_rgba(168,85,247,0.7)] disabled:opacity-70 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
            >
              {finishing ? "Finishing\u2026" : "All set — take me in →"}
            </button>
            <Link
              href="/catalog"
              className="rounded-full border border-[color:var(--line-2)] px-5 py-3 text-[14px] font-semibold text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)] active:scale-95"
            >
              Browse the catalog instead
            </Link>
          </div>

          <p className="ptrw-reveal mt-5 text-[12.5px] text-[color:var(--muted)]" style={{ animationDelay: "300ms" }}>
            Want to get on the leaderboard? You&apos;ll need to{" "}
            <Link href="/settings" className="font-semibold text-[color:var(--lilac)] underline underline-offset-2">
              verify your Roblox account
            </Link>{" "}
            and scan your board — but that can wait.
          </p>
        </>
      )}
    </main>
  );
}
