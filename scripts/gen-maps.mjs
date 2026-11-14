// Generates the route-chart base maps: public/maps/<view>.svg and src/data/map-views.ts.
// Each view is a fixed projection, so the browser only has to project two points and an arc.
// Source: world-atlas (Natural Earth, public domain). Run: node scripts/gen-maps.mjs
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { geoEquirectangular, geoGraticule, geoOrthographic, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'

// The frame: view centres, the safe area for route ends and the route geometry are in these units.
const W = 1600
const H = 1000
// The drawn canvas reaches past the frame, so the chart can be a backdrop wider and taller than
// the part the route is framed in (on a desktop the headline and the pass sit on top of it).
const EXT = { x0: -300, y0: -500, x1: W + 900, y1: H + 300 }
const EW = EXT.x1 - EXT.x0
const EH = EXT.y1 - EXT.y0
// Geometry is clipped a little outside the canvas so clip edges never show as strokes.
const PAD = 24
const TAIWAN_ID = '158'

const require = createRequire(import.meta.url)
const atlas = (name) => JSON.parse(readFileSync(require.resolve(`world-atlas/${name}.json`), 'utf8'))

// Views for a route with an end in Taiwan: the island is highlighted. `wide` views also get a
// plain twin (no highlight) for routes that have nothing to do with Taiwan.
const VIEWS = [
  // Island close-up: a result that never left Taiwan.
  { id: 'tw', type: 'ortho', lon0: 120.75, lat0: 23.65, r: 11000, cx: 800, cy: 500, res: '10m', step: 1, minArea: 12, tol: 1.1 },
  // The neighbours: Hong Kong, Okinawa, Manila, the Fujian coast.
  { id: 'near', type: 'ortho', lon0: 119, lat0: 20.5, r: 3400, cx: 800, cy: 520, res: '50m', step: 5, minArea: 8, tol: 0.9 },
  // Everything within the "small detour" radius of Taipei.
  { id: 'asia', type: 'ortho', lon0: 118, lat0: 5, r: 1200, cx: 800, cy: 760, res: '50m', step: 10, minArea: 14, tol: 1.3, wide: true },
  // Taiwan on the left limb, all of North America on the right.
  { id: 'pacific', type: 'ortho', lon0: 195, lat0: 10, r: 800, cx: 830, cy: 850, res: '110m', step: 15, minArea: 3, tol: 0.5, wide: true },
  // Taiwan on the right, Europe and the Middle East on the left.
  { id: 'europe', type: 'ortho', lon0: 65, lat0: 35, r: 900, cx: 780, cy: 660, res: '110m', step: 15, minArea: 3, tol: 0.5, wide: true },
  // Flat fallbacks for the rare routes no globe view can frame, each cut at a different meridian
  // so a route can always be drawn without crossing the map's edge: Pacific-centred, then
  // Africa-centred (Taiwan to South America or southern Africa goes west), then Americas-centred.
  { id: 'world', type: 'flat', lon0: 150, lat0: 0, r: W / (2 * Math.PI), cx: 800, cy: 560, res: '110m', step: 30, minArea: 3, tol: 0.5, wide: true },
  { id: 'world-af', type: 'flat', lon0: 30, lat0: 0, r: W / (2 * Math.PI), cx: 800, cy: 560, res: '110m', step: 30, minArea: 3, tol: 0.5, wide: true },
  { id: 'world-am', type: 'flat', lon0: -90, lat0: 0, r: W / (2 * Math.PI), cx: 800, cy: 560, res: '110m', step: 30, minArea: 3, tol: 0.5, wide: true },
]

const RAD = Math.PI / 180
// Where a regional view wants its colos: clear of the edges, and of the bottom fifth of the
// chart, which the pass covers on a phone.
const SAFE = { x0: 90, y0: 110, x1: W - 90, y1: H - 220 }
// Regional views start this wide and zoom in only as far as it takes to lose Taiwan.
const REGION_SCALES = [2200, 3000, 4000, 5500, 8000, 11000, 16000, 22000]
// A view covers the colos in the middle of its frame, leaving the rest for a visitor near them.
const COVER_MARGIN = 0.35
const SEED_MARGIN = 0.25

function projectPoint(v, lon, lat) {
  const l = ((((lon - v.lon0) % 360) + 540) % 360 - 180) * RAD
  const p = lat * RAD
  const p0 = v.lat0 * RAD
  return {
    x: v.cx + v.r * Math.cos(p) * Math.sin(l),
    y: v.cy - v.r * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l)),
    front: Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l) > 0.1,
  }
}

