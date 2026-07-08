"use client";
// → app/profile/page.tsx   (URL: /profile)
// Dedicated home for profile customization — the avatar picker lives here
// instead of being buried under Roblox verification on /settings.

import Link from "next/link";
import AvatarPicker from "@/components/AvatarPicker";

export default function ProfilePage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <style>{`
        @keyframes ptrfFadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        .ptrf-reveal { opacity:0; animation: ptrfFadeUp .5s cubic-bezier(.22,1,.36,1) forwards; }
        @media (prefers-reduced-motion: reduce) {
          .ptrf-reveal { animation:none!important; opacity:1!important; transform:none!important; }
        }
      `}</style>

      <div className="ptrf-reveal">
        <p className="petora-eyebrow">Your account</p>
        <h1 className="mt-1.5 text-3xl font-bold text-[color:var(--text)] [font-family:var(--font-display)]">
          Profile
        </h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          Pick the avatar that shows next to your name on the leaderboard.
        </p>
      </div>

      <div className="ptrf-reveal mt-6" style={{ animationDelay: "80ms" }}>
        <AvatarPicker />
      </div>

      <div className="ptrf-reveal mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[color:var(--muted)]" style={{ animationDelay: "160ms" }}>
        <span>Looking for Roblox verification?</span>
        <Link href="/settings" className="font-semibold text-[color:var(--lilac)] underline-offset-2 hover:underline">
          It&apos;s in Settings →
        </Link>
      </div>
    </main>
  );
}