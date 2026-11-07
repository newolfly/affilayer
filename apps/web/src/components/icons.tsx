import type { JSX } from 'react'

/**
 * One consistent inline-SVG icon set for AffiLayer.
 * 24x24, stroke style, currentColor — no icon library dependency.
 * Every icon is drawn from primitives (rects, circles, lines, polylines)
 * so the set stays small and renders identically everywhere.
 */

type IconProps = { className?: string }

const base = (children: JSX.Element, props: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width="24"
    height="24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
    aria-hidden="true"
  >
    {children}
  </svg>
)

const PATHS: Record<string, (p: IconProps) => JSX.Element> = {
  grid: (p) => base(<>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </>, p),
  tag: (p) => base(<>
    <path d="M20.59 13.41 11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82z" />
    <circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
  </>, p),
  megaphone: (p) => base(<>
    <path d="m3 11 18-5v12L3 13v-2z" />
    <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
  </>, p),
  link: (p) => base(<>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </>, p),
  chart: (p) => base(<>
    <line x1="12" y1="20" x2="12" y2="10" />
    <line x1="18" y1="20" x2="18" y2="4" />
    <line x1="6" y1="20" x2="6" y2="16" />
  </>, p),
  wallet: (p) => base(<>
    <path d="M20 7H4a2 2 0 0 1 0-4h14a2 2 0 0 1 2 2v2" />
    <path d="M4 7v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
    <circle cx="16.5" cy="13.5" r="1" fill="currentColor" stroke="none" />
  </>, p),
  banknote: (p) => base(<>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <line x1="6" y1="12" x2="6.01" y2="12" />
    <line x1="18" y1="12" x2="18.01" y2="12" />
  </>, p),
  user: (p) => base(<>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
  </>, p),
  users: (p) => base(<>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5" />
    <path d="M16 5.5a3.5 3.5 0 0 1 0 6.5" />
    <path d="M17.5 14.8c2.4.7 4 2.3 4 5.2" />
  </>, p),
  shield: (p) => base(<>
    <path d="M12 22s8-3.6 8-10V5l-8-3-8 3v7c0 6.4 8 10 8 10z" />
    <polyline points="9 11.5 11 13.5 15 9.5" />
  </>, p),
  file: (p) => base(<>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="17" x2="15" y2="17" />
  </>, p),
  ticket: (p) => base(<>
    <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
    <line x1="13" y1="6" x2="13" y2="6.01" />
    <line x1="13" y1="18" x2="13" y2="18.01" />
  </>, p),
  settings: (p) => base(<>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
  </>, p),
  search: (p) => base(<>
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.5" y2="16.5" />
  </>, p),
  check: (p) => base(<polyline points="20 6 9 17 4 12" />, p),
  x: (p) => base(<>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </>, p),
  'chevron-down': (p) => base(<polyline points="6 9 12 15 18 9" />, p),
  menu: (p) => base(<>
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="18" x2="20" y2="18" />
  </>, p),
  'arrow-right': (p) => base(<>
    <line x1="4" y1="12" x2="20" y2="12" />
    <polyline points="13 6 19 12 13 18" />
  </>, p),
  sparkle: (p) => base(<>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
    <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
  </>, p),
  globe: (p) => base(<>
    <circle cx="12" cy="12" r="9" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <path d="M12 3a13.5 13.5 0 0 1 0 18M12 3a13.5 13.5 0 0 0 0 18" />
  </>, p),
  mail: (p) => base(<>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <polyline points="22 7 12 13 2 7" />
  </>, p),
  lock: (p) => base(<>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </>, p),
  clock: (p) => base(<>
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15.5 14" />
  </>, p),
  alert: (p) => base(<>
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="8" x2="12" y2="13" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </>, p),
  home: (p) => base(<>
    <path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </>, p),
  plus: (p) => base(<>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </>, p),
  eye: (p) => base(<>
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
    <circle cx="12" cy="12" r="3" />
  </>, p),
  logout: (p) => base(<>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </>, p),
  building: (p) => base(<>
    <rect x="4" y="3" width="16" height="18" rx="1" />
    <line x1="9" y1="7" x2="10" y2="7" />
    <line x1="14" y1="7" x2="15" y2="7" />
    <line x1="9" y1="11" x2="10" y2="11" />
    <line x1="14" y1="11" x2="15" y2="11" />
    <line x1="9" y1="15" x2="10" y2="15" />
    <line x1="14" y1="15" x2="15" y2="15" />
    <path d="M10 21v-3h4v3" />
  </>, p),
  layers: (p) => base(<>
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 12 12 17 22 12" />
    <polyline points="2 17 12 22 22 17" />
  </>, p),
  compass: (p) => base(<>
    <circle cx="12" cy="12" r="9" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </>, p),
  dollar: (p) => base(<>
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </>, p),
  send: (p) => base(<>
    <polygon points="22 2 11 13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </>, p),
}

export type IconName = keyof typeof PATHS

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const render = PATHS[name]
  if (!render) return null
  return render({ className })
}

export const ICON_NAMES = Object.keys(PATHS) as IconName[]