function frames(v, c, margin) {
  const q = projectPoint(v, c.lon, c.lat)
  const mx = ((SAFE.x1 - SAFE.x0) / 2) * margin
  const my = ((SAFE.y1 - SAFE.y0) / 2) * margin
  return q.front && q.x >= SAFE.x0 + mx && q.x <= SAFE.x1 - mx && q.y >= SAFE.y0 + my && q.y <= SAFE.y1 - my
}

const sources = new Map()
function sourceFor(res) {
  if (!sources.has(res)) {
    const landTopo = atlas(`land-${res}`)
    const countriesTopo = atlas(`countries-${res === '110m' ? '50m' : res}`)
    sources.set(res, {
      land: feature(landTopo, landTopo.objects.land),
      taiwan: feature(countriesTopo, countriesTopo.objects.countries).features.find((c) => c.id === TAIWAN_ID),
    })
  }
  return sources.get(res)
}

let taiwanCoast
const FRAME = { x0: 0, y0: 0, x1: W, y1: H }

/** Whether any of Taiwan's coast (outlying islands included) falls inside an area, or just off it. */
function showsTaiwan(v, area = EXT) {
  taiwanCoast ??= polygonsOf(sourceFor('10m').taiwan).flat(2)
  return taiwanCoast.some(([lon, lat]) => {
    const q = projectPoint(v, lon, lat)
    return q.front && q.x > area.x0 - PAD && q.x < area.x1 + PAD && q.y > area.y0 - PAD && q.y < area.y1 + PAD
  })
}

/** The widest view around a colo that leaves Taiwan out: zoom in, or slide away from the island. */
function viewAround(c) {
  const slides = []
  for (let sx = -3; sx <= 3; sx++) for (let sy = -3; sy <= 3; sy++) slides.push([sx / 4, sy / 4])
  slides.sort((a, b) => Math.hypot(...a) - Math.hypot(...b))
  const half = (n) => Math.round(n * 2) / 2
  // Taiwan off the whole canvas if possible; next to the island (the Fujian coast) it may show
  // past the frame, where the headline and the pass cover the backdrop.
  for (const area of [EXT, FRAME]) {
    for (const r of REGION_SCALES) {
      for (const [sx, sy] of slides) {
        const lat0 = half(c.lat + (sy * (H / 2)) / r / RAD)
        const lon0 = half(c.lon + (sx * (W / 2)) / r / RAD / Math.cos(lat0 * RAD))
        const v = { lon0, lat0, r, cx: W / 2, cy: (SAFE.y0 + SAFE.y1) / 2 }
        if (!showsTaiwan(v, area) && frames(v, c, SEED_MARGIN)) return v
      }
    }
  }
  // Too close to the island to leave it out (the Fujian coast): frame the colo as tightly as the rest.
  return { lon0: half(c.lon), lat0: half(c.lat), r: REGION_SCALES.at(-1), cx: W / 2, cy: (SAFE.y0 + SAFE.y1) / 2 }
}

/**
 * Close-ups for routes that have nothing to do with Taiwan, one per cluster of Cloudflare colos
 * (greedy cover: the view that takes in the most colos not yet covered, until none are left).
 */
