"""
common.py  --  the Adopt Me board scanner, as one importable library.

This consolidates the logic that the numbered scripts validated, so a service
(or a CLI wrapper) can run the whole pipeline in memory instead of shelling out
and passing data through disk files. The numbered scripts can become thin
wrappers that import from here, which also kills the duplicated red_mask() /
normalize_icon() / constants that used to drift between 04/05/06/10.

Pipeline:  read_username (gate) -> segment_board -> recognize_board
           -> aggregate (dedup) -> value_portfolio

Hashing constants (NORM_SIZE/BG/HASH_SIZE/COLOR_WEIGHT) and normalize_icon()
MUST stay identical to whatever built reference.json (03). They live here now,
so there's only one copy.
"""

import os

import numpy as np
import requests

try:
    import imagehash
except ImportError:                       # only needed for recognition
    imagehash = None
from PIL import Image
from scipy import ndimage

try:
    import pytesseract
except ImportError:                       # only needed for the username gate
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

RED_R_MIN, RED_GB_MAX, RED_GAP = 180, 150, 60
MIN_AREA = 3000
ASPECT_LO, ASPECT_HI = 0.75, 1.34
MIN_FILL = 0.85
BOX_MIN_FRAC = 0.004
CLUSTER_MIN_CELLS = 4
CLUSTER_LO, CLUSTER_HI = 0.7, 1.4

BADGE_AREA_LO_FRAC, BADGE_AREA_HI_FRAC = 0.0002, 0.0005
BADGE_ASPECT_LO, BADGE_ASPECT_HI = 1.1, 1.7
BADGE_FILL_LO, BADGE_FILL_HI = 0.30, 0.55
BADGE_X_MARGIN, BADGE_Y_TOL = 20, 10

# username gate
HEADER_RED_FRAC = 0.30
HEADER_ROW_GAP = 3
CENTER_LO, CENTER_HI = 0.20, 0.80
WHITE_MIN = 200
USERNAME_MIN, USERNAME_MAX = 3, 20
OCR_CONFIG = ("--psm 7 -c tessedit_char_whitelist="
              "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_")

MAX_PAGES = 7  # one screenshot per in-game page; profiles cap at 7 pages


# ======================================================================
# Low-level helpers
# ======================================================================
def _arr(im):
    return np.asarray(im.convert("RGB")).astype(int)


def red_mask(a):
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return ((R > RED_R_MIN) & (G < RED_GB_MAX) & (B < RED_GB_MAX)
            & (R - G > RED_GAP) & (R - B > RED_GAP))


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
# Segmentation  (== 05: box-aware + verified-gated)
# ======================================================================
def find_cells(a):
    lbl, n = ndimage.label(~red_mask(a))
    cand = []
    for i in range(1, n + 1):
        ys, xs = np.where(lbl == i)
        if len(xs) < MIN_AREA:
            continue
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        w, h = int(x1 - x0 + 1), int(y1 - y0 + 1)
        comp = ndimage.binary_fill_holes(lbl[y0:y1 + 1, x0:x1 + 1] == i)
        fill = int(comp.sum()) / (w * h)
        if ASPECT_LO < w / h < ASPECT_HI and fill >= MIN_FILL:
            cand.append((int(x0), int(y0), w, h))
    return cand


def find_boxes(a):
    lbl, n = ndimage.label(red_mask(a))
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
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    W = a.shape[1]
    green = ((G > 110) & (G < 210) & (G - R > 35) & (G - B > 35)
             & (R < 160) & (B < 160))
    lbl, n = ndimage.label(green)
    lo, hi = BADGE_AREA_LO_FRAC * W * W, BADGE_AREA_HI_FRAC * W * W
    out = []
    for i in range(1, n + 1):
        ys, xs = np.where(lbl == i)
        area = len(xs)
        if not (lo < area < hi):
            continue
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        w, h = x1 - x0 + 1, y1 - y0 + 1
        if BADGE_ASPECT_LO < w / h < BADGE_ASPECT_HI and \
           BADGE_FILL_LO < area / (w * h) < BADGE_FILL_HI:
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
    """Return boxes: [{box_id, bbox, verified, cell_count, cells:[bbox,...]}].
    Unverified boxes carry cell_count but no cell bboxes (they're skipped)."""
    a = _arr(im)
    cells, boxes, badges = find_cells(a), find_boxes(a), find_verified_badges(a)
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
            if x - BADGE_X_MARGIN <= bx_c <= x + w + BADGE_X_MARGIN and y > by_c - BADGE_Y_TOL:
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
        out.append({"box_id": box_id, "bbox": list(boxes[bi]), "verified": is_v,
                    "cell_count": len(cs),
                    "cells": [list(c) for c in cs] if is_v else []})
    return out


