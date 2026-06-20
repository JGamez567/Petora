// app/how-to-use/page.tsx
import Link from "next/link";

export const metadata = {
  title: "How to use Petora",
  description:
    "Verify your Roblox account, scan your Adopt Me profile, and climb the Petora leaderboard.",
};

const steps = [
  {
    title: "Verify your Roblox account",
    body: "Connect your Roblox account once so the leaderboard can prove the pets you submit are really yours. You'll only do this a single time — find it under Roblox Verification in the menu.",
  },
  {
    title: "Open your Adopt Me profile",
    body: "In the game, open the Adopt Me profile you want to submit so every pet you're claiming is visible on screen. Make sure the Verified Owner badge is showing — that's what Petora checks against your account.",
  },
  {
    title: "Take one clear screenshot",
    body: "Capture your whole Adopt Me profile in a single shot, with your username visible at the top. This is the image you'll upload. Here's what a good submission looks like next to one that won't work:",
    media: true,
  },
  {
    title: "Upload it on the Scan page",
    body: "Open Scan, drop in your screenshot, and Petora reads every pet, values it from live market data, and posts your total to the leaderboard automatically.",
  },
  {
    title: "Climb",
    body: "Your net worth and rank update the moment the scan finishes. Re-scan whenever your inventory changes to hold your spot.",
  },
];

