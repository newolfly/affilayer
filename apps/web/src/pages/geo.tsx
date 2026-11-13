import { Link, Navigate, useParams } from 'react-router-dom'
import { PublicLayout, Reveal, Slogan } from '../components/layout'
import { PageArt, PageHighlights } from '../components/illustrations'
import { Icon } from '../components/icons'
import type { IconName } from '../components/icons'
import { useLocale, useT, localizePath } from '../lib/i18n'
import { COUNTRIES, countryByCode, countriesByRegion, countryFlag, REGION_LABELS, REGION_ORDER, relatedCountries } from '../lib/geo-data'
import { geoSeoByCode } from '../lib/geo-seo-data'
import { publishedPosts } from '../lib/blog-data'
import type { Post } from '../lib/blog-data'
import { FunnelSteps } from './public'

const BULLET_ICONS: IconName[] = ['link', 'tag', 'file', 'banknote']

export function GeoIndex() {
  const t = useT()
  const locale = useLocale()
  return (
    <PublicLayout>
      <h1 className="text-center text-3xl font-bold text-white md:text-4xl">
        {t('geo.index.title')}
      </h1>
      <Slogan className="mx-auto mt-4 max-w-2xl text-center">{t('geo.index.slogan')}</Slogan>
      <p className="mx-auto mt-4 max-w-2xl text-center text-slate-300">
        {t('geo.index.sub')}
      </p>
      <p className="mx-auto mt-2 max-w-2xl text-center text-sm font-semibold text-amber-400">
        {t('geo.index.count', { n: String(COUNTRIES.length) })}
      </p>
      <PageArt
        variant="geo"
        label="Illustration: the AffiLayer hub connecting 195 country pages, one ledger and Net30 payouts"
        nodes={['195 countries', 'One ledger', 'Net30 payouts', 'One network']}
        caption="one network, every country"
      />
      <PageHighlights
        items={[
          { icon: 'search', text: t('geo.bullet.1') },
          { icon: 'link', text: t('geo.bullet.2') },
          { icon: 'file', text: t('geo.bullet.3') },
        ]}
      />
      <div className="mt-10 space-y-12">
        {REGION_ORDER.map((region) => {
          const countries = countriesByRegion(region)
          return (
            <section key={region} aria-label={REGION_LABELS[region][locale]}>
              <h2 className="text-2xl font-bold text-white">
                {REGION_LABELS[region][locale]} <span className="text-base font-semibold text-slate-400">· {countries.length}</span>
              </h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3 lg:grid-cols-4">
                {countries.map((c, i) => (
                  <Reveal key={c.code} delay={(i % 4) * 80}>
                    <Link
                      to={localizePath(`/geo/${c.code}`, locale)}
                      className="lift block h-full rounded-2xl border border-slate-800 bg-[#111C30]/60 p-6"
                    >
                      <span className="inline-flex rounded-lg bg-amber-500/10 p-2 text-amber-400">
                        <Icon name="globe" className="h-5 w-5" />
                      </span>
                      <h3 className="mt-3 text-lg font-bold text-white">{c.name[locale]}</h3>
                      <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-400">
                        {t('geo.index.explore')}
                        <Icon name="arrow-right" className="h-4 w-4" />
                      </span>
                    </Link>
                  </Reveal>
                ))}
              </div>
            </section>
          )
        })}
      </div>
      <section className="mt-14">
        <h2 className="text-center text-3xl font-bold text-white">{t('geo.index.faqTitle')}</h2>
        <div className="mx-auto mt-6 max-w-3xl space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <Reveal key={n}>
              <details className="lift rounded-xl bg-white p-5 text-slate-900">
                <summary className="cursor-pointer font-semibold">
                  {t(`geo.faq.${n}.q` as `geo.faq.${1 | 2 | 3 | 4}.q`)}
                </summary>
                <p className="mt-2 text-sm text-slate-600">
                  {t(`geo.faq.${n}.a` as `geo.faq.${1 | 2 | 3 | 4}.a`)}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>
    </PublicLayout>
  )
}

