import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { FAQ_GROUPS } from './faq-data'
import { POSTS } from './blog-data'
import { DICT } from './i18n-dict'
import { localeFromPath, basePath, alternatesFor } from './i18n'
import type { Locale } from './i18n'
import { countryByCode } from './geo-data'

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

function webPage(path: string, name: string, description: string, lang: Locale = 'en') {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    url: `${SITE_URL}${path}`,
    description,
    inLanguage: lang,
    isPartOf: { '@type': 'WebSite', name: 'AffiLayer', url: `${SITE_URL}/` },
  }
}

function breadcrumb(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  }
}

const HOME_NAME: Record<Locale, string> = { en: 'Home', es: 'Inicio', pt: 'Início' }

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
  '/geo': {
    title: 'AffiLayer by Country | Global CPA Affiliate Network',
    description:
      'AffiLayer is open worldwide. Choose a country to see how affiliates and advertisers work with the network there.',
    jsonLd: [webPage('/geo', 'AffiLayer by country', 'AffiLayer by country: global CPA affiliate network.'), geoIndexFaqLd('en')],
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
  '/partner': {
    title: 'Become a Partner | AffiLayer',
    description:
      'Partner with AffiLayer: bring your audience or your offers to a CPA network you can audit. Partnerships are agreed one by one and reviewed by hand.',
    jsonLd: webPage('/partner', 'Become an AffiLayer partner', 'Partner with AffiLayer: bring your audience or your offers to a network you can audit.'),
  },
  '/white-label': {
    title: 'White Label | Run Your Own Network on AffiLayer',
    description:
      'White-label AffiLayer: your brand on the front, our tracking engine underneath. Managed setup, arranged one by one — pricing agreed per setup.',
    jsonLd: webPage('/white-label', 'White label AffiLayer', 'White-label AffiLayer: your brand, our tracking engine, managed setup.'),
  },
  '/advertise': {
    title: 'Advertise with AffiLayer | Pay for Reviewed Conversions',
    description:
      'Advertise with AffiLayer: set your payout, caps and traffic rules, approve affiliates, and pay only for conversions you have reviewed.',
    jsonLd: webPage('/advertise', 'Advertise with AffiLayer', 'Advertise with AffiLayer and pay only for conversions you have reviewed.'),
  },
}

