"""
scan_service.py  --  one HTTP endpoint that runs the whole scanner in-process.

    POST /scan   (multipart/form-data)
      files    : 1..7 board screenshots (one per in-game page)
      mode     : "personal" | "personal_gated" | "leaderboard"   (default "personal")
      account  : the signed-in user's Roblox username. Optional, but when present it
                 lets the OCR gate EARLY-EXIT the moment it reads a matching name
                 (instead of running all 6 Tesseract passes). route.ts sends it for
                 both "leaderboard" and "personal_gated".

FIX (v2):
  - Added "personal_gated" mode. Behaves like "personal" but also runs the OCR
    username gate and returns detected names in the response. This lets route.ts
    cross-check that the screenshot belongs to the signed-in user before writing
    to their portfolio — closing the hole where anyone could submit someone else's
    screenshot under their own account.
  - "personal" mode (legacy) still skips the gate entirely so existing callers
    that don't pass a mode aren't broken.
  - Gate now flattens candidates: read_username() returns a list per image, so
    we flatten to a single deduplicated list across all pages.

PERF (v4 - OCR gate early-exit):
  - _run_gate() now threads `account` into read_username(expected=...). With an
    expected name, OCR stops at the first pass that yields a candidate the gate
    would accept (gate_match, the same predicate route.ts uses), and we also stop
    scanning further PAGES once any accepted candidate is in hand. With no account
    (old callers), behaviour is identical to before: all passes, all candidates.
    route.ts stays the authoritative gate, so this only ever removes OCR work.

It calls common.py:  read_username (gate) -> recognize_board (segment+match+badge)
-> aggregate (one-box-per-variant dedup) -> value_portfolio (value * count).

Env:
  REFERENCE_PATH   path to reference.json   (default ./data/reference.json)
  SUPABASE_URL     Supabase project URL
  SUPABASE_ANON_KEY  anon key (catalog tables are public-read)
  ALLOW_ORIGINS    comma-separated CORS origins (default http://localhost:3000)

Run locally:  uvicorn scan_service:app --reload --port 8000
"""

import io
import json
import os
import time
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

import common as cm
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

app = FastAPI(title="Adopt Me Scanner")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOW_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"], allow_headers=["*"],
)

# ---- lazily-loaded shared state ----
_LIBRARY = None
_VALUE_CACHE = {"variant_map": None, "value_map": None, "ts": 0.0}
_VALUE_TTL = 6 * 3600  # the scraper refreshes values every 6h


def _library():
    global _LIBRARY
    if _LIBRARY is None:
        path = Path(os.getenv("REFERENCE_PATH", "data/reference.json"))
        if not path.exists():
            raise HTTPException(503, f"reference.json not found at {path} "
                                     "(run 03_build_library.py / set REFERENCE_PATH)")
        _LIBRARY = json.loads(path.read_text())
    return _LIBRARY


def _value_maps():
    """Cached (variant_map, value_map); refreshed every _VALUE_TTL."""
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        raise HTTPException(503, "SUPABASE_URL / SUPABASE_ANON_KEY not configured")
    if _VALUE_CACHE["variant_map"] is None or time.time() - _VALUE_CACHE["ts"] > _VALUE_TTL:
        _VALUE_CACHE["variant_map"] = cm.fetch_variant_map(url, key)
        _VALUE_CACHE["value_map"] = cm.fetch_value_map(url, key)
        _VALUE_CACHE["ts"] = time.time()
    return _VALUE_CACHE["variant_map"], _VALUE_CACHE["value_map"]


def _read_images(files):
    if not 1 <= len(files) <= cm.MAX_PAGES:
        raise HTTPException(400, f"Upload 1 to {cm.MAX_PAGES} images (got {len(files)}).")
    images = []
    for f in files:
        try:
            images.append(Image.open(io.BytesIO(f.file.read())).convert("RGB"))
        except Exception:
            raise HTTPException(400, f"Could not read image: {f.filename}")
    return images


def _run_gate(images, expected=""):
    """
    Run OCR username detection across all uploaded pages.

    read_username() returns a list of candidates per image. We flatten and
    deduplicate across pages so route.ts gets one clean list to check against the
    verified profile username.

    When `expected` is given, read_username() early-exits at the first accepted
    read per image, and we also stop scanning further pages once any accepted
    candidate is in hand — the username is the same on every page, so one accepted
    read is all the gate needs. With no `expected`, every pass runs (old behaviour).

    Returns None-safe dict {"detected": [...]}; on missing pytesseract returns
    {"detected": []} so route.ts soft-allows.
    """
    expected = (expected or "").strip()
    try:
        seen = set()
        candidates = []
        for img in images:
            for name in cm.read_username(img, expected=expected or None):
                if name and name not in seen:
                    seen.add(name)
                    candidates.append(name)
            # Cross-page early-exit: an accepted read on any page is enough.
            if expected and any(cm.gate_match(c, expected) for c in candidates):
                break
        return {"detected": candidates}
    except RuntimeError:
        # pytesseract not installed — gate unavailable, route.ts soft-allows
        return {"detected": []}


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/scan")
def scan(files: list[UploadFile] = File(...),
         mode: str = Form("personal"),
         account: str = Form("")):
    t = {}
    _t = time.perf_counter()

    images = _read_images(files)
    library = _library()
    t["decode_load"] = time.perf_counter() - _t; _t = time.perf_counter()

    # 1) Username gate.
    #
    #    leaderboard:     always run — route.ts hard-rejects on mismatch.
    #    personal_gated:  FIX — also run so route.ts can soft-reject if a
    #                     username IS detected but doesn't match the signed-in user.
    #    personal:        skip (legacy behaviour — no gate, gate=None in response).
    #
    #    `account` (the signed-in user's roblox_username) is optional: when present
    #    it only lets the gate stop OCR early on a matching read. The real
    #    enforcement (OCR'd name vs OAuth-verified roblox_username in profiles) still
    #    happens in route.ts, which knows who is signed in. /scan has no auth context.
    if mode in ("leaderboard", "personal_gated"):
        gate = _run_gate(images, account)
    else:
        gate = None
    t["gate_ocr"] = time.perf_counter() - _t; _t = time.perf_counter()

    # 2) Recognize every page (segment + match + badges; unverified boxes skipped).
    pages = [cm.recognize_board(img, library) for img in images]
    t["recognize"] = time.perf_counter() - _t; _t = time.perf_counter()

    skipped = [{"page": pi, "box_id": b["box_id"], "pets": b["cell_count"]}
               for pi, page in enumerate(pages) for b in page["boxes"]
               if not b["verified"]]

    # 3) Dedup across boxes/pages (one box per variant).
    agg = cm.aggregate(cm.boards_from_pages(pages), on_conflict="ask")
    t["aggregate"] = time.perf_counter() - _t; _t = time.perf_counter()
    if agg["status"] != "ok":
        return {"status": "needs_consolidation", "mode": mode, "gate": gate,
                "skipped_boxes": skipped,
                "timings": {k: round(v, 3) for k, v in t.items()}, **agg}

    # 4) Value the consolidated list (value * count).
    variant_map, value_map = _value_maps()
    rows, totals, missing = cm.value_portfolio(agg["items"], variant_map, value_map)
    t["value"] = time.perf_counter() - _t

    return {"status": "ok", "mode": mode, "gate": gate,
            "pages": len(images), "skipped_boxes": skipped,
            "items": rows, "totals": totals, "missing": missing,
            "warnings": agg.get("warnings"),
            "timings": {k: round(v, 3) for k, v in t.items()}}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("scan_service:app", host="0.0.0.0",
                port=int(os.getenv("PORT", "8000")), reload=True)