function regionalViews() {
  const source = readFileSync(new URL('../src/data/colos.ts', import.meta.url), 'utf8')
  const colos = [...source.matchAll(/^\s+\w+: \{ iata: '(\w+)', lat: (-?[\d.]+), lon: (-?[\d.]+), cc: '(\w+)'/gm)]
    .map((m) => ({ iata: m[1], lat: Number(m[2]), lon: Number(m[3]), cc: m[4] }))
    .filter((c) => c.cc !== 'TW')
  if (colos.length < 100) throw new Error('could not read the colo list')
  const around = new Map(colos.map((c) => [c, viewAround(c)]))
  const left = new Set(colos)
  const views = []
  while (left.size) {
    let best = null
    for (const c of left) {
      const n = [...left].filter((o) => frames(around.get(c), o, COVER_MARGIN)).length
      if (!best || n > best.n || (n === best.n && c.iata < best.c.iata)) best = { c, n }
    }
    const v = around.get(best.c)
    left.delete(best.c)
    for (const o of [...left]) if (frames(v, o, COVER_MARGIN)) left.delete(o)
    const step = v.r >= 8000 ? 1 : v.r >= 4000 ? 2 : 5
    const res = v.r >= 8000 ? '10m' : '50m'
    views.push({ ...v, id: `r-${best.c.iata.toLowerCase()}`, type: 'ortho', res, step, minArea: 12, tol: 1.8, plain: true })
  }
  // Tightest first, the order views are tried in.
  return views.sort((a, b) => b.r - a.r || a.id.localeCompare(b.id))
}

const isCloseUp = (v) => v.r >= 2000

function polygonsOf(object) {
  const features = object.type === 'FeatureCollection' ? object.features : [object]
  return features.flatMap((ft) => (ft.geometry.type === 'Polygon' ? [ft.geometry.coordinates] : ft.geometry.coordinates))
}

/** The flat view should not carry Antarctica as a slab along the bottom edge. */
function withoutAntarctica(object) {
  const coordinates = polygonsOf(object).filter((rings) => rings[0].every(([, lat]) => lat > -60))
  return { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates } }
}

/** Sutherland–Hodgman against a lon/lat box. */
function clipRing(ring, [x0, y0, x1, y1]) {
  const edges = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ]
  let out = ring
  for (const [inside, cut] of edges) {
    const input = out
    out = []
    for (let i = 0; i < input.length; i++) {
      const cur = input[i]
      const prev = input[(i + input.length - 1) % input.length]
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur))
        out.push(cur)
      } else if (inside(prev)) out.push(cut(prev, cur))
    }
    if (!out.length) break
  }
  return out
}

/**
 * Close-ups skip d3's spherical clipping: on the 10 m data it mistakes the continent-sized
 * polygon for "contains the whole frame" and floods the sea. At this zoom a lon/lat box clip
 * followed by a plain orthographic projection is exact enough.
 */
function closeUpPath(object, v, { minArea = 0, tol = 0 } = {}) {
  const rad = Math.PI / 180
  // Half-extent of the canvas in degrees, with a margin so the clip edges stay off-screen.
  const halfH = Math.max(v.cy - EXT.y0, EXT.y1 - v.cy)
  const halfW = Math.max(v.cx - EXT.x0, EXT.x1 - v.cx)
  const dLat = (halfH / v.r / rad) * 1.15
  const dLon = (halfW / v.r / rad / Math.cos(v.lat0 * rad)) * 1.2
  const box = [v.lon0 - dLon, v.lat0 - dLat, v.lon0 + dLon, v.lat0 + dLat]
  // Wider views at high latitude outgrow that estimate (meridians converge): walk the canvas
  // edge and make sure the box holds all of it.
  const sinP0 = Math.sin(v.lat0 * rad)
  const cosP0 = Math.cos(v.lat0 * rad)
  for (let i = 0; i <= 40; i++) {
    const ex = EXT.x0 + (EW * i) / 40
    const ey = EXT.y0 + (EH * i) / 40
    for (const [px, py] of [[ex, EXT.y0], [ex, EXT.y1], [EXT.x0, ey], [EXT.x1, ey]]) {
      const x = (px - v.cx) / v.r
      const y = (v.cy - py) / v.r
      const rho = Math.hypot(x, y)
      // Past the limb there is no globe to bound.
      if (rho >= 1) continue
      const c = Math.asin(rho)
      const lat = rho ? Math.asin(Math.cos(c) * sinP0 + (y * Math.sin(c) * cosP0) / rho) / rad : v.lat0
      const lon = v.lon0 + (rho ? Math.atan2(x * Math.sin(c), rho * Math.cos(c) * cosP0 - y * Math.sin(c) * sinP0) / rad : 0)
      box[0] = Math.min(box[0], lon - 0.3)
      box[1] = Math.min(box[1], lat - 0.3)
      box[2] = Math.max(box[2], lon + 0.3)
      box[3] = Math.max(box[3], lat + 0.3)
    }
  }
  const project = ([lon, lat]) => {
    const l = (lon - v.lon0) * rad
    const p = lat * rad
    const p0 = v.lat0 * rad
    return [
      v.cx + v.r * Math.cos(p) * Math.sin(l),
      v.cy - v.r * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l)),
    ]
  }
  let d = ''
  // Holes are kept (the Caspian Sea is one). A frame near the date line also needs the land
  // stored on the far side of it, hence the full turns.
  for (const ring of polygonsOf(object).flat()) {
    // A ring that crosses the date line is stored with a jump from 180 to -180: undo it.
    let last = ring[0][0]
    const whole = ring.slice(0, -1).map(([lon, lat]) => {
      last = lon + 360 * Math.round((last - lon) / 360)
      return [last, lat]
    })
    for (const turn of [-360, 0, 360]) {
      const clipped = clipRing(whole.map(([lon, lat]) => [lon + turn, lat]), box)
      if (clipped.length < 3) continue
      // A long edge (the clip box's above all) is a curve once projected: give it points to bend at.
      const dense = clipped.flatMap((a, i) => {
        const b = clipped[(i + 1) % clipped.length]
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))))
        return Array.from({ length: n }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
      })
      const pts = dense.map(project)
      if (minArea && ringArea(pts) < minArea) continue
      const thinned = tol ? thin(pts, tol) : pts
      d += 'M' + thinned.map(([x, y]) => `${f(x)},${f(y)}`).join('L') + 'Z'
    }
  }
  return d
}

