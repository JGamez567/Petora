"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Row = { rank: number; username: string; total_value: number };

const features = [
  {
    title: "Scan in seconds",
    body: "Drop a screenshot of your board. Petora reads every pet, neon tier, and fly/ride automatically.",
    icon: (
      <>
        <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
        <path d="M4 12h16" />
      </>
    ),
  },
  {
    title: "Watch it grow",
    body: "Every pet is valued from live market data, so your net worth updates as the market moves.",
    icon: (
      <>
        <path d="M4 18l5-5 3 3 7-7" />
        <path d="M16 9h3v3" />
      </>
    ),
  },
  {
    title: "Climb the board",
    body: "Rankings are anchored to verified Roblox accounts — no fake totals, just real traders.",
    icon: (
      <>
        <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
        <path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M10 14h4M9 20h6M12 14v6" />
      </>
    ),
  },
];

export default function Home() {
  const [rows, setRows] = useState<Row[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    supabase.rpc("get_leaderboard", { limit_count: 5 }).then(({ data }) => {
      setRows((data ?? []).map((r: any) => ({
        rank: Number(r.rank), username: r.username, total_value: Number(r.total_value),
      })));
    });
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
      setAuthReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    router.refresh();
  }

  const top = rows[0];

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24 pt-16">
      {/* hero */}
      <section className="grid items-center gap-10 md:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="petora-eyebrow">Adopt Me portfolio tracker</p>
          <h1 className="mt-3 text-[clamp(34px,6vw,54px)] font-bold leading-[1.05] text-[color:var(--text)] [font-family:var(--font-display)]">
            Track every pet.<br />
            Watch your <span className="petora-gradient">net worth</span> climb.
          </h1>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-[color:var(--muted)]">
            Petora scans your Adopt Me profile, values every pet from live market data, and ranks you
            against verified traders. One screenshot and you're on the board.
          </p>
          <div className="mt-8 min-h-[52px]">
            {authReady && (
              <div className="flex flex-wrap items-center gap-3">
                {email ? (
                  <>
                    <Link
                      href="/portfolio"
                      className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold text-[#1a1030] shadow-[0_12px_34px_-12px_rgba(168,85,247,0.7)] transition hover:brightness-110 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
                    >
                      Go to my portfolio
                    </Link>
                    <Link
                      href="/leaderboard"
                      className="inline-flex items-center gap-2 rounded-full border border-[color:var(--line-2)] px-6 py-3 text-[15px] font-semibold text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)]"
                    >
                      View leaderboard
                    </Link>
                    <button
                      onClick={logout}
                      className="px-2 text-[14px] font-medium text-[color:var(--muted)] transition hover:text-[color:var(--lilac)]"
                    >
                      Log out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold text-[#1a1030] shadow-[0_12px_34px_-12px_rgba(168,85,247,0.7)] transition hover:brightness-110 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
                    >
                      Get started
                    </Link>
                    <Link
                      href="/leaderboard"
                      className="inline-flex items-center gap-2 rounded-full border border-[color:var(--line-2)] px-6 py-3 text-[15px] font-semibold text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)]"
                    >
                      View leaderboard
                    </Link>
                    <Link href="/how-to-use" className="px-2 text-[14px] font-medium text-[color:var(--muted)] transition hover:text-[color:var(--lilac)]">
                      How it works →
                    </Link>
                  </>
                )}
              </div>
            )}
            {authReady && email && (
              <p className="mt-3 text-[13px] text-[color:var(--muted)]">
                You&apos;re already signed in as{" "}
                <span className="text-[color:var(--text)]">{email}</span>.
              </p>
            )}
          </div>
        </div>

        {/* live top-trader card */}
        <div className="petora-card relative overflow-hidden p-7" style={{ borderColor: "var(--line-2)", boxShadow: "0 24px 60px -30px rgba(124,58,237,0.55)" }}>
          <p className="petora-eyebrow">Top trader right now</p>
          <div className="mt-3 text-[15px] font-semibold text-[color:var(--text)]">
            {top ? top.username : "—"}
          </div>
          <div className="mt-1 text-[44px] font-bold leading-none text-[color:var(--lilac)] [font-family:var(--font-data)]">
            {top ? top.total_value.toLocaleString() : "0"}
          </div>
          <p className="mt-2 text-[13px] text-[color:var(--muted)]">Total verified net worth</p>
          <svg viewBox="0 0 400 90" preserveAspectRatio="none" className="mt-6 h-[80px] w-full opacity-90" aria-hidden="true">
            <defs>
              <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#DDD6FE" /><stop offset="1" stopColor="#A855F7" />
              </linearGradient>
              <linearGradient id="under" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#8B5CF6" stopOpacity="0.28" /><stop offset="1" stopColor="#8B5CF6" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0,74 L50,68 L100,72 L150,56 L200,60 L250,40 L300,46 L350,24 L400,12 L400,90 L0,90 Z" fill="url(#under)" />
            <path d="M0,74 L50,68 L100,72 L150,56 L200,60 L250,40 L300,46 L350,24 L400,12" fill="none" stroke="url(#line)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="400" cy="12" r="4.5" fill="#fff" />
          </svg>
        </div>
      </section>

      {/* Elvebredd credit — prominent values-source attribution */}
      <section className="mt-12">
        <div className="petora-card relative overflow-hidden p-6 sm:p-7" style={{ borderColor: "var(--line-2)", boxShadow: "0 24px 60px -34px rgba(124,58,237,0.5)" }}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <p className="petora-eyebrow">Pet values powered by</p>
              <h2 className="mt-2 text-[28px] font-bold leading-none [font-family:var(--font-display)]">
                <span className="petora-gradient">Elvebredd</span>
              </h2>
              <p className="mt-3 text-[14.5px] leading-relaxed text-[color:var(--muted)]">
                Every value in Petora comes straight from{" "}
                <a
                  href="https://elvebredd.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[color:var(--lilac)] underline decoration-[color:var(--line-2)] underline-offset-2 transition hover:text-[color:var(--violet-bright)]"
                >
                  Elvebredd
                </a>{" "}
                — the community-built value list and Win/Fair/Lose calculator that&apos;s been the
                Adopt Me trading standard since 2022. We don&apos;t set prices; Elve does, and Petora
                keeps your portfolio synced to them.
              </p>
            </div>
            <a
              href="https://elvebredd.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-none items-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold text-[#1a1030] shadow-[0_12px_34px_-12px_rgba(168,85,247,0.7)] transition hover:brightness-110 [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
            >
              Visit Elvebredd →
            </a>
          </div>
        </div>
      </section>

      {/* features */}
      <section className="mt-20 grid gap-4 sm:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="petora-card p-6">
            <span className="grid h-10 w-10 place-items-center rounded-xl text-[color:var(--lilac)]" style={{ background: "rgba(168,139,250,0.10)", border: "1px solid var(--line-2)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {f.icon}
              </svg>
            </span>
            <h3 className="mt-4 text-[17px] font-semibold text-[color:var(--text)] [font-family:var(--font-display)]">{f.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[color:var(--muted)]">{f.body}</p>
          </div>
        ))}
      </section>

      {/* leaderboard preview */}
      {rows.length > 0 && (
        <section className="mt-20">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="petora-eyebrow">Live leaderboard</p>
              <h2 className="mt-1 text-2xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">Who's on top</h2>
            </div>
            <Link href="/leaderboard" className="text-[14px] font-medium text-[color:var(--lilac)] transition hover:opacity-80">
              See all →
            </Link>
          </div>
          <div className="petora-card overflow-hidden">
            {rows.map((r) => (
              <div key={`${r.rank}-${r.username}`} className="grid grid-cols-[44px_1fr_auto] items-center gap-3 px-4 py-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[color:var(--line)]">
                {r.rank <= 3 ? (
                  <span className="grid place-items-center rounded-[9px] py-1 text-sm font-bold text-[#1a1030] shadow-[0_0_16px_rgba(168,85,247,0.5)] [background-image:var(--ramp)] [font-family:var(--font-data)]">{r.rank}</span>
                ) : (
                  <span className="text-center text-sm font-bold text-[color:var(--muted)] [font-family:var(--font-data)]">#{r.rank}</span>
                )}
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-7 w-7 flex-none rounded-full [background-image:linear-gradient(135deg,#3a2b66,#6d52c4)]" />
                  <span className="truncate text-[14.5px] font-semibold text-[color:var(--text)]">{r.username}</span>
                </div>
                <div className="text-right font-bold text-[color:var(--lilac)] [font-family:var(--font-data)]">{r.total_value.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* values attribution — Elvebredd powers our pet values */}
      <p className="mt-20 text-center text-[13px] text-[color:var(--muted)]">
        Pet values powered by{" "}
        <a
          href="https://elvebredd.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[color:var(--lilac)] underline decoration-[color:var(--line-2)] underline-offset-2 transition hover:text-[color:var(--violet-bright)]"
        >
          Elvebredd
        </a>
      </p>

      {/* tagline */}
      <p className="mt-4 text-center text-[13px] font-semibold tracking-[0.22em] text-[color:var(--muted)] [font-family:var(--font-display)]">
        TRACK. <span className="text-[color:var(--violet-bright)]">GROW.</span> DOMINATE.
      </p>
    </main>
  );
}