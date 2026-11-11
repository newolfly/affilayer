#!/usr/bin/env python3
"""Prerender AffiLayer's public pages so crawlers get real HTML, not an empty SPA shell.

Flow: starts `vite preview` on 127.0.0.1:4173, asks headless Chromium to dump the
rendered DOM for each public route (--virtual-time-budget lets React render and
the lazy chunks load), and writes the result to dist/<route>/index.html.
The SPA still boots from the same files for visitors (createRoot re-renders).

Requires dist/ to exist first: run `npm run build` in apps/web, then this script.
Run from the repo root: python3 scripts/prerender.py

Exit code is non-zero if any route fails to render its marker text.
"""
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "apps" / "web"
DIST = WEB / "dist"

CHROME = next(
    (p for p in (
        Path.home() / ".cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
        Path.home() / ".cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell",
    ) if p.exists()),
    None,
)

# Routes that intentionally carry no JSON-LD: noindex auth pages get no
# structured data by design (seo.ts returns no jsonLd for them), so the
# JSON-LD presence check below does not apply to them.
NO_JSONLD = {"/login", "/register", "/forgot-password", "/reset-password", "/onboarding"}

# route -> texts that must appear in the prerendered HTML (proves real content, not the shell)
ROUTES = {
    "/": ["Why run traffic on", "Every commission written to an append-only ledger", "one tracked path"],
    "/about": ["About AffiLayer"],
    "/advantages": ["What AffiLayer does"],
    "/advertisers": ["Publish offers", "Your path to your first customer"],
    "/affiliates": ["Generate tracking links", "Your path to your first payout"],
    "/how-it-works": ["Create an account"],
    "/login": ["Log in", "Email", "Sign in to browse offers"],
    "/register": ["Create an account", "Affiliate registration"],
    "/forgot-password": ["Forgot password", "Enter the email you registered with"],
    "/reset-password": ["Set a new password", "This reset link is invalid or has expired."],
    "/onboarding": ["Onboarding", "Tell us about your profile"],
    "/faq": ["What is AffiLayer?"],
    "/blog": ["AffiLayer is live"],
    "/blog/category/launch-notes": ["Launch Notes", "AffiLayer blog"],
    "/blog/category/adtech-insights": ["AdTech Insights", "AffiLayer blog"],
    "/blog/category/guides": ["Guides", "AffiLayer blog"],
    "/blog/category/news": ["News", "AffiLayer blog"],
    "/news": ["Dated announcements only"],
    "/brand": ["a global CPA network you can check", "Open books, not big promises"],
    "/es/blog": ["Notas de construir una red en abierto"],
    "/pt/blog": ["Notas da construção de uma rede às claras"],
    "/es/brand": ["Libros abiertos, no grandes promesas"],
    "/pt/brand": ["Livros abertos, não grandes promessas"],
    "/contact": ["support@affilayer.com"],
    "/partner": ["Become an AffiLayer partner", "partner@affilayer.com"],
    "/white-label": ["White label AffiLayer", "Your brand on the front"],
    "/advertise": ["Advertise with AffiLayer", "Pay for conversions you have reviewed"],
    "/pricing": ["AffiLayer pricing", "free to join", "White label"],
    "/terms": ["Terms of Service"],
    "/privacy": ["Privacy Policy"],
    "/geo": ["CPA affiliate network, country by country", "United States", "Which countries can join AffiLayer?"],
    "/es/": ["Una nueva red CPA", "Convierte tráfico de", "Explorar por país"],
    "/es/affiliates": ["Para afiliados", "Tu camino hacia tu primer pago"],
    "/es/advertisers": ["Para anunciantes", "Tu camino hacia tu primer cliente"],
    "/es/how-it-works": ["Cómo funciona", "Crear una cuenta"],
    "/es/geo": ["Red de afiliados CPA, país por país", "Estados Unidos", "¿Qué países pueden unirse a AffiLayer?"],
    "/pt/": ["Uma nova rede CPA", "Transforme tráfego de", "Explorar por país"],
    "/pt/affiliates": ["Para afiliados", "Seu caminho até o primeiro pagamento"],
    "/pt/advertisers": ["Para anunciantes", "Seu caminho até o primeiro cliente"],
    "/pt/how-it-works": ["Como funciona", "Criar uma conta"],
    "/pt/geo": ["Rede de afiliados CPA, país por país", "Estados Unidos", "Quais países podem entrar na AffiLayer?"],
}

