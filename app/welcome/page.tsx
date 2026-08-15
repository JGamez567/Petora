"use client";
// → app/welcome/page.tsx   (URL: /welcome)
//
// Post-signup onboarding. Three sections, ALL optional:
//   1. Support Petora (Premium) — or keep using it free
//   2. Profile avatar
//   3. Roblox verification
//
// Nothing here blocks entry to the app. The avatar picker saves itself the
// moment you tap; "Finish" only stamps profiles.onboarded_at and sends you on,
// so bailing out early still keeps whatever you picked.
//
// The value-source step was REMOVED — Petora reads Elvebredd everywhere now,
// and AMVGG appears only as the Trade Calculator's second-opinion toggle,
// which isn't a stored preference.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AvatarPicker from "@/components/AvatarPicker";

// Kept in one place so they can't drift from /premium. These are DISPLAY only
// — Stripe holds the real prices and its prices are immutable, so if these
// ever disagree, Stripe wins and this is the thing that's wrong.
const PLANS = [
  {
    id: "monthly",
    name: "Monthly",
    price: "$2.99",
    period: "/month",
    blurb: "Try it, cancel whenever.",
    accent: "168,85,247",
    featured: false,
  },
  {
    id: "lifetime",
    name: "Lifetime",
    price: "$14.99",
    period: "once",
    blurb: "Pay once, keep it forever. Works out cheaper after five months.",
    accent: "251,191,36",
    featured: true,
  },
];

const PERKS = [
  "Unlimited demand verdicts in the Trade Calculator",
  "10 scans a day instead of 2",
  "Unlimited value graphs and the full Movers list",
  "A crown next to your name on the leaderboard",
];

function Sparkle({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M12 2 13.8 10.2 22 12 13.8 13.8 12 22 10.2 13.8 2 12 10.2 10.2Z" />
    </svg>
  );
}

