# AffiLayer — LIVE SMOKE AUDIT (Agent A)

**Audit type:** Live smoke audit — dry run, read-only. No changes made, no live payments, demo mode only.
**Date/time:** Saturday 2026-11-07, 21:40–21:47 +06 (Asia/Dhaka) — checks run 15:40–15:47 UTC.
**Auditor:** Agent A (live smoke).
**Targets:**
- Main site: https://affilayer.com — Cloudflare Pages deployment `8c6233fc`, gold/navy theme, 50 sitemap URLs.
- Tracking: https://go.affilayer.com (Worker `affilayer-tracking`).
- Docs: https://affilayer-docs.pages.dev (Pages project `affilayer-docs`).
- Known-down target: https://docs.affilayer.com (CNAME missing — recorded as a finding, not re-diagnosed from scratch).

**Method:** `curl` from the audit VM (egress via proxy — works for affilayer.com and Cloudflare hosts) plus page-text reads. No live browser was available to this agent, so no screenshots, no rendered-DOM checks, and no login attempts were made. Login flows were verified separately by the parent agent in a live browser at 21:36–21:37 +06 (all 4 checks passed) and are cited, not re-tested, here.

## Verdict summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 0 |
| Low | 3 |
| Pass | all other checks |

**Bottom line:** the live site is healthy. All 50 sitemap URLs return 200 with real content, tracking redirects work end to end, the docs site serves on its pages.dev URL, SSL is valid everywhere, and every timed response is under 1 second. The single High finding is the known-down `docs.affilayer.com` (DNS record never created). The three Low findings are a prerender gap on auth/app routes, HEAD requests 404ing on the tracking worker, and Cloudflare email-obfuscation rewriting mailto links.

---

## 1. Sitemap crawl — all 50 URLs

Source: `https://affilayer.com/sitemap.xml` — HTTP 200, 7,122 bytes, 50 `<loc>` entries, single `lastmod` 2026-11-07 on all URLs.
Method: `curl -L` per URL; status, byte size, `<title>`, and visible-text length (HTML stripped of tags/scripts/styles, whitespace removed).

**Result: 50/50 HTTP 200. 0 failures. 0 empty pages.** Smallest visible text: /contact 1,696 chars; largest: /faq 4,808 chars. Every URL has a distinct, correct title.

