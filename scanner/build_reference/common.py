"""
common.py  --  the Adopt Me board scanner, as one importable library.

Pipeline:  read_username (gate) -> segment_board -> recognize_board
           -> aggregate (dedup) -> value_portfolio

FIX (scanner v3 - multi-color support):
  - Replaces hardcoded red_mask() with bg_mask() which auto-detects whichever
    of the 7 Adopt Me background colors the user has set, then masks on that.
    Supported colors: red, pink, blue, purple, green, orange, black.
  - detect_bg_color() samples a grid across the image and finds the closest
    known color by median distance, making it robust to pet icon interference.
  - bg_mask() uses a per-color tolerance tuned to each color's distance from
    white (cell backgrounds), so no color is confused with a pet cell.
  - _header_band() updated to use bg_mask() instead of red_mask().
  - All other logic (badge detection, cell/box finding, OCR gate, hashing,
    aggregation, valuation) is unchanged.

FIX (scanner v2 - badge + OCR):
  - find_verified_badges() now scales thresholds with H*W (total image area).
  - read_username() returns a list of candidates across multiple PSM modes.
"""

import os

import numpy as np
import requests
import re
from PIL import ImageOps

try:
    import imagehash
except ImportError:
    imagehash = None
from PIL import Image
from scipy import ndimage

try:
    import pytesseract
except ImportError:
    pytesseract = None
if pytesseract is not None and os.name == "nt":
    _tess = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if os.path.exists(_tess):
        pytesseract.pytesseract.tesseract_cmd = _tess

# ======================================================================
# Constants  (segmentation + hashing + badges)
# ======================================================================
NORM_SIZE = 128
BG = (255, 255, 255)
HASH_SIZE = 8
COLOR_WEIGHT = 1.0

MIN_AREA = 3000
ASPECT_LO, ASPECT_HI = 0.75, 1.34
MIN_FILL = 0.85
CELL_BANNER_FRAC = 0.20  # top fraction of the image = UI chrome (username/avatar/buttons), never pets
BOX_MIN_FRAC = 0.004
CLUSTER_MIN_CELLS = 4
CLUSTER_LO, CLUSTER_HI = 0.7, 1.4

BADGE_AREA_LO_FRAC = 0.0001
BADGE_AREA_HI_FRAC = 0.0008
BADGE_ASPECT_LO, BADGE_ASPECT_HI = 1.1, 1.7
BADGE_FILL_LO, BADGE_FILL_HI = 0.30, 0.55
BADGE_X_MARGIN, BADGE_Y_TOL = 20, 10

# username gate
HEADER_BG_FRAC = 0.30   # renamed from HEADER_RED_FRAC — same threshold, any color
HEADER_ROW_GAP = 3
CENTER_LO, CENTER_HI = 0.20, 0.80
WHITE_MIN = 200
USERNAME_MIN, USERNAME_MAX = 3, 20
OCR_CONFIG = ("--psm 7 -c tessedit_char_whitelist="
              "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_")

MAX_PAGES = 7

# ======================================================================
# Multi-color background detection
# ======================================================================
# The 7 selectable background colors in Adopt Me (sampled from the color picker UI).
# Tolerances are tuned per-color: tighter for colors close to white (pink, orange),
# looser for colors far from white (red, green, black).
_KNOWN_BG = {
    "red":    {"rgb": (246,  67,  67), "tol": 70},
    "pink":   {"rgb": (251, 169, 231), "tol": 50},   # close to white — tighter
    "blue":   {"rgb": (110, 169, 226), "tol": 60},
    "purple": {"rgb": (154, 102, 252), "tol": 60},
    "green":  {"rgb": ( 44, 183, 121), "tol": 65},
    "orange": {"rgb": (250, 205, 150), "tol": 55},   # close to white — tighter
    "black":  {"rgb": ( 40,  35,  30), "tol": 40},
    "gray": {"rgb": (104, 104, 104), "tol": 52},
}


