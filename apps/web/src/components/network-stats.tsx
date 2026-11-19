import { Reveal } from './layout'
import { Icon } from './icons'
import { ACTIVITY_DISCLOSURE, NETWORK_STATS, STATS_PULLED_AT } from '../lib/network-stats'

/**
 * "Network activity" strip — renders the build-time counters from
 * lib/network-stats.ts (real DB counts, re-pulled at build time; see
 * that file for the honesty rules). The disclosure line under the
 * cards is part of the component on purpose: the strip never renders
 * without it.
 *
 * Placement: already imported by pages/trust.tsx. For the homepage,
 * insert <NetworkActivityStrip /> in Home() directly after
 * <LaunchCampaignBanner /> (see APPLY.md).
 */
export function NetworkActivityStrip({ heading = 'Network activity' }: { heading?: string }) {
  return (
    <section className="mt-14">
      <h2 className="text-center text-2xl font-bold text-white md:text-3xl">{heading}</h2>
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {NETWORK_STATS.map((s, i) => (
          <Reveal key={s.label} delay={(i % 5) * 80}>
            <div className="lift h-full rounded-2xl border border-slate-800 bg-[#111C30]/60 p-5 text-center">
              <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
                <Icon name={s.icon} className="h-5 w-5" />
              </span>
              <p className="mt-3 text-3xl font-bold text-white">{s.value}</p>
              <p className="mt-1 text-sm font-semibold text-slate-200">{s.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{s.sub}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <p className="mx-auto mt-5 max-w-3xl text-center text-xs leading-relaxed text-slate-500">
        {ACTIVITY_DISCLOSURE} Pulled from the production ledger on {STATS_PULLED_AT}.
      </p>
    </section>
  )
}
