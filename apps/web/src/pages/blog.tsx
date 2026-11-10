import { Link, useParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { PublicLayout, Reveal, Slogan } from '../components/layout'
import { PageArt, PageHighlights } from '../components/illustrations'
import { formatPostDate, publishedPosts, readingTime, relatedPosts } from '../lib/blog-data'
import type { Block, Post } from '../lib/blog-data'
import { useLocale, useT } from '../lib/i18n'

export const CATEGORIES = ['Launch Notes', 'AdTech Insights', 'Guides', 'News'] as const
export const CATEGORY_SLUGS: Record<string, string> = {
  'launch-notes': 'Launch Notes',
  'adtech-insights': 'AdTech Insights',
  guides: 'Guides',
  news: 'News',
}
export function categorySlug(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

const SORTED = [...publishedPosts()].sort((a, b) => +new Date(b.date) - +new Date(a.date))

/** Inline [text](/path) links inside paragraph / list / callout text. */
function renderInline(text: string): ReactNode {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, i) => {
    const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (!m) return <span key={i}>{part}</span>
    const external = m[2].startsWith('http')
    return (
      <a key={i} href={m[2]} className="font-semibold text-amber-700 underline hover:text-amber-800" {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
        {m[1]}
      </a>
    )
  })
}

function renderBlock(block: Block, i: number): ReactNode {
  switch (block.kind) {
    case 'h2':
      return <h2 key={i} className="pt-2 text-xl font-bold text-slate-900">{block.text}</h2>
    case 'h3':
      return <h3 key={i} className="pt-1 text-lg font-bold text-slate-900">{block.text}</h3>
    case 'list':
      return (
        <ul key={i} className="list-disc space-y-2 pl-5">
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>
      )
    case 'callout':
      return (
        <aside key={i} className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          {block.title && <p className="font-bold text-amber-800">{block.title}</p>}
          <p className="mt-1 text-sm">{renderInline(block.text)}</p>
        </aside>
      )
    case 'product':
      return (
        <aside key={i} className="rounded-xl border border-slate-300 bg-[#111C30] p-5 text-white">
          <p className="font-bold text-amber-400">{block.title}</p>
          <p className="mt-1 text-sm text-slate-300">{renderInline(block.text)}</p>
          <Link to={block.href} className="mt-3 inline-block font-semibold text-amber-400 hover:text-amber-300">{block.cta} →</Link>
        </aside>
      )
    default:
      return <p key={i}>{renderInline(block.text)}</p>
  }
}

function PostCard({ p }: { p: Post }) {
  return (
    <Reveal>
      <article className="lift h-full rounded-xl bg-white p-6 text-slate-900">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">{p.category}</p>
        <h2 className="mt-2 text-lg font-bold">
          <Link to={`/blog/${p.slug}`} className="transition-colors hover:text-amber-700">{p.title}</Link>
        </h2>
        <p className="mt-2 text-sm text-slate-600">{p.excerpt}</p>
        <p className="mt-3 text-xs text-slate-500">
          {formatPostDate(p.date)} · {p.author.name} · {readingTime(p)} min read
          {p.updated ? ` · Updated ${formatPostDate(p.updated)}` : ''}
        </p>
        <Link to={`/blog/${p.slug}`} className="mt-3 inline-block font-semibold text-amber-700 transition-colors hover:text-amber-800">Read more →</Link>
      </article>
    </Reveal>
  )
}

function PostList({ posts, empty }: { posts: Post[]; empty: string }) {
  if (posts.length === 0) {
    return (
      <div className="mt-10 rounded-xl border border-slate-800 bg-[#111C30]/60 p-8 text-center">
        <p className="font-semibold text-white">{empty}</p>
        <Link to="/blog" className="pill-btn mt-4">See all posts</Link>
      </div>
    )
  }
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      {posts.map((p) => (
        <PostCard key={p.slug} p={p} />
      ))}
    </div>
  )
}

function BlogHead({ title, sub }: { title: ReactNode; sub: string }) {
  const t = useT()
  return (
    <>
      <h1 className="text-3xl font-bold text-white md:text-4xl">{title}</h1>
      <Slogan className="mt-4">{t('blog.slogan')}</Slogan>
      <p className="mt-4 max-w-3xl text-slate-300">{sub}</p>
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
        <Link to="/blog" className="rounded-full border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:border-amber-400 hover:text-white">All</Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c}
            to={`/blog/category/${categorySlug(c)}`}
            className="rounded-full border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:border-amber-400 hover:text-white"
          >
            {c}
          </Link>
        ))}
        <Link to="/news" className="rounded-full border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:border-amber-400 hover:text-white">News</Link>
        <a href="/rss.xml" className="rounded-full border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:border-amber-400 hover:text-white">RSS</a>
      </div>
    </>
  )
}

