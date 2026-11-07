# AffiLayer Audit C — SEO + Accessibility + Performance

**Auditor:** Audit Agent C (read-only, no changes made)
**Date:** 2026-11-07, ~21:45 +06 (audit run 15:41–15:47 UTC)
**Scope:** Live site https://affilayer.com (50 sitemap URLs, EN/ES/PT) + docs https://affilayer-docs.pages.dev
**Method:** curl from the VM (with retries — VM egress intermittently returns HTTP 000), page-HTML analysis with Python (regex + JSON parse), contrast computed from repo CSS values, asset inventory from `apps/web/dist`.
**Evidence files (this dir):** `sitemap.xml`, `urls.txt`, `url_status.txt`, `page-{home,about,advantages,geo-br,es,pt-affiliates,contact,faq,blog-post,partner}.html`, `analysis.txt`, `docs-home.html`, `login.html`.

## Verdict summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 4 |
| Low | 7 |
| Pass | 21 |
| Unverified (needs live browser / real phone) | 3 |

**One-line verdict:** The SEO foundation is genuinely strong (clean sitemap, full meta/OG/JSON-LD, valid hreflang, fast pages) and the accessibility baseline is solid (skip link, labels, focus styles, contrast all pass). The single High issue is the homepage H1, which in the served HTML reads **"Turn SweepstakesNutra traffic into commission"** — two rotating words concatenated with no space, on the EN, ES and PT home pages. Everything else is fixable hygiene.

---

## 1. SEO

### 1.1 Sitemap — Pass
- `https://affilayer.com/sitemap.xml` returns HTTP 200, `Content-Type: application/xml`, valid XML against the sitemaps.org schema.
- **50 `<url>` entries, 0 duplicates** (verified by sort/uniq).
- All 50 lastmod = `2026-11-07` (current).
- **All 50 URLs return HTTP 200** (checked one by one, full list in `url_status.txt`); 0 redirects, 0 errors.
- Priorities are sane (home 1.0, /es /pt 0.9, money pages 0.9, geo 0.7, terms/privacy 0.4).
- Auth/dashboard routes (`/login`, `/register`, `/app/*`) are correctly **excluded** from the sitemap.

### 1.2 robots.txt — Pass
- `https://affilayer.com/robots.txt` returns 200:
  ```
  User-agent: *
  Allow: /
  Sitemap: https://affilayer.com/sitemap.xml
  ```

### 1.3 Per-page meta (10 pages sampled: home, about, advantages, geo/br, /es/, /pt/affiliates, contact, faq, blog post, partner) — Pass
Every sampled page has a unique title, unique description, correct canonical, complete OG + Twitter tags:
- Titles 28–70 chars, all unique and accurate (e.g. home `AffiLayer — Global CPA Affiliate Network`, geo/br `CPA Affiliate Network in Brazil | AffiLayer`, blog post `AffiLayer is live: what the network offers on day one | AffiLayer Blog`).
- Descriptions 119–171 chars, all unique and honest (see Low finding 1.9 for the one over-length case).
- Canonicals are correct self-canonicals on every sampled page.
- `og:image` = `https://affilayer.com/og-image.png` on every page; `og:type` = `website` (correctly `article` on the blog post); `twitter:card` = `summary_large_image` everywhere.
- `og:image` verified live: HTTP 200, `image/png`, 165,317 B, **1200×630 px** (verified with PIL).

