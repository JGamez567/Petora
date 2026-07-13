"""
debug_scan_tiles.py -- run the scanner on one screenshot and dump every tile
crop as an image named with its match, so mismatches can be eyeballed.

Usage (from the scanner/ folder):
    py debug_scan_tiles.py build_reference\\Ellie2.png

Output: a folder  debug_tiles/  next to this script, containing files like
    b0_c03__Kangaroo__NFR__weak_s21.png
      |   |      |      |     |    +-- combined score (lower = closer match)
      |   |      |      |     +------- confidence bucket
      |   |      |      +------------- variant read from badges (N/M/F/R, '-')
      |   |      +-------------------- matched pet name
      |   +--------------------------- cell index within the box (reading order)
      +------------------------------- box id (top box = 0, bottom = 1)

Open the folder, set Explorer to large icons, and every wrong label is obvious.
"""

import json
import os
import re
import sys
from pathlib import Path

from PIL import Image

import common as cm

def sanitize(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_") or "unknown"

def main():
    if len(sys.argv) < 2:
        print("usage: py debug_scan_tiles.py <screenshot.png>")
        sys.exit(1)

    img_path = Path(sys.argv[1])
    if not img_path.exists():
        print(f"file not found: {img_path}")
        sys.exit(1)

    ref_path = Path(os.getenv("REFERENCE_PATH", "data/reference.json"))
    if not ref_path.exists():
        print(f"reference.json not found at {ref_path} — set REFERENCE_PATH or run from scanner/")
        sys.exit(1)
    library = json.loads(ref_path.read_text())
    print(f"library: {len(library)} reference entries from {ref_path}")

    im = Image.open(img_path).convert("RGB")
    out_dir = Path(__file__).parent / "debug_tiles"
    out_dir.mkdir(exist_ok=True)
    # clear old crops so runs don't mix
    for old in out_dir.glob("*.png"):
        old.unlink()

    boxes = cm.segment_board(im)
    print(f"boxes found: {len(boxes)}  "
          f"(verified: {sum(1 for b in boxes if b['verified'])})")

    rows = []
    for box in boxes:
        if not box["verified"]:
            print(f"  box {box['box_id']}: NOT verified — {box['cell_count']} cells skipped")
            continue
        for idx, (x, y, w, h) in enumerate(box["cells"]):
            crop = im.crop((x, y, x + w, y + h))
            m = cm.best_match(crop, library)
            b = cm.detect_badges(crop)
            variant = cm.variant_str(b)
            fname = (f"b{box['box_id']}_c{idx:02d}__{sanitize(m['pet'])}"
                     f"__{variant}__{m['confidence']}_s{m['score']}.png")
            crop.save(out_dir / fname)
            rows.append((box["box_id"], idx, m["pet"], variant,
                         m["confidence"], m["score"], m["phash_d"], m["color_d"]))

    print(f"\nsaved {len(rows)} tiles to {out_dir}\n")
    print(f"{'box':>3} {'cell':>4}  {'match':<34} {'var':<4} {'conf':<10} {'score':>6} {'phash':>6} {'color':>6}")
    for r in rows:
        print(f"{r[0]:>3} {r[1]:>4}  {r[2]:<34} {r[3]:<4} {r[4]:<10} {r[5]:>6} {r[6]:>6} {r[7]:>6}")

if __name__ == "__main__":
    main()