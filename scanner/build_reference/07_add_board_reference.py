"""
07_add_board_reference.py  —  add an in-game BOARD render as an extra reference
for a pet whose Elvebredd icon doesn't match its in-game look.

Use this for the long tail: line-art pets (2D Kitty), or any pet the scanner
keeps missing because its catalog icon and its board thumbnail hash differently.
The pet keeps its original Elvebredd reference AND gains this board one; the
matcher just picks whichever is nearest, and both map to the same pet.

Usage:
    py 07_add_board_reference.py path\\to\\cell_crop.png "Pet Name"

Example (fix 2D Kitty using the cell the scanner already saved):
    py 07_add_board_reference.py data\\cells\\cell_04.png "2D Kitty"

Then rerun 06_scan_board.py — that pet should now match from a board render.

NOTE: normalize_icon() and the constants must match 03/04/06 (the golden rule).
"""

import json
import sys
from pathlib import Path

import imagehash
from PIL import Image

DATA_DIR = Path(__file__).parent / "data"
REFERENCE = DATA_DIR / "reference.json"
NORM_DIR = DATA_DIR / "icons_norm"

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


def main():
    if len(sys.argv) < 3:
        sys.exit('Usage: py 07_add_board_reference.py path\\to\\cell_crop.png "Pet Name"')
    crop_path = Path(sys.argv[1])
    name = sys.argv[2]
    if not crop_path.exists():
        sys.exit(f"File not found: {crop_path}")
    if not REFERENCE.exists():
        sys.exit(f"Missing {REFERENCE} — run 03_build_library.py first.")

    library = json.loads(REFERENCE.read_text())
    base = next((e for e in library if e["name"].lower() == name.lower()), None)
    if base is None:
        sys.exit(f'"{name}" is not in reference.json. Check the exact spelling, '
                 f"or it may be missing from your catalog (a scraper/library gap).")

    NORM_DIR.mkdir(parents=True, exist_ok=True)
    norm = normalize_icon(Image.open(crop_path))
    phash = imagehash.phash(norm, hash_size=HASH_SIZE)
    chash = imagehash.colorhash(norm)
    norm_path = NORM_DIR / f"{base['id']}_board.png"
    norm.save(norm_path)

    entry = {
        "id": base["id"],
        "name": base["name"],
        "rarity": base["rarity"],
        "phash": str(phash),
        "colorhash": str(chash),
        "norm_path": str(norm_path.relative_to(DATA_DIR.parent)),
        "source": "board",   # marks this as a board-render reference, not Elvebredd
    }
    # Replace any existing board reference for this pet so re-runs don't pile up.
    library = [e for e in library
               if not (e.get("source") == "board" and e["id"] == base["id"])]
    library.append(entry)
    REFERENCE.write_text(json.dumps(library, indent=2))
    print(f"Added board reference for '{base['name']}' (id {base['id']}).")
    print(f"  phash {phash}  colorhash {chash}")
    print("Now rerun the scanner — this pet should match from a board render.")


if __name__ == "__main__":
    main()