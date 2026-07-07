import Link from "next/link";

export default function PremiumCancelled() {
  return (
    <main className="relative mx-auto flex min-h-[calc(100vh-120px)] max-w-5xl items-center justify-center overflow-hidden px-6 py-16">
      <style>{`
        @keyframes ptrcFadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ptrcGlow { 0%,100%{opacity:.22;transform:scale(1)} 50%{opacity:.42;transform:scale(1.1)} }
        @keyframes ptrcRingPop { 0%{transform:scale(.5);opacity:0} 60%{transform:scale(1.06);opacity:1} 100%{transform:scale(1)} }
        @keyframes ptrcXDraw { from{stroke-dashoffset:1} to{stroke-dashoffset:0} }
        .ptrc-fade { opacity:0; animation: ptrcFadeUp .6s cubic-bezier(.22,1,.36,1) forwards; }
        .ptrc-glow { animation: ptrcGlow 9s ease-in-out infinite; }
        .ptrc-ring { animation: ptrcRingPop .55s cubic-bezier(.22,1,.36,1) both; }
        .ptrc-x { stroke-dasharray:1; stroke-dashoffset:1; animation: ptrcXDraw .5s ease-out .3s both; }
        @media (prefers-reduced-motion: reduce) {
          .ptrc-fade,.ptrc-glow,.ptrc-ring,.ptrc-x {
            animation:none!important; opacity:1!important; transform:none!important;
            stroke-dashoffset:0!important;
          }
        }
      `}</style>

      <div
        className="ptrc-glow pointer-events-none absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(168,139,250,0.16), transparent 70%)" }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-lg text-center">
        <div className="ptrc-fade">
          <span
            className="ptrc-ring mx-auto grid h-20 w-20 place-items-center rounded-full"
            style={{ background: "rgba(168,139,250,0.10)", border: "2px solid var(--line-2)" }}
          >
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path className="ptrc-x" d="M18 6 6 18M6 6l12 12" pathLength={1} />
            </svg>
          </span>
        </div>

        <div className="ptrc-fade mt-6" style={{ animationDelay: "80ms" }}>
          <h1 className="text-[clamp(28px,5vw,38px)] font-bold leading-tight text-[color:var(--text)] [font-family:var(--font-display)]">
            Checkout cancelled
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[color:var(--muted)]">
            No worries — nothing was charged. Your card was not billed, and your account is unchanged.
          </p>
        </div>

        <div
          className="petora-card ptrc-fade mt-8 p-5 text-left"
          style={{ animationDelay: "160ms", borderColor: "var(--line-2)" }}
        >
          <p className="petora-eyebrow mb-3">If your payment didn&apos;t go through</p>
          <ul className="space-y-2 text-[13.5px] text-[color:var(--muted)]">
            <li>• Double check the card number, expiry, and CVC</li>
            <li>• Make sure the card allows online/international payments</li>
            <li>• Try a different card or payment method</li>
            <li>• Still stuck? Reach out and we&apos;ll help sort it out</li>
          </ul>
        </div>

        <div className="ptrc-fade mt-7 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "260ms" }}>
          <Link
            href="/premium"
            className="rounded-full px-7 py-3 text-[15px] font-semibold text-[#1a1030] shadow-[0_12px_34px_-12px_rgba(168,85,247,0.7)] transition hover:brightness-110 active:scale-95 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
          >
            Try again →
          </Link>
          <Link
            href="/catalog"
            className="rounded-full border border-[color:var(--line-2)] px-6 py-3 text-[15px] font-semibold text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)] active:scale-95"
          >
            Keep browsing
          </Link>
        </div>
      </div>
    </main>
  );
}