def detect_bg_color(a):
    """
    Auto-detect which Adopt Me background color is in use.

    Filters out near-white (pet cells / page) and very dark (text / outlines)
    pixels, then picks the known color that the MOST remaining pixels fall within
    tolerance of. Counting in-tolerance pixels measures how much of the board each
    color actually covers — far more robust than a distance percentile, which let
    abundant dark outline/text pixels drag neutral-gray boards toward 'black'.
    Returns (name, rgb_tuple, tolerance).
    """
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    brightness = (R.astype(float) + G + B) / 3
    candidates_mask = (brightness < 230) & (brightness > 20)
    flat = a[candidates_mask].astype(float)
    if len(flat) < 500:
        flat = a.reshape(-1, 3).astype(float)

    best_name, best_count = "red", -1
    for name, info in _KNOWN_BG.items():
        kr, kg, kb = info["rgb"]
        dists = np.sqrt(
            (flat[:, 0] - kr) ** 2 +
            (flat[:, 1] - kg) ** 2 +
            (flat[:, 2] - kb) ** 2
        )
        count = int(np.count_nonzero(dists < info["tol"]))
        if count > best_count:
            best_count, best_name = count, name

    info = _KNOWN_BG[best_name]
    return best_name, info["rgb"], info["tol"]


def bg_mask(a, color=None, tol=None):
    """
    Return a boolean mask that is True wherever a pixel matches the background color.
    If color/tol are None, auto-detects from the image (costs one detect_bg_color call).
    Drop-in replacement for the old red_mask().
    """
    if color is None:
        _, color, tol = detect_bg_color(a)
    kr, kg, kb = color
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    dist = np.sqrt(((R - kr) ** 2 + (G - kg) ** 2 + (B - kb) ** 2).astype(float))
    return dist < tol


# Keep red_mask as a thin alias so any external scripts that import it still work.
def red_mask(a):
    return bg_mask(a, color=_KNOWN_BG["red"]["rgb"], tol=_KNOWN_BG["red"]["tol"])


# ======================================================================
# Low-level helpers
# ======================================================================
def _arr(im):
    return np.asarray(im.convert("RGB")).astype(int)


