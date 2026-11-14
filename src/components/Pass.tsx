import type { ReactNode } from 'react'
import { getIsp } from '#/data/isps'
import { getDict, ispName } from '#/i18n'
import type { Lang, TestResult } from '#/lib/types'
import { Lamp, PlaneIcon } from './icons'
import { figuresOf, headline, landingPlace, originOf, pendingBaselineLabel, stubOf } from './result-model'
import type { TestState } from './result-model'

interface Props {
  lang: Lang
  state: TestState
  /** A finished result shown as it is: no reveal. */
  still?: boolean
  /** Someone else's result (a shared link): its labels do not say "you". */
  shared?: boolean
  /** Right side of the status row (e.g. "test again"). */
  aside?: ReactNode
  /** Buttons under the stub. */
  children?: ReactNode
}

const PLACEHOLDER = '···'

/**
 * The result as a boarding pass: from → to, two big figures, a stub. Every row has a fixed
 * size, so the pass is exactly as tall while measuring as it is with any result.
 */
export function Pass({ lang, state, still, shared, aside, children }: Props) {
  const t = getDict(lang)
  const youLabel = shared ? t.card.shared.you : t.card.you
  const networkLabel = shared ? t.card.shared.network : t.card.network
  const r: TestResult | null = state.phase === 'done' ? state.result : null
  const { lamp, status } = headline(state, lang, null)
  const user = r?.user ?? (state.phase === 'measuring' ? state.user : null)
  const isp = r?.isp ?? (state.phase === 'measuring' ? state.isp : null)
  const origin = user ? originOf(user, lang) : { code: PLACEHOLDER, name: '' }
  const dest = r ? landingPlace(r.landing.iata, lang) : null
  const figures = r ? figuresOf(r, lang) : null
  // While the test runs the stub holds the place of the detour's pair, values pending.
  const stub = r
    ? stubOf(r, lang)
    : [
        { label: t.card.latency, value: '—' },
        { label: pendingBaselineLabel(user, lang), value: '—' },
      ]

  return (
    <article className="pass" data-light={lamp} data-phase={state.phase} data-still={still ? '' : undefined} aria-busy={state.phase === 'measuring'}>
      <header className="pass-head">
        <span className="lamp">
          <Lamp kind={lamp} />
          <span key={status} className="swap">
            {status}
          </span>
        </span>
        {aside}
      </header>

      <div className="pass-route">
        <div className="pass-end">
          <span className="label">{youLabel}</span>
          <span className="pass-code" data-empty={user ? undefined : ''}>
            <span key={origin.code} className="swap">
              {origin.code}
            </span>
          </span>
          <span className="pass-place">{origin.name && t.card.youValue(origin.name)}</span>
        </div>
        <div className="pass-track" aria-hidden="true">
          <span className="pass-track-line" />
          <span className="pass-track-fill" />
          <span className="pass-plane">
            <PlaneIcon />
          </span>
        </div>
        <div className="pass-end pass-end-to">
          <span className="label">{t.card.landing}</span>
          <span className="pass-code pass-code-to" data-empty={r ? undefined : ''}>
            {r && [...r.landing.iata].map((ch, i) => (
              <span key={i} className="rise" style={{ animationDelay: `${180 + i * 60}ms` }}>
                {ch}
              </span>
            ))}
            {!r && PLACEHOLDER}
          </span>
          <span className="pass-place">{dest && `${dest.city}・${dest.country}`}</span>
        </div>
      </div>

      <dl className="pass-figures">
        {[0, 1].map((i) => {
          const fig = figures?.[i]
          return (
            <div key={i} className="figure">
              <dt className="label">
                <span key={fig?.label ?? ''} className="swap">
                  {fig && fig.label}
                  {!fig && (i === 0 ? t.card.distanceLabel : t.card.latency)}
                </span>
              </dt>
              <dd>
                <b className="figure-value" data-empty={fig ? undefined : ''}>
                  {fig && fig.value}
                  {!fig && '—'}
                </b>
                <span className="figure-unit">{i === 0 ? t.card.km : t.card.ms}</span>
              </dd>
            </div>
          )
        })}
      </dl>

      <div className="pass-tear" aria-hidden="true" />

      <dl className="pass-stub">
        <div className="stub-wide">
          <dt className="label">{networkLabel}</dt>
          <dd>
            {isp && ispName(isp, lang)}
            {/* Unknown networks already show their ASN as part of the fallback name. */}
            {isp && isp.asn != null && getIsp(isp.key) && <span className="mono stub-asn">AS{isp.asn}</span>}
            {!isp && '—'}
          </dd>
        </div>
        {/* Two cells in every state; a label that changes on arrival cross-fades in place. */}
        {stub.map((cell, i) => (
          <div key={i}>
            <dt className="label">
              <span key={cell.label} className="swap">
                {cell.label}
              </span>
            </dt>
            <dd>{cell.value}</dd>
          </div>
        ))}
      </dl>

      {/* Always present, so the pass keeps its height while measuring. */}
      <div className="pass-actions">{children}</div>
    </article>
  )
}
