"""
02_download_icons.py
Download every pet's icon_url into data/icons_raw/<id>.<ext>.

Design choices that matter:
- Idempotent: skips a file that already exists, so you can re-run after a
  partial failure without re-downloading everything.
- Polite + resilient: timeout, a couple of retries, a tiny delay between hits.
- Failures are logged to data/download_failures.json instead of crashing the
  whole run, so one dead URL doesn't cost you the other 740.
"""

import json
import time
from pathlib import Path

import requests

DATA_DIR = Path(__file__).parent / "data"
CATALOG = DATA_DIR / "catalog.json"
RAW_DIR = DATA_DIR / "icons_raw"
FAIL_LOG = DATA_DIR / "download_failures.json"

TIMEOUT = 20
RETRIES = 3
DELAY = 0.1  # seconds between downloads; be a good citizen


def ext_from(url: str, content_type: str) -> str:
    if "png" in content_type or url.lower().endswith(".png"):
        return "png"
    if "webp" in content_type or url.lower().endswith(".webp"):
        return "webp"
    if "jpeg" in content_type or "jpg" in content_type or url.lower().endswith((".jpg", ".jpeg")):
        return "jpg"
    return "png"  # sensible default; Pillow will open it regardless of extension


def download_one(session: requests.Session, url: str) -> requests.Response | None:
    for attempt in range(1, RETRIES + 1):
        try:
            r = session.get(url, timeout=TIMEOUT)
            r.raise_for_status()
            return r
        except requests.RequestException:
            if attempt == RETRIES:
                return None
            time.sleep(0.5 * attempt)
    return None


def main() -> None:
    pets = json.loads(CATALOG.read_text())
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update({"User-Agent": "adopt-me-scanner/1.0"})

    downloaded = skipped = failed = 0
    failures = []

    for i, pet in enumerate(pets, 1):
        pid, url = pet["id"], pet.get("icon_url")
        if not url:
            continue

        # Skip if we already have any file for this id.
        existing = list(RAW_DIR.glob(f"{pid}.*"))
        if existing:
            skipped += 1
            continue

        r = download_one(session, url)
        if r is None:
            failed += 1
            failures.append({"id": pid, "name": pet.get("name"), "url": url})
            print(f"[{i}/{len(pets)}] FAILED {pid} {pet.get('name')}")
            continue

        ext = ext_from(url, r.headers.get("Content-Type", ""))
        (RAW_DIR / f"{pid}.{ext}").write_bytes(r.content)
        downloaded += 1
        if downloaded % 50 == 0:
            print(f"[{i}/{len(pets)}] downloaded {downloaded}...")
        time.sleep(DELAY)

    FAIL_LOG.write_text(json.dumps(failures, indent=2))
    print(f"\nDone. downloaded={downloaded} skipped={skipped} failed={failed}")
    if failures:
        print(f"Failures logged to {FAIL_LOG} — re-run to retry them.")


if __name__ == "__main__":
    main()