function metaFor(pathname: string): SeoMeta {
  const locale = localeFromPath(pathname)
  const path = basePath(pathname)
  if (locale !== 'en') {
    const localized = LOCALIZED_SEO[path]?.[locale]
    if (localized) return localized
    const geo = geoCountryMeta(path, locale)
    if (geo) return geo
  }
  if (PAGES[path]) return PAGES[path]
  const geo = geoCountryMeta(path, locale)
  if (geo) return geo
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

/** Spanish / Portuguese titles and descriptions for the localised pages.
 *  English comes from PAGES above; geo country pages are generated. */
const LOCALIZED_SEO: Record<string, Partial<Record<'es' | 'pt', SeoMeta>>> = {
  '/': {
    es: {
      title: 'AffiLayer — Red global de afiliados CPA',
      description:
        'AffiLayer es una nueva red CPA global. Ofertas directas y enrutamiento SmartLink, seguimiento completo y un libro contable de comisiones auditable.',
      jsonLd: [ORGANIZATION, WEBSITE],
    },
    pt: {
      title: 'AffiLayer — Rede global de afiliados CPA',
      description:
        'A AffiLayer é uma nova rede CPA global. Ofertas diretas e roteamento SmartLink, rastreamento completo e um livro-razão de comissões auditável.',
      jsonLd: [ORGANIZATION, WEBSITE],
    },
  },
  '/affiliates': {
    es: {
      title: 'Para afiliados | Gana con ofertas CPA y SmartLink',
      description:
        'Promociona ofertas CPA directas o envía tráfico por un solo SmartLink. Cada clic registrado, cada conversión atribuida y pagos desde un libro contable auditable.',
      jsonLd: webPage('/es/affiliates', 'Para afiliados', 'Gana en AffiLayer con ofertas CPA directas o un SmartLink.', 'es'),
    },
    pt: {
      title: 'Para afiliados | Ganhe com ofertas de CPA e SmartLink',
      description:
        'Promova ofertas de CPA diretas ou envie tráfego por um único SmartLink. Cada clique registrado, cada conversão atribuída e pagamentos a partir de um livro-razão auditável.',
      jsonLd: webPage('/pt/affiliates', 'Para afiliados', 'Ganhe na AffiLayer com ofertas de CPA diretas ou um SmartLink.', 'pt'),
    },
  },
  '/advertisers': {
    es: {
      title: 'Para anunciantes | Publica ofertas CPA en AffiLayer',
      description:
        'Publica ofertas CPA, CPL, CPS o CPC con tus propios límites y reglas de tráfico, aprueba afiliados y paga solo por conversiones revisadas.',
      jsonLd: webPage('/es/advertisers', 'Para anunciantes', 'Publica ofertas en AffiLayer y paga solo por conversiones revisadas.', 'es'),
    },
    pt: {
      title: 'Para anunciantes | Publique ofertas de CPA na AffiLayer',
      description:
        'Publique ofertas de CPA, CPL, CPS ou CPC com seus próprios limites e regras de tráfego, aprove afiliados e pague apenas por conversões revisadas.',
      jsonLd: webPage('/pt/advertisers', 'Para anunciantes', 'Publique ofertas na AffiLayer e pague apenas por conversões revisadas.', 'pt'),
    },
  },
  '/how-it-works': {
    es: {
      title: 'Cómo funciona AffiLayer | Del registro al pago',
      description:
        'Crea una cuenta, obtén la aprobación, publica o promociona ofertas, sigue los clics, revisa las conversiones y cobra: manual, aprobado por un administrador, Net30 por defecto.',
      jsonLd: webPage('/es/how-it-works', 'Cómo funciona AffiLayer', 'Cómo funciona AffiLayer, del registro al pago.', 'es'),
    },
    pt: {
      title: 'Como funciona a AffiLayer | Do cadastro ao pagamento',
      description:
        'Crie uma conta, obtenha aprovação, publique ou promova ofertas, acompanhe os cliques, revise as conversões e receba: manual, aprovado por um administrador, Net30 por padrão.',
      jsonLd: webPage('/pt/how-it-works', 'Como funciona a AffiLayer', 'Como funciona a AffiLayer, do cadastro ao pagamento.', 'pt'),
    },
  },
  '/geo': {
    es: {
      title: 'AffiLayer por país | Red global de afiliados CPA',
      description:
        'AffiLayer está abierta en todo el mundo. Elige un país y descubre cómo trabajan afiliados y anunciantes con la red allí.',
      jsonLd: [webPage('/es/geo', 'AffiLayer por país', 'AffiLayer por país: red global de afiliados CPA.', 'es'), geoIndexFaqLd('es')],
    },
    pt: {
      title: 'AffiLayer por país | Rede global de afiliados CPA',
      description:
        'A AffiLayer está aberta no mundo todo. Escolha um país e descubra como afiliados e anunciantes trabalham com a rede lá.',
      jsonLd: [webPage('/pt/geo', 'AffiLayer por país', 'AffiLayer por país: rede global de afiliados CPA.', 'pt'), geoIndexFaqLd('pt')],
    },
  },
}

/** FAQPage JSON-LD for the /geo index, from the translated geo FAQ. */
function geoIndexFaqLd(locale: Locale) {
  const d = DICT[locale]
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [1, 2, 3, 4].map((n) => ({
      '@type': 'Question',
      name: d[`geo.faq.${n}.q` as `geo.faq.${1 | 2 | 3 | 4}.q`],
      acceptedAnswer: {
        '@type': 'Answer',
        text: d[`geo.faq.${n}.a` as `geo.faq.${1 | 2 | 3 | 4}.a`],
      },
    })),
  }
}

