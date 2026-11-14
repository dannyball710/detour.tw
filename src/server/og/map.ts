import { getColo } from '#/data/colos'
import { LAND_PATH, project } from '#/data/land'
import type { TestResult } from '#/lib/types'
import { COUNTY_SEATS } from '#/server/county'
import { CHART, LIGHT } from './theme'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}

export interface MapLayer {
  /** SVG elements (no root): sea, graticule, land, route; the card is drawn over them. */
  svg: string
  /** Landing marker position; null when the colo has no known coordinates (nothing drawn). */
  landing: Point | null
  /** Radius of the drawn landing marker, so labels can clear it. */
  landingRadius: number
  /** Where the IATA label goes relative to the landing dot, chosen to stay off the arc. */
  landingLabel: 'above' | 'left' | 'right'
}

const TAIPEI: [number, number] = [25.0777, 121.233]

/**
 * The visitor's coarsened position, or null when they are abroad with no coordinates. In Taiwan
 * the dot is snapped to the county seat, so the image never shows anything finer than the county.
 */
export function userLatLon(r: TestResult): [number, number] | null {
  const { country, regionCode, lat, lon } = r.user
  if (country === 'TW') {
    const seat = regionCode ? COUNTY_SEATS[regionCode] : undefined
    return seat ? [seat.lat, seat.lon] : TAIPEI
  }
  if (lat == null || lon == null) return null
  // Outside Taiwan there is no county table; half a degree is coarser than any county.
  return [Math.round(lat * 2) / 2, Math.round(lon * 2) / 2]
}

const f = (n: number) => Math.round(n * 10) / 10

interface Polygon {
  /** Flat [x0, y0, x1, y1, …] in degree space. */
  points: number[]
  bbox: [minX: number, minY: number, maxX: number, maxY: number]
}

// LAND_PATH parsed once per isolate into polygons with bounding boxes, so each render only
// emits the polygons that intersect the visible window, already in pixel space.
let polygons: Polygon[] | null = null
function landPolygons(): Polygon[] {
  if (polygons) return polygons
  polygons = []
  for (const sub of LAND_PATH.split('Z')) {
    const nums = sub.match(/-?\d+(?:\.\d+)?/g)
    if (!nums || nums.length < 6) continue
    const points = nums.map(Number)
    const bbox: Polygon['bbox'] = [Infinity, Infinity, -Infinity, -Infinity]
    for (let i = 0; i < points.length; i += 2) {
      bbox[0] = Math.min(bbox[0], points[i])
      bbox[1] = Math.min(bbox[1], points[i + 1])
      bbox[2] = Math.max(bbox[2], points[i])
      bbox[3] = Math.max(bbox[3], points[i + 1])
    }
    polygons.push({ points, bbox })
  }
  return polygons
}

/** Path data for the land polygons visible in `view` (degrees), shifted by `off`° and projected to px. */
function croppedLand(off: number, k: number, tx: number, ty: number, view: [number, number, number, number]): string {
  const out: string[] = []
  for (const { points, bbox } of landPolygons()) {
    if (bbox[2] + off < view[0] || bbox[0] + off > view[2] || bbox[3] < view[1] || bbox[1] > view[3]) continue
    let d = ''
    let lastX = NaN
    let lastY = NaN
    for (let i = 0; i < points.length; i += 2) {
      const x = f(k * (points[i] + off) + tx)
      const y = f(k * points[i + 1] + ty)
      // Drop vertices closer than ~0.7 px to the last one kept: invisible, but resvg still pays for them.
      if (i > 0 && Math.abs(x - lastX) + Math.abs(y - lastY) < 0.7) continue
      d += `${i === 0 ? 'M' : 'L'}${x},${y}`
      lastX = x
      lastY = y
    }
    out.push(`${d}Z`)
  }
  return out.join('')
}

/**
 * Draws the sea, land, graticule and the route arc from the user to the landing colo,
 * zoomed so that both ends fit inside `focus`.
 */
