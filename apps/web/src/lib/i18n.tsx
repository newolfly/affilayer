import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { DICT } from './i18n-dict'
import type { DictKey } from './i18n-dict'

export type Locale = 'en' | 'es' | 'pt'

export const LOCALES: { code: Locale; label: string; short: string }[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'es', label: 'Español', short: 'ES' },
  { code: 'pt', label: 'Português', short: 'PT' },
]

/** Base public paths that exist in English, Spanish and Portuguese.
 *  Everything else on the public site is English-only for now. */
export const LOCALIZED_BASE_PATHS: string[] = [
  '/',
 '/affiliates', '/advertisers', '/how-it-works', '/geo',
  '/geo/us', '/geo/uk', '/geo/ca', '/geo/au', '/geo/de', '/geo/fr', '/geo/br', '/geo/in',
]

/** Locale from the first URL segment: /es/geo/us -> 'es', /pt -> 'pt', anything else -> 'en'. */
export function localeFromPath(pathname: string): Locale {
  const seg = pathname.split('/')[1]
  if (seg === 'es' || seg === 'pt') return seg
  return 'en'
}

/** Strip the locale prefix: /es/geo/us -> /geo/us, /es -> /, /about -> /about. */
export function basePath(pathname: string): string {
  if (localeFromPath(pathname) === 'en') return pathname
  const rest = pathname.slice(3)
  return rest === '' ? '/' : rest
}

/** Prefix a base path for a locale: /affiliates + 'es' -> /es/affiliates, 'en' -> /affiliates. */
export function localizePath(base: string, locale: Locale): string {
  if (locale === 'en') return base
  return base === '/' ? `/${locale}` : `/${locale}${base}`
}

/** hreflang alternates for a base path, or null when the page is English-only. */
export function alternatesFor(base: string): { locale: Locale; href: string }[] | null {
  if (!LOCALIZED_BASE_PATHS.includes(base)) return null
  return (['en', 'es', 'pt'] as Locale[]).map((l) => ({
    locale: l,
    href: `https://affilayer.com${localizePath(base, l)}`,
  }))
}

const LocaleContext = createContext<Locale>('en')

/** Derives the locale from the URL on every render, so the prerendered
 *  dump of /es/... renders Spanish and /pt/... renders Portuguese. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <LocaleContext.Provider value={localeFromPath(pathname)}>{children}</LocaleContext.Provider>
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}

/** Translation lookup with {var} interpolation; falls back to English,
 *  then to the key itself, so a missing translation never renders blank. */
export function useT() {
  const locale = useLocale()
  return (key: DictKey, vars?: Record<string, string>): string => {
    let s: string = DICT[locale][key] ?? DICT.en[key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v)
    }
    return s
  }
}