| Path | Status | Bytes | Visible text | Title |
|---|---|---|---|---|
| `/` | 200 | 36,317 | 3,562 | AffiLayer — Global CPA Affiliate Network |
| `/about` | 200 | 20,268 | 2,428 | About AffiLayer | Global CPA Affiliate Network |
| `/advantages` | 200 | 26,230 | 2,926 | Why AffiLayer | Advantages of a Transparent CPA Network |
| `/advertisers` | 200 | 26,220 | 2,319 | For Advertisers | Publish CPA Offers on AffiLayer |
| `/affiliates` | 200 | 28,134 | 2,543 | For Affiliates | Earn with CPA Offers &amp; SmartLink |
| `/how-it-works` | 200 | 21,064 | 2,148 | How AffiLayer Works | From Signup to Payout |
| `/faq` | 200 | 31,472 | 4,808 | FAQ | AffiLayer CPA Affiliate Network |
| `/blog` | 200 | 20,700 | 1,748 | Blog | AffiLayer |
| `/blog/affilayer-is-live` | 200 | 19,256 | 2,605 | AffiLayer is live: what the network offers on day one | AffiLayer Blog |
| `/contact` | 200 | 20,528 | 1,696 | Contact AffiLayer | Support &amp; Enquiries |
| `/partner` | 200 | 21,408 | 2,097 | Become a Partner | AffiLayer |
| `/white-label` | 200 | 22,741 | 2,352 | White Label | Run Your Own Network on AffiLayer |
| `/advertise` | 200 | 24,871 | 2,029 | Advertise with AffiLayer | Pay for Reviewed Conversions |
| `/terms` | 200 | 20,097 | 2,452 | Terms of Service | AffiLayer |
| `/privacy` | 200 | 19,469 | 1,998 | Privacy Policy | AffiLayer |
| `/geo` | 200 | 30,499 | 2,375 | AffiLayer by Country | Global CPA Affiliate Network |
| `/geo/us` | 200 | 36,197 | 3,174 | CPA Affiliate Network in United States | AffiLayer |
| `/geo/uk` | 200 | 36,222 | 3,189 | CPA Affiliate Network in United Kingdom | AffiLayer |
| `/geo/ca` | 200 | 35,967 | 3,069 | CPA Affiliate Network in Canada | AffiLayer |
| `/geo/au` | 200 | 36,053 | 3,112 | CPA Affiliate Network in Australia | AffiLayer |
| `/geo/de` | 200 | 36,033 | 3,107 | CPA Affiliate Network in Germany | AffiLayer |
| `/geo/fr` | 200 | 35,993 | 3,083 | CPA Affiliate Network in France | AffiLayer |
| `/geo/br` | 200 | 36,000 | 3,088 | CPA Affiliate Network in Brazil | AffiLayer |
| `/geo/in` | 200 | 35,966 | 3,068 | CPA Affiliate Network in India | AffiLayer |
| `/es` | 200 | 36,955 | 4,017 | AffiLayer — Red global de afiliados CPA |
| `/es/affiliates` | 200 | 28,623 | 2,887 | Para afiliados | Gana con ofertas CPA y SmartLink |
| `/es/advertisers` | 200 | 26,653 | 2,647 | Para anunciantes | Publica ofertas CPA en AffiLayer |
| `/es/how-it-works` | 200 | 21,585 | 2,422 | Cómo funciona AffiLayer | Del registro al pago |
| `/es/geo` | 200 | 30,931 | 2,620 | AffiLayer por país | Red global de afiliados CPA |
| `/es/geo/us` | 200 | 36,816 | 3,593 | Red de afiliados CPA en Estados Unidos | AffiLayer |
| `/es/geo/uk` | 200 | 36,784 | 3,586 | Red de afiliados CPA en Reino Unido | AffiLayer |
| `/es/geo/ca` | 200 | 36,618 | 3,497 | Red de afiliados CPA en Canadá | AffiLayer |
| `/es/geo/au` | 200 | 36,647 | 3,501 | Red de afiliados CPA en Australia | AffiLayer |
| `/es/geo/de` | 200 | 36,679 | 3,537 | Red de afiliados CPA en Alemania | AffiLayer |
| `/es/geo/fr` | 200 | 36,616 | 3,495 | Red de afiliados CPA en Francia | AffiLayer |
| `/es/geo/br` | 200 | 36,598 | 3,488 | Red de afiliados CPA en Brasil | AffiLayer |
| `/es/geo/in` | 200 | 36,571 | 3,484 | Red de afiliados CPA en India | AffiLayer |
| `/pt` | 200 | 36,957 | 4,030 | AffiLayer — Rede global de afiliados CPA |
| `/pt/affiliates` | 200 | 28,678 | 2,897 | Para afiliados | Ganhe com ofertas de CPA e SmartLink |
| `/pt/advertisers` | 200 | 26,668 | 2,626 | Para anunciantes | Publique ofertas de CPA na AffiLayer |
| `/pt/how-it-works` | 200 | 21,599 | 2,432 | Como funciona a AffiLayer | Do cadastro ao pagamento |
| `/pt/geo` | 200 | 30,945 | 2,609 | AffiLayer por país | Rede global de afiliados CPA |
| `/pt/geo/us` | 200 | 36,847 | 3,583 | Rede de afiliados CPA em Estados Unidos | AffiLayer |
| `/pt/geo/uk` | 200 | 36,784 | 3,557 | Rede de afiliados CPA em Reino Unido | AffiLayer |
| `/pt/geo/ca` | 200 | 36,645 | 3,491 | Rede de afiliados CPA em Canadá | AffiLayer |
| `/pt/geo/au` | 200 | 36,710 | 3,519 | Rede de afiliados CPA em Austrália | AffiLayer |
| `/pt/geo/de` | 200 | 36,687 | 3,516 | Rede de afiliados CPA em Alemanha | AffiLayer |
| `/pt/geo/fr` | 200 | 36,618 | 3,477 | Rede de afiliados CPA em França | AffiLayer |
| `/pt/geo/br` | 200 | 36,617 | 3,475 | Rede de afiliados CPA em Brasil | AffiLayer |
| `/pt/geo/in` | 200 | 36,596 | 3,470 | Rede de afiliados CPA em Índia | AffiLayer |

