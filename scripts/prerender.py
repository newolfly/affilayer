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
    "/": ["Why run traffic on", "Every commission written to an auditable ledger", "one tracked path"],
    "/about": ["About AffiLayer"],
    "/advantages": ["What AffiLayer does"],
    "/advertisers": ["Publish offers", "Your path to your first customer"],
    "/affiliates": ["Generate tracking links", "Your path to your first payout"],
    "/how-it-works": ["Create an account"],
    "/login": ["Log in", "Email or demo username", "Sign in to browse offers"],
    "/register": ["Create an account", "Affiliate registration"],
    "/forgot-password": ["Forgot password", "Enter the email you registered with"],
    "/reset-password": ["Set a new password", "This reset link is invalid or has expired."],
    "/onboarding": ["Onboarding", "Tell us about your profile"],
    "/faq": ["What is AffiLayer?"],
    "/blog": ["AffiLayer is live"],
    "/blog/affilayer-is-live": ["AffiLayer is live: what the network offers on day one"],
    "/contact": ["support@affilayer.com"],
    "/partner": ["Become an AffiLayer partner", "partner@affilayer.com"],
    "/white-label": ["White label AffiLayer", "Your brand on the front"],
    "/advertise": ["Advertise with AffiLayer", "Pay for conversions you have reviewed"],
    "/terms": ["Terms of Service"],
    "/privacy": ["Privacy Policy"],
    "/geo": ["CPA affiliate network, country by country", "United States", "Which countries can join AffiLayer?"],
    "/geo/us": ["CPA affiliate network in United States", "Can I join AffiLayer from United States?"],
    "/geo/uk": ["CPA affiliate network in United Kingdom", "Can I join AffiLayer from United Kingdom?"],
    "/geo/ca": ["CPA affiliate network in Canada", "Can I join AffiLayer from Canada?"],
    "/geo/au": ["CPA affiliate network in Australia", "Can I join AffiLayer from Australia?"],
    "/geo/de": ["CPA affiliate network in Germany", "Can I join AffiLayer from Germany?"],
    "/geo/fr": ["CPA affiliate network in France", "Can I join AffiLayer from France?"],
    "/geo/br": ["CPA affiliate network in Brazil", "Can I join AffiLayer from Brazil?"],
    "/geo/in": ["CPA affiliate network in India", "Can I join AffiLayer from India?"],
    "/geo/es": ["CPA affiliate network in Spain", "Can I join AffiLayer from Spain?"],
    "/geo/mx": ["CPA affiliate network in Mexico", "Can I join AffiLayer from Mexico?"],
    "/geo/ar": ["CPA affiliate network in Argentina", "Can I join AffiLayer from Argentina?"],
    "/es/": ["Una nueva red CPA", "Convierte tráfico de", "Explorar por país"],
    "/es/affiliates": ["Para afiliados", "Tu camino hacia tu primer pago"],
    "/es/advertisers": ["Para anunciantes", "Tu camino hacia tu primer cliente"],
    "/es/how-it-works": ["Cómo funciona", "Crear una cuenta"],
    "/es/geo": ["Red de afiliados CPA, país por país", "Estados Unidos", "¿Qué países pueden unirse a AffiLayer?"],
    "/es/geo/us": ["Red de afiliados CPA en Estados Unidos", "¿Puedo unirme a AffiLayer desde Estados Unidos?"],
    "/es/geo/uk": ["Red de afiliados CPA en Reino Unido", "¿Puedo unirme a AffiLayer desde Reino Unido?"],
    "/es/geo/ca": ["Red de afiliados CPA en Canadá", "¿Puedo unirme a AffiLayer desde Canadá?"],
    "/es/geo/au": ["Red de afiliados CPA en Australia", "¿Puedo unirme a AffiLayer desde Australia?"],
    "/es/geo/de": ["Red de afiliados CPA en Alemania", "¿Puedo unirme a AffiLayer desde Alemania?"],
    "/es/geo/fr": ["Red de afiliados CPA en Francia", "¿Puedo unirme a AffiLayer desde Francia?"],
    "/es/geo/br": ["Red de afiliados CPA en Brasil", "¿Puedo unirme a AffiLayer desde Brasil?"],
    "/es/geo/in": ["Red de afiliados CPA en India", "¿Puedo unirme a AffiLayer desde India?"],
    "/es/geo/es": ["Red de afiliados CPA en España", "¿Cómo pagan las ofertas de Finanzas en España?", "podéis ganar comisiones"],
    "/es/geo/mx": ["Red de afiliados CPA en México", "¿Cómo pagan las ofertas de Finanzas en México?", "puedes ganar comisiones"],
    "/es/geo/ar": ["Red de afiliados CPA en Argentina", "¿Cómo pagan las ofertas de Finanzas en Argentina?", "podés ganar comisiones"],
    "/pt/": ["Uma nova rede CPA", "Transforme tráfego de", "Explorar por país"],
    "/pt/affiliates": ["Para afiliados", "Seu caminho até o primeiro pagamento"],
    "/pt/advertisers": ["Para anunciantes", "Seu caminho até o primeiro cliente"],
    "/pt/how-it-works": ["Como funciona", "Criar uma conta"],
    "/pt/geo": ["Rede de afiliados CPA, país por país", "Estados Unidos", "Quais países podem entrar na AffiLayer?"],
    "/pt/geo/us": ["Rede de afiliados CPA em Estados Unidos", "Posso entrar na AffiLayer a partir de Estados Unidos?"],
    "/pt/geo/uk": ["Rede de afiliados CPA em Reino Unido", "Posso entrar na AffiLayer a partir de Reino Unido?"],
    "/pt/geo/ca": ["Rede de afiliados CPA em Canadá", "Posso entrar na AffiLayer a partir de Canadá?"],
    "/pt/geo/au": ["Rede de afiliados CPA em Austrália", "Posso entrar na AffiLayer a partir de Austrália?"],
    "/pt/geo/de": ["Rede de afiliados CPA em Alemanha", "Posso entrar na AffiLayer a partir de Alemanha?"],
    "/pt/geo/fr": ["Rede de afiliados CPA em França", "Posso entrar na AffiLayer a partir de França?"],
    "/pt/geo/br": ["Rede de afiliados CPA em Brasil", "Posso entrar na AffiLayer a partir de Brasil?"],
    "/pt/geo/in": ["Rede de afiliados CPA em Índia", "Posso entrar na AffiLayer a partir de Índia?"],
    "/pt/geo/es": ["Rede de afiliados CPA em Espanha", "Posso entrar na AffiLayer a partir de Espanha?"],
    "/pt/geo/mx": ["Rede de afiliados CPA em México", "Posso entrar na AffiLayer a partir de México?"],
    "/pt/geo/ar": ["Rede de afiliados CPA em Argentina", "Posso entrar na AffiLayer a partir de Argentina?"],
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
            if 'id="affilayer-jsonld"' not in html and route not in NO_JSONLD:
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
