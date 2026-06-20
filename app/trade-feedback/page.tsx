// app/trade-feedback/page.tsx
import Link from "next/link";

export const metadata = {
  title: "Trade Feedback — coming soon",
  description:
    "Upload a trade and Petora tells you whether it was a good deal — weighing value, demand, and how hard each pet is to move.",
};

const points = [
  {
    title: "Upload the trade, get a verdict",
    body: "Drop in a screenshot of both sides and Petora reads every pet, then calls the trade a win, fair, or loss — with the reasoning laid out.",
  },
  {
    title: "Value and demand, together",
    body: "It compares total value on each side, then weighs demand too — a lower-value pet everyone wants can still beat a pricey one nobody trades for.",
  },
  {
    title: "Knows what's hard to trade",
    body: "Petora flags pets that are slow to move, so you know whether you picked up something liquid or something that'll sit in your inventory.",
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
        Upload a screenshot of a trade and Petora tells you whether you won, lost, or broke even —
        weighing value, demand, and how hard each pet is to move.
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