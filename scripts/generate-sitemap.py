#!/usr/bin/env python3
"""Generate apps/web/public/sitemap.xml from the route list.

Single source of truth for sitemap URLs: English pages, the 11 country
(GEO) pages, and the Spanish + Portuguese versions of the localised pages.
Run: python3 scripts/generate-sitemap.py (from the repo root), or as part
of `npm run build:live` in apps/web (it runs before the vite build, so the
fresh sitemap is copied into dist/).

Only indexable public pages are listed: noindex auth pages (/login,
/register, /forgot-password, /reset-password, /onboarding) are deliberately
excluded. No <lastmod> is emitted — a hardcoded or stale lastmod teaches
crawlers to distrust the sitemap.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "apps" / "web" / "public" / "sitemap.xml"
SITE = "https://affilayer.com"

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
    ("/partner", "monthly", "0.7"),
    ("/white-label", "monthly", "0.7"),
    ("/advertise", "monthly", "0.7"),
    ("/terms", "yearly", "0.4"),
    ("/privacy", "yearly", "0.4"),
    ("/geo", "monthly", "0.8"),
]
GEO_CODES = ["us", "uk", "ca", "au", "de", "fr", "br", "in", "es", "mx", "ar"]
LOCALISED = ["", "/affiliates", "/advertisers", "/how-it-works", "/geo"] + [f"/geo/{c}" for c in GEO_CODES]

URLS = list(EN)
URLS += [(f"/geo/{c}", "monthly", "0.7") for c in GEO_CODES]
for lang in ("es", "pt"):
    for base in LOCALISED:
        # Language roots use a trailing slash to match their canonicals.
        path = f"/{lang}{base}" if base else f"/{lang}/"
        prio = "0.9" if base == "" else ("0.8" if base in ("/affiliates", "/advertisers", "/how-it-works") else "0.7")
        URLS.append((path, "monthly" if base else "weekly", prio))

lines = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for path, freq, prio in URLS:
    lines.append(f'  <url><loc>{SITE}{path}</loc>'
                 f'<changefreq>{freq}</changefreq><priority>{prio}</priority></url>')
lines.append('</urlset>')
OUT.write_text("\n".join(lines) + "\n")
print(f"Wrote {OUT} — {len(URLS)} URLs.")
