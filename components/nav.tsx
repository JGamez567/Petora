"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

const LINKS: { href: string; label: string; soon?: boolean }[] = [
  { href: "/catalog", label: "Catalog" },
  { href: "/portfolio", label: "My Portfolio" },
  { href: "/scan", label: "Scan" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/how-to-use", label: "How to use" },
  { href: "/trade-feedback", label: "Trade Feedback", soon: true },
];

function SoonBadge() {
  return (
    <span className="ml-1.5 rounded-full bg-[rgba(168,139,250,0.16)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--lilac)]">
      Soon
    </span>
  );
}

export default function Nav() {
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Close the mobile menu on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close the mobile menu on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function logout() {
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/");
  }

  const linkCls = (href: string) =>
    `inline-flex items-center rounded-[9px] px-3 py-1.5 text-sm font-medium transition ${
      pathname === href
        ? "text-[color:var(--lilac)] bg-[rgba(168,139,250,0.12)]"
        : "text-[color:var(--muted)] hover:text-[color:var(--text)] hover:bg-[rgba(168,139,250,0.08)]"
    }`;

  // Larger tap targets + full-width rows for the mobile drawer.
  const mobileLinkCls = (href: string) =>
    `flex items-center rounded-[10px] px-4 py-3 text-[15px] font-medium transition ${
      pathname === href
        ? "text-[color:var(--lilac)] bg-[rgba(168,139,250,0.12)]"
        : "text-[color:var(--text)] hover:bg-[rgba(168,139,250,0.08)]"
    }`;

  return (
    <header className="sticky top-0 z-50 flex items-center gap-6 border-b border-[color:var(--line)] bg-[rgba(12,8,22,0.72)] px-6 py-3.5 backdrop-blur-[14px]">
      <Link href="/" className="flex items-center gap-2.5" aria-label="Petora home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/petora-mark.png"
          alt=""
          className="h-[34px] w-[34px] rounded-[9px] shadow-[0_0_22px_rgba(168,85,247,0.45)]"
        />
        <span className="petora-gradient [font-family:var(--font-display)] text-[20px] font-bold tracking-[0.14em]">
          PETORA
        </span>
      </Link>

      {/* Desktop links */}
      <nav className="hidden items-center gap-1 lg:flex">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={linkCls(l.href)}>
            {l.label}
            {l.soon && <SoonBadge />}
          </Link>
        ))}
      </nav>

      {/* Desktop auth cluster */}
      <div className="ml-auto hidden items-center gap-2.5 lg:flex">
        {email ? (
          <>
            <Link href="/settings" className={`hidden sm:inline-flex ${linkCls("/settings")}`}>
              Roblox Verification
            </Link>
            <span className="hidden max-w-[170px] truncate text-[13px] text-[color:var(--muted)] xl:inline">
              {email}
            </span>
            <button
              onClick={logout}
              className="rounded-[9px] border border-[color:var(--line-2)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)]"
            >
              Log out
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className="rounded-[9px] [background-image:var(--ramp-h)] px-3.5 py-1.5 text-[13px] font-semibold text-[#1a1030]"
          >
            Log in
          </Link>
        )}
      </div>

      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="petora-mobile-menu"
        className="ml-auto inline-flex items-center justify-center rounded-[9px] border border-[color:var(--line-2)] p-2 text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)] lg:hidden"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
      </button>

      {/* Mobile dropdown panel */}
      {open && (
        <div
          id="petora-mobile-menu"
          className="absolute left-0 right-0 top-full border-b border-[color:var(--line)] bg-[rgba(10,7,18,0.97)] px-4 py-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.85)] backdrop-blur-[14px] lg:hidden"
        >
          <nav className="flex flex-col gap-1">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={mobileLinkCls(l.href)}
                onClick={() => setOpen(false)}
              >
                {l.label}
                {l.soon && <SoonBadge />}
              </Link>
            ))}
          </nav>

          <div className="my-3 h-px bg-[color:var(--line)]" />

          {email ? (
            <div className="flex flex-col gap-1">
              <Link
                href="/settings"
                className={mobileLinkCls("/settings")}
                onClick={() => setOpen(false)}
              >
                Roblox Verification
              </Link>
              <span className="truncate px-4 py-1 text-[13px] text-[color:var(--muted)]">
                {email}
              </span>
              <button
                onClick={logout}
                className="mt-1 rounded-[10px] border border-[color:var(--line-2)] px-4 py-3 text-left text-[15px] font-medium text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)]"
              >
                Log out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="block rounded-[10px] [background-image:var(--ramp-h)] px-4 py-3 text-center text-[15px] font-semibold text-[#1a1030]"
            >
              Log in
            </Link>
          )}
        </div>
      )}
    </header>
  );
}