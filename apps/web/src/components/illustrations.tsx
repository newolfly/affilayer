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

const NODE_BOXES = [
  { x: 16, y: 26 },
  { x: 16, y: 158 },
  { x: 444, y: 26 },
  { x: 444, y: 158 },
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
        <svg viewBox="0 0 640 230" className="w-full" fill="none">
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
