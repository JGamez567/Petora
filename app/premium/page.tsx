"use client";

// app/premium/page.tsx
//
// Petora Premium — explainer + pricing + buy/manage. Galaxy theme, animated.
//
// SELF-CONTAINED: no app-specific imports beyond next/link. The buy + manage
// actions POST to API routes that resolve the signed-in user SERVER-SIDE via
// cookies (same pattern as app/api/scan/route.ts), so this page never needs the
// browser Supabase client.
//
// Cancel is handled by the Stripe Customer Portal (openPortal). Lifetime is a
// one-time payment, so "manage/cancel" only applies to monthly subscribers.

import { useEffect, useState, type ReactNode, type CSSProperties } from "react";
import Link from "next/link";

type Plan = "monthly" | "lifetime";
type Busy = Plan | "portal" | null;

const FEATURES: { title: string; desc: string; soon?: boolean; icon: ReactNode }[] = [
  {
    title: "Unlimited value graphs",
    desc: "Full price history on every pet and variant, any time range. Free accounts get 3 pet graphs a day — Premium never runs out.",
    icon: (
      <path d="M3 3v18h18M7 14l3-4 3 3 5-7" />
    ),
  },
  {
    title: "Rising & falling movers",
    desc: "Live gainers and losers across the whole catalog and inside your own portfolio, so you always know what to trade for and what to trade away.",
    icon: (
      <>
        <path d="M5 11l4-4 4 4M9 7v9" />
        <path d="M19 13l-4 4-4-4M15 17V8" opacity="0.55" />
      </>
    ),
  },
  {
    title: "Portfolio value graphs",
    desc: "Watch your whole portfolio's worth move over time with clean graphs on your portfolio page.",
    icon: (
      <path d="M3 3v18h18M7 16l3-3 2 2 4-6 3 3" />
    ),
  },
  {
    title: "10 scans every day",
    desc: "Update your pets up to 10 times a day, compared to 2 on the free tier — rescan as your trades happen.",
    icon: (
      <>
        <path d="M4 7h3l2-2h6l2 2h3v12H4z" />
        <circle cx="12" cy="13" r="3.5" />
      </>
    ),
  },
  {
    title: "Crown on the leaderboard",
    desc: "A premium crown next to your name on the board and podium — everyone can see you take trading seriously.",
    icon: (
      <path d="M3 8l4.5 3L12 5l4.5 6L21 8l-1.8 9.2a1 1 0 0 1-1 .8H5.8a1 1 0 0 1-1-.8L3 8z" />
    ),
  },
  {
    title: "Trade Feedback",
    soon: true,
    desc: "Upload a trade screenshot and get an instant win / fair / loss verdict. Premium-exclusive at launch.",
    icon: (
      <>
        <path d="M12 3v18M5 7l-2 5h6zM19 7l-2 5h6z" />
        <path d="M3 12a3 3 0 006 0M15 12a3 3 0 006 0M8 19h8" opacity="0.6" />
      </>
    ),
  },
];

// Honest free-vs-premium: the catalog itself is free to browse, and free
// accounts DO get 3 pet graphs a day — Premium's pitch is "never hit a wall,"
// not "everything is locked."
const COMPARE: { label: string; free: string | boolean; premium: string | boolean }[] = [
  { label: "Browse the live pet catalog", free: true, premium: true },
  { label: "Public leaderboard & verified rankings", free: true, premium: true },
  { label: "Pet value history graphs", free: "3 / day", premium: "Unlimited" },
  { label: "Daily scans", free: "2", premium: "10" },
  { label: "Rising & falling movers", free: false, premium: true },
  { label: "Portfolio net worth graph", free: false, premium: true },
  { label: "Leaderboard crown badge", free: false, premium: true },
  { label: "Trade Feedback (soon)", free: false, premium: true },
];

function Spinner({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`h-4 w-4 animate-spin rounded-full border-2 ${
        dark ? "border-[#1a1030]/30 border-t-[#1a1030]" : "border-white/30 border-t-white"
      }`}
      aria-hidden="true"
    />
  );
}

function Sparkle({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M12 2 13.8 10.2 22 12 13.8 13.8 12 22 10.2 13.8 2 12 10.2 10.2Z" />
    </svg>
  );
}

