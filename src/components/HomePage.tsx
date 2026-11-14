import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MeasureError, getContribute, runMeasurement, setContribute } from '#/client/measure'
import type { MeasureProgress } from '#/client/measure'
import { loadTurnstile } from '#/client/turnstile'
import { useDemoStats } from '#/client/use-demo-stats'
import { getDict } from '#/i18n'
import { isTaiwanColo } from '#/lib/geo'
import type { Lang, StatsResponse, TestResult } from '#/lib/types'
import { ActSection } from './InfoSections'
import { Pass } from './Pass'
import { StatsSummary } from './StatsSummary'
import { Verdict } from './Verdict'
import { WhySection } from './WhySection'
import { ArrowIcon, RetryIcon, ShareIcon } from './icons'
import { RouteMap } from './map/RouteMap'
import { chtUsShareOf, isAbroadRoute, latLonOf, notesOf, originOf } from './result-model'
import type { TestState } from './result-model'
import { ShareSheet } from './share/ShareSheet'

// The route takes this long to draw; the verdict waits for it so the two land together.
const TRACE_MS = 2300
// 「落地了！」 stays up at least this long before the verdict replaces it.
const LANDED_MS = 450

const START: TestState = { phase: 'measuring', step: 0, colo: null, user: null, isp: null }

// Nothing below the hero changes while the test runs; memo keeps the progress updates out of it.
const Stats = memo(StatsSummary)
const Why = memo(WhySection)
const Act = memo(ActSection)

/** Who the visitor is, as far as this state knows. */
function whoOf(state: TestState): { user: TestResult['user'] | null; isp: TestResult['isp'] | null } {
  if (state.phase === 'done') return { user: state.result.user, isp: state.result.isp }
  if (state.phase === 'measuring') return { user: state.user, isp: state.isp }
  return { user: null, isp: null }
}

function measure(lang: Lang, onProgress: (p: MeasureProgress) => void): Promise<TestResult> {
  if (import.meta.env.DEV) {
    const kind = new URLSearchParams(location.search).get('demo')
    if (kind) return import('#/client/demo').then((m) => m.runDemo(kind, onProgress))
  }
  return runMeasurement(lang, onProgress)
}

interface Props {
  lang: Lang
  stats: StatsResponse | null
  /**
   * A stored result opened from its link (/r/:id). The page is the home page with that result
   * already on it: nothing runs until the visitor asks for a test of their own.
   */
  shared?: TestResult
}

