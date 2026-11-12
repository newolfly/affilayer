// Blog post data shared by the blog pages, the SEO/JSON-LD module, and the
// build scripts (generate-sitemap.py / generate-rss.py / prerender.py parse
// this file for slugs, dates and categories — it is the single source of
// truth for the post list, so a new post is one edit here, not three).
//
// Body is a block model, not string[]: headings, lists, links, callout
// boxes and the "What AffiLayer does here" product box render from it.

export type Author = { name: string; role: string; bio: string }

/** The byline default. One constant, so the author can be swapped in one
 *  place later (e.g. a named author) without touching every post. */
export const DEFAULT_AUTHOR: Author = {
  name: 'AffiLayer team',
  role: 'The AffiLayer team',
  bio: 'The team building AffiLayer — a small CPA network that keeps its promises small and its records open.',
}

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'callout'; title?: string; text: string }
  | { kind: 'product'; title: string; text: string; href: string; cta: string }

export type Post = {
  slug: string
  title: string
  /** 140–160 chars, distinct from the excerpt; used for meta + OG. */
  description: string
  excerpt: string
  /** ISO YYYY-MM-DD — drives datePublished and the sitemap lastmod. */
  date: string
  /** ISO, set on edit — drives dateModified and the "Updated" line. */
  updated?: string
  author: Author
  category: 'Launch Notes' | 'AdTech Insights' | 'Guides' | 'News'
  tags: string[]
  type: 'article' | 'news'
  /** Optional per-post hero/OG image; defaults to the site OG image. */
  heroImage?: string
  body: Block[]
}

