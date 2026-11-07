import re, json, glob
for f in sorted(glob.glob("page-*.html")):
    raw = open(f, encoding="utf-8", errors="replace").read()
    for m in re.finditer(r'<script[^>]*ld\+json[^>]*>(.*?)</script>', raw, re.S):
        d = json.loads(m.group(1))
        items = d if isinstance(d, list) else [d]
        print("="*80)
        print(f, "| JSON valid | nodes:", len(items))
        for it in items:
            t = it.get("@type")
            print("  @type:", t)
            if t == "Organization":
                print("    name:", it.get("name"), "| url:", it.get("url"), "| sameAs:", it.get("sameAs"))
            if t == "WebSite":
                print("    name:", it.get("name"), "| url:", it.get("url"))
            if t == "FAQPage":
                print("    mainEntity Qs:", len(it.get("mainEntity", [])))
                print("    first Q:", it["mainEntity"][0].get("name")[:80] if it.get("mainEntity") else None)
            if t == "BlogPosting":
                print("    headline:", it.get("headline"), "| datePublished:", it.get("datePublished"), "| author:", it.get("author"))
            if t == "BreadcrumbList":
                print("    items:", [(i.get("position"), i.get("name")) for i in it.get("itemListElement", [])])
            if t == "WebPage":
                print("    name:", it.get("name"), "| url:", it.get("url"))
