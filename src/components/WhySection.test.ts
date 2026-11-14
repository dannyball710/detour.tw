import { describe, expect, it } from 'vitest'
import type { TestResult } from '#/lib/types'
import { lanesOf } from './WhySection'

const red: TestResult = {
  id: null,
  createdAt: 0,
  light: 'red',
  category: 'tw',
  counted: true,
  notCountedReason: null,
  user: { country: 'TW', regionCode: 'TXG', region: null, lat: 24.15, lon: 120.67 },
  isp: { key: 'cht', asn: 3462, asOrganization: null },
  landing: { iata: 'LAX', rttMs: 151, distanceKm: 10912 },
  ref: { iata: 'TPE', rttMs: 9, distanceKm: 131 },
  extraKm: 10781,
  extraMs: 142,
}

// The explainer may show the visitor's own numbers, but must never pass off a typical figure
// as theirs, or one path's measurement as the other's.
describe('lanesOf', () => {
  it('uses typical figures, marked as such, before any result', () => {
    expect(lanesOf(null)).toEqual({ direct: { ms: 10, own: false }, detour: { ms: 150, own: false } })
  })

  it('shows both of a detouring visitor’s measurements', () => {
    expect(lanesOf(red)).toEqual({ direct: { ms: 9, own: true }, detour: { ms: 151, own: true } })
  })

  it('does not call a baseline that also left Taiwan the direct path', () => {
    expect(lanesOf({ ...red, ref: { iata: 'NRT', rttMs: 40, distanceKm: 2100 } }).direct).toEqual({ ms: 10, own: false })
    expect(lanesOf({ ...red, ref: null }).direct).toEqual({ ms: 10, own: false })
  })

  it('gives a visitor with no detour their own direct figure and an example of the other', () => {
    const green: TestResult = { ...red, light: 'green', landing: { iata: 'TPE', rttMs: 11, distanceKm: 131 } }
    expect(lanesOf(green)).toEqual({ direct: { ms: 11, own: true }, detour: { ms: 150, own: false } })
  })

  it('keeps to examples for results that say nothing about Taiwan', () => {
    const abroad: TestResult = { ...red, light: 'blue', user: { ...red.user, country: 'DE' } }
    expect(lanesOf(abroad)).toEqual(lanesOf(null))
    expect(lanesOf({ ...red, light: 'gray' })).toEqual(lanesOf(null))
  })
})
