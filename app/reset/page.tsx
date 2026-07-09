"use client";
// → app/reset/page.tsx   (URL: /reset)
// Step 1 of password reset: user enters their email, we send the recovery
// link. The link lands on /reset/update where the new password is set.

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function ResetRequest() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendReset() {
    if (loading) return;
    const addr = email.trim();
    if (!addr) { setMsg("Please enter your email."); return; }
    setLoading(true); setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(addr, {
      redirectTo: `${window.location.origin}/reset/update`,
    });
    setLoading(false);
    if (error) {
      // rate limits are the only error worth surfacing; anything else gets the
      // same neutral success screen so the form can't be used to probe which
      // emails have accounts
      if (error.message.toLowerCase().includes("rate")) {
        setMsg("Too many requests — wait a minute, then try again.");
        return;
      }
    }
    setSent(true);
  }

  return (
    <main className="relative mx-auto flex min-h-[calc(100vh-120px)] max-w-5xl items-center justify-center px-6 py-16">
      <style>{`
        @keyframes ptrrFadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ptrrGlow { 0%,100%{opacity:.28;transform:scale(1)} 50%{opacity:.5;transform:scale(1.12)} }
        @keyframes ptrrSpin { to{transform:rotate(360deg)} }
        .ptrr-fade { opacity:0; animation: ptrrFadeUp .6s cubic-bezier(.22,1,.36,1) forwards; }
        .ptrr-glow { animation: ptrrGlow 8s ease-in-out infinite; }
        .ptrr-spin { animation: ptrrSpin .8s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ptrr-fade,.ptrr-glow,.ptrr-spin { animation:none!important; opacity:1!important; transform:none!important; }
        }
      `}</style>

      <div
        className="ptrr-glow pointer-events-none absolute left-1/2 top-1/3 h-80 w-80 -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(168,85,247,0.20), transparent 70%)" }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md">
        <div className="ptrr-fade mb-6 text-center">
          <h1 className="text-2xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">
            Reset your password
          </h1>
          <p className="mt-1.5 text-sm text-[color:var(--muted)]">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        <div className="petora-card ptrr-fade p-6 sm:p-7" style={{ animationDelay: "80ms", borderColor: "var(--line-2)", boxShadow: "0 24px 60px -30px rgba(124,58,237,0.55)" }}>
          {sent ? (
            <div className="text-center" aria-live="polite">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full" style={{ background: "rgba(93,230,168,0.12)", border: "2px solid var(--up)" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--up)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <p className="mt-4 font-semibold text-[color:var(--text)] [font-family:var(--font-display)]">Check your email</p>
              <p className="mx-auto mt-1.5 max-w-xs text-[13.5px] leading-relaxed text-[color:var(--muted)]">
                If an account exists for <span className="text-[color:var(--text)]">{email.trim()}</span>,
                a reset link is on its way. Check spam if it doesn&apos;t show up in a couple of minutes.
              </p>
              <button
                onClick={() => { setSent(false); setMsg(null); }}
                className="mt-4 text-sm font-medium text-[color:var(--lilac)] underline underline-offset-2 transition hover:text-[color:var(--text)]"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]" htmlFor="reset-email">
                Email
              </label>
              <input
                id="reset-email"
                placeholder="you@example.com"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendReset(); }}
                className="w-full rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-2.5 text-[15px] text-[color:var(--text)] outline-none transition placeholder:text-[color:var(--muted)] focus:border-[color:var(--violet)] focus:shadow-[0_0_0_3px_rgba(168,85,247,0.15)]"
              />
              <button
                onClick={sendReset}
                disabled={loading}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold text-[#1a1030] shadow-[0_12px_34px_-12px_rgba(168,85,247,0.7)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
              >
                {loading && (
                  <svg className="ptrr-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="rgba(26,16,48,0.3)" strokeWidth="3" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="#1a1030" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                )}
                Send reset link
              </button>
              <div aria-live="polite">
                {msg && (
                  <p className="mt-3 rounded-lg border border-[rgba(251,113,133,0.28)] bg-[rgba(251,113,133,0.08)] px-3.5 py-2.5 text-[13.5px] leading-snug text-[#FCA5B6]">
                    {msg}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <p className="ptrr-fade mt-5 text-center text-sm text-[color:var(--muted)]" style={{ animationDelay: "160ms" }}>
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-[color:var(--lilac)] transition hover:text-[color:var(--violet-bright)] hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </main>
  );
}