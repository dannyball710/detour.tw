import { describe, expect, it } from 'vitest'
import { getDict } from '#/i18n'
import type { TestResult } from '#/lib/types'
import { allText, buildCopy } from './copy'

const result = (o: Partial<TestResult>): TestResult => ({
  id: 'abc1234567',
  createdAt: Date.UTC(2026, 10, 14, 4),
  light: 'red',
  category: 'tw',
  counted: true,
  notCountedReason: null,
  user: { country: 'TW', regionCode: 'TXG', region: 'Taichung City', lat: 24.15, lon: 120.67 },
  isp: { key: 'cht', asn: 3462, asOrganization: null },
  landing: { iata: 'LAX', rttMs: 150, distanceKm: 10900 },
  ref: { iata: 'TPE', rttMs: 9, distanceKm: 120 },
  extraKm: 10780,
  extraMs: 141,
  ...o,
})

describe('buildCopy headlines (brief §結果卡文案)', () => {
  const cases: [Partial<TestResult>, string, string][] = [
    [{ light: 'green', landing: { iata: 'TPE', rttMs: 8, distanceKm: 120 } }, '你的連線在台北落地', 'Your connection landed in Taipei.'],
    [{ light: 'yellow', landing: { iata: 'HKG', rttMs: 40, distanceKm: 800 } }, '小繞一下，你的連線去了香港', 'A small detour — your connection went to Hong Kong.'],
    [{}, '你的網路出國了：洛杉磯', 'Your connection left the country: Los Angeles.'],
    [{ light: 'gray', category: 'vpn' }, '這次的結果可能不代表你家的網路', 'This result may not reflect your home connection.'],
    [
      { light: 'blue', category: 'intl', user: { country: 'JP', regionCode: '13', region: 'Tokyo', lat: 35.5, lon: 139.5 }, landing: { iata: 'NRT', rttMs: 5, distanceKm: 60 } },
      '你在日本，連線在東京落地',
      "You're testing from Japan; your connection landed in Tokyo.",
    ],
  ]
  it.each(cases)('%o', (o, zh, en) => {
    expect(buildCopy(result(o), 'zh').verdict).toBe(zh)
    expect(buildCopy(result(o), 'en').verdict).toBe(en)
  })
})

describe('buildCopy notes and origin', () => {
  it('uses the site wording for roaming and foreign-SIM results so the two never drift', () => {
    expect(buildCopy(result({ category: 'roaming' }), 'zh').note).toBe(getDict('zh').card.roaming)
    const sim = result({ light: 'blue', category: 'foreign-sim', user: { country: 'US', regionCode: 'CA', region: null, lat: 34, lon: -118 } })
    expect(buildCopy(sim, 'en').note).toBe(getDict('en').card.foreignSim)
  })

  it('shows the county code in Taiwan, TWN for an unknown subdivision, and never TWN abroad', () => {
    expect(buildCopy(result({}), 'zh').origin).toEqual({ code: 'TXG', name: '台中市' })
    expect(buildCopy(result({ user: { country: 'TW', regionCode: '04', region: 'Taiwan', lat: null, lon: null } }), 'en').origin.code).toBe('TWN')
    const unknown = buildCopy(result({ light: 'blue', category: 'intl', user: { country: null, regionCode: null, region: null, lat: null, lon: null } }), 'zh')
    expect(unknown.origin.code).not.toBe('TWN')
    expect(unknown.verdict).toContain('海外')
  })
})

describe('ISP name from external AS data', () => {
  const isp = (asOrganization: string) =>
    buildCopy(result({ isp: { key: 'other', asn: 1, asOrganization } }), 'en').stub[0].value

  it('drops control characters and lone surrogates that would break the font request or the SVG', () => {
    const name = isp('Acme\u0000\u001F Net\uD800works')
    expect(name).toBe('Acme Networks')
    expect(() => encodeURIComponent(allText(buildCopy(result({ isp: { key: 'other', asn: 1, asOrganization: 'x\uDC00' } }), 'en')))).not.toThrow()
  })

  it('truncates long names by code point, never splitting an emoji', () => {
    const name = isp('😀'.repeat(40))
    expect(name.endsWith('…')).toBe(true)
    expect(() => encodeURIComponent(name)).not.toThrow()
  })
})