export function buildMap(r: TestResult, canvas: { width: number; height: number }, focus: Rect): MapLayer {
  const color = LIGHT[r.light].sea
  const colo = getColo(r.landing.iata)
  const user = userLatLon(r)
  const landing = colo ? project(colo.lon, colo.lat) : null
  // With no known origin the route collapses onto the landing colo (drawn as a lone marker). A
  // colo missing from COLOS has no position at all: then no route or landing marker is drawn and
  // the chart frames the visitor, or open ocean (0°, 0°) — never a default Taiwan.
  const from = user ? project(user[1], user[0]) : landing ?? project(0, 0)
  const to = landing ?? from

  // Arc control point in degree space: bulge perpendicular to the chord, towards the pole,
  // like a great circle on a flat map.
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const len = Math.hypot(dx, dy)
  let nx = len ? -dy / len : 0
  let ny = len ? dx / len : 0
  if (ny > 0) {
    nx = -nx
    ny = -ny
  }
  const bulge = len * 0.3
  const ctrl: [number, number] = [(from[0] + to[0]) / 2 + nx * bulge, (from[1] + to[1]) / 2 + ny * bulge]
  const apex: [number, number] = [
    0.25 * from[0] + 0.5 * ctrl[0] + 0.25 * to[0],
    0.25 * from[1] + 0.5 * ctrl[1] + 0.25 * to[1],
  ]

  const pts = [from, to, apex]
  const minX = Math.min(...pts.map((p) => p[0]))
  const maxX = Math.max(...pts.map((p) => p[0]))
  const minY = Math.min(...pts.map((p) => p[1]))
  const maxY = Math.max(...pts.map((p) => p[1]))
  // Both endpoints (and the arc's crest) stay well inside the window, with room for their markers
  // and labels, so the route never reads as starting off-frame.
  const pad = 88
  // Cap the zoom: the 110m land outlines turn visibly polygonal beyond ~30 px per degree, and
  // short hops (TPE, HKG, NRT) should still show the surrounding region.
  const k = Math.min(
    30,
    (focus.w - 2 * pad) / Math.max(maxX - minX, 1e-6),
    (focus.h - 2 * pad) / Math.max(maxY - minY, 1e-6),
  )
  const tx = focus.x + focus.w / 2 - k * ((minX + maxX) / 2)
  const ty = focus.y + focus.h / 2 - k * ((minY + maxY) / 2)
  const px = (p: [number, number]): Point => ({ x: k * p[0] + tx, y: k * p[1] + ty })

  const A = px(from)
  const B = px(to)
  const C = px(ctrl)
  const { width: W, height: H } = canvas

  // Visible degree range, to draw wrap-around copies of the land and the graticule.
  const vx0 = -tx / k
  const vx1 = (W - tx) / k
  const vy0 = -ty / k
  const vy1 = (H - ty) / k

  const landCopies = [0, ...(vx0 < -180 ? [-360] : []), ...(vx1 > 180 ? [360] : [])]
  const landD = landCopies.map((off) => croppedLand(off, k, tx, ty, [vx0, vy0, vx1, vy1])).join('')
  const land = `<path d="${landD}" fill="${CHART.land}" stroke="${CHART.coast}" stroke-width="1"/>`

  const step = k > 25 ? 5 : 10
  const grid: string[] = []
  for (let g = Math.ceil(vx0 / step) * step; g <= vx1; g += step) grid.push(`M${f(k * g + tx)},0V${H}`)
  for (let g = Math.ceil(vy0 / step) * step; g <= vy1; g += step) grid.push(`M0,${f(k * g + ty)}H${W}`)

  const chordPx = Math.hypot(B.x - A.x, B.y - A.y)
  const arcD = `M${f(A.x)},${f(A.y)} Q${f(C.x)},${f(C.y)} ${f(B.x)},${f(B.y)}`
  const local = chordPx < 28

  // Flat inks only (cyanotype chart): no gradients, no glow.
  const parts: string[] = [
    `<rect width="${W}" height="${H}" fill="${CHART.sea}"/>`,
    `<path d="${grid.join('')}" stroke="${CHART.grid}" stroke-width="1" fill="none"/>`,
    land,
  ]

  if (!landing) {
    if (user) parts.push(`<circle cx="${f(A.x)}" cy="${f(A.y)}" r="6.5" fill="${CHART.mark}" stroke="${CHART.sea}" stroke-width="2.5"/>`)
    return { svg: parts.join(''), landing: null, landingRadius: 0, landingLabel: 'above' }
  }

  if (!local) {
    parts.push(
      `<path d="${arcD}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>`,
      `<circle cx="${f(A.x)}" cy="${f(A.y)}" r="13" fill="none" stroke="${CHART.mark}" stroke-opacity="0.6" stroke-width="2"/>`,
      `<circle cx="${f(A.x)}" cy="${f(A.y)}" r="6.5" fill="${CHART.mark}" stroke="${CHART.sea}" stroke-width="2.5"/>`,
    )
  } else {
    parts.push(
      `<circle cx="${f(B.x)}" cy="${f(B.y)}" r="40" fill="none" stroke="${color}" stroke-opacity="0.35" stroke-width="2"/>`,
      `<circle cx="${f(B.x)}" cy="${f(B.y)}" r="24" fill="none" stroke="${color}" stroke-opacity="0.65" stroke-width="2"/>`,
    )
  }
  parts.push(
    `<circle cx="${f(B.x)}" cy="${f(B.y)}" r="10" fill="${color}" stroke="${CHART.sea}" stroke-width="3"/>`,
    `<circle cx="${f(B.x)}" cy="${f(B.y)}" r="4" fill="${CHART.sea}"/>`,
  )

  // A label above the dot would sit on an arc that drops in steeply from above (e.g. TPE -> SIN);
  // put it beside the dot, away from the arc, when there is room.
  let landingLabel: MapLayer['landingLabel'] = 'above'
  if (!local && B.y - C.y > Math.abs(B.x - C.x)) {
    const side = C.x > B.x ? 'left' : 'right'
    if (side === 'left' ? B.x > 110 : B.x < W - 110) landingLabel = side
  }

  return {
    svg: parts.join(''),
    landing: B,
    landingRadius: local ? 41 : 11,
    landingLabel,
  }
}
