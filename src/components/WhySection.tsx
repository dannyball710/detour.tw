import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { getColo } from '#/data/colos'
import { coloCity, fmtNum, getDict } from '#/i18n'
import type { Dict } from '#/i18n'
import { isTaiwanColo } from '#/lib/geo'
import type { Lang, TestResult } from '#/lib/types'
import { isDetour } from './result-model'

/** Round trips used when the visitor has no measurement of their own for a path. */
const EXAMPLE_MS = { direct: 10, detour: 150 }
// The packets move 30 times slower than the real thing: 10 ms becomes a blink, 150 ms a crossing you can watch.
const SLOWDOWN = 30

interface Lane {
  ms: number
  /** Measured by this visitor, as opposed to a typical figure. */
  own: boolean
}

/** The two paths, with the visitor's own round trips wherever they measured one. */
export function lanesOf(result: TestResult | null): { direct: Lane; detour: Lane } {
  const lanes = { direct: { ms: EXAMPLE_MS.direct, own: false }, detour: { ms: EXAMPLE_MS.detour, own: false } }
  if (!result || result.user.country !== 'TW') return lanes
  if (isDetour(result)) {
    lanes.detour = { ms: result.landing.rttMs, own: true }
    if (result.ref && isTaiwanColo(result.ref.iata)) lanes.direct = { ms: result.ref.rttMs, own: true }
  } else if (result.light === 'green') {
    lanes.direct = { ms: result.landing.rttMs, own: true }
  }
  return lanes
}

/**
 * Marks each step the first time it scrolls into view (its picture draws once) and while it is
 * in view (its packet only runs when someone can see it). Attributes are set straight on the
 * elements: no render is involved.
 */
function useStepsInView() {
  const ref = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const steps = [...(ref.current?.children ?? [])]
    for (const step of steps) step.setAttribute('data-armed', '')
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) entry.target.setAttribute('data-seen', '')
          entry.target.toggleAttribute('data-live', entry.isIntersecting)
        }
      },
      { threshold: 0.3 },
    )
    for (const step of steps) io.observe(step)
    return () => io.disconnect()
  }, [])
  return ref
}

/*
 * The pictures share one vocabulary: a phone (you), a mast (your ISP), a rack under a cloud
 * (a Cloudflare data center), a browser window (the website). Each is drawn around (x, 40).
 */
const Y = 40

function Phone({ x }: { x: number }) {
  return (
    <>
      <rect className="pic-shape" x={x - 8} y={Y - 14} width="16" height="28" rx="3.5" />
      <path className="pic-detail" d={`M${x - 3} ${Y + 10}h6`} />
    </>
  )
}

function Mast({ x }: { x: number }) {
  return (
    <>
      <rect className="pic-back" x={x - 11} y={Y - 14} width="22" height="29" rx="4" />
      <path className="pic-detail" d={`M${x - 9} ${Y + 14}L${x} ${Y - 9}l9 23M${x - 5.5} ${Y + 5}h11M${x - 7} ${Y - 15}a9.5 9.5 0 0 1 14 0`} />
      <circle className="pic-dot" cx={x} cy={Y - 11} r="2.4" />
    </>
  )
}

function Site({ x, on, dim }: { x: number; on?: boolean; dim?: boolean }) {
  return (
    <g className="pic-site" data-on={on ? '' : undefined} data-dim={dim ? '' : undefined}>
      <rect className="pic-shape" x={x - 13} y={Y - 9} width="26" height="23" rx="3" />
      <path className="pic-shape" d={`M${x - 7} ${Y - 7}a4.2 4.2 0 0 1 .5-8.3 5.4 5.4 0 0 1 10.2 1.2 3.6 3.6 0 0 1 3 7.1z`} />
      <path className="pic-detail" d={`M${x - 8} ${Y + 1}h16M${x - 8} ${Y + 8}h16`} />
    </g>
  )
}

function Window({ x }: { x: number }) {
  return (
    <>
      <rect className="pic-shape" x={x - 15} y={Y - 11} width="30" height="22" rx="3" />
      <path className="pic-detail" d={`M${x - 15} ${Y - 4}h30`} />
      <circle className="pic-dot" cx={x - 10} cy={Y - 7.5} r="1.3" />
      <circle className="pic-dot" cx={x - 5.5} cy={Y - 7.5} r="1.3" />
    </>
  )
}

function Label({ x, lines, anchor = 'middle', note }: { x: number; lines: string | string[]; anchor?: 'start' | 'middle' | 'end'; note?: boolean }) {
  return (
    <text className={note ? 'pic-text pic-note' : 'pic-text'} x={x} y={Y + 32} textAnchor={anchor}>
      {[lines].flat().map((line, i) => (
        <tspan key={i} x={x} dy={i ? 13 : 0}>
          {line}
        </tspan>
      ))}
    </text>
  )
}

/**
 * A dot that runs along a route and back: a zero-length dash moved by its offset. `lag` starts
 * it later than the others on the same picture; `rare` makes it an occasional trip, not a loop.
 */
