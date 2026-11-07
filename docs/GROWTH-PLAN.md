# AffiLayer Growth Plan — Research + Phased To-Do List

**Date:** 7 November 2026
**Site:** https://affilayer.com — a new global CPA affiliate network, operated by MarketSync Global LLC, New Mexico, USA
**Status of this document:** research only. No site code was changed to produce it.
**Brand rule (Sojib, 7 Nov 2026):** AffiLayer is an **international** brand, NOT Bangla/Bangladesh. No Bangladesh/Bangla focus in copy, country pages, or languages.
**Honesty rule (standing):** no invented stats, testimonials, client logos, offer counts, payout totals, or earnings promises — anywhere, including this plan's content recommendations.

---

## 1. Where we are (verified against the repo + live site, 7 Nov 2026)

**Live site:** affilayer.com loads. DNS is fixed (apex + www → Pages, go → tracking Worker).
**What is deployed vs local-only — this matters for everything below:**

| Item | State |
|---|---|
| Live Pages deploy | The 7 Nov ~07:55 deploy (pre-polish). The logo/SEO/polish builds and the geo build are **local-only, not live**. |
| `/sitemap.xml` and `/llms.txt` on the live site | **Both return the homepage, not the files** (checked live 7 Nov 10:27 UTC). The SEO foundation exists in the repo but is not served yet. Deploy is the single unblocker. |
| `go.affilayer.com/health` | Still 522 (route-pattern bug; fix committed locally, redeploy pending). Tracking links do not work on the `go` subdomain until the redeploy. |
| Logo, favicon, OG image | Built locally (commit `a5d0cbb`): layered-"A" mark, orange→yellow on navy. Not live. |
| Prerendered public pages | 12 pages, built locally (`npm run build:live`). Not live. |
| Per-page meta + OG/Twitter + JSON-LD | Done in code (`apps/web/src/lib/seo.ts`): Organization, WebSite, WebPage, FAQPage, BlogPosting, Breadcrumbs. Not live. |
| `robots.txt` | Exists in repo, allows all, points at sitemap. Not live. |
| `llms.txt` / `llms-full.txt` | Exist in repo, honest (states demo mode, small catalogue, Net30). Not live. |
| Geo pages (US/UK/CA/AU/DE/FR/BR/IN) + `/geo` index | **In progress right now** (uncommitted work in the repo: `geo-data.ts`, `pages/geo.tsx`). Sitemap still lists only the original 12 URLs. |
| Multilingual EN + ES + PT (public pages only) | **In progress right now** (uncommitted: `i18n-dict.ts`, `i18n.tsx`, hreflang in `seo.ts`). Dashboards stay English-only by design. |
| FAQ | 17 questions in 5 groups (`faq-data.ts`), with FAQPage JSON-LD. |
| Blog | 1 real post (`affilayer-is-live`, 7 Nov 2026). |
| Design system + funnels | Done locally (commit `a66fd6d`): 34-icon set, sticky header + mobile menu, footer trust row, hero illustration + parallax, First Steps checklists, affiliate/advertiser funnels. Not live. |
| Google Search Console / Bing Webmaster | **Not set up.** No property, no verification, no sitemap submitted. |
| Social profiles | **None found anywhere** — no X/Twitter, LinkedIn, Facebook, Instagram, YouTube, Telegram or Discord links in the site code. No social presence was verified to exist. |
| Backlinks | None known. No directory listings known. |
| Ads (SEA) | No Google Ads account, no conversion tracking. |
| Supabase backend | Deferred by Sojib. Site runs in demo mode; demo data is labelled as such. |

**The one-sentence summary:** the on-page SEO work is unusually good for a one-day-old site — but almost none of it is live yet, Google has no record of the site at all, and there is zero off-site footprint. The next 90 days are about (1) getting the built work deployed, (2) getting Google/Bing to know the site exists, and (3) earning the first real mentions. Nothing here will produce meaningful organic traffic before month 3, and that is normal (see §2.2).

---

## 2. Research findings

### 2.1 Google Search Console — setup for a Cloudflare Pages site

