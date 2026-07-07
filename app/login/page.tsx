"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

function Sparkle({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M12 2 13.8 10.2 22 12 13.8 13.8 12 22 10.2 13.8 2 12 10.2 10.2Z" />
    </svg>
  );
}

// Map raw Supabase auth errors to friendlier copy.
function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match. Double-check and try again.";
  if (m.includes("email not confirmed")) return "Your email isn't confirmed yet — check your inbox for the confirmation link.";
  if (m.includes("too many requests") || m.includes("rate limit")) return "Too many attempts — wait a minute, then try again.";
  return message;
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(0); // increments to retrigger the shake animation
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function fail(text: string) {
    setMsg(text);
    setShake((s) => s + 1);
  }

  async function logIn() {
    if (loading) return;
    if (!email.trim()) return fail("Please enter your email.");
    if (!password) return fail("Please enter your password.");
    setLoading(true); setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) return fail(friendlyError(error.message));
    router.push("/portfolio");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") logIn();
  }

  return (
    <main className="relative mx-auto flex min-h-[calc(100vh-120px)] max-w-5xl items-center justify-center px-6 py-16">
      <style>{`
        @keyframes ptrlFadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ptrlTwinkle { 0%,100%{opacity:.12;transform:scale(.7)} 50%{opacity:1;transform:scale(1)} }
        @keyframes ptrlGlow { 0%,100%{opacity:.28;transform:scale(1)} 50%{opacity:.5;transform:scale(1.12)} }
        @keyframes ptrlShimmer { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
        @keyframes ptrlShake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-6px)} 40%{transform:translateX(6px)}
          60%{transform:translateX(-4px)} 80%{transform:translateX(4px)}
        }
        @keyframes ptrlSpin { to{transform:rotate(360deg)} }
        .ptrl-fade { opacity:0; animation: ptrlFadeUp .6s cubic-bezier(.22,1,.36,1) forwards; }
        .ptrl-twinkle { animation: ptrlTwinkle 3.4s ease-in-out infinite; }
        .ptrl-glow { animation: ptrlGlow 8s ease-in-out infinite; }
        .ptrl-shimmer {
          background: linear-gradient(100deg,#A855F7,#C4B5FD,#FFFFFF,#C4B5FD,#A855F7);
          background-size:200% auto; -webkit-background-clip:text; background-clip:text;
          color:transparent; animation: ptrlShimmer 6s linear infinite;
        }
        .ptrl-shake { animation: ptrlShake .4s ease-in-out; }
        .ptrl-spin { animation: ptrlSpin .8s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ptrl-fade,.ptrl-twinkle,.ptrl-glow,.ptrl-shimmer,.ptrl-shake,.ptrl-spin {
            animation:none!important; opacity:1!important; transform:none!important;
          }
          .ptrl-shimmer { color:var(--lilac)!important; }
        }
      `}</style>

      {/* ambient glow + sparkles behind the card */}
      <div
        className="ptrl-glow pointer-events-none absolute left-1/2 top-1/3 h-80 w-80 -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(168,85,247,0.20), transparent 70%)" }}
        aria-hidden="true"
      />
      <Sparkle className="ptrl-twinkle pointer-events-none absolute left-[18%] top-[22%] h-3.5 w-3.5 text-[color:var(--lilac)]" style={{ animationDelay: "0s" }} />
      <Sparkle className="ptrl-twinkle pointer-events-none absolute right-[20%] top-[16%] h-3 w-3 text-[#C4B5FD]" style={{ animationDelay: "1.4s" }} />
      <Sparkle className="ptrl-twinkle pointer-events-none absolute left-[26%] bottom-[18%] h-2.5 w-2.5 text-[#A855F7]" style={{ animationDelay: "2.2s" }} />
      <Sparkle className="ptrl-twinkle pointer-events-none absolute right-[24%] bottom-[26%] h-3 w-3 text-[color:var(--lilac)]" style={{ animationDelay: "0.8s" }} />

      <div className="relative w-full max-w-md">
        {/* wordmark + welcome */}
        <div className="ptrl-fade mb-6 text-center">
          <Link href="/" className="inline-block text-[26px] font-bold leading-none [font-family:var(--font-display)]">
            <span className="ptrl-shimmer">Petora</span>
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-[color:var(--muted)]">
            Log in to see how your pets are doing.
          </p>
        </div>

        {/* login card */}
        <div
          key={shake}
          className={`petora-card ptrl-fade p-6 sm:p-7 ${shake > 0 ? "ptrl-shake" : ""}`}
          style={{ animationDelay: "80ms", borderColor: "var(--line-2)", boxShadow: "0 24px 60px -30px rgba(124,58,237,0.55)" }}
        >
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            placeholder="you@example.com"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={onKeyDown}
            className="w-full rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-2.5 text-[15px] text-[color:var(--text)] outline-none transition placeholder:text-[color:var(--muted)] focus:border-[color:var(--violet)] focus:shadow-[0_0_0_3px_rgba(168,85,247,0.15)]"
          />

          <label className="mb-1.5 mt-4 block text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]" htmlFor="login-password">
            Password
          </label>
          <div className="relative">
            <input
              id="login-password"
              placeholder="Your password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onKeyDown}
              className="w-full rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-2.5 pr-16 text-[15px] text-[color:var(--text)] outline-none transition placeholder:text-[color:var(--muted)] focus:border-[color:var(--violet)] focus:shadow-[0_0_0_3px_rgba(168,85,247,0.15)]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2.5 py-1 text-[13px] font-semibold text-[color:var(--lilac)] transition hover:bg-[rgba(168,139,250,0.10)] active:scale-95"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <button
            onClick={logIn}
            disabled={loading}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold text-[#1a1030] shadow-[0_12px_34px_-12px_rgba(168,85,247,0.7)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:hover:brightness-100 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
          >
            {loading ? (
              <>
                <svg className="ptrl-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="rgba(26,16,48,0.3)" strokeWidth="3" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="#1a1030" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Logging in…
              </>
            ) : (
              "Log in"
            )}
          </button>

          <div aria-live="polite">
            {msg && (
              <p className="mt-3 rounded-lg border border-[rgba(251,113,133,0.28)] bg-[rgba(251,113,133,0.08)] px-3.5 py-2.5 text-[13.5px] leading-snug text-[#FCA5B6]">
                {msg}
              </p>
            )}
          </div>
        </div>

        {/* sign up */}
        <p className="ptrl-fade mt-5 text-center text-sm text-[color:var(--muted)]" style={{ animationDelay: "160ms" }}>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-[color:var(--lilac)] transition hover:text-[color:var(--violet-bright)] hover:underline">
            Sign up free
          </Link>
        </p>

        <p className="ptrl-fade mt-8 text-center text-[12px] font-semibold tracking-[0.22em] text-[color:var(--muted)] [font-family:var(--font-display)]" style={{ animationDelay: "220ms" }}>
          TRACK. <span className="text-[color:var(--violet-bright)]">GROW.</span> DOMINATE.
        </p>
      </div>
    </main>
  );
}