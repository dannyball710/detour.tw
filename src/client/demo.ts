// Dev-only fixtures behind ?demo=<kind>, to review every result state without leaving Taiwan.
// Imported dynamically under import.meta.env.DEV, so none of this ships.
import type { IspStats, StatsResponse, TestResult } from '#/lib/types'
import { MeasureError } from './measure'
import type { MeasureProgress } from './measure'

function isp(key: string, n: number, mix: [number, number, number], rtt: number, colos: [string, number][]): IspStats {
  return {
    key,
    n,
    domestic: mix[0],
    lights: { green: mix[0], yellow: mix[1], red: mix[2] },
    medianRtt: rtt,
    medianRefRtt: 9,
    medianExtraMs: rtt - 9,
    colos: colos.map(([iata, share]) => ({ iata, n: Math.round(n * share) })),
  }
}

const DEMO_ISPS: IspStats[] = [
  isp('cht', 6240, [0.04, 0.08, 0.88], 148, [['LAX', 0.61], ['SJC', 0.22], ['NRT', 0.07], ['SEA', 0.05], ['TPE', 0.04], ['HKG', 0.01]]),
  isp('twm', 2130, [0.97, 0.03, 0], 12, [['TPE', 0.93], ['KHH', 0.04], ['HKG', 0.03]]),
  isp('fet', 1810, [0.95, 0.05, 0], 14, [['TPE', 0.95], ['NRT', 0.03], ['HKG', 0.02]]),
  isp('twmbb', 420, [0.98, 0.02, 0], 10, [['TPE', 0.98], ['HKG', 0.02]]),
  isp('kbro', 310, [0.91, 0.09, 0], 13, [['TPE', 0.91], ['HKG', 0.09]]),
  isp('seednet', 88, [0.62, 0.3, 0.08], 31, [['TPE', 0.62], ['HKG', 0.3], ['LAX', 0.08]]),
  isp('tbc', 22, [0.86, 0.14, 0], 15, [['TPE', 0.86], ['HKG', 0.14]]),
]

const DEMO_DAYS = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 9, 16 + i)).toISOString().slice(0, 10))

/** Plausible-looking numbers for reviewing the report layout; not real measurements. */
export const DEMO_STATS: StatsResponse = {
  generatedAt: Date.UTC(2026, 10, 14, 10, 30),
  windowDays: 30,
  totals: { counted: 11020, today: 412, allTime: 18340 },
  isps: DEMO_ISPS,
  trend: DEMO_DAYS.flatMap((day, i) =>
    DEMO_ISPS.map((s, k) => {
      const green = Math.min(1, Math.max(0, s.domestic + Math.sin(i * 0.7 + k) * 0.03 + (s.key === 'cht' && i > 22 ? (i - 22) * 0.02 : 0)))
      // Split the rest like the ISP's 30-day yellow/red mix.
      const abroad = s.lights.yellow + s.lights.red
      const yellow = abroad > 0 ? (1 - green) * (s.lights.yellow / abroad) : 1 - green
      // Uneven daily volume, so the small ISPs show faded (n < 5) and empty days; kbro has a two-day outage.
      const n = s.key === 'kbro' && (i === 12 || i === 13) ? 0 : Math.round((s.n / 30) * (0.4 + ((i * 7 + k * 3) % 10) / 8))
      return { day, isp: s.key, n, domestic: green, lights: { green, yellow, red: 1 - green - yellow } }
    }),
  ).filter((r) => r.n > 0),
  regions: [
    ['TPE', 3120, 0.52], ['NWT', 2240, 0.55], ['TAO', 1310, 0.58], ['TXG', 1280, 0.61], ['KHH', 1150, 0.63],
    ['TNN', 720, 0.6], ['HSZ', 410, 0.49], ['CHA', 260, 0.66], ['PIF', 140, 0.7], ['ILA', 96, 0.64],
    ['HUA', 61, 0.72], ['TTT', 28, 0.75], ['PEN', 12, 0.83],
  ].map(([code, n, abroad]) => ({ code: code as string, n: n as number, abroad: abroad as number })),
  intl: [
    { country: 'JP', n: 340, medianDistanceKm: 38, topColo: 'NRT' },
    { country: 'US', n: 290, medianDistanceKm: 61, topColo: 'SJC' },
    { country: 'HK', n: 120, medianDistanceKm: 14, topColo: 'HKG' },
    { country: 'SG', n: 74, medianDistanceKm: 12, topColo: 'SIN' },
    { country: 'DE', n: 41, medianDistanceKm: 96, topColo: 'FRA' },
    { country: 'KR', n: 18, medianDistanceKm: 44, topColo: 'ICN' },
  ],
  chtUsShare: 0.88,
}

