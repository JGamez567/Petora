"""
09_aggregate_boards.py

Consolidate the pets 06 recognized into one portfolio, enforcing:

    Every (pet + variant) lives in exactly ONE box. Within a box you may stack
    as many real copies as you own; the same pet+variant must never appear
    across two boxes.

Pipeline:  05 (segment + gate) -> 06 (match + box_id) -> 09 (this) -> 08 (value)

Input: one or more scan_results.json files written by 06. Each is a flat list
of recognized pets; the box grouping comes from the box_id on each entry (06
gets that from 05's segments.json), so multiple boxes in ONE screenshot are
handled, and you can also pass several screenshots. A "box" is the pair
(file, box_id). Variants are keyed on (pet_id, neon, fly, ride) -- different
variants of the same species are distinct items and may sit in different boxes;
only an identical pet+variant triggers a consolidation request.

Output: data/consolidated.json
    {"status":"ok",
     "items":[{"pet_id":123,"name":"Frost Dragon","neon":"normal","fly":true,
               "ride":true,"count":3,"confidence":"review"}, ...]}
  or
    {"status":"needs_consolidation",
     "duplicate_boards":[["scanA#1","scanB#0"], ...],
     "conflicts":[{"pet_id":123,"name":"Frost Dragon","variant":"fly ride",
                   "boxes":{"scanA#0":2,"scanA#1":1}}, ...]}

The "items" list feeds 08. NOTE: 08 must value each item as value * count.

Usage:
    py 09_aggregate_boards.py data\\scan_results.json [more_scans.json ...]
    py 09_aggregate_boards.py            # built-in demo
On conflicts the default is to ASK the user to consolidate (accurate). Pass
--on-conflict dedupe to collapse cross-box dupes to a best-guess count instead.
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

# confidence severity for taking the worst across stacked copies
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


def key_of(entry):
    """Full variant tuple. pet_id is the identity; fall back to name only if 06
    couldn't assign an id (so distinct species never merge under a null id)."""
    vs = entry.get("variant_schema") or {}
    neon = vs.get("neon", "normal")
    fly = bool(vs.get("fly", False))
    ride = bool(vs.get("ride", False))
    pid = entry.get("pet_id")
    ident = pid if pid is not None else f"name:{entry.get('pet')}"
    return (ident, neon, fly, ride)


def load_boards(paths):
    """Return list of (board_label, [entry, ...]) -- one per (file, box_id)."""
    boards = {}
    for p in paths:
        label = Path(p).stem
        entries = json.loads(Path(p).read_text(encoding="utf-8"))
        for e in entries:
            board_label = f"{label}#{e.get('box_id', 0)}"
            boards.setdefault(board_label, []).append(e)
    return list(boards.items())


def aggregate(boards, on_conflict="ask"):
    meta = {}                          # key -> {name, neon, fly, ride}
    per_board = {}                     # board -> {key: count}
    key_boards = defaultdict(dict)     # key -> {board: count}
    key_conf = defaultdict(int)        # key -> worst severity seen

    for board_label, entries in boards:
        counts = defaultdict(int)
        for e in entries:
            k = key_of(e)
            counts[k] += 1
            _, neon, fly, ride = k
            meta[k] = {"pet_id": e.get("pet_id"), "name": e.get("pet"),
                       "neon": neon, "fly": fly, "ride": ride}
            key_conf[k] = max(key_conf[k], _SEV.get(e.get("confidence", "review"), 1))
        per_board[board_label] = dict(counts)
        for k, c in counts.items():
            key_boards[k][board_label] = c

    # identical boxes (e.g. same screenshot/box submitted twice)
    duplicate_boards = []
    labels = list(per_board)
    for i in range(len(labels)):
        for j in range(i + 1, len(labels)):
            a, b = labels[i], labels[j]
            if per_board[a] and per_board[a] == per_board[b]:
                duplicate_boards.append([a, b])

    # cross-box conflicts: same variant in more than one box
    conflicts = []
    for k, boxes in key_boards.items():
        if len(boxes) > 1:
            conflicts.append({
                "pet_id": meta[k]["pet_id"],
                "name": meta[k]["name"],
                "variant": variant_label(meta[k]["neon"], meta[k]["fly"], meta[k]["ride"]),
                "boxes": dict(boxes),
            })

    if (duplicate_boards or conflicts) and on_conflict == "ask":
        return {"status": "needs_consolidation",
                "duplicate_boards": duplicate_boards, "conflicts": conflicts}

    items = []
    for k, boxes in key_boards.items():
        if len(boxes) > 1 and on_conflict == "dedupe":
            count = max(boxes.values())     # lossy: never sum across boxes
        else:
            count = sum(boxes.values())
        m = meta[k]
        items.append({"pet_id": m["pet_id"], "name": m["name"],
                      "neon": m["neon"], "fly": m["fly"], "ride": m["ride"],
                      "count": count, "confidence": _SEV_INV[key_conf[k]]})

    items.sort(key=lambda x: (str(x["name"]), x["neon"], x["fly"], x["ride"]))
    out = {"status": "ok", "items": items}
    if duplicate_boards or conflicts:
        out["warnings"] = {"duplicate_boards": duplicate_boards, "deduped_conflicts": conflicts}
    return out


