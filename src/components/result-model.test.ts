import { describe, expect, it } from 'vitest'
import type { StatsResponse, TestResult } from '#/lib/types'
import {
  baselineOf,
  chtUsShareOf,
  detourKm,
  figuresOf,
  headline,
  isAbroadRoute,
  latLonOf,
  originOf,
  pendingBaselineLabel,
  stubOf,
  verdict,
} from './result-model'
import type { TestState } from './result-model'
import { shareText, shareUrl } from './share/share'

const red: TestResult = {
  id: 'abcdefghij',
  createdAt: 0,
  light: 'red',
  category: 'tw',
  counted: true,
  notCountedReason: null,
  user: { country: 'TW', regionCode: 'TXG', region: 'Taichung City', lat: 24.15, lon: 120.67 },
  isp: { key: 'cht', asn: 3462, asOrganization: null },
  landing: { iata: 'LAX', rttMs: 151, distanceKm: 10912 },
  ref: { iata: 'TPE', rttMs: 9, distanceKm: 131 },
  extraKm: 10781,
  extraMs: 142,
}
const green: TestResult = { ...red, light: 'green', landing: { iata: 'TPE', rttMs: 11, distanceKm: 131 }, extraKm: 0, extraMs: 2 }
const blue: TestResult = {
  ...red,
  light: 'blue',
  category: 'intl',
  user: { country: 'DE', regionCode: null, region: null, lat: 50.11, lon: 8.68 },
  landing: { iata: 'FRA', rttMs: 14, distanceKm: 11 },
  extraKm: 0,
  extraMs: 1,
}

describe('figuresOf', () => {
  // The label says how far the connection went, so the figure is the whole way to the landing,
  // not the extra (which the subline gives as 繞了 N 公里).
  it('leads a detour with the distance to the landing and the extra latency', () => {
    const [km, ms] = figuresOf(red, 'zh')
    // Five digits do not fit the big figure: thousands with one decimal.
    expect(km).toMatchObject({ label: '連線走了', value: '10.9k' })
    expect(ms).toMatchObject({ label: '每次來回多', value: '+142' })
  })

  // Every light shows the same figure: how far the connection went, here a short hop in Taiwan.
  it('shows the distance to the landing for a green result too', () => {
    const [km, ms] = figuresOf(green, 'zh')
    expect(km).toMatchObject({ label: '連線走了', value: String(Math.round(green.landing.distanceKm!)) })
    expect(ms).toMatchObject({ label: '實測延遲', value: '11' })
    expect(figuresOf({ ...green, landing: { ...green.landing, distanceKm: null } }, 'zh')[0].value).toBe('—')
  })

  it('never shows a negative extra latency', () => {
    const [, ms] = figuresOf({ ...red, extraMs: -4 }, 'zh')
    expect(ms.label).toBe('實測延遲')
    expect(ms.value).toBe('151')
  })

  // The total distance overstates the detour by the stretch to Taipei: only "extra" is called extra.
  it('estimates the extra distance against Taipei when no baseline was measured', () => {
    const noRef = { ...red, ref: null, extraKm: null, extraMs: null }
    expect(detourKm(noRef)).toBeGreaterThan(10_700)
    expect(detourKm(noRef)).toBeLessThan(10_850)
  })

  it('has no extra distance when the visitor cannot be placed, and still shows the distance', () => {
    const unplaced = { ...red, user: { ...red.user, lat: null, lon: null }, ref: null, extraKm: null, extraMs: null }
    expect(detourKm(unplaced)).toBeNull()
    expect(figuresOf(unplaced, 'zh')[0]).toMatchObject({ label: '連線走了', value: '10.9k' })
  })
})

describe('verdict without numbers', () => {
  // County unknown and baseline blocked: no km, no ms, and the sentence must still read.
  it('keeps a whole sentence for a detour with no distance or extra latency', () => {
    const bare = { ...red, user: { ...red.user, lat: null, lon: null }, ref: null, extraKm: null, extraMs: null }
    expect(verdict(bare, 'zh', null).sub).toBe('你的連線跑到了國外。')
    expect(verdict({ ...bare, light: 'yellow' }, 'zh', null).sub).toBe('連線繞到台灣附近的節點，比走台北遠一些。')
    expect(verdict({ ...bare, light: 'yellow' }, 'en', null).sub).toBe('A little farther than Taipei.')
    expect(verdict({ ...bare, extraMs: 140 }, 'zh', null).sub).toBe('你的連線來回多了 140 毫秒。')
    expect(verdict({ ...bare, extraMs: 140 }, 'zh', null, true).sub).toBe('這條連線來回多了 140 毫秒。')
    expect(verdict(red, 'zh', null).sub).toMatch(/^你的連線繞了 [\d,]+ 公里，連線來回多了 \d+ 毫秒。$/)
    expect(verdict(red, 'en', null).sub).toMatch(/^Your connection traveled [\d,]+ km — \d+ ms more per round trip\.$/)
  })
})

