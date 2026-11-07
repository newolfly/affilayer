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

# route -> texts that must appear in the prerendered HTML (proves real content, not the shell)
ROUTES = {
    "/": ["Why run traffic on", "Every commission written to an auditable ledger", "one tracked path"],
    "/about": ["About AffiLayer"],
    "/advantages": ["What AffiLayer does"],
    "/advertisers": ["Publish offers", "Your path to your first customer"],
    "/affiliates": ["Generate tracking links", "Your path to your first payout"],
    "/how-it-works": ["Create an account"],
    "/faq": ["What is AffiLayer?"],
    "/blog": ["AffiLayer is live"],
    "/blog/affilayer-is-live": ["AffiLayer is live: what the network offers on day one"],
    "/contact": ["support@affilayer.com"],
    "/terms": ["Terms of Service"],
    "/privacy": ["Privacy Policy"],
}

PORT = 4173


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
        failures = []
        for route, markers in ROUTES.items():
            url = f"http://127.0.0.1:{PORT}{route}"
            html = dump_dom(url)
            missing = [m for m in markers if m not in html]
            if '<div id="root"></div>' in html and missing:
                failures.append(f"{route}: rendered shell only, markers missing: {missing!r}")
                continue
            if missing:
                failures.append(f"{route}: markers missing: {missing!r}")
                continue
            if 'id="affilayer-jsonld"' not in html and route in ("/", "/faq", "/blog/affilayer-is-live"):
                failures.append(f"{route}: JSON-LD script missing from prerendered HTML")
                continue
            target = DIST / route.strip("/") / "index.html" if route != "/" else DIST / "index.html"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(html)
            # Flat copy too: static hosts (Cloudflare Pages included) serve
            # /about from about.html, while /about/ resolves to about/index.html.
            if route != "/":
                flat = DIST / f"{route.strip('/')}.html"
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
