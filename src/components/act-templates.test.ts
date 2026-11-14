import { describe, expect, it } from 'vitest'
import type { IspStats, StatsResponse, TestResult } from '#/lib/types'
import { actTemplates } from './act-templates'

const red: TestResult = {
  id: 'abcdefghij',
  createdAt: Date.UTC(2026, 10, 14, 4),
  light: 'red',
  category: 'tw',
  counted: true,
  notCountedReason: null,
  user: { country: 'TW', regionCode: 'TXG', region: 'Taichung City', lat: 24.15, lon: 120.67 },
  isp: { key: 'cht', asn: 3462, asOrganization: null },
  landing: { iata: 'LAX', rttMs: 151.4, distanceKm: 10912 },
  ref: { iata: 'TPE', rttMs: 9.2, distanceKm: 131 },
  extraKm: 10781,
  extraMs: 142,
}
const green: TestResult = { ...red, light: 'green', landing: { iata: 'TPE', rttMs: 11, distanceKm: 131 }, extraKm: 0, extraMs: 2 }

const isp = (key: string, n: number, domestic: number): IspStats => ({
  key,
  n,
  domestic,
  lights: { green: domestic, yellow: 0, red: 1 - domestic },
  medianRtt: null,
  medianRefRtt: null,
  medianExtraMs: null,
  colos: [],
})
const stats = (isps: IspStats[]): StatsResponse => ({
  generatedAt: 0,
  windowDays: 30,
  totals: { counted: 0, today: 0, allTime: 0 },
  isps,
  trend: [],
  regions: [],
  intl: [],
  chtUsShare: null,
})
const enough = stats([isp('cht', 400, 0.04), isp('twm', 300, 0.96)])

describe('actTemplates', () => {
  // The whole campaign has one ask; every letter must carry it, whoever it goes to and whatever it is based on.
  it('asks every recipient for direct interconnection in Taiwan', () => {
    for (const t of [actTemplates(red, enough), actTemplates(green, enough), actTemplates(null, null)]) {
      expect(t.isp).toContain('與 Cloudflare 在台灣建立直接互連')
      expect(t.regulator).toContain('與 Cloudflare 在台灣直接互連')
      expect(t.cloudflare).toMatch(/interconnect directly with Chunghwa Telecom( \(HiNet\))? in Taiwan/)
    }
  })

  it('reports a detour with what this visitor measured', () => {
    const t = actTemplates(red, enough)
    expect(t.isp).toContain('2026/11/14')
    expect(t.isp).toContain('落在洛杉磯，延遲約 151 毫秒。同一時間，其他電信用戶有 96% 落在台灣')
    expect(t.regulator).toContain('我是中華電信的用戶')
    expect(t.cloudflare).toContain('served from Los Angeles (LAX), about 151 ms per round trip')
    expect(t.cloudflare).toContain('cloudflare.com answered from Taipei in about 9 ms')
  })

  // Someone whose own route is fine has nothing personal to report, but can still write in.
  it('falls back to the public statistics when the visitor had no detour', () => {
    for (const t of [actTemplates(green, enough), actTemplates(null, enough)]) {
      expect(t.isp).toContain('近 30 天中華電信用戶連往 Cloudflare 網站的測試中，有 96% 落在台灣以外的機房')
      expect(t.isp).not.toContain('我是貴公司的用戶')
      expect(t.cloudflare).toContain('96% of tests from Chunghwa Telecom (HiNet) users in Taiwan over the last 30 days')
    }
  })

  // A percentage from a handful of tests would be quoted to a company as if it were a finding.
  it('quotes no percentage from a small sample', () => {
    for (const s of [null, stats([isp('cht', 29, 0)])]) {
      const t = actTemplates(green, s)
      expect(t.isp).not.toMatch(/\d+%/)
      expect(t.regulator).not.toMatch(/\d+%/)
      expect(t.cloudflare).not.toMatch(/\d+%/)
      expect(t.isp).toContain('部分中華電信用戶')
    }
    expect(actTemplates(red, stats([isp('twm', 29, 1)])).isp).not.toContain('其他電信用戶')
  })

  // Cloudflare support reads English; a Taiwanese regulator needs the public report.
  it('writes to each reader in their own language, with the report to check', () => {
    for (const t of [actTemplates(red, null), actTemplates(null, null)]) {
      expect(t.cloudflare).not.toMatch(/[一-鿿]/)
      expect(t.regulator).toContain('https://detour.tw/stats')
      expect(t.cloudflare).toContain('https://detour.tw/en/stats')
    }
  })

  it('leaves out the baseline it did not measure', () => {
    expect(actTemplates({ ...red, ref: null }, null).cloudflare).not.toContain('cloudflare.com answered')
  })
})
