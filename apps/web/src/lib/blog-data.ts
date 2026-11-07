// Blog post data shared by the blog pages and the SEO/JSON-LD module.
export type Post = {
  slug: string
  title: string
  category: string
  date: string
  author: string
  excerpt: string
  body: string[]
}

export const POSTS: Post[] = [
  {
    slug: 'affilayer-is-live',
    title: 'AffiLayer is live: what the network offers on day one',
    category: 'Launch Notes',
    date: '7 November 2026',
    author: 'AffiLayer team',
    excerpt:
      'The network opens with direct CPA offers, SmartLink routing, full-funnel tracking and an auditable commission ledger — and nothing we have not actually built.',
    body: [
      'AffiLayer opens today as a new CPA affiliate network. This post says exactly what is live on day one — no more, no less.',
      'Direct CPA offers. Advertisers publish offers with a stated payout model (CPA, CPL, CPS or CPC), allowed countries, devices and traffic sources, and daily and total caps. Affiliates browse the marketplace, apply where approval is required, and generate tracking links with up to five sub-parameters.',
      'SmartLink. One link routes each visitor to an eligible offer for their country and device, using clear deterministic rules. It is not AI optimisation and it does not promise earnings — it matches traffic to offers it is allowed to run, and shows which offer each click landed on.',
      'Tracking you can audit. Every click gets a unique click ID with country, device, referrer and sub-parameters, and stays linked to its conversion. Conversions are signed, deduplicated by idempotency key, and recorded as pending until reviewed.',
      'A ledger, not an estimate. Commissions move through pending, approved, rejected or reversed states with a record of each change. Payouts are manual and admin-approved, on a Net30 schedule by default.',
      'What is not live yet: the Supabase backend that turns demo-mode writes into stored records is still being connected, and our offer catalogue is small while we onboard advertisers offer by offer. Both are in progress, and this blog is where we will say when they land.',
      'If you run traffic in Dating, Finance, Gaming, Sweepstakes, Nutra or iGaming, create an account and apply — early partners shape the catalogue.',
    ],
  },
]
