import { ABROAD_VIEWS, MAP_HEIGHT, MAP_VIEWS, MAP_WIDTH } from '#/data/map-views'
import type { MapView } from '#/data/map-views'

export interface LatLon {
  lat: number
  lon: number
}

export interface Point {
  x: number
  y: number
}

const RAD = Math.PI / 180

// Both ends (and their labels) must sit inside this frame for a view to be usable.
const SAFE = { x0: 90, y0: 110, x1: MAP_WIDTH - 90, y1: MAP_HEIGHT - 90 }
const ARC_STEPS = 48
// How far the route may lift off the chord, as a share of its length.
const ARC_LIFT = 0.2
const ARC_TOP_MARGIN = 36

export function project(v: MapView, p: LatLon): Point & { visible: boolean } {
  const dl = ((((p.lon - v.lon0) % 360) + 540) % 360) - 180
  if (v.type === 'flat') {
    return { x: v.cx + v.r * dl * RAD, y: v.cy - v.r * (p.lat - v.lat0) * RAD, visible: true }
  }
  const l = dl * RAD
  const phi = p.lat * RAD
  const phi0 = v.lat0 * RAD
  const cosc = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(l)
  return {
    x: v.cx + v.r * Math.cos(phi) * Math.sin(l),
    y: v.cy - v.r * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(l)),
    // Points close to the limb are too foreshortened to read.
    visible: cosc > 0.1,
  }
}

function fits(v: MapView, p: LatLon): boolean {
  const q = project(v, p)
  return q.visible && q.x >= SAFE.x0 && q.x <= SAFE.x1 && q.y >= SAFE.y0 && q.y <= SAFE.y1
}

/** Whether the great circle between two places stays on one copy of a flat map (no edge crossing). */
function unbroken(v: MapView, points: LatLon[]): boolean {
  if (points.length < 2) return true
  const track = greatCircle(points[0], points[1]).map((p) => project(v, p))
  return track.every((q, i) => q.x >= 0 && q.x <= MAP_WIDTH && (i === 0 || Math.abs(q.x - track[i - 1].x) < MAP_WIDTH / 2))
}

/**
 * Whether a view frames the route: both ends in its safe area, and on a flat map (which has
 * edges a globe does not) a route drawn in one piece.
 */
function frames(v: MapView, points: LatLon[]): boolean {
  return points.every((p) => fits(v, p)) && (v.type !== 'flat' || unbroken(v, points))
}

/** Last resort among flat maps: any that draws the route in one piece, the frame shrinking to fit. */
function anyUnbroken(views: MapView[], points: LatLon[]): MapView | undefined {
  return views.find((v) => v.type === 'flat' && unbroken(v, points))
}

// A flat world map frames half the planet's routes at a scale meant for the longest; one that
// spans less is drawn larger, up to this much, so the map fills the hero like the globes do.
const MAX_FLAT_ZOOM = 1.6

/**
 * How much to scale the scene around the safe area's centre, which the stylesheet fits to the
 * free part of the chart: below 1 when an end overruns the safe area (a last-resort flat map),
 * above 1 on a flat map whose route leaves room, 1 for every globe view.
 */
export function frameZoom(points: Point[], flat: boolean): number {
  const midX = (SAFE.x0 + SAFE.x1) / 2
  const midY = (SAFE.y0 + SAFE.y1) / 2
  const reachX = Math.max(1, ...points.map((p) => Math.abs(p.x - midX)))
  const reachY = Math.max(1, ...points.map((p) => Math.abs(p.y - midY)))
  const room = Math.min(((SAFE.x1 - SAFE.x0) / 2) / reachX, ((SAFE.y1 - SAFE.y0) / 2) / reachY)
  return flat ? Math.min(MAX_FLAT_ZOOM, room) : Math.min(1, room)
}

/** The tightest view that frames every point; a flat world map, cut where the route allows, last. */
export function chooseView(points: LatLon[]): MapView {
  const views = Object.values(MAP_VIEWS) as MapView[]
  return views.find((v) => frames(v, points)) ?? anyUnbroken(views, points) ?? MAP_VIEWS.world
}

/**
 * The view for a route with neither end in Taiwan, from maps that do not feature the island:
 * the tightest that frames every point and, where several of that scale do, the best centred.
 */