function projectionFor(v) {
  const p = v.type === 'ortho' ? geoOrthographic().clipAngle(90) : geoEquirectangular()
  return p
    .rotate([-v.lon0, -v.lat0])
    .scale(v.r)
    .translate([v.cx, v.cy])
    .precision(0.2)
    .clipExtent([
      [EXT.x0 - PAD, EXT.y0 - PAD],
      [EXT.x1 + PAD, EXT.y1 + PAD],
    ])
}

/** Canvas-like sink for geoPath: collects rings so they can be thinned before serialising. */
class Rings {
  rings = []
  moveTo(x, y) {
    this.cur = { pts: [[x, y]], closed: false }
    this.rings.push(this.cur)
  }
  lineTo(x, y) {
    this.cur.pts.push([x, y])
  }
  closePath() {
    this.cur.closed = true
  }
}

function ringArea(pts) {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]
  return Math.abs(a / 2)
}

function thin(pts, tol) {
  const out = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const [lx, ly] = out[out.length - 1]
    if (Math.hypot(pts[i][0] - lx, pts[i][1] - ly) >= tol) out.push(pts[i])
  }
  out.push(pts[pts.length - 1])
  return out
}

const f = (n) => String(Math.round(n * 10) / 10)

function pathData(projection, object, { minArea = 0, tol = 0 } = {}) {
  const sink = new Rings()
  geoPath(projection, sink)(object)
  let d = ''
  for (const ring of sink.rings) {
    if (ring.closed && minArea && ringArea(ring.pts) < minArea) continue
    const pts = tol ? thin(ring.pts, tol) : ring.pts
    if (pts.length < 2) continue
    d += 'M' + pts.map(([x, y]) => `${f(x)},${f(y)}`).join('L') + (ring.closed ? 'Z' : '')
  }
  return d
}

/**
 * A flat map is a band, not a globe: its top (the Arctic, where the graticule stops) and its
 * bottom would be straight cut edges in the middle of the hero. Fade them out inside the map.
 */
function flatFade(v) {
  const y = (lat) => f(v.cy - v.r * lat * RAD)
  return `<defs><linearGradient id="fg" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${y(88)}" y2="${y(-64)}">
<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".22" stop-color="#fff"/><stop offset=".78" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
</linearGradient><mask id="f" maskUnits="userSpaceOnUse" x="${EXT.x0}" y="${EXT.y0}" width="${EW}" height="${EH}"><rect x="${EXT.x0}" y="${EXT.y0}" width="${EW}" height="${EH}" fill="url(#fg)"/></mask></defs>`
}

mkdirSync(new URL('../public/maps/', import.meta.url), { recursive: true })

const ABROAD = [...regionalViews(), ...VIEWS.filter((v) => v.wide).map((v) => ({ ...v, id: `${v.id}-plain`, plain: true }))]

const mapsDir = new URL('../public/maps/', import.meta.url)
// Regional views follow the colo list; drop the ones from an earlier run.
for (const name of readdirSync(mapsDir)) if (/^r-\w+\.svg$/.test(name)) rmSync(new URL(name, mapsDir))

