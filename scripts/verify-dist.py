#!/usr/bin/env python3
"""Verify written dist files: byte size, SHA-256, JSON-LD, gold markers.

Usage: verify-dist.py <path> [expected-size] [expected-sha] [marker|marker|...]
Prints one line per check. Exit 0 only if size+sha match (when given) and
JSON-LD + gold assets are present with no pre-gold leftovers.
"""
import hashlib
import sys

path = sys.argv[1]
exp_size = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] != "-" else None
exp_sha = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != "-" else None
markers = sys.argv[4].split("|") if len(sys.argv) > 4 and sys.argv[4] else []

data = open(path, "rb").read()
h = data.decode()
sha = hashlib.sha256(data).hexdigest()
ok = True

print("%s size=%d sha=%s" % (path, len(data), sha[:12]))
if exp_size is not None and len(data) != exp_size:
    print("  MISMATCH size: expected %d" % exp_size)
    ok = False
if exp_sha is not None and sha != exp_sha:
    print("  MISMATCH sha: expected %s" % exp_sha[:12])
    ok = False
checks = {
    "jsonld": 'id="affilayer-jsonld"' in h,
    "gold-js": "index-I-k8WHqV.js" in h,
    "gold-css": "index-COFJ0IWu.css" in h,
    "gold-theme": "#070D1A" in h,
}
for name, val in checks.items():
    print("  %s: %s" % (name, val))
    ok = ok and val
for m in markers:
    val = m in h
    print("  marker %r: %s" % (m, val))
    ok = ok and val
bad = [
    "orange-", "#f97316", "#eab308", "#0b1220", "BY4qFNwk",
    "D1rZ9cS0", "C511BQSa", "CybLGIvO", "__cf_email__",
    "cfemail", "email-protection", "email-decode",
]
left = [b for b in bad if b in h]
print("  leftovers: %s" % (left or "none"))
ok = ok and not left
print("  VERDICT: %s" % ("OK" if ok else "FAIL"))
sys.exit(0 if ok else 1)