describe('originOf', () => {
  it('uses the county code inside Taiwan', () => {
    expect(originOf(red.user, 'zh')).toEqual({ code: 'TXG', name: '台中市' })
  })

  it('says Taiwan when the county is unknown', () => {
    const user = { ...red.user, regionCode: null, region: null }
    expect(originOf(user, 'zh')).toEqual({ code: 'TWN', name: '台灣' })
    expect(originOf(user, 'en')).toEqual({ code: 'TWN', name: 'Taiwan' })
  })

  it('uses the country outside Taiwan', () => {
    expect(originOf(blue.user, 'en')).toEqual({ code: 'DE', name: 'Germany' })
  })
})

// Taipei is only a meaningful comparison for a visitor in Taiwan; abroad the baseline is the
// visitor's own nearest data center.
describe('baselineOf', () => {
  // Both figures are measured: the label names the Taiwan node it landed on and never says "estimate".
  it('compares a visitor in Taiwan with the Taiwan node it measured', () => {
    expect(baselineOf(red, 'zh')).toEqual({ label: '台灣節點 TPE', value: '9 毫秒' })
    expect(baselineOf(red, 'en')?.label).toBe('Taiwan node TPE')
    expect(baselineOf({ ...red, ref: { iata: 'KHH', rttMs: 7, distanceKm: 150 } }, 'zh')?.label).toBe('台灣節點 KHH')
  })

  it('names the nearest data center for a visitor abroad, never Taipei', () => {
    const jp: TestResult = { ...blue, user: { ...blue.user, country: 'JP' }, ref: { iata: 'NRT', rttMs: 12, distanceKm: 20 } }
    expect(baselineOf(jp, 'zh')).toEqual({ label: '就近節點 NRT', value: '12 毫秒' })
    expect(baselineOf(jp, 'en')?.label).toBe('Nearest node NRT')
    expect(baselineOf({ ...jp, ref: { iata: 'TPE', rttMs: 30, distanceKm: 2100 } }, 'zh')?.label).toBe('就近節點 TPE')
  })

  it('has no baseline to show when none was measured', () => {
    expect(baselineOf({ ...blue, ref: null }, 'zh')).toBeNull()
  })

  it('labels the pending cell by where the visitor is', () => {
    expect(pendingBaselineLabel(null, 'zh')).toBe('台灣節點延遲')
    expect(pendingBaselineLabel(red.user, 'zh')).toBe('台灣節點延遲')
    expect(pendingBaselineLabel(blue.user, 'zh')).toBe('就近節點')
  })
})

describe('where the visitor is drawn', () => {
  it('falls back to Taipei only for a visitor known to be in Taiwan', () => {
    expect(latLonOf(red.user)).toEqual({ lat: 24.15, lon: 120.67 })
    expect(latLonOf({ ...red.user, lat: null, lon: null })).toEqual({ lat: 25.04, lon: 121.56 })
    expect(latLonOf({ ...blue.user, lat: null, lon: null })).toBeNull()
  })
})

describe('verdict and route', () => {
  it('follows the brief wording per light', () => {
    expect(verdict(red, 'zh', null).title).toBe('你的網路出國了：洛杉磯')
    expect(verdict(green, 'zh', null).title).toBe('你的連線在台北落地')
    // A plain fact, no "you": it reads the same on someone else's result.
    expect(verdict(green, 'zh', null, true).sub).toBe('連線在台灣就近完成，來回約 11 毫秒。')
    expect(verdict(blue, 'zh', 0.88).sub).toContain('88% 落在美國')
  })

  // A share of a handful of tests would read as a finding ("0% land in the US").
  it('quotes the Chunghwa Telecom share only from a sample worth quoting', () => {
    const stats = (n: number): StatsResponse => ({
      generatedAt: 0,
      windowDays: 30,
      totals: { counted: n, today: 0, allTime: n },
      isps: [{ key: 'cht', n, domestic: 1, lights: { green: 1, yellow: 0, red: 0 }, medianRtt: null, medianRefRtt: null, medianExtraMs: null, colos: [] }],
      trend: [],
      regions: [],
      intl: [],
      chtUsShare: 0,
    })
    expect(chtUsShareOf(stats(29))).toBeNull()
    expect(chtUsShareOf(null)).toBeNull()
    expect(chtUsShareOf(stats(30))).toBe(0)
    expect(verdict(blue, 'zh', chtUsShareOf(stats(4))).sub).not.toMatch(/\d+%/)
    expect(verdict(blue, 'en', chtUsShareOf(stats(4))).sub).not.toMatch(/\d+%/)
  })

  it('keeps a status and a headline for every state of the test', () => {
    const measuring: TestState = { phase: 'measuring', step: 1, colo: 'LAX', user: red.user, isp: red.isp }
    expect(headline(measuring, 'zh', null)).toMatchObject({ lamp: 'pending', title: '它好像要搭飛機了…' })
    expect(headline({ phase: 'done', result: red }, 'zh', null)).toMatchObject({ lamp: 'red', status: '出國了' })
    expect(headline({ phase: 'error', kind: 'offline' }, 'zh', null)).toMatchObject({ lamp: 'error', sub: '' })
  })

  // Taiwan belongs on the chart only when one end of the route is there.
  it('treats a route as abroad only when neither end is in Taiwan', () => {
    expect(isAbroadRoute(blue.user, 'FRA')).toBe(true)
    expect(isAbroadRoute(blue.user, null)).toBe(true)
    expect(isAbroadRoute(blue.user, 'TPE')).toBe(false)
    expect(isAbroadRoute(red.user, 'LAX')).toBe(false)
  })
})

