import { Link, Navigate, useParams } from 'react-router-dom'
import { PublicLayout, Reveal, Slogan } from '../components/layout'
import { Icon } from '../components/icons'
import type { IconName } from '../components/icons'
import { useLocale, useT, localizePath } from '../lib/i18n'
import { COUNTRIES, countryByCode } from '../lib/geo-data'
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
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {COUNTRIES.map((c, i) => (
          <Reveal key={c.code} delay={(i % 4) * 80}>
            <Link
              to={localizePath(`/geo/${c.code}`, locale)}
              className="lift block h-full rounded-2xl border border-slate-800 bg-[#111C30]/60 p-6"
            >
              <span className="inline-flex rounded-lg bg-amber-500/10 p-2 text-amber-400">
                <Icon name="globe" className="h-5 w-5" />
              </span>
              <h2 className="mt-3 text-lg font-bold text-white">{c.name[locale]}</h2>
              <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-400">
                {t('geo.index.explore')}
                <Icon name="arrow-right" className="h-4 w-4" />
              </span>
            </Link>
          </Reveal>
        ))}
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
      <p className="mt-4 max-w-3xl text-slate-300">{country.intro[locale]}</p>

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

      <FunnelSteps heading={t('geo.page.forAff', { country: name })} steps={affiliateSteps} />
      <FunnelSteps heading={t('geo.page.forAdv', { country: name })} steps={advertiserSteps} />

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