function Packet({ d, lag, rare }: { d: string; lag?: number; rare?: boolean }) {
  return (
    <g className={rare ? 'pic-packet pic-packet-rare' : 'pic-packet'} style={lag ? ({ '--lag': lag } as CSSProperties) : undefined}>
      <path className="pic-packet-halo" d={d} pathLength={1} />
      <path d={d} pathLength={1} />
    </g>
  )
}

function Picture({
  height,
  label,
  light,
  leg,
  className,
  children,
}: {
  height: number
  label: string
  light?: 'green' | 'red'
  leg: number
  className?: string
  children: ReactNode
}) {
  return (
    <svg
      className={className ? `pic ${className}` : 'pic'}
      viewBox={`0 0 320 ${height}`}
      role="img"
      aria-label={label}
      data-light={light}
      style={{ '--leg': `${leg}ms` } as CSSProperties}
    >
      {children}
    </svg>
  )
}

function TripPicture({ lang }: { lang: Lang }) {
  const t = getDict(lang).why
  const d = 'M20 40H298'
  return (
    <Picture height={84} label={t.trip.alt} leg={1100}>
      <path className="pic-route" d={d} pathLength={1} />
      <Packet d={d} />
      <Phone x={20} />
      <Window x={298} />
      <text className="pic-text pic-note pic-pop" x="100" y="27" textAnchor="middle">
        {t.trip.ask} →
      </text>
      <text className="pic-text pic-note pic-pop" x="218" y="60" textAnchor="middle">
        ← {t.trip.answer}
      </text>
      <Label x={20} lines={t.you} />
      <Label x={298} lines={t.trip.site} />
    </Picture>
  )
}

// Three request lanes into Cloudflare, one thin line on to the website: many asked, few passed on.
const WEB_EDGE_X = 150
const WEB_LANES = [32, 40, 48]

function WebPicture({ lang }: { lang: Lang }) {
  const t = getDict(lang).why
  const toOrigin = `M${WEB_EDGE_X + 14} 40H283`
  return (
    <Picture height={84} label={t.web.alt} leg={600} className="pic-many">
      <path className="pic-route pic-route-thin" d={toOrigin} pathLength={1} />
      {WEB_LANES.map((y) => (
        <path key={y} className="pic-route" d={`M29 ${y}H${WEB_EDGE_X - 14}`} pathLength={1} />
      ))}
      {/* The lanes take turns, so a request is always on its way somewhere. */}
      {WEB_LANES.map((y, i) => (
        <Packet key={y} d={`M29 ${y}H${WEB_EDGE_X - 14}`} lag={(i * 2) / 3} />
      ))}
      {/* About one request in four or five goes on to the website. */}
      <Packet d={toOrigin} rare />
      <Phone x={20} />
      <Site x={WEB_EDGE_X} on />
      <g className="pic-dim">
        <Window x={298} />
      </g>
      <Label x={20} lines={t.you} />
      <Label x={WEB_EDGE_X} lines={t.web.near} />
      <Label x={318} lines={t.web.origin} anchor="end" note />
    </Picture>
  )
}

const WAVES = 'M178 49q6-4 12 0t12 0t12 0t12 0t12 0t12 0t12 0t12 0M184 56q6-4 12 0t12 0t12 0t12 0t12 0t12 0t12 0'
// Where the ISP's network would meet Cloudflare's in Taiwan, and where it does abroad.
const JOIN_X = 111
const JOIN_FAR_X = 266
// The far data center sits in from the edge so its two-line label can be centred under it.
const FAR_X = 290

