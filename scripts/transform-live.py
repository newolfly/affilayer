#!/usr/bin/env python3
"""Transform a live (pre-gold) affilayer.com prerendered page into gold HTML.

Reads HTML on stdin, writes transformed HTML on stdout.
Replacements were derived by diffing live /geo/us against the local gold
build of /geo/us (commit 15a150e). Order matters: longest phrases first,
then singles, then a generic orange->amber safety net for stragglers.
"""
import re
import sys

PAIRS = [
    # --- asset hashes: live -> gold build ---
    ("index-BY4qFNwk.js", "index-I-k8WHqV.js"),
    ("index-D1rZ9cS0.css", "index-COFJ0IWu.css"),
    ("public-C511BQSa.js", "public-D4H-Fl18.js"),
    ("geo-CybLGIvO.js", "geo-DLJK1yIO.js"),
    # --- class phrases first (longest first) ---
    ("bg-gradient-to-br from-orange-500 to-yellow-400 text-sm font-bold text-white",
     "bg-gradient-to-br from-amber-600 via-amber-500 to-amber-400 text-sm font-bold text-[#0B1220]"),
    ("from-orange-500 to-yellow-400", "from-amber-600 via-amber-500 to-amber-400"),
    ("bg-orange-500/10", "bg-amber-500/10"),
    ("bg-orange-500/15", "bg-amber-500/15"),
    ("bg-slate-700", "bg-[#1E2A3F]"),
    ("bg-slate-900/60", "bg-[#111C30]/60"),
    ("from-orange-500", "from-amber-600"),
    ("hover:text-orange-300", "hover:text-amber-300"),
    ("text-orange-400", "text-amber-400"),
    ("text-orange-600", "text-amber-700"),
    ("text-slate-500", "text-[#8A97A8]"),
    ("to-yellow-400", "to-amber-400"),
    ("bg-[#0B1220]/90", "bg-[#070D1A]/90"),
    ("bg-[#0B1220]", "bg-[#070D1A]"),
    # theme-color meta (uppercase hex here only; keep uppercase #0B1220
    # as button text elsewhere)
    ('content="#0B1220"', 'content="#070D1A"'),
    # --- hex colours ---
    ("#f97316", "#D97706"),
    ("#eab308", "#FBBF24"),
    ("#f59e0b", "#F59E0B"),
    ("#0b1220", "#070D1A"),
    ("#0f172a", "#111C30"),
    ("#334155", "#1E2A3F"),
    ("#a6d5d3", "#8A97A8"),
    ("#b3c0c6", "#8A97A8"),
    ("#314244", "#1E2A3F"),
    ("#cab9bf", "#F59E0B"),
]

# Generic safety net for any orange utility not covered above.
GENERIC = [
    ("orange-700", "amber-700"),
    ("orange-600", "amber-600"),
    ("orange-500", "amber-500"),
    ("orange-400", "amber-400"),
    ("orange-300", "amber-300"),
]


def main():
    html = sys.stdin.read()

    # Cloudflare email protection: full-anchor form first, then the span
    # form, then bare protected hrefs. Both decode to support@affilayer.com.
    html = re.sub(
        r'<a href="/cdn-cgi/l/email-protection" class="__cf_email__" '
        r'data-cfemail="[0-9a-f]*">\[email&#160;protected\]</a>',
        '<a href="mailto:support@affilayer.com">support@affilayer.com</a>',
        html,
    )
    html = re.sub(
        r'<span class="__cf_email__" data-cfemail="[0-9a-f]*">'
        r"\[email&#160;protected\]</span>",
        "support@affilayer.com",
        html,
    )
    html = re.sub(
        r'href="/cdn-cgi/l/email-protection#[0-9a-f]*"',
        'href="mailto:support@affilayer.com"',
        html,
    )
    # Drop the email-decode helper script line entirely.
    html = re.sub(
        r'<script[^>]*email-decode\.min\.js[^>]*></script>\s*', "", html
    )

    for old, new in PAIRS:
        html = html.replace(old, new)
    for old, new in GENERIC:
        html = html.replace(old, new)

    sys.stdout.write(html)


if __name__ == "__main__":
    main()
