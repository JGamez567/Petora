// app/how-to-use/page.tsx
import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "How to use Petora",
  description:
    "Verify your Roblox account, scan your Adopt Me profile, and climb the Petora leaderboard.",
};

const steps = [
  {
    title: "Verify your Roblox account",
    body: "Connect your Roblox account once so the leaderboard can prove the pets you submit are really yours. You'll only do this a single time — find it under Roblox Verification in the menu.",
    icon: (
      <>
        <path d="M12 3l7 4v5c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V7l7-4Z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
  },
  {
    title: "Open your Adopt Me profile",
    body: "In the game, open the Adopt Me profile you want to submit so every pet you're claiming is visible on screen. Make sure the Verified Owner badge is showing — that's what Petora checks against your account.",
    icon: (
      <>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5.5 19.5c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" />
      </>
    ),
  },
  {
    title: "Take one clear screenshot",
    body: "Capture your whole Adopt Me profile in a single shot, with your username visible at the top. This is the image you'll upload. Here's what a good submission looks like next to one that won't work:",
    media: true,
    icon: (
      <>
        <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  {
    title: "Upload it on the Scan page",
    body: "Open Scan, drop in your screenshot, and Petora reads every pet, values it from live market data, and posts your total to the leaderboard automatically.",
    icon: (
      <>
        <path d="M12 16V4M7 9l5-5 5 5" />
        <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      </>
    ),
  },
  {
    title: "Climb",
    body: "Your net worth and rank update the moment the scan finishes. Re-scan whenever your inventory changes to hold your spot.",
    icon: (
      <>
        <path d="M4 18l5-5 3 3 7-7" />
        <path d="M16 9h3v3" />
      </>
    ),
  },
];

const checklist = [
  "Your full Adopt Me profile fits in frame — nothing cut off at the edges.",
  "Your username is readable at the top.",
  "No menus, chat, or pop-ups covering any pets.",
  "Bright enough that every pet is easy to see.",
];

export default function HowToUsePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-20 pt-14 text-[color:var(--text)]">
      <style>{`
        @keyframes ptrhFadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ptrhGlow { 0%,100%{opacity:.25;transform:scale(1)} 50%{opacity:.5;transform:scale(1.1)} }
        .ptrh-reveal { opacity:0; animation: ptrhFadeUp .55s cubic-bezier(.22,1,.36,1) forwards; }
        .ptrh-glow { animation: ptrhGlow 8s ease-in-out infinite; }
        .ptrh-card { transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
        .ptrh-card:hover { transform: translateY(-2px); box-shadow: 0 14px 34px -18px rgba(168,85,247,.5); border-color: var(--line-2); }
        .ptrh-cta { transition: transform .2s ease, filter .2s ease; }
        .ptrh-cta:hover { transform: translateY(-2px); filter: brightness(1.1); }
        .ptrh-cta:active { transform: scale(.97); }
        .ptrh-cta .ptrh-arrow { display:inline-block; transition: transform .2s ease; }
        .ptrh-cta:hover .ptrh-arrow { transform: translateX(3px); }
        @media (prefers-reduced-motion: reduce) {
          .ptrh-reveal,.ptrh-glow { animation:none!important; opacity:1!important; transform:none!important; }
          .ptrh-card,.ptrh-card:hover,.ptrh-cta,.ptrh-cta:hover,.ptrh-cta:active { transition:none!important; transform:none!important; }
          .ptrh-cta .ptrh-arrow { transition:none!important; transform:none!important; }
        }
      `}</style>

      {/* soft glow behind the header */}
      <div
        className="ptrh-glow pointer-events-none absolute left-1/3 top-6 -z-10 h-64 w-64 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(168,85,247,0.18), transparent 70%)" }}
        aria-hidden="true"
      />

      <div className="ptrh-reveal">
        <p className="petora-eyebrow">Getting started</p>
        <h1 className="mt-2.5 text-[clamp(30px,5vw,42px)] font-bold leading-[1.08] [font-family:var(--font-display)]">
          How to get on the <span className="petora-gradient">Petora leaderboard</span>
        </h1>
        <p className="mt-3.5 max-w-xl text-[16px] leading-relaxed text-[color:var(--muted)]">
          It takes about two minutes. Verify once, scan your Adopt Me profile, and your net worth
          and rank go live.
        </p>
      </div>

      {/* steps — vertical timeline with a connecting rail */}
      <ol className="relative mt-10 grid list-none gap-4 p-0">
        {/* the rail (hidden on very small screens where cards stack tight) */}
        <span
          className="pointer-events-none absolute bottom-8 left-[39px] top-8 hidden w-px sm:block"
          style={{ background: "linear-gradient(to bottom, transparent, var(--line-2) 12%, var(--line-2) 88%, transparent)" }}
          aria-hidden="true"
        />
        {steps.map((step, i) => (
          <li
            key={i}
            className="petora-card ptrh-reveal ptrh-card relative flex items-start gap-4 p-5 sm:gap-5 sm:px-6"
            style={{ animationDelay: `${120 + i * 100}ms` }}
          >
            <span
              aria-hidden="true"
              className="relative z-10 grid h-9 w-9 flex-none place-items-center rounded-[10px] text-[17px] font-bold text-[#1a1030] shadow-[0_0_18px_rgba(168,85,247,0.4)] [background-image:var(--ramp)] [font-family:var(--font-display)]"
            >
              {i + 1}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <h2 className="my-0.5 text-[18px] font-semibold [font-family:var(--font-display)]">
                  {step.title}
                </h2>
                <svg
                  className="h-[18px] w-[18px] flex-none text-[color:var(--lilac)] opacity-80"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                >
                  {step.icon}
                </svg>
              </div>
              <p className="m-0 mt-1 text-[14.5px] leading-relaxed text-[color:var(--muted)]">
                {step.body}
              </p>

              {step.media && (
                <div className="mb-1 mt-4 grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
                  {/* good example */}
                  <figure className="m-0 rounded-xl border p-3" style={{ borderColor: "rgba(93,230,168,0.28)", background: "rgba(93,230,168,0.05)" }}>
                    <span className="mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold text-[color:var(--up)] [font-family:var(--font-display)]" style={{ background: "rgba(93,230,168,0.12)" }}>
                      <span aria-hidden="true">✓</span> Good
                    </span>
                    <Image
                      src="/how-to-example.png"
                      alt="A correct Petora submission: the full Adopt Me profile in one shot with the username visible at the top"
                      width={1280}
                      height={800}
                      className="h-auto w-full rounded-lg border border-[color:var(--line)]"
                    />
                    <figcaption className="mt-2 text-[12.5px] leading-normal text-[color:var(--muted)]">
                      Only your Adopt Me profile in one shot, username at the top, nothing cropped
                      or blocking it.
                    </figcaption>
                  </figure>

                  {/* bad example */}
                  <figure className="m-0 rounded-xl border p-3" style={{ borderColor: "rgba(251,113,133,0.28)", background: "rgba(251,113,133,0.05)" }}>
                    <span className="mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold text-[#FCA5B6] [font-family:var(--font-display)]" style={{ background: "rgba(251,113,133,0.12)" }}>
                      <span aria-hidden="true">✕</span> Won&apos;t work
                    </span>
                    <Image
                      src="/how-to-bad-example.png"
                      alt="A submission Petora can't read: the Adopt Me profile is cropped, blurry, or covered by a menu, and the username isn't visible"
                      width={1280}
                      height={800}
                      className="h-auto w-full rounded-lg border border-[color:var(--line)]"
                    />
                    <figcaption className="mt-2 text-[12.5px] leading-normal text-[color:var(--muted)]">
                      Cropped, blurry, or covered by a menu, with stickers covering the pets —
                      Petora may misread or reject it.
                    </figcaption>
                  </figure>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {/* screenshot checklist */}
      <div
        className="petora-card ptrh-reveal mt-4 p-5 sm:px-6"
        style={{ borderColor: "var(--line-2)", animationDelay: "650ms" }}
      >
        <h2 className="m-0 mb-3 text-[16px] font-semibold [font-family:var(--font-display)]">
          What makes a good screenshot
        </h2>
        <ul className="m-0 grid list-none gap-2.5 p-0">
          {checklist.map((t, i) => (
            <li key={i} className="flex gap-2.5 text-[14px] leading-normal">
              <svg
                className="mt-0.5 h-4 w-4 flex-none text-[color:var(--up)]"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span className="text-[color:var(--muted)]">{t}</span>
            </li>
          ))}
        </ul>
        <p className="m-0 mt-3.5 rounded-lg border border-[color:var(--line)] bg-[rgba(168,139,250,0.05)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[color:var(--muted)]">
          Free accounts can submit <span className="font-semibold text-[color:var(--text)]">twice every 24 hours</span>, so make your
          screenshot count. Premium can re-scan up to{" "}
          <span className="font-semibold text-[color:var(--text)]">10 times every day</span>.
        </p>
      </div>

      {/* closing CTA */}
      <div
        className="petora-card ptrh-reveal relative mt-8 overflow-hidden p-7 text-center sm:p-9"
        style={{ borderColor: "var(--line-2)", boxShadow: "0 24px 60px -30px rgba(124,58,237,0.5)", animationDelay: "750ms" }}
      >
        <div
          className="pointer-events-none absolute -top-14 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(168,85,247,0.18), transparent 70%)" }}
          aria-hidden="true"
        />
        <h2 className="relative m-0 text-[clamp(22px,3.5vw,28px)] font-bold [font-family:var(--font-display)]">
          Ready to see your rank?
        </h2>
        <p className="relative mx-auto mt-2 max-w-sm text-[14.5px] leading-relaxed text-[color:var(--muted)]">
          One screenshot is all it takes — your pets, valued and on the board in seconds.
        </p>
        <Link
          href="/scan"
          className="ptrh-cta relative mt-5 inline-flex items-center gap-2 rounded-full px-7 py-3 text-[15px] font-semibold text-[#1a1030] shadow-[0_10px_30px_-12px_rgba(168,85,247,0.7)] [background-image:var(--ramp-h)] [font-family:var(--font-display)]"
        >
          Open the scanner <span className="ptrh-arrow">→</span>
        </Link>
      </div>
    </main>
  );
}