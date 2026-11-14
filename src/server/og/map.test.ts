import { describe, expect, it } from 'vitest'
import { COUNTY_SEATS } from '#/server/county'
import type { TestResult } from '#/lib/types'
import { buildMap, userLatLon } from './map'

const canvas = { width: 1200, height: 630 }
const focus = { x: 630, y: 30, w: 550, h: 540 }

const result = (o: Partial<TestResult>): TestResult => ({
  id: 'abc1234567',
  createdAt: 0,
  light: 'red',
  category: 'tw',
  counted: true,
  notCountedReason: null,
  user: { country: 'TW', regionCode: 'TXG', region: 'Taichung City', lat: 24.1234, lon: 120.6789 },
  isp: { key: 'cht', asn: 3462, asOrganization: null },
  landing: { iata: 'LAX', rttMs: 150, distanceKm: 10900 },
  ref: { iata: 'TPE', rttMs: 9, distanceKm: 120 },
  extraKm: 10780,
  extraMs: 141,
  ...o,
})

const abroad = (country: string, lat: number | null, lon: number | null) => ({
  country,
  regionCode: null,
  region: null,
  lat,
  lon,
})

describe('userLatLon (privacy)', () => {
  it('snaps a Taiwanese visitor to the county seat, never their own coordinates', () => {
    const seat = COUNTY_SEATS.TXG
    expect(userLatLon(result({}))).toEqual([seat.lat, seat.lon])
  })

  it('uses Taipei when the Taiwanese subdivision is unknown (e.g. province-level "04")', () => {
    const [lat, lon] = userLatLon(result({ user: { country: 'TW', regionCode: '04', region: 'Taiwan', lat: 23.5, lon: 121 } }))!
    expect(lat).toBeCloseTo(25.08, 1)
    expect(lon).toBeCloseTo(121.23, 1)
  })

  it('rounds a visitor abroad to half a degree, and has no position without coordinates', () => {
    expect(userLatLon(result({ user: abroad('JP', 35.6895, 139.6917) }))).toEqual([35.5, 139.5])
    expect(userLatLon(result({ user: abroad('GB', null, null) }))).toBeNull()
  })
})

describe('buildMap', () => {
  // The site's chart dropped the dashed "ideal route" marker; the share image must match it.
  it('draws no ideal-route marker, even for a detour from Taiwan', () => {
    expect(buildMap(result({}), canvas, focus).svg).not.toContain('stroke-dasharray')
    expect(buildMap(result({ light: 'yellow', landing: { iata: 'HKG', rttMs: 40, distanceKm: 800 } }), canvas, focus).svg).not.toContain('stroke-dasharray')
  })

  it('treats Taiwan only as the landing end when a visitor abroad lands in Taipei', () => {
    const map = buildMap(result({ light: 'blue', category: 'intl', user: abroad('PH', 14.6, 121), landing: { iata: 'TPE', rttMs: 38, distanceKm: 1160 } }), canvas, focus)
    expect(map.landing).not.toBeNull()
  })

  it('keeps both ends of the route well inside the focus window', () => {
    for (const landing of ['SIN', 'LAX', 'FRA', 'GRU']) {
      const map = buildMap(result({ landing: { iata: landing, rttMs: 100, distanceKm: 5000 } }), canvas, focus)
      const { x, y } = map.landing!
      expect(x).toBeGreaterThanOrEqual(focus.x + 80)
      expect(x).toBeLessThanOrEqual(focus.x + focus.w - 80)
      expect(y).toBeGreaterThanOrEqual(focus.y + 80)
      expect(y).toBeLessThanOrEqual(focus.y + focus.h - 80)
    }
  })

  it('draws no route or landing marker for a colo it has no coordinates for', () => {
    const map = buildMap(result({ landing: { iata: 'ZZZ', rttMs: 100, distanceKm: null } }), canvas, focus)
    expect(map.landing).toBeNull()
    expect(map.svg).not.toContain('stroke-linecap="round"')
  })
})
