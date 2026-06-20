# debug_scan.py  — drop this in your scanner folder and run it
# py debug_scan.py path\to\her_screenshot.png

import sys
from pathlib import Path
from PIL import Image
import common as cm

src = Path(sys.argv[1])
im = Image.open(src).convert("RGB")
a = cm._arr(im)
H, W = a.shape[0], a.shape[1]

print(f"Image size: {W}x{H}  (area: {H*W})")
print()

boxes = cm.find_boxes(a)
print(f"Boxes found: {len(boxes)}")
for i, b in enumerate(boxes):
    print(f"  box {i}: {b}")
print()

cells = cm.find_cells(a)
print(f"Cells found: {len(cells)}")
print()

badges = cm.find_verified_badges(a)
print(f"Badges found: {len(badges)}")
for b in badges:
    print(f"  badge center: {b}")
print()

image_area = H * W
lo = cm.BADGE_AREA_LO_FRAC * image_area
hi = cm.BADGE_AREA_HI_FRAC * image_area
print(f"Badge area thresholds: lo={lo:.0f}  hi={hi:.0f}")
print()

# also run full segment to see verified status
boxes_full = cm.segment_board(im)
for b in boxes_full:
    print(f"  box {b['box_id']}: verified={b['verified']}  cells={b['cell_count']}")