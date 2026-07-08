# debug_match.py — per-cell recognition diagnostic.
#   py debug_match.py path\to\board.png [top_n]
#
# For every verified cell, prints the top-N library matches with combined score
# and the phash/color breakdown, plus the badges detected on that cell. Use it to
# see WHY a pet was (mis)identified and to measure whether a new reference helped:
# rebuild reference.json, re-run, check the correct pet's score dropped and it won.
#
# Combined score = phash_d + COLOR_WEIGHT*color_d  (lower = closer).
#   confident: score<=12 and gap>=4 | review: score<=18 | weak: worse.
import sys, json, os
from pathlib import Path
from PIL import Image
import common as cm
import imagehash

ref_path = Path(os.getenv("REFERENCE_PATH", "data/reference.json"))
LIB = json.loads(ref_path.read_text())
im = Image.open(sys.argv[1]).convert("RGB")
TOP_N = int(sys.argv[2]) if len(sys.argv) > 2 else 3

def scored(cell_img):
    norm = cm.normalize_icon(cell_img)
    qp = imagehash.phash(norm, hash_size=cm.HASH_SIZE)
    qc = imagehash.colorhash(norm)
    out = []
    for e in LIB:
        pd = int(qp - imagehash.hex_to_hash(e["phash"]))
        cd = int(qc - imagehash.hex_to_flathash(e["colorhash"], 42))
        out.append((pd + cm.COLOR_WEIGHT * cd, pd, cd, e["name"]))
    out.sort(key=lambda x: (x[0], x[1]))
    return out

idx = 0
for box in cm.segment_board(im):
    if not box["verified"]:
        continue
    for (x, y, w, h) in box["cells"]:
        crop = im.crop((x, y, x + w, y + h))
        b = cm.detect_badges(crop)
        top = scored(crop)[:TOP_N]
        gap = top[1][0] - top[0][0] if len(top) > 1 else 99
        conf = ("confident" if top[0][0] <= 12 and gap >= 4
                else "review" if top[0][0] <= 18 else "weak")
        cands = " | ".join(f"{n}({s:.0f}: p{p} c{c})" for s, p, c, n in top)
        print(f"cell {idx:2} [{cm.variant_str(b):4}] {conf:9} {cands}")
        idx += 1