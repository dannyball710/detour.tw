import { beforeEach, describe, expect, it } from 'vitest'
import { csvCell } from './export'
import { computeStats } from './stats'
import { createFakeD1 } from './testing/fake-d1'
import { purgeExpired } from './cron'

const NOW = Date.UTC(2026, 10, 14, 4, 0) // 2026-11-14 12:00 in Taipei
const DAY = 86_400_000

let db: ReturnType<typeof createFakeD1>
let seq = 0

interface Fixture {
  daysAgo?: number
  isp?: string
  colo?: string
  light?: string
  category?: string
  counted?: 0 | 1
  baseline?: 0 | 1
  flags?: string | null
  region?: string | null
  country?: string
  rtt: number
  ref?: number | null
  distance?: number | null
}

function insert(f: Fixture) {
  const at = NOW - (f.daysAgo ?? 0) * DAY
  const day = new Date(at + 8 * 3600_000).toISOString().slice(0, 10)
  db.sqlite
    .prepare(
      `INSERT INTO tests (id, created_at, day, colo, country, region_code, isp_key, rtt_ms, ref_colo, ref_rtt_ms,
        light, category, distance_km, extra_km, counted, flags, ip_hash, device_hash, baseline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `id${String(seq++).padStart(8, '0')}`,
      at,
      day,
      f.colo ?? 'LAX',
      f.country ?? 'TW',
      f.region === undefined ? 'TPE' : f.region,
      f.isp ?? 'cht',
      f.rtt,
      f.ref === null ? null : 'TPE',
      f.ref === undefined ? 10 : f.ref,
      f.light ?? 'red',
      f.category ?? 'tw',
      f.distance ?? null,
      f.distance == null ? null : f.distance,
      f.counted ?? 1,
      f.flags ?? null,
      'iphash',
      'devhash',
      f.baseline ?? 0,
    )
}

beforeEach(() => {
  db = createFakeD1()
  seq = 0
})

// These numbers go into press releases; every share and median must be exactly what the rows say.
describe('computeStats', () => {
  beforeEach(() => {
    // cht: 3 counted in window (2 LAX, 1 TPE), 1 counted but older than 30 days, 1 not counted.
    insert({ isp: 'cht', colo: 'LAX', light: 'red', rtt: 150, ref: 10 })
    insert({ isp: 'cht', colo: 'LAX', light: 'red', rtt: 170, ref: 12, daysAgo: 3, region: 'KHH' })
    insert({ isp: 'cht', colo: 'TPE', light: 'green', rtt: 10, ref: 8 })
    insert({ isp: 'cht', colo: 'LAX', light: 'red', rtt: 999, daysAgo: 40 })
    insert({ isp: 'cht', colo: 'LAX', light: 'red', rtt: 999, counted: 0 })
    // twm: 2 counted, both domestic, one without a reference measurement.
    insert({ isp: 'twm', colo: 'TPE', light: 'green', rtt: 6, ref: 6 })
    insert({ isp: 'twm', colo: 'KHH', light: 'green', rtt: 12, ref: null, region: 'KHH' })
    // International baseline: only baseline = 1 rows (flagged / duplicate / vpn rows are stored with 0).
    const intl = { category: 'intl', country: 'JP', light: 'blue', counted: 0, rtt: 5 } as const
    insert({ ...intl, colo: 'NRT', distance: 60, baseline: 1 })
    insert({ ...intl, colo: 'NRT', distance: 80, baseline: 1 })
    insert({ ...intl, category: 'foreign-sim', colo: 'KIX', distance: 400, baseline: 1 })
    insert({ ...intl, colo: 'LAX', distance: 9000, flags: 'ref-ip' })
    insert({ ...intl, colo: 'LAX', distance: 9000 }) // duplicate of a device already in the baseline today
    insert({ category: 'vpn', country: 'US', colo: 'LAX', light: 'gray', counted: 0, rtt: 5, distance: 10 })
  })

  it('totals count only counted tests, split by window / today / all time', async () => {
    const s = await computeStats(db.d1, NOW)
    expect(s.totals).toEqual({ counted: 5, today: 4, allTime: 6 })
    expect(s.windowDays).toBe(30)
  })

  it('per-ISP shares and medians', async () => {
    const s = await computeStats(db.d1, NOW)
    expect(s.isps.map((i) => i.key)).toEqual(['cht', 'twm'])
    const cht = s.isps[0]
    expect(cht.n).toBe(3)
    expect(cht.domestic).toBeCloseTo(1 / 3)
    expect(cht.lights).toEqual({ green: 1 / 3, yellow: 0, red: 2 / 3 })
    expect(cht.medianRtt).toBe(150)
    expect(cht.medianRefRtt).toBe(10)
    expect(cht.medianExtraMs).toBe(140) // extras: 140, 158, 2
    expect(cht.colos).toEqual([
      { iata: 'LAX', n: 2 },
      { iata: 'TPE', n: 1 },
    ])
    const twm = s.isps[1]
    expect(twm.domestic).toBe(1)
    expect(twm.medianRtt).toBe(9)
    expect(twm.medianRefRtt).toBe(6)
    expect(twm.medianExtraMs).toBe(0)
  })

  it('chtUsShare is the share of counted cht tests landing in a US colo', async () => {
    expect((await computeStats(db.d1, NOW)).chtUsShare).toBeCloseTo(2 / 3)
  })

  it('trend and regions', async () => {
    const s = await computeStats(db.d1, NOW)
    expect(s.trend).toEqual([
      { day: '2026-11-11', isp: 'cht', n: 1, domestic: 0, lights: { green: 0, yellow: 0, red: 1 } },
      { day: '2026-11-14', isp: 'cht', n: 2, domestic: 0.5, lights: { green: 0.5, yellow: 0, red: 0.5 } },
      { day: '2026-11-14', isp: 'twm', n: 2, domestic: 1, lights: { green: 1, yellow: 0, red: 0 } },
    ])
    expect(s.regions).toEqual([
      { code: 'TPE', n: 3, abroad: 1 / 3 },
      { code: 'KHH', n: 2, abroad: 0.5 },
    ])
  })

  // The trend chart stacks Taiwan / nearby / far per day: each day's shares must add up to the whole.
  it('trend lights on a mixed day, per ISP and per Taipei day, summing to 1', async () => {
    for (const [colo, light] of [['TPE', 'green'], ['KHH', 'green'], ['HKG', 'yellow'], ['LAX', 'red']]) {
      insert({ isp: 'fet', colo, light, rtt: 50, daysAgo: 1 })
    }
    insert({ isp: 'fet', colo: 'NRT', light: 'yellow', rtt: 50, counted: 0, daysAgo: 1 }) // not counted: ignored
    const fet = (await computeStats(db.d1, NOW)).trend.filter((t) => t.isp === 'fet')
    expect(fet).toEqual([
      { day: '2026-11-13', isp: 'fet', n: 4, domestic: 0.5, lights: { green: 0.5, yellow: 0.25, red: 0.25 } },
    ])
    for (const t of (await computeStats(db.d1, NOW)).trend) {
      expect(t.lights.green + t.lights.yellow + t.lights.red).toBeCloseTo(1)
      expect(t.domestic).toBe(t.lights.green)
    }
  })

  it('international baseline uses baseline rows only', async () => {
    const s = await computeStats(db.d1, NOW)
    expect(s.intl).toEqual([{ country: 'JP', n: 3, medianDistanceKm: 80, topColo: 'NRT' }])
  })

  it('empty database', async () => {
    const s = await computeStats(createFakeD1().d1, NOW)
    expect(s).toMatchObject({ totals: { counted: 0, today: 0, allTime: 0 }, isps: [], chtUsShare: null })
  })
})

describe('CSV export', () => {
  it('neutralises spreadsheet formulas and quotes separators', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('@SUM')).toBe("'@SUM")
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell(null)).toBe('')
    expect(csvCell(-5)).toBe('-5')
  })
})

// Privacy promise: daily hashes are erased after 48 h.
describe('cron purge', () => {
  it('nulls hashes older than 48 h and drops old nonces', async () => {
    insert({ rtt: 1, daysAgo: 3 })
    insert({ rtt: 1 })
    db.sqlite.prepare('INSERT INTO nonces VALUES (?, ?), (?, ?)').run('old', NOW - 2 * 3600_000, 'new', NOW)
    await purgeExpired(db.d1, NOW)
    const rows = db.sqlite.prepare('SELECT ip_hash, device_hash FROM tests ORDER BY created_at').all()
    expect(rows).toEqual([
      { ip_hash: null, device_hash: null },
      { ip_hash: 'iphash', device_hash: 'devhash' },
    ])
    expect(db.sqlite.prepare('SELECT nonce FROM nonces').all()).toEqual([{ nonce: 'new' }])
  })
})
