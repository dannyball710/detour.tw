import { describe, expect, it } from 'vitest'
import { COLOS, getColo } from '#/data/colos'
import { ABROAD_VIEWS, MAP_HEIGHT, MAP_VIEWS, MAP_WIDTH } from '#/data/map-views'
import type { MapView } from '#/data/map-views'
import { chooseAbroadView, chooseView, frameZoom, project, routePath } from './geometry'
import type { LatLon } from './geometry'

const TAIPEI: LatLon = { lat: 25.04, lon: 121.56 }
const KAOHSIUNG: LatLon = { lat: 22.63, lon: 120.3 }
const colo = (iata: string): LatLon => {
  const c = getColo(iata)!
  return { lat: c.lat, lon: c.lon }
}

function endpoints(d: string): { start: [number, number]; end: [number, number]; points: [number, number][] } {
  const points = [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number])
  return { start: points[0], end: points[points.length - 1], points }
}

describe('long-haul routes', () => {
  // A route that leaves one edge of a flat map and comes back on the other reads as two broken
  // lines. Whatever the destination, the chosen map must draw it as one arc, both ends framed.
  it('draws every route from Taiwan in one piece, with both ends in the frame', () => {
    for (const c of Object.values(COLOS)) {
      const ends = [TAIPEI, { lat: c.lat, lon: c.lon }]
      const view = chooseView(ends)
      const d = routePath(view, ends[0], ends[1])
      expect(d.match(/M/g)?.length ?? 0, `${c.iata} on ${view.id}`).toBeLessThanOrEqual(1)
      // Never shrunk below the frame's own scale: the ends are inside the safe area.
      expect(frameZoom(ends.map((p) => project(view, p)), view.type === 'flat'), `${c.iata} on ${view.id}`).toBeGreaterThanOrEqual(1)
    }
  })

  it('does the same for visitors abroad, between any two continents', () => {
    const visitors: LatLon[] = [
      { lat: 37.34, lon: -121.89 }, // California
      { lat: -23.55, lon: -46.63 }, // São Paulo
      { lat: 51.5, lon: -0.12 }, // London
      { lat: -33.87, lon: 151.21 }, // Sydney
      { lat: -26.2, lon: 28.04 }, // Johannesburg
    ]
    for (const from of visitors) {
      for (const iata of ['SIN', 'NRT', 'GRU', 'EZE', 'JNB', 'CPT', 'SYD', 'AKL', 'FRA', 'LHR', 'EWR', 'IAD', 'LAX']) {
        const view = chooseAbroadView([from, colo(iata)])
        const d = routePath(view, from, colo(iata))
        expect(d.match(/M/g)?.length ?? 0, `${from.lat},${from.lon} → ${iata} on ${view.id}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('cuts the world map west of Taiwan for São Paulo', () => {
    expect(chooseView([TAIPEI, colo('GRU')]).id).toBe('world-af')
  })
})

describe('frameZoom', () => {
  // An end past the safe area would be drawn off the side of a phone screen.
  it('shrinks a frame whose ends overrun the safe width', () => {
    const world = MAP_VIEWS.world
    expect(frameZoom([project(world, TAIPEI), project(world, colo('GRU'))], true)).toBeLessThan(1)
  })

  // A flat world map drawn at the scale of the longest route would be a thin band in the hero.
  it('draws a flat map larger when its route leaves room, never a globe', () => {
    const af = MAP_VIEWS['world-af']
    const zoom = frameZoom([project(af, TAIPEI), project(af, colo('GRU'))], true)
    expect(zoom).toBeGreaterThan(1)
    expect(zoom).toBeLessThanOrEqual(1.6)
    expect(frameZoom([project(MAP_VIEWS.pacific, TAIPEI), project(MAP_VIEWS.pacific, colo('LAX'))], false)).toBe(1)
  })
})

describe('chooseView', () => {
  // The framing is the message: a result that stayed home must not be drawn on a world map.
  it('keeps a domestic landing on the island close-up', () => {
    expect(chooseView([KAOHSIUNG, colo('TPE')]).id).toBe('tw')
  })

  it('widens step by step as the landing gets further away', () => {
    expect(chooseView([TAIPEI, colo('HKG')]).id).toBe('near')
    expect(chooseView([TAIPEI, colo('NRT')]).id).toBe('asia')
    expect(chooseView([TAIPEI, colo('LAX')]).id).toBe('pacific')
    expect(chooseView([TAIPEI, colo('FRA')]).id).toBe('europe')
  })

  it('falls back to a flat world map when no globe view shows both ends', () => {
    expect(chooseView([TAIPEI, colo('GRU')]).id).toMatch(/^world/)
  })
})

// A route with neither end in Taiwan must not put Taiwan on the chart: it is not part of that
// visitor's story, and showing it would suggest their traffic has something to do with it.
describe('chooseAbroadView', () => {
  // Main island clockwise from the north tip, then Penghu and Kinmen.
  const TAIWAN_COAST: LatLon[] = [
    [25.3, 121.55], [25.0, 122.0], [24.6, 121.85], [24.0, 121.62], [23.1, 121.4], [22.75, 121.15], [21.9, 120.85],
    [22.6, 120.28], [23.0, 120.1], [23.6, 120.15], [24.2, 120.5], [24.8, 120.92], [25.1, 121.2], [23.57, 119.57], [24.44, 118.32],
  ].map(([lat, lon]) => ({ lat, lon }))
  const showsTaiwan = (view: MapView) =>
    TAIWAN_COAST.some((p) => {
      const q = project(view, p)
      return q.visible && q.x > 0 && q.x < MAP_WIDTH && q.y > 0 && q.y < MAP_HEIGHT
    })

  it('frames a visitor abroad on their own region', () => {
    const japan = chooseAbroadView([{ lat: 35.68, lon: 139.69 }, colo('NRT')])
    const california = chooseAbroadView([{ lat: 37.34, lon: -121.89 }, colo('SJC')])
    for (const view of [japan, california]) {
      expect(view.id).toMatch(/^r-/)
      expect(showsTaiwan(view)).toBe(false)
    }
    expect(japan.id).not.toBe(california.id)
  })

  it('never uses a map that highlights Taiwan', () => {
    const highlighted = new Set(Object.keys(MAP_VIEWS))
    expect(ABROAD_VIEWS.filter((v) => highlighted.has(v.id))).toEqual([])
  })

  // With no location for the visitor only the landing colo is drawn, even next door to Taiwan.
  it('shows any colo outside Taiwan on its own without Taiwan in frame', () => {
    for (const c of Object.values(COLOS).filter((c) => c.cc !== 'TW')) {
      const view = chooseAbroadView([{ lat: c.lat, lon: c.lon }])
      expect(view.id, c.iata).toMatch(/^r-/)
      expect(showsTaiwan(view), c.iata).toBe(false)
    }
  })

  it('falls back to a plain wide map for a long route', () => {
    expect(chooseAbroadView([{ lat: 37.57, lon: 126.98 }, colo('LAX')]).id).toBe('pacific-plain')
    expect(chooseAbroadView([{ lat: -23.55, lon: -46.63 }, colo('FRA')]).id).toMatch(/^world.*-plain$/)
  })
})

describe('project', () => {
  it('hides points behind the globe', () => {
    expect(project(MAP_VIEWS.pacific, colo('FRA')).visible).toBe(false)
    expect(project(MAP_VIEWS.pacific, colo('LAX')).visible).toBe(true)
  })
})

describe('routePath', () => {
  it('starts and ends exactly on the two markers', () => {
    const view = MAP_VIEWS.pacific
    const { start, end } = endpoints(routePath(view, TAIPEI, colo('LAX')))
    const a = project(view, TAIPEI)
    const b = project(view, colo('LAX'))
    expect(start[0]).toBeCloseTo(a.x, 0)
    expect(start[1]).toBeCloseTo(a.y, 0)
    expect(end[0]).toBeCloseTo(b.x, 0)
    expect(end[1]).toBeCloseTo(b.y, 0)
  })

  // A short hop is nearly straight on any map; without the lift it would not read as a flight.
  it('lifts a short hop off its chord', () => {
    const view = MAP_VIEWS.near
    const { start, end, points } = endpoints(routePath(view, TAIPEI, colo('HKG')))
    const dx = end[0] - start[0]
    const dy = end[1] - start[1]
    const chord = Math.hypot(dx, dy)
    const sagitta = Math.max(...points.map(([x, y]) => Math.abs((x - start[0]) * dy - (y - start[1]) * dx) / chord))
    expect(sagitta).toBeGreaterThan(chord * 0.15)
    expect(sagitta).toBeLessThan(chord * 0.3)
  })

  it('keeps even a polar route inside the frame', () => {
    const { points } = endpoints(routePath(MAP_VIEWS.pacific, TAIPEI, colo('EWR')))
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(MAP_WIDTH)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(MAP_HEIGHT)
    }
  })

  it('draws nothing when both ends are the same place', () => {
    expect(routePath(MAP_VIEWS.tw, TAIPEI, TAIPEI)).toBe('')
  })
})