export function Blog() {
  const locale = useLocale()
  return (
    <PublicLayout>
      <BlogHead
        title={<>AffiLayer <span className="grad-text">blog</span></>}
        sub="Launch notes and plain notes on affiliate marketing — what we built, what changed, and what we learned running the network."
      />
      {locale !== 'en' && (
        <p className="mt-6 rounded-xl border border-slate-800 bg-[#111C30]/60 p-4 text-sm text-slate-300">
          Posts are published in English. This index lists them all — the English blog is the full archive.
        </p>
      )}
      <PostList posts={SORTED} empty="No posts yet." />
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

export function BlogCategory() {
  const { category } = useParams()
  const name = CATEGORY_SLUGS[category ?? '']
  if (!name) {
    return (
      <PublicLayout>
        <h1 className="text-3xl font-bold text-white">Category not found</h1>
        <p className="mt-4 text-slate-300">That blog category does not exist.</p>
        <Link to="/blog" className="pill-btn mt-6">Back to the blog</Link>
      </PublicLayout>
    )
  }
  const shown = SORTED.filter((p) => p.category === name)
  return (
    <PublicLayout>
      <BlogHead
        title={<>{name} <span className="grad-text">— AffiLayer blog</span></>}
        sub={`Posts in ${name} — launch notes and plain notes on affiliate marketing.`}
      />
      <PostList posts={shown} empty={`No posts yet in ${name}.`} />
    </PublicLayout>
  )
}

/** /news is a filtered view of the same post system (type=news), not a
 *  second CMS. News posts live at /blog/:slug with canonical there. */
export function News() {
  const news = SORTED.filter((p) => p.type === 'news')
  return (
    <PublicLayout>
      <BlogHead
        title={<>AffiLayer <span className="grad-text">news</span></>}
        sub="Dated announcements only: product updates, offer launches, network milestones and policy changes — nothing else."
      />
      <PostList posts={news} empty="No news yet. Announcements are published here only when something real happens — a feature shipped, an offer launched, or a policy changed." />
    </PublicLayout>
  )
}

export function BlogPost() {
  const t = useT()
  const { slug } = useParams()
  const post = publishedPosts().find((p) => p.slug === slug)
  if (!post) {
    return (
      <PublicLayout>
        <h1 className="text-3xl font-bold text-white">Post not found</h1>
        <p className="mt-4 text-slate-300">That post does not exist yet.</p>
        <Link to="/blog" className="pill-btn mt-6">Back to the blog</Link>
      </PublicLayout>
    )
  }
  const idx = SORTED.findIndex((p) => p.slug === post.slug)
  const prev = idx > 0 ? SORTED[idx - 1] : undefined
  const next = idx >= 0 && idx < SORTED.length - 1 ? SORTED[idx + 1] : undefined
  const related = relatedPosts(post)
  const url = `https://affilayer.com/blog/${post.slug}`
  return (
    <PublicLayout>
      <nav className="text-sm text-slate-400">
        <Link to="/" className="hover:text-white">Home</Link> {' / '}
        <Link to="/blog" className="hover:text-white">Blog</Link> {' / '}
        <Link to={`/blog/category/${categorySlug(post.category)}`} className="hover:text-white">{post.category}</Link> {' / '}
        <span className="text-slate-300">{post.title}</span>
      </nav>
      <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-amber-400">{post.category}</p>
      <h1 className="mt-2 max-w-3xl text-3xl font-bold text-white md:text-4xl">{post.title}</h1>
      <p className="mt-3 text-sm text-slate-400">
        {formatPostDate(post.date)} · {post.author.name} · {readingTime(post)} min read
        {post.updated ? ` · Updated ${formatPostDate(post.updated)}` : ''}
      </p>
      <Slogan className="mt-4">{t('blog.post.slogan')}</Slogan>
      <PageArt
        variant="blog"
        label={`Illustration: the AffiLayer hub for the post “${post.title}”`}
        nodes={['Launch notes', 'AdTech insights', 'News', post.category]}
        caption={post.category}
      />
      <div className="mt-6 space-y-4 rounded-xl bg-white p-6 text-slate-700">
        {post.body.map((block, i) => renderBlock(block, i))}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {post.tags.map((tag) => (
          <span key={tag} className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300">{tag}</span>
        ))}
      </div>
      <aside className="mt-6 rounded-xl border border-slate-800 bg-[#111C30]/60 p-6">
        <p className="font-semibold text-white">{post.author.name} — {post.author.role}</p>
        <p className="mt-1 text-sm text-slate-400">{post.author.bio}</p>
      </aside>
      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <span className="font-semibold text-slate-300">Share:</span>
        <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer" className="font-semibold text-amber-400 hover:text-amber-300">X</a>
        <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer" className="font-semibold text-amber-400 hover:text-amber-300">LinkedIn</a>
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer" className="font-semibold text-amber-400 hover:text-amber-300">Facebook</a>
      </div>
      <div className="mt-6 flex flex-wrap justify-between gap-3">
        {prev ? (
          <Link to={`/blog/${prev.slug}`} className="pill-btn-outline">← {prev.title}</Link>
        ) : <span />}
        {next && (
          <Link to={`/blog/${next.slug}`} className="pill-btn-outline">{next.title} →</Link>
        )}
      </div>
      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold text-white">Related posts</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {related.map((p) => (
              <article key={p.slug} className="rounded-xl bg-white p-5 text-slate-900">
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">{p.category}</p>
                <h3 className="mt-2 font-bold">
                  <Link to={`/blog/${p.slug}`} className="hover:text-amber-700">{p.title}</Link>
                </h3>
                <p className="mt-2 text-xs text-slate-500">{formatPostDate(p.date)} · {p.author.name}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/blog" className="pill-btn-outline">← All posts</Link>
        <Link to="/register" className="pill-btn">Create an account</Link>
      </div>
    </PublicLayout>
  )
}
