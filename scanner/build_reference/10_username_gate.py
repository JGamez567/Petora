"""
10_username_gate.py  --  read the Roblox username from a board screenshot and
check it against the submitter's account. Leaderboard submissions only.

    py 10_username_gate.py path\\to\\board.png --account JGamez567

Why this exists: a leaderboard submission must be tied to a real account. We
OCR the username shown in the board header and require it to match the Roblox
username on the account. Branches (your spec):
  - no username read  -> ask for a picture that includes the username
  - username != account -> ask for a matching picture, or to update the account
  - match -> proceed to the scan (05 -> 06 -> 09 -> 08)

IMPORTANT (trust): a screenshot username is forgeable exactly like the pets are
(it can be edited in). So this is consistency EVIDENCE, not proof. The real
identity anchor is Roblox OAuth; OAuth proves account control, this ties the
specific board to that account. Both feed the top-100 manual review -- neither
is a standalone, cheat-proof gate.

Needs the tesseract binary (apt-get install tesseract-ocr) + `pip install
pytesseract`. Your pipeline is perceptual-hash based, so this is the one place
that needs OCR.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

try:
    import pytesseract
except ImportError:
    pytesseract = None

if pytesseract is not None:
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    



# header detection (red bar at the top)
RED_R_MIN, RED_GB_MAX, RED_GAP = 180, 150, 60
HEADER_RED_FRAC = 0.30      # a header row is mostly red
HEADER_ROW_GAP = 3          # rows within this gap stay one band
CENTER_LO, CENTER_HI = 0.20, 0.80   # drop avatar (left) and buttons (right)
WHITE_MIN = 200             # username glyphs are near-white
USERNAME_MIN, USERNAME_MAX = 3, 20  # Roblox username length bounds
OCR_CONFIG = ("--psm 7 -c tessedit_char_whitelist="
              "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_")


def _red_mask(a):
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return ((R > RED_R_MIN) & (G < RED_GB_MAX) & (B < RED_GB_MAX)
            & (R - G > RED_GAP) & (R - B > RED_GAP))


def _header_band(a):
    """(y0, y1) of the top red header bar, or None."""
    frac = _red_mask(a).mean(axis=1)
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


def read_username(src):
    """OCR the username from a board screenshot. Returns a cleaned string or None."""
    if pytesseract is None:
        raise RuntimeError("pytesseract not installed (pip install pytesseract) "
                           "and tesseract-ocr binary required.")
    im = Image.open(src).convert("RGB") if not isinstance(src, Image.Image) else src
    a = np.asarray(im).astype(int)
    H, W, _ = a.shape
    band = _header_band(a)
    if band is None:
        return None
    y0, y1 = band
    x0, x1 = int(W * CENTER_LO), int(W * CENTER_HI)
    crop = a[y0:y1 + 1, x0:x1]
    R, G, B = crop[:, :, 0], crop[:, :, 1], crop[:, :, 2]
    white = (R > WHITE_MIN) & (G > WHITE_MIN) & (B > WHITE_MIN)
    if white.mean() < 0.002:                       # essentially no text
        return None
    ocr_img = Image.fromarray(np.where(white, 0, 255).astype("uint8"))
    raw = pytesseract.image_to_string(ocr_img, config=OCR_CONFIG).strip()
    cleaned = "".join(ch for ch in raw if ch.isalnum() or ch == "_")
    if len(cleaned) < USERNAME_MIN:
        return None
    return cleaned[:USERNAME_MAX]


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


def match_username(detected, account):
    """status in {'ok','mismatch','missing'} + a user-facing message."""
    if not detected:
        return {"status": "missing", "detected": detected, "account": account,
                "distance": None,
                "message": "We couldn't read a username in your screenshot. "
                           "Please submit a picture that shows your Roblox "
                           "username in the header."}
    dist = _levenshtein(detected.lower(), account.lower())
    if dist == 0:
        return {"status": "ok", "detected": detected, "account": account,
                "distance": 0, "message": f"Username verified ({detected})."}
    return {"status": "mismatch", "detected": detected, "account": account,
            "distance": dist,
            "message": (f"The username in your picture (\"{detected}\") doesn't "
                        f"match your account (\"{account}\"). Submit a matching "
                        f"picture, or update the Roblox username on your account.")}


def main():
    args = sys.argv[1:]
    if "--account" not in args or len(args) < 3:
        sys.exit("Usage: py 10_username_gate.py path\\to\\board.png --account <ROBLOX_USERNAME>")
    account = args[args.index("--account") + 1]
    board = args[0]
    if not Path(board).exists():
        sys.exit(f"File not found: {board}")
    detected = read_username(board)
    res = match_username(detected, account)
    print(f"detected: {detected!r}  account: {account!r}  "
          f"status: {res['status']}  (edit distance: {res['distance']})")
    print(res["message"])
    sys.exit(0 if res["status"] == "ok" else 1)


if __name__ == "__main__":
    main()