### 1.4 JSON-LD — Pass
- Present on **all 10 sampled pages** as a single `<script id="affilayer-jsonld" type="application/ld+json">` block; every block parses as **valid JSON** (verified with `json.loads`).
- Home + /es/ home: `Organization` (name AffiLayer, url https://affilayer.com/) + `WebSite`. Note: `Organization` has **no `sameAs`** — correct and honest, because no social profiles exist yet.
- FAQ page: `WebPage` + `FAQPage` with **16 Q&As**; every question string appears verbatim in the visible page text (verified programmatically).
- Geo page (/geo/br): `WebPage` + `BreadcrumbList` (Home → Countries → Brazil) + `FAQPage` with 3 Q&As, all present in visible text.
- Blog post: `BlogPosting` with headline, `datePublished: 2026-11-07`, author Organization.
- No JSON-LD errors anywhere in the sample.

### 1.5 hreflang — Pass
- Home, /es/, /pt/affiliates, /geo/br all carry `en`, `es`, `pt` + `x-default` alternate links.
- **Every hreflang target exists in the sitemap and returns 200** (verified programmatically against `urls.txt`).
- `og:locale` matches the page language: `en_US`, `es_ES`, `pt_BR`.
- `html lang` is correct per locale: `en`, `es`, `pt` (see §2.8).

### 1.6 HIGH — Homepage H1 contains a concatenated nonsense word in the served HTML
**Severity: High. Evidence:**
- Served HTML, EN home (`page-home.html`):
  ```html
  <h1 ...>Turn <span class="rotator-stack"><span class="rotator-word rotator-out grad-text" aria-hidden="true">Sweepstakes</span><span class="rotator-word rotator-in grad-text">Nutra</span></span> traffic into commission.</h1>
  ```
  The H1's text content is **"Turn SweepstakesNutra traffic into commission."**
- Same defect on `/es/` (`"Convierte tráfico de SweepstakesNutra"`) and `/pt/` (`"Transforme tráfego de SweepstakesNutra"` — verified live).
- Root cause: the crossfade polish keeps **both** rotator words in the DOM at all times (outgoing + incoming, `VERTICALS = ['Dating','Finance','Gaming','Sweepstakes','Nutra','iGaming']` in `apps/web/src/pages/public.tsx:12`; 'Sweepstakes' and 'Nutra' are adjacent, so the prerender froze mid-crossfade between them). The two spans sit adjacent with no space, so the text concatenates.
- Why it matters: the H1 is the single most important on-page SEO element, and this is the **served HTML** — what crawlers index. Google's rendered DOM has the same problem (both spans are always present by design). The word "SweepstakesNutra" does not exist; it will be indexed as a token on the homepage in all three languages.
- Screen readers are **not** affected (the outgoing span is `aria-hidden="true"`, so AT hears only the incoming word) — this is purely an SEO/indexing defect.
- Fix: render a space between the two spans, or ensure the static/prerendered snapshot contains only one word (e.g. hide the outgoing word from the prerender, or put the space inside the rotator-stack). One-line fix; re-prerender and re-check the H1 text.

### 1.7 MEDIUM — Trailing-slash duplicates: every URL serves at two variants, no redirect
**Severity: Medium. Evidence:**
- `https://affilayer.com/about/` → 200, `https://affilayer.com/geo/br/` → 200, `https://affilayer.com/faq/` → 200 — no redirect to the canonical non-slash form.
- `/es` → 200 and `/es/` → 200 serve **identical content** (byte diff shows only the Cloudflare email-obfuscation token differs).
- Canonicals are inconsistent: most pages canonicalize to the **non-slash** form (`https://affilayer.com/about`), but `/es/` and `/pt/` canonicalize to the **slash** form (`https://affilayer.com/es/`), while the sitemap lists `/es` and `/pt` **without** the slash. So canonical ≠ sitemap URL for the two localized home pages.
- Impact is limited because canonicals exist and Google follows them, but the site is currently spending crawl budget on duplicate URLs and the canonical/sitemap contradiction is a real signal conflict.
- Fix: 301-redirect the non-canonical variant (Pages `_redirects` or a Worker route) and make sitemap/canonical agree (pick one form per URL).

### 1.8 MEDIUM — Auth and dashboard routes are crawlable and serve the homepage title with no noindex
**Severity: Medium. Evidence:**
- `https://affilayer.com/login` → 200, `https://affilayer.com/register` → 200, `https://affilayer.com/app/affiliate` → 200 (no auth).
- The served `/login` HTML has **no `<meta name="robots">` and no `noindex` anywhere** (verified: `grep -c noindex` = 0).
- Its title is the homepage title: `<title>AffiLayer — Global CPA Affiliate Network</title>` — same title and description as `/`.
- Root cause: `RouteSeo()` in `apps/web/src/lib/seo.ts` falls back to the default (homepage) meta for any pathname without an SEO entry, sets canonical to the raw pathname, and never sets `noindex`.
- Fix: add `noindex, nofollow` (robots meta + `X-Robots-Tag` header if possible) to `/login`, `/register`, `/app/*`, `/onboarding`, `/pending` — and ideally give `/login` its own title.

### 1.9 LOW — One meta description over the display limit
- `/pt/affiliates` description is **171 chars** (all others in the sample are 119–158). Google truncates around 155–160 characters, so the tail will be cut in SERPs. Trim to ≤160.

### 1.10 LOW — llms.txt links to a dead subdomain
- `https://affilayer.com/llms.txt` (3,135 B) and `llms-full.txt` (5,328 B) both return 200 and are **honest throughout** — no fake stats, no invented features, demo-mode status stated plainly, "no AI optimisation, no guaranteed earnings", "offer catalogue is small". Pass on content.
- But llms.txt lists `[Docs](https://docs.affilayer.com/)` — and **docs.affilayer.com does not resolve** (known DNS issue: the CNAME was never created; see the parent agent's docs item). Fix the link once the docs domain is live, or point it at `https://affilayer-docs.pages.dev/` meanwhile.

### 1.11 MEDIUM — Docs site: no real robots.txt, no sitemap, no canonicals
**Severity: Medium. Evidence (https://affilayer-docs.pages.dev):**
- All 6 docs pages return 200 (`/`, `/getting-started`, `/tracking`, `/postbacks`, `/payouts`, `/api`).
- `/robots.txt` → **200 but the body is the homepage HTML** (3,602 B, starts `<!doctype html>`) — the SPA fallback serves index.html for any unknown path. Same for `/sitemap.xml` → 200 with the homepage HTML. Crawlers requesting robots.txt get invalid content; there is no sitemap at all.
- **No `<link rel="canonical">` on any docs page** (checked home and `/tracking`).
- **No OG tags** on the docs home (`grep og:` = nothing).
- Positive: docs pages have unique titles (`Getting started — AffiLayer Docs`, etc.) and the home has a proper meta description.
- Fix: add a real `robots.txt` + `sitemap.xml` to `apps/docs/`, add canonicals (and OG tags) to each docs page. Note the docs domain itself is still down — fix the DNS first, then the SEO files.

---

## 2. Accessibility

### 2.1 Skip link — Pass
- First element inside `#root` on every sampled page: `<a href="#main-content" class="skip-link">Skip to main content</a>` (translated: ES "Saltar al contenido principal", PT "Pular para o conteúdo principal").
- CSS (`.skip-link`, `apps/web/src/index.css`): visually hidden (`top: -4rem`) until `:focus-visible`, then slides in (`top: 1rem`) on a gold pill. Verified in the browser check earlier (Tab → gold pill → `#main-content`).

### 2.2 Main landmark — Pass
- `<main id="main-content" ...>` present on all 10 sampled pages (public and localized).

### 2.3 Form labels — Pass
- Contact form: **4 fields, 4 `<label>` elements, all correctly associated** via `for`/`id` (`contact-name`, `contact-email`, `contact-subject`, `contact-message`). Verified in the served HTML.
- Home page contact form: same 4 fields / 4 labels.
- Login/register inputs: not checked in live HTML here (SPA routes) — the source shows demo credentials in `<code>` elements and role buttons with text. Mark dashboard/auth form labelling as **Unverified** (see §2.10) — the public contact form is the verified one.

### 2.4 Images / alt text — Pass
- Static HTML contains only 2 `<img>` per page (header + footer logo), both `<img alt="AffiLayer" ... width="32" height="32" src="/logo-mark.svg">`. 0 missing alt, 0 empty alt across the sample.
- Small UI icons are inline SVG with `aria-hidden="true"` (correct).

### 2.5 LOW — Page illustration SVGs have no accessible name
- The large per-page illustration is one `<svg viewBox="0 0 640 230" class="w-full" fill="none">` with **no `role="img"` and no `aria-label`** (verified in `page-advantages.html` and `page-home.html`). The job-4 spec said the illustration would carry `role="img"` + `aria-label`; it does not.
- The SVG contains text labels ("Auditable tracking", "Ledger", "Open records" etc.) that a screen reader gets no name for. Fix: add `role="img"` + a short `aria-label` (e.g. "Illustration: auditable tracking, approval flows, ledger, open records"), or `aria-hidden="true"` if it is treated as purely decorative.

### 2.6 Buttons / accessible names — Pass
- Hamburger: `<button ... aria-expanded="false" aria-label="Open menu">` — correct name + state.
- Every other `<button>` in the sampled HTML has visible text content ("Send message", etc.). No button without an accessible name found.

### 2.7 Heading order — Pass
- Exactly **one `<h1>` on every sampled page** (verified: h1 count = 1 on all 10).
- No skipped levels: sequences are e.g. home `12223333333322`, advantages `123333333322`, geo/br `12233333233332`, faq `12222`. (h2 after h3 is permitted; no h1→h3 jumps.)

### 2.8 Language attributes — Pass
- `html lang="en"` / `"es"` / `"pt"` correct per locale; `og:locale` matches (`en_US`, `es_ES`, `pt_BR`).

### 2.9 Contrast — Pass (all ratios recomputed from the repo CSS values)
Computed with the WCAG relative-luminance formula (verified against the values claimed in `index.css` — all four claimed ratios reproduce exactly):

| Pair | Ratio | WCAG AA (4.5:1) |
|---|---|---|
| Navy #0B1220 on gold #F59E0B (pill-btn) | **8.72:1** | Pass |
| Navy #0B1220 on darkest gold #D97706 | **5.88:1** | Pass |
| Navy #0B1220 on brightest gold #FBBF24 | **11.22:1** | Pass |
| Muted #8A97A8 on navy #070D1A | **6.54:1** | Pass |
| Body slate-200 #E2E8F0 on navy #070D1A | **15.75:1** | Pass |
| White on navy #070D1A | **19.42:1** | Pass |
| Nav slate-300 #CBD5E1 on navy #070D1A | **13.08:1** | Pass |
| Amber-400 #FBBF24 on navy #070D1A | **11.63:1** | Pass |
| Gradient-text darkest stop #D97706 on navy | **6.09:1** | Pass |
| Placeholder #8A97A8 on field #111C30 | **5.74:1** | Pass |
| Field text #E2E8F0 on field #111C30 | **13.82:1** | Pass |
| Muted #8A97A8 on card #111C30 / panel #0F1B2E | **5.74 / 5.81:1** | Pass |
| Dashboard link amber-700 #B45309 on white | **5.02:1** | Pass |
| Dashboard banner amber-800 #92400E on amber-50 | **6.84:1** | Pass |
| Slate-700 #334155 on white / slate-100 | **10.35 / 9.45:1** | Pass |

- **Slate-500 resolved:** `#64748B` on navy is 4.08:1 (fails AA normal text) — but `text-slate-500` is **not used on any navy surface** in the current build. It appears only in dashboard/auth components (layout.tsx, admin/affiliate/advertiser/auth pages), which render on **white cards over a slate-100 page** (4.76:1 on white — pass). The login/register forms sit in a white `bg-white` card inside the dark layout, so their slate-500 text is on white. The old growth-plan finding ("slate-500 small text on navy fails") is **fixed**.
- No orange (`#f97316`) or blue leftovers in the built CSS (grep = 0).

### 2.10 Focus, touch targets, motion — Pass (with one scoping note)
- **`:focus-visible`**: global rule exists — `outline: 2px solid #FBBF24; outline-offset: 2px;` — and no rule removes outlines (the old `.dark-field:focus` outline-removal is gone; `.dark-field:focus` now sets a gold border + outline). Pass.
- **Touch targets**: a `@media (pointer: coarse)` rule sets `min-height: 44px` for header buttons/pills, Mobile-nav links and Dashboard-nav links. Present and correct, but **narrowly scoped** — footer links, the language switcher and form submit buttons are not covered by the rule (they meet the WCAG 2.2 AA 24 px minimum by padding, but 44 px coverage is partial). Low.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables reveal, rotator, lift, loader, art-float and switch-bar animations. Pass.
- **Keyboard behaviour (tab order, focus trap in the mobile menu, Escape-to-close) and screen-reader announcement of the rotator: UNVERIFIED** — no live browser available to this auditor. The code looks right (aria-expanded toggles, menu closes on link click, outgoing rotator word is aria-hidden) but behaviour was not exercised.

### 2.11 MEDIUM — `.reveal` content is invisible without JavaScript
**Severity: Medium. Evidence:**
- The served home HTML contains **20 elements with class `reveal` and 0 with `is-visible`** (`grep -c "is-visible" page-home.html` = 0).
- CSS: `.reveal { opacity: 0; transform: translateY(14px); }` — content only appears when JS runs and IntersectionObserver adds `.is-visible`.
- Consequence: with JS disabled (or if the bundle fails to load), ~20 home-page sections — including the funnels, country grid and trust content — are **invisible**. Google renders JS so the SEO impact is limited, but this is a progressive-enhancement failure: the prerendered HTML should carry the content visibly and let JS enhance it, not hide it by default.
- Note the reduced-motion path already sets `.reveal { opacity: 1 }` — the same "visible by default" approach should apply to the no-JS case (e.g. add `is-visible` during prerender, or gate the hidden state behind a `js` class on `<html>`).
- Same pattern likely affects other public pages (spot-checked home only; the `Reveal` component is used site-wide).

---

## 3. Performance

### 3.1 Timing — Pass
Measured with `curl -w` (VM → Cloudflare edge; cold = first hit, warm = repeat):

| URL | TTFB | Total | Size (gz) |
|---|---|---|---|
| `/` (cold) | 0.59 s | 0.64 s | 6,710 B |
| `/` (warm) | 0.36 s | 0.40 s | 6,710 B |
| `/geo/br` | 0.63 s | 0.67 s | 6,191 B |
| `/advantages` | 0.40 s | 0.45 s | 5,881 B |
| `/es/` | 0.38 s | 0.43 s | 7,036 B |
| Docs `/` | 0.51 s | 0.51 s | 3,602 B |

All page loads are **under 1 s** end-to-end from this VM. Nothing is over 2 s.

### 3.2 LOW — Tracking health endpoint is slow for 11 bytes
- `https://go.affilayer.com/health` → 200, `{"ok":true}`, but **TTFB 0.90 s** for an 11-byte JSON response (Worker cold start). Not a page-load issue, but a 0.9 s cold start on the tracking Worker is worth noting for click-redirect latency (clicks are the revenue path).

### 3.3 Page weight — Pass
Home page, gzipped transfer (measured live with `curl --compressed`):
- HTML 6.7 KB + `index-CDZP4sAn.js` 99.0 KB + `vendor-react` 18.4 KB + `vendor-supabase` 59.1 KB + `public-BR2UqX4f.js` 9.3 KB + CSS 7.3 KB + logo 0.4 KB + favicon 1.6 KB + Cloudflare email-decode 1.2 KB ≈ **203 KB total**. Well under the 500 KB bar.
- Largest single asset: `index-CDZP4sAn.js` — 334,712 B raw / 99,027 B gzipped. No asset over 500 KB.

### 3.4 Code splitting — Pass
- 13 JS chunks in `dist/assets`: entry 334 KB, vendor-supabase 229 KB, vendor-react 51 KB, public 37 KB, admin 25 KB, affiliate 20 KB, auth 14 KB, advertiser 10 KB, geo 5 KB, blog 5 KB, illustrations 3 KB, charts 1 KB, CSS 34 KB.
- Route chunks are lazy (`React.lazy` + `__vite__mapDeps` in the entry): the home page only pulls entry + vendor + public (+ illustrations) chunks. Dashboard chunks (admin/affiliate/advertiser/auth) are not fetched on public pages.

### 3.5 Render-blocking resources — Pass (one nit)
- Exactly **1 render-blocking stylesheet** (7.3 KB gz) and **1 module script** in the head. No render-blocking fonts or images. The Cloudflare email-decode script sits at the **end of `<body>`** (char 36,241 of 36,286) — not render-blocking.
- **Low nit:** the HTML carries **no `<link rel="modulepreload">`** for the vendor chunks, so they load via a JS-initiated fetch after the entry parses (a waterfall). Adding modulepreload for `vendor-react` would shave roughly 100 ms off cold first paint. Also, hashed assets use `Cache-Control: public, max-age=14400` (4 h) — fine, though immutable hashed assets could use a longer max-age. HTML is correctly `max-age=0, must-revalidate`.

### 3.6 Images right-sized — Pass
- `og-image.png`: 1200×630, 165 KB — correct dimensions; heavy but **never loaded by the page itself** (only by social scrapers via `og:image`).
- `favicon-32x32.png`: 32×32, 860 B. `apple-touch-icon.png`: 180×180, 4.9 KB. `favicon.ico`: 1,613 B. `logo-mark.svg`: 407 B. All correct.

---

## 4. Mobile

### 4.1 Viewport / overflow / hamburger — Pass (static checks only)
- `<meta name="viewport" content="width=device-width, initial-scale=1.0">` on every sampled page (all 10).
- `body { overflow-x: clip; }` in `index.css` — horizontal overflow is contained.
- Hamburger exists: `<button ... class="... xl:hidden" aria-expanded="false" aria-label="Open menu">`; the mobile nav (`<nav aria-label="Mobile">`) is in the source, toggles `aria-expanded`, and closes on link click. It is rendered by React state, so it is **not present in the static HTML** — which is fine functionally (the desktop nav links are all present in the static HTML for crawlers).
- 44 px touch-target rule exists for coarse pointers (see §2.10).

### 4.2 Visual mobile layout — UNVERIFIED
- **Cannot be verified without a viewport resize or a real phone.** The earlier ~390 px check was explicitly never done (browser has no viewport-resize). This remains the one open mobile item: Sojib's own phone check of `affilayer.com` (header, hero, cards, hamburger) is still owed. Static signals are all good (viewport meta, overflow-x clip, hamburger markup, 44 px rule), but **no visual claim is made here**.

---

## 5. Prioritised fix list

| # | Finding | Severity | Fix (one line each) |
|---|---|---|---|
| 1 | H1 reads "SweepstakesNutra" on EN/ES/PT home (§1.6) | **High** | Put a space between the rotator spans, or prerender a single word; re-check H1 text in served HTML. |
| 2 | `.reveal` content invisible without JS (§2.11) | Medium | Make reveal visible by default; hide only when JS is present (or add `is-visible` during prerender). |
| 3 | Trailing-slash duplicates + canonical/sitemap mismatch on /es /pt (§1.7) | Medium | 301 the non-canonical variant; make sitemap and canonical agree. |
| 4 | /login, /register, /app/* crawlable with homepage title, no noindex (§1.8) | Medium | Add `noindex` to auth/app routes. |
| 5 | Docs: fake robots.txt/sitemap (serves homepage HTML), no canonicals, no OG (§1.11) | Medium | Add real `robots.txt` + `sitemap.xml` + canonicals to `apps/docs/` (after the docs DNS is fixed). |
| 6 | Page illustration SVG has no role/aria-label (§2.5) | Low | Add `role="img"` + `aria-label` (or `aria-hidden="true"`). |
| 7 | /pt/affiliates description 171 chars (§1.9) | Low | Trim to ≤160 chars. |
| 8 | llms.txt links to dead docs.affilayer.com (§1.10) | Low | Point at the live docs URL once DNS is fixed. |
| 9 | Touch-target 44 px rule narrowly scoped (§2.10) | Low | Extend to footer links, language switcher, submit buttons. |
| 10 | No modulepreload for vendor chunks; 4 h cache on hashed assets (§3.5) | Low | Add modulepreload for vendor-react; consider immutable long cache. |
| 11 | go/health TTFB 0.90 s cold (§3.2) | Low | Investigate Worker cold start (clicks are the revenue path). |

## 6. What was NOT verified (needs a live browser / real phone)
- Keyboard behaviour: tab order, focus trap, Escape-to-close on the mobile menu.
- Screen-reader announcement of the rotating H1 word.
- Visual mobile layout at ~390 px (header, hero, cards, hamburger) — **still owed, only Sojib's phone can do it**.
- Dashboard/auth form labelling in the live browser (public contact form verified; dashboard forms checked in source only).
- Real Core Web Vitals (LCP/INP/CLS) — no field data and no headless Lighthouse run was possible from this VM; the curl timings above are network timings, not rendering metrics.

## 7. Counts
- Pages sampled for full meta/a11y analysis: 10 (home, about, advantages, geo/br, /es/, /pt/affiliates, contact, faq, blog post, partner) + login + 6 docs pages.
- Sitemap URLs checked for 200: 50/50.
- JSON-LD blocks validated: 10/10 valid JSON.
- hreflang targets verified in sitemap: all.
- Contrast pairs computed: 21 — all pass AA 4.5:1 except none (worst passing pair: dashboard link amber-700 on white, 5.02:1; worst overall: slate-500 on navy 4.08:1, but unused on navy).
- Home page transfer: ~203 KB gzipped; TTFB 0.36–0.63 s; total <0.7 s.