export default function HowToUsePage() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "56px 24px 80px",
        color: "var(--text)",
      }}
    >
      <p className="petora-eyebrow">Getting started</p>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "clamp(30px, 5vw, 42px)",
          lineHeight: 1.08,
          margin: "10px 0 14px",
        }}
      >
        How to get on the{" "}
        <span className="petora-gradient">Petora leaderboard</span>
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 16, lineHeight: 1.6, maxWidth: 560 }}>
        It takes about two minutes. Verify once, scan your Adopt Me profile, and your net
        worth and rank go live.
      </p>

      <ol style={{ listStyle: "none", margin: "40px 0 0", padding: 0, display: "grid", gap: 14 }}>
        {steps.map((step, i) => (
          <li
            key={i}
            className="petora-card"
            style={{ padding: "20px 22px", display: "flex", gap: 18, alignItems: "flex-start" }}
          >
            <span
              aria-hidden="true"
              style={{
                flex: "none",
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "var(--ramp)",
                color: "#1a1030",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 18,
                display: "grid",
                placeItems: "center",
                boxShadow: "0 0 18px rgba(168,85,247,.4)",
              }}
            >
              {i + 1}
            </span>

            <div style={{ minWidth: 0, flex: 1 }}>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: 18,
                  margin: "4px 0 6px",
                }}
              >
                {step.title}
              </h2>
              <p style={{ color: "var(--muted)", fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>
                {step.body}
              </p>

              {step.media && (
                /* ───────────────────────────────────────────────────────────
                   TWO EXAMPLE SCREENSHOTS GO HERE — a good one and a bad one.
                   1. Drop your images into the /public folder, e.g.
                        public/how-to-example.png       (the GOOD submission)
                        public/how-to-bad-example.png   (the BAD submission)
                   2. In each card below, delete the
                      <div className="petora-img-placeholder"> block and
                      uncomment the matching <Image /> block.
                   (Add `import Image from "next/image";` to the top of the file.)
                   ─────────────────────────────────────────────────────────── */
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                    gap: 14,
                    margin: "16px 0 4px",
                  }}
                >
                  {/* ── GOOD example ───────────────────────────────────────── */}
                  <figure style={{ margin: 0 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontFamily: "var(--font-display)",
                        fontWeight: 600,
                        fontSize: 13,
                        color: "var(--up)",
                        marginBottom: 8,
                      }}
                    >
                      <span aria-hidden="true">✓</span> Good
                    </span>

                    <div
                      className="petora-img-placeholder"
                      style={{
                        aspectRatio: "16 / 10",
                        borderRadius: 12,
                        border: "1.5px dashed var(--up)",
                        background: "rgba(74,222,128,.05)",
                        display: "grid",
                        placeItems: "center",
                        textAlign: "center",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontFamily: "var(--font-display)",
                            fontWeight: 600,
                            color: "var(--up)",
                            fontSize: 14,
                          }}
                        >
                          Good submission
                        </div>
                        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                          You'll add this — public/how-to-example.png
                        </div>
                      </div>
                    </div>

                    {/*
                    <Image
                      src="/how-to-example.png"
                      alt="A correct Petora submission: the full Adopt Me profile in one shot with the username visible at the top"
                      width={1280}
                      height={800}
                      style={{ width: "100%", height: "auto", borderRadius: 12, border: "1px solid var(--line)" }}
                    />
                    */}

                    <figcaption style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>
                      Your whole Adopt Me profile in one shot, username at the top, nothing cropped.
                    </figcaption>
                  </figure>

                  {/* ── BAD example ────────────────────────────────────────── */}
                  <figure style={{ margin: 0 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontFamily: "var(--font-display)",
                        fontWeight: 600,
                        fontSize: 13,
                        color: "var(--down, #fb7185)",
                        marginBottom: 8,
                      }}
                    >
                      <span aria-hidden="true">✕</span> Won't work
                    </span>

                    <div
                      className="petora-img-placeholder"
                      style={{
                        aspectRatio: "16 / 10",
                        borderRadius: 12,
                        border: "1.5px dashed var(--down, #fb7185)",
                        background: "rgba(251,113,133,.05)",
                        display: "grid",
                        placeItems: "center",
                        textAlign: "center",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontFamily: "var(--font-display)",
                            fontWeight: 600,
                            color: "var(--down, #fb7185)",
                            fontSize: 14,
                          }}
                        >
                          Bad submission
                        </div>
                        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                          You'll add this — public/how-to-bad-example.png
                        </div>
                      </div>
                    </div>

                    {/*
                    <Image
                      src="/how-to-bad-example.png"
                      alt="A submission Petora can't read: the Adopt Me profile is cropped, blurry, or covered by a menu, and the username isn't visible"
                      width={1280}
                      height={800}
                      style={{ width: "100%", height: "auto", borderRadius: 12, border: "1px solid var(--line)" }}
                    />
                    */}

                    <figcaption style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>
                      Cropped, blurry, or covered by a menu, with the username cut off — Petora may misread or reject it.
                    </figcaption>
                  </figure>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div
        className="petora-card"
        style={{ padding: "20px 22px", marginTop: 14, borderColor: "var(--line-2)" }}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 16,
            margin: "0 0 12px",
          }}
        >
          What makes a good screenshot
        </h2>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 9 }}>
          {[
            "Your full Adopt Me profile fits in frame — nothing cut off at the edges.",
            "Your username is readable at the top.",
            "No menus, chat, or pop-ups covering any pets.",
            "Bright enough that every pet is easy to see.",
          ].map((t, i) => (
            <li
              key={i}
              style={{ display: "flex", gap: 10, color: "var(--text)", fontSize: 14, lineHeight: 1.5 }}
            >
              <span aria-hidden="true" style={{ color: "var(--up)", fontWeight: 700 }}>
                ✓
              </span>
              <span style={{ color: "var(--muted)" }}>{t}</span>
            </li>
          ))}
        </ul>
        <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.55, margin: "14px 0 0" }}>
          Free accounts can submit once every 24 hours, so make your screenshot count.
          Premium can re-scan any time.
        </p>
      </div>

      <div
        style={{
          marginTop: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>Ready to submit?</p>
        <Link
          href="/scan"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 15,
            color: "#1a1030",
            background: "var(--ramp-h)",
            padding: "11px 20px",
            borderRadius: 999,
            textDecoration: "none",
            boxShadow: "0 10px 30px -12px rgba(168,85,247,.7)",
          }}
        >
          Open the scanner →
        </Link>
      </div>
    </main>
  );
}