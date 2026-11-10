#!/usr/bin/env python3
"""Generate apps/web/public/rss.xml from the post list in blog-data.ts.

Single source of truth: the POSTS array. Reads slug/title/description/
date/updated/category/type with regex (no TS parser needed — the fields
are one-line literals in blog-data.ts). Run from the repo root, or via
`npm run content` in apps/web. A static file in public/ wins over the
SPA fallback, so /rss.xml serves real XML.
"""
import re
import datetime
import html
from email.utils import formatdate
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLOG_DATA = ROOT / "apps" / "web" / "src" / "lib" / "blog-data.ts"
OUT = ROOT / "apps" / "web" / "public" / "rss.xml"
SITE = "https://affilayer.com"


def parse_posts(text: str):
    posts = []
    # Each post object starts with "slug: '...'," at 4-space indent.
    for m in re.finditer(r"\n    slug: '([^']+)',", text):
        start = m.start()
        # The post object ends at the next "\n  },\n  {" or "\n  },\n]" — take
        # the chunk up to the next top-level slug or the end of the array.
        nxt = text.find("\n    slug: '", m.end())
        chunk = text[start:nxt if nxt != -1 else len(text)]
        def field(name: str):
            # Values are inline (title: '...') or on the next line
            # (description:\n  '...') — accept both.
            f = re.search(rf"\n    {name}:\s*(?:\n\s*)?'([^']*)',", chunk)
            return f.group(1) if f else None
        tags_m = re.search(r"\n    tags: \[([^\]]*)\]", chunk)
        tags = re.findall(r"'([^']+)'", tags_m.group(1)) if tags_m else []
        posts.append({
            "slug": field("slug"),
            "title": field("title"),
            "description": field("description"),
            "date": field("date"),
            "updated": field("updated"),
            "category": field("category"),
            "type": field("type"),
            "tags": tags,
        })
    return posts


def rfc822(iso_date: str) -> str:
    y, mo, d = (int(x) for x in iso_date.split("-"))
    import datetime
    dt = datetime.datetime(y, mo, d, tzinfo=datetime.timezone.utc)
    return formatdate(dt.timestamp(), usegmt=True)


def main() -> int:
    posts = parse_posts(BLOG_DATA.read_text())
    # Only posts whose publish date has arrived — future-dated posts are
    # a calendar, not published content.
    today = datetime.date.today().isoformat()
    posts = [p for p in posts if p["date"] <= today]
    posts.sort(key=lambda p: p["date"], reverse=True)
    items = []
    for p in posts[:20]:
        link = f"{SITE}/blog/{p['slug']}"
        cats = "".join(f"<category>{html.escape(c)}</category>" for c in [p["category"], *p["tags"]])
        items.append(
            f"    <item>\n"
            f"      <title>{html.escape(p['title'])}</title>\n"
            f"      <link>{link}</link>\n"
            f"      <guid isPermaLink=\"true\">{link}</guid>\n"
            f"      <pubDate>{rfc822(p['date'])}</pubDate>\n"
            f"      <description>{html.escape(p['description'])}</description>\n"
            f"      {cats}\n"
            f"    </item>"
        )
    rss = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0">\n'
        "  <channel>\n"
        "    <title>AffiLayer Blog</title>\n"
        f"    <link>{SITE}/blog</link>\n"
        "    <description>Launch notes and plain notes on affiliate marketing — what we built, what changed, and what we learned running the network.</description>\n"
        "    <language>en</language>\n"
        + "\n".join(items)
        + "\n  </channel>\n</rss>\n"
    )
    OUT.write_text(rss)
    print(f"Wrote {OUT} — {len(items)} items.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
