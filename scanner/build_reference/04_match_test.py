"""
04_match_test.py  —  validation harness (dev-side, run on YOUR machine)

Usage:
    py 04_match_test.py path\\to\\cropped_pet.png

Hand-crop ONE pet cell out of a board screenshot (just snip the square around a
single pet) and point this at it. It normalizes the crop with the SAME logic the
reference library used, hashes it, and prints the 5 nearest pets so you can see
whether the library actually recognizes a real in-game thumbnail.

What you're checking:
  1. Does the CORRECT pet come out on top? -> Elvebredd icons match game thumbnails.
  2. How do neon / fly / ride cells rank? -> tells us if variants need their own refs.

NOTE: normalize_icon() below is copied verbatim from 03_build_library.py and MUST
stay identical to it (the golden rule). If you ever change one, change both — or
better, later we extract it into a shared common.py that both import.
"""

import json
import sys
from pathlib import Path

import imagehash
from PIL import Image

DATA_DIR = Path(__file__).parent / "data"
REFERENCE = DATA_DIR / "reference.json"

# ---- must match 03_build_library.py exactly ----
NORM_SIZE = 128
BG = (255, 255, 255)
HASH_SIZE = 8
# ------------------------------------------------
# How much to weight color vs structure when ranking. 1.0 = equal. Raise it if
# neon/mega pets (where structure is unreliable but color often isn't) keep
# losing to wrong species; lower it if recolors start winning over the truth.
COLOR_WEIGHT = 1.0


def normalize_icon(img: Image.Image) -> Image.Image:
    """IDENTICAL to 03_build_library.py. Works on both transparent reference
    icons and opaque screenshot crops (an opaque crop just composites onto white
    with no visible change)."""
    img = img.convert("RGBA")
    bg = Image.new("RGBA", img.size, BG + (255,))
    flat = Image.alpha_composite(bg, img).convert("RGB")
    w, h = flat.size
    side = max(w, h)
    canvas = Image.new("RGB", (side, side), BG)
    canvas.paste(flat, ((side - w) // 2, (side - h) // 2))
    return canvas.resize((NORM_SIZE, NORM_SIZE), Image.LANCZOS)


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("Usage: py 04_match_test.py path\\to\\cropped_pet.png")

    crop_path = Path(sys.argv[1])
    if not crop_path.exists():
        sys.exit(f"File not found: {crop_path}")
    if not REFERENCE.exists():
        sys.exit(f"Missing {REFERENCE} — run 03_build_library.py first.")

    library = json.loads(REFERENCE.read_text())

    with Image.open(crop_path) as im:
        norm = normalize_icon(im)
    q_phash = imagehash.phash(norm, hash_size=HASH_SIZE)
    q_chash = imagehash.colorhash(norm)

    scored = []
    for e in library:
        pd = int(q_phash - imagehash.hex_to_hash(e["phash"]))
        # colorhash is a 42-bit FLAT hash (imagehash default binbits=3), so it
        # needs hex_to_flathash, not the square hex_to_hash.
        cd = int(q_chash - imagehash.hex_to_flathash(e["colorhash"], 42))
        score = pd + COLOR_WEIGHT * cd
        scored.append((score, pd, cd, e["name"], e["rarity"]))

    # Rank by COMBINED score (structure + weighted color), not structure-first.
    # Neon/mega re-skin the body so structure alone can rank the right pet low,
    # but color often still pins it (see the neon Capricorn test). Combining the
    # two recovers the correct pet; phash_d breaks ties.
    scored.sort(key=lambda x: (x[0], x[1]))

    print(f"\nQuery: {crop_path.name}  (COLOR_WEIGHT={COLOR_WEIGHT})")
    print(f"{'rank':<5}{'score':<8}{'phash_d':<9}{'color_d':<9}{'pet'}")
    print("-" * 56)
    for i, (sc, pd, cd, name, rarity) in enumerate(scored[:5], 1):
        print(f"{i:<5}{sc:<8.1f}{pd:<9}{cd:<9}{name}  ({rarity})")

    # Confidence read on the combined score + separation from the runner-up.
    best, second = scored[0][0], scored[1][0]
    gap = second - best
    print()
    if best <= 12 and gap >= 4:
        print(f"-> Confident match: '{scored[0][3]}' (score {best:.1f}, "
              f"clear gap of {gap:.1f} to #2).")
    elif best <= 18:
        print(f"-> Likely '{scored[0][3]}', but #2 is close (gap {gap:.1f}) — "
              f"the kind of case the user-review step is there to catch.")
    else:
        print(f"-> Weak match (best score {best:.1f}). If this IS the correct pet, "
              f"the game thumbnail differs enough from the Elvebredd icon that "
              f"this pet may need a variant-specific reference.")


if __name__ == "__main__":
    main()