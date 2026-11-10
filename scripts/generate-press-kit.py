#!/usr/bin/env python3
"""Generate the /brand press kit into apps/web/public/brand/.

Regenerable from the repo so it cannot drift from the live logo:
  - SVG lockups copied from public/ with human names
  - Transparent PNG exports (Chromium screenshot on a magenta key
    background, keyed out with PIL — the SVGs have no magenta in them)
  - boilerplate.txt + fact-sheet.txt (same copy as brand-data.ts)
  - brand-guidelines.pdf (Chromium print-to-PDF of a guidelines page)
  - press-kit.zip (everything above)
Run from the repo root: python3 scripts/generate-press-kit.py
"""
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "apps" / "web" / "public"
BRAND = PUBLIC / "brand"
TMP = Path("/tmp/press-kit")

CHROME = next(
    (p for p in (
        Path.home() / ".cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
        Path.home() / ".cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell",
    ) if p.exists()),
    None,
)
KEY = (255, 0, 255)  # magenta key background — no brand asset uses it

BOILERPLATE_SHORT = "AffiLayer is a global CPA affiliate network operated by MarketSync Global LLC (New Mexico, USA), connecting advertisers with affiliates through direct offers and one SmartLink, with full-funnel tracking and every commission written to an auditable ledger."
BOILERPLATE_MEDIUM = "AffiLayer is a global CPA affiliate network operated by MarketSync Global LLC, a registered company in New Mexico, USA. Advertisers publish offers with a stated payout and conversion action; affiliates promote them and earn commission on attributed conversions. The network opened on 7 November 2026. It is deliberately small: a focused offer catalogue, a tracking engine the team can explain, and applications and conversions reviewed by hand."
BOILERPLATE_LONG = BOILERPLATE_MEDIUM + " Its three principles are tracking you can audit, an append-only commission ledger — a ledger that cannot be silently rewritten — and approval on both sides. We do not run traffic ourselves, we do not buy traffic on your behalf, and we do not promise results to either side."

FACTS = """AffiLayer — fact sheet (as of 10 November 2026)
Operated by: MarketSync Global LLC, New Mexico, USA
Opened: 7 November 2026
Contact: support@affilayer.com
Partnerships: partner@affilayer.com
Payout models: CPA, CPL, CPS, CPC
Verticals: Dating, Finance, Gaming, Sweepstakes, Nutra, iGaming
Languages: EN / ES / PT (dashboards in English)
Country pages: US, UK, CA, AU, DE, FR, BR, IN, ES, MX, AR
Offer catalogue: small and growing offer by offer
Payouts: manual, admin-approved, Net30 by default
SmartLink: one link, deterministic routing, no AI optimisation, no guaranteed earnings
"""

