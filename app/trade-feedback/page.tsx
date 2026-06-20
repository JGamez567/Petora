// app/trade-feedback/page.tsx
import Link from "next/link";

export const metadata = {
  title: "Trade Feedback — coming soon",
  description:
    "A reputation layer for Adopt Me trading. Leave feedback after trades and build a public trader score on Petora.",
};

const points = [
  {
    title: "Leave feedback after a trade",
    body: "Mark a trade as done and rate how it went, with an optional note — like vouching for someone in a trading server, but kept on record.",
  },
  {
    title: "Build a trusted reputation",
    body: "Your rating and trade history live on your Petora profile, so a strong track record follows you everywhere you trade.",
  },
  {
    title: "Trade with confidence",
    body: "Check anyone's feedback before you commit — spot the traders worth dealing with and steer clear of the rest.",
  },
];

export default function TradeFeedbackPage() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "56px 24px 80px",
        color: "var(--text)",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 12,
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: "var(--lilac)",
          background: "rgba(168,139,250,.12)",
          border: "1px solid var(--line-2)",
          borderRadius: 999,
          padding: "6px 12px",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "var(--violet-bright)",
            boxShadow: "0 0 8px var(--violet-bright)",
          }}
        />
        Coming soon
      </span>

      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "clamp(30px, 5vw, 42px)",
          lineHeight: 1.08,
          margin: "16px 0 14px",
        }}
      >
        Trade <span className="petora-gradient">Feedback</span>
      </h1>

      <p style={{ color: "var(--muted)", fontSize: 16, lineHeight: 1.6, maxWidth: 560 }}>
        A reputation layer for Adopt Me trading. After a trade, leave honest feedback and build a
        public trader score — so everyone can tell at a glance who&apos;s safe to deal with.
      </p>

      <ol style={{ listStyle: "none", margin: "40px 0 0", padding: 0, display: "grid", gap: 14 }}>
        {points.map((p, i) => (
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
            <div style={{ minWidth: 0 }}>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: 18,
                  margin: "4px 0 6px",
                }}
              >
                {p.title}
              </h2>
              <p style={{ color: "var(--muted)", fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>
                {p.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div
        className="petora-card"
        style={{
          marginTop: 14,
          padding: "22px",
          borderColor: "var(--line-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: 16,
              margin: "0 0 4px",
            }}
          >
            It&apos;s in the works.
          </p>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.55, margin: 0 }}>
            We&apos;ll announce Trade Feedback on the leaderboard and Petora&apos;s socials. For now,
            keep your portfolio up to date.
          </p>
        </div>
        <Link
          href="/scan"
          style={{
            flex: "none",
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
          Scan your pets →
        </Link>
      </div>
    </main>
  );
}