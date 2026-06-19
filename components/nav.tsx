"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

const LINKS = [
  { href: "/catalog", label: "Catalog" },
  { href: "/portfolio", label: "My Portfolio" },
  { href: "/scan", label: "Scan" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/how-to-use", label: "How to use" },
];

export default function Nav() {
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  const linkCls = (href: string) =>
    `rounded-[9px] px-3 py-1.5 text-sm font-medium transition ${
      pathname === href
        ? "text-[color:var(--lilac)] bg-[rgba(168,139,250,0.12)]"
        : "text-[color:var(--muted)] hover:text-[color:var(--text)] hover:bg-[rgba(168,139,250,0.08)]"
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

      <nav className="hidden items-center gap-1 md:flex">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={linkCls(l.href)}>
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2.5">
        {email ? (
          <>
            <Link href="/settings" className={`hidden sm:inline-flex ${linkCls("/settings")}`}>
              Roblox Verification
            </Link>
            <span className="hidden max-w-[170px] truncate text-[13px] text-[color:var(--muted)] lg:inline">
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
    </header>
  );
}