export function formatPostDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function readingTime(post: Post): number {
  const words = post.body
    .flatMap((b) => {
      if (b.kind === 'list') return b.items
      if (b.kind === 'product') return [b.title, b.text]
      return [b.text]
    })
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

/** A post is published once its date (UTC) has arrived. Posts are written
 *  ahead as a calendar, but only published ones are listed, routed,
 *  prerendered or put in the sitemap/RSS — future-dated posts stay
 *  invisible until their date. */
export function isPublished(post: Post): boolean {
  return post.date <= new Date().toISOString().slice(0, 10)
}

export function publishedPosts(): Post[] {
  return POSTS.filter(isPublished)
}

export function relatedPosts(post: Post, count = 3): Post[] {
  const others = publishedPosts().filter((p) => p.slug !== post.slug)
  const byScore = others
    .map((p) => ({
      p,
      score:
        (p.category === post.category ? 2 : 0) +
        p.tags.filter((t) => post.tags.includes(t)).length,
    }))
    .sort((a, b) => b.score - a.score || +new Date(b.p.date) - +new Date(a.p.date))
  return byScore.slice(0, count).map((x) => x.p)
}

/** Country codes linked from a post's "Browse by country" block.
 *  Navigation only — no claim that any offer runs in these countries.
 *  Finance posts point at the three Finance country pages (es/mx/ar);
 *  the geo post points at a spread of featured countries; everything
 *  else points at the same featured set. The /geo hub link is always
 *  shown alongside. */
export function relatedCountryCodes(post: Post): string[] {
  if (post.tags.includes('finance')) return ['es', 'mx', 'ar', 'us', 'uk', 'br']
  if (post.tags.includes('geo')) return ['us', 'uk', 'br', 'in', 'mx', 'ng']
  return ['us', 'uk', 'br', 'in', 'es', 'mx']
}

export const POSTS: Post[] = [
  {
    slug: 'affilayer-launch-announcement',
    heroImage: '/promo/launch-announcement-card.jpg',
    title: 'AffiLayer is live: a CPA network with real offers, honest tracking, and Net-30 USDT payouts',
    description:
      'AffiLayer is live with nine CPA offers — sweeps, surveys, VPN trials, finance and dating — honest tracking and Net-30 USDT payouts.',
    date: '2026-11-12',
    author: DEFAULT_AUTHOR,
    category: 'Launch Notes',
    tags: ['launch', 'offers', 'payouts', 'tracking'],
    type: 'news',
    excerpt:
      'AffiLayer is live with its first nine offers open, a launch campaign running to 12 December, and the same open books we promised on day one.',
    body: [
      { kind: 'p', text: 'AffiLayer is live.' },
      { kind: 'p', text: 'We built a CPA affiliate network for affiliates who want three simple things: real offers, tracking they can trust, and payouts that actually arrive.' },
      { kind: 'h2', text: 'What is live today' },
      { kind: 'list', items: [
        'Real offers from day one — sweeps, surveys, VPN trials, finance and dating, starting with our first nine CPAlead offers, with more coming as our MyLead catalogue opens up.',
        'Every click tracked, every conversion attributed — our tracking runs on a Cloudflare Worker, and every approved commission is written to an append-only commission ledger. Nothing is edited after the fact.',
        'Payouts in USDT (TRC20), Net-30, manual and admin-approved — never automatic, never instant-promised. Affiliates join free and earn on attributed conversions that pass review.',
        'Caps and conversion rules up front — every offer shows its payout, countries, devices and cap before you promote it.',
      ] },
      { kind: 'p', text: 'Our launch campaign runs from today until 12 December 2026, with the first nine offers open for the whole window.' },
      { kind: 'h2', text: 'What we are not claiming' },
      { kind: 'p', text: 'We are a new network. Our first payout cycle is in progress, and we will publish proof when the first affiliates are paid. We would rather under-promise and pay than the other way around.' },
      { kind: 'p', text: 'If you are an affiliate in dating, lead-gen, sweeps, surveys, VPN or finance, come and take a look: affilayer.com. Advertisers who want their offer listed can reach us at support@affilayer.com.' },
      { kind: 'p', text: '— The AffiLayer team' },
    ],
  },
  {
    slug: 'affilayer-is-live',
    heroImage: '/blog/affilayer-is-live.jpg',
    title: 'AffiLayer is live: what the network offers on day one',
    description:
      'AffiLayer opens 7 November 2026 with direct CPA offers, SmartLink routing, full-funnel tracking and an append-only commission ledger.',
    date: '2026-11-07',
    updated: '2026-11-12',
    author: DEFAULT_AUTHOR,
    category: 'Launch Notes',
    tags: ['launch', 'smartlink', 'tracking', 'ledger'],
    type: 'article',
    excerpt:
      'The network opens with direct CPA offers, SmartLink routing, full-funnel tracking and an auditable commission ledger — and nothing we have not actually built.',
    body: [
      { kind: 'p', text: 'AffiLayer opens today as a new CPA affiliate network. This post says exactly what is live on day one — no more, no less.' },
      { kind: 'h2', text: 'Direct CPA offers' },
      { kind: 'p', text: 'Advertisers publish offers with a stated payout model (CPA, CPL, CPS or CPC), allowed countries, devices and traffic sources, and daily and total caps. Affiliates browse the marketplace, apply where approval is required, and generate tracking links with up to five sub-parameters.' },
      { kind: 'h2', text: 'SmartLink' },
      { kind: 'p', text: 'One link routes each visitor to an eligible offer for their country and device, using clear deterministic rules. It is not AI optimisation and it does not promise earnings — it matches traffic to offers it is allowed to run, and shows which offer each click landed on.' },
      { kind: 'h2', text: 'Tracking you can audit' },
      { kind: 'p', text: 'Every click gets a unique click ID with country, device, referrer and sub-parameters, and stays linked to its conversion. Conversions are signed, deduplicated by idempotency key, and recorded as pending until reviewed.' },
      { kind: 'h2', text: 'A ledger, not an estimate' },
      { kind: 'p', text: 'Commissions move through pending, approved, rejected or reversed states with a record of each change. Payouts are manual and admin-approved, on a Net30 schedule by default.' },
      { kind: 'p', text: 'The Supabase backend is live; demo-mode writes are now stored records. Our offer catalogue is small while we onboard advertisers offer by offer.' },
      { kind: 'p', text: 'If you run traffic in Dating, Finance, Sweepstakes, Surveys, VPN or Entertainment, create an account and apply — early partners shape the catalogue.' },
    ],
  },
  {
    slug: 'what-is-a-cpa-network',
    heroImage: '/blog/what-is-a-cpa-network.jpg',
    title: 'What is a CPA network? How affiliates, advertisers and the network fit together',
    description:
      'A CPA network connects advertisers who pay for a defined action with affiliates who drive it — and handles tracking, attribution and payouts.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'Guides',
    tags: ['cpa', 'basics', 'affiliates', 'advertisers'],
    type: 'article',
    excerpt:
      'Advertisers pay for a defined action, affiliates drive that action, and the network sits in the middle — tracking, attributing and paying out.',
    body: [
      { kind: 'p', text: 'A CPA network connects advertisers who pay for a defined action with affiliates who drive that action, and handles tracking, attribution and payouts between them. That one sentence is the whole business — everything else is detail.' },
      { kind: 'h2', text: 'The three sides' },
      { kind: 'list', items: [
        'Advertisers publish offers: a product or service, a conversion action (a signup, a sale, an install), and a payout for each attributed conversion.',
        'Affiliates promote those offers to audiences they can reach — a website, a mailing list, paid traffic, a community — and earn commission on attributed conversions.',
        'The network provides the tracking links, records every click, attributes conversions to clicks, keeps the commission ledger, and moves the money.',
      ] },
      { kind: 'h2', text: 'What the network actually does' },
      { kind: 'p', text: 'Without a network, an advertiser and an affiliate would have to agree tracking, reporting and payment between themselves — and trust each other\'s numbers. The network replaces that handshake with a shared record: a click ID for every click, a signed conversion for every action, and a ledger state (pending, approved, rejected, reversed) for every commission.' },
      { kind: 'callout', title: 'CPA is both a model and a family', text: 'CPA means "cost per action" as a specific payout model — and it is also the umbrella term for the whole family: CPA, CPL (per lead), CPS (per sale) and CPC (per click). When someone says "CPA network", they usually mean the family.' },
      { kind: 'h2', text: 'How money flows' },
      { kind: 'p', text: 'The advertiser funds the network (usually a deposit), the affiliate drives traffic, conversions are reviewed, and approved commissions become payable on the network\'s schedule — Net30 by default on AffiLayer, which means 30 days after the end of the month in which the commission was approved. Payouts are reviewed by a person before money moves.' },
      { kind: 'product', title: 'What AffiLayer does here', text: 'Six steps from sign-up to payout: create an account, get approved, publish or promote offers, track clicks, review conversions, get paid. Nothing hidden in between.', href: '/how-it-works', cta: 'See how it works' },
      { kind: 'h2', text: 'What a network is not' },
      { kind: 'p', text: 'A network is not a traffic source — it does not buy traffic on your behalf — and it is not a guarantee of results. Performance depends on the offer, the audience and the traffic. What a good network guarantees is the record: every click tracked, every commission in an append-only ledger.' },
    ],
  },
  {
    slug: 'cpa-vs-cpl-vs-cps-vs-cpc',
    heroImage: '/blog/cpa-vs-cpl-vs-cps-vs-cpc.jpg',
    title: 'CPA vs CPL vs CPS vs CPC: which payout model pays you, and when',
    description:
      'CPA, CPL, CPS and CPC differ in one thing: what triggers payment. The trigger decides who bears the risk — and when a commission becomes payable.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'Guides',
    tags: ['cpa', 'cpl', 'cps', 'cpc', 'payouts'],
    type: 'article',
    excerpt:
      'Four payout models, one difference: what triggers payment. The trigger decides who bears the risk, and when the money becomes payable.',
    body: [
      { kind: 'p', text: 'CPA, CPL, CPS and CPC are four ways of answering one question: what exactly does the advertiser pay for? The answer decides who bears the risk — and when a commission becomes payable.' },
      { kind: 'h2', text: 'The four models, side by side' },
      { kind: 'list', items: [
        'CPA (cost per action): payment is triggered by a defined action — a signup, a registration, an install. The advertiser defines the action; the affiliate is paid when it happens and is attributed.',
        'CPL (cost per lead): payment is triggered by a lead — usually a form submission with contact details. The lead still has to be valid; junk leads are rejected on review.',
        'CPS (cost per sale): payment is triggered by a completed sale, usually as a percentage of the sale value. The affiliate bears the most risk here, because a click that does not buy pays nothing.',
        'CPC (cost per click): payment is triggered by the click itself. The advertiser bears the risk, because clicks do not guarantee any action.',
      ] },
      { kind: 'callout', title: 'The umbrella nuance', text: '"CPA" is both one specific model and the umbrella term for the whole family. If an offer says "CPA", check which action triggers payment — the label alone does not tell you.' },
      { kind: 'h2', text: 'Who bears the risk' },
      { kind: 'p', text: 'The further the trigger is from the click, the more risk sits with the affiliate: CPC pays on the click, CPL pays on the lead, CPA pays on the defined action, CPS pays only on the sale. Payouts usually rise as the trigger gets further from the click, because the advertiser is buying a more certain outcome.' },
      { kind: 'h2', text: 'When it pays on AffiLayer' },
      { kind: 'p', text: 'On AffiLayer every model works the same way after the trigger: the conversion is recorded as pending, reviewed, and — if approved — entered in the commission ledger. Approved commissions become payable 30 days after the end of the month in which they were approved (Net30 by default), and payouts are manual and admin-approved. The payout model changes what triggers payment; it does not change the review or the schedule.' },
      { kind: 'product', title: 'What AffiLayer does here', text: 'Advertisers publish offers with a stated payout model and conversion action; affiliates see the model before they promote. No model is hidden in the fine print.', href: '/advertisers', cta: 'For advertisers' },
    ],
  },
  {
    slug: 'what-is-a-smartlink',
    heroImage: '/blog/what-is-a-smartlink.jpg',
    title: 'What is a SmartLink? One link, many offers — and what ours does differently',
    description:
      'A SmartLink is one tracking link that routes each visitor to an eligible offer for their country and device. Ours uses fixed, published rules.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'AdTech Insights',
    tags: ['smartlink', 'tracking', 'geo'],
    type: 'article',
    excerpt:
      'One link, many offers: each visitor is routed to an offer they are eligible for. The difference is how the routing decision is made.',
    body: [
      { kind: 'p', text: 'A SmartLink is one tracking link that routes each visitor to an eligible offer for their country and device. Instead of choosing an offer for every visitor yourself, you send all of your traffic to one link and the link does the choosing.' },
      { kind: 'h2', text: 'How routing works' },
      { kind: 'p', text: 'When a visitor clicks a SmartLink, the network checks the visitor against the offers it can run: country, device, traffic rules, and caps. The first eligible offer wins, the visitor is redirected there, and the click is recorded with the offer it landed on — so you can see exactly where each click went.' },
      { kind: 'h2', text: 'SmartLink vs a direct link' },
      { kind: 'list', items: [
        'Direct link: you pick one offer, and every click goes to it. Best when you know the offer and the audience match.',
        'SmartLink: the network picks an eligible offer per visitor. Best for mixed traffic — several countries, several devices — where no single offer fits everyone.',
        'What you see: with a direct link you know the destination in advance; with a SmartLink you see the destination per click, after the fact, in your reports.',
      ] },
      { kind: 'h2', text: 'What ours does differently' },
      { kind: 'p', text: 'AffiLayer\'s SmartLink uses fixed, published rules — country, then device, then eligibility, then caps — not AI optimisation, not an auction, not a black box. The rules are the same for every click, and the offer each click landed on is visible in the report. It does not promise earnings: a routed click is still a click, and it pays exactly like the offer it was routed to.' },
      { kind: 'callout', title: 'When a SmartLink cannot route', text: 'If no offer is eligible for a visitor — wrong country, capped offer, restricted device — the click is not silently sent somewhere unsuitable. It is refused, and the refusal is visible. That is a feature: a click sent to an offer it cannot convert on helps nobody.' },
      { kind: 'product', title: 'What AffiLayer does here', text: 'One SmartLink per affiliate, deterministic routing, and a report that shows which offer each click landed on.', href: '/affiliates', cta: 'For affiliates' },
    ],
  },
  {
    slug: 'how-affiliate-tracking-works',
    heroImage: '/blog/how-affiliate-tracking-works.jpg',
    title: 'How affiliate tracking actually works: click IDs, postbacks and S2S',
    description:
      'A click gets a unique ID, the conversion is linked back to it, and the record is signed and deduplicated. That chain is the whole of tracking.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'AdTech Insights',
    tags: ['tracking', 'postback', 'attribution'],
    type: 'article',
    excerpt:
      'Click ID, conversion, attribution, ledger. The chain is short — and every link in it has to hold, or the commission cannot be trusted.',
    body: [
      { kind: 'p', text: 'Affiliate tracking is a short chain with four links: a click gets a unique ID, the visitor reaches the offer, the conversion is linked back to that click ID, and the commission is recorded. If any link breaks, the affiliate does not get paid — so the chain is worth understanding.' },
      { kind: 'h2', text: '1. The click ID' },
      { kind: 'p', text: 'When a visitor clicks a tracking link, the network records the click with a unique click ID, plus country, device, referrer and up to five sub-parameters (sub1–sub5) the affiliate can use to label the traffic — campaign, placement, creative, whatever they need to tell clicks apart. The visitor is then redirected to the offer landing page, with the click ID carried along.' },
      { kind: 'h2', text: '2. The conversion' },
      { kind: 'p', text: 'When the visitor completes the conversion action, the advertiser tells the network — usually server-to-server (S2S), by posting the click ID back to the network. The network then links the conversion to the original click. This is attribution: the conversion belongs to the click that caused it.' },
      { kind: 'h2', text: '3. Postbacks and S2S' },
      { kind: 'p', text: 'A postback is the server-to-server message that reports a conversion: click ID, offer, payout, currency, and an idempotency key so the same conversion cannot be counted twice. S2S is the reliable path — it does not depend on the visitor\'s browser, so it is not lost to ad blockers or closed tabs. Pixel tracking (a snippet in the browser) is the older alternative, and the less reliable one.' },
      { kind: 'h2', text: '4. Signed, deduplicated, reviewed' },
      { kind: 'p', text: 'On AffiLayer, conversions are signed by the advertiser, deduplicated by idempotency key (the same conversion reported twice counts once), and recorded as pending until reviewed. Only approved conversions enter the commission ledger — and every state change is recorded there, in an append-only ledger that cannot be silently rewritten.' },
      { kind: 'product', title: 'What AffiLayer does here', text: 'Full-funnel tracking from click ID to ledger, in six steps from sign-up to payout.', href: '/how-it-works', cta: 'See how it works' },
    ],
  },
  {
    slug: 'why-conversions-go-missing',
    heroImage: '/blog/why-conversions-go-missing.jpg',
    title: 'Why your conversions go missing: pixels, ad blockers and the case for server-to-server',
    description:
      'A conversion that never reaches the network never pays. Pixels lose conversions to browsers; server-to-server reporting does not depend on them.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'AdTech Insights',
    tags: ['tracking', 'postback', 'pixels'],
    type: 'article',
    excerpt:
      'Clicks happened, conversions did not arrive. The usual cause is not fraud — it is the reporting path.',
    body: [
      { kind: 'p', text: 'Clicks happened, conversions did not arrive. Before assuming fraud or a broken offer, check the reporting path — most missing conversions are lost between the advertiser and the network, not between the visitor and the offer.' },
      { kind: 'h2', text: 'Pixels depend on the browser' },
      { kind: 'p', text: 'Pixel tracking puts a snippet on the advertiser\'s thank-you page: when the page loads, the pixel fires and reports the conversion. It fails whenever the page does not load cleanly — the visitor closes the tab early, an ad blocker stops the request, a browser blocks third-party scripts, or the page errors. Each failure is a conversion that happened and was never reported.' },
      { kind: 'h2', text: 'Server-to-server does not' },
      { kind: 'p', text: 'Server-to-server (S2S) reporting skips the browser entirely: the advertiser\'s server posts the conversion to the network\'s server, with the click ID. No page load, no script, nothing for an ad blocker to stop. That is why S2S is the default on AffiLayer — conversions are signed, posted server to server, and deduplicated by idempotency key.' },
      { kind: 'h2', text: 'How to tell which one lost it' },
      { kind: 'list', items: [
        'Check the click ID: if the click is in the network and the conversion is not, the loss is on the reporting path, not the traffic.',
        'Check timing: conversions reported minutes after the click are usually fine; a conversion that never arrives at all points to the pixel or the postback.',
        'Check the pattern: losses concentrated on one browser, device or country point to a browser-side cause; losses everywhere point to the advertiser\'s integration.',
      ] },
      { kind: 'callout', title: 'What "missing" does not mean', text: 'A missing conversion is not a rejected conversion. Rejected conversions are visible in the ledger as rejected, with a reason. Missing means the network never heard about it — and the fix is in the reporting, not in the review.' },
      { kind: 'product', title: 'What AffiLayer does here', text: 'Signed S2S conversions, deduplicated by idempotency key, recorded as pending until reviewed — so a reported conversion is never silently lost.', href: '/faq', cta: 'Read the FAQ' },
    ],
  },
  {
    slug: 'how-to-choose-a-cpa-network',
    heroImage: '/blog/how-to-choose-a-cpa-network.jpg',
    title: 'How to choose a CPA network: 7 checks before you send your first click',
    description:
      'Seven checks before you send traffic: tracking you can audit, a ledger you can read, honest payout terms, and no promises the network cannot keep.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'Guides',
    tags: ['cpa', 'networks', 'guide'],
    type: 'article',
    excerpt:
      'Do not pick a network on payout rates alone. Check the record-keeping first — it is what decides whether you ever see the money.',
    body: [
      { kind: 'p', text: 'Do not pick a network on payout rates alone. A high rate on a conversion that is never attributed pays nothing. Check the record-keeping first — it is what decides whether you ever see the money.' },
      { kind: 'h2', text: 'The 7 checks' },
      { kind: 'list', items: [
        'Can you audit the tracking? Every click should have a unique click ID, visible in your reports, linked to its conversion.',
        'Can you read the ledger? Commissions should move through named states — pending, approved, rejected, reversed — with a record of each change.',
        'Are the payout terms written down? Schedule, review step, and how to request a payout — in the terms, not in a chat message.',
        'Is the routing explained? If the network offers a SmartLink, ask how it chooses an offer. "AI optimisation" is not an explanation.',
        'Are the offers real? Check the catalogue: named offers, stated payouts, allowed countries and devices. A network with one offer is fine — a network pretending to have hundreds is not.',
        'Is the traffic policy clear? Which sources are allowed, which are banned, and what happens to conversions from banned sources?',
        'Is there a real person? Applications reviewed by hand, tickets answered by a person, and a contact address that works.',
      ] },
      { kind: 'callout', title: 'The check that matters most', text: 'Ask for the ledger, not the leaderboard. Any network can show a screenshot of a payout; only a network with an append-only ledger can show you the record behind it.' },
      { kind: 'h2', text: 'What not to rank on' },
      { kind: 'p', text: 'Do not rank networks by "best" lists that rank themselves first, by promised earnings, or by payout speed alone — a fast payout of a wrongly calculated commission is worse than a reviewed one. Rank them by whether you can check their work.' },
      { kind: 'product', title: 'What AffiLayer does here', text: 'Auditable tracking, an append-only commission ledger, and approval flows on both sides. Check the work, then decide.', href: '/advantages', cta: 'What we do differently' },
    ],
  },
  {
    slug: 'subid-tracking-explained',
    heroImage: '/blog/subid-tracking-explained.jpg',
    title: 'Sub IDs explained: the 5 parameters that tell you which click earned',
    description:
      'Sub IDs are labels you attach to your own clicks — campaign, placement, creative. Five of them, and they are how you learn what actually converts.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'AdTech Insights',
    tags: ['tracking', 'subid', 'attribution'],
    type: 'article',
    excerpt:
      'Five small labels on every click. They are the difference between "my traffic converts" and "this placement converts".',
    body: [
      { kind: 'p', text: 'A sub ID is a label you attach to your own click. AffiLayer tracking links carry five of them — sub1 to sub5 — and they travel with the click ID all the way to the conversion. They are how you learn which of your clicks earned, instead of only knowing that some did.' },
      { kind: 'h2', text: 'What to put in each one' },
      { kind: 'p', text: 'There is no fixed rule — the five parameters are yours to use. A common split is: sub1 for the campaign, sub2 for the traffic source or placement, sub3 for the creative or ad, sub4 for the audience or targeting, and sub5 for anything you want to test. The point is consistency: the same label must mean the same thing every time, or the reports are unreadable.' },
      { kind: 'h2', text: 'How they show up in reports' },
      { kind: 'p', text: 'Because sub IDs are stored with the click and carried to the conversion, you can break down clicks and conversions by any of the five — conversions by campaign, by placement, by creative. A campaign that looks profitable in total can be one good placement carrying four bad ones; sub IDs are what reveal that.' },
      { kind: 'callout', title: 'Keep them clean', text: 'Short, lowercase, no spaces, no personal data. Sub IDs end up in URLs and reports — never put an email address, a name, or anything that identifies a visitor in one.' },
      { kind: 'product', title: 'What AffiLayer does here', text: 'Up to five sub-parameters on every tracking link, stored with the click and linked to its conversion.', href: '/affiliates', cta: 'For affiliates' },
    ],
  },
  {
    slug: 'what-does-net30-mean',
    heroImage: '/blog/what-does-net30-mean.jpg',
    title: 'What does Net30 mean? Payout timing, holds and the real wait for your first payment',
    description:
      'Net30 means approved commissions become payable 30 days after the end of the month in which they were approved. A worked example, with dates.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'Guides',
    tags: ['net30', 'payouts', 'ledger'],
    type: 'article',
    excerpt:
      'Net30 is not "30 days after the click". It is 30 days after the end of the month in which the commission was approved.',
    body: [
      { kind: 'p', text: 'Net30 means approved commissions become payable 30 days after the end of the month in which they were approved. That is the whole definition — and it is worth reading twice, because the two dates people confuse are the click and the approval.' },
      { kind: 'h2', text: 'The worked example' },
      { kind: 'p', text: 'A commission approved in November becomes payable 30 days after 30 November — not 30 days after the click, and not 30 days after the conversion. The clock starts at the end of the month of approval, because approval is when the commission becomes real: before review, a conversion is pending, and a pending conversion is not payable.' },
      { kind: 'h2', text: 'Why the wait exists' },
      { kind: 'p', text: 'The gap is the review. Conversions are checked before they become payable — the click, the attribution, the traffic source — and the advertiser\'s side has to settle too. Net30 gives both sides time to do that checking properly. A network that pays instantly is a network that has not checked.' },
      { kind: 'h2', text: 'What Net30 is not' },
      { kind: 'list', items: [
        'It is not 30 days after the click. A click in early November and an approval in late November pay on the same schedule — the approval month decides.',
        'It is not a promise about the day the money reaches you. Payable means you can request the payout; the payout itself is manual and admin-approved, and the transfer time depends on the payout method.',
        'It is not a hold on your whole balance. Each commission follows its own approval month.',
      ] },
      { kind: 'callout', title: 'The honest first-payment timeline', text: 'Your first payment takes the longest: the conversion, then the review, then the end of the approval month, then 30 days. That is the schedule working as designed — plan for it, and do not let anyone sell you a faster one.' },
      { kind: 'product', title: 'What AffiLayer does here', text: 'Manual, admin-approved payouts, Net30 by default. Payout methods and minimum thresholds are shown in your dashboard.', href: '/affiliates', cta: 'For affiliates' },
    ],
  },
  {
    slug: 'offer-caps-explained',
    heroImage: '/blog/offer-caps-explained.jpg',
    title: 'Offer caps explained: daily caps, total caps, and what happens when a cap is hit',
    description:
      'A cap is the advertiser saying "this much, and no more". Daily caps reset; total caps end the offer. A capped click is refused, not wasted.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'Guides',
    tags: ['caps', 'offers', 'advertisers'],
    type: 'article',
    excerpt:
      'Caps protect the advertiser\'s budget — and the affiliate\'s traffic. A click past the cap is refused, not sent somewhere it cannot convert.',
    body: [
      { kind: 'p', text: 'A cap is the advertiser saying "this much, and no more". Every offer on a network carries caps — a daily cap, a total cap, or both — and they decide whether a click is accepted or refused.' },
      { kind: 'h2', text: 'Daily caps and total caps' },
      { kind: 'list', items: [
        'Daily cap: the maximum number of conversions (or clicks, depending on the offer) the advertiser will accept in one day. It resets the next day.',
        'Total cap: the maximum for a calendar month. When it is reached, the offer stops accepting clicks until the month turns over.',
      ] },
      { kind: 'h2', text: 'What happens when a cap is hit' },
      { kind: 'p', text: 'On AffiLayer a click that would exceed a cap is refused rather than silently redirected to an offer it cannot convert on. The refusal is visible in the tracking response, so the affiliate knows the cap — not the traffic — is the reason. Sending the click anyway would waste the visitor and the affiliate\'s traffic.' },
      { kind: 'h2', text: 'Why caps exist' },
      { kind: 'p', text: 'Caps are budget control and quality control at once. An advertiser testing an offer wants a limited number of conversions before deciding whether to scale; an advertiser with a fixed budget wants spending to stop at the budget. Caps also protect affiliates: traffic sent to a capped offer converts at zero, so refusing it early is better than accepting it and paying nothing.' },
      { kind: 'product', title: 'What AffiLayer does here', text: 'Advertisers set daily and total caps per offer; affiliates see which offers are open before they promote.', href: '/advertisers', cta: 'For advertisers' },
    ],
  },
  {
    slug: 'geo-targeting-cpa-offers',
    heroImage: '/blog/geo-targeting-cpa-offers.jpg',
    title: 'Geo targeting in CPA: why the same offer pays differently in every country',
    description:
      'The same offer in the United States and in Brazil is two different offers: different audiences, different payouts, different rules. Geo decides.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'Guides',
    tags: ['geo', 'offers', 'targeting'],
    type: 'article',
    excerpt:
      'Country is the first thing a SmartLink checks — before device, before eligibility, before caps. Here is why it matters so much.',
    body: [
      { kind: 'p', text: 'The same offer in the United States and in Brazil is two different offers: different audiences, different payouts, different traffic rules. In CPA, country is not a detail — it is usually the first filter, and the one that decides whether a click is accepted at all.' },
      { kind: 'h2', text: 'Why payouts differ by country' },
      { kind: 'p', text: 'An advertiser pays for the value of the customer, and that value differs by market: purchasing power, competition for the audience, and how well the offer converts there. The payout is set per offer and per country because the economics are per country.' },
      { kind: 'h2', text: 'How geo targeting works in practice' },
      { kind: 'list', items: [
        'Each offer lists the countries it accepts. Traffic from anywhere else is not eligible for that offer.',
        'A SmartLink checks country first: the visitor\'s country decides which offers are even candidates, before device or caps are considered.',
        'A click from a country the offer does not accept is refused — it is not sent to the offer and it cannot convert there.',
      ] },
      { kind: 'h2', text: 'What that means for affiliates' },
      { kind: 'p', text: 'Know where your traffic comes from before you pick an offer. Mixed-country traffic needs either a SmartLink (which routes each visitor to an offer for their country) or separate links per country. Sending traffic from a country the offer does not accept is the fastest way to earn nothing.' },
      { kind: 'product', title: 'What AffiLayer does here', text: 'Country pages for 195 countries, per-offer GEO targeting, and a SmartLink that routes by country first.', href: '/geo', cta: 'Browse by country' },
    ],
  },
  {
    slug: 'affiliate-fraud-patterns',
    heroImage: '/blog/affiliate-fraud-patterns.jpg',
    title: 'Affiliate fraud: the patterns that get accounts rejected — and how to stay clean',
    description:
      'Bots, misleading creatives, forced clicks and incentivised traffic. The patterns are old, the detection is straightforward, and clean traffic has nothing to fear.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'AdTech Insights',
    tags: ['fraud', 'traffic', 'compliance'],
    type: 'article',
    excerpt:
      'Fraud is not clever. It is the same few patterns, and they are easy to spot — which is why they are the fastest way to lose an account.',
    body: [
      { kind: 'p', text: 'Fraud is not clever. It is the same few patterns, repeated — and they are easy to spot, which is why they are the fastest way to lose an account. This post names them, so clean affiliates know what to avoid and what the review is looking for.' },
      { kind: 'h2', text: 'The patterns' },
      { kind: 'list', items: [
        'Bots: clicks with no human behind them — impossible speeds, impossible patterns, no real device or referrer.',
        'Misleading creatives: an ad that promises something the offer does not deliver. The click converts badly, the advertiser complains, the account is reviewed.',
        'Forced clicks: visitors who did not choose to click — pop-unders, hidden links, clicks triggered by the page rather than the person.',
        'Incentivised traffic: visitors paid or rewarded to convert. The conversion is real and worthless, and it is rejected on review.',
        'Chat traffic: conversions driven through chat apps in ways the offer did not approve. Not accepted on AffiLayer.',
      ] },
      { kind: 'h2', text: 'How review catches them' },
      { kind: 'p', text: 'Every click carries a click ID with country, device, referrer and sub-parameters, and every conversion is linked to its click. That chain makes patterns visible: clicks that never behave like people, conversions that never match their clicks, traffic sources that cannot be verified. Conversions are reviewed before they become payable — and conversions from banned traffic are rejected.' },
      { kind: 'h2', text: 'How to stay clean' },
      { kind: 'list', items: [
        'Run only traffic sources the offer allows, and check the offer\'s rules before you promote it.',
        'Use honest creatives: promise what the offer delivers, nothing more.',
        'Keep your sub IDs truthful — they are your own record, and they are also the review\'s first stop.',
        'If a source stops converting, stop sending it. Pushing volume through a dead source is how accounts get flagged.',
      ] },
      { kind: 'product', title: 'What AffiLayer does here', text: 'Traffic rules in the terms, per-offer restrictions, and manual review of conversions before they become payable.', href: '/terms', cta: 'Read the terms' },
    ],
  },
  {
    slug: 'publish-your-first-offer',
    heroImage: '/blog/publish-your-first-offer.jpg',
    title: 'How to publish your first offer on AffiLayer: payouts, caps, geos and traffic rules',
    description:
      'Publish an offer in four parts: the payout and conversion action, the caps, the countries and devices, and the traffic rules. Then approve affiliates.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'Guides',
    tags: ['advertisers', 'offers', 'caps', 'geo'],
    type: 'article',
    excerpt:
      'Your first offer is four decisions: what you pay for, how much you will accept, where, and from whom. Get those right and the rest follows.',
    body: [
      { kind: 'p', text: 'Publishing an offer is four decisions: what you pay for, how much you will accept, where you accept it, and from whom. Get those right and the rest follows.' },
      { kind: 'h2', text: '1. Payout and conversion action' },
      { kind: 'p', text: 'State the payout model (CPA, CPL, CPS or CPC), the exact conversion action, and the payout for each attributed conversion. Affiliates see this before they promote — a vague offer gets no traffic, because nobody can judge it.' },
      { kind: 'h2', text: '2. Caps' },
      { kind: 'p', text: 'Set a daily cap and a total cap. Start small: a daily cap lets you test with limited exposure, and you can raise it once the conversions look right. Caps are budget control — use them, and say so in the offer.' },
      { kind: 'h2', text: '3. Countries and devices' },
      { kind: 'p', text: 'List the countries and devices you accept. Traffic from outside that list is refused, not wasted — so be honest about where your offer actually converts.' },
      { kind: 'h2', text: '4. Traffic rules' },
      { kind: 'p', text: 'State which traffic sources are allowed and which are banned. Fraudulent traffic, bots, misleading creatives, forced clicks, incentivised traffic and chat traffic are already banned network-wide; add your own restrictions on top where they matter.' },
      { kind: 'h2', text: 'Then: approve affiliates, review conversions' },
      { kind: 'p', text: 'Affiliates apply to your offer where approval is required, and you approve them before they can generate a tracking link. Conversions arrive as pending, are reviewed, and only approved conversions enter the ledger and become payable — Net30 by default. AffiLayer is a small network growing offer by offer, so early advertisers shape the catalogue: publish one good offer, and the affiliates who run it well will ask for the next one.' },
      { kind: 'product', title: 'What AffiLayer does here', text: 'Publish offers with your own caps and traffic rules, approve affiliates, and pay only for conversions you have reviewed.', href: '/advertisers', cta: 'For advertisers' },
    ],
  },
  {
    slug: 'what-to-put-in-an-offer-brief',
    heroImage: '/blog/what-to-put-in-an-offer-brief.jpg',
    title: 'What Advertisers Should Put in an Offer Brief',
    description:
      'An offer brief is the agreement before the agreement: payout, caps, countries, traffic rules, conversion definition. What to write, and why each line matters.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'Guides',
    tags: ['advertisers', 'offers', 'brief', 'caps'],
    type: 'article',
    excerpt:
      'A good brief answers every question an affiliate would ask before promoting — and every question you would ask before paying.',
    body: [
      { kind: 'p', text: 'An offer brief is the document an affiliate reads before deciding whether to run your offer — and the document both sides point to when something is disputed. On AffiLayer the brief is the offer itself: the fields you fill in when you publish are the terms affiliates see, the rules their traffic is judged against, and the basis for every conversion review. Write it completely, and most disputes never happen.' },
      { kind: 'h2', text: '1. The payout and the conversion definition' },
      { kind: 'p', text: 'State the payout model — CPA, CPL, CPS or CPC — the exact conversion action, and the payout for each attributed conversion, in a three-letter currency such as USD. For CPS, state the commission rate in basis points (1000 basis points is 10% of the sale). The conversion definition is the most important line in the brief: "a completed purchase", not "a conversion". If the action is vague, affiliates cannot judge the offer and reviewers cannot judge the conversion. The four payout models differ in one thing — what triggers payment — and that trigger decides who bears the risk, as explained in [CPA vs CPL vs CPS vs CPC](/blog/cpa-vs-cpl-vs-cps-vs-cpc).' },
      { kind: 'h2', text: '2. Caps' },
      { kind: 'p', text: 'Set a daily cap and a total cap. The daily cap is the most clicks you will accept in one day and it resets the next day; the total cap is the most clicks you will accept in a calendar month, and when it is reached the offer stops accepting clicks until the month turns over. Start small: a low daily cap lets you test with limited exposure, and you can raise it once the conversions look right. On AffiLayer a click that would exceed a cap is refused rather than sent somewhere it cannot convert — the refusal is visible, so the affiliate knows the cap, not the traffic, is the reason.' },
      { kind: 'h2', text: '3. Countries and devices' },
      { kind: 'p', text: 'List the countries and devices you accept, and only those. Traffic from outside that list is refused, not wasted — so be honest about where your offer actually converts. An offer that accepts the United States and the United Kingdom should not list countries where the landing page does not work or the product is not sold. Country is the first filter the network checks: a SmartLink routes each visitor by country first, using fixed deterministic rules, so a wrong country list sends your traffic nowhere.' },
      { kind: 'h2', text: '4. Traffic rules' },
      { kind: 'p', text: 'State which traffic sources are allowed and which are banned, per offer. Fraudulent traffic, bots, misleading creatives, forced clicks, incentivised traffic and chat traffic are already banned network-wide under the [terms](/terms) — add your own restrictions on top where they matter, for example banning a source that converts badly for your product or requiring search traffic only. A rule written in the brief is enforceable; a rule mentioned in a chat message is not.' },
      { kind: 'h2', text: '5. The approval process' },
      { kind: 'p', text: 'Say whether affiliates need your approval before they can promote. On AffiLayer you can require approval per offer: affiliates apply, you review their profile, traffic source, vertical and GEO, and approve or decline them before they can generate a tracking link. State what you will check, so applicants know the bar before they apply — and say that approval is the start, not the end: conversions still arrive as pending, are reviewed, and only approved conversions enter the commission ledger and become payable, Net30 by default.' },
      { kind: 'callout', title: 'The brief is the dispute record', text: 'When a conversion is questioned, the brief is what both sides point to: was the action the one defined, was the country accepted, was the source allowed, was the cap already hit? Every line you write now is a question you do not have to argue about later.' },
      { kind: 'h2', text: 'What a brief is not' },
      { kind: 'p', text: 'A brief is not a promise of results. AffiLayer does not guarantee traffic, conversions or earnings — the [terms](/terms) say so plainly — and your brief should not promise them either. It is a description of what you will pay for, under what conditions. The more precisely it is written, the fewer good affiliates you lose to confusion and the fewer bad conversions you have to reject.' },
      { kind: 'product', title: 'What AffiLayer does here', text: 'Publish offers with your own payout, caps, countries, devices and traffic rules, require approval where you want it, and pay only for conversions you have reviewed.', href: '/advertisers', cta: 'For advertisers' },
      { kind: 'p', text: 'If you have not published an offer yet, start with the four decisions in [How to publish your first offer on AffiLayer](/blog/publish-your-first-offer) — payout and conversion action, caps, countries and devices, traffic rules — and treat this brief as the checklist that turns those decisions into words an affiliate can act on.' },
    ],
  },
  {
    slug: 'approving-affiliates-what-to-check',
    heroImage: '/blog/approving-affiliates-what-to-check.jpg',
    title: 'Approving Affiliates: What to Check Before You Say Yes',
    description:
      'Approval is a gate, not a guarantee. Check traffic source, vertical fit, GEO and quality signals — and know what saying yes does and does not promise.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'Guides',
    tags: ['advertisers', 'affiliates', 'approval', 'fraud'],
    type: 'article',
    excerpt:
      'Saying yes lets an affiliate generate a tracking link. It does not promise conversions, and it does not skip the review of what they send.',
    body: [
      { kind: 'p', text: 'On AffiLayer, offers can require approval: an affiliate applies, and you approve or decline them before they can generate a tracking link. That decision is the cheapest quality control you have — it costs a few minutes of review and it stops the wrong traffic before it starts. Here is what to check, and what the decision does and does not mean.' },
      { kind: 'h2', text: '1. The traffic source' },
      { kind: 'p', text: 'Ask where the traffic comes from — a website, a mailing list, paid ads, a community — and whether you can verify it. A source you cannot verify is one of the common reasons applications are declined, and it is the first thing the network\'s own review looks at too. If the affiliate cannot show you the source, you cannot judge whether it fits your offer, and you should not approve on trust alone. A verifiable source with modest volume beats an unverifiable one with big numbers.' },
      { kind: 'h2', text: '2. Vertical fit' },
      { kind: 'p', text: 'Does the affiliate work in your vertical? AffiLayer\'s catalogue covers Dating, Finance, Sweepstakes, Surveys, VPN and Entertainment, and an affiliate who runs Finance traffic well may know nothing about Dating audiences. Experience in the vertical is not a guarantee, but it is a signal: the affiliate already knows what the audience responds to, what creatives are honest for the product, and what a normal conversion rate looks like. A mismatch is not an automatic no — but it is a reason to start with a low cap and watch the first conversions closely.' },
      { kind: 'h2', text: '3. GEO' },
      { kind: 'p', text: 'Check that the countries the affiliate\'s traffic comes from are countries your offer accepts. Traffic from outside your accepted list is refused — it cannot convert — so an affiliate whose audience is in the wrong countries will earn nothing and waste their traffic, however good it is. This is the simplest check on the list and the most often skipped: match their GEO to your offer\'s GEO before you approve, not after the clicks arrive.' },
      { kind: 'h2', text: '4. Quality signals' },
      { kind: 'p', text: 'Read the application as a whole. Is the profile complete — traffic source, vertical, GEO, volume, payment details — or half empty? Does the affiliate describe their traffic specifically, or in generalities? Do they use sub IDs to label their clicks by campaign, placement and creative, so both sides can see what is working? None of these proves quality on its own. Together they show whether the affiliate treats the partnership as a business or as a lottery ticket. AffiLayer is a small network growing offer by offer, so early affiliates have short histories here — judge what they show you, not what they claim about elsewhere.' },
      { kind: 'h2', text: '5. Fraud patterns' },
      { kind: 'p', text: 'Know the patterns so you recognise them when the first conversions arrive: bots with no human behind the clicks, misleading creatives that promise what the offer does not deliver, forced clicks the visitor did not choose, incentivised traffic paid or rewarded to convert, and chat traffic the offer did not approve. All of these are banned network-wide. [Affiliate fraud: the patterns that get accounts rejected](/blog/affiliate-fraud-patterns) names each one and explains how review catches them — every click carries a click ID with country, device, referrer and sub-parameters, so patterns show up in the chain.' },
      { kind: 'callout', title: 'Approval is reversible', text: 'Approving an affiliate is not a permanent contract. Accounts may be suspended for fraud, misleading traffic or breach of the terms, and conversions from banned traffic are rejected on review. Approve generously, and revoke promptly when the traffic proves bad.' },
      { kind: 'h2', text: 'What approval does guarantee' },
      { kind: 'list', items: [
        'The affiliate can generate a tracking link for your offer, and their clicks will be recorded with a unique click ID.',
        'Their conversions will be attributed to those clicks and recorded as pending for review.',
        'You keep control: caps, countries, devices and traffic rules from your offer still apply to every click they send.',
      ] },
      { kind: 'h2', text: 'What approval does not guarantee' },
      { kind: 'list', items: [
        'It does not promise conversions or earnings — for either side. The network tracks and administers payouts; it does not guarantee results, and neither should you.',
        'It does not skip conversion review. Every conversion is reviewed before it becomes payable, and approved conversions enter the ledger on a Net30 schedule by default.',
        'It does not certify the affiliate\'s future traffic. An affiliate who runs clean traffic this month can send bad traffic next month — which is why review never stops.',
      ] },
      { kind: 'product', title: 'What AffiLayer does here', text: 'Per-offer approval: affiliates apply, you review profile, traffic source, vertical and GEO, and only approved affiliates can generate a tracking link. Conversions are still reviewed before they pay.', href: '/advertisers', cta: 'For advertisers' },
      { kind: 'p', text: 'Set the terms before you approve anyone: write the offer brief first — [What advertisers should put in an offer brief](/blog/what-to-put-in-an-offer-brief) — so every approval decision is measured against rules the affiliate has already seen.' },
    ],
  },
  {
    slug: 'setting-caps-and-payouts',
    heroImage: '/blog/setting-caps-and-payouts.jpg',
    title: 'Setting Caps and Payouts Without Losing Money',
    description:
      'Daily caps, total caps and the payout model are your budget controls. How to set them, what happens when a cap is hit, and when the money actually moves.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'Guides',
    tags: ['advertisers', 'caps', 'payouts', 'net30'],
    type: 'article',
    excerpt:
      'Caps and payout models are the same thing from two sides: the most you will spend, and what each conversion is worth to you.',
    body: [
      { kind: 'p', text: 'An advertiser\'s two worst surprises are the same surprise in different clothes: spending more than the budget allowed, and paying for conversions that were never worth the price. Caps prevent the first; the payout model prevents the second. Both are set when you publish the offer, and both are worth setting deliberately rather than leaving at whatever the form suggests.' },
      { kind: 'h2', text: 'Daily caps: your test budget' },
      { kind: 'p', text: 'A daily cap is the maximum number of clicks the offer accepts in one day, and it resets the next day. Treat it as your test budget. A new offer with an unproven affiliate should start with a low daily cap: enough conversions to judge quality — a handful, not hundreds — and low enough that a bad day costs little. When the conversions look right, raise the cap. When they do not, the cap has already limited the damage, and you can decline the affiliate or tighten the traffic rules instead of paying to learn the same lesson again.' },
      { kind: 'h2', text: 'Total caps: your hard stop' },
      { kind: 'p', text: 'A total cap is the maximum number of clicks the offer accepts in a calendar month, and it resets at the start of each month. When it is reached, the offer stops accepting clicks until the month turns over. Use it for a monthly budget: a launch with a set monthly spend, a test with a set number of conversions per month. The daily cap controls the pace; the total cap controls the month\'s spend. Set both, and the offer cannot outrun either.' },
      { kind: 'h2', text: 'What happens when a cap is hit' },
      { kind: 'p', text: 'On AffiLayer a click that would exceed a cap is refused rather than silently redirected to an offer it cannot convert on. The refusal is visible in the tracking response, so the affiliate knows the cap — not the traffic — is the reason. That matters for both sides: the affiliate stops wasting traffic on a capped offer, and you do not pay for conversions past your budget. SmartLink routing respects caps too — it uses fixed, deterministic rules (country, then device, then eligibility, then caps), so a capped offer is simply skipped for the next visitor, not forced through. [Offer caps explained](/blog/offer-caps-explained) covers daily and total caps in more detail.' },
      { kind: 'h2', text: 'Payout models: what each conversion is worth' },
      { kind: 'p', text: 'The payout model is what triggers payment, and the trigger decides who bears the risk. CPA pays on a defined action, CPL on a lead, CPS as a percentage of the sale, CPC on the click itself. The further the trigger is from the click, the more risk sits with the affiliate — and the more certain the outcome you are buying. Set the payout from the value of the outcome, not from what other offers pay: a lead that rarely becomes a customer is worth less than a sale, however cheap the lead looks. For CPS, the rate is set in basis points (1000 is 10% of the sale value). The four models are compared in [CPA vs CPL vs CPS vs CPC](/blog/cpa-vs-cpl-vs-cps-vs-cpc).' },
      { kind: 'callout', title: 'Start small, raise on evidence', text: 'Low caps and a payout matched to real value are not caution — they are the test. Raise the daily cap when conversions are approved, not when clicks arrive. Clicks are not evidence; approved conversions are.' },
      { kind: 'h2', text: 'When the money actually moves' },
      { kind: 'p', text: 'Caps control spending; the payout schedule controls timing. A conversion is recorded as pending, reviewed, and — if approved — entered in the commission ledger. Approved commissions become payable 30 days after the end of the month in which they were approved (Net30 by default). Payouts to affiliates are manual and admin-approved, and the transfer time depends on the payout method — payable is not the same as paid. You fund your account first, then pay only for conversions you have reviewed and approved. [What does Net30 mean?](/blog/what-does-net30-mean) works through the timeline with dates.' },
      { kind: 'h2', text: 'The honest arithmetic' },
      { kind: 'list', items: [
        'Your maximum spend in a month is the total cap multiplied by the payout — if either number is wrong, the budget is wrong.',
        'Your daily ceiling is the daily cap multiplied by the payout — the most the day can cost if every click converts. Check it against what you can afford to lose in one bad day.',
        'Your real cost is approved conversions only. Pending conversions are not payable, and rejected conversions never enter the ledger.',
        'Your first payment takes the longest: conversion, review, end of the approval month, then 30 days. Plan for it; nobody can sell you a faster schedule on this network.',
      ] },
      { kind: 'product', title: 'What AffiLayer does here', text: 'Set daily and total caps per offer, choose the payout model and rate, fund your account first, and pay only for conversions you have reviewed and approved — Net30 by default.', href: '/advertisers', cta: 'For advertisers' },
      { kind: 'p', text: 'Caps and payouts belong in the offer brief before the offer goes live — see [What advertisers should put in an offer brief](/blog/what-to-put-in-an-offer-brief) — so affiliates see the limits they are working within and you never have to argue about them afterwards.' },
    ],
  },
  {
    slug: 'finance-cpa-offers-explained',
    heroImage: '/blog/finance-cpa-offers-explained.jpg',
    title: 'Finance CPA Offers: What Converts and What to Watch',
    description:
      'Finance CPA pays for intent — but compliance and lead quality decide whether a lead is worth anything. What converts, what gets rejected, and what to watch.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'AdTech Insights',
    tags: ['finance', 'cpa', 'compliance', 'leads'],
    type: 'article',
    excerpt:
      'Finance traffic arrives with real intent and real scrutiny. The affiliates who do well here are the ones who respect both.',
    body: [
      { kind: 'p', text: 'Finance is one of the highest-intent verticals in CPA — and one of the least forgiving. A visitor looking for a loan, a card, a trading account or insurance is not browsing; they have a problem and they want a solution. That intent is why finance offers pay well. It is also why the advertiser checks every lead twice.' },
      { kind: 'h2', text: 'What finance traffic looks like' },
      { kind: 'p', text: 'Finance traffic is considered traffic. The visitor compares options, reads the terms, and often returns more than once before acting. Conversion rates per click are lower than in impulse verticals, but each conversion is worth more — because the advertiser is buying a customer with a lifetime value, not a passing click.' },
      { kind: 'p', text: 'It is also compliance-sensitive traffic. Financial products are regulated in most countries, and the rules change by market: what you may claim about rates, approval, or eligibility in one country may be illegal in another. A creative that promises "guaranteed approval" or a rate the product does not offer is not a clever angle — it is a rejected lead, a complaint from the advertiser, and a fast review of your account.' },
      { kind: 'p', text: 'And it is quality-judged traffic. A finance lead is not a form fill; it is a person the advertiser can actually serve. Leads with wrong contact details, duplicate submissions, or people who never asked to be contacted are rejected on review — and a stream of them tells the advertiser the traffic is not worth buying, whatever the volume.' },
      { kind: 'h2', text: 'What converts in finance' },
      { kind: 'list', items: [
        'CPL (cost per lead): the visitor submits a form with contact details — the most common finance trigger. The lead still has to be valid; junk leads are rejected on review.',
        'CPA (cost per action): the visitor completes a defined action, such as registering an account or finishing an application. The trigger is further down the funnel, so the payout is usually higher and the volume lower.',
        'CPS (cost per sale): the visitor completes a purchase or funds an account. The affiliate bears the most risk here, because a click that does not buy pays nothing — but the payout reflects that.',
      ] },
      { kind: 'p', text: 'Match the trigger to the funnel you actually have. If your audience is early-stage — comparing options, reading guides — a CPL lead form fits. If your audience is ready to open an account, a CPA action fits. Promoting a CPS offer to an audience that is still researching is the fastest way to earn nothing.' },
      { kind: 'h2', text: 'What to watch before you scale' },
      { kind: 'list', items: [
        'Claims must match the product. Promise only what the offer delivers — the rate, the terms, the eligibility. Misleading creatives are the single fastest way to lose a finance offer.',
        'Geo decides everything. Finance is country-specific by regulation, currency and language, so an offer that converts in one market may not accept traffic from another at all. We explain how country changes an offer in "Geo targeting in CPA: why the same offer pays differently in every country" (slug: geo-targeting-cpa-offers).',
        'Start inside the caps. Advertisers test finance offers with small daily caps while they check lead quality. Send a little, wait for the review, then scale what was approved — not what was clicked.',
        'Never incentivise a lead. Visitors paid or rewarded to fill in a finance form produce leads that are real and worthless, and they are rejected on review. The patterns are old and easy to spot — see "Affiliate fraud: the patterns that get accounts rejected" (slug: affiliate-fraud-patterns).',
      ] },
      { kind: 'callout', title: 'A lead is not a customer', text: 'In finance, the conversion is the start of the advertiser\'s work, not the end of it. The lead has to be contactable, eligible and real — and the review checks exactly that before the commission becomes payable.' },
      { kind: 'product', title: 'What AffiLayer does here', text: 'Per-offer GEO targeting, daily and total caps, signed server-to-server conversions, and manual review before any commission becomes payable. Track each placement with up to five sub-parameters, so you can see which of your finance clicks actually became leads.', href: '/affiliates', cta: 'For affiliates' },
      { kind: 'p', text: 'Catalogue status: as of December 2026, AffiLayer\'s live catalogue is a single active offer. Check the marketplace in your dashboard to see what is live in Finance right now — we are onboarding advertisers offer by offer, and early partners shape what comes next.' },
    ],
  },
  {
    slug: 'gaming-cpa-offers-explained',
    heroImage: '/blog/gaming-cpa-offers-explained.jpg',
    title: 'Gaming CPA Offers: Traffic, Payouts and Player Quality',
    description:
      'Gaming traffic is fast, huge and mixed in quality. Installs pay for volume, deposits pay for players — and that difference decides if the traffic is worth it.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'AdTech Insights',
    tags: ['gaming', 'cpa', 'payouts', 'traffic'],
    type: 'article',
    excerpt:
      'Gaming traffic is easy to buy and hard to judge. An install is cheap; a player who deposits is not — and the offer pays for the difference.',
    body: [
      { kind: 'p', text: 'Gaming is one of the biggest CPA verticals, and one of the easiest to misunderstand. The traffic is plentiful, the audience is engaged, and the clicks are cheap. What is not cheap is a player — and the gap between a click, an install, and a paying player is where most gaming campaigns are won or lost.' },
      { kind: 'h2', text: 'Where gaming traffic comes from' },
      { kind: 'list', items: [
        'Search and app stores: players looking for a specific game or genre. High intent, and the closest match to the offer.',
        'Social and video: short clips, gameplay, reviews. Huge volume, mixed intent — the creative does most of the qualifying.',
        'Streamers and communities: a streamer\'s audience trusts the recommendation, so the traffic converts better than cold social — when the game genuinely fits the audience.',
        'Pre-registration and launch traffic: players signing up before a game launches. Early and enthusiastic, but the conversion action is usually just the registration.',
      ] },
      { kind: 'h2', text: 'Install vs deposit: two different actions' },
      { kind: 'p', text: 'The payout model in gaming depends on which action the advertiser is buying. An install (CPA on install) is the shallowest trigger: the player downloads the game. It pays the least per conversion and produces the most volume — and the most players who never open the game twice.' },
      { kind: 'p', text: 'A deposit or first purchase is the deep trigger: the player not only installs but pays. It is far rarer and far better paid, and it is what the advertiser actually wants. Some offers pay per sale (CPS) on in-game purchases, which puts the most risk on the affiliate — a click that never buys pays nothing — but rewards the traffic that finds real players.' },
      { kind: 'p', text: 'Do not judge an offer by its install rate alone. An offer that pays a little for installs and nothing for players is buying downloads; an offer that pays for deposits is buying customers. Know which one you are promoting before you send traffic.' },
      { kind: 'h2', text: 'Quality vs volume' },
      { kind: 'p', text: 'Gaming is the vertical where volume lies most convincingly. A placement can deliver thousands of installs and not one player who stays past day one. That is why the review looks past the install: retention, activity, and whether the player ever pays. Traffic that installs and vanishes is not fraud — but it is not worth buying twice, and the advertiser will cap it or close it.' },
      { kind: 'p', text: 'Use your sub-parameters to find the difference. Label each click by campaign, placement and creative (sub1–sub5), and break down installs and deposits by placement — a campaign that looks profitable in total can be one good placement carrying four bad ones. We explain the mechanics in "Sub IDs explained: the 5 parameters that tell you which click earned" (slug: subid-tracking-explained).' },
      { kind: 'h2', text: 'Caps and geo matter more here than in most verticals' },
      { kind: 'p', text: 'Gaming offers are heavily geo-restricted: regulation, licensing and language differ by country, and an offer that accepts players in one market may refuse them in another. Country is the first thing a SmartLink checks — before device, before eligibility, before caps — so mixed-country traffic needs routing per visitor, not one link for everyone. Caps matter too: advertisers test a gaming offer with a small daily cap while they check player quality, so send a little, wait for the review, and scale what was approved. The cap rules are set out in "Offer caps explained: daily caps, total caps, and what happens when a cap is hit" (slug: offer-caps-explained).' },
      { kind: 'callout', title: 'SmartLink is deterministic', text: 'AffiLayer\'s SmartLink routes each visitor to an eligible offer using fixed, published rules — country, then device, then eligibility, then caps. It is not AI optimisation, not an auction, and it does not promise earnings. A routed click pays exactly like the offer it was routed to.' },
      { kind: 'product', title: 'What AffiLayer does here', text: 'Per-offer GEO targeting and caps, signed server-to-server conversions, and manual review before any commission becomes payable — so a deposit is attributed to the click that caused it, and only approved conversions enter the ledger.', href: '/affiliates', cta: 'For affiliates' },
      { kind: 'p', text: 'Catalogue status: as of December 2026, AffiLayer\'s live catalogue is a single active offer. Check the marketplace in your dashboard to see what is live in Gaming right now — we are onboarding advertisers offer by offer, and early partners shape what comes next.' },
    ],
  },
  {
    slug: 'dating-sweepstakes-cpa-offers',
    heroImage: '/blog/dating-sweepstakes-cpa-offers.jpg',
    title: 'Dating and Sweepstakes CPA: Traffic That Converts',
    description:
      'Dating and sweepstakes traffic is fast, mobile and impulse-led — and the verticals where a misleading creative costs you the account fastest. What to watch.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'AdTech Insights',
    tags: ['dating', 'sweepstakes', 'cpa', 'compliance'],
    type: 'article',
    excerpt:
      'Dating and sweepstakes convert on impulse — which is exactly why the quality checks around them are the strictest in the network.',
    body: [
      { kind: 'p', text: 'Dating and sweepstakes are the impulse verticals. The visitor decides in seconds, on a phone, often from a social feed — and the conversion is usually a registration or an entry, not a considered purchase. That speed is the opportunity and the risk: traffic that converts fast also goes wrong fast, and the advertisers in these verticals have learned to check first.' },
      { kind: 'h2', text: 'How dating traffic behaves' },
      { kind: 'p', text: 'Dating traffic is intent-led but shallow: the visitor wants to meet someone, and the first step is a free registration. Sessions are short, mobile-heavy, and very geo-sensitive — language, culture and local norms decide whether an offer works in a country at all. A registration is the common conversion trigger; a paying subscriber is the deeper one, and the two pay very differently.' },
      { kind: 'p', text: 'Quality in dating is about the registrant, not the click. A registration from a real person in the right country, on a real device, is worth something. A registration from a bot, a duplicate, or a visitor who was misled about what they were joining is not — and it is rejected on review.' },
      { kind: 'h2', text: 'How sweepstakes traffic behaves' },
      { kind: 'p', text: 'Sweepstakes traffic is prize-led: the visitor enters to win something, and the conversion is the entry — usually a form submission or a registration. Volume is high and intent is low; the visitor came for the prize, not the product. That makes sweepstakes the highest-volume, lowest-quality-risk vertical on the network: plenty of entries, and a large share that never become customers.' },
      { kind: 'p', text: 'The advertiser knows this, and prices accordingly. Sweepstakes offers usually pay per lead (CPL) on the entry, and judge the traffic on what happens after: how many entries are valid, contactable, and real. An entry that cannot be contacted is worth nothing, however cheap it was.' },
      { kind: 'h2', text: 'Compliance and quality pitfalls' },
      { kind: 'list', items: [
        'Misleading creatives: an ad that promises something the offer does not deliver — a prize that does not exist, a person who is not real, a "someone near you" claim with no basis. The click converts badly, the advertiser complains, the account is reviewed.',
        'Fake profiles and fabricated claims: dating creatives that imply a real person is waiting, or sweepstakes creatives that imply a prize is already won. Both are rejected on review, and both are the fastest way to lose the offer.',
        'Incentivised entries: visitors paid or rewarded to register or enter. The conversion is real and worthless, and it is rejected.',
        'Bots and forced clicks: clicks with no human behind them, or clicks the visitor did not choose to make. Every click carries a click ID with country, device and referrer, so the pattern is visible.',
        'Age and consent rules: dating offers carry age restrictions, and every offer carries its own traffic rules. Read them before you promote — the rules are stated on the offer, not discovered after the click.',
      ] },
      { kind: 'h2', text: 'What to watch before you scale' },
      { kind: 'list', items: [
        'Test small and wait for the review. Send a little traffic, see what is approved, then scale what was approved — not what was clicked. Conversions are recorded as pending and reviewed before they become payable.',
        'Keep your sub IDs truthful. Label clicks by campaign, placement and creative, and break down registrations by placement — one good placement can hide four bad ones.',
        'Read the offer\'s traffic rules, not just its payout. Each offer lists the sources it allows; network-wide, fraudulent traffic, bots, misleading creatives, forced clicks, incentivised traffic and chat traffic are banned. The full pattern list is in "Affiliate fraud: the patterns that get accounts rejected" (slug: affiliate-fraud-patterns).',
        'Mind the geo. Both verticals are country-sensitive — language and local rules first. Country is the first filter a SmartLink checks; see "Geo targeting in CPA: why the same offer pays differently in every country" (slug: geo-targeting-cpa-offers).',
      ] },
      { kind: 'callout', title: 'Impulse is not an excuse', text: 'That the visitor decided in seconds does not lower the bar — it raises it. The review checks the click, the attribution and the traffic source before anything becomes payable, and conversions from banned traffic are rejected.' },
      { kind: 'product', title: 'What AffiLayer does here', text: 'Per-offer GEO targeting and caps, signed server-to-server conversions, deterministic SmartLink routing, and manual review of every conversion before it enters the ledger. Payouts are manual and admin-approved, Net30 by default.', href: '/affiliates', cta: 'For affiliates' },
      { kind: 'p', text: 'Catalogue status: as of December 2026, AffiLayer\'s live catalogue is a single active offer. Check the marketplace in your dashboard to see what is live in Dating and Sweepstakes right now — we are onboarding advertisers offer by offer, and early partners shape what comes next.' },
    ],
  },
  {
    slug: 'reading-your-commission-ledger',
    heroImage: '/blog/reading-your-commission-ledger.jpg',
    title: 'Pending, Approved, Rejected, Reversed: Reading Your Ledger',
    description:
      'Every commission on AffiLayer sits in one of four ledger states — pending, approved, rejected or reversed. Here is what each one means, and when it pays.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'Guides',
    tags: ['ledger', 'payouts', 'commissions'],
    type: 'article',
    excerpt:
      'Four states, one record. Pending means under review, approved means payable on Net30, rejected means it never pays, and reversed means an approved commission was taken back.',
    body: [
      { kind: 'p', text: 'Your commission ledger is the record of what you have earned on AffiLayer — not an estimate, and not a dashboard guess. Every commission sits in one of four states: pending, approved, rejected or reversed. If you can read those four states, you can read your balance.' },
      { kind: 'h2', text: 'The four states' },
      { kind: 'list', items: [
        'Pending: the conversion has been attributed to your click and recorded, but it has not been reviewed yet. A pending commission is not payable.',
        'Approved: the conversion passed review and the commission entered the ledger. Only approved commissions become payable — on the Net30 schedule.',
        'Rejected: the conversion did not pass review. A rejected commission never becomes payable.',
        'Reversed: an approved commission was later taken back. The terms are plain about this: commission is earned only on conversions that are approved and not reversed.',
      ] },
      { kind: 'h2', text: 'What moves a commission between states' },
      { kind: 'p', text: 'Every conversion starts as pending. When a conversion happens, it is linked to the original click ID and recorded as pending — that is step five of how the network works. Review then moves it to approved or rejected. That is the normal path, and it is the only way a commission becomes payable.' },
      { kind: 'p', text: 'Reversal is the exception. An approved commission can be reversed after review — for example where fraud signals or a breach of the traffic rules come to light after approval. The terms prohibit incentivised, misleading, bot, chat or otherwise fraudulent traffic, and say fraud signals may lead to review, rejection of conversions, or account suspension. The live pages do not publish a fixed list of reversal triggers, and this post does not invent one: what is published is that only approved and not reversed commissions earn.' },
      { kind: 'h2', text: 'Why the ledger is append-only' },
      { kind: 'p', text: 'The ledger is append-only: every commission is written to it, and every change of state is recorded there. Nothing is silently overwritten, so the history of a commission stays visible — pending, then approved, then reversed, with a record of each change. That is the point of the ledger: it is the shared record both sides can check, rather than a balance that changes without explanation.' },
      { kind: 'p', text: 'This is also why a pending commission is not a promise. Until review approves it, the commission is a claim waiting to be checked — and until it is approved and not reversed, it is not earned.' },
      { kind: 'h2', text: 'How to read your own ledger' },
      { kind: 'p', text: 'Clicks appear in your reports as they are recorded. Conversions appear as pending once attributed, and move to approved, rejected or reversed after review. Your reports break clicks and conversions down by date, offer, country, device and source — the same numbers both sides see. Earnings become payable only from approved conversions in the commission ledger, so the number that matters for payout is the approved balance, not the pending one.' },
      { kind: 'h2', text: 'What each state means for payout' },
      { kind: 'list', items: [
        'Pending: not payable. It is waiting for review, and it does not count toward a payout request.',
        'Approved: payable on Net30 — 30 days after the end of the month in which the commission was approved. A commission approved in November becomes payable 30 days after 30 November.',
        'Rejected: never payable. It stays visible in the ledger as rejected, so you can see what was checked and what did not pass.',
        'Reversed: no longer payable. An approved commission that is reversed leaves the payable balance.',
      ] },
      { kind: 'p', text: 'Payouts themselves are manual and admin-approved: you request a payout from your dashboard when your balance is payable, and the team processes it after review. Minimum payout thresholds are set in your account settings and shown on the payouts page before you request a payout — balances below the threshold stay in your account until they reach it. The live pages do not publish a fixed minimum amount, so this post does not state one; the number that applies to you is the one shown on your payouts page.' },
      { kind: 'callout', title: 'Read the approved balance, not the pending one', text: 'The most common misunderstanding in the ledger is treating pending as earned. Pending is the queue, not the balance. Plan around the approved balance and the Net30 schedule — that is the money that is actually coming.' },
      { kind: 'product', title: 'What AffiLayer does here', text: 'An append-only commission ledger with four named states, reports that break clicks and conversions down by date, offer, country, device and source, and manual, admin-approved payouts on Net30 by default.', href: '/affiliates', cta: 'For affiliates' },
      { kind: 'h2', text: 'Further reading' },
      { kind: 'p', text: 'For the payout timing in detail, read "What does Net30 mean? Payout timing, holds and the real wait for your first payment" (/blog/what-does-net30-mean). For how a conversion gets attributed to your click in the first place, read "How affiliate tracking actually works: click IDs, postbacks and S2S" (/blog/how-affiliate-tracking-works).' },
    ],
  },
  {
    slug: 'how-we-review-conversions',
    heroImage: '/blog/how-we-review-conversions.jpg',
    title: 'How We Review Conversions Before They Become Payable',
    description:
      'Every conversion on AffiLayer is recorded as pending and reviewed by hand before it becomes payable. Here is what the review checks, and what happens next.',
    date: '2026-11-10',
    author: DEFAULT_AUTHOR,
    category: 'Guides',
    tags: ['review', 'conversions', 'payouts'],
    type: 'article',
    excerpt:
      'No conversion becomes payable on its own. Each one is recorded as pending, checked by our team, and only then approved, rejected — or later reversed.',
    body: [
      { kind: 'p', text: 'On AffiLayer, a conversion is not money the moment it happens. It is a claim: a visitor clicked your link, did something the advertiser pays for, and the network recorded it. Before that claim becomes payable, it is reviewed. This post describes that review as it is published — what is checked, who does it, and what happens on each outcome.' },
      { kind: 'h2', text: 'Step 1: the conversion is recorded as pending' },
      { kind: 'p', text: 'When a conversion happens, it is linked to the original click ID and recorded as pending. Every click carries a unique click ID with country, device, referrer and up to five sub-parameters, and the conversion is signed by the advertiser and deduplicated by idempotency key, so the same conversion reported twice counts once. Pending is the starting state of every conversion — nothing skips it.' },
      { kind: 'h2', text: 'What the review checks' },
      { kind: 'p', text: 'The live pages describe the review as checking the conversion before it becomes payable — the click, the attribution and the traffic source — with the advertiser\'s side settling too. In practice, that means the review looks at:' },
      { kind: 'list', items: [
        'The click: is there a real click behind this conversion, with a click ID, country, device, referrer and sub-parameters that behave like a person\'s click?',
        'The attribution: does the conversion link back to that click, for the right offer, under the offer\'s payout model and conversion action?',
        'The traffic source: was the traffic allowed by the offer and by the network rules? Fraudulent traffic, bots, misleading creatives, forced clicks, incentivised traffic and chat traffic are banned network-wide, and each offer lists its own allowed sources, countries and devices. Running a restricted source is grounds for conversion rejection.',
        'The conversion itself: is the action valid? A lead still has to be a valid lead — junk leads are rejected on review — and a sale still has to be a completed sale.',
      ] },
      { kind: 'h2', text: 'Approval vs rejection' },
      { kind: 'p', text: 'If the conversion passes review, it is approved: the commission enters the ledger and becomes payable on the Net30 schedule. If it does not pass, it is rejected — and a rejected conversion never becomes payable. Rejected conversions are visible in the ledger as rejected, so the outcome is on the record rather than hidden.' },
      { kind: 'p', text: 'Rejection is not a punishment for a bad month. It is the review doing its job on a single conversion: the click did not check out, the traffic was not allowed, or the lead was not valid. The rest of your ledger is unaffected.' },
      { kind: 'h2', text: 'The audit trail' },
      { kind: 'p', text: 'Every state change is recorded in the append-only commission ledger — pending, then approved, rejected or reversed, with a record of each change. Both sides see the same numbers: reports break clicks and conversions down by date, offer, country, device and source. The audit trail is the reason the review can be manual and still be trusted: any decision can be checked against the record behind it.' },
      { kind: 'h2', text: 'Manual admin approval' },
      { kind: 'p', text: 'The review is done by our team, by hand — and so are payouts. Applications are reviewed by the team, conversions are approved, rejected or reversed by review, and payouts are manual and admin-approved. The live pages promise no fixed time for the review: steps done by the team by hand carry no fixed time, and affiliates can check their application status on the approval page. The same honesty applies here — the review takes as long as the checking takes, and no review window is published.' },
      { kind: 'h2', text: 'Net30 timing after approval' },
      { kind: 'p', text: 'Approval starts the payout clock, not the click and not the conversion. Approved commissions become payable 30 days after the end of the month in which they were approved — Net30 by default. A commission approved in November becomes payable 30 days after 30 November. Payable means you can request the payout; the payout itself is manual and admin-approved, and the transfer time depends on the payout method. Payout methods and minimum thresholds are shown in your dashboard.' },
      { kind: 'h2', text: 'What happens on reversal' },
      { kind: 'p', text: 'Approval is not always the last word. An approved commission can be reversed after review, and the terms state that commission is earned only on conversions that are approved and not reversed. A reversed commission leaves the payable balance. The live pages do not publish a fixed list of reversal triggers or a time limit for reversals, and this post does not invent either. What is published is the traffic rules: fraud signals may lead to review, rejection of conversions, or account suspension — and a conversion that should not have been approved can be taken back.' },
      { kind: 'callout', title: 'The honest timeline', text: 'Conversion, then review by hand with no fixed time promised, then the end of the approval month, then 30 days. That is the schedule working as designed. A network that pays instantly is a network that has not checked.' },
      { kind: 'product', title: 'What AffiLayer does here', text: 'Six steps from sign-up to payout: create an account, get approved, publish or promote offers, track clicks, review conversions, get paid. Conversions are approved, rejected or reversed by review — never automatically.', href: '/how-it-works', cta: 'See how it works' },
      { kind: 'h2', text: 'Further reading' },
      { kind: 'p', text: 'For the payout timing in detail, read "What does Net30 mean? Payout timing, holds and the real wait for your first payment" (/blog/what-does-net30-mean). For the traffic patterns the review is looking for, read "Affiliate fraud: the patterns that get accounts rejected — and how to stay clean" (/blog/affiliate-fraud-patterns).' },
    ],
  },
]
