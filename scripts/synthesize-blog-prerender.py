#!/usr/bin/env python3
"""Fallback prerenderer for /blog/:slug pages when headless Chromium is
unavailable (VM SIGTRAP / EPERM flare).

It does NOT invent content: it takes the already-prerendered
dist/blog/index.html (real Chrome output: header, footer, scripts, art)
and, per post, replaces only (a) the <head> tags + JSON-LD and (b) the
<main> content — both built from blog-data.ts and the BlogPost component
in apps/web/src/pages/blog.tsx (same classes, same text, same links).
The PageArt SVG is copied verbatim from the blog index with only the
4th node label swapped to the post's category. React re-renders the page
on boot for real visitors, so this snapshot only serves crawlers.

If Chromium recovers, run scripts/prerender.py instead — it overwrites
these files with true dumps. Run from the repo root.
Verifies each file afterwards: marker (post title) + JSON-LD present.
"""
import html
import json
import re
import sys
import urllib.parse
from pathlib import Path

import os

ROOT = Path(__file__).resolve().parent.parent
# Output dir override: during the VM EPERM flare, dist/ writes fail — write
# to /tmp and copy in when the flare clears. Default is dist/.
DIST = ROOT / "apps" / "web" / "dist"
OUT = Path(os.environ.get("SYNTH_OUT", str(DIST)))
BLOG_DATA = ROOT / "apps" / "web" / "src" / "lib" / "blog-data.ts"
SITE = "https://affilayer.com"
OG_IMAGE = f"{SITE}/og-image.png"

# ---------- TS parsing (single-quoted literals, \' escapes) ----------

def parse_ts_string(s: str, i: int):
    """Parse a '...' TS string starting at s[i] == \"'\". Returns (value, end)."""
    assert s[i] == "'"
    out = []
    i += 1
    while i < len(s):
        c = s[i]
        if c == "\\" and i + 1 < len(s):
            nxt = s[i + 1]
            out.append(nxt if nxt in ("'", "\\") else "\\" + nxt)
            i += 2
        elif c == "'":
            return "".join(out), i + 1
        else:
            out.append(c)
            i += 1
    raise ValueError("unterminated string")


def parse_posts(text: str):
    posts = []
    for m in re.finditer(r"\n    slug: '([^']+)',", text):
        start = m.start()
        nxt = text.find("\n    slug: '", m.end())
        chunk = text[start:nxt if nxt != -1 else len(text)]

        def field(name: str):
            f = re.search(rf"\n    {name}:\s*(?:\n\s*)?'", chunk)
            if not f:
                return None
            v, _ = parse_ts_string(chunk, f.end() - 1)
            return v

        def field_list(name: str):
            f = re.search(rf"\n    {name}: \[([^\]]*)\]", chunk)
            return re.findall(r"'([^']+)'", f.group(1)) if f else []

        # body blocks: find the "body: [" array, brace-match each block
        bstart = chunk.find("\n    body: [")
        body_text = chunk[bstart:chunk.rfind("\n    ],")]
        blocks = []
        i = 0
        while True:
            j = body_text.find("{ kind: '", i)
            if j == -1:
                break
            depth = 0
            k = j
            while k < len(body_text):
                if body_text[k] == "{":
                    depth += 1
                elif body_text[k] == "}":
                    depth -= 1
                    if depth == 0:
                        break
                k += 1
            block_src = body_text[j:k + 1]
            kind = re.search(r"kind: '(\w+)'", block_src).group(1)
            def bfield(name: str):
                f = re.search(rf"{name}: '", block_src)
                if not f:
                    return None
                v, _ = parse_ts_string(block_src, f.end() - 1)
                return v
            if kind == "list":
                items = []
                lm = re.search(r"items: \[", block_src)
                if lm:
                    p = lm.end()
                    while True:
                        q = block_src.find("'", p)
                        if q == -1 or block_src[q - 1] == "]":
                            break
                        # skip the closing bracket line
                        if block_src[p:q].strip().startswith("]"):
                            break
                        v, end = parse_ts_string(block_src, q)
                        items.append(v)
                        p = end
                        # stop at the closing ] of the items array
                        rest = block_src[p:]
                        if rest.lstrip().startswith("]"):
                            break
                blocks.append({"kind": "list", "items": items})
            elif kind == "product":
                blocks.append({"kind": "product",
                               "title": bfield("title"), "text": bfield("text"),
                               "href": bfield("href"), "cta": bfield("cta")})
            elif kind == "callout":
                blocks.append({"kind": "callout",
                               "title": bfield("title"), "text": bfield("text")})
            else:
                blocks.append({"kind": kind, "text": bfield("text")})
            i = k + 1
        posts.append({
            "slug": field("slug"), "title": field("title"),
            "description": field("description"), "excerpt": field("excerpt"),
            "date": field("date"), "updated": field("updated"),
            "category": field("category"), "tags": field_list("tags"),
            "type": field("type"), "body": blocks,
        })
    return posts


