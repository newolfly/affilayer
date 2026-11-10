import { Link } from 'react-router-dom'
import { PublicLayout, Reveal, Slogan } from '../components/layout'
import { BRAND_STRINGS, BRAND_BOILERPLATE_SHORT } from '../lib/brand-data'
import { useLocale } from '../lib/i18n'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function Brand() {
  const locale = useLocale()
  const b = BRAND_STRINGS[locale]
  return (
    <PublicLayout>
      <h1 className="text-3xl font-bold text-white md:text-4xl">
        AffiLayer — <span className="grad-text">a global CPA network you can check</span>
      </h1>
      <Slogan className="mt-4">{b.slogan}</Slogan>
      <p className="mt-4 max-w-3xl text-slate-300">{b.sub}</p>
      <p className="mt-4 rounded-xl border border-slate-800 bg-[#111C30]/60 p-4 text-sm text-slate-400">
        How we keep it honest: see how tracking and payouts work · read the FAQ · support@affilayer.com
      </p>

      <Section title={b.aboutH}>
        <div className="rounded-xl bg-white p-6 text-slate-700">
          <p>{b.about}</p>
          <p className="mt-3 text-sm text-slate-500">{BRAND_BOILERPLATE_SHORT}</p>
        </div>
      </Section>

      <Section title={b.storyH}>
        <div className="space-y-4 rounded-xl bg-white p-6 text-slate-700">
          {b.story.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </Section>

      <Section title={b.principlesH}>
        <div className="grid gap-4 md:grid-cols-3">
          {b.principles.map((p, i) => (
            <Reveal key={p.t} delay={i * 80}>
              <div className="lift h-full rounded-xl bg-white p-5 text-slate-900">
                <p className="text-sm font-bold text-amber-700">{i + 1}. {p.t}</p>
                <p className="mt-2 text-sm text-slate-600">{p.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section title={b.differentH}>
        <div className="space-y-4">
          {b.different.map((d) => (
            <div key={d.t} className="rounded-xl border border-slate-800 bg-[#111C30]/60 p-5">
              <h3 className="font-bold text-white">{d.t}</h3>
              <p className="mt-1 text-sm text-slate-300">{d.d}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title={b.notH}>
        <div className="space-y-3 rounded-xl bg-white p-6 text-slate-700">
          {b.notDo.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </Section>

      <Section title={b.identityH}>
        <div className="rounded-xl bg-white p-6 text-slate-700">
          <p>{b.identity}</p>
          <div className="mt-4 flex flex-wrap items-center gap-6 rounded-xl bg-[#070D1A] p-6">
            <img src="/logo-light.svg" alt="AffiLayer light wordmark" width={272} height={64} />
            <img src="/logo-mark.svg" alt="AffiLayer mark" width={64} height={64} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-6 rounded-xl border border-slate-200 p-6">
            <img src="/logo.svg" alt="AffiLayer dark wordmark" width={272} height={64} />
          </div>
          <h3 className="mt-6 font-bold text-slate-900">{b.lockupsH}</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {b.lockups.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <h3 className="mt-6 font-bold text-slate-900">{b.colorsH}</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {b.colors.map((c) => (
              <li key={c.name} className="flex items-center gap-3">
                <span className="inline-block h-5 w-5 rounded border border-slate-300" style={{ background: c.value.split(' / ')[0] }} />
                <span className="font-semibold">{c.name}</span> <span className="font-mono text-xs">{c.value}</span>
              </li>
            ))}
          </ul>
          <h3 className="mt-6 font-bold text-slate-900">{b.doH}</h3>
          <div className="mt-2 grid gap-4 text-sm md:grid-cols-2">
            <ul className="list-disc space-y-1 pl-5">
              {b.dos.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <ul className="list-disc space-y-1 pl-5">
              {b.donts.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section title={b.factsH}>
        <div className="rounded-xl border border-slate-800 bg-[#111C30]/60 p-6">
          <ul className="space-y-2 text-sm text-slate-300">
            {b.facts.map((f, i) => (
              <li key={i}>· {f}</li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title={b.pressH}>
        <div className="rounded-xl border border-slate-800 bg-[#111C30]/60 p-6">
          <p className="text-sm text-slate-300">{b.press}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href="/brand/press-kit.zip" className="pill-btn">{b.pressCta}</a>
            <a href="/brand/brand-guidelines.pdf" className="pill-btn-outline">Brand guidelines (PDF)</a>
          </div>
          <ul className="mt-4 space-y-1 text-sm">
            <li><a href="/brand/AffiLayer-logo-dark.svg" className="font-semibold text-amber-400 hover:text-amber-300">AffiLayer-logo-dark.svg</a></li>
            <li><a href="/brand/AffiLayer-logo-light.svg" className="font-semibold text-amber-400 hover:text-amber-300">AffiLayer-logo-light.svg</a></li>
            <li><a href="/brand/AffiLayer-mark.svg" className="font-semibold text-amber-400 hover:text-amber-300">AffiLayer-mark.svg</a></li>
            <li><a href="/brand/AffiLayer-mark-512.png" className="font-semibold text-amber-400 hover:text-amber-300">AffiLayer-mark-512.png</a></li>
            <li><a href="/brand/AffiLayer-mark-1024.png" className="font-semibold text-amber-400 hover:text-amber-300">AffiLayer-mark-1024.png</a></li>
            <li><a href="/brand/boilerplate.txt" className="font-semibold text-amber-400 hover:text-amber-300">boilerplate.txt</a></li>
            <li><a href="/brand/fact-sheet.txt" className="font-semibold text-amber-400 hover:text-amber-300">fact-sheet.txt</a></li>
          </ul>
          <p className="mt-4 text-sm text-slate-400">
            Press contact: <a href="mailto:support@affilayer.com?subject=Press" className="font-semibold text-amber-400 hover:text-amber-300">support@affilayer.com</a> (subject “Press”)
          </p>
        </div>
      </Section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/about" className="pill-btn-outline">← About AffiLayer</Link>
        <Link to="/register" className="pill-btn">Create an account</Link>
      </div>
    </PublicLayout>
  )
}
