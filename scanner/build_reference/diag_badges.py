# diag_badges.py — why is a fly-ride pet read as fly-only?
# Run:  py diag_badges.py debug.png
#
# Crops every verified cell and prints what each badge mask found in the
# bottom-20% band that detect_badges() inspects: component area, aspect, fill,
# and whether it passed the area/aspect/fill gate. The mask definitions here
# MIRROR common.py.detect_badges — keep them in sync if you tune the real one.
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
import common as cm

src = sys.argv[1] if len(sys.argv) > 1 else "debug.png"
im = Image.open(src).convert("RGB")

boxes = cm.segment_board(im)


def band_masks(arr):
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
    return masks, w


for box in boxes:
    if not box["verified"]:
        continue
    print(f"\n=== box {box['box_id']}  ({box['cell_count']} cells) ===")
    for idx, (x, y, w, h) in enumerate(box["cells"]):
        crop = im.crop((x, y, x + w, y + h))
        arr = np.asarray(crop.convert("RGB")).astype(int)
        masks, cw = band_masks(arr)
        amax = 0.10 * cw * cw
        amin_round, amin_mega = 0.022 * cw * cw, 0.010 * cw * cw
        final = cm.detect_badges(crop)
        print(f"  cell {idx}: variant='{cm.variant_str(final)}'  "
              f"(amin_round={amin_round:.0f}  amin_mega={amin_mega:.0f}  amax={amax:.0f})")
        for k, m in masks.items():
            amin = amin_mega if k == "mega" else amin_round
            lbl, c = ndimage.label(m)
            comps = []
            for j in range(1, c + 1):
                ys, xs = np.where(lbl == j)
                area = len(xs)
                if area < 0.25 * amin:        # hide tiny noise in the printout
                    continue
                bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
                asp = bw / bh
                fill = area / (bw * bh)
                ok = (amin < area < amax) and (0.5 < asp < 2.0) and (fill > 0.45)
                comps.append((area, asp, fill, ok))
            comps.sort(key=lambda t: -t[0])
            tag = "FOUND" if final[k] else "  -  "
            line = f"      {k:5}[{tag}]: "
            if not comps:
                line += "no components above noise floor"
            else:
                for area, asp, fill, ok in comps[:3]:
                    flag = "PASS" if ok else "rej "
                    line += f"(area={area:5.0f} asp={asp:.2f} fill={fill:.2f} {flag}) "
            print(line)