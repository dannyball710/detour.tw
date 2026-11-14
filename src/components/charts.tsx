import type { IspStats } from '#/lib/types'

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
const MIN_DAY_N = 5

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
