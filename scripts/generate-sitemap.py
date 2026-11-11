#!/usr/bin/env python3
"""Generate apps/web/public/sitemap.xml from the route list + blog-data.ts.

Single source of truth for posts: the POSTS array in blog-data.ts — each
post gets one <url> with its own lastmod (updated date, else publish
date). Static pages carry no lastmod (a hardcoded or stale lastmod
teaches crawlers to distrust the sitemap).
Run: python3 scripts/generate-sitemap.py (from the repo root), or as part
of `npm run content` in apps/web (it runs before the vite build, so the
fresh sitemap is copied into dist/).

Only indexable public pages are listed: noindex auth pages (/login,
/register, /forgot-password, /reset-password, /onboarding) are deliberately
excluded.
"""
import re
import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "apps" / "web" / "public" / "sitemap.xml"
BLOG_DATA = ROOT / "apps" / "web" / "src" / "lib" / "blog-data.ts"
SITE = "https://affilayer.com"

# Only posts whose publish date has arrived are public. Future-dated
# posts are a calendar, not published content — they stay out of the
# sitemap (and the RSS feed, and prerendering) until their date.
TODAY = datetime.date.today().isoformat()

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
    ("/news", "weekly", "0.6"),
    ("/brand", "monthly", "0.7"),
    ("/contact", "monthly", "0.6"),
    ("/partner", "monthly", "0.7"),
    ("/white-label", "monthly", "0.7"),
    ("/advertise", "monthly", "0.7"),
    ("/pricing", "monthly", "0.7"),
    ("/terms", "yearly", "0.4"),
    ("/privacy", "yearly", "0.4"),
    ("/geo", "monthly", "0.8"),
]
GEO_DATA = ROOT / "apps" / "web" / "src" / "lib" / "geo-data.ts"
# GEO_CODES are derived from geo-data.ts (single source of truth) — every
# country in the catalogue gets an EN URL plus es/pt alternates in
# LOCALISED below. The assert fails loudly if the catalogue ever drifts
# from 195 unique codes.
GEO_CODES = sorted(
    set(re.findall(r"\n    code: '([a-z]{2})',", GEO_DATA.read_text()))
    | set(re.findall(r"\n  \{ code: '([a-z]{2})',", GEO_DATA.read_text()))
)
assert len(GEO_CODES) == 195, f"geo-data.ts must hold 195 country codes, found {len(GEO_CODES)}"
LOCALISED = ["", "/affiliates", "/advertisers", "/how-it-works", "/geo", "/brand", "/blog"] + [f"/geo/{c}" for c in GEO_CODES]
CATEGORY_SLUGS = ["launch-notes", "adtech-insights", "guides", "news"]


def parse_posts(text: str):
    posts = []
    for m in re.finditer(r"\n    slug: '([^']+)',", text):
        start = m.start()
        nxt = text.find("\n    slug: '", m.end())
        chunk = text[start:nxt if nxt != -1 else len(text)]

        def field(name: str):
            f = re.search(rf"\n    {name}: '([^']*)',", chunk)
            return f.group(1) if f else None

        posts.append({
            "slug": field("slug"),
            "date": field("date"),
            "updated": field("updated"),
            "type": field("type"),
        })
    return posts


URLS = list(EN)
URLS += [(f"/geo/{c}", "monthly", "0.7") for c in GEO_CODES]
URLS += [(f"/blog/category/{c}", "monthly", "0.6") for c in CATEGORY_SLUGS]
posts = parse_posts(BLOG_DATA.read_text())
listed = 0
for p in posts:
    if p["date"] > TODAY:
        continue
    listed += 1
    # News ages out: changefreq never after 30 days is approximated by
    # monthly here; the post itself stays listed with its own lastmod.
    URLS.append((f"/blog/{p['slug']}", "monthly", "0.7", p["updated"] or p["date"]))
for lang in ("es", "pt"):
    for base in LOCALISED:
        # Language roots use a trailing slash to match their canonicals.
        path = f"/{lang}{base}" if base else f"/{lang}/"
        prio = "0.9" if base == "" else ("0.8" if base in ("/affiliates", "/advertisers", "/how-it-works") else "0.7")
        URLS.append((path, "monthly" if base else "weekly", prio))

lines = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for entry in URLS:
    path, freq, prio = entry[0], entry[1], entry[2]
    lastmod = entry[3] if len(entry) > 3 else None
    lm = f"<lastmod>{lastmod}</lastmod>" if lastmod else ""
    lines.append(f'  <url><loc>{SITE}{path}</loc>{lm}'
                 f'<changefreq>{freq}</changefreq><priority>{prio}</priority></url>')
lines.append('</urlset>')
OUT.write_text("\n".join(lines) + "\n")
print(f"Wrote {OUT} — {len(URLS)} URLs ({listed} posts published, {len(posts) - listed} scheduled).")
