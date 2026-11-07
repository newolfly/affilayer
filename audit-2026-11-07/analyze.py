import re, json, glob, html

for f in sorted(glob.glob("page-*.html")):
    raw = open(f, encoding="utf-8", errors="replace").read()
    print("="*90)
    print(f, "bytes:", len(raw))
    # html lang
    m = re.search(r'<html[^>]*lang="([^"]+)"', raw)
    print("html lang:", m.group(1) if m else "MISSING")
    # viewport
    m = re.search(r'<meta name="viewport"[^>]*>', raw)
    print("viewport:", m.group(0) if m else "MISSING")
    # title
    m = re.search(r'<title>(.*?)</title>', raw, re.S)
    print("title:", (m.group(1).strip() if m else "MISSING"), "| len:", len(m.group(1).strip()) if m else 0)
    # meta description
    m = re.search(r'<meta name="description" content="([^"]*)"', raw)
    print("description:", (m.group(1)[:160] if m else "MISSING"), "| len:", len(m.group(1)) if m else 0)
    # canonical
    m = re.search(r'<link rel="canonical" href="([^"]*)"', raw)
    print("canonical:", m.group(1) if m else "MISSING")
    # OG
    for prop in ["og:title","og:description","og:image","og:url","og:type","og:locale","twitter:card","twitter:title","twitter:description","twitter:image"]:
        m = re.search(r'<meta (?:property|name)="%s" content="([^"]*)"' % prop, raw)
        print(f"  {prop}:", m.group(1)[:110] if m else "MISSING")
    # hreflang
    for m in re.finditer(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"', raw):
        print(f"  hreflang {m.group(1)}: {m.group(2)}")
    # JSON-LD
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', raw, re.S):
        try:
            d = json.loads(m.group(1))
            t = d.get("@type")
            if isinstance(t, list): t = ",".join(t)
            print("  JSON-LD OK @type:", t, "| keys:", sorted(d.keys()))
        except Exception as e:
            print("  JSON-LD INVALID:", str(e)[:120])
    # headings
    hs = re.findall(r'<h([1-6])[^>]*>(.*?)</h\1>', raw, re.S)
    h1s = [html.unescape(re.sub(r"<[^>]+>","",h[1])).strip()[:70] for h in hs if h[0]=="1"]
    print("  h1 count:", len(h1s), "| h1s:", h1s)
    seq = "".join(h[0] for h in hs)
    print("  heading sequence:", seq[:60], "| total headings:", len(hs))
    # skip link
    m = re.search(r'<a[^>]*href="#main-content"[^>]*>(.*?)</a>', raw, re.S)
    print("  skip link:", ("PRESENT: " + html.unescape(re.sub(r"<[^>]+>","",m.group(1))).strip()[:60]) if m else "MISSING")
    # main
    m = re.search(r'<main[^>]*>', raw)
    print("  <main>:", m.group(0) if m else "MISSING")
    # images
    imgs = re.findall(r'<img[^>]*>', raw)
    noalt = [i for i in imgs if 'alt=' not in i]
    emptyalt = [i for i in imgs if re.search(r'alt=""', i)]
    print(f"  images: {len(imgs)} total, {len(noalt)} missing alt, {len(emptyalt)} empty alt")
    for i in imgs[:6]:
        print("    img:", i[:160])
    # forms
    forms = re.findall(r'<form[^>]*>(.*?)</form>', raw, re.S)
    print("  forms:", len(forms))
    for fi, form in enumerate(forms):
        inputs = re.findall(r'<(input|textarea|select)[^>]*>', form)
        print(f"    form {fi}: {len(inputs)} fields")
        for inp in inputs:
            print("      field:", inp[:200])
        labels = re.findall(r'<label[^>]*>', form)
        print(f"      <label> count: {len(labels)}")