def format_date(iso: str) -> str:
    y, mo, d = (int(x) for x in iso.split("-"))
    import datetime
    return datetime.date(y, mo, d).strftime("%-d %B %Y")


def reading_time(post) -> int:
    words = []
    for b in post["body"]:
        if b["kind"] == "list":
            words += b["items"]
        elif b["kind"] == "product":
            words += [b["title"], b["text"]]
        else:
            words.append(b.get("text", ""))
    n = len(" ".join(words).split())
    return max(1, round(n / 200))


def related(post, posts, count=3):
    others = [p for p in posts if p["slug"] != post["slug"]]
    def score(p):
        return (2 if p["category"] == post["category"] else 0) + len(
            set(p["tags"]) & set(post["tags"]))
    others.sort(key=lambda p: (-score(p), p["date"]), reverse=False)
    # date desc as tiebreak: sort stable by date desc first, then score
    others.sort(key=lambda p: p["date"], reverse=True)
    others.sort(key=lambda p: score(p), reverse=True)
    return others[:count]


# ---------- HTML building ----------

def esc(t: str) -> str:
    return html.escape(t, quote=False)


def esc_attr(t: str) -> str:
    return html.escape(t, quote=True)


def render_inline(text: str) -> str:
    parts = re.split(r"(\[[^\]]+\]\([^)]+\))", text)
    out = []
    for part in parts:
        m = re.match(r"^\[([^\]]+)\]\(([^)]+)\)$", part)
        if m:
            ext = m.group(2).startswith("http")
            extra = ' target="_blank" rel="noreferrer"' if ext else ""
            out.append(f'<a href="{esc_attr(m.group(2))}" class="font-semibold text-amber-700 underline hover:text-amber-800"{extra}>{esc(m.group(1))}</a>')
        else:
            out.append(esc(part))
    return "".join(out)


def render_block(b) -> str:
    k = b["kind"]
    if k == "h2":
        return f'<h2 class="pt-2 text-xl font-bold text-slate-900">{esc(b["text"])}</h2>'
    if k == "h3":
        return f'<h3 class="pt-1 text-lg font-bold text-slate-900">{esc(b["text"])}</h3>'
    if k == "list":
        items = "".join(f"<li>{render_inline(it)}</li>" for it in b["items"])
        return f'<ul class="list-disc space-y-2 pl-5">{items}</ul>'
    if k == "callout":
        t = f'<p class="font-bold text-amber-800">{esc(b["title"])}</p>' if b.get("title") else ""
        return (f'<aside class="rounded-xl border border-amber-300 bg-amber-50 p-4">{t}'
                f'<p class="mt-1 text-sm">{render_inline(b["text"])}</p></aside>')
    if k == "product":
        return (f'<aside class="rounded-xl border border-slate-300 bg-[#111C30] p-5 text-white">'
                f'<p class="font-bold text-amber-400">{esc(b["title"])}</p>'
                f'<p class="mt-1 text-sm text-slate-300">{render_inline(b["text"])}</p>'
                f'<a href="{esc_attr(b["href"])}" class="mt-3 inline-block font-semibold text-amber-400 hover:text-amber-300">{esc(b["cta"])} →</a></aside>')
    return f"<p>{render_inline(b['text'])}</p>"


def extract_art(template: str) -> str:
    """The PageArt block from the blog index: from the reveal wrapper that
    contains role=\"img\" to its closing </div>, depth-counted."""
    idx = template.find('role="img"')
    start = template.rfind('<div class="reveal is-visible ">', 0, idx)
    depth = 0
    i = start
    while i < len(template):
        if template.startswith("<div", i):
            depth += 1
            i = template.find(">", i) + 1
        elif template.startswith("</div>", i):
            depth -= 1
            i += len("</div>")
            if depth == 0:
                return template[start:i]
        else:
            i += 1
    raise ValueError("art block not found")


