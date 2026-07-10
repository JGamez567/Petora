"use client";
// → app/reset/update/page.tsx   (URL: /reset/update)
// Step 2 of password reset: the email link lands here.
//
// Handles BOTH link styles:
//  1. token_hash (?token_hash=...&type=recovery) — verified here via
//     verifyOtp. Works in ANY browser, even if it's not the one that
//     requested the reset (email apps love opening links in their own
//     built-in browser, which breaks the PKCE style).
//  2. PKCE/implicit (default Supabase template) — the client picks the
//     session out of the URL automatically; we just wait for it.
// If neither produces a session within a few seconds, the link is dead.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Stage = "checking" | "ready" | "invalid" | "done";

export default function ResetUpdate() {
  const [stage, setStage] = useState<Stage>("checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const advance = () => { if (!cancelled) setStage((s) => (s === "checking" ? "ready" : s)); };

    // Style 1: token_hash in the URL → verify it directly (browser-agnostic).
    // window.location instead of useSearchParams() to avoid the Suspense
    // boundary requirement.
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    if (tokenHash) {
      supabase.auth
        .verifyOtp({ type: "recovery", token_hash: tokenHash })
        .then(({ error }) => {
          if (cancelled) return;
          if (error) setStage("invalid");
          else advance();
        });
      return () => { cancelled = true; };
    }

    // Style 2: default template — wait for the client to establish the
    // recovery session from the URL hash / ?code=.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        advance();
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) advance();
    });
    const timeout = setTimeout(() => {
      if (!cancelled) setStage((s) => (s === "checking" ? "invalid" : s));
    }, 6000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function save() {
    if (saving) return;
    if (pw.length < 8) { setMsg("Use at least 8 characters."); return; }
    if (pw !== pw2) { setMsg("Those passwords don't match."); return; }
    setSaving(true); setMsg(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("same")) setMsg("That's your current password — pick a new one.");
      else if (m.includes("session") || m.includes("expired")) setStage("invalid");
      else setMsg(error.message);
      return;
    }
    setStage("done");
  }

  return (
    <main className="relative mx-auto w-full max-w-md px-6 py-14 sm:py-20">
      <style>{`
        @keyframes ptruFadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ptruGlow { 0%,100%{opacity:.28;transform:scale(1)} 50%{opacity:.5;transform:scale(1.12)} }
        @keyframes ptruSpin { to{transform:rotate(360deg)} }
        .ptru-fade { opacity:0; animation: ptruFadeUp .6s cubic-bezier(.22,1,.36,1) forwards; }
        .ptru-glow { animation: ptruGlow 8s ease-in-out infinite; }
        .ptru-spin { animation: ptruSpin .8s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ptru-fade,.ptru-glow,.ptru-spin { animation:none!important; opacity:1!important; transform:none!important; }
        }
      `}</style>

      <div
        className="ptru-glow pointer-events-none absolute left-1/2 top-10 -z-10 h-64 w-64 -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(168,85,247,0.20), transparent 70%)" }}
        aria-hidden="true"
      />

      <div className="ptru-fade mb-6 text-center">
        <h1 className="text-2xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">
          Set a new password
        </h1>
      </div>

      <div className="petora-card ptru-fade p-6 sm:p-7" style={{ animationDelay: "60ms", borderColor: "var(--line-2)", boxShadow: "0 24px 60px -30px rgba(124,58,237,0.55)" }}>
        {stage === "checking" && (
          <div className="py-6 text-center" role="status" aria-live="polite">
            <svg className="ptru-spin mx-auto h-8 w-8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="rgba(168,139,250,0.25)" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="var(--lilac)" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <p className="mt-4 text-sm text-[color:var(--muted)]">Checking your reset link…</p>
          </div>
        )}

        {stage === "invalid" && (
          <div className="py-2 text-center" aria-live="polite">
            <p className="font-semibold text-[color:var(--text)] [font-family:var(--font-display)]">
              This link has expired or was already used
            </p>
            <p className="mx-auto mt-1.5 max-w-xs text-[13.5px] leading-relaxed text-[color:var(--muted)]">
              Reset links only work once and expire after a while. Request a fresh one and use it right away.
            </p>
            <Link
              href="/reset"
              className="mt-5 inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-[#1a1030] transition hover:brightness-110 active:scale-95 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
            >
              Request a new link
            </Link>
          </div>
        )}

        {stage === "done" && (
          <div className="py-2 text-center" aria-live="polite">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full" style={{ background: "rgba(93,230,168,0.12)", border: "2px solid var(--up)" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--up)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <p className="mt-4 font-semibold text-[color:var(--text)] [font-family:var(--font-display)]">Password updated</p>
            <p className="mx-auto mt-1.5 max-w-xs text-[13.5px] text-[color:var(--muted)]">
              You&apos;re logged in with your new password on this device.
            </p>
            <button
              onClick={() => router.push("/portfolio")}
              className="mt-5 rounded-full px-6 py-2.5 text-sm font-semibold text-[#1a1030] transition hover:brightness-110 active:scale-95 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
            >
              Go to my portfolio →
            </button>
          </div>
        )}

        {stage === "ready" && (
          <>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]" htmlFor="new-pw">
              New password
            </label>
            <div className="relative">
              <input
                id="new-pw"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                autoFocus
                placeholder="At least 8 characters"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-2.5 pr-16 text-[15px] text-[color:var(--text)] outline-none transition placeholder:text-[color:var(--muted)] focus:border-[color:var(--violet)] focus:shadow-[0_0_0_3px_rgba(168,85,247,0.15)]"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2.5 py-1 text-[13px] font-semibold text-[color:var(--lilac)] transition hover:bg-[rgba(168,139,250,0.10)] active:scale-95"
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>

            <label className="mb-1.5 mt-4 block text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]" htmlFor="new-pw2">
              Confirm password
            </label>
            <input
              id="new-pw2"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Type it again"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              className="w-full rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-2.5 text-[15px] text-[color:var(--text)] outline-none transition placeholder:text-[color:var(--muted)] focus:border-[color:var(--violet)] focus:shadow-[0_0_0_3px_rgba(168,85,247,0.15)]"
            />

            <button
              onClick={save}
              disabled={saving}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold text-[#1a1030] shadow-[0_12px_34px_-12px_rgba(168,85,247,0.7)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
            >
              {saving && (
                <svg className="ptru-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="rgba(26,16,48,0.3)" strokeWidth="3" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="#1a1030" strokeWidth="3" strokeLinecap="round" />
                </svg>
              )}
              Save new password
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
    </main>
  );
}