PORT = 4173


def parse_blog_posts():
    """Blog routes derived from blog-data.ts (single source of truth):
    slug -> [post title] as the marker. A new post needs no edit here.
    Only posts whose publish date has arrived are prerendered —
    future-dated posts stay unpublished until their date."""
    import datetime
    import re

    today = datetime.date.today().isoformat()
    text = (ROOT / "apps" / "web" / "src" / "lib" / "blog-data.ts").read_text()
    routes = {}
    for m in re.finditer(r"\n    slug: '([^']+)',", text):
        start = m.start()
        nxt = text.find("\n    slug: '", m.end())
        chunk = text[start:nxt if nxt != -1 else len(text)]
        date_m = re.search(r"\n    date: '([^']+)',", chunk)
        if date_m and date_m.group(1) > today:
            continue
        title = re.search(r"\n    title: '([^']+)',", chunk)
        if title:
            routes[f"/blog/{m.group(1)}"] = [title.group(1)]
    return routes


BLOG_ROUTES = parse_blog_posts()


def parse_geo():
    """Geo routes derived from geo-data.ts (single source of truth):
    code -> (name_en, name_es, name_pt, featured). Featured comes from
    the FEATURED_CODES list in the same file.
    Markers are the page H1 + first FAQ question, both templated from
    the same data the page renders — a new country needs no edit here.
    Prerender scope: ALL English country pages + es/pt pages for the
    31 featured countries. Non-featured es/pt country URLs exist as
    routes and are in the sitemap, but are SPA-rendered, not prerendered.
    """
    import re

    text = (ROOT / "apps" / "web" / "src" / "lib" / "geo-data.ts").read_text()
    feat_m = re.search(r"FEATURED_CODES: string\[\] = \[(.*?)\]", text, re.S)
    featured = set(re.findall(r"'([a-z]{2})'", feat_m.group(1))) if feat_m else set()
    countries = {}
    for m in re.finditer(r"code: '([a-z]{2})',", text):
        start = m.start()
        nxt = text.find("code: '", m.end())
        chunk = text[start:nxt if nxt != -1 else len(text)]
        names = re.search(
            r"name: \{ en: '([^']+)', es: '([^']+)', pt: '([^']+)' \}", chunk
        )
        if names:
            countries[m.group(1)] = (*names.groups(), m.group(1) in featured)
    return countries


def geo_routes():
    routes = {}
    for code, (en, es, pt, feat) in parse_geo().items():
        routes[f"/geo/{code}"] = [
            f"CPA affiliate network in {en}",
            f"Can I join AffiLayer from {en}?",
        ]
        if not feat:
            continue
        # Spanish Finance pages (es/mx/ar) show the SEO FAQ, not the
        # generic Q&A — the marker is the Finance FAQ question.
        if code in ("es", "mx", "ar"):
            routes[f"/es/geo/{code}"] = [
                f"Red de afiliados CPA en {es}",
                f"¿Cómo pagan las ofertas de Finanzas en {es}?",
            ]
        else:
            routes[f"/es/geo/{code}"] = [
                f"Red de afiliados CPA en {es}",
                f"¿Puedo unirme a AffiLayer desde {es}?",
            ]
        routes[f"/pt/geo/{code}"] = [
            f"Rede de afiliados CPA em {pt}",
            f"Posso entrar na AffiLayer a partir de {pt}?",
        ]
    return routes


