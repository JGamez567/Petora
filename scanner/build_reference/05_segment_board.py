"""
05_segment_board.py — slice an Adopt Me board screenshot into pet cells,
grouped by box and gated on the VERIFIED OWNER badge.

Thin CLI wrapper around common.segment_board. ALL segmentation logic and tuning
constants now live in common.py (single source of truth) — this file only does
the inspection output: crop verified-box cells to data/cells/, write
data/segments.json, and draw data/segment_overview.png.

    py 05_segment_board.py path\\to\\board_screenshot.png
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

import common as cm

DATA_DIR = Path(__file__).parent / "data"
CELL_DIR = DATA_DIR / "cells"
OVERVIEW = DATA_DIR / "segment_overview.png"
SEGMENTS = DATA_DIR / "segments.json"


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("Usage: py 05_segment_board.py path\\to\\board_screenshot.png")
    src = Path(sys.argv[1])
    if not src.exists():
        sys.exit(f"File not found: {src}")

    im = Image.open(src).convert("RGB")
    boxes = cm.segment_board(im)          # canonical segmentation (common.py)
    if not boxes:
        sys.exit("No boxes found. If the board color differs, tune RED_* in common.py.")

    CELL_DIR.mkdir(parents=True, exist_ok=True)
    for f in CELL_DIR.glob("cell_*.png"):
        f.unlink()

    overlay = im.copy()
    draw = ImageDraw.Draw(overlay)
    segments = {"source": src.name, "image_size": [im.width, im.height], "boxes": []}
    cell_index = 0  # flat index across verified boxes (kept for 04/06 compatibility)

    for box in boxes:
        x, y, w, h = box["bbox"]
        is_verified = box["verified"]
        color = (0, 200, 0) if is_verified else (140, 140, 140)
        draw.rectangle([x, y, x + w, y + h], outline=color, width=6)

        box_record = {"box_id": box["box_id"], "bbox": [x, y, w, h],
                      "verified": is_verified, "cell_count": box["cell_count"], "cells": []}

        for (cx, cy, cw, ch) in box["cells"]:   # empty for skipped boxes
            draw.rectangle([cx, cy, cx + cw, cy + ch], outline=color, width=3)
            fname = f"cell_{cell_index:02d}.png"
            im.crop((cx, cy, cx + cw, cy + ch)).save(CELL_DIR / fname)
            draw.text((cx + 6, cy + 4), str(cell_index), fill=(0, 120, 0))
            box_record["cells"].append({"cell_id": fname, "bbox": [cx, cy, cw, ch]})
            cell_index += 1

        if not is_verified:
            draw.text((x + 12, y + 12), "SKIPPED (no verified badge)", fill=(60, 60, 60))
        segments["boxes"].append(box_record)

    overlay.save(OVERVIEW)
    SEGMENTS.write_text(json.dumps(segments, indent=2), encoding="utf-8")

    n_verified = sum(b["verified"] for b in segments["boxes"])
    skipped = [b for b in segments["boxes"] if not b["verified"]]
    print(f"Boxes: {len(boxes)}  ({n_verified} verified, {len(skipped)} skipped)")
    print(f"Verified cells cropped: {cell_index}")
    for b in skipped:
        print(f"  SKIPPED box {b['box_id']} at {b['bbox'][:2]} "
              f"({b['cell_count']} pets, no VERIFIED OWNER badge)")
    print(f"  cells    -> {CELL_DIR}\\cell_00.png ...")
    print(f"  grouping -> {SEGMENTS}")
    print(f"  check    -> {OVERVIEW}  (green = scanned, grey = skipped)")


if __name__ == "__main__":
    main()