let total = 0
for (const v of [...VIEWS, ...ABROAD]) {
  const source = sourceFor(v.res)
  const land = v.type === 'flat' ? withoutAntarctica(source.land) : source.land
  const projection = projectionFor(v)

  const graticule = geoGraticule().step([v.step, v.step])()
  const landD = isCloseUp(v) ? closeUpPath(land, v, v) : pathData(projection, land, v)
  // On a plain view Taiwan is ordinary land, already part of the land layer.
  const taiwanD = v.plain ? '' : isCloseUp(v) ? closeUpPath(source.taiwan, v, { minArea: 4, tol: v.tol }) : pathData(projection, source.taiwan, { tol: v.tol })
  const gratD = pathData(projection, graticule, { tol: 2 })
  const limb = v.type === 'ortho' && v.r < 2000 ? `<circle class="limb" cx="${v.cx}" cy="${v.cy}" r="${v.r}"/>` : ''

  // Colours: Shoal land on the Kuroshio band; the sea itself stays transparent.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${EXT.x0} ${EXT.y0} ${EW} ${EH}" width="${EW}" height="${EH}">
<style>path,circle{vector-effect:non-scaling-stroke;fill:none}.g{stroke:#fff;stroke-opacity:.1}.limb{stroke:#fff;stroke-opacity:.22}.l{fill:#1b4f7e;stroke:#6f9ac0;stroke-opacity:.55;stroke-linejoin:round}.t{fill:#8fb4d6;stroke:#d7e6f3;stroke-opacity:.8;stroke-linejoin:round}</style>
${v.type === 'flat' ? flatFade(v) : ''}
<g ${v.type === 'flat' ? 'mask="url(#f)"' : ''}>
<g id="m">
<path class="g" d="${gratD}"/>
${limb}
<path class="l" d="${landD}"/>
${taiwanD && `<path class="t" d="${taiwanD}"/>`}
</g>
${v.type === 'flat' ? `<use href="#m" x="${-W}"/><use href="#m" x="${W}"/>` : ''}
</g>
</svg>
`
  writeFileSync(new URL(`${v.id}.svg`, mapsDir), svg)
  total += svg.length
  if (!v.id.startsWith('r-')) console.log(v.id, `${(svg.length / 1024).toFixed(1)} KB`)
}
const regional = ABROAD.filter((v) => v.id.startsWith('r-'))
const inFrame = regional.filter((v) => showsTaiwan(v, FRAME)).length
const onCanvas = regional.filter((v) => showsTaiwan(v, EXT)).length
console.log(`${regional.length} regional views, ${inFrame} with Taiwan in frame, ${onCanvas} on the canvas; ${(total / 1024).toFixed(0)} KB in all`)

const line = (v) => `{ id: '${v.id}', type: '${v.type}', lon0: ${v.lon0}, lat0: ${v.lat0}, r: ${v.r}, cx: ${v.cx}, cy: ${v.cy} },`
const views = VIEWS.map((v) => `  '${v.id}': ${line(v)}`).join('\n')
const abroad = ABROAD.map((v) => `  ${line(v)}`).join('\n')

writeFileSync(
  new URL('../src/data/map-views.ts', import.meta.url),
  `// Generated by scripts/gen-maps.mjs together with public/maps/*.svg. Do not edit.
export const MAP_WIDTH = ${W}
export const MAP_HEIGHT = ${H}
/** The drawn canvas of each map, in frame units: it reaches past the ${W} × ${H} frame on every side. */
export const MAP_EXTENT = { x0: ${EXT.x0}, y0: ${EXT.y0}, x1: ${EXT.x1}, y1: ${EXT.y1} }

export interface MapView {
  id: string
  /** ortho = orthographic globe, flat = equirectangular. */
  type: 'ortho' | 'flat'
  lon0: number
  lat0: number
  /** Globe radius (ortho) or pixels per radian (flat), in map units. */
  r: number
  cx: number
  cy: number
}

/** For a route with an end in Taiwan. Ordered from the tightest framing to the widest. */
export const MAP_VIEWS = {
${views}
} satisfies Record<string, MapView>

/**
 * For a route with neither end in Taiwan: the island is not highlighted, and the close-ups
 * (one per cluster of colos) leave it out of frame. Ordered from the tightest to the widest.
 */
export const ABROAD_VIEWS: MapView[] = [
${abroad}
]
`,
)
