"use client";

import { useRef, useState } from "react";
import Link from "next/link";

const MAX_PAGES = 7;

interface Item {
  pet_id: number | null;
  name: string;
  neon: "normal" | "neon" | "mega";
  fly: boolean;
  ride: boolean;
  count: number;
  pet_variant_id: number | null;
  unit_value: number | null;
  subtotal: number | null;
}
interface ScanResult {
  status: "ok" | "needs_consolidation";
  items?: Item[];
  totals?: { total: number };
  skipped_boxes?: { page: number; box_id: number; pets: number }[];
  missing?: Item[];
  conflicts?: { name: string; variant: string }[];
  duplicate_boards?: string[][];
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function VariantChips({ item }: { item: Item }) {
  const chips: { label: string; cls: string }[] = [];
  if (item.neon === "mega") chips.push({ label: "Mega", cls: "bg-[rgba(168,85,247,0.16)] text-[#D8B4FE]" });
  else if (item.neon === "neon") chips.push({ label: "Neon", cls: "bg-[rgba(93,230,168,0.14)] text-[#5DE6A8]" });
  if (item.fly) chips.push({ label: "Fly", cls: "bg-[rgba(56,189,248,0.14)] text-[#7DD3FC]" });
  if (item.ride) chips.push({ label: "Ride", cls: "bg-[rgba(244,114,182,0.14)] text-[#F9A8D4]" });
  if (chips.length === 0) return null;
  return (
    <span className="flex gap-1">
      {chips.map((c) => (
        <span key={c.label} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${c.cls}`}>{c.label}</span>
      ))}
    </span>
  );
}

export default function PetScanner() {
  const [leaderboard, setLeaderboard] = useState(false); // the one toggle: opt in/out of the board
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [saved, setSaved] = useState<{ leaderboard: boolean; total: number; pets: number } | null>(null);
  const [flagMsg, setFlagMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setResult(null); setError(null); setSaved(null); setFlagMsg(null);
  };
  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const imgs = Array.from(incoming).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...imgs].slice(0, MAX_PAGES));
    reset();
  };
  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));
  const canRun = files.length > 0 && !loading;

  async function run() {
    setLoading(true); reset();
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      fd.append("leaderboard", leaderboard ? "true" : "false");

      const res = await fetch("/api/scan", { method: "POST", body: fd });
      const data = await res.json();

      if (res.ok && data.status === "ok") {
        setResult({ status: "ok", items: data.items, totals: { total: data.total } });
        setSaved({ leaderboard: data.leaderboard, total: data.total, pets: data.pets });
      } else if (data.error === "scan_not_ok" && data.scan?.status === "needs_consolidation") {
        // same consolidation UI as before — surface the scanner's findings
        setResult(data.scan as ScanResult);
      } else {
        const map: Record<string, string> = {
          not_signed_in: "Please sign in to scan.",
          profile_not_found: "We couldn't load your profile. Please sign in again.",
          roblox_verification_required:
            "To appear on the leaderboard, verify your Roblox account first on the Verification page. You can still scan privately by turning the leaderboard toggle off.",
          rate_limited: `You've used your scan for today. Try again in ${data.hours_left ?? 24}h.`,
          username_unreadable:
            "We couldn't read a Roblox username on this Adopt Me profile. Upload a screenshot that clearly shows the username header for the account you verified with — or turn the leaderboard toggle off to save privately.",
          username_mismatch:
            "This Adopt Me profile isn't from your verified Roblox account. Submit a profile from the account you verified with, or turn the leaderboard toggle off to save privately.",
          scan_not_ok: "This Adopt Me profile needs fixing before it can be saved.",
          write_failed: "Something went wrong saving. Please try again.",
        };
        setError(map[data.error] || `Scan failed (${res.status}).`);
      }
    } catch {
      setError("Couldn't reach the server. Is everything running?");
    } finally {
      setLoading(false);
    }
  }

  async function requestCheck() {
    setFlagMsg(null);
    try {
      const res = await fetch("/flag", { method: "POST" });
      setFlagMsg(res.ok ? "Thanks — we'll manually review this submission." : "Couldn't send the request. Try again.");
    } catch {
      setFlagMsg("Couldn't send the request. Try again.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="[font-family:var(--font-display)] text-lg font-semibold text-[color:var(--text)]">
        Scan your pets
      </h1>

      {/* Pre-scan checklist — the four things that make a profile scannable */}
      <div className="petora-card p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
          Before you scan
        </p>
        <ul className="space-y-2.5 text-sm text-[color:var(--text)]">
          {[
            "Take a screenshot of only your profile.",
            "Keep duplicate pets together in one box.",
            "Make sure the username you verified with is visible.",
            "Remove any stickers.",
          ].map((tip) => (
            <li key={tip} className="flex items-start gap-2.5">
              <svg
                className="mt-0.5 h-4 w-4 flex-none text-[color:var(--lilac)]"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
        <Link href="/how-to-use" className="petora-howto-link mt-4 inline-block">
          See the full guide for more details →
        </Link>
      </div>

      {/* Always-visible replace + leaderboard explainer (§6.1 warning) */}
      <div className="rounded-lg border border-[rgba(245,200,120,0.28)] bg-[rgba(245,200,120,0.08)] px-4 py-3 text-sm text-[#F5C878]">
        Scanning <span className="font-semibold">replaces</span> the pets currently tracked in your
        portfolio with whatever&apos;s in these screenshots. Manual edits on your portfolio page
        aren&apos;t touched. Use the toggle below to choose whether this scan also lists you on the
        public leaderboard.
      </div>

      {/* The one toggle: leaderboard opt-in/opt-out -> profiles.is_public */}
      <div className="petora-card flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="font-medium text-[color:var(--text)]">Show me on the leaderboard</p>
          <p className="mt-0.5 text-xs text-[color:var(--muted)]">
            {leaderboard
              ? "This scan is verified against your Roblox username and listed publicly."
              : "This scan stays private — you won't appear on the public leaderboard."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={leaderboard}
          aria-label="Show me on the leaderboard"
          onClick={() => { setLeaderboard((v) => !v); reset(); }}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${
            leaderboard
              ? "[background-image:var(--ramp-h)]"
              : "border border-[color:var(--line-2)] bg-[color:var(--surface-2)]"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              leaderboard ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      <div onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className="cursor-pointer rounded-xl border-2 border-dashed border-[color:var(--line-2)] bg-[rgba(168,139,250,0.04)] p-8 text-center transition hover:border-[color:var(--violet)] hover:bg-[rgba(168,139,250,0.07)]">
        <p className="text-sm text-[color:var(--muted)]">Drop your Adopt Me profile screenshots here, or <span className="font-medium text-[color:var(--lilac)] underline">choose files</span></p>
        <p className="mt-1 text-xs text-[color:var(--muted)] opacity-70">Up to {MAX_PAGES} pages · {files.length}/{MAX_PAGES} added</p>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {files.map((f, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(f)} alt={f.name} className="h-20 w-28 rounded-lg border border-[color:var(--line)] object-cover" />
              <button onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--line-2)] bg-[color:var(--surface-2)] text-sm text-[color:var(--text)]" aria-label={`Remove ${f.name}`}>×</button>
            </div>
          ))}
        </div>
      )}

      <button onClick={run} disabled={!canRun}
        className="w-full rounded-lg [background-image:var(--ramp-h)] [font-family:var(--font-display)] px-4 py-2.5 font-semibold text-[#1a1030] shadow-[0_10px_30px_-12px_rgba(168,85,247,0.7)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
        {loading
          ? (leaderboard ? "Updating…" : "Scanning…")
          : (leaderboard ? "Scan & update leaderboard" : "Scan & save")}
      </button>

      {error && <div className="rounded-lg border border-[rgba(251,113,133,0.28)] bg-[rgba(251,113,133,0.10)] px-4 py-3 text-sm text-[#FCA5B6]">{error}</div>}

      {result?.status === "needs_consolidation" && (
        <div className="space-y-2 rounded-lg border border-[rgba(245,200,120,0.28)] bg-[rgba(245,200,120,0.08)] px-4 py-3 text-sm text-[#F5C878]">
          <p className="font-medium">A couple of boxes need fixing first:</p>
          {result.duplicate_boards?.map((p, i) => <p key={`d${i}`}>· {p[1]} looks identical to {p[0]} — drop one.</p>)}
          {result.conflicts?.map((c, i) => <p key={`c${i}`}>· {c.name}{c.variant !== "normal" ? ` (${c.variant})` : ""} appears in more than one box. Put them in one box and re-upload.</p>)}
        </div>
      )}

      {result?.status === "ok" && result.items && result.totals && (
        <div className="space-y-4">
          {saved && (
            <div className="rounded-lg border border-[rgba(93,230,168,0.28)] bg-[rgba(93,230,168,0.10)] px-4 py-3 text-sm text-[color:var(--up)]">
              {saved.leaderboard
                ? `Updated — you're on the leaderboard with ${fmt(saved.total)}.`
                : `Saved — ${saved.pets} scanned pet${saved.pets === 1 ? "" : "s"} ${saved.pets === 1 ? "is" : "are"} now tracked. Any pets you added manually were kept, and you're not on the leaderboard.`}
            </div>
          )}
          <div className="petora-card p-5">
            <p className="text-sm text-[color:var(--muted)]">Total value</p>
            <p className="petora-gradient mt-1 text-3xl font-bold tabular-nums [font-family:var(--font-data)]">{fmt(result.totals.total)}</p>
          </div>

          <ul className="petora-card divide-y divide-[color:var(--line)]">
            {result.items.map((it, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-[color:var(--text)]">{it.name}</span>
                    {it.count > 1 && <span className="rounded bg-[rgba(168,139,250,0.12)] px-1.5 py-0.5 text-[11px] font-medium text-[color:var(--lilac)]">×{it.count}</span>}
                    <VariantChips item={it} />
                  </div>
                </div>
                <div className="text-right tabular-nums [font-family:var(--font-data)]">
                  <div className="font-medium text-[color:var(--lilac)]">{it.subtotal === null ? "—" : fmt(it.subtotal)}</div>
                  {it.count > 1 && it.unit_value !== null && <div className="text-xs text-[color:var(--muted)]">{fmt(it.unit_value)} each</div>}
                </div>
              </li>
            ))}
          </ul>

          {saved?.leaderboard && (
            <div className="space-y-2">
              <button onClick={requestCheck}
                className="w-full rounded-lg border border-[color:var(--line-2)] px-4 py-2.5 text-sm font-medium text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)]">
                Something look wrong? Request a manual check
              </button>
              {flagMsg && <p className="text-sm text-[color:var(--muted)]">{flagMsg}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}