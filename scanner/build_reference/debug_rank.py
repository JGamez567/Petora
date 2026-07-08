# debug_rank.py — where does a SPECIFIC pet rank for a SPECIFIC cell?
#   py debug_rank.py board.png <cell_index> "Golden Penguin" "Cuddly Candle" ...
#
# Prints the best-scoring library entry for each named pet and its rank among all
# entries, for one verified cell (index as numbered by debug_match). Tells you if
# the correct pet is present-but-losing (tune/add refs) vs genuinely far/missing.
import sys, json, os
from pathlib import Path
from PIL import Image
import common as cm
import imagehash

ref_path = Path(os.getenv("REFERENCE_PATH", "data/reference.json"))
LIB = json.loads(ref_path.read_text())
im = Image.open(sys.argv[1]).convert("RGB")
cell_i = int(sys.argv[2])
targets = sys.argv[3:]

cells = []
for box in cm.segment_board(im):
    if box["verified"]:
        cells += box["cells"]
x, y, w, h = cells[cell_i]
crop = im.crop((x, y, x + w, y + h))
norm = cm.normalize_icon(crop)
qp = imagehash.phash(norm, hash_size=cm.HASH_SIZE)
qc = imagehash.colorhash(norm)

s = []
for e in LIB:
    pd = int(qp - imagehash.hex_to_hash(e["phash"]))
    cd = int(qc - imagehash.hex_to_flathash(e["colorhash"], 42))
    s.append((pd + cm.COLOR_WEIGHT * cd, pd, cd, e["name"]))
s.sort(key=lambda x: (x[0], x[1]))

print(f"cell {cell_i}: winner = {s[0][3]} @ {s[0][0]:.0f} (p{s[0][1]} c{s[0][2]})")
for name in targets:
    hits = [(i, sc) for i, sc in enumerate(s) if sc[3] == name]
    if not hits:
        print(f"  {name:22} NOT IN LIBRARY")
        continue
    i, (sc, pd, cd, _) = min(hits, key=lambda t: t[1][0])  # best entry of this name
    print(f"  {name:22} best rank #{i+1:<4} score={sc:.0f} (p{pd} c{cd})")