export function GeoPage() {
  const t = useT()
  const locale = useLocale()
  const { code } = useParams()
  const country = countryByCode(code ?? '')
  if (!country) return <Navigate to={localizePath('/geo', locale)} replace />

  const name = country.name[locale]
  /** Featured countries carry a written intro; every other country
   *  renders the shared template — same global product everywhere,
   *  no local presence claimed. */
  const intro = country.intro?.[locale] ?? country.intro?.en ?? t('geo.page.templateIntro', { country: name })
  /** Related reading for every country page: the geo, SmartLink and
   *  network-choice explainers — plus the Finance explainer where the
   *  country has Finance SEO content (es/mx/ar). */
  const relatedPostSlugs = [
    'geo-targeting-cpa-offers',
    'what-is-a-smartlink',
    'how-to-choose-a-cpa-network',
    ...(geoSeoByCode(code ?? '') ? ['finance-cpa-offers-explained'] : []),
  ]
  const relatedPostItems = relatedPostSlugs
    .map((slug) => publishedPosts().find((p) => p.slug === slug))
    .filter((p): p is Post => Boolean(p))
  const neighbours = relatedCountries(code ?? '')
  /** SEO-targeted content (Finance vertical, Spanish register per
   *  country) renders only on the Spanish pages. English and Portuguese
   *  versions of these countries keep the standard geo page. */
  const seo = locale === 'es' ? geoSeoByCode(code ?? '') : undefined
  const affiliateSteps = [1, 2, 3, 4, 5].map((n) => ({
    n: String(n),
    t: t(`aff.funnel.${n}.t` as `aff.funnel.${1 | 2 | 3 | 4 | 5}.t`),
    d: t(`aff.funnel.${n}.d` as `aff.funnel.${1 | 2 | 3 | 4 | 5}.d`),
    to: ['/register', '/onboarding', '/app/affiliate/offers', '/app/affiliate/tracking-links', '/app/affiliate/earnings'][n - 1],
    cta: t(`aff.funnel.${n}.cta` as `aff.funnel.${1 | 2 | 3 | 4 | 5}.cta`),
    icon: (['user', 'shield', 'tag', 'link', 'wallet'] as IconName[])[n - 1],
  }))
  const advertiserSteps = [1, 2, 3, 4].map((n) => ({
    n: String(n),
    t: t(`adv.funnel.${n}.t` as `adv.funnel.${1 | 2 | 3 | 4}.t`),
    d: t(`adv.funnel.${n}.d` as `adv.funnel.${1 | 2 | 3 | 4}.d`),
    to: ['/register', '/app/advertiser/create-offer', '/app/advertiser/affiliates', '/app/advertiser/conversions'][n - 1],
    cta: t(`adv.funnel.${n}.cta` as `adv.funnel.${1 | 2 | 3 | 4}.cta`),
    icon: (['user', 'plus', 'users', 'chart'] as IconName[])[n - 1],
  }))

  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        {t('geo.page.title', { country: name })}
      </h1>
      <Slogan className="mt-4">{t('geo.page.slogan', { country: name })}</Slogan>
      <p className="mt-4 max-w-3xl text-slate-300">{intro}</p>
      <section className="mt-6 max-w-3xl rounded-xl bg-white p-5 text-slate-900" aria-label={t('geo.facts.title', { country: name })}>
        <h2 className="font-bold">{t('geo.facts.title', { country: name })}</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <dt className="font-semibold text-slate-500">{t('geo.facts.region')}:</dt>
            <dd>{REGION_LABELS[country.region][locale]} — {country.subregion}</dd>
          </div>
          {country.currencyCode && country.currencyName && (
            <div className="flex flex-wrap gap-2">
              <dt className="font-semibold text-slate-500">{t('geo.facts.currency')}:</dt>
              <dd>{country.currencyName} ({country.currencyCode})</dd>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <dt className="font-semibold text-slate-500">{t('geo.facts.languages')}:</dt>
            <dd>{country.languages.join(', ')}</dd>
          </div>
        </dl>
      </section>
      {/* Join/value block (Sojib, 13 Nov): how a visitor in this
       *  country joins and what they get — data-driven from geo-data
       *  (name, currency; languages are in the facts box above),
       *  honest facts only, no local presence claimed. */}
      <section className="mt-8 max-w-3xl rounded-2xl border border-amber-500/40 bg-[#111C30]/60 p-6" aria-label={t('geo.join.title', { country: name })}>
        <h2 className="flex items-center gap-2.5 text-xl font-bold text-white">
          <span className="text-2xl leading-none" aria-hidden>{countryFlag(country.code)}</span>
          {t('geo.join.title', { country: name })}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{t('geo.join.lead', { country: name })}</p>
        <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-300">
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-amber-400"><Icon name="check" className="h-4 w-4" /></span>
            <span>{t('geo.join.usdt')}</span>
          </li>
          {country.currencyCode && country.currencyName && (
            <li className="flex gap-2">
              <span className="mt-0.5 shrink-0 text-amber-400"><Icon name="check" className="h-4 w-4" /></span>
              <span>{t('geo.join.currency', { currency: `${country.currencyName} (${country.currencyCode})` })}</span>
            </li>
          )}
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-amber-400"><Icon name="check" className="h-4 w-4" /></span>
            <span>{t('geo.join.smart')}</span>
          </li>
        </ul>
        <ol className="mt-5 grid gap-2 sm:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <li key={n} className="flex items-center gap-2.5 text-sm text-slate-200">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-600 via-amber-500 to-amber-400 text-xs font-bold text-[#0B1220]" aria-hidden>{n}</span>
              {t(`geo.join.step.${n}` as `geo.join.step.${1 | 2 | 3 | 4}`, { country: name })}
            </li>
          ))}
        </ol>
        <Link to="/register" className="pill-btn mt-6">{t('geo.join.cta')}</Link>
      </section>
      {seo && (
        <p className="mt-4 max-w-3xl rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 leading-relaxed text-slate-200">
          {seo.answer}
        </p>
      )}
      <PageArt
        variant="country"
        label={`Illustration: the AffiLayer hub for ${name} — CPA, CPL and CPS offers, SmartLink and Net30 payouts`}
        nodes={[name, 'CPA · CPL · CPS', 'SmartLink', 'Net30']}
        caption={`AffiLayer in ${name}`}
      />

      <h2 className="mt-10 text-2xl font-bold text-white">
        {t('geo.page.what', { country: name })}
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((n) => (
          <Reveal key={n}>
            <div className="lift flex h-full items-start gap-3 rounded-xl bg-white p-5 text-slate-900">
              <span className="rounded-lg bg-amber-500/10 p-2 text-amber-700">
                <Icon name={BULLET_ICONS[n - 1]} className="h-5 w-5" />
              </span>
              <p className="text-sm leading-relaxed text-slate-700">
                {t(`geo.bullet.${n}` as `geo.bullet.${1 | 2 | 3 | 4}`)}
              </p>
            </div>
          </Reveal>
        ))}
      </div>

      {seo && (
        <section className="mt-14">
          <h2 className="text-2xl font-bold text-white">{t('geo.seo.payoutTable')}</h2>
          <div className="mt-4 overflow-x-auto rounded-xl bg-white p-5 text-slate-900">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-4 font-bold">{t('geo.seo.col.model')}</th>
                  <th className="py-2 pr-4 font-bold">{t('geo.seo.col.what')}</th>
                  <th className="py-2 font-bold">{t('geo.seo.col.how')}</th>
                </tr>
              </thead>
              <tbody>
                {seo.payoutRows.map((row) => (
                  <tr key={row.model} className="border-b border-slate-100 align-top last:border-0">
                    <td className="py-3 pr-4 font-bold whitespace-nowrap">{row.model}</td>
                    <td className="py-3 pr-4 leading-relaxed text-slate-700">{row.what}</td>
                    <td className="py-3 leading-relaxed text-slate-700">{row.how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <FunnelSteps heading={t('geo.page.forAff', { country: name })} steps={affiliateSteps} />
      <FunnelSteps heading={t('geo.page.forAdv', { country: name })} steps={advertiserSteps} />

      {seo && (
        <>
          <section className="mt-14">
            <h2 className="text-2xl font-bold text-white">
              {t('geo.seo.payoutMethods', { country: name })}
            </h2>
            <p className="mt-4 max-w-3xl leading-relaxed text-slate-300">{seo.payoutNote}</p>
          </section>

          <section className="mt-14">
            <h2 className="text-2xl font-bold text-white">
              {t('geo.seo.countryNotes', { country: name })}
            </h2>
            <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-slate-300">
              {seo.countryNotes.map((note) => (
                <li key={note.slice(0, 24)} className="leading-relaxed">{note}</li>
              ))}
            </ul>
          </section>
        </>
      )}

      {seo ? (
        <section className="mt-14">
          <h2 className="text-xl font-bold text-white">
            {t('geo.seo.faqTitle', { country: name })}
          </h2>
          <div className="mt-4 space-y-3">
            {seo.faq.map((item) => (
              <Reveal key={item.q}>
                <details className="lift rounded-xl bg-white p-5 text-slate-900">
                  <summary className="cursor-pointer font-semibold">{item.q}</summary>
                  <p className="mt-2 text-sm text-slate-600">{item.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-14">
          <h2 className="text-xl font-bold text-white">
            {t('geo.page.qaTitle', { country: name })}
          </h2>
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((n) => (
              <Reveal key={n}>
                <details className="lift rounded-xl bg-white p-5 text-slate-900">
                  <summary className="cursor-pointer font-semibold">
                    {t(`geo.qa.${n}.q` as `geo.qa.${1 | 2 | 3}.q`, { country: name })}
                  </summary>
                  <p className="mt-2 text-sm text-slate-600">
                    {t(`geo.qa.${n}.a` as `geo.qa.${1 | 2 | 3}.a`, { country: name })}
                  </p>
                </details>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <section className="mt-14">
        <h2 className="text-xl font-bold text-white">{t('geo.page.relatedPosts')}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {relatedPostItems.map((p) => (
            <Reveal key={p.slug}>
              <Link
                to={`/blog/${p.slug}`}
                className="lift block h-full rounded-xl bg-white p-5 text-slate-900"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">{p.category}</p>
                <h3 className="mt-2 font-bold">{p.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{p.excerpt}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-bold text-white">
          {t('geo.page.relatedCountries', { region: REGION_LABELS[country.region][locale] })}
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {neighbours.map((c) => (
            <Link
              key={c.code}
              to={localizePath(`/geo/${c.code}`, locale)}
              className="rounded-full border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:border-amber-400 hover:text-white"
            >
              {c.name[locale]}
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link to="/register" className="pill-btn">{t('aff.register')}</Link>
        <Link to="/register" className="pill-btn-outline">{t('adv.register')}</Link>
        <Link
          to={localizePath('/geo', locale)}
          className="inline-flex items-center gap-1.5 self-center text-sm font-semibold text-amber-400 hover:text-amber-300"
        >
          <Icon name="arrow-right" className="h-4 w-4 rotate-180" /> {t('geo.page.all')}
        </Link>
      </div>
    </PublicLayout>
  )
}
