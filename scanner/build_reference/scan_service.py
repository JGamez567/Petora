"""
scan_service.py  --  one HTTP endpoint that runs the whole scanner in-process.

    POST /scan   (multipart/form-data)
      files    : 1..7 board screenshots (one per in-game page)
      mode     : "personal" | "leaderboard"   (default "personal")
      account  : required when mode == "leaderboard" (the user's Roblox username)

It calls common.py:  read_username (gate) -> recognize_board (segment+match+badge)
-> aggregate (one-box-per-variant dedup) -> value_portfolio (value * count).

Deploy like the scraper (a small Python service on Render). The Next.js app
uploads to /scan and renders the result + the correction UX. NOTE: corrections
themselves are NOT applied here -- /scan only recognizes and values. The
asymmetric rule (auto-accept downgrades, queue upgrades for review) belongs in a
separate /submit endpoint that writes portfolio_items, so a recognition call can
never inflate a leaderboard total on its own.

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


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/scan")
def scan(files: list[UploadFile] = File(...),
         mode: str = Form("personal")):
    images = _read_images(files)
    library = _library()

    # 1) Username gate -- leaderboard submissions only.
    # 1) OCR the header username(s) as EVIDENCE only (leaderboard mode).
    #    NOT an identity gate: /scan has no auth context, so a client-supplied
    #    account name is just a forgeable string compared against a forgeable
    #    screenshot. The real check -- OCR'd name vs the OAuth-verified
    #    roblox_username -- happens in /submit, which knows the signed-in user.
    gate = None
    if mode == "leaderboard":
        gate = {"detected": [cm.read_username(img) for img in images]}

    # 2) Recognize every page (segment + match + badges; unverified boxes skipped).
    pages = [cm.recognize_board(img, library) for img in images]
    skipped = [{"page": pi, "box_id": b["box_id"], "pets": b["cell_count"]}
               for pi, page in enumerate(pages) for b in page["boxes"]
               if not b["verified"]]

    # 3) Dedup across boxes/pages (one box per variant).
    agg = cm.aggregate(cm.boards_from_pages(pages), on_conflict="ask")
    if agg["status"] != "ok":
        return {"status": "needs_consolidation", "mode": mode, "gate": gate,
                "skipped_boxes": skipped, **agg}

    # 4) Value the consolidated list (value * count).
    variant_map, value_map = _value_maps()
    rows, totals, missing = cm.value_portfolio(agg["items"], variant_map, value_map)

    return {"status": "ok", "mode": mode, "gate": gate,
            "pages": len(images), "skipped_boxes": skipped,
            "items": rows, "totals": totals, "missing": missing,
            "warnings": agg.get("warnings")}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("scan_service:app", host="0.0.0.0",
                port=int(os.getenv("PORT", "8000")), reload=True)