def user_message(res):
    if res["status"] == "ok":
        total = sum(it["count"] for it in res["items"])
        return f"Recognized {len(res['items'])} unique pets ({total} total)."
    lines = ["A couple of boxes need fixing before we can submit:"]
    for a, b in res.get("duplicate_boards", []):
        lines.append(f"  - {b} looks identical to {a} -- drop one.")
    for c in res.get("conflicts", []):
        where = ", ".join(f"{bx} ({n})" for bx, n in c["boxes"].items())
        name = c["name"] if c["variant"] == "normal" else f"{c['name']} ({c['variant']})"
        lines.append(f"  - {name} shows up in {where}. "
                     f"Please put all your {name} in a single box and re-upload that box.")
    return "\n".join(lines)


def _demo():
    boards = [
        ("scanA#0", [
            {"pet_id": 1, "pet": "Frost Dragon", "confidence": "review",
             "variant_schema": {"neon": "normal", "fly": True, "ride": True}},
            {"pet_id": 1, "pet": "Frost Dragon", "confidence": "weak",
             "variant_schema": {"neon": "normal", "fly": True, "ride": True}},
            {"pet_id": 2, "pet": "Shadow Dragon", "confidence": "confident",
             "variant_schema": {"neon": "neon", "fly": False, "ride": False}},
        ]),
        ("scanA#1", [
            # SAME species, DIFFERENT variant -> allowed, no conflict
            {"pet_id": 1, "pet": "Frost Dragon", "confidence": "confident",
             "variant_schema": {"neon": "normal", "fly": False, "ride": False}},
            # genuine cross-box conflict: Shadow Dragon (neon) also in scanA#0
            {"pet_id": 2, "pet": "Shadow Dragon", "confidence": "review",
             "variant_schema": {"neon": "neon", "fly": False, "ride": False}},
        ]),
    ]
    print("ASK mode:");  print(json.dumps(aggregate(boards, "ask"), indent=2))
    print("\n" + user_message(aggregate(boards, "ask")))
    print("\nDEDUPE mode:"); print(json.dumps(aggregate(boards, "dedupe"), indent=2))


def main(argv):
    on_conflict, paths = "ask", []
    skip = False
    for i, a in enumerate(argv):
        if skip:
            skip = False; continue
        if a == "--on-conflict":
            on_conflict = argv[i + 1]; skip = True
        else:
            paths.append(a)

    if not paths:
        _demo(); return

    res = aggregate(load_boards(paths), on_conflict=on_conflict)
    out_dir = Path("data"); out_dir.mkdir(exist_ok=True)
    (out_dir / "consolidated.json").write_text(json.dumps(res, indent=2), encoding="utf-8")
    print(user_message(res))
    print(f"\nWrote {out_dir / 'consolidated.json'}")
    if res["status"] != "ok":
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])