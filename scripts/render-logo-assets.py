#!/usr/bin/env python3
"""Render AffiLayer logo PNG assets from the SVGs using headless Chromium.

Outputs (into apps/web/public/):
  favicon-32x32.png, apple-touch-icon.png (180x180), favicon.ico, og-image.png (1200x630)
Run from the repo root: python3 scripts/render-logo-assets.py

Uses the Chromium binary from the Playwright browser cache
(~/.cache/ms-playwright) — no Playwright package needed.
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "apps" / "web"
PUBLIC = WEB / "public"

CHROME = next(
    (p for p in (
        Path.home() / ".cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
        Path.home() / ".cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell",
    ) if p.exists()),
    None,
)
if CHROME is None:
    sys.exit("No Chromium binary found in ~/.cache/ms-playwright")

MARK = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <g id="a-strokes" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="7">
      <path d="M32 8 11 56" />
      <path d="M32 8 53 56" />
      <path d="M21 41h22" />
    </g>
    <clipPath id="band-1"><rect x="0" y="0" width="64" height="22" /></clipPath>
    <clipPath id="band-2"><rect x="0" y="24" width="64" height="14" /></clipPath>
    <clipPath id="band-3"><rect x="0" y="40" width="64" height="24" /></clipPath>
  </defs>
  <use href="#a-strokes" clip-path="url(#band-1)" stroke="#D97706" />
  <use href="#a-strokes" clip-path="url(#band-2)" stroke="#f59e0b" />
  <use href="#a-strokes" clip-path="url(#band-3)" stroke="#FBBF24" />
</svg>"""

OG_HTML = f"""<!doctype html>
<html><head><meta charset="utf-8"><style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    width: 1200px; height: 630px; background: #070D1A; color: #fff;
    font-family: 'Liberation Sans', Arial, sans-serif; overflow: hidden; position: relative;
  }}
  .grid {{
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(148,163,184,0.10) 1px, transparent 1px),
      linear-gradient(90deg, rgba(148,163,184,0.10) 1px, transparent 1px);
    background-size: 60px 60px;
    -webkit-mask-image: radial-gradient(ellipse 90% 90% at 50% 40%, black 20%, transparent 78%);
    mask-image: radial-gradient(ellipse 90% 90% at 50% 40%, black 20%, transparent 78%);
  }}
  .glow {{
    position: absolute; width: 640px; height: 640px; right: -140px; top: -220px;
    background: radial-gradient(circle, rgba(245,158,11,0.28) 0%, rgba(245,158,11,0) 65%);
  }}
  .inner {{ position: relative; padding: 96px 96px 0 96px; }}
  .lockup {{ display: flex; align-items: center; gap: 28px; }}
  .lockup svg {{ width: 104px; height: 104px; }}
  .word {{ font-size: 96px; font-weight: bold; letter-spacing: -2px; }}
  .tag {{
    margin-top: 40px; font-size: 44px; font-weight: bold; line-height: 1.25; color: #e2e8f0;
  }}
  .tag .grad {{
    background: linear-gradient(90deg, #D97706 0%, #FBBF24 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }}
  .foot {{
    position: absolute; left: 96px; bottom: 56px; font-size: 26px; color: #94a3b8; letter-spacing: 1px;
  }}
</style></head>
<body>
  <div class="grid"></div><div class="glow"></div>
  <div class="inner">
    <div class="lockup">{MARK}<span class="word">AffiLayer</span></div>
    <p class="tag">Global CPA Affiliate Network.<br><span class="grad">Every click tracked. Every commission auditable.</span></p>
  </div>
  <p class="foot">affilayer.com</p>
</body></html>"""

def shot(url: str, out: Path, width: int, height: int) -> None:
    env = {k: v for k, v in os.environ.items() if "proxy" not in k.lower()}
    env["NO_PROXY"] = "localhost,127.0.0.1"
    subprocess.run(
        [str(CHROME), "--headless=new", "--no-sandbox", "--disable-gpu",
         "--hide-scrollbars", "--force-device-scale-factor=1",
         f"--window-size={width},{height}", f"--screenshot={out}", url],
        check=True, env=env, capture_output=True, timeout=120,
    )

def main() -> int:
    tmp = Path("/tmp/logo-render")
    tmp.mkdir(exist_ok=True)
    favicon_url = (PUBLIC / "favicon.svg").as_uri()
    shot(favicon_url, PUBLIC / "favicon-32x32.png", 32, 32)
    shot(favicon_url, PUBLIC / "apple-touch-icon.png", 180, 180)
    og_html = tmp / "og.html"
    og_html.write_text(OG_HTML)
    shot(og_html.as_uri(), PUBLIC / "og-image.png", 1200, 630)

    from PIL import Image
    png = PUBLIC / "favicon-32x32.png"
    img = Image.open(png).convert("RGBA")
    img.save(PUBLIC / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])

    for name in ("favicon-32x32.png", "apple-touch-icon.png", "favicon.ico", "og-image.png"):
        f = PUBLIC / name
        im = Image.open(f)
        print(f"{name}: {im.size} {im.format} {f.stat().st_size} bytes")
        colors = im.convert("RGB").getcolors(maxcolors=1_000_000)
        assert colors is not None and len(colors) > 10, f"{name} looks blank"
    print("All logo PNG assets rendered OK.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
