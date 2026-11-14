import { memo, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { getColo } from '#/data/colos'
import { MAP_EXTENT, MAP_HEIGHT, MAP_WIDTH } from '#/data/map-views'
import type { MapView } from '#/data/map-views'
import { coloCity, getDict } from '#/i18n'
import type { Lang, Light } from '#/lib/types'
import { chooseAbroadView, chooseView, frameZoom, percent, project, routePath } from './geometry'
import type { LatLon } from './geometry'

export const TAIPEI: LatLon = { lat: 25.04, lon: 121.56 }

export interface RouteMapProps {
  lang: Lang
  /** Where the visitor is, known as soon as the test starts; null before that or when it cannot be told. */
  from: LatLon | null
  /** Name shown at the origin, e.g. 台中市. */
  fromLabel: string | null
  /** Landing colo, null until the first response names it. */
  to: string | null
  /** Neither end is in Taiwan: the chart must not show the island as part of the story. */
  abroad: boolean
  light: Light | null
  /**
   * idle: base chart only. tracing: the measurement is running. landed: final state.
   */
  phase: 'idle' | 'tracing' | 'landed'
  /** Whether the route may be drawn before the result is in (we only know the origin for sure in Taiwan). */
  drawEarly: boolean
  /** No reveal animation: the shared-result page shows a finished chart. */
  still?: boolean
}

// Below this distance (map units) the two markers are one place on screen: one label is enough.
const MERGE_DISTANCE = 230
const LOW_IN_FRAME = MAP_HEIGHT * 0.6
// Matches the scene fade-out in the stylesheet.
const LEAVE_MS = 450
// The drawn canvas reaches past the frame the scene is sized to; the stylesheet also needs its
// offset (as a share of the frame) to keep the fades fixed to the chart box.
const CANVAS = {
  '--cx': MAP_EXTENT.x0 / MAP_WIDTH,
  '--cy': MAP_EXTENT.y0 / MAP_HEIGHT,
  width: `${((MAP_EXTENT.x1 - MAP_EXTENT.x0) / MAP_WIDTH) * 100}%`,
  height: `${((MAP_EXTENT.y1 - MAP_EXTENT.y0) / MAP_HEIGHT) * 100}%`,
} as CSSProperties

function anchorFor(x: number): 'start' | 'middle' | 'end' {
  if (x < MAP_WIDTH * 0.3) return 'start'
  if (x > MAP_WIDTH * 0.7) return 'end'
  return 'middle'
}

function destOf(to: string | null): LatLon | null {
  const colo = getColo(to)
  return colo ? { lat: colo.lat, lon: colo.lon } : null
}

/** No view until there is a place to frame: before that the visitor could be anywhere. */
function viewOf(p: RouteMapProps): MapView | null {
  const points = [p.from, destOf(p.to)].filter((v): v is LatLon => !!v)
  if (!points.length) return null
  return p.abroad ? chooseAbroadView(points) : chooseView(points)
}

/** One map view with its route and markers. A scene never changes view: a new view is a new scene. */
function Scene(props: RouteMapProps & { view: MapView; leaving?: boolean }) {
  const { lang, from, to, light, phase, drawEarly, still, view, leaving } = props
  const base = useRef<HTMLImageElement>(null)
  const dest = destOf(to)
  const landed = phase === 'landed'

  // The image can finish loading before hydration, when onLoad no longer fires.
  useEffect(() => {
    const img = base.current
    if (!img) return
    const ready = () => img.setAttribute('data-ready', '')
    if (img.complete) ready()
    else img.addEventListener('load', ready, { once: true })
    return () => img.removeEventListener('load', ready)
  }, [])

  const a = from ? project(view, from) : null
  const b = dest ? project(view, dest) : null
  // The white track is drawn while the test runs; the light's colour fades in over it at the end.
  const d = from && dest && (landed || (phase === 'tracing' && drawEarly)) ? routePath(view, from, dest) : ''

  const apart = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0
  const steep = a && b ? Math.abs(b.x - a.x) < apart * 0.6 : false
  // Labels sit away from the route: below it, or beyond each end when it runs north–south.
  // A landing marker on its own low in the frame has no room underneath (the pass covers the
  // bottom of the chart on a phone), so its label goes above.
  const alone = !!b && (!a || apart < MERGE_DISTANCE)
  const destAbove = (steep && !!a && !!b && b.y < a.y) || (alone && !!b && b.y > LOW_IN_FRAME)
  const originAbove = steep && !!a && !!b && b.y >= a.y

  // Only a flat map zooms, and a flat map is only chosen once both ends are known (a scene
  // never changes view), so the framing is set once per scene and never moves.
  const zoom = frameZoom(
    [a, b].filter((p): p is NonNullable<typeof p> => !!p),
    view.type === 'flat',
  )

  return (
    <div
      className="scene"
      style={zoom !== 1 ? ({ '--zoom': zoom.toFixed(3) } as CSSProperties) : undefined}
      data-phase={phase}
      data-light={light ?? undefined}
      data-early={drawEarly ? '' : undefined}
      data-still={still ? '' : undefined}
      data-leaving={leaving ? '' : undefined}
    >
      <img
        ref={base}
        className="chart-base"
        src={`/maps/${view.id}.svg`}
        alt=""
        width={MAP_EXTENT.x1 - MAP_EXTENT.x0}
        height={MAP_EXTENT.y1 - MAP_EXTENT.y0}
        style={CANVAS}
        decoding="async"
        draggable={false}
      />
      <svg className="chart-lines" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} aria-hidden="true">
        {d && <path className="chart-route" d={d} pathLength={1} />}
        {d && landed && <path className="chart-tint" d={d} />}
      </svg>
      {a && <span className="chart-origin" style={percent(a)} aria-hidden="true" />}
      {a && landed && (apart >= MERGE_DISTANCE || !b) && (
        <span className="chart-label chart-label-origin" data-anchor={anchorFor(a.x)} data-above={originAbove ? '' : undefined} style={percent(a)} aria-hidden="true">
          {props.fromLabel && <span>{props.fromLabel}</span>}
        </span>
      )}
      {b && (
        <span className="chart-dest" style={percent(b)} aria-hidden="true">
          <i />
        </span>
      )}
      {b && to && landed && (
        <span className="chart-label chart-label-dest" data-anchor={anchorFor(b.x)} data-above={destAbove ? '' : undefined} style={percent(b)} aria-hidden="true">
          <b>{to}</b>
          <span>{coloCity(to, lang)}</span>
        </span>
      )}
    </div>
  )
}

export const RouteMap = memo(function RouteMap(props: RouteMapProps) {
  const t = getDict(props.lang)
  const view = viewOf(props)
  // When the framing changes, the old scene stays for a moment and the two cross-fade.
  const [shown, setShown] = useState<{ props: RouteMapProps; leaving: RouteMapProps | null }>({ props, leaving: null })
  if (shown.props !== props) {
    const old = viewOf(shown.props)
    setShown({ props, leaving: old && old.id !== view?.id ? shown.props : shown.leaving })
  }
  const leavingView = shown.leaving && viewOf(shown.leaving)
  const leaving = leavingView && leavingView.id !== view?.id ? shown.leaving : null

  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => setShown((s) => (s.leaving === leaving ? { ...s, leaving: null } : s)), LEAVE_MS)
    return () => clearTimeout(timer)
  }, [leaving])

  const label = props.to && props.fromLabel && destOf(props.to) ? t.map.label(props.fromLabel, coloCity(props.to, props.lang)) : t.map.labelPending

  return (
    <figure className="chart" role="img" aria-label={label}>
      {leaving && leavingView && <Scene key={leavingView.id} {...leaving} view={leavingView} leaving />}
      {view && <Scene key={view.id} {...props} view={view} />}
    </figure>
  )
})