describe('sharing', () => {
  it('links to the stored result, in the visitor language', () => {
    expect(shareUrl('https://detour.tw', 'zh', red)).toBe('https://detour.tw/r/abcdefghij')
    expect(shareUrl('https://detour.tw', 'en', red)).toBe('https://detour.tw/en/r/abcdefghij')
  })

  // Without a stored result there is nothing to link to: the home page is shared instead.
  it('links to the home page when the result was not stored', () => {
    expect(shareUrl('https://detour.tw', 'zh', { ...red, id: null })).toBe('https://detour.tw/')
  })

  it('uses the brief templates', () => {
    expect(shareText('zh', red, 'https://detour.tw/r/x')).toBe('我的網路出國了，連到洛杉磯，多繞 10,781 公里。你的呢？https://detour.tw/r/x')
    expect(shareText('zh', green, 'https://detour.tw/r/x')).toBe('我的網路沒出國，在台北落地。來測測你家的？https://detour.tw/r/x')
  })

  // Passing on a friend's result must not claim it as "my" connection.
  it('passes on someone else\'s result in the third person', () => {
    expect(shareText('zh', red, 'u', true)).toBe('這個網路出國了，連到洛杉磯，多繞 10,781 公里。你的呢？u')
    expect(shareText('zh', green, 'u', true)).toBe('這個網路沒出國，在台北落地。來測測你家的？u')
    expect(shareText('en', red, 'u', true)).toMatch(/^This connection left Taiwan/)
  })
})

describe('stubOf', () => {
  // The stub must add something the big figures do not say, in every light, and never be empty.
  it('pairs a detour\'s latency with the Taiwan baseline', () => {
    expect(stubOf(red, 'zh')).toEqual([
      { label: '實測延遲', value: '151 毫秒' },
      { label: '台灣節點 TPE', value: '9 毫秒' },
    ])
  })

  it('names where a result without a detour landed, not a baseline that repeats it', () => {
    const [landing, second] = stubOf(green, 'zh')
    expect(landing).toEqual({ label: '落地機房', value: 'TPE 台北' })
    expect(second.label).toBe('測試時間')
    expect(stubOf(blue, 'en')[0]).toEqual({ label: 'Data center', value: 'FRA Frankfurt' })
  })

  it('always fills both cells, even with no baseline measured', () => {
    for (const r of [red, green, blue, { ...blue, light: 'gray' as const }]) {
      const cells = stubOf({ ...r, ref: null }, 'zh')
      expect(cells).toHaveLength(2)
      for (const c of cells) expect(c.value).not.toBe('')
    }
  })
})

describe('a shared result page', () => {
  // A friend who opens the link has measured nothing: the page must not say it was their network.
  it('tells someone else\'s result without "you"', () => {
    for (const r of [red, green, blue, { ...red, light: 'yellow' as const }, { ...red, light: 'gray' as const }]) {
      const v = verdict(r, 'zh', 0.88, true)
      expect(v.title + v.sub, r.light).not.toMatch(/你/)
      expect(verdict(r, 'en', 0.88, true).title, r.light).not.toMatch(/\byou/i)
    }
    expect(verdict(red, 'zh', null, true).title).toBe('這個網路出國了：洛杉磯')
    expect(verdict(red, 'zh', null).title).toBe('你的網路出國了：洛杉磯')
  })
})