**Verification method — use DNS TXT, not the HTML file.** Search Console offers four verification methods; for a Cloudflare Pages site the DNS TXT record is fastest: no deploy needed, no build, no source change, and it verifies the whole domain (apex + www + subdomains) in one property. The HTML-file method works too but costs a deploy cycle every time it is needed, and the file must stay in `public/` forever. ([dev.to — verifying custom domains in GSC with Cloudflare DNS](https://dev.to/morinaga/verifying-three-custom-domains-in-google-search-console-with-cloudflare-dns-2jfh); [GSC setup SOP, webmanagers.com](https://webmanagers.com/assets/files/swm-m09-2-search-console-setup-print.pdf))

Exact steps:

1. Sign in at search.google.com/search-console with the **organisational Google account** (a role account the business controls, not a personal Gmail — this is a decision Sojib needs to make; see Phase 1).
2. Add property → choose **Domain** (not URL-prefix) → enter `affilayer.com` (bare domain, no https, no www).
3. Copy the TXT record Google shows (`google-site-verification=…`).
4. In Cloudflare dashboard → affilayer.com → DNS → Records → Add TXT, name `@`, value pasted exactly, TTL Auto. **Do not touch the existing MX/SPF/mail records.**
5. Verify the record is live first (`dig TXT affilayer.com` or Google's own check), then click Verify in Search Console. Propagation is usually minutes on Cloudflare.
6. **Leave the TXT record in place forever.** Removing it silently revokes ownership.
7. Submit the sitemap: left menu → Sitemaps → enter `https://affilayer.com/sitemap.xml`. Status should read Success within a day. "Couldn't fetch" means the URL is wrong or the site blocks crawlers — for AffiLayer that would mean the sitemap still isn't deployed (see §1: it currently returns the homepage).

**Bing Webmaster Tools** (same day, same pattern): sign in, add `affilayer.com`, verify with a DNS TXT record the same way, submit the same sitemap. Bing also supports **IndexNow** (instant URL notification instead of waiting for a crawl): place the IndexNow API key file at the site root and ping Bing/Yandex on new/changed URLs. Worth doing once, low effort, but it is a nice-to-have, not a launch blocker. ([GSC API launch walkthrough, mjunaidkhalid.com](https://mjunaidkhalid.com/2026/09/29/google-search-console-api/))

**What to monitor in the first 90 days (weekly, 15 minutes):**

| Report | What to look for | What "normal" looks like for a new domain |
|---|---|---|
| Pages (indexation) | Indexed count vs sitemap count; "Crawled — currently not indexed" and "Discovered — currently not indexed" | 0 indexed at first; a handful within 2–4 weeks. "Not indexed" on most URLs early on is normal, not a bug. |
| Performance | Impressions, clicks, average position, top queries | Months 1–2: 12–92 impressions, 0 clicks is typical (see §2.2). First clicks come from brand searches ("affilayer") and long-tail geo terms. |
| Core Web Vitals | URL groups in Good / Needs improvement / Poor | Will show "not enough data" until real Chrome traffic exists. Do not panic; use PageSpeed Insights lab data until then. |
| Mobile Usability | Any errors (text too small, clickable elements too close, content wider than screen) | Must be zero errors. Fix any error the week it appears. |
| Manual Actions / Security | Any entry at all | Must stay empty. Any entry here is a stop-everything event. |
| Links | Top linked pages, top linking sites | Empty for months. First entries will be directories (see §2.9). |

**Confidence:** high. GSC mechanics are stable and well documented. One caveat: Google changes the Search Console UI occasionally; the report names above are current as of Nov 2026.

### 2.2 SEO for a new domain with zero authority — realistic expectations

Google has never officially confirmed a "sandbox", and John Mueller has repeatedly denied a formal one — but the observed effect is real and consistent across independent data: new domains rank slowly for months even with good content. Leaked 2024 Google documentation describes a `hostAge` attribute used to "sandbox fresh spam". Treat the debate as settled in practice: **a new domain is on probation for roughly 6–12 months.** ([blogpipeline.com — sandbox data, 4-month-old site](https://blogpipeline.com/blog/google-sandbox-new-domain-how-long/); [seosavages.com — ranking timelines](https://www.seosavages.com/glossary/how-long-does-it-take-to-rank/); [satelo.io — new-site ranking timeline](https://satelo.io/blog/how-long-new-website-to-rank/))

Realistic AffiLayer timeline (all figures are for a new domain publishing consistently):

| Period | What to expect |
|---|---|
| Weeks 1–4 | Site gets crawled and indexed (days to a few weeks once the sitemap is submitted). Brand name "AffiLayer" starts ranking. Near-zero impressions. |
| Months 2–4 | Impressions appear for long-tail terms (geo pages, "new CPA network", "CPA network with SmartLink"). Positions 40+. 0–1 clicks/month. |
| Months 4–8 | Long-tail traffic begins: tens of clicks/month if publishing steadily. First page-1 rankings for very low-competition terms (own brand, specific geo + "CPA network"). |
| Months 6–12 | Meaningful organic traffic only if content + a few real backlinks accumulate. Competitive head terms still out of reach. |
| Months 12+ | Aged-domain behaviour begins; content quality and links matter more than age. |

Supporting data: Ahrefs' 2025 page-age study found only **1.74% of new pages reach the top 10 within a year** (6.11% in a cleaner English-pages sample); the average #1 page is about 5 years old. Google's own guidance to businesses hiring an SEO is to expect **four months to a year** before improvements show benefit. ([seosavages.com](https://www.seosavages.com/glossary/how-long-does-it-take-to-rank/); [satelo.io](https://satelo.io/blog/how-long-new-website-to-rank/))

**What this means for keyword strategy:**

- **Do not target "CPA network" as a head term in year one.** It is dominated by MaxBounty, CrakRevenue, ClickDealer, Perform[cb], AdCombo and others with years of authority. A page targeting it is still worth having (the home page already does), but it will not rank soon.
- **Winnable in months 1–6:** brand terms ("AffiLayer", "AffiLayer CPA network", "AffiLayer review" — only once real reviews exist), long-tail geo terms ("CPA affiliate network in Germany", "CPA network Brazil", "CPA network Canada"), product terms ("CPA network with SmartLink", "CPA network manual payouts", "CPA network Net30"), and question terms ("how to join a CPA network", "what is a CPA network", "CPA vs CPL vs CPS").
- **Winnable in months 6–12:** vertical pages ("dating CPA offers", "nutra CPA network", "iGaming CPA network"), comparison pages (only honest ones — see §2.8), and Spanish/Portuguese long-tail once the multilingual pages are indexed.
- **Internal linking structure (already mostly right, keep it):** home → /affiliates + /advertisers + /geo + /blog + /faq; every geo page links back to /geo, /affiliates, /advertisers; every blog post links to the relevant pillar page and one geo page; footer links to all pillars. Rule: **every public page reachable within 2 clicks of home, and every new page linked from at least one older indexed page** (orphan pages get crawled late or never).

**Confidence:** high on the timeline shape; medium on the exact month counts (they vary by niche and by how much is published). The "CPA network" niche is competitive — assume the slow end of every range.

### 2.3 Targeted-audience implementation — affiliates vs advertisers

The two audiences search differently, worry differently, and convert on different proof. The site already has separate /affiliates and /advertisers pages and separate funnels (built 7 Nov). The content plan must keep them separate — a page that tries to speak to both converts neither.

**Affiliates** (the traffic side; they are the volume the network needs first):

| What they search for | What they worry about | What converts them |
|---|---|---|
| "best CPA networks for beginners", "CPA offers [vertical]", "how to make money with CPA", "CPA network with SmartLink", "CPA network [country]" | Will I get paid? Is this network a scam? Are payouts on time? | Honest payout terms (manual, Net30 — already stated), a visible approval process, real offer browsing, a named support contact, and **payment proof from real users once it exists** (never fabricated). |
| "CPA vs CPL vs CPS", "what is EPC", "how tracking links work" | Will my clicks be tracked fairly? | The tracking explainer, the auditable ledger story, sub-parameter docs. |

**Advertisers** (the money side; fewer of them, each worth more):

| What they search for | What they worry about | What converts them |
|---|---|---|
| "how to launch a CPA offer", "affiliate network for advertisers", "CPA network fraud protection", "how to find affiliates for my offer" | Will affiliates send junk traffic? Will I pay for fraud? | Approval flows (advertisers approve affiliates), conversion review before payment, caps, fraud signals + human review, the ledger. |
| "CPA network pricing", "affiliate network fees" | Hidden fees, lock-in | State plainly what AffiLayer charges (currently: nothing stated publicly — **a decision is needed**: is there a network fee, revenue share, or is it free at launch? Do not publish a price that doesn't exist). |

**Implementation rules:**

1. Every audience page ends with **one** primary CTA for that audience (affiliates → browse offers / build a link; advertisers → create offer). The current funnels already do this — keep it.
2. Never mix audience proof: affiliate pages must not promise advertisers' results and vice versa.
3. Content calendar splits ~60/40 affiliates/advertisers early (affiliates are the larger, easier-to-reach audience; advertisers come once affiliates exist).
4. The dashboard "First Steps" checklists (built 7 Nov) are the in-product half of the funnel — the content half is the blog + pillar pages in §2.8.

### 2.4 Global traffic — how a new CPA network gets its first traffic honestly

SEO will not deliver traffic for months. The first traffic must come from places where affiliate marketers already gather. All of the below are white-hat; anything grey-hat is flagged as such.

**Where affiliate marketers actually gather (verified via 2026 directory/forum roundups):**

- **AffiliateFix** — free, one of the largest CPA forums (100,000+ members). Has an official network directory/thread area. First stop for a new network. ([bloggersneed.com — forums 2026](https://bloggersneed.com/best-affiliate-marketing-forums/); [toolsurf.com — forum comparison](https://www.toolsurf.com/affiliate-marketing-forum-2026/))
- **affLIFT** — $20–25/month (or $250/year, $350 lifetime). Beginner/intermediate media buyers, "Follow Alongs", and crucially **network reps hang out there and approve affiliates directly**. A new network with an active rep gets signups. ([ecomobi.com — listing sites](https://ecomobi.com/top-affiliate-network-listing-websites/))
- **STM Forum / Affiliate World Forum** — ~$99/month. Advanced media buyers. Only worth it once the network has real offers and can answer hard questions; not a month-1 spend.
- **r/AffiliateMarketing** (Reddit) — free. Good for answering questions and sanity checks; blatant self-promotion gets removed. Contribute first, mention the network only where genuinely relevant.
- **BlackHatWorld** — free, large, but mixed black/grey/white hat. **Flag: grey-hat territory.** Lurk for market intelligence; do not buy services there, do not buy links there, do not promote aggressively. Any "guaranteed traffic" seller there is a scam or a bot farm.
- **Affiliate World conferences** (Bangkok, Barcelona, etc.) — expensive; a later-stage channel, not year-one.

**Directories (listings = first backlinks + first discovery):**

- **AFFindex** — CPA network directory, 2026 edition lists networks by vertical/GEO. ([affindex.com](https://affindex.com/en/affiliate-networks))
- **Affpaying** — reputation/review platform for networks; affiliates check it before joining. A listing with no reviews is neutral; a listing with fake reviews is fatal. **Never write or buy reviews here.**
- **Affbank** — network directory + offer search (50,000+ offers indexed); also a forum.
- **OfferVault** — the largest offer search engine; listing requires real offers in the system, so this comes after the Supabase backend and first real offers exist.
- **Affnext** — curated, manually vetted; only lists established players — a later target, not an application for month 1.

**What a new network should actually do in the first 90 days (in order):**

1. Deploy the site properly (the unblocker for everything).
2. List on AFFindex + Affpaying + Affbank with honest, complete profiles (founded 2026, new network, small catalogue — say so).
3. Open a free AffiliateFix account as an official rep; answer questions; start one "Follow Along"-style thread about building the network honestly (transparency is the differentiator — the site already leans on it).
4. Publish 1 blog post per week (see §2.8) and share each once in the relevant community — no spam, one share per post, in the right thread.
5. Once the first real affiliates exist, ask them (once, politely) to leave an honest review on Affpaying. Never incentivise reviews.

**Grey-hat / scams to avoid (flagged explicitly):** bought traffic, paid-to-click, incentivised signups (also prohibited by AffiLayer's own Terms §5), bot traffic, "guaranteed 10,000 visitors" sellers, Fiverr SEO gigs promising page 1 in 30 days, and any service selling "CPA network approval" or fake payment screenshots. All of these either violate Google's policies, violate the network's own Terms, or will get the network listed as a scam on Affpaying — which is effectively a death sentence for a new network.

### 2.5 Full branding + footprint — what a credible network's footprint looks like

A credible network is verifiable from five directions. AffiLayer currently has two of the five.

| Footprint item | State | Notes |
|---|---|---|
| Domain + live site | ✅ Done | affilayer.com, SSL, DNS correct. |
| Professional email | ✅ Done | support@affilayer.com mailbox verified to exist (Namecheap Private Email). Also hello@ and partner@ exist. Use support@ everywhere; do not invent other addresses. |
| Logo + visual identity | ✅ Done (local) | Layered-"A", favicon, OG image. Not live yet. |
| About / operator identity | ✅ Done | "Operated by MarketSync Global LLC, New Mexico, USA" on About + footer + Terms. Good — this is the single most important trust signal for a new network. |
| Social profiles | ❌ None verified | No links on the site; no profiles were found. **Do not claim profiles that don't exist.** Create X + LinkedIn company pages (Phase 1), link them from the footer only after they exist. |
| Directory listings | ❌ None | See §2.4. |
| Reviews / reputation | ❌ None (correctly) | Zero reviews is honest for a 1-day-old network. The first real reviews must come from real users, unprompted or politely asked once. |
| Press / contact page | Partial | /contact exists. No press kit; add a one-page brand kit (logo, colours, boilerplate) in Phase 2 — cheap and useful for directories. |
| Consistent entity data | ⚠️ Check | Organisation schema says New Mexico, USA; footer and Terms agree. Keep every new listing identical (same company name, same support email, same domain). Inconsistent entity data across directories is a trust and SEO problem. |
| Google Business Profile | Not applicable | No physical office open to the public; do not create one (a fake address would violate Google's guidelines). |

**Branding rule for all new content:** same logo, same orange→yellow gradient, same voice (plain, honest, no hype). Every new page, listing, and profile must read like it came from the same company — because directories and forums cross-check.

### 2.6 SQA — Site/SEO Quality Audit (repeatable checklist)

SQA here means a **repeatable site + SEO quality audit**, run on a fixed cadence, with pass/fail criteria — not a one-off review.

**Cadence:** quick check weekly (15 min, automated where possible), full audit monthly (1–2 hours), deep audit quarterly (half a day, includes manual spot-checks).

**Checklist (pass = criterion met on every checked page; fail = any single failure):**

| # | Check | How | Pass criteria |
|---|---|---|---|
| 1 | Crawlability | Fetch `robots.txt`; confirm it allows all and lists the sitemap | 200, `Allow: /`, sitemap URL correct |
| 2 | Sitemap accuracy | Compare sitemap URLs vs live routes | Every live public URL in sitemap; no dead URLs; lastmod current |
| 3 | Indexation | GSC Pages report | Indexed count rising month over month; zero "blocked by robots" errors |
| 4 | Titles/descriptions | Crawl (Screaming Frog free tier or equivalent) | Unique title ≤60 chars and unique description ≤160 chars on every public page; no duplicates, no missing |
| 5 | Canonicals + hreflang | Spot-check EN/ES/PT pages | Canonical = self; hreflang set complete (en/es/pt/x-default); no hreflang errors in GSC |
| 6 | Structured data | Rich Results Test + Schema Markup Validator on home, FAQ, geo, blog post | Zero errors; FAQPage mirrors visible content exactly |
| 7 | Broken links | Link checker over the built site | Zero broken internal links; zero broken outbound links |
| 8 | Duplicate / thin content | Compare geo pages and translated pages | Every geo page has unique text (not templated swaps of one sentence); every translated page is a real translation |
| 9 | Speed (lab) | PageSpeed Insights on home, /affiliates, one geo page | Performance ≥90 mobile; LCP ≤2.5s, CLS ≤0.1 in lab |
| 10 | Speed (field) | GSC Core Web Vitals | All URL groups "Good" once field data exists (see §2.11) |
| 11 | Mobile usability | GSC Mobile Usability + 320px manual check | Zero errors; no horizontal scroll at 320px |
| 12 | Accessibility | axe DevTools + manual keyboard pass (see §2.10) | Zero critical/serious axe issues; keyboard can complete register → onboarding |
| 13 | Tracking health | `go.affilayer.com/health` + one test click → conversion | `/health` returns `{"ok":true}`; click 302s; signed conversion 201s; replay returns duplicate |
| 14 | Demo-data honesty | Prerendered HTML inspection | No demo/sample data presented as real in any indexed page; demo banner present on dashboard pages |
| 15 | llms.txt freshness | Read `/llms.txt` | Reflects current languages, pages, payout terms; updated within 30 days of any material change |

**Tooling (all free at this scale):** Google Search Console, PageSpeed Insights, Rich Results Test, Schema Markup Validator, axe DevTools (browser extension), Screaming Frog free tier (500 URLs), the repo's own prerender script + `scripts/` checks. No paid SEO tool is needed until the site passes ~1,000 indexed pages or the budget decision is made — do not buy Ahrefs/Semrush on day one.

### 2.7 FAQ as an SEO asset — how to grow it so it ranks

**Important correction to common advice:** FAQPage schema no longer earns the expandable FAQ rich result for commercial sites. Google restricted FAQ rich results to well-known government and health sites in August 2023, and by May 2026 had deprecated the feature (including its Search Console report) — AffiLayer will not get the visual SERP bonus no matter how good the markup is. ([getsiteaiaudit.com — FAQ schema 2026](https://getsiteaiaudit.com/faq-schema-markup-guide/); [mv3marketing.com — FAQ schema for AEO](https://www.mv3marketing.com/blog/faq-schema-aeo-framework/); [searchdock.io — FAQ schema 2026](https://www.searchdock.io/blog/faq-schema-ai-answers/))

**What FAQ content is still good for:** it is the most extraction-friendly format for answer engines. Google AI Overviews, ChatGPT, and Perplexity all consume question-shaped content. An Ahrefs study (1,885 pages, Aug 2025–Mar 2026) found adding schema alone produced **no measurable AI-citation lift** — the lever is the quality and directness of the answers, not the markup. Keep the markup (it is valid, harmless, and helps machines parse the page), but do not expect it to rank anything by itself. ([mv3marketing.com](https://www.mv3marketing.com/blog/faq-schema-aeo-framework/))

**How to grow the FAQ (current: 17 Q&As in 5 groups):**

1. **Source real questions only:** GSC Performance → queries containing "how", "what", "can", "is"; support tickets; AffiliateFix/affLIFT threads; sales/onboarding calls. Never invent a question nobody asked — invented FAQs read as invented.
2. **Answer format:** direct answer in the first 40–60 words, then one short paragraph of detail. No preamble, no marketing.
3. **One question = one page section + one FAQPage entry**, with the JSON-LD mirroring the visible text exactly (Google's rule; mismatched markup is worse than none).
4. **Cadence:** review monthly; add 2–4 Q&As per month, only from real questions. Prune answers that become outdated (e.g. when Supabase goes live and demo mode ends, several current answers change — flag that as a content task tied to the backend launch).
5. **Do not** build a separate FAQ page per keyword, do not stuff keywords into questions, and do not copy competitors' FAQs.

### 2.8 Pillar pages — which ones, in what order

A pillar page is one comprehensive page per topic, with cluster pages underneath it, all interlinked. Sequenced by effort vs impact for a new network with no authority. (Pillar/cluster is a standard content architecture; the sequencing below is specific to AffiLayer's audiences and current gaps.)

| # | Pillar (URL) | Target keywords (primary) | Cluster pages underneath | Effort | Impact | When |
|---|---|---|---|---|---|---|
| P1 | **CPA affiliate marketing, explained** — `/guides/cpa-affiliate-marketing` (new) | "what is CPA marketing", "CPA affiliate marketing", "how does CPA marketing work" | What is CPA / CPA vs CPL vs CPS vs CPC / How CPA tracking works / How to choose a CPA network / CPA marketing for beginners | Medium (one long page + 5 clusters) | High — the highest-volume educational terms; also the page AI engines will cite | Phase 2, first |
| P2 | **Affiliate hub** — `/affiliates` (exists; deepen) | "CPA offers", "make money with CPA", "best CPA network for beginners" | SmartLink guide / Tracking links & sub-parameters / How payouts work (Net30, ledger) / Traffic sources that work (and banned ones) | Low–Medium | High — converts the larger audience | Phase 2, first |
| P3 | **Advertiser hub** — `/advertisers` (exists; deepen) | "launch a CPA offer", "CPA network for advertisers", "affiliate network fraud protection" | How to create an offer / Setting caps & traffic rules / Approving affiliates / Reading conversion reports / Fraud signals & review | Low–Medium | High — converts the higher-value audience | Phase 2, second |
| P4 | **Countries hub** — `/geo` (exists; being built) | "CPA network [country]" × 8 | 8 country pages (in progress) → then vertical × GEO pages only where a real offer exists for that GEO | Low (in progress) | Medium–High — the most winnable rankings in months 1–6 | Phase 2, ongoing |
| P5 | **Glossary** — `/glossary` (new, cheap) | "CPA meaning", "what is EPC", "what is a postback", "CPL meaning" | One page, ~30 terms, each 2–3 sentences; links out to P1–P3 | Low | Medium — long-tail definition traffic + AI citation surface | Phase 2, late |
| P6 | **Comparisons** — only honest ones | "AffiLayer vs [network]" | **Do not build these in year one.** A new network comparing itself to MaxBounty/CrakRevenue reads as spam and invites a reputation fight it cannot win. Revisit in year two, and only with a genuinely comparable feature table. | — | — | Year 2 |

**Rules for every pillar:** one H1, one primary keyword, 1,500+ words of genuinely useful content (not filler), a table of contents, internal links to every cluster page, every cluster page linking back, updated date shown, and no claim the network cannot back up. A thin pillar (300 words of generic text) is worse than no pillar — it burns crawl budget and trust.

### 2.9 Backlinks — a realistic white-hat plan with no budget for buying links

**The risk first, because it decides everything else.** Google defines link spam as creating links "primarily for the purpose of manipulating search rankings". Buying links for ranking purposes is on that list. Its SpamBrain system (in use since 2018, upgraded through the 2025 spam updates) detects bought links and **neutralises the ranking credit they pass — silently, with no message in Search Console**. A manual action, if one comes, can cover part or all of the site, and reconsideration reviews take days to weeks (link-related ones longer). Paid links are only acceptable if qualified with `rel="nofollow"` or `rel="sponsored"` — which passes no ranking credit anyway, so there is no SEO reason to buy them. ([wppoland.com — link schemes 2026](https://wppoland.com/en/link-exchange-buying-strategies/); [bluetree.digital — Google backlink policy 2026](https://bluetree.digital/google-backlink-policy/); [mettevo.com — link building services 2026](https://mettevo.com/blog/article/link-building-services-in-2026); [getrevised.com — link spam policy](https://getrevised.com/knowledge/seo-fundamentals/google-link-spam-policy))

**What actually earns links for a new network (no budget):**

| Method | How it works for AffiLayer | Effort | When |
|---|---|---|---|
| Directory listings | AFFindex, Affpaying, Affbank (see §2.4). Honest profiles. These are the first 3–5 real backlinks. | Low | Phase 1 |
| Forum presence | AffiliateFix + affLIFT rep accounts; helpful answers with a profile link. Links are usually nofollow, but they drive signups and brand searches — which is what a new network needs more than PageRank. | Ongoing | Phase 1 |
| Linkable assets | Build 2–3 pages worth linking to: the Glossary (§2.8 P5), a plain-English "How CPA tracking works" explainer with a diagram, and a public "How we review payouts" page. Other sites link to useful references, not home pages. | Medium | Phase 2 |
| Broken-link building | Find dead links on affiliate-marketing resource pages (check competitors' old blog posts and defunct networks), email the owner with a working AffiLayer replacement. Low hit rate, zero cost, fully white-hat. | Medium | Phase 3 |
| Partner pages | Advertisers and affiliates who join may link from their own sites ("we work with AffiLayer"). Ask once, never require it (requiring a link in a contract is link spam per Google's policy). | Low | Phase 3 |
| Digital PR / data | Once real (anonymised, aggregated) data exists — e.g. "what converts in dating vs finance" — publish it. Data gets cited. **Never publish data before it is real and aggregated.** | High | Year 2 |
| HARO-style / journalist requests | Respond to queries about affiliate marketing on Connectively (ex-HARO) and similar. Low hit rate for a new brand, but one placement is worth more than 50 directory links. | Medium | Phase 3 |

**Explicitly do NOT:** buy link packages, use PBNs, buy "guest posts" that exist only to carry a link, exchange links at scale, submit to low-quality directories, automate link creation, or use AI-generated guest-post farms (targeted by Google's October 2025 spam update). Any vendor offering "50 DA 40+ backlinks for $99" is selling either neutralised links or a future penalty.

**Realistic target:** 5–10 real referring domains in the first 6 months (directories + forums + a few editorial links). 50+ in year one would be excellent. Track in GSC Links report (free) — no paid tool needed.

### 2.10 Accessibility — WCAG 2.2 AA audit of the current site

Target: **WCAG 2.2 Level AA** (the common conformance target; 55 Level A + AA criteria). Verified against the actual code in `apps/web/src/` on 7 Nov 2026. Contrast ratios below were computed from the site's real hex values.

**Confirmed failures (fix in Phase 0/1):**

| # | Criterion | Finding (verified in code) | Fix |
|---|---|---|---|
| A1 | 1.4.3 Contrast (Minimum) — **FAIL** | White text on the orange→yellow gradient pill buttons: **2.8:1** (orange end) to **1.92:1** (yellow end). AA needs 4.5:1 for normal text, 3:1 for large text. The yellow end fails even the large-text bar. | Use dark navy text (`#0B1220` on orange = **6.68:1**, passes) on gradient buttons, or darken the gradient. One-line CSS change, high impact. |
| A2 | 1.4.3 Contrast (Minimum) — **FAIL** | Slate-500 (`#64748b`) small text on dark navy: **3.93:1** (needs 4.5:1). Used for footer meta text and small print. Input placeholders (`#64748b` on `#0f172a`): **3.75:1**. | Raise to slate-400 (`#94a3b8`, **7.3:1**, passes) for all small text on dark; lighten placeholder colour. |
| A3 | 1.4.11 Non-text Contrast — **LIKELY FAIL** | Card/nav borders slate-700 (`#334155`) on navy: **1.81:1**; slate-600 (`#475569`): **2.47:1**. AA needs 3:1 for UI component boundaries that carry meaning. | Lighten meaningful boundaries (focusable card edges, form field borders) to ≥3:1; purely decorative borders can stay. |
| A4 | 2.4.1 Bypass Blocks — **FAIL** | **No skip link anywhere** in the codebase (grep for "skip" in `src/` returns nothing). Keyboard users must tab through the whole header on every page. | Add "Skip to main content" link as the first focusable element, visible on focus, targeting `<main>`. |
| A5 | 2.4.7 Focus Visible — **FAIL** | No global `:focus-visible` style exists. The only focus rule in the codebase is `.dark-field:focus { outline: none; … }` — it **removes the outline** and replaces it with a border-colour change only, which is too subtle for keyboard users. | Add a global `:focus-visible` rule (2px solid orange outline + 2px offset) and never `outline: none` without a replacement. |
| A6 | 1.3.1 Info and Relationships / 3.3.2 Labels — **FAIL** | Contact form inputs (name, email, subject, message) have **placeholders but no `<label>` elements**. Placeholders disappear on input and are not a label substitute. | Add real `<label>`s (visually hidden if the design demands it) to every form field, including auth/onboarding. |

**Confirmed passes (keep them):**

- `aria-expanded` is set on both mobile menu buttons; navs carry `aria-label="Main"` / `"Mobile"` / `"Dashboard"`.
- Hero illustration has `role="img"` + a descriptive `aria-label`; decorative layers are `aria-hidden`.
- `prefers-reduced-motion` disables reveal, parallax, rotator and transitions (good — also covers 2.2.2 for the rotating hero word).
- `lang="en"` is set; viewport meta is correct; semantic `<header>` / `<nav>` / `<main>` / `<footer>` landmarks exist.
- Touch targets: pill buttons and nav links are comfortably above the 24×24px WCAG 2.2 minimum (2.5.8).

**Still to verify (audit items, not asserted):** heading order on every page (one H1, no skipped levels); link text uniqueness ("Browse offers →" is fine; check for any bare "click here"); form error identification (3.3.1) once the backend exists; colour-independence (1.4.1 — status is never conveyed by colour alone); 320px reflow (1.4.10) on the dashboard tables; the sticky header not obscuring focused elements (2.4.11 Focus Not Obscured, new in 2.2 — the header is sticky, so test it).

**Sources:** [WCAG 2.2 checklist, humanstandards.org](https://www.humanstandards.org/checklists-playbooks/accessibility-checklist/); [ADA/WCAG 2.2 checklist 2026, cityofoaksmarketing.com](https://cityofoaksmarketing.com/insights/ada-compliance-website-checklist/); [WCAG 2.2 for developers, browserutils.dev](https://www.browserutils.dev/blog/web-accessibility-checklist/); [WCAG guidelines 2026, uptura.io](https://uptura.io/blog/wcag-guidelines).

### 2.11 Mobile visibility — Core Web Vitals and mobile-first

**Thresholds (unchanged since INP replaced FID in March 2024):** LCP ≤ **2.5s**, INP ≤ **200ms**, CLS ≤ **0.1** — all at the 75th percentile of real visits, all three must pass. Poor is LCP >4s, INP >500ms, CLS >0.25. Only **48% of mobile sites passed all three** in the 2025 Web Almanac (CrUX, July 2025). ([involvedigital.com — CWV guide 2026](https://www.involvedigital.com/insights/seo-technical-foundations-guide-2026); [apogeewatcher.com — CWV statistics 2026](https://www.apogeewatcher.com/core-web-vitals-statistics); [knowledgemarkg.com — CWV 2026](https://knowledgemarkg.com/blog/core-web-vitals-guide-fix-lcp-inp-cls))

**What this means for AffiLayer specifically:**

- **No field data exists yet, and none will for months.** CrUX field data comes from real Chrome users over a rolling 28 days; a new site with no traffic has no field data, so GSC will show "not enough data". Until then, use **PageSpeed Insights lab data** (Lighthouse) as the regression signal — but remember a lab score is not a CrUX pass.
- **The architecture is already favourable:** prerendered HTML (no client-rendered blank shell) helps LCP; no heavy images (OG image is 1200×630, only loaded on share); code-split chunks (largest 268 kB). Keep it that way — every new image must have width/height (CLS) and every new dependency must justify its bytes (INP/LCP).
- **Known CLS risks to watch:** the rotating hero word (layout shift if the word length changes line breaks — it is inline-block with animation, verify); webfont swaps (system font stack is used, good); the sticky header + mobile menu (must not push content).
- **Mobile-first checks (every release):** 320px wide, no horizontal scroll; tap targets ≥24×24px (WCAG 2.2) — aim for 44px; text readable without zoom; forms usable with a thumb; the mobile menu opens and closes by touch and by keyboard; prerendered pages serve the same content as the JS app (no mobile-only content gaps).
- **How to measure:** PageSpeed Insights (pagespeed.web.dev) per URL after every deploy; GSC Core Web Vitals report weekly once data appears; Lighthouse in Chrome DevTools for diagnostics (it names the exact LCP element and the exact CLS source).

---

## 3. The phased to-do list

How to read it: each item has what / why / needs / done. **[NEEDS SOJIB]** = needs his account access, money, or a decision. Items without the tag can be done by the agent alone. Work top to bottom; do not start Phase 2 until Phase 0 is fully done and deployed.

### Phase 0 — This week, free, no accounts needed

*Goal: everything already built actually reaches the internet, and the known accessibility failures are fixed before Google ever sees the site.*

| # | What | Why | Needs | Done looks like |
|---|---|---|---|---|
| 0.1 | **Deploy the built work**: Pages deploy of the current main branch (logo, SEO, prerender, design system, funnels, geo, i18n) + Worker redeploy with the fixed `go.affilayer.com/*` route | Nothing in §1 that is "local-only" helps until it is live. The sitemap, llms.txt, logo, and geo pages literally do not exist on the internet today. | **[NEEDS SOJIB]** — one fresh Cloudflare phone authorization (OAuth token expired; refresh rejected) | `affilayer.com/sitemap.xml` returns XML; `/llms.txt` returns text; `go.affilayer.com/health` returns `{"ok":true}`; homepage shows the new logo |
| 0.2 | **Verify the deploy live**: fetch `/`, `/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/geo`, `/geo/us`, `/es/`, `go.affilayer.com/health`, plus one click → signed conversion → replay-duplicate → `/api/stats` end-to-end | A deploy is not done until the live URLs prove it | — | Written verification note with a timestamp and the result of every URL |
| 0.3 | **Fix the white-on-gradient button contrast** (A1): navy text on gradient buttons, or darken the gradient | Verified WCAG AA fail (1.92–2.8:1). One CSS change. | — | Recomputed ratio ≥4.5:1; screenshot of the button |
| 0.4 | **Fix small-text contrast** (A2): slate-500 → slate-400 for small text on dark; lighten placeholders | Verified WCAG AA fail (3.93:1 / 3.75:1) | — | Recomputed ratios ≥4.5:1 |
| 0.5 | **Add a skip link** (A4) + **global `:focus-visible` style** (A5) + **real `<label>`s on all form fields** (A6) | Verified WCAG AA fails; keyboard users currently have no way past the header and no visible focus | — | Keyboard-only pass: Tab from page load reaches main content in 2 stops; focus ring visible on every interactive element; every input has a label |
| 0.6 | **Lighten meaningful UI boundaries** to ≥3:1 (A3) | Likely 1.4.11 fail on card/form borders | — | Border ratios recomputed ≥3:1 for interactive boundaries |
| 0.7 | **Run the first SQA** (§2.6 checklist, items 1–15) against the live site and record the baseline | Without a baseline, later audits cannot show progress | — | SQA report saved in `docs/` with pass/fail per item |
| 0.8 | **Add a brand kit page** (`/brand` or `/press`): logo files, colours, one-paragraph boilerplate, contact email | Directories and forums ask for this; it also becomes a linkable asset | — | Page live, linked from footer |
| 0.9 | **Update `llms.txt` / `llms-full.txt`** to list the new geo + language pages after deploy | AI crawlers read this file; a stale one misdescribes the site | — | File lists all live public routes |

### Phase 1 — Needs Sojib's accounts (do these the week the deploy lands)

*Goal: Google and Bing know the site exists; the first human footprint appears.*

| # | What | Why | Needs | Done looks like |
|---|---|---|---|---|
| 1.1 | **Create the Google Search Console property** (Domain, `affilayer.com`, DNS TXT verification — §2.1) | Without it, indexing is a black box | **[NEEDS SOJIB]** — decide which Google account owns it (role account, not personal Gmail); he adds the TXT record or authorises the dashboard session | "Ownership verified" in GSC; TXT record left in place |
| 1.2 | **Submit the sitemap in GSC** + request indexing for `/`, `/affiliates`, `/advertisers`, `/geo` (4 URLs only — don't spam the tool) | Starts the crawl; indexing takes days–weeks per page | [NEEDS SOJIB] — same session as 1.1 | Sitemap status "Success"; 4 URLs "Indexed" within 2–4 weeks |
| 1.3 | **Create Bing Webmaster Tools property** (DNS TXT) + submit sitemap + set up IndexNow key file | Bing is ~5–10% of search traffic and the fallback when Google is slow; IndexNow speeds up new-page discovery | **[NEEDS SOJIB]** — Microsoft account decision + TXT record | Property verified; sitemap submitted; IndexNow key file live |
| 1.4 | **Create X (Twitter) + LinkedIn company pages** for AffiLayer, with the real logo, boilerplate, and link to affilayer.com; link them from the footer | The minimum credible social footprint; directories and forums check for these | **[NEEDS SOJIB]** — he creates the accounts (or gives a go-ahead + the accounts to use); agent can draft the bios | Both profiles live, linked from the footer, posting nothing fake |
| 1.5 | **List on AFFindex, Affpaying, Affbank** with honest profiles (founded 2026, new network, small catalogue) | First 3–5 real backlinks + first discovery by affiliates | **[NEEDS SOJIB]** — he approves the profile text (it represents the company publicly) | 3 live listings, all with identical company name/email/domain |
| 1.6 | **Open AffiliateFix as an official rep** (free) + **affLIFT** ($20–25/mo — budget decision) | Where affiliates actually gather; reps get signups | **[NEEDS SOJIB]** — $20–25/mo for affLIFT is a spend decision; AffiliateFix is free | Rep accounts live; one introductory post each; no spam |
| 1.7 | **Set up the weekly GSC habit**: 15 min every Monday — Pages, Performance, Mobile Usability, Manual Actions (§2.1 table) | Catches indexation and usability problems the week they appear | **[NEEDS SOJIB]** — read-only GSC access shared with the agent, or he checks and reports | First 4 weekly notes saved; zero unresolved errors |
| 1.8 | **Decide the advertiser price question** (§2.3): is there a network fee / revenue share, or free at launch? | Advertiser pages cannot honestly answer "what does it cost" until this is decided; do not publish a price that doesn't exist | **[NEEDS SOJIB]** — decision | Decision recorded; advertiser pages updated (or deliberately left without a price) |
| 1.9 | **Decide the SEA question**: Google Ads account + monthly budget, or no paid search in year one | SEA needs an account and money; it is not a code task | **[NEEDS SOJIB]** — account + budget decision | Decision recorded; if yes, account created and conversion tracking scoped as a separate job |

### Phase 2 — Content: pillar pages + FAQ growth (weeks 3–12, 1 post/week)

*Goal: give Google and AI engines something worth ranking and citing, and give each audience a reason to sign up.*

| # | What | Why | Needs | Done looks like |
|---|---|---|---|---|
| 2.1 | **Pillar P1**: "CPA affiliate marketing, explained" (`/guides/cpa-affiliate-marketing`) + 5 cluster pages (§2.8) | Highest-volume educational terms; the page AI engines will cite | — | Pillar + 5 clusters live, interlinked, prerendered, in sitemap |
| 2.2 | **Deepen P2/P3**: affiliate + advertiser hubs — add the SmartLink guide, tracking-links doc, payout explainer, offer-creation guide | Converts the two audiences; answers the questions they actually search | — | 4 new guides live, each linked from its hub page |
| 2.3 | **Glossary P5** (`/glossary`, ~30 terms) | Cheap long-tail + AI citation surface | — | Page live, each term 2–3 honest sentences |
| 2.4 | **Blog cadence: 1 post/week**, alternating affiliate/advertiser topics, from real experience (launch notes, what changed, lessons) | Fresh content is what gets crawled repeatedly; each post is one shareable item for the forums | — | 8 posts by week 12; each shared once in the right community |
| 2.5 | **FAQ growth: +2–4 real Q&As/month**, sourced from GSC queries, tickets, and forum questions (§2.7); prune stale answers when Supabase goes live | FAQ value is in real questions with direct answers, not volume | — | FAQ count tracked monthly; every new Q&A traces to a real question |
| 2.6 | **Finish the multilingual rollout**: verify ES/PT pages are indexed (GSC), fix any hreflang errors, then decide the next language (German or French — by traffic, not by guess) | Translated pages that aren't indexed earn nothing | — | GSC shows ES/PT URLs indexed; zero hreflang errors |
| 2.7 | **Vertical pages, only where honest**: one page per vertical (Dating, Finance, Gaming, Sweepstakes, Nutra, iGaming) — but only the verticals with real offers live at the time | A vertical page with no offers behind it is a lie that affiliates discover in one click | **[NEEDS SOJIB]** — confirm which verticals have live offers before each page is written | Each vertical page lists only real, live offers |
| 2.8 | **Update llms.txt + sitemap** with every new page, same week it ships | AI crawlers and Google both read these files | — | No live page missing from sitemap; llms.txt current |

### Phase 3 — Backlinks + outreach (months 2–6)

*Goal: the first 5–10 real referring domains, earned — never bought.*

| # | What | Why | Needs | Done looks like |
|---|---|---|---|---|
| 3.1 | **Linkable assets**: publish the Glossary (§2.8 P5), the "How CPA tracking works" explainer with a diagram, and the "How we review payouts" page | Other sites link to useful references, not home pages | — | 3 assets live; each shared once in AffiliateFix/affLIFT |
| 3.2 | **Broken-link building**: find dead links on affiliate-marketing resource pages, email owners with AffiLayer replacements (10 emails/month) | Zero cost, fully white-hat, low hit rate — do it steadily, not in a burst | — | Outreach log kept; 1–2 links earned per quarter is a good result |
| 3.3 | **Apply to OfferVault** once real offers exist in the system | The largest offer search engine; listing requires real offers | **[NEEDS SOJIB]** — confirm offers are live and approve the listing | Listing live with real offers |
| 3.4 | **Apply to Affnext** once the network has its first real affiliates + payouts | Curated and manually vetted; a listing there is a trust signal in itself | **[NEEDS SOJIB]** — approve the application (it will be vetted) | Application submitted; outcome recorded honestly |
| 3.5 | **Ask partners once**: when an advertiser/affiliate joins, one polite ask for a link from their site — never a requirement | Partner links are the most natural links a network earns | — | Ask scripted; zero links required in any contract |
| 3.6 | **HARO/Connectively**: answer 2–3 journalist queries/month about affiliate marketing | One editorial placement beats 50 directory links | — | Responses logged; any placement recorded |
| 3.7 | **Monthly link review**: GSC Links report — new referring domains, lost links, any suspicious spike | Catches negative SEO and spammy links early; disavow only if a manual action (or likely one) exists — Google's own guidance | — | Monthly note: domains gained/lost, action taken (usually none) |

### Phase 4 — Ongoing: SQA cadence, accessibility, mobile (forever, from month 2)

*Goal: the site stays fast, accessible, and honest as it grows.*

| # | What | Why | Needs | Done looks like |
|---|---|---|---|---|
| 4.1 | **Weekly SQA quick check** (15 min): GSC Pages + Performance + Mobile Usability; `go.affilayer.com/health`; one spot-check page in PageSpeed Insights | Catches regressions the week they happen | — | Weekly note saved; zero unresolved errors |
| 4.2 | **Monthly full SQA** (§2.6, all 15 items) + **quarterly deep audit** (manual keyboard pass, 320px check, heading order, link-text review) | Checklists only work if they are run | — | Monthly SQA report in `docs/`; quarterly deep-audit note |
| 4.3 | **Accessibility remediation round 2**: verify the Phase 0 fixes (A1–A6) with axe DevTools + a full keyboard pass of register → onboarding → dashboard; fix heading order and any remaining axe "serious" issues | Phase 0 fixes the known fails; the manual pass finds the rest | — | Zero critical/serious axe issues; keyboard can complete signup |
| 4.4 | **Mobile CWV watch**: PageSpeed Insights per key URL after every deploy; GSC Core Web Vitals weekly once field data exists; target LCP ≤2.5s / INP ≤200ms / CLS ≤0.1 at p75 | Mobile is where the traffic is; field data takes months to appear — lab data is the interim signal | — | Lab scores ≥90 mobile on home + affiliate + geo pages; field "Good" once data exists |
| 4.5 | **Content freshness pass (quarterly)**: re-read every public page; update anything that changed (Supabase live, new verticals, new languages, payout changes); update `lastmod` in the sitemap | Stale claims are how a new network loses trust | **[NEEDS SOJIB]** — confirm any business facts that changed | Every page's claims verified current; sitemap lastmod updated |
| 4.6 | **Quarterly strategy review**: GSC queries → what is actually ranking? → double down on the winning cluster, prune or rewrite the losers | SEO is iteration, not installation | — | One-page review note per quarter with the next quarter's content picks |
| 4.7 | **Reputation watch (monthly)**: check Affpaying + AffiliateFix for mentions/reviews; respond to every review honestly, fix every real complaint | A new network's reputation is its only moat; one ignored complaint thread does more damage than any algorithm update | **[NEEDS SOJIB]** — he (or a named rep) answers as the company | Every mention answered within a week; no fake reviews, ever |

---

## 4. Do NOT do

| # | Don't | Why |
|---|---|---|
| D1 | Fake testimonials, fake client logos, fake "trusted by" rows, fake payout screenshots | AffiLayer's whole positioning is honesty. One discovered fake ends the brand — and Affpaying exists precisely to catch this. |
| D2 | Buy backlinks, link packages, PBNs, "guest post" link farms | Google's SpamBrain neutralises them silently (no GSC message, money gone) and a manual action can cover the whole site. See §2.9. |
| D3 | Keyword stuffing, hidden text, cloaking, doorway pages | All in Google's spam policies; all detectable; all pointless on a site with no authority to protect. |
| D4 | Publish AI-spun thin pages at scale (dozens of near-identical geo/vertical pages) | Targeted by the October 2025 spam update; thin templated pages also fail the SQA duplicate-content check (§2.6 #8). One good page beats twenty thin ones. |
| D5 | Claim rankings, traffic, or earnings that don't exist ("#1 CPA network", "10,000 affiliates", "highest payouts") | Unverifiable claims are the fastest way to get flagged on Affpaying and to lose the trust the site is built on. |
| D6 | Copy competitors' copy, FAQs, or reviews (including AdsEmpire's) | The site was deliberately written in its own words; keep it that way. |
| D7 | Incentivised signups, bought traffic, PTC, bot traffic | Prohibited by AffiLayer's own Terms §5, and it poisons the ledger, the stats, and the reputation. |
| D8 | Create a Google Business Profile with a fake address, or claim social profiles that don't exist | GBP requires a real public-facing location; fake profiles are trivially exposed. |
| D9 | Require a backlink in any advertiser/affiliate contract | Google lists this as link spam. Ask once, politely, never require. |
| D10 | Disavow links pre-emptively | Google's guidance: disavow only with a considerable number of spammy links AND a manual action (or likely one). A new site with 5 links has nothing to disavow. |
| D11 | Buy Ahrefs/Semrush on day one | GSC + PageSpeed Insights + free-tier crawlers cover everything until ~1,000 indexed pages. Spend the money on affLIFT or content instead. |
| D12 | Submit the sitemap to GSC before the deploy (or re-submit it daily) | The live sitemap currently returns the homepage; submitting it now would record a "couldn't fetch". Submit once, after the deploy, then leave it alone. |

---

## 5. Flags and contradictions found during this research

1. **Live site serves the homepage for `/sitemap.xml` and `/llms.txt`** (checked live 7 Nov 2026, 10:27 UTC). The SEO foundation is built but not deployed. Do not submit the sitemap to GSC until after the deploy (see D12).
2. **White text on the orange→yellow gradient buttons fails WCAG AA** (1.92–2.8:1, needs 4.5:1). The fix is one CSS change (navy text on the gradient = 6.68:1). This is the single highest-value accessibility fix.
3. **No skip link; no visible focus indicator; form inputs without labels.** Three verified WCAG AA fails, all cheap to fix (Phase 0).
4. **No social profiles exist or are claimed.** Any plan that assumes an X/LinkedIn presence is wrong until Sojib creates them (Phase 1.4).
5. **The advertiser price is undecided.** Advertiser content cannot answer "what does it cost" until Sojib decides (Phase 1.8). Do not invent a price.
6. **The geo/multilingual build was mid-flight while this document was written** (uncommitted files in the repo; sitemap still lists only 12 URLs). If the geo pages change scope (countries, languages), §2.8 P4 and Phase 2.6 need updating to match.
7. **"CPA network" as a head term is not a year-one target.** Any plan promising page-1 rankings for it in months is wrong; the realistic targets are brand + long-tail + geo (§2.2).

---

## Sources

- Google Search Console setup / DNS verification: https://dev.to/morinaga/verifying-three-custom-domains-in-google-search-console-with-cloudflare-dns-2jfh
- GSC setup SOP (organisational account, TXT record, sitemap): https://webmanagers.com/assets/files/swm-m09-2-search-console-setup-print.pdf
- GSC + Bing + IndexNow via API: https://mjunaidkhalid.com/2026/09/29/google-search-console-api/
- New-domain ranking / sandbox data: https://blogpipeline.com/blog/google-sandbox-new-domain-how-long/ · https://www.seosavages.com/glossary/how-long-does-it-take-to-rank/ · https://satelo.io/blog/how-long-new-website-to-rank/ · https://searchpod.com/answers/how-long-does-it-take-a-new-website-to-rank-on-google
- CPA network directories: https://affindex.com/en/affiliate-networks · https://ecomobi.com/top-affiliate-network-listing-websites/
- Affiliate forums 2026: https://bloggersneed.com/best-affiliate-marketing-forums/ · https://www.toolsurf.com/affiliate-marketing-forum-2026/
- Google link spam policy / SpamBrain: https://wppoland.com/en/link-exchange-buying-strategies/ · https://bluetree.digital/google-backlink-policy/ · https://mettevo.com/blog/article/link-building-services-in-2026 · https://getrevised.com/knowledge/seo-fundamentals/google-link-spam-policy
- FAQ schema in 2026 (rich result deprecated; AEO value): https://getsiteaiaudit.com/faq-schema-markup-guide/ · https://www.mv3marketing.com/blog/faq-schema-aeo-framework/ · https://www.searchdock.io/blog/faq-schema-ai-answers/ · https://www.gethelpable.com/blog/faqpage-schema-google-rich-results
- WCAG 2.2 AA: https://www.humanstandards.org/checklists-playbooks/accessibility-checklist/ · https://cityofoaksmarketing.com/insights/ada-compliance-website-checklist/ · https://www.browserutils.dev/blog/web-accessibility-checklist/ · https://uptura.io/blog/wcag-guidelines
- Core Web Vitals 2026: https://www.involvedigital.com/insights/seo-technical-foundations-guide-2026 · https://www.apogeewatcher.com/core-web-vitals-statistics · https://knowledgemarkg.com/blog/core-web-vitals-guide-fix-lcp-inp-cls

*Confidence notes: GSC mechanics, CWV thresholds, WCAG criteria, and link-spam policy are high-confidence (stable, documented). New-domain ranking timelines are medium-confidence (consistent across independent sources, but niche-dependent). The May 2026 FAQ rich-result deprecation is reported by one marketing source — the August 2023 restriction is the well-documented fact. Forum/directory membership counts and prices change frequently — verify each on its official page before spending or joining.*
