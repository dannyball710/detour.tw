import { describe, expect, it } from 'vitest'
import { TW_REGIONS } from '#/data/tw-regions'
import { COUNTY_SEATS, deriveCounty } from './county'

const none = { regionCode: null, city: null, lat: null, lon: null }

// Cloudflare often reports Taiwan as province "04"; without a fallback the county map on /stats stays empty.
describe('deriveCounty', () => {
  it('trusts a regionCode that is already a county code', () => {
    expect(deriveCounty({ ...none, regionCode: 'TXG', city: 'Taipei' })).toBe('TXG')
  })

  it('ignores the legacy province code and uses the city name (real HiNet sample)', () => {
    expect(deriveCounty({ regionCode: '04', city: 'Taipei', lat: 25.05306, lon: 121.52639 })).toBe('TPE')
  })

  it.each([
    ['New Taipei', 'NWT'],
    ['Banqiao', 'NWT'],
    ['Tamsui', 'NWT'],
    ['Zhongli District', 'TAO'],
    ['Hsinchu', 'HSZ'],
    ['Hsinchu County', 'HSQ'],
    ['Zhubei', 'HSQ'],
    ['Chiayi', 'CYI'],
    ['Chiayi County', 'CYQ'],
    ['Taichung City', 'TXG'],
    ['KAOHSIUNG', 'KHH'],
    ['Luodong', 'ILA'],
    ['Magong', 'PEN'],
    ['Jincheng', 'KIN'],
    ["Ji'an", 'HUA'],
  ])('city %s -> %s', (city, code) => {
    expect(deriveCounty({ ...none, city })).toBe(code)
  })

  it('falls back to the nearest county seat within 25 km', () => {
    expect(deriveCounty({ ...none, city: 'Somewhere', lat: 22.63, lon: 120.3 })).toBe('KHH')
    expect(deriveCounty({ ...none, lat: 23.98, lon: 121.6 })).toBe('HUA')
  })

  it('gives up when the point is far from any seat (mountains, sea)', () => {
    expect(deriveCounty({ ...none, lat: 23.2, lon: 121.0 })).toBeNull()
  })

  it("treats geo-IP's country-level default point as unknown", () => {
    expect(deriveCounty({ ...none, lat: 23.5, lon: 121.0 })).toBeNull()
    expect(deriveCounty({ ...none, lat: 24.0, lon: 121.0 })).toBeNull()
  })

  it('returns null with nothing to go on', () => {
    expect(deriveCounty(none)).toBeNull()
  })

  it('every county has a seat and every seat maps back to its own county', () => {
    expect(Object.keys(COUNTY_SEATS).sort()).toEqual(Object.keys(TW_REGIONS).sort())
    for (const [code, seat] of Object.entries(COUNTY_SEATS)) expect(deriveCounty({ ...none, ...seat })).toBe(code)
  })
})
