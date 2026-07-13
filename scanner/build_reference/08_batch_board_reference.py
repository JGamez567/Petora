"""
08_batch_board_reference.py  (v2)  --  add MANY in-game board renders as extra
references in one shot, driven by a CSV of (tile filename -> correct pet name).

v2: MULTIPLE board references per pet are now allowed. Mega and neon pets
render with different coloring than their normal versions, so one board ref
per pet is not enough — a Mega Jellyfish tile hashes far from a Normal
Jellyfish reference and can fall through to the wrong pet entirely (observed:
Mega Jellyfish -> "Alpaca"). Now EVERY labeled tile becomes its own reference:
  - dedupe key is (pet id, tile filename), not pet id — the same CSV can add
    a normal Cow, a mega Cow, etc., and rerunning the same CSV replaces
    rather than piles up (norm files are keyed by a hash of the tile name).
  - the matcher in common.py needs no changes: it picks the nearest entry,
    and every entry maps to a pet id/name.

Usage (from build_reference/):
    py 08_batch_board_reference.py board_labels.csv

CSV format (header required):
    filename,pet_name
    b0_c00__Chick__NR__review_s15.0.png,Chick
    b0_c11__Flamingo__MFR__weak_s24.0.png,Jellyfish
    ...
Lines with an empty pet_name, or starting with '#', are skipped.
pet_name must match reference.json exactly (case-insensitive).

NOTE: normalize_icon() and the constants must match 03/07/common.py
(the golden rule). Hashing here is byte-for-byte the same as 07.
"""

import csv
import hashlib
import json
import sys
from pathlib import Path

import imagehash
from PIL import Image

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
REFERENCE = DATA_DIR / "reference.json"
NORM_DIR = DATA_DIR / "icons_norm"
TILES_DIR = BASE_DIR / "debug_tiles"

NORM_SIZE = 128
BG = (255, 255, 255)
HASH_SIZE = 8


def normalize_icon(img):
    img = img.convert("RGBA")
    bg = Image.new("RGBA", img.size, BG + (255,))
    flat = Image.alpha_composite(bg, img).convert("RGB")
    w, h = flat.size
    side = max(w, h)
    canvas = Image.new("RGB", (side, side), BG)
    canvas.paste(flat, ((side - w) // 2, (side - h) // 2))
    return canvas.resize((NORM_SIZE, NORM_SIZE), Image.LANCZOS)


def resolve_tile(fname: str):
    p = Path(fname)
    if p.is_absolute() and p.exists():
        return p
    for cand in (BASE_DIR / fname, TILES_DIR / fname):
        if cand.exists():
            return cand
    return None


def tile_key(fname: str) -> str:
    """Stable 8-char key for a tile filename, so reruns overwrite themselves."""
    return hashlib.sha1(fname.encode("utf-8")).hexdigest()[:8]


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: py 08_batch_board_reference.py board_labels.csv")
    csv_path = Path(sys.argv[1])
    if not csv_path.exists():
        sys.exit(f"CSV not found: {csv_path}")
    if not REFERENCE.exists():
        sys.exit(f"Missing {REFERENCE} — run 03_build_library.py first.")

    library = json.loads(REFERENCE.read_text())
    by_name = {}
    for e in library:
        if e.get("source") != "board":  # base entries only as name lookup
            by_name.setdefault(e["name"].lower(), e)

    NORM_DIR.mkdir(parents=True, exist_ok=True)

    added, errors = [], []
    seen_rows = set()

    with csv_path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames or "filename" not in reader.fieldnames \
                or "pet_name" not in reader.fieldnames:
            sys.exit("CSV must have header: filename,pet_name")
        for i, row in enumerate(reader, 2):
            fname = (row.get("filename") or "").strip()
            name = (row.get("pet_name") or "").strip()
            if not fname or fname.startswith("#") or not name:
                continue

            base = by_name.get(name.lower())
            if base is None:
                errors.append(f"line {i}: pet not in reference.json: \"{name}\"")
                continue

            key = (base["id"], fname)
            if key in seen_rows:
                continue  # exact same row twice in one CSV
            seen_rows.add(key)

            tile = resolve_tile(fname)
            if tile is None:
                errors.append(f"line {i}: tile image not found: {fname}")
                continue

            try:
                norm = normalize_icon(Image.open(tile))
            except Exception as e:
                errors.append(f"line {i}: could not read {fname}: {e}")
                continue

            phash = imagehash.phash(norm, hash_size=HASH_SIZE)
            chash = imagehash.colorhash(norm)
            tk = tile_key(fname)
            norm_path = NORM_DIR / f"{base['id']}_board_{tk}.png"
            norm.save(norm_path)
            rel_path = str(norm_path.relative_to(DATA_DIR.parent))

            # replace only an entry from this exact tile (same norm_path)
            library = [e for e in library
                       if not (e.get("source") == "board"
                               and e.get("norm_path") == rel_path)]
            library.append({
                "id": base["id"],
                "name": base["name"],
                "rarity": base["rarity"],
                "phash": str(phash),
                "colorhash": str(chash),
                "norm_path": rel_path,
                "source": "board",
            })
            added.append(f"{base['name']} [{fname.split('__')[0]}]")

    REFERENCE.write_text(json.dumps(library, indent=2))

    total_board = sum(1 for e in library if e.get("source") == "board")
    print(f"Added/updated {len(added)} board references:")
    for a in added:
        print(f"  {a}")
    if errors:
        print(f"ERRORS ({len(errors)}) — fix these lines and rerun:")
        for e in errors:
            print(f"  {e}")
    print(f"reference.json now has {total_board} board references, "
          f"{len(library)} entries total.")
    print("Rerun debug_scan_tiles.py to verify.")


if __name__ == "__main__":
    main()