import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { IspStats, StatsResponse } from '#/lib/types'

export const pct = (v: number) => `${Math.round(v * 100)}%`

/** Stacked share of green / yellow / red landings. Always shown next to its numbers. */
export function LightBar({
  lights,
  labels,
  sep,
}: {
  lights: IspStats['lights']
  labels: Record<'green' | 'yellow' | 'red', string>
  /** The page language's list separator, so a screen reader reads the label in one language. */
  sep: string
}) {
  const parts = (['green', 'yellow', 'red'] as const).filter((k) => lights[k] > 0)
  const title = (['green', 'yellow', 'red'] as const).map((k) => `${labels[k]} ${pct(lights[k])}`).join(sep)
  return (
    <span className="lightbar" role="img" aria-label={title} title={title}>
      {parts.map((k) => (
        <span key={k} data-light={k} style={{ flexGrow: lights[k] }} />
      ))}
    </span>
  )
}

/** One horizontal bar for a 0..1 share. */
export function ShareBar({ value, light }: { value: number; light: 'green' | 'yellow' | 'red' | 'gray' }) {
  return (
    <span className="sharebar" aria-hidden="true">
      <span data-light={light} style={{ transform: `scaleX(${Math.max(0, Math.min(1, value))})` }} />
    </span>
  )
}

export interface TrendSeries {
  key: string
  name: string
  points: { day: string; v: number; n: number }[]
}

// Series are told apart by dash pattern and a direct label, not by colour alone.
const DASHES = ['', '7 4', '2 4', '10 3 2 3', '1 5', '14 4']
const W = 720
const H = 280
const PAD = { l: 44, r: 16, t: 12, b: 28 }
// A day with only a handful of tests swings wildly; leave a gap instead of plotting noise.
export const MIN_DAY_N = 5