export function HomePage({ lang, stats: loaded, shared }: Props) {
  const stats = useDemoStats(loaded)
  const t = getDict(lang)
  const [state, setState] = useState<TestState>(() => (shared ? { phase: 'done', result: shared } : START))
  // Until the visitor runs a test here, the result on screen is someone else's.
  const [mine, setMine] = useState(!shared)
  const mineRef = useRef(!shared)
  const sharedView = !mine
  const [contribute, setContributeState] = useState(true)
  const [sheet, setSheet] = useState(false)
  const busy = useRef(false)
  const shareWhenDone = useRef(false)

  const run = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    // A retest keeps who the visitor is on screen; only the route is traced again. A shared
    // result's visitor is someone else, so their place is not kept.
    const keepWho = mineRef.current
    mineRef.current = true
    setMine(true)
    setState((s) => ({ ...START, ...(keepWho ? whoOf(s) : {}) }))
    setSheet(false)
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let tracedAt = 0
    let landedAt = 0
    try {
      const result = await measure(lang, (p) => {
        if (p.step === 1 && !tracedAt) tracedAt = performance.now()
        if (p.step === 2 && !landedAt) landedAt = performance.now()
        setState((s) => {
          const who = whoOf(s)
          return { phase: 'measuring', step: p.step, colo: p.colo ?? null, user: p.user ?? who.user, isp: p.isp ?? who.isp }
        })
      })
      const wait = Math.max(tracedAt + TRACE_MS, landedAt + LANDED_MS) - performance.now()
      if (wait > 0 && !calm) await new Promise((r) => setTimeout(r, wait))
      setState({ phase: 'done', result })
      if (shareWhenDone.current && result.id) setSheet(true)
    } catch (e) {
      setState({ phase: 'error', kind: e instanceof MeasureError ? e.kind : 'failed' })
    } finally {
      shareWhenDone.current = false
      busy.current = false
    }
  }, [lang])

  // A shared result stays on screen until the visitor asks for a test of their own.
  const startsShared = useRef(!!shared)
  useEffect(() => {
    setContributeState(getContribute())
    // Fetched now, so the token is usually ready by the time the measurement finishes.
    loadTurnstile()
    if (!startsShared.current) run()
  }, [run])

  const toggleContribute = () => {
    setContribute(!contribute)
    setContributeState(!contribute)
  }

  const contributeAndShare = useCallback(() => {
    setContribute(true)
    setContributeState(true)
    shareWhenDone.current = true
    window.scrollTo({ top: 0, behavior: 'smooth' })
    run()
  }, [run])

  const result: TestResult | null = state.phase === 'done' ? state.result : null
  const colo = result?.landing.iata ?? (state.phase === 'measuring' ? state.colo : null)
  const { user } = whoOf(state)
  const openSheet = useCallback(() => setSheet(true), [])
  const from = useMemo(() => (user ? latLonOf(user) : null), [user])
  const chtUsShare = chtUsShareOf(stats)
  // Notes speak to the person who ran the test ("you seem to be roaming…").
  const notes = result && !sharedView ? notesOf(result, lang).join(' ') : ''

  return (
    <main id="main">
      <section className="hero" aria-label={t.card.landing}>
        <div className="hero-inner wrap">
          <div className="hero-says">
            {/* On a shared result's page the verdict is the page heading. */}
            <Verdict lang={lang} state={state} chtUsShare={chtUsShare} as={shared ? 'h1' : 'h2'} still={sharedView} shared={sharedView} />
          </div>

          <div className="hero-chart">
            <RouteMap
              lang={lang}
              from={from}
              fromLabel={user ? originOf(user, lang).name : null}
              to={colo}
              abroad={!!user && isAbroadRoute(user, colo)}
              light={result?.light ?? null}
              phase={result ? 'landed' : state.phase === 'measuring' && colo ? 'tracing' : 'idle'}
              drawEarly={sharedView || (user?.country === 'TW' && !!colo && !isTaiwanColo(colo))}
              still={sharedView}
            />
          </div>

          <div className="hero-pass">
            <Pass
              lang={lang}
              state={state}
              still={sharedView}
              shared={sharedView}
              aside={
                result &&
                !sharedView && (
                  <button type="button" className="link-btn" onClick={run}>
                    <RetryIcon />
                    {t.measure.again}
                  </button>
                )
              }
            >
              {state.phase === 'error' && (
                <button type="button" className="btn btn-primary" onClick={run}>
                  <RetryIcon />
                  {t.measure.retry}
                </button>
              )}
              {result && sharedView && <SharedActions lang={lang} result={result} onTest={run} />}
              {result && !sharedView && <PassActions lang={lang} result={result} onShare={openSheet} onRetest={run} />}
            </Pass>
            <noscript>
              <p className="noscript-note">{t.measure.noscript}</p>
            </noscript>

            <div className="contribute">
              <button type="button" role="switch" aria-checked={contribute} className="switch" onClick={toggleContribute}>
                <span className="switch-track" aria-hidden="true">
                  <span className="switch-thumb" />
                </span>
                {t.card.contribute}
              </button>
              <p className="hero-note" aria-live="polite">
                {notes && (
                  <span key={notes} className="swap">
                    {notes}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      <Stats lang={lang} stats={stats} />
      <Why lang={lang} result={result} />
      <Act lang={lang} result={result} stats={stats} shared={sharedView} />

      {result && (
        <ShareSheet
          lang={lang}
          open={sheet}
          onClose={() => setSheet(false)}
          result={result}
          onContribute={contributeAndShare}
          shared={sharedView}
        />
      )}
    </main>
  )
}

/** Under someone else's result: the way to a test of one's own first, then where to read on. */
function SharedActions({ lang, result, onTest }: { lang: Lang; result: TestResult; onTest: () => void }) {
  const t = getDict(lang)
  const a = t.card.actions
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={onTest}>
        {t.result.cta}
        <ArrowIcon />
      </button>
      {result.light === 'green' && (
        <a className="btn" href="#stats">
          {a.stats}
        </a>
      )}
      {result.light === 'red' && (
        <a className="btn" href="#why">
          {a.whose}
        </a>
      )}
      {result.light === 'yellow' && (
        <a className="btn" href="#why">
          {a.why}
        </a>
      )}
    </>
  )
}

function PassActions({
  lang,
  result,
  onShare,
  onRetest,
}: {
  lang: Lang
  result: TestResult
  onShare: () => void
  onRetest: () => void
}) {
  const a = getDict(lang).card.actions
  const share = (label: string, primary: boolean) => (
    <button type="button" className={primary ? 'btn btn-primary' : 'btn'} onClick={onShare}>
      <ShareIcon />
      {label}
    </button>
  )
  switch (result.light) {
    case 'green':
      return (
        <>
          <a className="btn btn-primary" href="#stats">
            {a.stats}
          </a>
          {share(a.share, false)}
        </>
      )
    case 'yellow':
    case 'red':
      return (
        <>
          {share(a.share, true)}
          <a className="btn" href="#why">
            {result.light === 'red' && a.whose}
            {result.light === 'yellow' && a.why}
          </a>
        </>
      )
    case 'gray':
      return (
        <button type="button" className="btn btn-primary" onClick={onRetest}>
          <RetryIcon />
          {a.retest}
        </button>
      )
    case 'blue':
      return share(a.family, true)
  }
}
