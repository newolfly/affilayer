import { Reveal } from './layout'
import { Icon } from './icons'
import type { IconName } from './icons'

/** Per-page illustrations: one original inline SVG per public page, all in
 *  the same visual language as the home hero — the layered AffiLayer "A"
 *  as a hub, a flowing gold path, and node cards naming what the page
 *  offers. Gold on navy, never stock art, never another brand's imagery.
 *  Node labels are passed in by the page (already translated where the
 *  page is localised); the hub, path and caption stay language-neutral
 *  where possible. The hub drifts gently and the path flows; both stop
 *  under prefers-reduced-motion (see index.css). */

export type PageArtVariant =
  | 'about'
  | 'advantages'
  | 'advertisers'
  | 'affiliates'
  | 'how'
  | 'faq'
  | 'blog'
  | 'contact'
  | 'terms'
  | 'privacy'
  | 'geo'
  | 'country'
  | 'partner'
  | 'whitelabel'
  | 'advertise'
  | 'pricing'

const NODE_BOXES = [
  { x: 16, y: 26 },
  { x: 16, y: 158 },
  { x: 444, y: 26 },
  { x: 444, y: 158 },
] as const

/** Mobile (below md) node slots: a 2×2 grid around the hub, near 1:1 scale
 *  so labels stay readable. The 640-wide desktop art squeezed to a 390px
 *  screen renders its 11.5px labels at ~6.4px computed; the stacked
 *  variant renders 15px labels at ~15px. Order is TL, TR, BL, BR. */
const MOBILE_NODE_BOXES = [
  { x: 8, y: 12 },
  { x: 188, y: 12 },
  { x: 8, y: 284 },
  { x: 188, y: 284 },
] as const

const MOBILE_NODE_PATHS = [
  'M90 60 L146 130',
  'M270 60 L214 130',
  'M90 284 L146 206',
  'M270 284 L214 206',
] as const

const NODE_PATHS = [
  'M196 48 L276 92',
  'M196 180 L276 132',
  'M444 48 L364 92',
  'M444 180 L364 132',
] as const