def build_main(post, posts, art: str) -> str:
    sorted_posts = sorted(posts, key=lambda p: p["date"], reverse=True)
    idx = [p["slug"] for p in sorted_posts].index(post["slug"])
    prev = sorted_posts[idx - 1] if idx > 0 else None
    nxt = sorted_posts[idx + 1] if idx < len(sorted_posts) - 1 else None
    rel = related(post, posts)
    cat_slug = re.sub(r"[^a-z0-9]+", "-", post["category"].lower()).strip("-")
    url = f"{SITE}/blog/{post['slug']}"
    meta = (f"{format_date(post['date'])} · AffiLayer team · {reading_time(post)} min read"
            + (f" · Updated {format_date(post['updated'])}" if post.get("updated") else ""))
    art_post = art.replace("In our own words", esc(post["category"]))
    art_post = art_post.replace(
        "Illustration: the AffiLayer hub connecting launch notes, AdTech insights and news",
        f"Illustration: the AffiLayer hub for the post “{esc_attr(post['title'])}”")
    art_post = art_post.replace("notes from building in the open", esc(post["category"]))
    body = "".join(render_block(b) for b in post["body"])
    tags = "".join(
        f'<span class="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300">{esc(t)}</span>'
        for t in post["tags"])
    enc_title = urllib.parse.quote(post["title"], safe="~")
    enc_url = urllib.parse.quote(url, safe="/:")
    prev_html = (f'<a href="/blog/{prev["slug"]}" class="pill-btn-outline">← {esc(prev["title"])}</a>'
                 if prev else "<span></span>")
    next_html = (f'<a href="/blog/{nxt["slug"]}" class="pill-btn-outline">{esc(nxt["title"])} →</a>'
                 if nxt else "")
    related_html = ""
    if rel:
        cards = "".join(
            f'<article class="rounded-xl bg-white p-5 text-slate-900">'
            f'<p class="text-xs font-semibold uppercase tracking-widest text-amber-700">{esc(p["category"])}</p>'
            f'<h3 class="mt-2 font-bold"><a href="/blog/{p["slug"]}" class="hover:text-amber-700">{esc(p["title"])}</a></h3>'
            f'<p class="mt-2 text-xs text-slate-500">{format_date(p["date"])} · AffiLayer team</p></article>'
            for p in rel)
        related_html = (f'<section class="mt-10"><h2 class="text-xl font-bold text-white">Related posts</h2>'
                        f'<div class="mt-4 grid gap-4 md:grid-cols-3">{cards}</div></section>')
    return (
        f'<main id="main-content" class="mx-auto max-w-6xl px-4 py-10"><div class="page-in">'
        f'<div class="page-switch-bar" aria-hidden="true"></div>'
        f'<nav class="text-sm text-slate-400"><a href="/" class="hover:text-white">Home</a> / '
        f'<a href="/blog" class="hover:text-white">Blog</a> / '
        f'<a href="/blog/category/{cat_slug}" class="hover:text-white">{esc(post["category"])}</a> / '
        f'<span class="text-slate-300">{esc(post["title"])}</span></nav>'
        f'<p class="mt-6 text-xs font-semibold uppercase tracking-widest text-amber-400">{esc(post["category"])}</p>'
        f'<h1 class="mt-2 max-w-3xl text-3xl font-bold text-white md:text-4xl">{esc(post["title"])}</h1>'
        f'<p class="mt-3 text-sm text-slate-400">{meta}</p>'
        f'<p class="slogan grad-text mt-4">Day one, in our own words.</p>'
        f'{art_post}'
        f'<div class="mt-6 space-y-4 rounded-xl bg-white p-6 text-slate-700">{body}</div>'
        f'<div class="mt-6 flex flex-wrap gap-2">{tags}</div>'
        f'<aside class="mt-6 rounded-xl border border-slate-800 bg-[#111C30]/60 p-6">'
        f'<p class="font-semibold text-white">AffiLayer team — The AffiLayer team</p>'
        f'<p class="mt-1 text-sm text-slate-400">The team building AffiLayer — a small CPA network that keeps its promises small and its records open.</p></aside>'
        f'<div class="mt-6 flex flex-wrap gap-3 text-sm"><span class="font-semibold text-slate-300">Share:</span>'
        f'<a href="https://twitter.com/intent/tweet?text={enc_title}&amp;url={enc_url}" target="_blank" rel="noreferrer" class="font-semibold text-amber-400 hover:text-amber-300">X</a>'
        f'<a href="https://www.linkedin.com/sharing/share-offsite/?url={enc_url}" target="_blank" rel="noreferrer" class="font-semibold text-amber-400 hover:text-amber-300">LinkedIn</a>'
        f'<a href="https://www.facebook.com/sharer/sharer.php?u={enc_url}" target="_blank" rel="noreferrer" class="font-semibold text-amber-400 hover:text-amber-300">Facebook</a></div>'
        f'<div class="mt-6 flex flex-wrap justify-between gap-3">{prev_html}{next_html}</div>'
        f'{related_html}'
        f'<div class="mt-6 flex flex-wrap gap-3"><a href="/blog" class="pill-btn-outline">← All posts</a>'
        f'<a href="/register" class="pill-btn">Create an account</a></div>'
        f'</div></main>')