export function chooseAbroadView(points: LatLon[]): MapView {
  let best: MapView | null = null
  let bestOff = Infinity
  for (const v of ABROAD_VIEWS) {
    if (best && v.r !== best.r) break
    if (!frames(v, points)) continue
    const off = Math.max(
      ...points.map((p) => {
        const q = project(v, p)
        return Math.hypot(q.x - MAP_WIDTH / 2, q.y - MAP_HEIGHT / 2)
      }),
    )
    if (off < bestOff) {
      best = v
      bestOff = off
    }
  }
  return best ?? anyUnbroken(ABROAD_VIEWS, points) ?? ABROAD_VIEWS[ABROAD_VIEWS.length - 1]
}

function toVector(p: LatLon): [number, number, number] {
  const phi = p.lat * RAD
  const l = p.lon * RAD
  return [Math.cos(phi) * Math.cos(l), Math.cos(phi) * Math.sin(l), Math.sin(phi)]
}

/** Points along the great circle between two places. */
function greatCircle(a: LatLon, b: LatLon): LatLon[] {
  const va = toVector(a)
  const vb = toVector(b)
  const dot = Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]))
  const omega = Math.acos(dot)
  if (omega < 1e-6) return [a, b]
  const out: LatLon[] = []
  for (let i = 0; i <= ARC_STEPS; i++) {
    const t = i / ARC_STEPS
    const ka = Math.sin((1 - t) * omega) / Math.sin(omega)
    const kb = Math.sin(t * omega) / Math.sin(omega)
    const x = ka * va[0] + kb * vb[0]
    const y = ka * va[1] + kb * vb[1]
    const z = ka * va[2] + kb * vb[2]
    out.push({ lat: Math.atan2(z, Math.hypot(x, y)) / RAD, lon: Math.atan2(y, x) / RAD })
  }
  return out
}

const f = (n: number) => String(Math.round(n * 10) / 10)

/**
 * SVG path of the route: the true great-circle track, lifted off its chord like a flight
 * path so that short hops (nearly straight on any map) still read as "it flew".
 */
export function routePath(v: MapView, from: LatLon, to: LatLon): string {
  const pts = greatCircle(from, to).map((p) => project(v, p))
  const a = pts[0]
  const b = pts[pts.length - 1]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 2) return ''

  // On the flat map a route can leave one edge and come back on the other: draw it as is.
  const wraps = pts.some((p, i) => i > 0 && Math.abs(p.x - pts[i - 1].x) > MAP_WIDTH / 2)
  if (!wraps) {
    // Lift towards the top of the chart; a near-vertical chord lifts to the right instead.
    let nx = dy / len
    let ny = -dx / len
    const vertical = Math.abs(dx) < len * 0.25
    if ((vertical && nx < 0) || (!vertical && ny > 0)) {
      nx = -nx
      ny = -ny
    }
    const natural = Math.max(...pts.map((p) => (p.x - a.x) * nx + (p.y - a.y) * ny))
    let lift = Math.min(Math.max(ARC_LIFT * len - natural, 0), ARC_LIFT * len)
    const top = Math.min(...pts.map((p, i) => p.y + ny * lift * Math.sin((Math.PI * i) / ARC_STEPS)))
    if (top < ARC_TOP_MARGIN && ny < 0) lift = Math.max(0, lift - (ARC_TOP_MARGIN - top) / -ny)
    pts.forEach((p, i) => {
      const k = lift * Math.sin((Math.PI * i) / (pts.length - 1))
      p.x += nx * k
      p.y += ny * k
    })
  }

  let d = ''
  pts.forEach((p, i) => {
    const jump = i > 0 && Math.abs(p.x - pts[i - 1].x) > MAP_WIDTH / 2
    d += (i === 0 || jump ? 'M' : 'L') + f(p.x) + ',' + f(p.y)
  })
  return d
}

/** Position of a map point as percentages of the chart box, for HTML markers and labels. */
export function percent(p: Point): { left: string; top: string } {
  return { left: `${f((p.x / MAP_WIDTH) * 100)}%`, top: `${f((p.y / MAP_HEIGHT) * 100)}%` }
}