GUIDELINES_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Arial,sans-serif;color:#111;margin:48px;max-width:720px}
h1{font-size:28px}h2{font-size:18px;margin-top:28px;color:#0B1220}
p,li{font-size:13px;line-height:1.5}
.gold{color:#B45309}.swatch{display:inline-block;width:18px;height:18px;border:1px solid #999;vertical-align:middle;margin-right:6px}
img{max-width:320px}
.dark{background:#070D1A;padding:16px;display:inline-block}
</style></head><body>
<h1>AffiLayer — Brand Guidelines</h1>
<p><strong>Open books, not big promises.</strong> AffiLayer is a global CPA affiliate network operated by MarketSync Global LLC, New Mexico, USA. Always write the name as <strong>AffiLayer</strong> — capital A, capital L, one word. Never Affi Layer, Affilayer, AFFILAYER, or AL. Product names: SmartLink, Net30, CPA / CPL / CPS / CPC. People are affiliates and advertisers — never "publishers".</p>
<h2>The mark</h2>
<p>A capital A built from three stacked layers — the layers of the network. Gold, always in this order top to bottom: #D97706, #F59E0B, #FBBF24.</p>
<p class="dark"><img src="LOGO_LIGHT"></p>
<h2>Lockups</h2>
<ul><li>Dark wordmark (logo.svg) on light backgrounds.</li><li>Light wordmark (logo-light.svg) on dark backgrounds.</li><li>Mark alone (logo-mark.svg) for avatars, favicons and small sizes.</li></ul>
<h2>Clear space &amp; minimum size</h2>
<p>Clear space: minimum one "A-leg width" on all sides. Minimum sizes: mark 24px, full lockup 120px wide.</p>
<h2>Colours</h2>
<p><span class="swatch" style="background:#070D1A"></span>Page #070D1A &nbsp; <span class="swatch" style="background:#111C30"></span>Cards #111C30 &nbsp; <span class="swatch" style="background:#1E2A3F"></span>Borders #1E2A3F</p>
<p><span class="swatch" style="background:#8A97A8"></span>Muted text #8A97A8 &nbsp; <span class="swatch" style="background:#D97706"></span>#D97706 &nbsp; <span class="swatch" style="background:#F59E0B"></span>#F59E0B &nbsp; <span class="swatch" style="background:#FBBF24"></span>#FBBF24 &nbsp; Button text #0B1220</p>
<p>Gold is always a 90° ramp in that order, never a flat fill, never reversed.</p>
<h2>Type</h2>
<p>The wordmark is set in Inter ExtraBold. The site itself uses the system font stack — no webfont is loaded — so headlines are bold system sans, and the gold gradient is used sparingly: H1 accent words and slogans only.</p>
<h2>Do / Don't</h2>
<ul><li>Do use the mark on navy; do keep the band order; do link the logo to affilayer.com.</li><li>Don't stretch, recolour, or outline the mark; don't put the light lockup on a light background; don't add a tagline to the logo; don't use the OG image as a logo.</li></ul>
<h2>Voice</h2>
<p>Say what's live, no more, no less. Small promises, open records. Plain words, short sentences. Numbers only when real. Never claim earnings, guaranteed results, "best network", "highest paying", or AI optimisation — SmartLink uses clear deterministic rules, no AI optimisation, no guaranteed earnings. No testimonials, no client logos, no invented partner names. The white-label line "Your affiliates never see AffiLayer" is a product fact, not a brand line — never quote it in brand or press copy.</p>
<h2>Press contact</h2>
<p>support@affilayer.com (subject "Press"). Press kit: https://affilayer.com/brand/press-kit.zip</p>
</body></html>"""


def run_chrome(args):
    env = {k: v for k, v in os.environ.items() if "proxy" not in k.lower()}
    env["NO_PROXY"] = "localhost,127.0.0.1"
    subprocess.run([str(CHROME), "--headless=new", "--no-sandbox", "--disable-gpu",
                    "--hide-scrollbars", "--no-proxy-server", *args],
                   check=True, env=env, capture_output=True, timeout=120)


def png_export(svg: Path, out: Path, width: int, height: int) -> None:
    """Screenshot the SVG on a magenta page, then key the magenta out."""
    from PIL import Image
    page = TMP / "key.html"
    page.write_text(
        "<!doctype html><html><head><style>*{margin:0;padding:0}"
        "body{background:#FF00FF}</style></head><body>"
        f"<img src=\"{svg.as_uri()}\" style=\"width:{width}px;height:{height}px;display:block\">"
        "</body></html>"
    )
    shot = TMP / "shot.png"
    run_chrome(["--force-device-scale-factor=1", f"--window-size={width},{height}",
                f"--screenshot={shot}", page.as_uri()])
    im = Image.open(shot).convert("RGB")
    px = im.load()
    out_im = Image.new("RGBA", im.size)
    opx = out_im.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b = px[x, y]
            # distance from magenta key colour; near-key pixels go transparent
            if abs(r - 255) < 24 and g < 24 and abs(b - 255) < 24:
                opx[x, y] = (0, 0, 0, 0)
            else:
                opx[x, y] = (r, g, b, 255)
    out_im.save(out)
    print(f"{out.name}: {out_im.size} {out.stat().st_size} bytes")


def main() -> int:
    if CHROME is None:
        print("No Chromium binary found", file=sys.stderr)
        return 1
    BRAND.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(exist_ok=True)
    # SVGs + OG image, human names
    shutil.copyfile(PUBLIC / "logo.svg", BRAND / "AffiLayer-logo-dark.svg")
    shutil.copyfile(PUBLIC / "logo-light.svg", BRAND / "AffiLayer-logo-light.svg")
    shutil.copyfile(PUBLIC / "logo-mark.svg", BRAND / "AffiLayer-mark.svg")
    shutil.copyfile(PUBLIC / "favicon.svg", BRAND / "AffiLayer-favicon.svg")
    shutil.copyfile(PUBLIC / "og-image.png", BRAND / "AffiLayer-og-image.png")
    # Transparent PNG exports
    png_export(PUBLIC / "logo-mark.svg", BRAND / "AffiLayer-mark-512.png", 512, 512)
    png_export(PUBLIC / "logo-mark.svg", BRAND / "AffiLayer-mark-1024.png", 1024, 1024)
    png_export(PUBLIC / "logo.svg", BRAND / "AffiLayer-logo-dark-1024.png", 1024, 241)
    png_export(PUBLIC / "logo-light.svg", BRAND / "AffiLayer-logo-light-1024.png", 1024, 241)
    # Text files
    (BRAND / "boilerplate.txt").write_text(
        "AffiLayer — boilerplate\n\nSHORT (1 sentence)\n" + BOILERPLATE_SHORT +
        "\n\nMEDIUM\n" + BOILERPLATE_MEDIUM + "\n\nLONG\n" + BOILERPLATE_LONG + "\n")
    (BRAND / "fact-sheet.txt").write_text(FACTS)
    # Guidelines PDF via Chromium print-to-pdf
    html = TMP / "guidelines.html"
    html.write_text(GUIDELINES_HTML.replace("LOGO_LIGHT", (PUBLIC / "logo-light.svg").as_uri()))
    run_chrome(["--print-to-pdf=" + str(BRAND / "brand-guidelines.pdf"), "--no-pdf-header-footer", html.as_uri()])
    print(f"brand-guidelines.pdf: {(BRAND / 'brand-guidelines.pdf').stat().st_size} bytes")
    # Zip (everything except the zip itself)
    zip_path = BRAND / "press-kit.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(BRAND.iterdir()):
            if f.name == "press-kit.zip":
                continue
            z.write(f, arcname=f.name)
    print(f"press-kit.zip: {zip_path.stat().st_size} bytes, {len(list(BRAND.iterdir())) - 1} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
