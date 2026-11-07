#!/usr/bin/env python3
"""Fetch a live affilayer.com route, transform it to gold, print a slice.

Usage: fetch-live.py ROUTE [all|1|2] [split]
  ROUTE  e.g. /geo/fr, /es/, /pt/affiliates
  part   all = whole doc, 1 = first `split` chars, 2 = the rest
  split  char index for the 1/2 split (default 16000)

Prints the slice to stdout. Prints SIZE (bytes) and SHA-256 of the FULL
transformed document to stderr so the written file can be verified.
"""
import hashlib
import subprocess
import sys

route = sys.argv[1]
part = sys.argv[2] if len(sys.argv) > 2 else "all"
split = int(sys.argv[3]) if len(sys.argv) > 3 else 16000

raw = subprocess.run(
    ["curl", "-s", "https://affilayer.com" + route],
    capture_output=True, text=True, timeout=60,
).stdout
t = subprocess.run(
    ["python3", "scripts/transform-live.py"],
    input=raw, capture_output=True, text=True,
).stdout
print(
    "SIZE %d SHA %s" % (len(t.encode()), hashlib.sha256(t.encode()).hexdigest()),
    file=sys.stderr,
)
if part == "1":
    sys.stdout.write(t[:split])
elif part == "2":
    sys.stdout.write(t[split:])
else:
    sys.stdout.write(t)
