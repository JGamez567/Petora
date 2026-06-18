"""
03_build_library.py
Turn the raw icons into the actual reference library:
  1. Normalize each icon identically (flatten transparency, square-pad, resize).
  2. Compute a perceptual hash (pHash) of the normalized image.
  3. Write data/reference.json = the library your scanner will match against.
  4. Run a collision check: which pets have near-identical hashes? Those are
     the pets your scanner will confuse. This is your go/no-go signal on
     whether HASH_SIZE is discriminative enough before you build step 2.

THE GOLDEN RULE: at scan time you must normalize each backpack cell with the
EXACT same normalize_icon() function before hashing it. Keep this function as
the single source of truth and import it from your scanner later.
"""

import json
from itertools import combinations
from pathlib import Path

import imagehash
from PIL import Image

DATA_DIR = Path(__file__).parent / "data"
CATALOG = DATA_DIR / "catalog.json"
RAW_DIR = DATA_DIR / "icons_raw"
NORM_DIR = DATA_DIR / "icons_norm"
REFERENCE = DATA_DIR / "reference.json"
COLLISIONS = DATA_DIR / "collisions.json"

# ---- Tunable knobs -------------------------------------------------------
NORM_SIZE = 128          # normalized image is NORM_SIZE x NORM_SIZE
BG = (255, 255, 255)     # background color transparency is flattened onto
HASH_SIZE = 8            # 8 -> 64-bit hash (robust). Bump to 16 -> 256-bit
                         # (more discriminative) if the collision report is noisy.
COLLISION_THRESHOLD = 5  # Hamming distance below which two pets are "too close"
# -------------------------------------------------------------------------


def normalize_icon(img: Image.Image) -> Image.Image:
    """Deterministic normalization. Whatever happens here at build time must
    happen identically to query cells at scan time."""
    img = img.convert("RGBA")

    # Flatten transparency onto a solid background. pHash works on luminance,
    # so the exact bg color is a minor knob, but consistency is mandatory.
    bg = Image.new("RGBA", img.size, BG + (255,))
    flat = Image.alpha_composite(bg, img).convert("RGB")

    # Square-pad to preserve aspect ratio, then resize. Padding (not stretching)
    # keeps the pet's proportions stable across icons of different dimensions.
    w, h = flat.size
    side = max(w, h)
    canvas = Image.new("RGB", (side, side), BG)
    canvas.paste(flat, ((side - w) // 2, (side - h) // 2))
    return canvas.resize((NORM_SIZE, NORM_SIZE), Image.LANCZOS)


def build_reference() -> list[dict]:
    pets = json.loads(CATALOG.read_text())
    NORM_DIR.mkdir(parents=True, exist_ok=True)

    by_id = {str(p["id"]): p for p in pets}
    library = []
    live = []  # (id, name, phash_obj, colorhash_obj) — used by the collision check
    missing = bad = 0

    for raw_path in sorted(RAW_DIR.glob("*.*")):
        pid = raw_path.stem
        pet = by_id.get(pid)
        if pet is None:
            continue
        try:
            with Image.open(raw_path) as im:
                norm = normalize_icon(im)
        except Exception as e:
            bad += 1
            print(f"  bad image {raw_path.name}: {e}")
            continue

        norm_path = NORM_DIR / f"{pid}.png"
        norm.save(norm_path)
        phash = imagehash.phash(norm, hash_size=HASH_SIZE)
        # pHash is colorblind (luminance/structure only). Many Adopt Me pets
        # differ mainly by color (recolors; neon/mega glow), so we ALSO store a
        # color hash. At scan time, combine both: shortlist by phash, then break
        # ties / reject mismatches using colorhash distance.
        chash = imagehash.colorhash(norm)

        library.append({
            "id": pet["id"],
            "name": pet.get("name"),
            "rarity": pet.get("rarity"),
            "phash": str(phash),
            "colorhash": str(chash),
            "norm_path": str(norm_path.relative_to(DATA_DIR.parent)),
        })
        live.append((pid, pet.get("name"), phash, chash))

    # Report pets in the catalog that never got an image.
    have = {e["id"] for e in library}
    missing = [p["id"] for p in pets if p["id"] not in have and p.get("icon_url")]
    print(f"Built {len(library)} reference entries (bad images skipped: {bad})")
    if missing:
        print(f"  {len(missing)} pets have icon_url but no normalized image — "
              f"check data/download_failures.json")

    REFERENCE.write_text(json.dumps(library, indent=2))
    print(f"Wrote {REFERENCE}")
    return library, live


def check_collisions(hashes: list) -> None:
    """Brute-force every pair (~274k for 741 pets — instant) and report the
    closest ones. `hashes` is a list of (id, name, phash_obj, colorhash_obj)."""
    pairs = []
    for (id_a, name_a, ph_a, ch_a), (id_b, name_b, ph_b, ch_b) in combinations(hashes, 2):
        pd = int(ph_a - ph_b)  # structure distance (cast: imagehash returns np.int64)
        if pd <= COLLISION_THRESHOLD:
            cd = int(ch_a - ch_b)  # color distance — separates same-shape recolors
            pairs.append({
                "a": name_a, "a_id": id_a, "b": name_b, "b_id": id_b,
                "phash_distance": pd, "colorhash_distance": cd,
            })

    pairs.sort(key=lambda p: (p["phash_distance"], p["colorhash_distance"]))
    COLLISIONS.write_text(json.dumps(pairs, indent=2))

    # A pair is only a REAL problem if it's close in BOTH structure and color.
    hard = [p for p in pairs if p["colorhash_distance"] <= COLLISION_THRESHOLD]
    print(f"\nCollision check (phash<= {COLLISION_THRESHOLD}, HASH_SIZE={HASH_SIZE}):")
    print(f"  {len(pairs)} pairs close in structure; {len(hard)} ALSO close in color (the real risks)")
    for p in pairs[:15]:
        flag = "  <-- hard" if p["colorhash_distance"] <= COLLISION_THRESHOLD else ""
        print(f"    phash_d={p['phash_distance']} color_d={p['colorhash_distance']}  "
              f"{p['a']}  <->  {p['b']}{flag}")
    if len(pairs) > 15:
        print(f"    ...and {len(pairs) - 15} more in {COLLISIONS}")
    if hard:
        print("\n  The 'hard' pairs match in both structure and color — those are the\n"
              "  pets to disambiguate with a secondary signal, or bump HASH_SIZE to 16.")


def main() -> None:
    library, live = build_reference()
    if live:
        check_collisions(live)


if __name__ == "__main__":
    main()