**Severity: Pass** — every sitemap URL live with real content and a unique title.

---

## 2. Page spot-checks (one line each)

Verified from the crawl above plus content reads:

- `/` (home) — 200, 36,317 B. Hero "Turn Dating traffic into commission." plus "Try the public demo →" link and demo credentials note. **Pass.**
- `/partner` — 200, 21,408 B. "Become a Partner", 3-step start, "no public partner directory yet". **Pass.**
- `/white-label` — 200, 22,741 B. "Your brand on the front. Our engine underneath." plus includes list. **Pass.**
- `/advertise` — 200, 24,871 B. "Pay for conversions you have reviewed. Nothing else." plus 4-step campaign flow. **Pass.**
- `/about` — 200, 20,268 B. Own illustration + highlights present in HTML. **Pass.**
- `/advantages` — 200, 26,230 B. Own illustration + 3-card highlights present in HTML. **Pass.**
- `/faq` — 200, 31,472 B, largest visible text on the site (4,808 chars). **Pass.**
- `/blog` — 200, 20,700 B; `/blog/affilayer-is-live` — 200, 19,256 B. **Pass.**
- `/contact` — 200, 20,528 B. **Pass.**
- `/terms` — 200, 20,097 B; `/privacy` — 200, 19,469 B. **Pass.**
- `/geo` index — 200, 30,499 B, "AffiLayer by Country". All 8 country pages 200 (35,966–36,222 B) with correct country titles (US/UK/CA/AU/DE/FR/BR/IN). **Pass.**
- Localised spot-checks (6+): `/es/` 200 (Spanish title "Red global de afiliados CPA"), `/es/affiliates`, `/es/advertisers`, `/es/how-it-works`, `/es/geo`, `/es/geo/br` 200; `/pt/` 200 (Portuguese title "Rede global de afiliados CPA"), `/pt/affiliates`, `/pt/advertisers`, `/pt/how-it-works`, `/pt/geo`, `/pt/geo/br` 200. All 26 localised sitemap URLs returned 200 in the full crawl. **Pass.**

---

## 3. Tracking (`go.affilayer.com`)

| Check | Result | Evidence |
|---|---|---|
| `GET /health` | **Pass** — 200 | Body exactly `{"ok":true}`, 0.43–0.77 s |
| `GET /c/AFF123/offer-a?sub1=test` | **Pass** — 302 | `Location: https://example.com/landing-a?click_id=clk_be4d51b41f04d14ec4180bdf`, 0.70 s |
| `GET /s/AFF123` (SmartLink) | **Pass** — 302 | `Location: https://example.com/landing-b?click_id=clk_166a6dd1f1f79fe768df160d`, 0.67 s |
| `GET /c/AFF123/nope` (unknown offer) | **Pass** — 404 JSON | Body `{"error":"offer not found"}` (27 B) — clean failure, no redirect, no 500 |

Notes:
- The two live clicks redirect to `example.com/landing-a` and `example.com/landing-b`. These are the demo offers' configured landing URLs — expected in demo mode (no real offers exist yet). **Info, not a defect:** do not mistake these for live offer traffic.
- Both click IDs are unique per request (`clk_be4d…`, `clk_166a…`) — click-ID generation is live.

---

## 4. Docs site

| URL | Status | Bytes | Content |
|---|---|---|---|
| `https://affilayer-docs.pages.dev/` | 200 | 3,602 | Title "AffiLayer Docs — Getting started, tracking, postbacks, payouts, API"; nav lists all 5 sections. **Pass.** |
| `/getting-started` | 200 | 3,525 | Title "Getting started — AffiLayer Docs". **Pass.** |
| `/tracking` | 200 | 4,904 | Title "Tracking — AffiLayer Docs"; `<h1>` present. **Pass.** |
| `/postbacks` | 200 | 4,158 | Title "Postbacks — AffiLayer Docs". **Pass.** |
| `/payouts` | 200 | 3,423 | Title "Payouts — AffiLayer Docs". **Pass.** |
| `/api` | 200 | 5,344 | Title "API — AffiLayer Docs". **Pass.** |