const base: TestResult = {
  id: null,
  createdAt: Date.UTC(2026, 10, 14, 10, 2),
  light: 'red',
  category: 'tw',
  counted: true,
  notCountedReason: null,
  user: { country: 'TW', regionCode: 'TXG', region: 'Taichung City', lat: 24.15, lon: 120.67 },
  isp: { key: 'cht', asn: 3462, asOrganization: 'Data Communication Business Group' },
  landing: { iata: 'LAX', rttMs: 151, distanceKm: 10912 },
  ref: { iata: 'TPE', rttMs: 9, distanceKm: 131 },
  extraKm: 10781,
  extraMs: 142,
}

const FIXTURES: Record<string, TestResult> = {
  red: base,
  optout: { ...base, counted: false, notCountedReason: 'opt-out' },  sjc: { ...base, landing: { iata: 'SJC', rttMs: 139, distanceKm: 10380 }, extraKm: 10249, extraMs: 130 },
  ewr: { ...base, landing: { iata: 'EWR', rttMs: 214, distanceKm: 12540 }, extraKm: 12409, extraMs: 205 },
  fra: { ...base, landing: { iata: 'FRA', rttMs: 262, distanceKm: 9390 }, extraKm: 9259, extraMs: 253 },
  gru: { ...base, landing: { iata: 'GRU', rttMs: 330, distanceKm: 18700 }, extraKm: 18569, extraMs: 321 },
  // Long-haul landings for reviewing the world-scale maps.
  eze: { ...base, landing: { iata: 'EZE', rttMs: 340, distanceKm: 18800 }, extraKm: 18669, extraMs: 331 },
  jnb: { ...base, landing: { iata: 'JNB', rttMs: 290, distanceKm: 11400 }, extraKm: 11269, extraMs: 281 },
  cpt: { ...base, landing: { iata: 'CPT', rttMs: 310, distanceKm: 12100 }, extraKm: 11969, extraMs: 301 },
  lhr: { ...base, landing: { iata: 'LHR', rttMs: 250, distanceKm: 9800 }, extraKm: 9669, extraMs: 241 },
  iad: { ...base, landing: { iata: 'IAD', rttMs: 210, distanceKm: 12600 }, extraKm: 12469, extraMs: 201 },
  syd: { ...base, landing: { iata: 'SYD', rttMs: 140, distanceKm: 7300 }, extraKm: 7169, extraMs: 131 },
  akl: { ...base, landing: { iata: 'AKL', rttMs: 160, distanceKm: 8800 }, extraKm: 8669, extraMs: 151 },
  yellow: {
    ...base,
    light: 'yellow',
    user: { country: 'TW', regionCode: null, region: null, lat: null, lon: null },
    isp: { key: 'fet', asn: 9674, asOrganization: 'Far EastTone Telecommunication Co., Ltd.' },
    landing: { iata: 'NRT', rttMs: 46, distanceKm: 2180 },
    ref: { iata: 'TPE', rttMs: 8, distanceKm: 30 },
    extraKm: 2150,
    extraMs: 38,
  },
  hkg: {
    ...base,
    light: 'yellow',
    user: { country: 'TW', regionCode: 'KHH', region: 'Kaohsiung', lat: 22.63, lon: 120.3 },
    landing: { iata: 'HKG', rttMs: 24, distanceKm: 660 },
    ref: { iata: 'KHH', rttMs: 6, distanceKm: 12 },
    extraKm: 648,
    extraMs: 18,
  },
  green: {
    ...base,
    light: 'green',
    user: { country: 'TW', regionCode: 'KHH', region: 'Kaohsiung', lat: 22.63, lon: 120.3 },
    isp: { key: 'twm', asn: 24158, asOrganization: 'Taiwan Mobile Co., Ltd.' },
    landing: { iata: 'TPE', rttMs: 11, distanceKm: 286 },
    ref: { iata: 'TPE', rttMs: 10, distanceKm: 286 },
    extraKm: 0,
    extraMs: 1,
  },
  gray: {
    ...base,
    light: 'gray',
    category: 'vpn',
    counted: false,
    notCountedReason: 'vpn',
    user: { country: 'JP', regionCode: null, region: 'Tokyo', lat: 35.68, lon: 139.69 },
    isp: { key: 'other', asn: 16509, asOrganization: 'Amazon.com, Inc.' },
    landing: { iata: 'NRT', rttMs: 62, distanceKm: 60 },
    ref: { iata: 'NRT', rttMs: 60, distanceKm: 60 },
    extraKm: 0,
    extraMs: 2,
  },
  blue: {
    ...base,
    light: 'blue',
    category: 'intl',
    counted: false,
    notCountedReason: 'intl',
    user: { country: 'DE', regionCode: null, region: 'Hesse', lat: 50.11, lon: 8.68 },
    isp: { key: 'other', asn: 3320, asOrganization: 'Deutsche Telekom AG' },
    landing: { iata: 'FRA', rttMs: 14, distanceKm: 11 },
    ref: { iata: 'FRA', rttMs: 13, distanceKm: 11 },
    extraKm: 0,
    extraMs: 1,
  },
  roaming: { ...base, category: 'roaming', counted: false, notCountedReason: 'roaming' },
}