export function TrendChart({ series, days, label }: { series: TrendSeries[]; days: string[]; label: string }) {
  const x = (i: number) => PAD.l + (days.length > 1 ? (i / (days.length - 1)) * (W - PAD.l - PAD.r) : 0)
  const y = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b)
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const dayLabels = [0, Math.floor((days.length - 1) / 2), days.length - 1].filter((v, i, a) => a.indexOf(v) === i)

  return (
    <figure className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((v) => (
          <g key={v}>
            <line className="trend-grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
            <text className="trend-tick" x={PAD.l - 8} y={y(v) + 4} textAnchor="end">
              {pct(v)}
            </text>
          </g>
        ))}
        {dayLabels.map((i) => (
          <text key={i} className="trend-tick" x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}>
            {days[i].slice(5)}
          </text>
        ))}
        {series.map((s, si) => {
          const byDay = new Map(s.points.map((p) => [p.day, p]))
          let d = ''
          let pen = false
          days.forEach((day, i) => {
            const p = byDay.get(day)
            if (!p || p.n < MIN_DAY_N) {
              pen = false
              return
            }
            d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`
            pen = true
          })
          return <path key={s.key} className="trend-line" data-rank={si} d={d} strokeDasharray={DASHES[si % DASHES.length]} />
        })}
      </svg>
      <figcaption>
        <ul className="trend-legend">
          {series.map((s, si) => {
            const last = [...s.points].reverse().find((p) => p.n >= MIN_DAY_N)
            return (
              <li key={s.key}>
                <svg width="36" height="10" viewBox="0 0 36 10" aria-hidden="true">
                  <path className="trend-line" data-rank={si} d="M1,5H35" strokeDasharray={DASHES[si % DASHES.length]} />
                </svg>
                {s.name}
                {last && <b>{pct(last.v)}</b>}
              </li>
            )
          })}
        </ul>
      </figcaption>
    </figure>
  )
}

export interface DailyBar {
  day: string
  n: number
  /** Null on a day without tests. */
  lights: IspStats['lights'] | null
}

/** The `count` Taipei days ending on the day of `at`, oldest first: the whole stats window, empty days included. */
export function windowDays(at: number, count: number): string[] {
  const end = new Date(at + 8 * 3600_000)
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - (count - 1 - i))).toISOString().slice(0, 10),
  )
}

/** One bar per window day for `isp`; the trend only lists days that had tests. */
export function dailyBars(trend: StatsResponse['trend'], isp: string, days: string[]): DailyBar[] {
  const byDay = new Map(trend.filter((r) => r.isp === isp).map((r) => [r.day, r]))
  return days.map((day) => {
    const r = byDay.get(day)
    return r && r.n > 0 ? { day, n: r.n, lights: r.lights } : { day, n: 0, lights: null }
  })
}

const STEP = 10
const BAR = 8
const DAILY_H = 56
// A sliver of card between stacked segments, so they read apart without relying on hue.
const SEP = 1
// Taiwan at the base, like the share it stands for; legend order bottom to top.
const STACK = ['green', 'yellow', 'red'] as const

function Stack({ lights, x }: { lights: IspStats['lights']; x: number }) {
  const parts = STACK.filter((k) => lights[k] > 0)
  let top = DAILY_H
  return parts.map((k, j) => {
    const h = lights[k] * DAILY_H
    top -= h
    const gap = j < parts.length - 1 ? SEP : 0
    return <rect key={k} data-light={k} x={x} y={top + gap} width={BAR} height={Math.max(0, h - gap)} />
  })
}

function Hatch({ x }: { x: number }) {
  // Diagonal strokes clipped to the slot: the plot does not clip (the day outline overhangs it).
  let d = ''
  for (let y = 0; y < DAILY_H + BAR; y += 6) {
    const t0 = Math.max(0, y - DAILY_H)
    const t1 = Math.min(BAR, y)
    if (t1 > t0) d += `M${x + t0},${y - t0}L${x + t1},${y - t1}`
  }
  return (
    <>
      <rect className="daily-none" x={x} y={0} width={BAR} height={DAILY_H} />
      <path className="daily-hatch" d={d} />
    </>
  )
}

/** A 100% stacked bar per day. `describe` gives each bar its accessible name and tooltip text. */
export function DailyLights({
  bars,
  caption,
  label,
  describe,
  first,
  last,
}: {
  bars: DailyBar[]
  caption: string
  label: string
  describe: (b: DailyBar) => string
  first: string
  last: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const plot = useRef<SVGSVGElement>(null)
  const open = active != null
  // A tap elsewhere or a scroll puts the tooltip away; touch has no pointer-leave to do it.
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e.type === 'pointerdown' && plot.current?.contains(e.target as Node)) return
      setActive(null)
    }
    document.addEventListener('pointerdown', close, true)
    window.addEventListener('scroll', close, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', close, true)
      window.removeEventListener('scroll', close)
    }
  }, [open])
  const at = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(bars.length - 1, Math.floor(((e.clientX - r.left) / r.width) * bars.length)))
  }
  const n = bars.length
  // Near either edge the tooltip hangs inward so it stays inside the card.
  const tipStyle =
    active == null
      ? undefined
      : active < n / 4
        ? { left: `${(active / n) * 100}%` }
        : active >= (n * 3) / 4
          ? { right: `${(1 - (active + 1) / n) * 100}%` }
          : { left: `${((active + 0.5) / n) * 100}%`, transform: 'translateX(-50%)' }

  return (
    <figure className="daily">
      <figcaption>{caption}</figcaption>
      <div className="daily-plot">
        <svg
          ref={plot}
          viewBox={`0 0 ${n * STEP - (STEP - BAR)} ${DAILY_H}`}
          preserveAspectRatio="none"
          role="group"
          aria-label={label}
          onPointerMove={(e) => e.pointerType === 'mouse' && setActive(at(e))}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
          // Touch has no hover: a tap shows that day, a second tap on it hides it.
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse') return
            const i = at(e)
            setActive((a) => (a === i ? null : i))
          }}
        >
          {bars.map((b, i) => (
            <g key={b.day} role="img" aria-label={describe(b)} data-few={b.lights && b.n < MIN_DAY_N ? '' : undefined}>
              {b.lights && <Stack lights={b.lights} x={i * STEP} />}
              {!b.lights && <Hatch x={i * STEP} />}
            </g>
          ))}
          {active != null && (
            <rect className="daily-cursor" x={active * STEP - 1} y={0.5} width={BAR + 2} height={DAILY_H - 1} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {active != null && (
          <p className="daily-tip" style={tipStyle} aria-hidden="true">
            {describe(bars[active])}
          </p>
        )}
      </div>
      <div className="daily-axis" aria-hidden="true">
        <span>{first}</span>
        <span>{last}</span>
      </div>
    </figure>
  )
}
