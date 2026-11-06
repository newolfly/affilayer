import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PublicLayout } from '../components/layout'

type Post = {
  slug: string
  title: string
  category: string
  date: string
  author: string
  excerpt: string
  body: string[]
}

const POSTS: Post[] = [
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

const CATEGORIES = ['All', 'Launch Notes', 'AdTech Insights', 'News']

export function Blog() {
  const [tab, setTab] = useState('All')
  const shown = tab === 'All' ? POSTS : POSTS.filter((p) => p.category === tab)
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        AffiLayer <span className="grad-text">blog</span>
      </h1>
      <p className="mt-4 max-w-3xl text-slate-300">
        Launch notes and plain notes on affiliate marketing — what we built, what
        changed, and what we learned running the network.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setTab(c)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === c ? 'bg-gradient-to-r from-orange-500 to-yellow-500 text-white' : 'border border-slate-600 text-slate-300'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="mt-10 rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center">
          <p className="font-semibold text-white">No posts yet in {tab}.</p>
          <p className="mt-2 text-sm text-slate-400">Launch notes are coming soon — check back, or start with the post below.</p>
          <Link to="/blog" onClick={() => setTab('All')} className="pill-btn mt-4">See all posts</Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {shown.map((p) => (
            <article key={p.slug} className="rounded-xl bg-white p-6 text-slate-900">
              <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">{p.category}</p>
              <h2 className="mt-2 text-lg font-bold">
                <Link to={`/blog/${p.slug}`} className="hover:text-orange-600">{p.title}</Link>
              </h2>
              <p className="mt-2 text-sm text-slate-600">{p.excerpt}</p>
              <p className="mt-3 text-xs text-slate-400">{p.date} · {p.author}</p>
              <Link to={`/blog/${p.slug}`} className="mt-3 inline-block font-semibold text-orange-600">Read more →</Link>
            </article>
          ))}
        </div>
      )}
      <aside className="mt-10 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="font-semibold text-white">Featured</h2>
        <Link to="/blog/affilayer-is-live" className="mt-2 block font-semibold text-orange-400 hover:text-orange-300">
          AffiLayer is live: what the network offers on day one
        </Link>
        <p className="mt-1 text-sm text-slate-400">7 November 2026 · AffiLayer team</p>
      </aside>
    </PublicLayout>
  )
}

export function BlogPost() {
  const { slug } = useParams()
  const post = POSTS.find((p) => p.slug === slug)
  if (!post) {
    return (
      <PublicLayout>
        <h1 className="text-3xl font-bold text-white">Post not found</h1>
        <p className="mt-4 text-slate-300">That post does not exist yet.</p>
        <Link to="/blog" className="pill-btn mt-6">Back to the blog</Link>
      </PublicLayout>
    )
  }
  return (
    <PublicLayout>
      <nav className="text-sm text-slate-400">
        <Link to="/" className="hover:text-white">Home</Link> {' / '}
        <Link to="/blog" className="hover:text-white">Blog</Link> {' / '}
        <span className="text-slate-300">{post.title}</span>
      </nav>
      <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-orange-400">{post.category}</p>
      <h1 className="mt-2 max-w-3xl text-3xl font-bold text-white md:text-4xl">{post.title}</h1>
      <p className="mt-3 text-sm text-slate-400">{post.date} · {post.author}</p>
      <div className="mt-6 space-y-4 rounded-xl bg-white p-6 text-slate-700">
        {post.body.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/blog" className="pill-btn-outline">← All posts</Link>
        <Link to="/register" className="pill-btn">Create an account</Link>
      </div>
    </PublicLayout>
  )
}