// Visitors outside Taiwan, for reviewing how the chart frames them.
const abroad = (country: string, lat: number | null, lon: number | null, iata: string): TestResult => ({
  ...FIXTURES.blue,
  user: { country, regionCode: null, region: null, lat, lon },
  landing: { iata, rttMs: 9, distanceKm: 20 },
  ref: null,
})
Object.assign(FIXTURES, {
  jp: abroad('JP', 35.68, 139.69, 'NRT'),
  us: abroad('US', 37.34, -121.89, 'SJC'),
  hk: abroad('HK', 22.3, 114.17, 'HKG'),
  kr: abroad('KR', 37.57, 126.98, 'LAX'),
  unplaced: abroad('US', null, null, 'SJC'),
  ussin: abroad('US', 37.34, -121.89, 'SIN'),
  visiting: abroad('JP', 35.68, 139.69, 'TPE'),
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * ?demo=stored&id=<id> replays a result that really is stored, so the share sheet can be
 * reviewed with an image, a link and a text that all describe the same result. Fixtures
 * have no id: nothing is stored for them, so there is no image or link to show.
 */
async function storedResult(): Promise<TestResult | null> {
  const id = new URLSearchParams(location.search).get('id')
  if (!id) return null
  const res = await fetch(`/api/result/${encodeURIComponent(id)}`)
  return res.ok ? ((await res.json()) as TestResult) : null
}

export async function runDemo(kind: string, onProgress: (p: MeasureProgress) => void): Promise<TestResult> {
  onProgress({ step: 0 })
  const stored = kind === 'stored' ? await storedResult() : null
  await sleep(120)
  if (kind === 'error') throw new MeasureError('failed')
  const result = stored ?? FIXTURES[kind] ?? base
  const who = { user: result.user, isp: result.isp }
  onProgress({ step: 0, ...who })
  await sleep(230)
  const seen = { colo: result.landing.iata, ...who }
  onProgress({ step: 1, ...seen })
  await sleep(1950)
  onProgress({ step: 2, ...seen })
  await sleep(200)
  return stored ?? { ...result, createdAt: Date.now() }
}
