#!/usr/bin/env python3
"""Generate apps/web/public/sitemap.xml from the route list.

Single source of truth for sitemap URLs: English pages, the 8 country
(GEO) pages, and the Spanish + Portuguese versions of the localised pages.
Run: python3 scripts/generate-sitemap.py (from the repo root).
Lastmod is the current date for every URL — update when content changes.
"""
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "apps" / "web" / "public" / "sitemap.xml"
SITE = "https://affilayer.com"
LASTMOD = "2026-11-07"

# (path, changefreq, priority)
EN = [
    ("/", "weekly", "1.0"),
    ("/about", "monthly", "0.8"),
    ("/advantages", "monthly", "0.8"),
    ("/advertisers", "monthly", "0.9"),
    ("/affiliates", "monthly", "0.9"),
    ("/how-it-works", "monthly", "0.9"),
    ("/faq", "monthly", "0.8"),
    ("/blog", "weekly", "0.7"),
    ("/blog/affilayer-is-live", "monthly", "0.7"),
    ("/contact", "monthly", "0.6"),
    ("/terms", "yearly", "0.4"),
    ("/privacy", "yearly", "0.4"),
    ("/geo", "monthly", "0.8"),
]
GEO_CODES = ["us", "uk", "ca", "au", "de", "fr", "br", "in"]
LOCALISED = ["", "/affiliates", "/advertisers", "/how-it-works", "/geo"] + [f"/geo/{c}" for c in GEO_CODES]

URLS = list(EN)
URLS += [(f"/geo/{c}", "monthly", "0.7") for c in GEO_CODES]
for lang in ("es", "pt"):
    for base in LOCALISED:
        path = f"/{lang}{base}" if base else f"/{lang}"
        prio = "0.9" if base == "" else ("0.8" if base in ("/affiliates", "/advertisers", "/how-it-works") else "0.7")
        URLS.append((path, "monthly" if base else "weekly", prio))

lines = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for path, freq, prio in URLS:
    lines.append(f'  <url><loc>{SITE}{path}</loc><lastmod>{LASTMOD}</lastmod>'
                 f'<changefreq>{freq}</changefreq><priority>{prio}</priority></url>')
lines.append('</urlset>')
OUT.write_text("\n".join(lines) + "\n")
print(f"Wrote {OUT} — {len(URLS)} URLs.")