function SectionHead({ n, title, sub, optional }: { n: number; title: string; sub: string; optional?: boolean }) {
  return (
    <div className="mb-3 flex items-baseline gap-2.5">
      <span
        className="grid h-7 w-7 flex-none place-items-center rounded-lg text-[13px] font-bold text-[#1a1030] [background-image:var(--ramp-h)] [font-family:var(--font-data)]"
        aria-hidden="true"
      >
        {n}
      </span>
      <div className="min-w-0">
        <h2 className="flex flex-wrap items-center gap-2 text-[18px] font-bold text-[color:var(--text)] [font-family:var(--font-display)]">
          {title}
          {optional && (
            <span className="rounded-full border border-[color:var(--line-2)] px-2 py-px text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
              Optional
            </span>
          )}
        </h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-[color:var(--muted)]">{sub}</p>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [verified, setVerified] = useState(false);
  const [premium, setPremium] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        // roblox_verified_at and is_premium are both PROTECTED columns — they
        // can be read here but only service_role can write them, which is why
        // verification goes through /oauth/callback and premium through the
        // Stripe webhook rather than anything on this page.
        const { data: prof } = await supabase
          .from("profiles")
          .select("roblox_verified_at, is_premium")
          .eq("id", uid)
          .single();
        setVerified(!!prof?.roblox_verified_at);
        setPremium(!!prof?.is_premium);
      }
      setAuthChecked(true);
    })();
  }, []);

  async function finish() {
    if (finishing) return;
    setFinishing(true);
    if (userId) {
      // Stamp onboarding as done. Failure here is not worth blocking on — the
      // avatar already saved itself when it was picked.
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
        .ptrw-plan { transition: transform .22s cubic-bezier(.22,1,.36,1), border-color .22s ease; }
        .ptrw-plan:hover { transform: translateY(-3px); }
        @media (prefers-reduced-motion: reduce) {
          .ptrw-reveal,.ptrw-twinkle,.ptrw-glow,.ptrw-shimmer {
            animation:none!important; opacity:1!important; transform:none!important;
          }
          .ptrw-shimmer { color:var(--lilac)!important; }
          .ptrw-cta,.ptrw-cta:hover,.ptrw-cta:active { transform:none!important; transition:none!important; }
          .ptrw-plan,.ptrw-plan:hover { transform:none!important; transition:none!important; }
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
          You&apos;re <span className="ptrw-shimmer">in</span>
        </h1>
        <p className="mt-2.5 max-w-lg text-[14.5px] leading-relaxed text-[color:var(--muted)]">
          Your account is ready to use right now. Everything below is optional — skip straight to the
          bottom if you&apos;d rather just get started.
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
          {/* ── 1. support Petora ── */}
          <section className="ptrw-reveal mt-8" style={{ animationDelay: "80ms" }}>
            <SectionHead
              n={1}
              title="Want to support Petora?"
              optional
              sub="Petora is built and paid for by one person. Premium keeps it running — but the free version isn't a trial, and it isn't going away."
            />

            {premium ? (
              <div
                className="petora-card p-5"
                style={{ borderColor: "rgba(251,191,36,0.45)", background: "rgba(251,191,36,0.06)" }}
              >
                <p className="font-semibold" style={{ color: "#FBBF24" }}>
                  You already have Premium — thank you.
                </p>
                <p className="mt-1 text-[13px] text-[color:var(--muted)]">
                  Unlimited demand verdicts, 10 scans a day, and the full Movers list are all live on
                  your account.
                </p>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {PLANS.map((p) => (
                    <Link
                      key={p.id}
                      href="/premium"
                      className="ptrw-plan relative rounded-2xl border p-5"
                      style={{
                        borderColor: p.featured ? `rgba(${p.accent},0.55)` : "var(--line)",
                        background: p.featured ? `rgba(${p.accent},0.07)` : "rgba(168,139,250,0.04)",
                      }}
                    >
                      {p.featured && (
                        <span
                          className="absolute -top-2.5 right-4 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          style={{ background: `rgb(${p.accent})`, color: "#2A1E05" }}
                        >
                          Best value
                        </span>
                      )}
                      <p className="text-[12px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                        {p.name}
                      </p>
                      <p className="mt-1 flex items-baseline gap-1">
                        <span
                          className="text-[28px] font-bold leading-none [font-family:var(--font-display)]"
                          style={{ color: `rgb(${p.accent})` }}
                        >
                          {p.price}
                        </span>
                        <span className="text-[12px] text-[color:var(--muted)]">{p.period}</span>
                      </p>
                      <p className="mt-2 text-[12.5px] leading-relaxed text-[color:var(--muted)]">{p.blurb}</p>
                    </Link>
                  ))}
                </div>

                <ul className="mt-4 grid gap-1.5">
                  {PERKS.map((perk) => (
                    <li key={perk} className="flex items-start gap-2 text-[13px] text-[color:var(--muted)]">
                      <span className="mt-[3px] flex-none text-[color:var(--up)]" aria-hidden="true">✓</span>
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>

                {/* Deliberately as visible as the plan cards. A lot of Petora's
                    users are kids; a paywall that whispers "no thanks" in grey
                    6pt text would be a dark pattern, and the free tier is a
                    genuine product, not a trap. */}
                <div
                  className="mt-4 rounded-2xl border p-4"
                  style={{ borderColor: "var(--line-2)", background: "rgba(168,139,250,0.05)" }}
                >
                  <p className="text-[13.5px] font-semibold text-[color:var(--text)] [font-family:var(--font-display)]">
                    Not right now? That&apos;s completely fine.
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[color:var(--muted)]">
                    Free Petora includes the scanner, the full catalog, the leaderboard and the trade
                    calculator. You can upgrade later from any page — nothing expires.
                  </p>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-[color:var(--muted)]">
                    If you&apos;re under 18, ask whoever pays for the card before buying anything.
                  </p>
                </div>
              </>
            )}
          </section>

          {/* ── 2. avatar ── */}
          <section className="ptrw-reveal mt-9" style={{ animationDelay: "160ms" }}>
            <SectionHead
              n={2}
              title="Pick your avatar"
              sub="Shows next to your name on the leaderboard. Saves as soon as you tap one."
            />
            <AvatarPicker />
          </section>

          {/* ── 3. roblox verification ── */}
          <section className="ptrw-reveal mt-9" style={{ animationDelay: "240ms" }}>
            <SectionHead
              n={3}
              title="Verify your Roblox account"
              optional
              sub="Only needed to appear on the leaderboard. Everything else works without it."
            />
            <div className="petora-card p-5" style={{ borderColor: "var(--line-2)" }}>
              {verified ? (
                <p className="rounded-lg border border-[rgba(93,230,168,0.28)] bg-[rgba(93,230,168,0.10)] px-3.5 py-2.5 text-sm text-[color:var(--up)]">
                  ✓ Already verified — you&apos;re eligible for the leaderboard.
                </p>
              ) : (
                <>
                  <p className="text-[13px] leading-relaxed text-[color:var(--muted)]">
                    Verifying proves the board you scan is really yours, which is what keeps the
                    leaderboard honest. Petora only reads your username and user ID — it can&apos;t
                    touch your pets, your Robux, or your account.
                  </p>
                  <a
                    href="/oauth/login"
                    className="ptrw-cta mt-4 inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-[#1a1030] shadow-[0_12px_34px_-12px_rgba(168,85,247,0.7)] [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
                  >
                    Verify with Roblox
                  </a>
                  <p className="mt-2 text-[11.5px] text-[color:var(--muted)]">
                    Heads up: this sends you to Settings when it finishes, not back here. You can
                    also do it any time later.
                  </p>
                </>
              )}
            </div>
          </section>

          {/* ── done ── */}
          <div className="ptrw-reveal mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: "320ms" }}>
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

          <p className="ptrw-reveal mt-5 text-[12.5px] leading-relaxed text-[color:var(--muted)]" style={{ animationDelay: "380ms" }}>
            Ready to see what your board is worth? Head to{" "}
            <Link href="/scan" className="font-semibold text-[color:var(--lilac)] underline underline-offset-2">
              Scan
            </Link>{" "}
            and drop in a screenshot of your inventory.
          </p>
        </>
      )}
    </main>
  );
}