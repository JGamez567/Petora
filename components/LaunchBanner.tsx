"use client";

// components/LaunchBanner.tsx
//
// Site-wide limited-time offer bar. Rendered once in app/layout.tsx above <Nav />.
// Dismissal persists across pages/visits via localStorage. Starts hidden and
// reveals after the mount check so returning (dismissed) users never see a flash.

import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "petora_launch_offer_2026";

export default function LaunchBanner() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(KEY) === "dismissed";
    } catch {}
    setOpen(!dismissed);
    setReady(true);
  }, []);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(KEY, "dismissed");
    } catch {}
  }

  if (!ready || !open) return null;

  return (
    <div className="relative w-full border-b border-[rgba(168,85,247,0.4)] [background-image:linear-gradient(90deg,rgba(168,85,247,0.16),rgba(124,58,237,0.10),rgba(168,85,247,0.16))]">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-10 py-2 text-center text-[13px] sm:text-sm">
        <span className="hidden animate-pulse text-[color:var(--lilac)] sm:inline" aria-hidden="true">✦</span>
        <Link href="/premium" className="text-[color:var(--text)] transition hover:opacity-90">
          <span className="font-semibold text-[color:var(--lilac)]">Limited-time launch offer:</span>{" "}
          Premium <span className="font-semibold">$2.99/mo</span> · Lifetime{" "}
          <span className="font-semibold">$14.99</span>
          <span className="ml-1.5 font-semibold text-[color:var(--lilac)] underline underline-offset-2">Get it →</span>
        </Link>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss offer"
        className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-[color:var(--muted)] transition hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--text)]"
      >
        ✕
      </button>
    </div>
  );
}