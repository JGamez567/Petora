"use client";

import { useRef, useState, useEffect } from "react";
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
// Mirrors route.ts's success `submissions` block (the daily SUCCESS_LIMIT budget).
interface Budget {
  limit: number;
  used: number;
  remaining: number;
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

// "2 scans left today" / "1 scan left today" / "No scans left today"
const budgetLabel = (remaining: number) =>
  remaining <= 0 ? "No scans left today" : `${remaining} scan${remaining === 1 ? "" : "s"} left today`;

// Animated count-up toward `target`. Eases out via rAF; snaps under reduced motion.
function useCountUp(target: number, duration = 900): number {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { fromRef.current = target; setDisplay(target); return; }
    const from = fromRef.current;
    if (from === target) { setDisplay(target); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); fromRef.current = target; };
  }, [target, duration]);
  return display;
}

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
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);       // genuine failures (red)
  const [limitMsg, setLimitMsg] = useState<string | null>(null); // hit a daily cap (amber, not an error)
  const [budget, setBudget] = useState<Budget | null>(null);     // "N scans left today"
  const [result, setResult] = useState<ScanResult | null>(null);
  const [saved, setSaved] = useState<{ leaderboard: boolean; total: number; pets: number } | null>(null);
  const [flagMsg, setFlagMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0); // seconds spent on the current scan
  const inputRef = useRef<HTMLInputElement>(null);

  // manual-review selection mode: user taps the pets the scanner got wrong
  const [flagMode, setFlagMode] = useState(false);
  const [flaggedIdx, setFlaggedIdx] = useState<Set<number>>(new Set());
  const [flagSubmitting, setFlagSubmitting] = useState(false);

  // Object URLs for the thumbnails. Built once per files change and revoked on
  // the next change/unmount.
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  // Tick a seconds counter while a scan is in flight, so the loading copy can
  // escalate ("waking up the scanner") on a Render cold start.
  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  const coldStart = elapsed >= 10; // typical warm scan is ~8s; longer => likely spinning up

  // NOTE: budget is intentionally NOT reset here — once the server tells us the
  // daily quota, we keep showing it across re-uploads / toggle flips until the
  // next response refreshes it.
  const reset = () => {
    setResult(null); setError(null); setLimitMsg(null); setSaved(null); setFlagMsg(null);
    setFlagMode(false); setFlaggedIdx(new Set());
  };
  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const imgs = Array.from(incoming).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...imgs].slice(0, MAX_PAGES));
    reset();
  };
  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));
  const canRun = files.length > 0 && !loading;

  const animatedTotal = useCountUp(result?.totals?.total ?? 0);

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
        if (data.submissions) setBudget(data.submissions as Budget); // refresh "N scans left today"
      } else if (data.error === "scan_not_ok" && data.scan?.status === "needs_consolidation") {
        // same consolidation UI as before — surface the scanner's findings
        setResult(data.scan as ScanResult);
      } else if (data.error === "rate_limited") {
        // Daily SUCCESS cap. route.ts already composes tailored copy (mentions the
        // limit, hours left, and the premium upsell for free users) — prefer it.
        setBudget({ limit: data.limit, used: data.used, remaining: 0 });
        setLimitMsg(
          data.message ??
            `You've used all your scans for today. Try again in about ${data.hours_left ?? 24}h.`
        );
      } else if (data.error === "too_many_attempts") {
        // Compute-abuse cap (mostly failed scans). Separate axis from the success
        // budget, so we don't touch `budget` here — just show the slow-down note.
        setLimitMsg(
          data.message ??
            `Too many scan attempts today. Upload clear screenshots of your pet menu, then try again in about ${data.hours_left ?? 24}h.`
        );
      } else {
        const map: Record<string, string> = {
          not_signed_in: "Please sign in to scan.",
          profile_not_found: "We couldn't load your profile. Please sign in again.",
          roblox_verification_required:
            "To appear on the leaderboard, verify your Roblox account first on the Verification page. You can still scan privately by turning the leaderboard toggle off.",
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
      setError(
        coldStart
          ? "The scanner was still waking up and timed out. Give it a few seconds and tap scan again — it'll be warm now."
          : "Couldn't reach the server. Please try again in a moment."
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleFlag(i: number) {
    setFlaggedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  // Send the user's selections. The server links this to their latest submit
  // snapshot, so the admin sees the full scan (with confidence ratings) plus
  // exactly which pets the user says are wrong.
  async function submitFlags() {
    if (!result?.items || flaggedIdx.size === 0 || flagSubmitting) return;
    setFlagSubmitting(true);
    setFlagMsg(null);
    const flagged = [...flaggedIdx]
      .map((i) => result.items![i])
      .filter(Boolean)
      .map((it) => ({
        name: it.name,
        pet_variant_id: it.pet_variant_id,
        neon: it.neon,
        fly: it.fly,
        ride: it.ride,
        count: it.count,
      }));
    try {
      const res = await fetch("/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged }),
      });
      if (res.ok) {
        setFlagMsg(`Thanks — ${flagged.length} pet${flagged.length === 1 ? "" : "s"} sent for manual review. We'll take a look.`);
        setFlagMode(false);
        setFlaggedIdx(new Set());
      } else {
        setFlagMsg("Couldn't send the request. Try again.");
      }
    } catch {
      setFlagMsg("Couldn't send the request. Try again.");
    } finally {
      setFlagSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <style>{`
        @keyframes ptrsFadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ptrsFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes ptrsPopIn { from{opacity:0;transform:scale(.85)} to{opacity:1;transform:scale(1)} }
        @keyframes ptrsCheckDraw { from{stroke-dashoffset:1} to{stroke-dashoffset:0} }
        @keyframes ptrsScanSweep { from{left:-40%} to{left:110%} }
        @keyframes ptrsFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        .ptrs-reveal { opacity:0; animation: ptrsFadeUp .45s cubic-bezier(.22,1,.36,1) forwards; }
        .ptrs-fade { animation: ptrsFadeIn .25s ease-out; }
        .ptrs-pop { animation: ptrsPopIn .3s cubic-bezier(.22,1,.36,1) both; }
        .ptrs-check { stroke-dasharray:1; stroke-dashoffset:1; animation: ptrsCheckDraw .5s ease-out both; }
        .ptrs-sweep-track { position:relative; overflow:hidden; }
        .ptrs-sweep {
          position:absolute; top:0; bottom:0; width:35%; left:-40%;
          background: linear-gradient(90deg, transparent, rgba(196,181,253,0.65), transparent);
          animation: ptrsScanSweep 1.5s ease-in-out infinite;
        }
        .ptrs-float { animation: ptrsFloat 2.8s ease-in-out infinite; }
        .ptrs-thumb { transition: transform .18s ease, box-shadow .18s ease; }
        .ptrs-thumb:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 8px 22px -10px rgba(168,85,247,0.5); }
        @media (prefers-reduced-motion: reduce) {
          .ptrs-reveal,.ptrs-fade,.ptrs-pop,.ptrs-check,.ptrs-sweep,.ptrs-float {
            animation:none!important; opacity:1!important; transform:none!important;
            stroke-dashoffset:0!important;
          }
          .ptrs-thumb, .ptrs-thumb:hover { transition:none!important; transform:none!important; }
        }
      `}</style>

      <div className="ptrs-reveal flex flex-wrap items-center justify-between gap-3">
        <h1 className="[font-family:var(--font-display)] text-lg font-semibold text-[color:var(--text)]">
          Scan your pets
        </h1>
        {budget && (
          <span
            className={`ptrs-pop rounded-full border px-2.5 py-1 text-xs font-medium ${
              budget.remaining <= 0
                ? "border-[rgba(245,200,120,0.28)] bg-[rgba(245,200,120,0.08)] text-[#F5C878]"
                : "border-[color:var(--line-2)] bg-[color:var(--surface-2)] text-[color:var(--muted)]"
            }`}
            title={`${budget.used}/${budget.limit} used in the last 24h`}
          >
            {budgetLabel(budget.remaining)}
          </span>
        )}
      </div>

      {/* Pre-scan checklist — the four things that make a profile scannable */}
      <div className="petora-card ptrs-reveal p-5" style={{ animationDelay: "60ms" }}>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
          Before you scan
        </p>
        <ul className="space-y-2.5 text-sm text-[color:var(--text)]">
          {[
            "Take a screenshot of only your profile.",
            "Keep duplicate pets together in one box.",
            "Make sure the username you verified with is visible.",
            "Remove any stickers.",
          ].map((tip, i) => (
            <li key={tip} className="ptrs-reveal flex items-start gap-2.5" style={{ animationDelay: `${120 + i * 80}ms` }}>
              <svg
                className="mt-0.5 h-4 w-4 flex-none text-[color:var(--lilac)]"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              >
                <path className="ptrs-check" style={{ animationDelay: `${200 + i * 80}ms` }} d="M20 6 9 17l-5-5" pathLength={1} />
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
      <div className="ptrs-reveal rounded-lg border border-[rgba(245,200,120,0.28)] bg-[rgba(245,200,120,0.08)] px-4 py-3 text-sm text-[#F5C878]" style={{ animationDelay: "140ms" }}>
        Scanning <span className="font-semibold">replaces</span> the pets currently tracked in your
        portfolio with whatever&apos;s in these screenshots. Manual edits on your portfolio page
        aren&apos;t touched. Use the toggle below to choose whether this scan also lists you on the
        public leaderboard.
      </div>

      {/* The one toggle: leaderboard opt-in/opt-out -> profiles.is_public */}
      <div className="petora-card ptrs-reveal flex items-center justify-between gap-4 p-4" style={{ animationDelay: "200ms" }}>
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
          className={`relative h-7 w-[52px] shrink-0 rounded-full transition-all duration-200 ${
            leaderboard
              ? "[background-image:var(--ramp-h)] shadow-[0_0_14px_rgba(168,85,247,0.45)]"
              : "border border-[color:var(--line-2)] bg-[color:var(--surface-2)]"
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
              leaderboard ? "left-[26px]" : "left-1"
            }`}
          />
        </button>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        aria-label="Upload screenshots"
        className={`ptrs-reveal cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--violet)] ${
          dragging
            ? "scale-[1.01] border-[color:var(--violet)] bg-[rgba(168,139,250,0.12)] shadow-[0_0_30px_-8px_rgba(168,85,247,0.5)]"
            : "border-[color:var(--line-2)] bg-[rgba(168,139,250,0.04)] hover:border-[color:var(--violet)] hover:bg-[rgba(168,139,250,0.07)]"
        }`}
        style={{ animationDelay: "260ms" }}
      >
        <span className="ptrs-float mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl text-[color:var(--lilac)]" style={{ background: "rgba(168,139,250,0.10)", border: "1px solid var(--line-2)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 16V4M7 9l5-5 5 5" />
            <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
        </span>
        <p className="text-sm text-[color:var(--muted)]">
          {dragging
            ? <span className="font-medium text-[color:var(--lilac)]">Drop them!</span>
            : <>Drop your Adopt Me profile screenshots here, or <span className="font-medium text-[color:var(--lilac)] underline">choose files</span></>}
        </p>
        <p className="mt-1 text-xs text-[color:var(--muted)] opacity-70">Up to {MAX_PAGES} pages · {files.length}/{MAX_PAGES} added</p>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="ptrs-pop relative" style={{ animationDelay: `${i * 50}ms` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previews[i]} alt={f.name} className="ptrs-thumb h-20 w-28 rounded-lg border border-[color:var(--line)] object-cover" />
              <span className="absolute bottom-1 left-1 rounded bg-[rgba(5,3,12,0.7)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--lilac)] [font-family:var(--font-data)]">
                {i + 1}
              </span>
              <button onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--line-2)] bg-[color:var(--surface-2)] text-sm text-[color:var(--text)] transition hover:border-[rgba(251,113,133,0.5)] hover:text-[#FCA5B6] active:scale-90" aria-label={`Remove ${f.name}`}>×</button>
            </div>
          ))}
        </div>
      )}

      <button onClick={run} disabled={!canRun}
        className="ptrs-reveal w-full rounded-lg [background-image:var(--ramp-h)] [font-family:var(--font-display)] px-4 py-2.5 font-semibold text-[#1a1030] shadow-[0_10px_30px_-12px_rgba(168,85,247,0.7)] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
        style={{ animationDelay: "320ms" }}>
        <span className="inline-flex items-center justify-center gap-2">
          {loading && (
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-[#1a1030]/30 border-t-[#1a1030]"
              aria-hidden="true"
            />
          )}
          {loading
            ? (leaderboard ? "Updating…" : "Scanning…")
            : (leaderboard ? "Scan & update leaderboard" : "Scan & save")}
        </span>
      </button>

      {/* Loading panel — copy escalates on a cold start (free-tier scanner waking). */}
      {loading && (
        <div className="petora-card ptrs-fade p-4" role="status" aria-live="polite">
          <div className="flex items-center gap-3">
            <span
              className="h-5 w-5 flex-none animate-spin rounded-full border-2 border-[color:var(--line-2)] border-t-[color:var(--lilac)]"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[color:var(--text)]">
                {coldStart
                  ? "Waking up the scanner…"
                  : leaderboard
                    ? "Verifying and updating your leaderboard entry…"
                    : "Reading your screenshots…"}
              </p>
              <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                {coldStart
                  ? "The scanner was asleep after a quiet spell — the first scan can take up to a minute. It's quick after that."
                  : "This usually takes just a few seconds."}
              </p>
            </div>
            <span className="flex-none text-xs tabular-nums text-[color:var(--muted)] [font-family:var(--font-data)]" aria-hidden="true">
              {elapsed}s
            </span>
          </div>
          {/* indeterminate sweep — reads as "actively scanning" */}
          <div className="ptrs-sweep-track mt-3 h-1 rounded-full bg-[rgba(168,139,250,0.10)]">
            <div className="ptrs-sweep rounded-full" />
          </div>
        </div>
      )}

      {/* Daily-cap notices are informational, not failures → amber, separate from `error`. */}
      {limitMsg && (
        <div className="ptrs-fade rounded-lg border border-[rgba(245,200,120,0.28)] bg-[rgba(245,200,120,0.08)] px-4 py-3 text-sm text-[#F5C878]">
          {limitMsg}
        </div>
      )}

      {error && <div className="ptrs-fade rounded-lg border border-[rgba(251,113,133,0.28)] bg-[rgba(251,113,133,0.10)] px-4 py-3 text-sm text-[#FCA5B6]">{error}</div>}

      {result?.status === "needs_consolidation" && (
        <div className="ptrs-fade space-y-2 rounded-lg border border-[rgba(245,200,120,0.28)] bg-[rgba(245,200,120,0.08)] px-4 py-3 text-sm text-[#F5C878]">
          <p className="font-medium">A couple of boxes need fixing first:</p>
          {result.duplicate_boards?.map((p, i) => <p key={`d${i}`}>· {p[1]} looks identical to {p[0]} — drop one.</p>)}
          {result.conflicts?.map((c, i) => <p key={`c${i}`}>· {c.name}{c.variant !== "normal" ? ` (${c.variant})` : ""} appears in more than one box. Put them in one box and re-upload.</p>)}
        </div>
      )}

      {result?.status === "ok" && result.items && result.totals && (
        <div className="space-y-4">
          {saved && (
            <div className="ptrs-pop rounded-lg border border-[rgba(93,230,168,0.28)] bg-[rgba(93,230,168,0.10)] px-4 py-3 text-sm text-[color:var(--up)]">
              <span className="mr-1.5" aria-hidden="true">✦</span>
              {saved.leaderboard
                ? `Updated — you're on the leaderboard with ${fmt(saved.total)}.`
                : `Saved — ${saved.pets} scanned pet${saved.pets === 1 ? "" : "s"} ${saved.pets === 1 ? "is" : "are"} now tracked. Any pets you added manually were kept, and you're not on the leaderboard.`}
            </div>
          )}
          {budget && (
            <p className="ptrs-fade text-xs text-[color:var(--muted)]">
              {budgetLabel(budget.remaining)}
              {budget.remaining <= 0 ? " — your quota resets on a rolling 24h window." : "."}
            </p>
          )}
          <div className="petora-card ptrs-reveal p-5">
            <p className="text-sm text-[color:var(--muted)]">Total value</p>
            <p className="petora-gradient mt-1 text-3xl font-bold tabular-nums [font-family:var(--font-data)]">{fmt(animatedTotal)}</p>
          </div>

          {/* flag-mode banner */}
          {flagMode && (
            <div className="ptrs-fade rounded-lg border border-[rgba(168,85,247,0.35)] bg-[rgba(168,85,247,0.08)] px-4 py-3 text-sm text-[color:var(--lilac)]">
              Tap every pet the scanner got wrong — wrong pet, wrong Neon/Mega tier, wrong Fly/Ride,
              or wrong count — then hit send below.
            </div>
          )}

          <ul className="petora-card divide-y divide-[color:var(--line)]">
            {result.items.map((it, i) => {
              const isFlagged = flaggedIdx.has(i);
              const rowInner = (
                <>
                  {flagMode && (
                    <span
                      aria-hidden="true"
                      className={`grid h-5 w-5 flex-none place-items-center rounded-md border transition ${
                        isFlagged
                          ? "border-[#FCA5B6] bg-[rgba(251,113,133,0.2)] text-[#FCA5B6]"
                          : "border-[color:var(--line-2)] text-transparent"
                      }`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                  )}
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
                </>
              );

              return flagMode ? (
                <li key={i} className="ptrs-reveal" style={{ animationDelay: `${Math.min(i, 14) * 40}ms` }}>
                  <button
                    type="button"
                    onClick={() => toggleFlag(i)}
                    aria-pressed={isFlagged}
                    aria-label={`Mark ${it.name} as wrong`}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                      isFlagged ? "bg-[rgba(251,113,133,0.08)]" : "hover:bg-[rgba(168,139,250,0.05)]"
                    }`}
                  >
                    {rowInner}
                  </button>
                </li>
              ) : (
                <li key={i} className="ptrs-reveal flex items-center gap-3 px-4 py-3" style={{ animationDelay: `${Math.min(i, 14) * 40}ms` }}>
                  {rowInner}
                </li>
              );
            })}
          </ul>

          {saved?.leaderboard && (
            <div className="ptrs-reveal space-y-2" style={{ animationDelay: "200ms" }}>
              {!flagMode ? (
                <button onClick={() => { setFlagMode(true); setFlagMsg(null); }}
                  className="w-full rounded-lg border border-[color:var(--line-2)] px-4 py-2.5 text-sm font-medium text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)] active:scale-[0.99]">
                  Something look wrong? Request a manual check
                </button>
              ) : (
                <div className="ptrs-fade flex gap-2">
                  <button
                    onClick={submitFlags}
                    disabled={flaggedIdx.size === 0 || flagSubmitting}
                    className="flex-1 rounded-lg [background-image:var(--ramp-h)] [font-family:var(--font-display)] px-4 py-2.5 text-sm font-semibold text-[#1a1030] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
                  >
                    {flagSubmitting
                      ? "Sending…"
                      : flaggedIdx.size === 0
                        ? "Tap the pets that are wrong"
                        : `Send ${flaggedIdx.size} pet${flaggedIdx.size === 1 ? "" : "s"} for review`}
                  </button>
                  <button
                    onClick={() => { setFlagMode(false); setFlaggedIdx(new Set()); }}
                    disabled={flagSubmitting}
                    className="rounded-lg border border-[color:var(--line-2)] px-4 py-2.5 text-sm font-medium text-[color:var(--text)] transition hover:bg-[rgba(168,139,250,0.08)] active:scale-[0.99] disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {flagMsg && <p className="ptrs-fade text-sm text-[color:var(--muted)]">{flagMsg}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}