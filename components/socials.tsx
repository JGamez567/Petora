"use client";

// components/socials.tsx
//
// Petora's social links. To use:
//   1. Drop each logo into  public/social/  (e.g. public/social/discord.svg).
//      Clean monochrome logos: https://simpleicons.org  (free).
//   2. Fill in `href` with your profile URL for each platform you use.
//   3. Leave `href` empty ("") for any platform you don't have — it's hidden.
//
// Drop <Socials /> wherever you want the row (your footer is the usual spot).

type Social = { label: string; href: string; src: string };

const SOCIALS: Social[] = [
  { label: "Discord", href: "", src: "/social/discord.svg" },
  { label: "YouTube", href: "", src: "/social/youtube.svg" },
  { label: "TikTok", href: "", src: "/social/tiktok.svg" },
  { label: "X", href: "", src: "/social/x.svg" },
  { label: "Instagram", href: "", src: "/social/instagram.svg" },
  { label: "Roblox", href: "", src: "/social/roblox.svg" },
];

export default function Socials() {
  const active = SOCIALS.filter((s) => s.href.trim() !== "");
  if (active.length === 0) return null;

  return (
    <div className="flex items-center gap-2.5">
      {active.map((s) => (
        <a
          key={s.label}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Petora on ${s.label}`}
          title={s.label}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--line-2)] bg-[rgba(168,139,250,0.06)] text-[color:var(--muted)] transition hover:border-[color:var(--violet)] hover:bg-[rgba(168,139,250,0.12)] hover:text-[color:var(--text)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.src} alt="" className="h-[18px] w-[18px] object-contain" />
        </a>
      ))}
    </div>
  );
}