# time_scan.py — measure where scanner time actually goes.
# Usage:
#   py time_scan.py <scan_url> <image1> [image2 ...]
# Examples:
#   py time_scan.py https://petora-scanner.onrender.com/scan myphone.png
#   py time_scan.py http://localhost:8000/scan myphone.png
#
# To exercise the OCR gate EARLY-EXIT, set ACCOUNT to the username shown on the
# screenshot's header (what the gate should match), e.g. in PowerShell:
#   $env:ACCOUNT="PetoraTracker"; py time_scan.py https://petora-scanner.onrender.com/scan debug.png
# With no ACCOUNT, the scanner runs all 6 OCR passes (old behaviour).
#
# Needs `requests`:  py -m pip install requests
import os, sys, time, requests

url = sys.argv[1] if len(sys.argv) > 1 else "https://petora-scanner.onrender.com/scan"
paths = sys.argv[2:] or ["test.png"]
mode = "personal_gated"          # runs the OCR gate softly; returns detected + timings
account = os.environ.get("ACCOUNT", "")

files = [("files", (p, open(p, "rb"), "image/png")) for p in paths]
data = {"mode": mode, "account": account}

t0 = time.time()
r = requests.post(url, files=files, data=data, timeout=180)
wall = time.time() - t0

print(f"\nHTTP {r.status_code}   wall={wall:.2f}s   "
      f"({len(paths)} image(s), account={account!r})")
try:
    j = r.json()
    print("status :", j.get("status"))
    t = j.get("timings")
    if isinstance(t, dict):
        print("timings:")
        for k, v in t.items():
            try:
                print(f"   {k:<12} {float(v):6.2f}s")
            except (TypeError, ValueError):
                print(f"   {k:<12} {v}")
    else:
        print("timings:", t)
    print("detected:", (j.get("gate") or {}).get("detected"))
    print("items   :", len(j.get("items") or []))
except Exception as e:
    print("non-JSON response:", r.text[:500])