def set_meta(head: str, attr: str, key: str, value: str) -> str:
    pat = re.compile(rf'(<meta (?:name|property)="{re.escape(key)}" content=")[^"]*(">)')
    return pat.sub(rf"\g<1>{esc_attr(value)}\g<2>", head, count=1)


def build_head(template: str, post) -> str:
    head = template[template.find("<head>"):template.find("</head>")]
    url = f"{SITE}/blog/{post['slug']}"
    title = f"{post['title']} | AffiLayer Blog"
    head = re.sub(r"<title>.*?</title>", f"<title>{esc(title)}</title>", head, count=1)
    head = set_meta(head, "name", "description", post["description"])
    head = set_meta(head, "property", "og:type", "article")
    head = set_meta(head, "property", "og:title", title)
    head = set_meta(head, "property", "og:description", post["description"])
    head = set_meta(head, "property", "og:url", url)
    head = set_meta(head, "name", "twitter:title", title)
    head = set_meta(head, "name", "twitter:description", post["description"])
    head = re.sub(r'(<link rel="canonical" href=")[^"]*(">)', rf"\g<1>{url}\g<2>", head, count=1)
    # posts have no hreflang (English-only) — strip the blog index's links
    head = re.sub(r'<link rel="alternate"[^>]*data-hreflang="1">', "", head)
    ld = [
        {"@context": "https://schema.org", "@type": "BlogPosting",
         "headline": post["title"], "description": post["description"],
         "datePublished": post["date"], "dateModified": post.get("updated") or post["date"],
         "image": OG_IMAGE, "articleSection": post["category"], "inLanguage": "en",
         "author": {"@type": "Organization", "name": "AffiLayer", "url": f"{SITE}/"},
         "publisher": {"@type": "Organization", "name": "AffiLayer", "url": f"{SITE}/"},
         "mainEntityOfPage": url},
        {"@context": "https://schema.org", "@type": "BreadcrumbList",
         "itemListElement": [
             {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE}/"},
             {"@type": "ListItem", "position": 2, "name": "Blog", "item": f"{SITE}/blog"},
             {"@type": "ListItem", "position": 3, "name": post["title"], "item": url}]},
    ]
    ld_json = json.dumps(ld, ensure_ascii=False, separators=(",", ":"))
    head = re.sub(r'(<script id="affilayer-jsonld" type="application/ld\+json">).*?(</script>)',
                  lambda m: m.group(1) + ld_json + m.group(2), head, count=1, flags=re.S)
    return head


def main() -> int:
    template_path = DIST / "blog" / "index.html"
    if not template_path.exists():
        print("template dist/blog/index.html missing — run prerender first", file=sys.stderr)
        return 1
    template = template_path.read_text(encoding="utf-8")
    art = extract_art(template)
    posts = parse_posts(BLOG_DATA.read_text(encoding="utf-8"))
    failures = []
    for post in posts:
        head = build_head(template, post)
        page = template[:template.find("<head>")] + head + template[template.find("</head>"):]
        main_old = re.search(r"<main id=\"main-content\".*?</main>", page, flags=re.S)
        if not main_old:
            failures.append(f"{post['slug']}: no <main> in template")
            continue
        page = page[:main_old.start()] + build_main(post, posts, art) + page[main_old.end():]
        for target in (OUT / "blog" / post["slug"] / "index.html",
                       OUT / "blog" / f"{post['slug']}.html"):
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(page, encoding="utf-8")
        # Verify by RE-READING the file: during the VM EPERM flare a write
        # can report success yet land 0 bytes, so in-memory checks lie.
        ok = True
        for target in (OUT / "blog" / post["slug"] / "index.html",
                       OUT / "blog" / f"{post['slug']}.html"):
            try:
                back = target.read_text(encoding="utf-8")
                if len(back) != len(page) or post["title"] not in back or "BlogPosting" not in back:
                    ok = False
            except OSError:
                ok = False
        print(f"synthesized /blog/{post['slug']} ({len(page)} bytes) {'OK' if ok else 'FAIL'}")
        if not ok:
            failures.append(post["slug"])
    if failures:
        print("FAILURES:", failures, file=sys.stderr)
        return 1
    print(f"Synthesized {len(posts)} blog post pages.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