# ======================================================================
# Recognition  (== 06: species match + N/M/F/R badges)
# ======================================================================
def detect_badges(crop):
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
    amin_round, amin_mega = 0.022 * w * w, 0.010 * w * w
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
    """Segment + match + badge a single screenshot, in memory.
    Returns {"pets":[entry,...], "boxes":[meta,...]} where each pet carries its
    box_id (local to this image)."""
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
             "cell_count": b["cell_count"]} for b in boxes]
    return {"pets": pets, "boxes": meta}


# ======================================================================
# Aggregation / dedup  (== 09: one box per variant)
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
    """boards: list of (board_label, [entry,...]). See 09 for the contract."""
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
                              "variant": variant_label(meta[k]["neon"], meta[k]["fly"], meta[k]["ride"]),
                              "boxes": dict(bx)})

    if (duplicate_boards or conflicts) and on_conflict == "ask":
        return {"status": "needs_consolidation",
                "duplicate_boards": duplicate_boards, "conflicts": conflicts}

    items = []
    for k, bx in key_boards.items():
        count = max(bx.values()) if (len(bx) > 1 and on_conflict == "dedupe") else sum(bx.values())
        m = meta[k]
        items.append({"pet_id": m["pet_id"], "name": m["name"], "neon": m["neon"],
                      "fly": m["fly"], "ride": m["ride"], "count": count,
                      "confidence": _SEV_INV[key_conf[k]]})
    items.sort(key=lambda x: (str(x["name"]), x["neon"], x["fly"], x["ride"]))
    out = {"status": "ok", "items": items}
    if duplicate_boards or conflicts:
        out["warnings"] = {"duplicate_boards": duplicate_boards, "deduped_conflicts": conflicts}
    return out


def boards_from_pages(pages):
    """pages: list of recognize_board(...) results (one per screenshot).
    Returns aggregate()-ready boards keyed (page#box)."""
    boards = {}
    for pi, page in enumerate(pages):
        for e in page["pets"]:
            label = f"page{pi}#{e.get('box_id', 0)}"
            boards.setdefault(label, []).append(e)
    return list(boards.items())


# ======================================================================
# Valuation  (== 08: value * count, against Supabase)
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
        rows.append({**it, "pet_variant_id": vid, "unit_value": value, "subtotal": subtotal})
    return rows, {"total": total, "confident_total": confident_total}, missing


# ======================================================================
# Username gate  (== 10)
# ======================================================================
def _header_band(a):
    frac = red_mask(a).mean(axis=1)
    rows = np.where(frac > HEADER_RED_FRAC)[0]
    if len(rows) == 0:
        return None
    y0 = y1 = rows[0]
    for r in rows[1:]:
        if r - y1 <= HEADER_ROW_GAP:
            y1 = r
        else:
            break
    return int(y0), int(y1)


def read_username(im):
    if pytesseract is None:
        raise RuntimeError("pytesseract + tesseract-ocr required for the username gate")
    a = _arr(im)
    H, W = a.shape[0], a.shape[1]
    band = _header_band(a)
    if band is None:
        return None
    y0, y1 = band
    x0, x1 = int(W * CENTER_LO), int(W * CENTER_HI)
    crop = a[y0:y1 + 1, x0:x1]
    R, G, B = crop[:, :, 0], crop[:, :, 1], crop[:, :, 2]
    white = (R > WHITE_MIN) & (G > WHITE_MIN) & (B > WHITE_MIN)
    if white.mean() < 0.002:
        return None
    ocr_img = Image.fromarray(np.where(white, 0, 255).astype("uint8"))
    raw = pytesseract.image_to_string(ocr_img, config=OCR_CONFIG).strip()
    cleaned = "".join(ch for ch in raw if ch.isalnum() or ch == "_")
    return cleaned[:USERNAME_MAX] if len(cleaned) >= USERNAME_MIN else None


def match_username(detected, account):
    if not detected:
        return {"status": "missing", "detected": detected, "account": account,
                "distance": None,
                "message": "We couldn't read a username in your screenshot. Please "
                           "submit a picture that shows your Roblox username in the header."}
    dist = _levenshtein(detected.lower(), account.lower())
    if dist == 0:
        return {"status": "ok", "detected": detected, "account": account,
                "distance": 0, "message": f"Username verified ({detected})."}
    return {"status": "mismatch", "detected": detected, "account": account, "distance": dist,
            "message": (f"The username in your picture (\"{detected}\") doesn't match your "
                        f"account (\"{account}\"). Submit a matching picture, or update the "
                        f"Roblox username on your account.")}