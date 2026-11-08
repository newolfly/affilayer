import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PublicLayout, Reveal, Slogan } from '../components/layout'
import { PageArt, PageHighlights } from '../components/illustrations'
import { POSTS } from '../lib/blog-data'
import { useT } from '../lib/i18n'



const CATEGORIES = ['All', 'Launch Notes', 'AdTech Insights', 'News']

export function Blog() {
  const t = useT()
  const [tab, setTab] = useState('All')
  const shown = tab === 'All' ? POSTS : POSTS.filter((p) => p.category === tab)
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        AffiLayer <span className="grad-text">blog</span>
      </h1>
      <Slogan className="mt-4">{t('blog.slogan')}</Slogan>
      <p className="mt-4 max-w-3xl text-slate-300">
        Launch notes and plain notes on affiliate marketing — what we built, what
        changed, and what we learned running the network.
      </p>
      <PageArt
        variant="blog"
        label="Illustration: the AffiLayer hub connecting launch notes, AdTech insights and news"
        nodes={['Launch notes', 'AdTech insights', 'News', 'In our own words']}
        caption="notes from building in the open"
      />
      <PageHighlights
        items={[
          { icon: 'sparkle', text: 'Launch notes — what we built and what changed, in our own words.' },
          { icon: 'search', text: 'AdTech insights — plain notes on tracking, attribution and payouts.' },
          { icon: 'file', text: 'News — new pages, new offers and new countries as they land.' },
        ]}
      />
      <div className="mt-6 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setTab(c)}
            className={`rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === c ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400 text-[#0B1220]' : 'border border-slate-600 text-slate-300 hover:border-amber-400 hover:text-white'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="mt-10 rounded-xl border border-slate-800 bg-[#111C30]/60 p-8 text-center">
          <p className="font-semibold text-white">No posts yet in {tab}.</p>
          <p className="mt-2 text-sm text-slate-400">Launch notes are coming soon — check back, or start with the post below.</p>
          <Link to="/blog" onClick={() => setTab('All')} className="pill-btn mt-4">See all posts</Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {shown.map((p) => (
            <Reveal key={p.slug}>
            <article className="lift h-full rounded-xl bg-white p-6 text-slate-900">
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">{p.category}</p>
              <h2 className="mt-2 text-lg font-bold">
                <Link to={`/blog/${p.slug}`} className="transition-colors hover:text-amber-400">{p.title}</Link>
              </h2>
              <p className="mt-2 text-sm text-slate-600">{p.excerpt}</p>
              <p className="mt-3 text-xs text-slate-400">{p.date} · {p.author}</p>
              <Link to={`/blog/${p.slug}`} className="mt-3 inline-block font-semibold text-amber-400 transition-colors hover:text-amber-300">Read more →</Link>
            </article>
            </Reveal>
          ))}
        </div>
      )}
      <aside className="mt-10 rounded-xl border border-slate-800 bg-[#111C30]/60 p-6">
        <h2 className="font-semibold text-white">Featured</h2>
        <Link to="/blog/affilayer-is-live" className="mt-2 block font-semibold text-amber-400 hover:text-amber-300">
          AffiLayer is live: what the network offers on day one
        </Link>
        <p className="mt-1 text-sm text-slate-400">7 November 2026 · AffiLayer team</p>
      </aside>
    </PublicLayout>
  )
}

export function BlogPost() {
  const t = useT()
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
      <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-amber-400">{post.category}</p>
      <h1 className="mt-2 max-w-3xl text-3xl font-bold text-white md:text-4xl">{post.title}</h1>
      <p className="mt-3 text-sm text-slate-400">{post.date} · {post.author}</p>
      <Slogan className="mt-4">{t('blog.post.slogan')}</Slogan>
      <PageArt
        variant="blog"
        label={`Illustration: the AffiLayer hub for the post “${post.title}”`}
        nodes={['Launch notes', 'AdTech insights', 'News', post.category]}
        caption={post.category}
      />
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
