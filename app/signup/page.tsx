"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

// ── email validation & typo detection ────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// The domains people actually use — a 1-2 letter typo of any of these gets a
// "did you mean?" suggestion (catches gnail.com, gmial.com, hotmial.com, ...).
const POPULAR_DOMAINS = [
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "aol.com", "proton.me", "protonmail.com", "live.com", "msn.com",
];

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[a.length][b.length];
}

/** If the email's domain looks like a typo of a popular provider, return the
 *  corrected full address; otherwise null. Exact matches return null. */
function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain || POPULAR_DOMAINS.includes(domain)) return null;
  let best: string | null = null;
  let bestD = 3; // only suggest for distance 1-2
  for (const d of POPULAR_DOMAINS) {
    const dist = editDistance(domain, d);
    if (dist > 0 && dist < bestD) { bestD = dist; best = d; }
  }
  return best ? `${local}@${best}` : null;
}

function Sparkle({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M12 2 13.8 10.2 22 12 13.8 13.8 12 22 10.2 13.8 2 12 10.2 10.2Z" />
    </svg>
  );
}

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // recompute the typo suggestion as they type; dismissible per-address
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const suggestion = useMemo(() => {
    const s = suggestEmail(email.trim());
    return s && email.trim() !== dismissedFor ? s : null;
  }, [email, dismissedFor]);

  async function signUp() {
    const cleaned = email.trim();
    if (!cleaned) return setMsg("Please enter your email.");
    if (!EMAIL_RE.test(cleaned)) return setMsg("That doesn't look like a valid email address.");
    if (!password) return setMsg("Please choose a password.");
    if (password.length < 6) return setMsg("Password must be at least 6 characters.");
    setLoading(true); setMsg(null);
    const { data, error } = await supabase.auth.signUp({
      email: cleaned,
      password,
    });
    setLoading(false);
    if (error) return setMsg(error.message);
    if (data.session) router.push("/portfolio");
    else setMsg("Account created. Check your email to confirm, then log in.");
  }

  const isSuccess = msg?.startsWith("Account created");

  const inputClass =
    "w-full rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-3 text-[15px] " +
    "text-[color:var(--text)] outline-none transition placeholder:text-[color:var(--muted)] " +
    "focus:border-[color:var(--violet)] focus:shadow-[0_0_0_3px_rgba(168,85,247,0.15)]";

  return (
    <main className="relative mx-auto flex min-h-[80vh] max-w-md items-center px-6 py-12">
      <style>{`
        @keyframes ptrsFadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ptrsTwinkle { 0%,100%{opacity:.15;transform:scale(.7)} 50%{opacity:1;transform:scale(1)} }
        @keyframes ptrsGlow { 0%,100%{opacity:.3;transform:scale(1)} 50%{opacity:.55;transform:scale(1.08)} }
        @keyframes ptrsShimmer { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
        @keyframes ptrsShake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-5px)} 40%,80%{transform:translateX(5px)} }
        @keyframes ptrsPop { 0%{opacity:0;transform:translateY(6px) scale(.96)} 100%{opacity:1;transform:translateY(0) scale(1)} }
        .ptrs-fade { opacity:0; animation: ptrsFadeUp .6s cubic-bezier(.2,.7,.2,1) forwards; }
        .ptrs-twinkle { animation: ptrsTwinkle 3.2s ease-in-out infinite; }
        .ptrs-glow { animation: ptrsGlow 7s ease-in-out infinite; }
        .ptrs-shimmer {
          background: linear-gradient(100deg,#A855F7,#C4B5FD,#FFFFFF,#C4B5FD,#A855F7);
          background-size:200% auto; -webkit-background-clip:text; background-clip:text;
          color:transparent; animation: ptrsShimmer 6s linear infinite;
        }
        .ptrs-shake { animation: ptrsShake .4s ease; }
        .ptrs-pop { animation: ptrsPop .25s cubic-bezier(.22,1,.36,1) both; }
        .ptrs-cta { transition: transform .2s ease, filter .2s ease; }
        .ptrs-cta:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.1); }
        .ptrs-cta:active:not(:disabled) { transform: translateY(0) scale(.98); }
        .ptrs-cta:disabled { opacity:.7; cursor: default; }
        @media (prefers-reduced-motion: reduce) {
          .ptrs-fade,.ptrs-twinkle,.ptrs-glow,.ptrs-shimmer,.ptrs-shake,.ptrs-pop {
            animation:none!important; opacity:1!important; transform:none!important;
          }
          .ptrs-shimmer { color:var(--lilac)!important; }
          .ptrs-cta, .ptrs-cta:hover, .ptrs-cta:active { transform:none!important; transition:none!important; }
        }
      `}</style>

      {/* ambient glow + sparkles */}
      <div
        className="ptrs-glow pointer-events-none absolute -top-10 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(168,85,247,0.22), transparent 70%)" }}
        aria-hidden="true"
      />
      <Sparkle className="ptrs-twinkle pointer-events-none absolute left-4 top-16 h-3.5 w-3.5 text-[color:var(--lilac)]" style={{ animationDelay: "0s" }} />
      <Sparkle className="ptrs-twinkle pointer-events-none absolute right-8 top-28 h-2.5 w-2.5 text-[#C4B5FD]" style={{ animationDelay: "1.4s" }} />
      <Sparkle className="ptrs-twinkle pointer-events-none absolute bottom-24 left-10 h-3 w-3 text-[#A855F7]" style={{ animationDelay: "2.2s" }} />

      <div className="ptrs-fade petora-card relative w-full p-7 sm:p-8" style={{ borderColor: "var(--line-2)", boxShadow: "0 24px 60px -30px rgba(124,58,237,0.55)" }}>
        <p className="petora-eyebrow">Join Petora</p>
        <h1 className="mt-2 text-[28px] font-bold leading-tight text-[color:var(--text)] [font-family:var(--font-display)]">
          Create your <span className="ptrs-shimmer">free account</span>
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[color:var(--muted)]">
          Track your pets, watch your net worth, and claim your spot on the leaderboard.
        </p>

        <div className="mt-6 space-y-3">
          <div>
            <label htmlFor="su-email" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
              Email
            </label>
            <input
              id="su-email"
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (msg && !isSuccess) setMsg(null); }}
              className={inputClass}
            />
            {suggestion && (
              <div className="ptrs-pop mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--line-2)] bg-[rgba(168,139,250,0.07)] px-3 py-2">
                <span className="text-[13px] text-[color:var(--muted)]">Did you mean</span>
                <button
                  type="button"
                  onClick={() => { setEmail(suggestion); setDismissedFor(null); }}
                  className="text-[13px] font-semibold text-[color:var(--lilac)] underline decoration-[color:var(--line-2)] underline-offset-2 transition hover:text-[color:var(--violet-bright)]"
                >
                  {suggestion}
                </button>
                <span className="text-[13px] text-[color:var(--muted)]">?</span>
                <button
                  type="button"
                  onClick={() => setDismissedFor(email.trim())}
                  className="ml-auto text-[12px] font-medium text-[color:var(--muted)] transition hover:text-[color:var(--text)]"
                >
                  No, keep mine
                </button>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="su-password" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
              Password
            </label>
            <div className="relative">
              <input
                id="su-password"
                placeholder="At least 6 characters"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (msg && !isSuccess) setMsg(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") signUp(); }}
                className={`${inputClass} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-[color:var(--lilac)] transition hover:text-[color:var(--violet-bright)]"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={signUp}
          disabled={loading}
          className="ptrs-cta mt-5 w-full rounded-full px-6 py-3 text-[15px] font-semibold text-[#1a1030] shadow-[0_12px_34px_-12px_rgba(168,85,247,0.7)] [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>

        <div aria-live="polite">
          {msg && (
            <p
              key={msg}
              className={`${isSuccess ? "ptrs-pop" : "ptrs-shake"} mt-3 rounded-lg border px-3 py-2.5 text-[13.5px]`}
              style={
                isSuccess
                  ? { borderColor: "var(--up)", background: "rgba(93,230,168,0.08)", color: "var(--up)" }
                  : { borderColor: "var(--down)", background: "rgba(251,113,133,0.08)", color: "var(--down)" }
              }
            >
              {msg}
            </p>
          )}
        </div>

        <p className="mt-6 border-t border-[color:var(--line)] pt-4 text-center text-[13.5px] text-[color:var(--muted)]">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[color:var(--lilac)] transition hover:text-[color:var(--violet-bright)]">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}