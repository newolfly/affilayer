import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { FAQ_GROUPS } from './faq-data'
import { POSTS } from './blog-data'

const SITE_URL = 'https://affilayer.com'
const OG_IMAGE = `${SITE_URL}/og-image.png`

export type SeoMeta = {
  title: string
  description: string
  ogType?: 'website' | 'article'
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
}

const ORGANIZATION = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'AffiLayer',
  url: `${SITE_URL}/`,
  email: 'support@affilayer.com',
  description:
    'A global CPA affiliate network. Direct offers and SmartLink routing, with full-funnel tracking and an auditable commission ledger.',
  address: {
    '@type': 'PostalAddress',
    addressCountry: 'US',
    addressRegion: 'New Mexico',
  },
}

const WEBSITE = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'AffiLayer',
  url: `${SITE_URL}/`,
}

function webPage(path: string, name: string, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    url: `${SITE_URL}${path}`,
    description,
    isPartOf: { '@type': 'WebSite', name: 'AffiLayer', url: `${SITE_URL}/` },
  }
}

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_GROUPS.flatMap((g) =>
    g.items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  ),
}

function blogPostingJsonLd(slug: string) {
  const post = POSTS.find((p) => p.slug === slug)
  if (!post) return undefined
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    datePublished: '2026-11-07',
    author: { '@type': 'Organization', name: 'AffiLayer', url: `${SITE_URL}/` },
    publisher: { '@type': 'Organization', name: 'AffiLayer', url: `${SITE_URL}/` },
    mainEntityOfPage: `${SITE_URL}/blog/${slug}`,
  }
}

const PAGES: Record<string, SeoMeta> = {
  '/': {
    title: 'AffiLayer — Global CPA Affiliate Network',
    description:
      'AffiLayer is a new global CPA network. Direct offers and SmartLink routing, full-funnel tracking, and an auditable commission ledger.',
    jsonLd: [ORGANIZATION, WEBSITE],
  },
  '/about': {
    title: 'About AffiLayer | Global CPA Affiliate Network',
    description:
      'AffiLayer is a new global CPA affiliate network operated by MarketSync Global LLC, New Mexico, USA. Tracking you can audit, a ledger you can trust.',
    jsonLd: webPage('/about', 'About AffiLayer', 'About AffiLayer, a new global CPA affiliate network.'),
  },
  '/advantages': {
    title: 'Why AffiLayer | Advantages of a Transparent CPA Network',
    description:
      'Auditable tracking, an append-only commission ledger, and approval flows on both sides. What AffiLayer does differently — and what it does not promise.',
    jsonLd: webPage('/advantages', 'What AffiLayer does differently', 'The advantages of AffiLayer: auditable tracking and an append-only commission ledger.'),
  },
  '/advertisers': {
    title: 'For Advertisers | Publish CPA Offers on AffiLayer',
    description:
      'Publish CPA, CPL, CPS or CPC offers with your own caps and traffic rules, approve affiliates, and pay only for conversions you have reviewed.',
    jsonLd: webPage('/advertisers', 'For advertisers', 'Publish offers on AffiLayer and pay only for conversions you have reviewed.'),
  },
  '/affiliates': {
    title: 'For Affiliates | Earn with CPA Offers & SmartLink',
    description:
      'Run direct CPA offers or send traffic through one SmartLink. Every click tracked, every conversion attributed, payouts from an auditable ledger.',
    jsonLd: webPage('/affiliates', 'For affiliates', 'Earn on AffiLayer with direct CPA offers or one SmartLink.'),
  },
  '/how-it-works': {
    title: 'How AffiLayer Works | From Signup to Payout',
    description:
      'Create an account, get approved, publish or promote offers, track clicks, review conversions, and get paid — manual, admin-approved, Net30 by default.',
    jsonLd: webPage('/how-it-works', 'How AffiLayer works', 'How AffiLayer works, from signup to payout.'),
  },
  '/faq': {
    title: 'FAQ | AffiLayer CPA Affiliate Network',
    description:
      'Straight answers about joining AffiLayer, running traffic, SmartLink, and getting paid. Manual admin-approved payouts, Net30 by default.',
    jsonLd: [webPage('/faq', 'Frequently asked questions', 'Frequently asked questions about AffiLayer.'), FAQ_JSONLD],
  },
  '/blog': {
    title: 'Blog | AffiLayer',
    description:
      'Launch notes and plain notes on affiliate marketing — what we built, what changed, and what we learned running the network.',
    jsonLd: webPage('/blog', 'AffiLayer blog', 'Launch notes and plain notes on affiliate marketing.'),
  },
  '/contact': {
    title: 'Contact AffiLayer | Support & Enquiries',
    description:
      'Questions about an offer, a payout, or running traffic? Email support@affilayer.com or send a message — our team replies to the email you give.',
    jsonLd: webPage('/contact', 'Contact AffiLayer', 'Contact AffiLayer support.'),
  },
  '/terms': {
    title: 'Terms of Service | AffiLayer',
    description:
      'AffiLayer Terms of Service. Operated by MarketSync Global LLC, New Mexico, USA. Tracking, commissions, payouts and prohibited traffic.',
    jsonLd: webPage('/terms', 'Terms of Service', 'AffiLayer Terms of Service.'),
  },
  '/privacy': {
    title: 'Privacy Policy | AffiLayer',
    description:
      'AffiLayer Privacy Policy. What data we collect, how we use it, and how to contact us. Operated by MarketSync Global LLC, New Mexico, USA.',
    jsonLd: webPage('/privacy', 'Privacy Policy', 'AffiLayer Privacy Policy.'),
  },
}

function metaFor(path: string): SeoMeta {
  if (PAGES[path]) return PAGES[path]
  const blog = path.match(/^\/blog\/([\w-]+)$/)
  if (blog) {
    const post = POSTS.find((p) => p.slug === blog[1])
    if (post) {
      return {
        title: `${post.title} | AffiLayer Blog`,
        description: post.excerpt,
        ogType: 'article',
        jsonLd: blogPostingJsonLd(post.slug),
      }
    }
  }
  return {
    title: 'AffiLayer — Global CPA Affiliate Network',
    description:
      'AffiLayer is a new global CPA network. Direct offers and SmartLink routing, full-funnel tracking, and an auditable commission ledger.',
  }
}

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.head.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setCanonical(url: string) {
  let el = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', url)
}

function setJsonLd(data: SeoMeta['jsonLd']) {
  let el = document.head.querySelector('#affilayer-jsonld') as HTMLScriptElement | null
  if (!data) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('script')
    el.id = 'affilayer-jsonld'
    el.type = 'application/ld+json'
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(Array.isArray(data) ? data : [data])
}

/** Applies the current route's title, meta tags, canonical URL and JSON-LD.
 *  Mount once inside the router. The prerender script captures this same
 *  DOM, so the static HTML carries the correct per-page SEO. */
export function RouteSeo() {
  const { pathname } = useLocation()
  useEffect(() => {
    const meta = metaFor(pathname)
    const url = `${SITE_URL}${pathname === '/' ? '/' : pathname}`
    document.title = meta.title
    setMeta('description', meta.description)
    setMeta('og:title', meta.title, 'property')
    setMeta('og:description', meta.description, 'property')
    setMeta('og:url', url, 'property')
    setMeta('og:type', meta.ogType ?? 'website', 'property')
    setMeta('og:image', OG_IMAGE, 'property')
    setMeta('twitter:title', meta.title)
    setMeta('twitter:description', meta.description)
    setMeta('twitter:image', OG_IMAGE)
    setCanonical(url)
    setJsonLd(meta.jsonLd)
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}
