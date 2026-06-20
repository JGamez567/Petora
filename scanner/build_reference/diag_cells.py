# diag_cells.py — why are 0 cells found? Run:  py diag_cells.py debug.png
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
import common as cm

src = sys.argv[1] if len(sys.argv) > 1 else "debug.png"
a = np.asarray(Image.open(src).convert("RGB")).astype(int)

name, color, tol = cm.detect_bg_color(a)
print(f"detected bg: {name} {color} tol={tol}")

mask = cm.bg_mask(a, color, tol)
print(f"bg mask coverage: {100 * mask.mean():.1f}%  (gray pixels)")

# save visuals so we can SEE what's masked
Image.fromarray((mask * 255).astype("uint8")).save("mask.png")
Image.fromarray(((~mask) * 255).astype("uint8")).save("notmask.png")
print("saved mask.png (background=white) and notmask.png (cells/pets=white)")

# inspect the non-bg components find_cells would consider
lbl, n = ndimage.label(~mask)
banner_cut = a.shape[0] * cm.CELL_BANNER_FRAC   # mirror find_cells' top-banner reject
rows = []
for i in range(1, n + 1):
    ys, xs = np.where(lbl == i)
    if len(xs) < cm.MIN_AREA:
        continue
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    w, h = int(x1 - x0 + 1), int(y1 - y0 + 1)
    comp = ndimage.binary_fill_holes(lbl[y0:y1 + 1, x0:x1 + 1] == i)
    fill = comp.sum() / (w * h)
    aspect = w / h
    in_banner = y1 <= banner_cut
    passes = (not in_banner) and (cm.ASPECT_LO < aspect < cm.ASPECT_HI) and (fill >= cm.MIN_FILL)
    rows.append((len(xs), w, h, aspect, fill, passes, in_banner, x0, y0))

rows.sort(key=lambda r: -r[0])
print(f"\nnon-bg components total: {n}   |  >= MIN_AREA({cm.MIN_AREA}): {len(rows)}")
print(f"cell filters: aspect {cm.ASPECT_LO}-{cm.ASPECT_HI}, "
      f"fill >= {cm.MIN_FILL}, banner reject y1 <= {banner_cut:.0f}\n")
for sz, w, h, asp, fill, ok, in_banner, x0, y0 in rows[:25]:
    flag = "CELL" if ok else "rej "
    why = "  <- banner" if in_banner else ""
    print(f"  [{flag}] size={sz:>7}  {w}x{h}  aspect={asp:.2f}  fill={fill:.2f}  at ({x0},{y0}){why}")