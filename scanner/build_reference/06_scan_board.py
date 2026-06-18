"""
06_scan_board.py  —  match the cells 05 found, per box, and write a valued-ready
                     result list. Species + N/M/F/R variant, tagged with box_id.

Usage:
    py 05_segment_board.py path\\to\\board_screenshot.png   # produces segments.json
    py 06_scan_board.py    path\\to\\board_screenshot.png   # matches what 05 found

Why this no longer segments on its own:
  05 is now the single source of segmentation truth. It is box-aware (groups
  cells per board box) and verified-gated (only VERIFIED OWNER boxes are kept),
  and it writes data/segments.json describing every box + its cells. 06 reads
  that, so the two can't drift apart, and every recognized pet inherits its
  box_id automatically — which is exactly what 09's one-box-per-variant rule
  needs. Cells in unverified boxes were never cropped, so they're skipped here
  by construction; their count is reported so the UX can say "N pets skipped".

normalize_icon() / NORM_SIZE / BG / HASH_SIZE / COLOR_WEIGHT MUST stay identical
to 03/04. (Segmentation constants now live only in 05.)
"""

import json
import sys
from pathlib import Path

import imagehash
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

DATA_DIR = Path(__file__).parent / "data"
SEGMENTS = DATA_DIR / "segments.json"
REFERENCE = DATA_DIR / "reference.json"
OVERVIEW = DATA_DIR / "scan_overview.png"
RESULTS = DATA_DIR / "scan_results.json"

# ---- must match 03/04 exactly ----
NORM_SIZE = 128
BG = (255, 255, 255)
HASH_SIZE = 8
COLOR_WEIGHT = 1.0
# -----------------------------------


