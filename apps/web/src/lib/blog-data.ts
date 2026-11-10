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

export function relatedPosts(post: Post, count = 3): Post[] {
  const others = POSTS.filter((p) => p.slug !== post.slug)
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

export const POSTS: Post[] = [
  {
    slug: 'affilayer-is-live',
    title: 'AffiLayer is live: what the network offers on day one',
    description:
      'AffiLayer opens 7 November 2026 with direct CPA offers, SmartLink routing, full-funnel tracking and an append-only commission ledger.',
    date: '2026-11-07',
    updated: '2026-11-10',
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
      { kind: 'p', text: 'If you run traffic in Dating, Finance, Gaming, Sweepstakes, Nutra or iGaming, create an account and apply — early partners shape the catalogue.' },
    ],
  },
  {
    slug: 'what-is-a-cpa-network',
    title: 'What is a CPA network? How affiliates, advertisers and the network fit together',
    description:
      'A CPA network connects advertisers who pay for a defined action with affiliates who drive it — and handles tracking, attribution and payouts.',
    date: '2026-11-11',
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
    title: 'CPA vs CPL vs CPS vs CPC: which payout model pays you, and when',
    description:
      'CPA, CPL, CPS and CPC differ in one thing: what triggers payment. The trigger decides who bears the risk — and when a commission becomes payable.',
    date: '2026-11-13',
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
    title: 'What is a SmartLink? One link, many offers — and what ours does differently',
    description:
      'A SmartLink is one tracking link that routes each visitor to an eligible offer for their country and device. Ours uses fixed, published rules.',
    date: '2026-11-16',
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
    title: 'How affiliate tracking actually works: click IDs, postbacks and S2S',
    description:
      'A click gets a unique ID, the conversion is linked back to it, and the record is signed and deduplicated. That chain is the whole of tracking.',
    date: '2026-11-18',
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
    title: 'Why your conversions go missing: pixels, ad blockers and the case for server-to-server',
    description:
      'A conversion that never reaches the network never pays. Pixels lose conversions to browsers; server-to-server reporting does not depend on them.',
    date: '2026-11-20',
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
    title: 'How to choose a CPA network: 7 checks before you send your first click',
    description:
      'Seven checks before you send traffic: tracking you can audit, a ledger you can read, honest payout terms, and no promises the network cannot keep.',
    date: '2026-11-23',
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
    title: 'Sub IDs explained: the 5 parameters that tell you which click earned',
    description:
      'Sub IDs are labels you attach to your own clicks — campaign, placement, creative. Five of them, and they are how you learn what actually converts.',
    date: '2026-11-25',
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
    title: 'What does Net30 mean? Payout timing, holds and the real wait for your first payment',
    description:
      'Net30 means approved commissions become payable 30 days after the end of the month in which they were approved. A worked example, with dates.',
    date: '2026-11-27',
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
    title: 'Offer caps explained: daily caps, total caps, and what happens when a cap is hit',
    description:
      'A cap is the advertiser saying "this much, and no more". Daily caps reset; total caps end the offer. A capped click is refused, not wasted.',
    date: '2026-11-30',
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
        'Total cap: the maximum for the whole life of the offer. When it is reached, the offer stops — no more clicks are accepted, even if the offer page is still up.',
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
    title: 'Geo targeting in CPA: why the same offer pays differently in every country',
    description:
      'The same offer in the United States and in Brazil is two different offers: different audiences, different payouts, different rules. Geo decides.',
    date: '2026-12-02',
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
      { kind: 'product', title: 'What AffiLayer does here', text: 'Country pages for 11 countries, per-offer GEO targeting, and a SmartLink that routes by country first.', href: '/geo', cta: 'Browse by country' },
    ],
  },
  {
    slug: 'affiliate-fraud-patterns',
    title: 'Affiliate fraud: the patterns that get accounts rejected — and how to stay clean',
    description:
      'Bots, misleading creatives, forced clicks and incentivised traffic. The patterns are old, the detection is straightforward, and clean traffic has nothing to fear.',
    date: '2026-12-04',
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
    title: 'How to publish your first offer on AffiLayer: payouts, caps, geos and traffic rules',
    description:
      'Publish an offer in four parts: the payout and conversion action, the caps, the countries and devices, and the traffic rules. Then approve affiliates.',
    date: '2026-12-07',
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
]