export default function PremiumPage() {
  const [busy, setBusy] = useState<Busy>(null);
  const [err, setErr] = useState<string | null>(null);

  // Scroll-triggered reveals: below-the-fold sections fade up as they enter
  // the viewport instead of firing on load while off-screen.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("ptr-sr-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("ptr-sr-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  async function startCheckout(plan: Plan) {
    setErr(null);
    setBusy(plan);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      const map: Record<string, string> = {
        not_signed_in: "Please sign in first, then come back to upgrade.",
        already_premium: "You're already on Premium — manage your plan below.",
      };
      setErr(map[data.error] || data.message || "Couldn't start checkout. Please try again.");
    } catch {
      setErr("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function openPortal() {
    setErr(null);
    setBusy("portal");
    try {
      const res = await fetch("/api/billing-portal", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      const map: Record<string, string> = {
        not_signed_in: "Please sign in to manage your subscription.",
        no_subscription: "No active monthly subscription found on this account.",
      };
      setErr(map[data.error] || data.message || "Couldn't open the billing portal. Please try again.");
    } catch {
      setErr("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative mx-auto max-w-5xl px-4 py-10 sm:py-16">
      {/* scoped animations — prefixed to avoid global collisions */}
      <style>{`
        @keyframes ptrTwinkle { 0%,100%{opacity:.15;transform:scale(.7)} 50%{opacity:1;transform:scale(1)} }
        @keyframes ptrFadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ptrFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes ptrShimmer { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
        @keyframes ptrGlow { 0%,100%{opacity:.28;transform:scale(1)} 50%{opacity:.5;transform:scale(1.1)} }
        .ptr-fade { opacity:0; animation: ptrFadeUp .7s cubic-bezier(.2,.7,.2,1) forwards; }
        .ptr-twinkle { animation: ptrTwinkle 3.2s ease-in-out infinite; }
        .ptr-float { animation: ptrFloat 5s ease-in-out infinite; }
        .ptr-glow { animation: ptrGlow 8s ease-in-out infinite; }
        .ptr-shimmer {
          background: linear-gradient(100deg,#A855F7,#C4B5FD,#FFFFFF,#C4B5FD,#A855F7);
          background-size:200% auto;
          -webkit-background-clip:text; background-clip:text;
          color:transparent;
          animation: ptrShimmer 6s linear infinite;
        }
        .ptr-sr { opacity:0; transform:translateY(24px);
          transition: opacity .65s cubic-bezier(.22,1,.36,1), transform .65s cubic-bezier(.22,1,.36,1); }
        .ptr-sr-in { opacity:1; transform:translateY(0); }
        .ptr-card-lift { transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
        .ptr-card-lift:hover { transform: translateY(-3px); box-shadow: 0 14px 34px -16px rgba(168,85,247,.5); border-color: var(--line-2); }
        .ptr-cta { transition: transform .2s ease, filter .2s ease; }
        .ptr-cta:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.1); }
        .ptr-cta:active:not(:disabled) { transform: scale(.97); }
        @media (prefers-reduced-motion: reduce) {
          .ptr-fade,.ptr-twinkle,.ptr-float,.ptr-shimmer,.ptr-glow { animation:none!important; opacity:1!important; }
          .ptr-shimmer { color:var(--lilac)!important; }
          .ptr-sr { opacity:1!important; transform:none!important; transition:none!important; }
          .ptr-card-lift,.ptr-card-lift:hover,.ptr-cta,.ptr-cta:hover,.ptr-cta:active { transition:none!important; transform:none!important; }
        }
      `}</style>

      {/* soft glow behind the hero */}
      <div
        className="ptr-glow pointer-events-none absolute left-1/2 top-4 h-72 w-72 -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(168,85,247,0.20), transparent 70%)" }}
        aria-hidden="true"
      />

      {/* twinkling sparkles echoing the logo */}
      <Sparkle className="ptr-twinkle pointer-events-none absolute left-[8%] top-[6%] h-4 w-4 text-[color:var(--lilac)]" style={{ animationDelay: "0s" }} />
      <Sparkle className="ptr-twinkle pointer-events-none absolute right-[12%] top-[14%] h-3 w-3 text-[#C4B5FD]" style={{ animationDelay: "1.1s" }} />
      <Sparkle className="ptr-twinkle pointer-events-none absolute left-[18%] top-[28%] h-2.5 w-2.5 text-[#A855F7]" style={{ animationDelay: "2.2s" }} />
      <Sparkle className="ptr-twinkle pointer-events-none absolute right-[6%] top-[34%] h-3.5 w-3.5 text-[color:var(--lilac)]" style={{ animationDelay: "0.6s" }} />

      {/* hero */}
      <section className="ptr-fade relative text-center" style={{ animationDelay: "0ms" }}>
        <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(168,85,247,0.35)] bg-[rgba(168,85,247,0.08)] px-3 py-1 text-xs font-medium text-[color:var(--lilac)]">
          <Sparkle className="h-3 w-3" /> Petora Premium · Launch pricing
        </span>
        <h1 className="[font-family:var(--font-display)] mt-5 text-4xl font-bold leading-tight sm:text-5xl">
          <span className="ptr-shimmer">Track. Grow. Dominate.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-[color:var(--muted)]">
          Petora is free to use — Premium removes every limit. Unlimited value graphs, the movers
          that tell you what to trade for and what to trade away, and 5× the daily scans.
        </p>

        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={() => startCheckout("monthly")}
            disabled={busy !== null}
            className="ptr-cta inline-flex w-full items-center justify-center gap-2 rounded-lg [background-image:var(--ramp-h)] [font-family:var(--font-display)] px-6 py-3 font-semibold text-[#1a1030] shadow-[0_10px_30px_-12px_rgba(168,85,247,0.7)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {busy === "monthly" ? <Spinner dark /> : null}
            Get Premium — $2.99/mo
          </button>
          <button
            onClick={() => startCheckout("lifetime")}
            disabled={busy !== null}
            className="ptr-cta inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[color:var(--line-2)] px-6 py-3 font-semibold text-[color:var(--text)] hover:bg-[rgba(168,139,250,0.08)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {busy === "lifetime" ? <Spinner /> : null}
            Lifetime — $14.99 once
          </button>
        </div>
        <p className="mt-3 text-xs text-[color:var(--muted)]">Secured by Stripe · Cancel your monthly plan anytime</p>
        {err && (
          <div className="mx-auto mt-4 max-w-md rounded-lg border border-[rgba(251,113,133,0.28)] bg-[rgba(251,113,133,0.10)] px-4 py-2.5 text-sm text-[#FCA5B6]" aria-live="polite">
            {err}
          </div>
        )}
      </section>

      {/* feature grid */}
      <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            data-reveal
            className="ptr-sr petora-card ptr-card-lift group relative overflow-hidden p-5"
            style={{ transitionDelay: `${(i % 3) * 80}ms` }}
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.18),transparent_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="flex items-center justify-between">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[color:var(--line-2)] bg-[rgba(168,139,250,0.08)] transition-transform duration-200 group-hover:scale-110">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-[color:var(--lilac)]">
                  {f.icon}
                </svg>
              </span>
              {f.soon && (
                <span className="rounded-full border border-[rgba(245,200,120,0.35)] bg-[rgba(245,200,120,0.10)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#F5C878]">
                  Coming soon
                </span>
              )}
            </div>
            <h3 className="[font-family:var(--font-display)] mt-4 font-semibold text-[color:var(--text)]">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--muted)]">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* pricing */}
      <section data-reveal className="ptr-sr mt-16">
        <h2 className="[font-family:var(--font-display)] text-center text-2xl font-bold text-[color:var(--text)]">
          Pick your plan
        </h2>
        <div className="mx-auto mt-6 grid max-w-3xl gap-4 sm:grid-cols-2">
          {/* Monthly */}
          <div className="petora-card ptr-card-lift flex flex-col p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[color:var(--muted)]">Monthly</p>
              <span className="rounded-full border border-[rgba(168,85,247,0.35)] bg-[rgba(168,85,247,0.08)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--lilac)]">
                Launch price
              </span>
            </div>
            <p className="mt-2 [font-family:var(--font-data)]">
              <span className="text-4xl font-bold text-[color:var(--text)]">$2.99</span>
              <span className="text-sm text-[color:var(--muted)]"> / month</span>
              <span className="ml-2 text-sm text-[color:var(--muted)] line-through opacity-70">$4.99</span>
            </p>
            <p className="mt-2 text-sm text-[color:var(--muted)]">All Premium features. Cancel anytime.</p>
            <button
              onClick={() => startCheckout("monthly")}
              disabled={busy !== null}
              className="ptr-cta mt-6 inline-flex items-center justify-center gap-2 rounded-lg border border-[color:var(--line-2)] px-4 py-2.5 font-semibold text-[color:var(--text)] hover:bg-[rgba(168,139,250,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "monthly" ? <Spinner /> : null}
              Subscribe monthly
            </button>
          </div>

          {/* Lifetime — highlighted */}
          <div className="ptr-float relative flex flex-col rounded-xl border border-[rgba(168,85,247,0.45)] bg-[rgba(168,85,247,0.06)] p-6 shadow-[0_20px_50px_-20px_rgba(168,85,247,0.55)]">
            <span className="absolute -top-3 left-6 rounded-full [background-image:var(--ramp-h)] px-3 py-1 text-[11px] font-bold text-[#1a1030]">
              BEST VALUE
            </span>
            <p className="text-sm font-medium text-[color:var(--lilac)]">Lifetime</p>
            <p className="mt-2 [font-family:var(--font-data)]">
              <span className="petora-gradient text-4xl font-bold">$14.99</span>
              <span className="text-sm text-[color:var(--muted)]"> once</span>
              <span className="ml-2 text-sm text-[color:var(--muted)] line-through opacity-70">$24.99</span>
            </p>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              Pay once, keep Premium forever — it pays for itself in 5 months of monthly.
            </p>
            <button
              onClick={() => startCheckout("lifetime")}
              disabled={busy !== null}
              className="ptr-cta mt-6 inline-flex items-center justify-center gap-2 rounded-lg [background-image:var(--ramp-h)] [font-family:var(--font-display)] px-4 py-2.5 font-semibold text-[#1a1030] shadow-[0_10px_30px_-12px_rgba(168,85,247,0.7)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "lifetime" ? <Spinner dark /> : null}
              Get lifetime access
            </button>
          </div>
        </div>
      </section>

      {/* free vs premium */}
      <section data-reveal className="ptr-sr mt-16">
        <h2 className="[font-family:var(--font-display)] mb-5 text-center text-2xl font-bold text-[color:var(--text)]">
          Free vs Premium
        </h2>
        <div className="petora-card overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-[color:var(--line)] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)] sm:gap-x-10">
            <span>What you get</span>
            <span className="w-16 text-center">Free</span>
            <span className="w-16 text-center text-[color:var(--lilac)]">Premium</span>
          </div>
          {COMPARE.map((row, i) => (
            <div
              key={row.label}
              className={`grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-5 py-3 text-sm transition hover:bg-[rgba(168,139,250,0.04)] sm:gap-x-10 ${
                i !== COMPARE.length - 1 ? "border-b border-[color:var(--line)]" : ""
              }`}
            >
              <span className="text-[color:var(--text)]">{row.label}</span>
              <Cell value={row.free} />
              <Cell value={row.premium} highlight />
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-[color:var(--muted)]">
          Free means free — browse every pet and the full leaderboard without paying a thing.
          Premium removes the daily limits and unlocks the trading tools.
        </p>
      </section>

      {/* manage / cancel */}
      <section data-reveal className="ptr-sr mt-12 text-center">
        <p className="text-sm text-[color:var(--muted)]">
          Already a member?{" "}
          <button
            onClick={openPortal}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 font-medium text-[color:var(--lilac)] underline underline-offset-2 transition hover:text-[color:var(--text)] disabled:opacity-50"
          >
            {busy === "portal" ? <Spinner /> : null}
            Manage billing or cancel →
          </button>
        </p>
        <p className="mx-auto mt-2 max-w-md text-xs text-[color:var(--muted)]">
          Manage and cancel apply to the monthly plan. Lifetime is a one-time purchase — nothing to cancel.
        </p>
      </section>

      <p className="mt-12 text-center text-xs text-[color:var(--muted)]">
        Questions? <Link href="/how-to-use" className="petora-howto-link">See the guide</Link> or reach us at petoratracker@gmail.com.
      </p>
    </div>
  );
}

function Cell({ value, highlight }: { value: string | boolean; highlight?: boolean }) {
  if (typeof value === "string") {
    return (
      <span className={`w-16 text-center [font-family:var(--font-data)] font-semibold ${highlight ? "text-[color:var(--lilac)]" : "text-[color:var(--text)]"}`}>
        {value}
      </span>
    );
  }
  return (
    <span className="flex w-16 justify-center">
      {value ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 ${highlight ? "text-[color:var(--up)]" : "text-[color:var(--text)]"}`}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <span className="text-[color:var(--muted)] opacity-50">—</span>
      )}
    </span>
  );
}