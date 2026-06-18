"""
08_value_scan.py  --  value the consolidated portfolio against Supabase.

Pipeline:  06 -> 09 (consolidated.json) -> 08 (this)

Reads data/consolidated.json (09's output), maps each item to its
pet_variant_id on (pet_id, neon, fly, ride), pulls the latest value from the
current_pet_values view, and prints a valued table with per-item subtotals
(value * count) and a grand total. Writes data/valued.json.

Env: data/../.env (i.e. build_reference/.env) with SUPABASE_URL and
SUPABASE_ANON_KEY  -- NOTE: no NEXT_PUBLIC_ prefix (the Python side differs from
the app's .env.local on purpose). Catalog tables are public-read, so the anon
key is enough.

If your previous, working 08 already authenticates/queries Supabase a certain
way, keep that fetch code -- only fetch_variants()/fetch_values() changed shape
here. value_portfolio() is the part that now multiplies by count.

    py 08_value_scan.py
"""

import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

HERE = Path(__file__).parent
DATA_DIR = HERE / "data"
CONSOLIDATED = DATA_DIR / "consolidated.json"
VALUED = DATA_DIR / "valued.json"

load_dotenv(HERE / ".env")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "")
PAGE = 1000


def _get(table, select):
    """Paged GET against a public-read table/view -> list of rows."""
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    rows, offset = [], 0
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=headers,
            params={"select": select, "limit": PAGE, "offset": offset},
            timeout=30,
        )
        r.raise_for_status()
        batch = r.json()
        rows.extend(batch)
        if len(batch) < PAGE:
            return rows
        offset += PAGE


def fetch_variant_map():
    """(pet_id, neon, fly, ride) -> pet_variant_id."""
    m = {}
    for v in _get("pet_variants", "id,pet_id,neon,fly,ride"):
        m[(v["pet_id"], v["neon"], bool(v["fly"]), bool(v["ride"]))] = v["id"]
    return m


def fetch_value_map():
    """pet_variant_id -> latest value."""
    return {row["pet_variant_id"]: row["value"]
            for row in _get("current_pet_values", "pet_variant_id,value")}


def value_portfolio(items, variant_map, value_map):
    """Pure valuation. Returns (rows, totals, missing)."""
    rows, missing = [], []
    total = confident_total = 0.0
    for it in items:
        key = (it["pet_id"], it["neon"], bool(it["fly"]), bool(it["ride"]))
        vid = variant_map.get(key)
        value = value_map.get(vid) if vid is not None else None
        count = it.get("count", 1)
        if value is None:
            missing.append(it)
            subtotal = None
        else:
            subtotal = float(value) * count
            total += subtotal
            if it.get("confidence") == "confident":
                confident_total += subtotal
        rows.append({**it, "pet_variant_id": vid, "unit_value": value,
                     "subtotal": subtotal})
    return rows, {"total": total, "confident_total": confident_total}, missing


def main():
    if not CONSOLIDATED.exists():
        sys.exit(f"Missing {CONSOLIDATED} -- run 09_aggregate_boards.py first.")
    data = json.loads(CONSOLIDATED.read_text())
    if data.get("status") != "ok":
        sys.exit("consolidated.json is not finalized (needs_consolidation). "
                 "Resolve the box conflicts and re-run 09 before valuing.")
    if not SUPABASE_URL or not SUPABASE_KEY:
        sys.exit("Set SUPABASE_URL and SUPABASE_ANON_KEY in build_reference/.env")

    items = data["items"]
    rows, totals, missing = value_portfolio(items, fetch_variant_map(), fetch_value_map())

    name_w = 26
    print(f"\n{'qty':<4}{'variant':<11}{'pet':<{name_w}}{'value':<8}{'subtotal':<10}conf")
    print("-" * (4 + 11 + name_w + 8 + 10 + 6))
    for r in sorted(rows, key=lambda x: -(x["subtotal"] or 0)):
        from_n = r["neon"] if r["neon"] != "normal" else ""
        var = " ".join(filter(None, [from_n, "F" if r["fly"] else "", "R" if r["ride"] else ""])) or "-"
        val = "-" if r["unit_value"] is None else str(r["unit_value"])
        sub = "-" if r["subtotal"] is None else f"{r['subtotal']:.0f}"
        print(f"{r['count']:<4}{var:<11}{str(r['pet'])[:name_w-2]:<{name_w}}{val:<8}{sub:<10}{r['confidence']}")
    print("-" * (4 + 11 + name_w + 8 + 10 + 6))
    print(f"TOTAL: {totals['total']:.0f}")
    if missing:
        print(f"  ({len(missing)} item(s) had no value row -- new/unpriced variant?)")
    # The handoff insight: confidence is inversely correlated with value, so the
    # confident-only total badly understates a real portfolio. Show TOTAL as the
    # number; surface confidence per row instead of as a separate (misleading) sum.
    print(f"  [info] confident-only total = {totals['confident_total']:.0f} "
          f"-- do NOT show this as the portfolio value; it omits most high-value pets.")

    VALUED.write_text(json.dumps({"rows": rows, "totals": totals,
                                  "missing": missing}, indent=2))
    print(f"\n  valued -> {VALUED}")


if __name__ == "__main__":
    main()