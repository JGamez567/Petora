"""
01_fetch_catalog.py
Pull the pet catalog (id, name, rarity, icon_url) from Supabase and save it
locally as data/catalog.json. The 'pets' table is public-read, so the anon
key is enough. ~741 rows fit in one request (PostgREST default page = 1000).
"""

import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")

DATA_DIR = Path(__file__).parent / "data"
OUT_FILE = DATA_DIR / "catalog.json"


def main() -> None:
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        sys.exit("Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env")

    DATA_DIR.mkdir(exist_ok=True)

    url = f"{SUPABASE_URL}/rest/v1/pets"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    }
    params = {"select": "id,name,rarity,icon_url", "limit": "2000"}

    resp = requests.get(url, headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    pets = resp.json()

    # Basic sanity reporting so you catch data problems before downloading.
    missing_icon = [p["id"] for p in pets if not p.get("icon_url")]
    print(f"Fetched {len(pets)} pets")
    print(f"  with icon_url:    {len(pets) - len(missing_icon)}")
    print(f"  missing icon_url: {len(missing_icon)}")
    if missing_icon:
        print(f"  (these will be skipped at download: {missing_icon[:10]}{'...' if len(missing_icon) > 10 else ''})")

    OUT_FILE.write_text(json.dumps(pets, indent=2))
    print(f"Wrote {OUT_FILE}")


if __name__ == "__main__":
    main()