export function PageArt({
  variant,
  label,
  nodes,
  caption,
  delay = 0,
}: {
  variant: PageArtVariant
  /** Accessible description of the illustration. */
  label: string
  /** Up to 4 short node labels: top-left, bottom-left, top-right, bottom-right. */
  nodes: string[]
  /** Short line under the hub. */
  caption: string
  delay?: number
}) {
  const gid = `art-grad-${variant}`
  return (
    <Reveal delay={delay}>
      <div
        className="relative mx-auto mt-8 max-w-3xl"
        role="img"
        aria-label={label}
      >
        <svg viewBox="0 0 640 230" className="hidden w-full md:block" fill="none">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="640" y2="0" gradientUnits="userSpaceOnUse">
              <stop stopColor="#D97706" />
              <stop offset="1" stopColor="#FBBF24" />
            </linearGradient>
            <radialGradient id={`${gid}-glow`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="1" y="1" width="638" height="228" rx="16" fill="#111C30" stroke="#1E2A3F" />
          <ellipse cx="320" cy="112" rx="280" ry="95" fill={`url(#${gid}-glow)`} />
          <g opacity="0.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <circle key={i} cx={40 + i * 70} cy={i % 2 === 0 ? 14 : 216} r="2" fill="#475569" />
            ))}
          </g>
          <g stroke={`url(#${gid})`} strokeWidth="1.5" className="art-path">
            {NODE_PATHS.slice(0, nodes.length).map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
          <g fontFamily="inherit" fontSize="11.5" fontWeight="700" fill="#e2e8f0" textAnchor="middle">
            {nodes.slice(0, 4).map((n, i) => {
              // Only stretch labels that are genuinely too wide for the box.
              // A short label like "Ledger" with textLength="168" gets its
              // glyphs flattened across the whole box; short labels render
              // at natural width, centred, instead.
              const wide = n.length * 7.2 > 160
              return (
                <g key={n}>
                  <rect x={NODE_BOXES[i].x} y={NODE_BOXES[i].y} width="180" height="44" rx="12" fill="#0F1B2E" stroke="#1E2A3F" />
                  <text
                    x={NODE_BOXES[i].x + 90}
                    y={NODE_BOXES[i].y + 27}
                    {...(wide ? { textLength: 168, lengthAdjust: 'spacingAndGlyphs' as const } : {})}
                  >{n}</text>
                </g>
              )
            })}
          </g>
          <g className="art-float">
            <circle cx="320" cy="112" r="46" fill="#0F1B2E" stroke={`url(#${gid})`} strokeWidth="2.5" />
            <g strokeLinecap="round" strokeLinejoin="round" strokeWidth="4.5" fill="none">
              <path d="M320 84 L305 136" stroke="#D97706" />
              <path d="M320 84 L335 136" stroke="#f59e0b" />
              <path d="M310 120h20" stroke="#FBBF24" />
            </g>
          </g>
          <text x="320" y="200" textAnchor="middle" fontFamily="inherit" fontSize="12" fontWeight="600" fill="#94a3b8">
            {caption}
          </text>
        </svg>
        {/* Mobile variant (below md): same hub + nodes, stacked 2×2 at near
          * 1:1 scale — 15px labels instead of ~6.4px computed. Shown instead
          * of the desktop art, never alongside it. */}
        <svg viewBox="0 0 360 344" className="mx-auto w-full max-w-[400px] md:hidden" fill="none">
          <defs>
            <linearGradient id={`${gid}-m`} x1="0" y1="0" x2="360" y2="0" gradientUnits="userSpaceOnUse">
              <stop stopColor="#D97706" />
              <stop offset="1" stopColor="#FBBF24" />
            </linearGradient>
          </defs>
          <rect x="1" y="1" width="358" height="342" rx="16" fill="#111C30" stroke="#1E2A3F" />
          <ellipse cx="180" cy="168" rx="160" ry="80" fill="#F59E0B" opacity="0.08" />
          <path d="M16 168 H344" stroke={`url(#${gid}-m)`} strokeWidth="2" strokeDasharray="5 6" className="art-path" />
          <g stroke={`url(#${gid}-m)`} strokeWidth="1.5">
            {MOBILE_NODE_PATHS.slice(0, nodes.length).map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
          <g fontFamily="inherit" fontSize="15" fontWeight="700" fill="#e2e8f0" textAnchor="middle">
            {nodes.slice(0, 4).map((n, i) => {
              const wide = n.length * 9 > 152
              return (
                <g key={n}>
                  <rect x={MOBILE_NODE_BOXES[i].x} y={MOBILE_NODE_BOXES[i].y} width="164" height="48" rx="12" fill="#0F1B2E" stroke="#1E2A3F" />
                  <text
                    x={MOBILE_NODE_BOXES[i].x + 82}
                    y={MOBILE_NODE_BOXES[i].y + 30}
                    {...(wide ? { textLength: 152, lengthAdjust: 'spacingAndGlyphs' as const } : {})}
                  >{n}</text>
                </g>
              )
            })}
          </g>
          <g className="art-float">
            <circle cx="180" cy="168" r="46" fill="#0F1B2E" stroke={`url(#${gid}-m)`} strokeWidth="2.5" />
            <g strokeLinecap="round" strokeLinejoin="round" strokeWidth="4.5" fill="none">
              <path d="M180 140 L167 188" stroke="#D97706" />
              <path d="M180 140 L193 188" stroke="#f59e0b" />
              <path d="M172 172h16" stroke="#FBBF24" />
            </g>
          </g>
          <text x="180" y="250" textAnchor="middle" fontFamily="inherit" fontSize="13" fontWeight="600" fill="#94a3b8">
            {caption}
          </text>
        </svg>
      </div>
    </Reveal>
  )
}

/** Short bullet-point block: what the page offers, in plain words.
 *  Gold check icons on dark cards — the same language as the trust row. */
export function PageHighlights({ items }: { items: { icon: IconName; text: string }[] }) {
  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-3" role="list">
      {items.map((it, i) => (
        <Reveal key={it.text} delay={(i % 3) * 80}>
          <div
            role="listitem"
            className="lift flex h-full items-start gap-3 rounded-xl border border-slate-800 bg-[#111C30]/60 p-4"
          >
            <span className="shrink-0 rounded-lg bg-amber-500/15 p-2 text-amber-400">
              <Icon name={it.icon} className="h-5 w-5" />
            </span>
            <span className="text-sm leading-relaxed text-slate-200">{it.text}</span>
          </div>
        </Reveal>
      ))}
    </div>
  )
}