function LanePicture({ lang, kind, lane, farColo }: { lang: Lang; kind: 'direct' | 'detour'; lane: Lane; farColo: string }) {
  const t = getDict(lang).why
  const direct = kind === 'direct'
  const city = coloCity(farColo, lang)
  const ms = Math.max(1, Math.round(lane.ms))
  const d = direct ? 'M16 40H146' : `M16 40H96C114 40 120 8 146 8S178 40 196 40H${FAR_X}`
  // Only a landing in the Americas is across the Pacific; Hong Kong or Tokyo is not.
  const region = getColo(farColo)?.region
  const pacific = region === 'north-america' || region === 'south-america'
  const far = (
    <>
      <path className="pic-waves" d={WAVES} />
      {pacific && (
        <text className="pic-text pic-note" x="224" y="72" textAnchor="middle">
          {t.peer.pacific}
        </text>
      )}
    </>
  )
  return (
    <div className="lane">
      <p className="lane-head">
        <b>{t.peer[kind]}</b>
        <span>
          {t.peer.ms(fmtNum(ms, lang))}
          <small>
            {lane.own && t.peer.measured}
            {!lane.own && t.peer.example}
          </small>
        </span>
      </p>
      {/* One way takes half the round trip, slowed down; then the packet turns back. */}
      <Picture
        height={110}
        label={direct ? t.peer.alt.direct : pacific ? t.peer.alt.detour(city) : t.peer.alt.detourNear(city)}
        light={direct ? 'green' : 'red'}
        leg={Math.round((ms / 2) * SLOWDOWN)}
      >
        {direct && (
          <g className="pic-dim">
            {far}
            <Site x={FAR_X} />
            <Label x={FAR_X} lines={['Cloudflare', city]} />
          </g>
        )}
        {!direct && far}
        {!direct && <path className="pic-far" d={`M98 40H132`} />}
        <path className="pic-leader" d={`M${JOIN_X} 49V92`} />
        <path className="pic-route" d={d} pathLength={1} />
        {direct && <circle className="pic-join" cx={JOIN_X} cy={Y} r="4.5" />}
        {!direct && <path className="pic-cross" d={`M${JOIN_X - 4} ${Y - 4}l8 8m0-8l-8 8`} />}
        {!direct && (
          <>
            <path className="pic-leader" d={`M${JOIN_FAR_X} 33V17`} />
            <circle className="pic-join pic-pop" cx={JOIN_FAR_X} cy={Y} r="4.5" />
            <text className="pic-text pic-note pic-mark" x="318" y="12" textAnchor="end">
              {t.peer.joinedFar(city)}
            </text>
          </>
        )}
        <Packet d={d} />
        <Phone x={16} />
        <Mast x={84} />
        <Site x={146} on={direct} dim={!direct} />
        {!direct && <Site x={FAR_X} on />}
        <Label x={16} lines={t.you} />
        <Label x={84} lines={t.peer.isp} />
        <g className={direct ? undefined : 'pic-dim'}>
          <Label x={146} lines={['Cloudflare', t.peer.taipei]} />
        </g>
        {!direct && <Label x={FAR_X} lines={['Cloudflare', city]} />}
        <text className="pic-text pic-note pic-mark" x={JOIN_X} y="104" textAnchor="middle">
          {direct && t.peer.joined}
          {!direct && t.peer.notJoined}
        </text>
      </Picture>
    </div>
  )
}

type CostIconKind = Dict['why']['cost']['items'][number]['icon']

/** Small line icons for the costs of the detour, on a 24-unit grid. */
const COST_ICONS: Record<CostIconKind, string> = {
  // A clock: every trip takes longer.
  slow: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2',
  // There and back, twice.
  twice: 'M3 9c3-5 7-5 9 0s6 5 9 0M3 15c3 5 7 5 9 0s6-5 9 0',
  // A runner ahead of another.
  faster: 'M4 17h7M7 13h6M13 6l5 6-5 6M8 6l5 6-5 6',
  // A cable bundle squeezed through one point.
  cable: 'M3 6c6 0 6 6 9 6s3-6 9-6M3 18c6 0 6-6 9-6s3 6 9 6M3 12h18',
  // Scales tipped one way.
  unfair: 'M12 4v16M8 20h8M4 9l8-2 8 2M4 9l-2 5h4zM20 9l-2 3h4z',
  // A shield struck through.
  shield: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM4 4l16 16',
}

function CostIcon({ kind }: { kind: CostIconKind }) {
  return (
    <svg className="cost-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={COST_ICONS[kind]} />
    </svg>
  )
}

/** A step's text: one or more paragraphs. */
function StepText({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div className="why-text">
      {paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  )
}

export function WhySection({ lang, result }: { lang: Lang; result: TestResult | null }) {
  const t = getDict(lang).why
  const steps = useStepsInView()
  const lanes = lanesOf(result)
  // The far end of the detour is the visitor's own landing colo when they have one.
  const farColo = lanes.detour.own && result ? result.landing.iata : 'LAX'

  return (
    <section id="why" className="section why" aria-labelledby="why-h">
      <div className="wrap">
        <div className="section-head">
          <h2 id="why-h">{t.heading}</h2>
        </div>
        <ol className="why-steps" ref={steps}>
          <li className="why-step">
            <h3>{t.trip.title}</h3>
            <div className="why-art">
              <TripPicture lang={lang} />
            </div>
            <StepText paragraphs={t.trip.body} />
          </li>

          <li className="why-step">
            <h3>{t.web.title}</h3>
            <div className="why-art">
              <WebPicture lang={lang} />
            </div>
            <div className="why-text">
              {t.web.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
              {/* The turn of the story: it leads straight into the next step. */}
              <p className="why-but">
                <strong>{t.web.but}</strong>
              </p>
            </div>
          </li>

          <li className="why-step">
            <h3>{t.peer.title}</h3>
            <div className="why-art">
              <LanePicture lang={lang} kind="direct" lane={lanes.direct} farColo={farColo} />
              <LanePicture lang={lang} kind="detour" lane={lanes.detour} farColo={farColo} />
            </div>
            <StepText paragraphs={t.peer.body} />
          </li>

          <li className="why-step why-step-wide">
            <h3>{t.cost.title}</h3>
            <ul className="costs">
              {t.cost.items.map((item) => (
                <li key={item.h} className="cost">
                  <CostIcon kind={item.icon} />
                  <h4>{item.h}</h4>
                  <p>{item.p}</p>
                </li>
              ))}
            </ul>
          </li>
        </ol>
      </div>
    </section>
  )
}
