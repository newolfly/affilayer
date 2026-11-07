import re, json, glob
for f in sorted(glob.glob("page-*.html")):
    raw = open(f, encoding="utf-8", errors="replace").read()
    for m in re.finditer(r'<script[^>]*ld\+json[^>]*>(.*?)</script>', raw, re.S):
        tag = raw[max(0,m.start()-120):m.start()]
        try:
            d = json.loads(m.group(1))
            print(f, "| script attrs:", re.search(r'<script([^>]*)>', raw[m.start():]).group(1)[:120])
            print("   @type:", d.get("@type"), "| @context:", d.get("@context"))
            print("   keys:", sorted(d.keys()))
            if d.get("@type") == "FAQPage":
                print("   mainEntity count:", len(d.get("mainEntity", [])))
            if d.get("@type") == "BlogPosting":
                print("   headline:", d.get("headline"), "| datePublished:", d.get("datePublished"))
            if isinstance(d.get("@type"), list):
                print("   graph types:", d.get("@type"))
            print("   raw JSON len:", len(m.group(1)))
        except Exception as e:
            print(f, "JSON-LD PARSE ERROR:", e)