/** Meta + JSON-LD for /geo/:country in any locale. Titles and descriptions
 *  are templated per locale; FAQPage comes from the translated Q&A templates. */
function geoCountryMeta(path: string, locale: Locale): SeoMeta | null {
  const m = path.match(/^\/geo\/([a-z]{2})$/)
  if (!m) return null
  const country = countryByCode(m[1])
  if (!country) return null
  const name = country.name[locale]
  const localizedPath = locale === 'en' ? path : `/${locale}${path}`
  const titles: Record<Locale, string> = {
    en: `CPA Affiliate Network in ${name} | AffiLayer`,
    es: `Red de afiliados CPA en ${name} | AffiLayer`,
    pt: `Rede de afiliados CPA em ${name} | AffiLayer`,
  }
  const descs: Record<Locale, string> = {
    en: `Run CPA offers in ${name} with AffiLayer: full-funnel tracking, an auditable commission ledger and manual Net30 payouts.`,
    es: `Promociona ofertas CPA en ${name} con AffiLayer: seguimiento completo, libro contable auditable y pagos manuales Net30.`,
    pt: `Promova ofertas de CPA em ${name} com a AffiLayer: rastreamento completo, livro-razão auditável e pagamentos manuais Net30.`,
  }
  const d = DICT[locale]
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [1, 2, 3].map((n) => ({
      '@type': 'Question',
      name: d[`geo.qa.${n}.q` as `geo.qa.${1 | 2 | 3}.q`].replaceAll('{country}', name),
      acceptedAnswer: {
        '@type': 'Answer',
        text: d[`geo.qa.${n}.a` as `geo.qa.${1 | 2 | 3}.a`].replaceAll('{country}', name),
      },
    })),
  }
  const crumbs = breadcrumb([
    { name: HOME_NAME[locale], path: locale === 'en' ? '/' : `/${locale}` },
    { name: d['nav.countries'], path: locale === 'en' ? '/geo' : `/${locale}/geo` },
    { name, path: localizedPath },
  ])
  return {
    title: titles[locale],
    description: descs[locale],
    jsonLd: [
      webPage(localizedPath, titles[locale].replace(' | AffiLayer', ''), descs[locale], locale),
      crumbs,
      faqLd,
    ],
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

function setHreflang(base: string) {
  document.head.querySelectorAll('link[data-hreflang]').forEach((el) => el.remove())
  const alts = alternatesFor(base)
  if (!alts) return
  const add = (hreflang: string, href: string) => {
    const el = document.createElement('link')
    el.setAttribute('rel', 'alternate')
    el.setAttribute('hreflang', hreflang)
    el.setAttribute('href', href)
    el.setAttribute('data-hreflang', '1')
    document.head.appendChild(el)
  }
  for (const a of alts) add(a.locale, a.href)
  add('x-default', `${SITE_URL}${base}`)
}

/** Applies the current route's title, meta tags, canonical URL and JSON-LD.
 *  Mount once inside the router. The prerender script captures this same
 *  DOM, so the static HTML carries the correct per-page SEO. */
export function RouteSeo() {
  const { pathname } = useLocation()
  useEffect(() => {
    const meta = metaFor(pathname)
    const locale = localeFromPath(pathname)
    const url = `${SITE_URL}${pathname === '/' ? '/' : pathname}`
    document.title = meta.title
    document.documentElement.setAttribute('lang', locale)
    setMeta('description', meta.description)
    setMeta('og:title', meta.title, 'property')
    setMeta('og:description', meta.description, 'property')
    setMeta('og:url', url, 'property')
    setMeta('og:type', meta.ogType ?? 'website', 'property')
    setMeta('og:image', OG_IMAGE, 'property')
    setMeta('og:locale', locale === 'es' ? 'es_ES' : locale === 'pt' ? 'pt_BR' : 'en_US', 'property')
    setMeta('twitter:title', meta.title)
    setMeta('twitter:description', meta.description)
    setMeta('twitter:image', OG_IMAGE)
    setCanonical(url)
    setHreflang(basePath(pathname))
    setJsonLd(meta.jsonLd)
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}