### Finding F-1 (High) — `docs.affilayer.com` DOWN: DNS record never created

- **Evidence:** VM `curl https://docs.affilayer.com/` → HTTP 000, curl exit 52 ("Empty reply from server" via the egress proxy — the name does not resolve). Live-browser checks by the parent at 20:00, 20:11 and 20:20 +06 all returned `DNS_PROBE_STARTED` / "DNS address could not be found".
- **Known cause (established by the parent at 21:37 +06, not re-diagnosed here):** the custom domain `docs.affilayer.com` IS attached to the `affilayer-docs` Pages project (domain id `89cf5248-…`, created 2026-11-07 13:56:54 UTC) but its status is `pending` with verification data `"CNAME record not set"`. The DNS CNAME `docs → affilayer-docs.pages.dev` was never created in the `affilayer.com` zone, so Cloudflare cannot verify or serve the domain. The project's live domains list contains only `affilayer-docs.pages.dev`.
- **Impact:** every link to `docs.affilayer.com` is dead; the docs are reachable only on the pages.dev URL. The docs content itself is complete and live (see table above).
- **Fix:** add the CNAME in the Cloudflare dashboard — DNS → Records → Add record → CNAME, name `docs`, target `affilayer-docs.pages.dev`, Proxied ON. Note: the `dns:write` scope is NOT requestable through the wrangler OAuth client (attempt at 21:36 returned `invalid_scope`), so this must be done in the dashboard by the owner, or with a dashboard-created API token that has DNS:Edit.
- **Severity: High** (a whole public property is unreachable; content itself is safe).

---

## 5. SEO / AI-search files and assets

| URL | Status | Size | Note |
|---|---|---|---|
| `/robots.txt` | 200 | 66 B, `text/plain` | `User-agent: * / Allow: / / Sitemap: https://affilayer.com/sitemap.xml` — correct and complete. **Pass.** |
| `/llms.txt` | 200 | 3,135 B | **Pass.** |
| `/llms-full.txt` | 200 | 5,328 B | **Pass.** |
| `/favicon.svg` | 200 | 979 B, `image/svg+xml` | **Pass.** |
| `/og-image.png` | 200 | 165,317 B, `image/png` | **Pass.** |

---

## 6. SSL / HTTPS

`curl -I` (HEAD) with certificate verification — `ssl_verify_result=0` (valid) on all hosts:

| Host | Result |
|---|---|
| `https://affilayer.com/` | 200, cert valid. **Pass.** |
| `https://www.affilayer.com/` | 200, cert valid. **Pass.** |
| `https://go.affilayer.com/health` | HEAD → 404 (see F-3), cert valid. **Pass for TLS.** |
| `https://affilayer-docs.pages.dev/` | 200, cert valid. **Pass.** |
| `https://docs.affilayer.com/` | Not testable — name does not resolve (see F-1). |

---

## 7. Login page

- `GET https://affilayer.com/login` → **200**, 36,317 B.
- **Finding F-2 (Low) — auth/app routes serve the generic SPA shell, not route content.** `/login`, `/register`, `/app/affiliate`, `/app/advertiser` and `/app/admin` all return the same 36,317-byte document with the homepage title "AffiLayer — Global CPA Affiliate Network". Byte-level diff of `/` vs `/login` shows only 132 differing bytes, all of them the per-request Cloudflare email-obfuscation token (see F-4). The served HTML contains the strings `demo-publisher`, `demo-advertiser`, `1234` and "Try the public demo →" once each — but those come from the homepage hero, not from a login form: the strings `Demo mode`, `Email or demo username`, `Incorrect demo password` and `affiliate@demo` do NOT appear in the served HTML. The login form and demo box render client-side from the JS bundle.
- **Functional impact: none observed.** The parent verified the login flows in a live browser at 21:36–21:37 +06: demo box present on /login; `demo-publisher / 1234` lands in the Affiliate demo dashboard; `demo-advertiser / 1234` lands in the Advertiser demo dashboard; both show the Demo badge and banner; a wrong password is rejected with "Incorrect demo password.". So this is a prerender/SEO and no-JS robustness gap only: a no-JS visitor (or a crawler) sees the homepage shell on /login, and /login carries the homepage's title/meta instead of its own.
- **Fix (optional):** prerender `/login` (and `/register`) like the 50 public routes, or at minimum give them route-specific `<title>`/meta in the shell.
- **Severity: Low.**