def normalize_icon(img):
    """RGBA -> composite on white -> square-pad -> resize 128. (== 03/04)"""
    img = img.convert("RGBA")
    bg = Image.new("RGBA", img.size, BG + (255,))
    flat = Image.alpha_composite(bg, img).convert("RGB")
    w, h = flat.size
    side = max(w, h)
    canvas = Image.new("RGB", (side, side), BG)
    canvas.paste(flat, ((side - w) // 2, (side - h) // 2))
    return canvas.resize((NORM_SIZE, NORM_SIZE), Image.LANCZOS)


def _levenshtein(a, b):
    if a == b:
        return 0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


# ======================================================================
# Segmentation  (box-aware + verified-gated, now color-agnostic)
# ======================================================================
def find_cells(a, color=None, tol=None):
    """Find pet cell regions — everything that is NOT the background color."""
    mask = bg_mask(a, color, tol)
    lbl, n = ndimage.label(~mask)
    banner_cut = a.shape[0] * CELL_BANNER_FRAC
    cand = []
    for i in range(1, n + 1):
        ys, xs = np.where(lbl == i)
        if len(xs) < MIN_AREA:
            continue
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        w, h = int(x1 - x0 + 1), int(y1 - y0 + 1)
        # Reject UI chrome in the top banner (username / avatar / buttons live
        # here — never pets). A component sitting fully inside the banner band
        # is skipped before the shape checks.
        if y1 <= banner_cut:
            continue
        comp = ndimage.binary_fill_holes(lbl[y0:y1 + 1, x0:x1 + 1] == i)
        fill = int(comp.sum()) / (w * h)
        if ASPECT_LO < w / h < ASPECT_HI and fill >= MIN_FILL:
            cand.append((int(x0), int(y0), w, h))
    return cand


def find_boxes(a, color=None, tol=None):
    """Find the colored box regions (background-colored areas large enough to be a box)."""
    mask = bg_mask(a, color, tol)
    lbl, n = ndimage.label(mask)
    H, W = a.shape[0], a.shape[1]
    out = []
    for i in range(1, n + 1):
        ys, xs = np.where(lbl == i)
        if len(xs) < BOX_MIN_FRAC * H * W:
            continue
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        out.append((int(x0), int(y0), int(x1 - x0 + 1), int(y1 - y0 + 1)))
    return out


def find_verified_badges(a):
    """Detect green VERIFIED OWNER badge centers. Scales with image area (v2 fix)."""
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    H, W = a.shape[0], a.shape[1]
    image_area = H * W

    green = ((G > 110) & (G < 210) & (G - R > 35) & (G - B > 35)
             & (R < 160) & (B < 160))
    lbl, n = ndimage.label(green)
    lo = BADGE_AREA_LO_FRAC * image_area
    hi = BADGE_AREA_HI_FRAC * image_area

    out = []
    for i in range(1, n + 1):
        ys, xs = np.where(lbl == i)
        area = len(xs)
        if not (lo < area < hi):
            continue
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        w, h = x1 - x0 + 1, y1 - y0 + 1
        if (BADGE_ASPECT_LO < w / h < BADGE_ASPECT_HI and
                BADGE_FILL_LO < area / (w * h) < BADGE_FILL_HI):
            out.append((int(x0 + w / 2), int(y0 + h / 2)))
    return out


def reading_order(cells, med_h):
    cells = sorted(cells, key=lambda b: b[1])
    rows, cur, row_y = [], [], None
    for b in cells:
        cy = b[1] + b[3] / 2
        if row_y is None or abs(cy - row_y) < med_h * 0.6:
            cur.append(b)
            row_y = cy if row_y is None else (row_y + cy) / 2
        else:
            rows.append(cur)
            cur, row_y = [b], cy
    if cur:
        rows.append(cur)
    out = []
    for row in rows:
        out.extend(sorted(row, key=lambda b: b[0]))
    return out


def segment_board(im):
    """
    Return boxes: [{box_id, bbox, verified, cell_count, cells:[bbox,...]}].
    Now auto-detects background color so any of the 7 Adopt Me colors work.
    """
    a = _arr(im)
    # Detect once, pass to all three finders so we don't re-detect 3x
    bg_name, color, tol = detect_bg_color(a)
    cells = find_cells(a, color, tol)
    boxes = find_boxes(a, color, tol)
    badges = find_verified_badges(a)

    groups = {i: [] for i in range(len(boxes))}
    for c in cells:
        cx, cy = c[0] + c[2] / 2, c[1] + c[3] / 2
        best, best_area = None, float("inf")
        for bi, (bx, by, bw, bh) in enumerate(boxes):
            if bx <= cx <= bx + bw and by <= cy <= by + bh and bw * bh < best_area:
                best, best_area = bi, bw * bh
        if best is not None:
            groups[best].append(c)

    for bi, cs in groups.items():
        if len(cs) >= CLUSTER_MIN_CELLS:
            med = float(np.median([c[2] for c in cs]))
            groups[bi] = [c for c in cs if CLUSTER_LO * med < c[2] < CLUSTER_HI * med]

    real = [bi for bi in groups if groups[bi]]

    verified = set()
    for bx_c, by_c in badges:
        cand = []
        for bi in real:
            x, y, w, h = boxes[bi]
            if (x - BADGE_X_MARGIN <= bx_c <= x + w + BADGE_X_MARGIN
                    and y > by_c - BADGE_Y_TOL):
                cand.append((y - by_c, bi))
        if cand:
            cand.sort()
            verified.add(cand[0][1])

    real.sort(key=lambda bi: (boxes[bi][1], boxes[bi][0]))
    out = []
    for box_id, bi in enumerate(real):
        cs = groups[bi]
        med_h = float(np.median([c[3] for c in cs]))
        cs = reading_order(cs, med_h)
        is_v = bi in verified
        out.append({"box_id": box_id, "bbox": list(boxes[bi]),
                    "verified": is_v, "cell_count": len(cs),
                    "cells": [list(c) for c in cs] if is_v else [],
                    "bg_color": bg_name})
    return out


# ======================================================================
# Recognition  (species match + N/M/F/R badges)
# ======================================================================
def detect_badges(crop):
    arr = np.asarray(crop.convert("RGB")).astype(int)
    h, w = arr.shape[:2]
    band = arr[int(h * 0.80):, :]
    Rc, Gc, Bc = band[:, :, 0], band[:, :, 1], band[:, :, 2]
    masks = {
        "neon":  (Gc > 120) & (Gc - Rc > 30) & (Gc - Bc > 30),
        "mega":  (Bc > 110) & (Rc > 100) & (Gc < 120) & (Bc - Gc > 50)
                 & (Rc - Gc > 40) & (Bc >= Rc - 30),
        "fly":   (Bc > 130) & (Rc < 130) & (Gc > 110) & (Bc - Rc > 40),
        "ride":  (Rc > 180) & (Bc > 90) & (Rc - Gc > 60) & (Bc - Gc > 10),
    }
    amax = 0.10 * w * w
    amin_round, amin_mega = 0.018 * w * w, 0.010 * w * w  # round floor lowered: ride chips run ~0.022*w^2, smaller than fly
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
    neon = "mega" if b["mega"] else "neon" if b["neon"] else "normal"
    return {"neon": neon, "fly": bool(b["fly"]), "ride": bool(b["ride"])}


def best_match(cell_img, library):
    if imagehash is None:
        raise RuntimeError("imagehash not installed")
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


def recognize_board(im, library):
    """Segment + match + badge a single screenshot, in memory."""
    boxes = segment_board(im)
    pets = []
    for box in boxes:
        if not box["verified"]:
            continue
        for idx, (x, y, w, h) in enumerate(box["cells"]):
            crop = im.crop((x, y, x + w, y + h))
            m = best_match(crop, library)
            b = detect_badges(crop)
            m["box_id"] = box["box_id"]
            m["cell"] = idx
            m["variant"] = variant_str(b)
            m["variant_schema"] = schema_variant(b)
            m["full_name"] = (variant_prefix(b) + " " + m["pet"]).strip()
            pets.append(m)
    meta = [{"box_id": b["box_id"], "bbox": b["bbox"], "verified": b["verified"],
             "cell_count": b["cell_count"], "bg_color": b.get("bg_color", "unknown")}
            for b in boxes]
    return {"pets": pets, "boxes": meta}


# ======================================================================
# Aggregation / dedup
# ======================================================================
_SEV = {"confident": 0, "review": 1, "weak": 2}
_SEV_INV = {v: k for k, v in _SEV.items()}


def variant_label(neon, fly, ride):
    parts = []
    if neon == "mega":
        parts.append("mega")
    elif neon == "neon":
        parts.append("neon")
    if fly:
        parts.append("fly")
    if ride:
        parts.append("ride")
    return " ".join(parts) if parts else "normal"


def _key_of(entry):
    vs = entry.get("variant_schema") or {}
    neon = vs.get("neon", "normal")
    fly = bool(vs.get("fly", False))
    ride = bool(vs.get("ride", False))
    pid = entry.get("pet_id")
    ident = pid if pid is not None else f"name:{entry.get('pet')}"
    return (ident, neon, fly, ride)


def aggregate(boards, on_conflict="ask"):
    from collections import defaultdict
    meta, per_board = {}, {}
    key_boards = defaultdict(dict)
    key_conf = defaultdict(int)
    for board_label, entries in boards:
        counts = defaultdict(int)
        for e in entries:
            k = _key_of(e)
            counts[k] += 1
            _, neon, fly, ride = k
            meta[k] = {"pet_id": e.get("pet_id"), "name": e.get("pet"),
                       "neon": neon, "fly": fly, "ride": ride}
            key_conf[k] = max(key_conf[k], _SEV.get(e.get("confidence", "review"), 1))
        per_board[board_label] = dict(counts)
        for k, c in counts.items():
            key_boards[k][board_label] = c

    duplicate_boards = []
    labels = list(per_board)
    for i in range(len(labels)):
        for j in range(i + 1, len(labels)):
            a, b = labels[i], labels[j]
            if per_board[a] and per_board[a] == per_board[b]:
                duplicate_boards.append([a, b])

    conflicts = []
    for k, bx in key_boards.items():
        if len(bx) > 1:
            conflicts.append({"pet_id": meta[k]["pet_id"], "name": meta[k]["name"],
                              "variant": variant_label(meta[k]["neon"],
                                                       meta[k]["fly"],
                                                       meta[k]["ride"]),
                              "boxes": dict(bx)})

    if (duplicate_boards or conflicts) and on_conflict == "ask":
        return {"status": "needs_consolidation",
                "duplicate_boards": duplicate_boards, "conflicts": conflicts}

    items = []
    for k, bx in key_boards.items():
        count = (max(bx.values()) if (len(bx) > 1 and on_conflict == "dedupe")
                 else sum(bx.values()))
        m = meta[k]
        items.append({"pet_id": m["pet_id"], "name": m["name"], "neon": m["neon"],
                      "fly": m["fly"], "ride": m["ride"], "count": count,
                      "confidence": _SEV_INV[key_conf[k]]})
    items.sort(key=lambda x: (str(x["name"]), x["neon"], x["fly"], x["ride"]))
    out = {"status": "ok", "items": items}
    if duplicate_boards or conflicts:
        out["warnings"] = {"duplicate_boards": duplicate_boards,
                           "deduped_conflicts": conflicts}
    return out


def boards_from_pages(pages):
    boards = {}
    for pi, page in enumerate(pages):
        for e in page["pets"]:
            label = f"page{pi}#{e.get('box_id', 0)}"
            boards.setdefault(label, []).append(e)
    return list(boards.items())


# ======================================================================
# Valuation
# ======================================================================
def _supa_get(url, key, table, select, page=1000):
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    rows, offset = [], 0
    while True:
        r = requests.get(f"{url.rstrip('/')}/rest/v1/{table}", headers=headers,
                         params={"select": select, "limit": page, "offset": offset},
                         timeout=30)
        r.raise_for_status()
        batch = r.json()
        rows.extend(batch)
        if len(batch) < page:
            return rows
        offset += page


def fetch_variant_map(url, key):
    return {(v["pet_id"], v["neon"], bool(v["fly"]), bool(v["ride"])): v["id"]
            for v in _supa_get(url, key, "pet_variants", "id,pet_id,neon,fly,ride")}


def fetch_value_map(url, key):
    return {r["pet_variant_id"]: r["value"]
            for r in _supa_get(url, key, "current_pet_values", "pet_variant_id,value")}


def value_portfolio(items, variant_map, value_map):
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
        rows.append({**it, "pet_variant_id": vid,
                     "unit_value": value, "subtotal": subtotal})
    return rows, {"total": total, "confident_total": confident_total}, missing


# ======================================================================
# Username gate
# ======================================================================
def _header_band(a):
    """Find the header row band using the background color mask."""
    _, color, tol = detect_bg_color(a)
    mask = bg_mask(a, color, tol)
    frac = mask.mean(axis=1)
    rows = np.where(frac > HEADER_BG_FRAC)[0]
    if len(rows) == 0:
        return None
    y0 = y1 = rows[0]
    for r in rows[1:]:
        if r - y1 <= HEADER_ROW_GAP:
            y1 = r
        else:
            break
    return int(y0), int(y1)

# ==========================================================================
# PASTE INTO common.py — replaces ONLY your existing read_username() function.
#
# Steps:
#   1. Make sure these imports exist at the top of common.py (add any missing):
#          import re
#          import numpy as np
#          from PIL import Image, ImageOps
#          import pytesseract            # (you already use this for OCR)
#   2. DELETE your current `def read_username(...):` function.
#   3. Paste everything below in its place.
#
# Helper names are prefixed `_username_` so they will NOT collide with your
# existing _header_band() / bg_mask() / detect_bg_color(), etc.
# ==========================================================================

_USERNAME_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_"
_USERNAME_PSM_MODES = (7, 8, 6)
_USERNAME_HEADER_FRAC = 0.18  # top slice of the board holding the banner; tune if needed


def _username_band(im):
    """Crop the top header band that holds the username banner."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    return rgb.crop((0, 0, w, max(1, int(h * _USERNAME_HEADER_FRAC))))


def _username_ocr_variants(band):
    """Two preprocessings for OCR:
    (1) isolate light banner text -> black-on-white (Tesseract's preferred input),
    (2) plain autocontrast grayscale as a fallback for dark text."""
    a = np.asarray(band).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    brightness = (r + g + b) / 3.0
    saturation = np.maximum.reduce([r, g, b]) - np.minimum.reduce([r, g, b])

    light_text = (brightness > 180) & (saturation < 45)   # white-ish text on colored banner
    v1 = np.where(light_text, 0, 255).astype(np.uint8)    # dark text on white
    v2 = np.asarray(ImageOps.autocontrast(band.convert("L")))

    out = []
    for arr in (v1, v2):
        img = Image.fromarray(arr, mode="L")
        scale = 3 if max(img.size) < 600 else 2           # small headers OCR poorly
        out.append(img.resize((img.width * scale, img.height * scale), Image.LANCZOS))
    return out


def read_username(im, debug_dir=None):
    """Return deduped candidate usernames from the header banner.

    Pools results across 2 preprocessings x 3 PSM modes. match_username() accepts
    the best within Levenshtein 1, so a wide net is safe — junk won't match.

    Pass debug_dir to dump the preprocessed images Tesseract actually sees.
    """
    if pytesseract is None:
        raise RuntimeError("pytesseract not installed")

    band = _username_band(im)
    variants = _username_ocr_variants(band)

    if debug_dir:
        import os
        os.makedirs(debug_dir, exist_ok=True)
        band.save(os.path.join(debug_dir, "header_raw.png"))
        for i, v in enumerate(variants):
            v.save(os.path.join(debug_dir, f"header_ocr_{i}.png"))

    seen = {}
    for variant in variants:
        for psm in _USERNAME_PSM_MODES:
            cfg = f"--psm {psm} -c tessedit_char_whitelist={_USERNAME_CHARS}"
            try:
                raw = pytesseract.image_to_string(variant, config=cfg)
            except Exception:
                continue
            for line in raw.splitlines():
                cand = re.sub(r"[^A-Za-z0-9_]", "", line).strip()
                if 3 <= len(cand) <= 20:                  # Roblox username length bounds
                    seen.setdefault(cand, None)
    return list(seen.keys())

def match_username(detected_list, account):
    if not detected_list:
        return {"status": "missing", "detected": None, "account": account,
                "distance": None,
                "message": "We couldn't read a username in your screenshot. "
                           "Please submit a picture that shows your Roblox username "
                           "in the header."}
    best_candidate = None
    best_dist = float("inf")
    for candidate in detected_list:
        dist = _levenshtein(candidate.lower(), account.lower())
        if dist < best_dist:
            best_dist = dist
            best_candidate = candidate
    if best_dist == 0:
        return {"status": "ok", "detected": best_candidate, "account": account,
                "distance": 0, "message": f"Username verified ({best_candidate})."}
    if best_dist == 1:
        return {"status": "ok", "detected": best_candidate, "account": account,
                "distance": 1,
                "message": f"Username verified ({best_candidate} ≈ {account})."}
    return {"status": "mismatch", "detected": best_candidate, "account": account,
            "distance": best_dist,
            "message": (f"The username in your picture (\"{best_candidate}\") doesn't "
                        f"match your account (\"{account}\"). Submit a matching picture, "
                        f"or update the Roblox username on your account.")}