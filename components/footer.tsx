import Link from "next/link";
import Socials from "@/components/socials";

const NAV_LINKS = [
  { href: "/catalog", label: "Catalog" },
  { href: "/portfolio", label: "My Portfolio" },
  { href: "/scan", label: "Scan" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/how-to-use", label: "How to use" },
  { href: "/trade-feedback", label: "Trade Feedback" },
];

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
];

export default function Footer() {
  const year = new Date().getFullYear();

  const linkCls =
    "text-[13px] text-[color:var(--muted)] transition hover:text-[color:var(--text)]";

  return (
    <footer className="mt-20 border-t border-[color:var(--line)] bg-[rgba(12,8,22,0.72)] px-6 py-10 backdrop-blur-[14px]">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2.5">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Petora home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/petora-mark.png"
                alt=""
                className="h-[30px] w-[30px] rounded-[8px] shadow-[0_0_18px_rgba(168,85,247,0.4)]"
              />
              <span className="petora-gradient [font-family:var(--font-display)] text-[18px] font-bold tracking-[0.14em]">
                PETORA
              </span>
            </Link>
            <p className="max-w-xs text-[12px] leading-relaxed text-[color:var(--muted)]">
              Track, verify, and showcase your Adopt Me pet portfolio.
            </p>
            {/* Socials render here once you fill in links in components/socials.tsx.
                Until then this row is empty (the component hides itself). */}
            <div className="mt-1.5">
              <Socials />
            </div>
          </div>

          <nav className="flex flex-col gap-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Explore
            </span>
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={linkCls}>
                {l.label}
              </Link>
            ))}
          </nav>

          <nav className="flex flex-col gap-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Legal
            </span>
            {LEGAL_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={linkCls}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-2 border-t border-[color:var(--line)] pt-6 text-[11px] leading-relaxed text-[color:var(--muted)]">
          <p>© {year} Petora. All rights reserved.</p>
          <p>
            Petora is an independent fan-made project and is not affiliated with,
            endorsed by, or sponsored by Roblox Corporation or the developers of
            Adopt Me. Pet values are community estimates sourced from Elvebredd
            and are provided for informational purposes only.
          </p>
        </div>
      </div>
    </footer>
  );
}