---

## 8. Response timing

Threshold used: 2 s. All measurements from the audit VM (via proxy).

| URL | time_total | TTFB |
|---|---|---|
| Homepage `/` | 0.61 s | 0.53 s |
| `/geo/br` | 0.61 s | 0.54 s |
| `/sitemap.xml` | 0.45 s | 0.40 s |
| `go.affilayer.com/health` | 0.43 s (0.77 s on first probe) | 0.43 s |
| Live click `/c/AFF123/offer-a` | 0.70 s | — |
| SmartLink `/s/AFF123` | 0.67 s | — |

**Severity: Pass** — nothing over 2 s; slowest observed response was 0.77 s (first health probe, likely cold Worker isolate).

---

## Findings register

### F-1 — High — `docs.affilayer.com` down (DNS CNAME never created)
Evidence: VM curl HTTP 000 / exit 52; parent live-browser `DNS_PROBE_STARTED` at 20:00, 20:11, 20:20 +06. Pages API (parent, 21:37): domain attached, status `pending`, verification `"CNAME record not set"`. Fix: owner adds CNAME `docs → affilayer-docs.pages.dev` (Proxied) in the Cloudflare dashboard. Docs content is live on `affilayer-docs.pages.dev` meanwhile.

### F-2 — Low — Auth/app routes serve the generic SPA shell
Evidence: `/login`, `/register`, `/app/affiliate`, `/app/advertiser`, `/app/admin` all 200 / 36,317 B with homepage title; `/` vs `/login` differ in only 132 bytes (rotating cfemail token). Demo-box text absent from served HTML. Functional login verified live by parent — no user-facing breakage. Fix (optional): prerender `/login` and `/register`.

### F-3 — Low — HEAD requests to the tracking worker return 404
Evidence: `curl -I https://go.affilayer.com/health` → HTTP 404, while `GET` on the same URL → 200 `{"ok":true}`. The Worker implements GET only. Impact: uptime monitors that probe with HEAD will report the tracker down. Fix (optional): answer HEAD on `/health` with 200 and no body.

### F-4 — Low (info) — Cloudflare email protection rewrites mailto links in served HTML
Evidence: served HTML contains `/cdn-cgi/l/email-protection#…` links and `<span class="__cf_email__" data-cfemail="…">[email&#160;protected]</span>` instead of plain `mailto:` addresses (partner@ / support@). Links still work in browsers (decoded client-side). Impact: raw-HTML copy/paste and naive scrapers see obfuscated addresses. Fix (optional): toggle off in Cloudflare → Scrape Shield → Email Address Obfuscation if plain mailto links are wanted.

---

## Limitations of this audit

- No live browser was available to this agent: no screenshots, no rendered-DOM or visual checks, no interaction testing. Rendered behaviour (hero rotator, hamburger menu, loader colour, illustrations) was verified by the parent in earlier live-browser checks and is not re-proven here.
- No login attempt was made by this agent; login flows are cited from the parent's live-browser verification at 21:36–21:37 +06.
- No backend, database, Supabase, or payment testing — out of scope for a smoke audit (demo mode only).
- Timing was measured from the audit VM through an egress proxy; real-user timing will differ.
- The VM's DNS/proxy layer returns "Empty reply" for unresolvable names; the `docs.affilayer.com` failure is corroborated by the parent's live-browser DNS errors, not by the VM result alone.

## Raw evidence

- `results.tsv` — per-URL status/bytes/visible-text/title for all 50 sitemap URLs (same directory as this report).
- `sitemap.xml` — fetched copy (7,122 B, 50 URLs).
- `urls.txt` — the 50 sitemap URLs.
