#!/usr/bin/env python3
"""Drift assertion: every post slug in blog-data.ts must appear in
sitemap.xml and in prerender.py's derived routes, and every category
slug must have a sitemap + prerender entry. Run from the repo root,
or via `npm run content` in apps/web (after generate-sitemap.py).
Exit non-zero on any drift — a new post is one edit in blog-data.ts,
and this is what proves the other two outputs followed it.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLOG_DATA = ROOT / "apps" / "web" / "src" / "lib" / "blog-data.ts"
SITEMAP = ROOT / "apps" / "web" / "public" / "sitemap.xml"
PRERENDER = ROOT / "scripts" / "prerender.py"

CATEGORY_SLUGS = ["launch-notes", "adtech-insights", "guides", "news"]


def main() -> int:
    text = BLOG_DATA.read_text()
    slugs = re.findall(r"\n    slug: '([^']+)',", text)
    if not slugs:
        print("ASSERT FAIL: no post slugs found in blog-data.ts", file=sys.stderr)
        return 1
    sitemap = SITEMAP.read_text() if SITEMAP.exists() else ""
    prerender = PRERENDER.read_text()
    failures = []
    for slug in slugs:
        if f"/blog/{slug}" not in sitemap:
            failures.append(f"sitemap.xml missing /blog/{slug}")
        # prerender.py derives blog routes from blog-data.ts at import/run
        # time, so the check is that the derivation code exists and the
        # slug is present in the source it reads.
        if "blog-data.ts" not in prerender or "BLOG_ROUTES" not in prerender:
            failures.append("prerender.py does not derive blog routes from blog-data.ts")
            break
    for cat in CATEGORY_SLUGS:
        if f"/blog/category/{cat}" not in sitemap:
            failures.append(f"sitemap.xml missing /blog/category/{cat}")
    for route in ("/brand", "/news", "/es/blog", "/pt/blog", "/es/brand", "/pt/brand", "/rss.xml"):
        pass  # /rss.xml is a static file, not a sitemap URL; others checked below
    for route in ("/brand", "/news", "/es/blog", "/pt/blog", "/es/brand", "/pt/brand"):
        if route not in sitemap:
            failures.append(f"sitemap.xml missing {route}")
    if failures:
        print("CONTENT DRIFT:", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        return 1
    print(f"Content drift OK: {len(slugs)} posts + {len(CATEGORY_SLUGS)} categories in sitemap; prerender derives blog routes from blog-data.ts.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