def normalize_icon(img):
    img = img.convert("RGBA")
    bg = Image.new("RGBA", img.size, BG + (255,))
    flat = Image.alpha_composite(bg, img).convert("RGB")
    w, h = flat.size
    side = max(w, h)
    canvas = Image.new("RGB", (side, side), BG)
    canvas.paste(flat, ((side - w) // 2, (side - h) // 2))
    return canvas.resize((NORM_SIZE, NORM_SIZE), Image.LANCZOS)


def detect_badges(crop):
    """Read N/M/F/R badges from the bottom 20% band of a cell crop. Calibrated
    on real boards; mega still needs more samples. (Unchanged from before.)"""
    arr = np.asarray(crop.convert("RGB")).astype(int)
    h, w = arr.shape[:2]
    band = arr[int(h * 0.80):, :]
    Rc, Gc, Bc = band[:, :, 0], band[:, :, 1], band[:, :, 2]
    masks = {
        "neon": (Gc > 120) & (Gc - Rc > 30) & (Gc - Bc > 30),
        "mega": (Bc > 110) & (Rc > 100) & (Gc < 120) & (Bc - Gc > 50)
                & (Rc - Gc > 40) & (Bc >= Rc - 30),
        "fly":  (Bc > 130) & (Rc < 130) & (Gc > 110) & (Bc - Rc > 40),
        "ride": (Rc > 180) & (Bc > 90) & (Rc - Gc > 60) & (Bc - Gc > 10),
    }
    amax = 0.10 * w * w
    amin_round = 0.022 * w * w
    amin_mega = 0.010 * w * w
    res = {"neon": False, "mega": False, "fly": False, "ride": False}
    for k, m in masks.items():
        amin = amin_mega if k == "mega" else amin_round
        lbl2, c = ndimage.label(m)
        for j in range(1, c + 1):
            ys, xs = np.where(lbl2 == j)
            area = len(xs)
            bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
            if amin < area < amax and 0.5 < bw / bh < 2.0 and area / (bw * bh) > 0.45:
                res[k] = True
                break
    return res


def variant_str(b):
    parts = [k[0].upper() for k in ("neon", "mega", "fly", "ride") if b[k]]
    return "".join(parts) if parts else "-"


def variant_prefix(b):
    return " ".join(w for w in ("neon", "mega", "fly", "ride") if b[w])


def schema_variant(b):
    """Map detected badges to the pet_variants schema (for 08 / value lookup)."""
    neon = "mega" if b["mega"] else "neon" if b["neon"] else "normal"
    return {"neon": neon, "fly": bool(b["fly"]), "ride": bool(b["ride"])}


def best_match(cell_img, library):
    norm = normalize_icon(cell_img)
    qp = imagehash.phash(norm, hash_size=HASH_SIZE)
    qc = imagehash.colorhash(norm)
    scored = []
    for e in library:
        pd = int(qp - imagehash.hex_to_hash(e["phash"]))
        cd = int(qc - imagehash.hex_to_flathash(e["colorhash"], 42))
        scored.append((pd + COLOR_WEIGHT * cd, pd, cd, e["name"], e.get("id")))
    scored.sort(key=lambda x: (x[0], x[1]))
    best, second = scored[0], scored[1]
    gap = second[0] - best[0]
    if best[0] <= 12 and gap >= 4:
        conf = "confident"
    elif best[0] <= 18:
        conf = "review"
    else:
        conf = "weak"
    return {"pet_id": best[4], "pet": best[3], "score": round(best[0], 1),
            "phash_d": best[1], "color_d": best[2], "confidence": conf}


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: py 06_scan_board.py path\\to\\board_screenshot.png")
    src = Path(sys.argv[1])
    if not src.exists():
        sys.exit(f"File not found: {src}")
    if not SEGMENTS.exists():
        sys.exit(f"Missing {SEGMENTS} — run 05_segment_board.py on this board first.")
    if not REFERENCE.exists():
        sys.exit(f"Missing {REFERENCE} — run 03_build_library.py first.")

    library = json.loads(REFERENCE.read_text())
    segments = json.loads(SEGMENTS.read_text())
    if segments.get("source") and segments["source"] != src.name:
        print(f"WARNING: segments.json was built from {segments['source']!r}, "
              f"not {src.name!r}. Re-run 05 if this is a different board.")

    im = Image.open(src).convert("RGB")
    overlay = im.copy()
    draw = ImageDraw.Draw(overlay)

    conf_color = {"confident": (0, 200, 0), "review": (230, 170, 0), "weak": (220, 40, 40)}
    results = []
    skipped = []

    print(f"\nScanning {src.name}\n")
    print(f"{'box':<4}{'cell':<5}{'variant':<8}{'species':<24}{'score':<7}confidence")
    print("-" * 60)

    for box in segments["boxes"]:
        bx, by, bw, bh = box["bbox"]
        if not box["verified"]:
            skipped.append(box)
            draw.rectangle([bx, by, bx + bw, by + bh], outline=(140, 140, 140), width=6)
            draw.text((bx + 12, by + 12), "SKIPPED (unverified)", fill=(60, 60, 60))
            continue
        draw.rectangle([bx, by, bx + bw, by + bh], outline=(0, 160, 0), width=4)
        for cell in box["cells"]:
            x, y, w, h = cell["bbox"]
            crop = im.crop((x, y, x + w, y + h))
            m = best_match(crop, library)
            b = detect_badges(crop)
            m["box_id"] = box["box_id"]
            m["cell"] = cell["cell_id"]
            m["variant"] = variant_str(b)
            m["variant_schema"] = schema_variant(b)
            m["full_name"] = (variant_prefix(b) + " " + m["pet"]).strip()
            results.append(m)
            print(f"{box['box_id']:<4}{cell['cell_id'].replace('cell_','').replace('.png',''):<5}"
                  f"{m['variant']:<8}{str(m['pet'])[:22]:<24}{m['score']:<7}{m['confidence']}")
            col = conf_color[m["confidence"]]
            draw.rectangle([x, y, x + w, y + h], outline=col, width=4)

    overlay.save(OVERVIEW)
    RESULTS.write_text(json.dumps(results, indent=2))

    n_conf = sum(r["confidence"] == "confident" for r in results)
    n_rev = sum(r["confidence"] == "review" for r in results)
    n_weak = sum(r["confidence"] == "weak" for r in results)
    print("-" * 60)
    print(f"{len(results)} pets across {len(segments['boxes']) - len(skipped)} verified boxes: "
          f"{n_conf} confident, {n_rev} review, {n_weak} weak")
    for s in skipped:
        print(f"  skipped box {s['box_id']} at {s['bbox'][:2]} "
              f"({s['cell_count']} pets, no VERIFIED OWNER badge)")
    print(f"\n  overview -> {OVERVIEW}  (green=confident, amber=review, red=weak)")
    print(f"  results  -> {RESULTS}  (each pet tagged with box_id + pet_id)")


if __name__ == "__main__":
    main()