GEO_ROUTES = geo_routes()


def wait_ready(url: str, timeout: int = 60) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=5) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(1)
    return False


def dump_dom(url: str) -> str:
    env = {k: v for k, v in os.environ.items() if "proxy" not in k.lower()}
    env["NO_PROXY"] = "localhost,127.0.0.1"
    out = subprocess.run(
        [str(CHROME), "--headless=new", "--no-sandbox", "--disable-gpu",
         "--no-proxy-server", "--virtual-time-budget=15000", "--dump-dom", url],
        capture_output=True, text=True, timeout=120, env=env,
    )
    if out.returncode != 0:
        raise RuntimeError(f"chromium dump-dom failed for {url}: {out.stderr[:500]}")
    return out.stdout


def main() -> int:
    if CHROME is None:
        print("No Chromium binary found in ~/.cache/ms-playwright", file=sys.stderr)
        return 1
    if not (DIST / "index.html").exists():
        print("dist/ not found — run `npm run build` in apps/web first.", file=sys.stderr)
        return 1

    env = {k: v for k, v in os.environ.items() if "proxy" not in k.lower()}
    env["NO_PROXY"] = "localhost,127.0.0.1"
    server = subprocess.Popen(
        ["npx", "vite", "preview", "--port", str(PORT), "--strictPort", "--host", "127.0.0.1"],
        cwd=WEB, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        if not wait_ready(f"http://127.0.0.1:{PORT}/"):
            print("vite preview did not become ready", file=sys.stderr)
            return 1
        ROUTES.update(BLOG_ROUTES)
        ROUTES.update(GEO_ROUTES)
        failures = []
        for route, markers in ROUTES.items():
            target = DIST / route.strip("/") / "index.html" if route != "/" else DIST / "index.html"
            flat = DIST / f"{route.strip('/')}.html" if route != "/" else None
            # Resume: skip routes already prerendered from this build.
            # A target counts as done only if it holds every marker (and
            # JSON-LD where required) — a shell or stale file re-renders.
            # Lets a run finish in the next clear window after a flare
            # kills it mid-way, instead of redoing all 316 routes.
            if target.exists():
                try:
                    done_html = target.read_text()
                except OSError:
                    done_html = ""
                if done_html and all(m in done_html for m in markers) and (
                    route in NO_JSONLD or 'id="affilayer-jsonld"' in done_html
                ):
                    if flat is not None and not flat.exists():
                        try:
                            flat.parent.mkdir(parents=True, exist_ok=True)
                            flat.write_text(done_html)
                        except OSError as e:
                            print(f"warning: could not write flat copy for {route}: {e}", file=sys.stderr)
                    print(f"skipped {route} (already prerendered)")
                    continue
            url = f"http://127.0.0.1:{PORT}{route}"
            html = dump_dom(url)
            missing = [m for m in markers if m not in html]
            if '<div id="root"></div>' in html and missing:
                failures.append(f"{route}: rendered shell only, markers missing: {missing!r}")
                continue
            if missing:
                failures.append(f"{route}: markers missing: {missing!r}")
                continue
            if 'id="affilayer-jsonld"' not in html and route not in NO_JSONLD:
                failures.append(f"{route}: JSON-LD script missing from prerendered HTML")
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(html)
            # Flat copy too: static hosts (Cloudflare Pages included) serve
            # /about from about.html, while /about/ resolves to about/index.html.
            if flat is not None:
                flat.parent.mkdir(parents=True, exist_ok=True)
                flat.write_text(html)
            print(f"prerendered {route} -> {target.relative_to(ROOT)} ({len(html)} bytes)")
        if failures:
            print("PRERENDER FAILURES:", file=sys.stderr)
            for f in failures:
                print(f"  - {f}", file=sys.stderr)
            return 1
        print(f"Prerender OK: {len(ROUTES)} routes.")
        return 0
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    sys.exit(main())
