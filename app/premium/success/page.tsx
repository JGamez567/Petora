"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

// The buyer lands here straight from Stripe Checkout. Payment is done, but
// profiles.is_premium is flipped by the WEBHOOK, which can land a few seconds
// after the redirect. So we poll until it's true before celebrating — otherwise
// we'd say "you're premium!" while the app still shows locked features.
type Status = "checking" | "active" | "slow" | "noauth";

const POLL_INTERVAL_MS = 2000;
const MAX_TRIES = 15; // ~30s before we stop polling and show the "slow" note

// Deterministic pseudo-random (seeded by index) so the confetti layout is
// identical between server and client render — Math.random() here would cause
// a hydration mismatch.
function seeded(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const CONFETTI_COLORS = ["#A855F7", "#C4B5FD", "#5DE6A8", "#F9A8D4", "#7DD3FC"];
const CONFETTI = Array.from({ length: 26 }, (_, i) => ({
  left: seeded(i, 1) * 100,
  delay: seeded(i, 2) * 2.2,
  duration: 3.2 + seeded(i, 3) * 2.4,
  size: 6 + seeded(i, 4) * 7,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  drift: (seeded(i, 5) - 0.5) * 120,
  spin: 240 + seeded(i, 6) * 480,
}));

const UNLOCKED = [
  { title: "Unlimited pet graphs", body: "Every pet, every variant, every time range — no daily cap." },
  { title: "Rising & Falling movers", body: "Live gainers and losers across the whole market." },
  { title: "Net worth over time", body: "Your full portfolio history, charted." },
  { title: "More daily scans", body: "A bigger scan budget for keeping your board current." },
];

export default function PremiumSuccess() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let cancelled = false;
    let tries = 0;

    async function poll() {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) { if (!cancelled) setStatus("noauth"); return; }

      const check = async () => {
        if (cancelled) return;
        tries += 1;
        const { data: prof } = await supabase
          .from("profiles").select("is_premium").eq("id", uid).single();
        if (cancelled) return;
        if (prof?.is_premium) { setStatus("active"); return; }
        if (tries >= MAX_TRIES) { setStatus("slow"); return; }
        setTimeout(check, POLL_INTERVAL_MS);
      };
      check();
    }
    poll();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="relative mx-auto flex min-h-[calc(100vh-120px)] max-w-5xl items-center justify-center overflow-hidden px-6 py-16">
      <style>{`
        @keyframes ptrpFadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ptrpGlow { 0%,100%{opacity:.28;transform:scale(1)} 50%{opacity:.55;transform:scale(1.12)} }
        @keyframes ptrpShimmer { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
        @keyframes ptrpCheckDraw { from{stroke-dashoffset:1} to{stroke-dashoffset:0} }
        @keyframes ptrpRingPop { 0%{transform:scale(.5);opacity:0} 60%{transform:scale(1.08);opacity:1} 100%{transform:scale(1)} }
        @keyframes ptrpSpin { to{transform:rotate(360deg)} }
        @keyframes ptrpConfetti {
          0% { transform: translateY(-10vh) translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(105vh) translateX(var(--drift)) rotate(var(--spin)); opacity: 0; }
        }
        .ptrp-fade { opacity:0; animation: ptrpFadeUp .6s cubic-bezier(.22,1,.36,1) forwards; }
        .ptrp-glow { animation: ptrpGlow 8s ease-in-out infinite; }
        .ptrp-shimmer {
          background: linear-gradient(100deg,#A855F7,#C4B5FD,#FFFFFF,#C4B5FD,#A855F7);
          background-size:200% auto; -webkit-background-clip:text; background-clip:text;
          color:transparent; animation: ptrpShimmer 6s linear infinite;
        }
        .ptrp-ring { animation: ptrpRingPop .55s cubic-bezier(.22,1,.36,1) both; }
        .ptrp-check { stroke-dasharray:1; stroke-dashoffset:1; animation: ptrpCheckDraw .6s ease-out .35s both; }
        .ptrp-spin { animation: ptrpSpin .9s linear infinite; }
        .ptrp-confetti { position:absolute; top:0; animation: ptrpConfetti linear both infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ptrp-fade,.ptrp-glow,.ptrp-shimmer,.ptrp-ring,.ptrp-check,.ptrp-spin {
            animation:none!important; opacity:1!important; transform:none!important;
            stroke-dashoffset:0!important;
          }
          .ptrp-shimmer { color:var(--lilac)!important; }
          .ptrp-confetti { display:none!important; }
        }
      `}</style>

      {/* confetti — only once premium is confirmed */}
      {status === "active" && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              className="ptrp-confetti rounded-[2px]"
              style={{
                left: `${c.left}%`,
                width: c.size,
                height: c.size * 0.45,
                background: c.color,
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.duration}s`,
                ["--drift" as any]: `${c.drift}px`,
                ["--spin" as any]: `${c.spin}deg`,
              }}
            />
          ))}
        </div>
      )}

      <div
        className="ptrp-glow pointer-events-none absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(168,85,247,0.22), transparent 70%)" }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-lg text-center">
        {/* status icon */}
        <div className="ptrp-fade">
          {status === "active" ? (
            <span className="ptrp-ring mx-auto grid h-20 w-20 place-items-center rounded-full" style={{ background: "rgba(93,230,168,0.12)", border: "2px solid var(--up)", boxShadow: "0 0 40px -8px rgba(93,230,168,0.55)" }}>
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="var(--up)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path className="ptrp-check" d="M20 6 9 17l-5-5" pathLength={1} />
              </svg>
            </span>
          ) : (
            <span className="mx-auto grid h-20 w-20 place-items-center rounded-full" style={{ background: "rgba(168,139,250,0.10)", border: "2px solid var(--line-2)" }}>
              <svg className="ptrp-spin h-9 w-9" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="rgba(168,139,250,0.25)" strokeWidth="3" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="var(--lilac)" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </span>
          )}
        </div>

        {/* headline per state */}
        <div className="ptrp-fade mt-6" style={{ animationDelay: "80ms" }} aria-live="polite">
          {status === "active" && (
            <>
              <h1 className="text-[clamp(28px,5vw,38px)] font-bold leading-tight text-[color:var(--text)] [font-family:var(--font-display)]">
                Welcome to <span className="ptrp-shimmer">Premium</span>
              </h1>
              <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[color:var(--muted)]">
                Payment confirmed and your account is upgraded. Everything below is unlocked right now.
              </p>
            </>
          )}
          {(status === "checking") && (
            <>
              <h1 className="text-[clamp(28px,5vw,38px)] font-bold leading-tight text-[color:var(--text)] [font-family:var(--font-display)]">
                Payment received!
              </h1>
              <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[color:var(--muted)]">
                Activating Premium on your account — this usually takes a few seconds…
              </p>
            </>
          )}
          {status === "slow" && (
            <>
              <h1 className="text-[clamp(28px,5vw,38px)] font-bold leading-tight text-[color:var(--text)] [font-family:var(--font-display)]">
                Payment received!
              </h1>
              <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[color:var(--muted)]">
                Activation is taking a little longer than usual. Your payment went through — give it a
                minute and refresh this page, and if Premium still hasn&apos;t appeared, contact us and
                we&apos;ll sort it out right away.
              </p>
            </>
          )}
          {status === "noauth" && (
            <>
              <h1 className="text-[clamp(28px,5vw,38px)] font-bold leading-tight text-[color:var(--text)] [font-family:var(--font-display)]">
                Payment received!
              </h1>
              <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[color:var(--muted)]">
                You&apos;re not logged in on this device — log in to the account you purchased with and
                Premium will be waiting for you.
              </p>
            </>
          )}
        </div>

        {/* what's unlocked */}
        <div className="petora-card ptrp-fade mt-8 p-5 text-left" style={{ animationDelay: "160ms", borderColor: "var(--line-2)", boxShadow: "0 24px 60px -30px rgba(124,58,237,0.5)" }}>
          <p className="petora-eyebrow mb-3">{status === "active" ? "Now unlocked" : "What you're getting"}</p>
          <ul className="space-y-3">
            {UNLOCKED.map((u, i) => (
              <li key={u.title} className="ptrp-fade flex items-start gap-3" style={{ animationDelay: `${240 + i * 90}ms` }}>
                <svg className="mt-0.5 h-4 w-4 flex-none text-[color:var(--up)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <div>
                  <p className="text-[14.5px] font-semibold text-[color:var(--text)]">{u.title}</p>
                  <p className="text-[13px] text-[color:var(--muted)]">{u.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* CTAs */}
        <div className="ptrp-fade mt-7 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "320ms" }}>
          {status === "noauth" ? (
            <Link
              href="/login"
              className="rounded-full px-7 py-3 text-[15px] font-semibold text-[#1a1030] shadow-[0_12px_34px_-12px_rgba(168,85,247,0.7)] transition hover:brightness-110 active:scale-95 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
            >
              Log in
            </Link>
          ) : (
            <>
              <Link
                href="/catalog"
                className="rounded-full px-7 py-3 text-[15px] font-semibold text-[#1a1030] shadow-[0_12px_34px_-12px_rgba(168,85,247,0.7)] transition hover:brightness-110 active:scale-95 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
              >
                Explore the market →
              </Link>
              <Link
                href="/portfolio"
                className="rounded-full border border-[color:var(--line-2)] px-6 py-3 text-[15px] font-semibold text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)] active:scale-95"
              >
                My portfolio
              </Link>
            </>
          )}
        </div>

        <p className="ptrp-fade mt-6 text-[12px] text-[color:var(--muted)]" style={{ animationDelay: "380ms" }}>
          A receipt has been emailed to you by Stripe. Manage or cancel anytime from the Premium page.
        </p>
      </div>
    </main>
  );
}