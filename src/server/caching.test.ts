import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CRON_HOURLY, CRON_STATS, runCron } from './cron'
import { buildExport, dailyExportKey, dailyExportResponse, EXPORT_KEY, exportResponse } from './export'
import { resultResponse } from './results'
import { loadStatsSnapshot, refreshStatsSnapshot, statsResponse } from './stats'
import { flushWaitUntil } from './testing/cloudflare-workers'
import { createFakeD1 } from './testing/fake-d1'
import { installMemoryCache, MemoryCache, MemoryR2 } from './testing/fakes'

const NOW = Date.UTC(2026, 10, 14, 4, 0)
const SITE = 'https://detour.tw'

let db: ReturnType<typeof createFakeD1>
let r2: MemoryR2
let cache: MemoryCache
let seq = 0

function insertTest(
  over: { colo?: string; createdAt?: number; counted?: number; isp?: string; rtt?: number; ref?: number | null } = {},
) {
  const at = over.createdAt ?? NOW
  db.sqlite
    .prepare(
      `INSERT INTO tests (id, created_at, day, colo, country, region_code, isp_key, asn, rtt_ms, ref_colo, ref_rtt_ms,
        light, category, extra_km, counted, ip_hash, device_hash)
      VALUES (?, ?, ?, ?, 'TW', 'TPE', ?, 3462, ?, 'TPE', ?, 'red', 'tw', 10000, ?, 'h', 'd')`,
    )
    .run(
      `t${String(seq++).padStart(9, '0')}`,
      at,
      new Date(at + 8 * 3600_000).toISOString().slice(0, 10),
      over.colo ?? 'LAX',
      over.isp ?? 'cht',
      over.rtt ?? 150,
      over.ref === undefined ? 10 : over.ref,
      over.counted ?? 1,
    )
}

const snapshotRows = () => db.sqlite.prepare('SELECT key, generated_at FROM snapshots').all()
const req = (headers: Record<string, string> = {}) => new Request(`${SITE}/api/stats`, { headers })

beforeEach(() => {
  db = createFakeD1()
  r2 = new MemoryR2()
  cache = installMemoryCache()
  seq = 0
})

// Requests must never aggregate over `tests` once a snapshot exists: that is what keeps D1 safe from
// ~300 colos missing their caches at once.
describe('stats snapshot', () => {
  it('miss: computes once and stores; afterwards the stored snapshot is served even if data changed', async () => {
    insertTest()
    const first = await loadStatsSnapshot(db.d1, NOW)
    expect(snapshotRows()).toEqual([{ key: 'stats', generated_at: NOW }])
    insertTest()
    const second = await loadStatsSnapshot(db.d1, NOW + 60_000)
    expect(second).toEqual(first)
    expect(JSON.parse(second.body).totals.counted).toBe(1)
  })

  it('refresh replaces the snapshot; the ETag follows the content', async () => {
    insertTest()
    const a = await refreshStatsSnapshot(db.d1, NOW)
    insertTest()
    const b = await refreshStatsSnapshot(db.d1, NOW + 1)
    expect(b.etag).not.toBe(a.etag)
    expect(a.etag).toMatch(/^"[0-9a-f]{32}"$/)
    expect(JSON.parse((await loadStatsSnapshot(db.d1, NOW + 2)).body).totals.counted).toBe(2)
  })
})

describe('/api/stats HTTP', () => {
  it('200 with strong ETag, Last-Modified and the public cache policy', async () => {
    const snap = await refreshStatsSnapshot(db.d1, NOW)
    const res = await statsResponse(req(), db.d1, SITE)
    expect(res.status).toBe(200)
    expect(res.headers.get('etag')).toBe(snap.etag)
    expect(res.headers.get('last-modified')).toBe(new Date(NOW).toUTCString())
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=300, stale-while-revalidate=600')
    expect(await res.text()).toBe(snap.body)
  })

  it('304 on a matching If-None-Match, including the weak form the edge produces after compression', async () => {
    const snap = await refreshStatsSnapshot(db.d1, NOW)
    for (const inm of [snap.etag, `W/${snap.etag}`, `"other", ${snap.etag}`]) {
      const res = await statsResponse(req({ 'if-none-match': inm }), db.d1, SITE)
      expect(res.status).toBe(304)
      expect(await res.text()).toBe('')
      expect(res.headers.get('etag')).toBe(snap.etag)
    }
    expect((await statsResponse(req({ 'if-none-match': '"stale"' }), db.d1, SITE)).status).toBe(200)
  })

  it('edge cache sits in front of the snapshot and never outlives the 5-minute cadence', async () => {
    const snap = await refreshStatsSnapshot(db.d1, NOW)
    await statsResponse(req(), db.d1, SITE)
    await flushWaitUntil()
    const stored = cache.entries.get(`${SITE}/api/stats`)!
    expect(Object.fromEntries(stored.headers)['cache-control']).toBe('public, max-age=300')
    insertTest()
    await refreshStatsSnapshot(db.d1, NOW + 1)
    // Same colo, still within TTL: served from the edge copy without touching D1.
    expect((await statsResponse(req(), db.d1, SITE)).headers.get('etag')).toBe(snap.etag)
  })
})

describe('cron dispatch', () => {
  it('every 5 minutes: only the stats snapshot', async () => {
    insertTest()
    await runCron(CRON_STATS, { db: db.d1, bucket: r2.asBucket() }, NOW)
    expect(snapshotRows()).toHaveLength(1)
    expect(r2.objects.size).toBe(0)
  })

  it('hourly: purge old hashes, then rebuild the CSV (+ the dated copy for yesterday, once per day)', async () => {
    insertTest({ createdAt: NOW - 3 * 86_400_000 })
    await runCron(CRON_HOURLY, { db: db.d1, bucket: r2.asBucket() }, NOW)
    expect(db.sqlite.prepare('SELECT ip_hash FROM tests').get()).toEqual({ ip_hash: null })
    expect([...r2.objects.keys()].sort()).toEqual([dailyExportKey('2026-11-13'), EXPORT_KEY])
    expect(snapshotRows()).toHaveLength(0)

    const daily = r2.objects.get(dailyExportKey('2026-11-13'))
    await runCron(CRON_HOURLY, { db: db.d1, bucket: r2.asBucket() }, NOW + 3600_000)
    expect(r2.objects.get(dailyExportKey('2026-11-13'))).toBe(daily)
    expect(r2.puts).toBe(3)
  })

  // Invocation logs are off, so a failing cron task is only visible through its own console.error.
  it('a failing task logs its error and still fails the invocation', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = { prepare: () => { throw new Error('D1 down') }, batch: async () => { throw new Error('D1 down') } }
    await expect(runCron(CRON_STATS, { db: broken as unknown as D1Database, bucket: r2.asBucket() }, NOW)).rejects.toThrow('D1 down')
    expect(spy).toHaveBeenCalledWith('cron stats-snapshot failed', expect.any(Error))
    spy.mockRestore()
  })

  it('unknown schedules do nothing', async () => {
    await runCron('0 0 * * *', { db: db.d1, bucket: r2.asBucket() }, NOW)
    expect(snapshotRows()).toHaveLength(0)
    expect(r2.objects.size).toBe(0)
  })
})

// The public download is daily aggregates only: no per-test rows, and no cell small enough to single out a person.
describe('CSV export (daily aggregates) to R2', () => {
  const YESTERDAY = Date.UTC(2026, 10, 13, 4, 0)
  function fixture() {
    let t = NOW - 100_000
    const at = () => (t += 1000)
    insertTest({ createdAt: YESTERDAY, colo: 'LAX' })
    for (const [rtt, ref] of [[150, 10], [160, 12], [170, null]] as const) insertTest({ createdAt: at(), colo: 'LAX', rtt, ref })
    insertTest({ createdAt: at(), colo: 'TPE', rtt: 8, ref: 8 })
    insertTest({ createdAt: at(), colo: 'HKG', rtt: 40, ref: 9 })
    for (const rtt of [6, 7, 8]) insertTest({ createdAt: at(), isp: 'twm', colo: 'TPE', rtt, ref: 6 })
    insertTest({ createdAt: at(), counted: 0, colo: 'NRT' })
  }

  it('one row per (date, isp, colo) with shares and medians; cells under 3 tests folded into OTHER without medians', async () => {
    fixture()
    await buildExport(db.d1, r2.asBucket(), NOW)
    expect(await (await r2.get(EXPORT_KEY))!.text()).toBe(
      [
        'date,isp,isp_name_en,landing_colo,landing_city,landing_country,tests,share_of_isp_day,median_rtt_ms,median_ref_rtt_ms,median_extra_ms',
        '2026-11-13,cht,Chunghwa Telecom (HiNet),OTHER,,,1,1.0000,,,',
        '2026-11-14,cht,Chunghwa Telecom (HiNet),LAX,Los Angeles,US,3,0.6000,160,11,144',
        '2026-11-14,cht,Chunghwa Telecom (HiNet),OTHER,,,2,0.4000,,,',
        '2026-11-14,twm,Taiwan Mobile,TPE,Taipei,TW,3,1.0000,7,6,1',
        '',
      ].join('\n'),
    )
  })

  it('page boundaries (incl. equal created_at) do not change the result', async () => {
    fixture()
    insertTest({ createdAt: NOW - 95_000, colo: 'LAX', rtt: 155 }) // same created_at as a fixture row
    await buildExport(db.d1, r2.asBucket(), NOW, { pageSize: 1000 })
    const whole = await (await r2.get(EXPORT_KEY))!.text()
    await buildExport(db.d1, r2.asBucket(), NOW, { pageSize: 2 })
    expect(await (await r2.get(EXPORT_KEY))!.text()).toBe(whole)
    expect(whole).toContain('2026-11-14,cht,Chunghwa Telecom (HiNet),LAX,Los Angeles,US,4,')
  })

  // A public URL must never trigger a full-table scan on request.
  it('before the first build: 503 with Retry-After, and the miss is cached briefly', async () => {
    insertTest()
    const res = await exportResponse(new Request(`${SITE}/api/export.csv`), r2.asBucket(), SITE)
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('300')
    await flushWaitUntil()
    const stored = [...cache.entries.entries()].find(([k]) => k.startsWith(`${SITE}/api/export.csv`))![1]
    expect(stored.status).toBe(404)
    expect(Object.fromEntries(stored.headers)['cache-control']).toBe('public, max-age=300')
  })

  it('serves the R2 object with its ETag, generation time and 304 support', async () => {
    fixture()
    await buildExport(db.d1, r2.asBucket(), NOW)
    const res = await exportResponse(new Request(`${SITE}/api/export.csv`), r2.asBucket(), SITE)
    const etag = res.headers.get('etag')!
    expect(etag).toMatch(/^".+"$/)
    expect(res.headers.get('x-data-generated-at')).toBe(new Date(NOW).toISOString())
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600, stale-while-revalidate=86400')
    expect(await res.text()).toContain('2026-11-14,cht,Chunghwa Telecom (HiNet),LAX,Los Angeles,US,3,')
    const again = await exportResponse(
      new Request(`${SITE}/api/export.csv`, { headers: { 'if-none-match': etag } }),
      r2.asBucket(),
      SITE,
    )
    expect(again.status).toBe(304)
  })

  // A citation of "the 2026-11-13 file" must mean exactly that Taipei day's aggregates.
  it('the dated file is named after yesterday and holds only that day', async () => {
    const yesterdayLate = Date.UTC(2026, 10, 13, 15, 59) // 23:59 Taipei on the 13th
    insertTest({ createdAt: yesterdayLate - 86_400_000 })
    for (let i = 0; i < 3; i++) insertTest({ createdAt: yesterdayLate - i })
    insertTest({ createdAt: NOW - 1000 }) // today
    const result = await buildExport(db.d1, r2.asBucket(), NOW, { pageSize: 1 })
    expect(result.daily).toBe('2026-11-13')
    const daily = await (await r2.get(dailyExportKey('2026-11-13')))!.text()
    expect(daily.trim().split('\n').slice(1)).toEqual(['2026-11-13,cht,Chunghwa Telecom (HiNet),LAX,Los Angeles,US,3,1.0000,150,10,140'])
    expect((await (await r2.get(EXPORT_KEY))!.text()).trim().split('\n').map((l) => l.slice(0, 10))).toEqual([
      'date,isp,i',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
    ])
  })

  it('a day without tests still gets its (header-only) dated file', async () => {
    await buildExport(db.d1, r2.asBucket(), NOW)
    expect(await (await r2.get(dailyExportKey('2026-11-13')))!.text()).toMatch(/^date,isp,.*\n$/)
  })

  it('dated copies: served when present, null (404) when missing or malformed; misses cached briefly', async () => {
    insertTest()
    await buildExport(db.d1, r2.asBucket(), NOW)
    const get = (file: string) => dailyExportResponse(new Request(`${SITE}/api/export/${file}`), r2.asBucket(), SITE, file)
    const res = await get('2026-11-13.csv')
    expect(res?.status).toBe(200)
    expect(res?.headers.get('cache-control')).toContain('immutable')
    expect(await get('2026-11-12.csv')).toBeNull()
    expect(await get('../detour-daily.csv')).toBeNull()
    await flushWaitUntil()
    const miss = [...cache.entries.entries()].find(([k]) => k.startsWith(`${SITE}/api/export/2026-11-12.csv`))![1]
    expect(Object.fromEntries(miss.headers)['cache-control']).toBe('public, max-age=300')
  })

  // EXPLAIN on real migrations: each aggregation page must be an index range read, not a sort of all counted rows.
  it('aggregation pages use idx_tests_export without a temp sort', () => {
    const plan = db.sqlite
      .prepare(
        `EXPLAIN QUERY PLAN SELECT id FROM tests WHERE counted = 1 AND created_at >= ?1 AND (created_at > ?1 OR id > ?2)
        ORDER BY created_at, id LIMIT ?3`,
      )
      .all(0, '', 10) as { detail: string }[]
    const details = plan.map((p) => p.detail).join(' | ')
    expect(details).toContain('idx_tests_export')
    expect(details).not.toContain('TEMP B-TREE')
  })
})

describe('/api/result/:id edge cache', () => {
  it('caches misses for 1 minute so guessed ids do not each cost a D1 read', async () => {
    expect((await resultResponse(db.d1, SITE, 'zzzzzzzzzz')).status).toBe(404)
    await flushWaitUntil()
    const miss = cache.entries.get(`${SITE}/api/result/zzzzzzzzzz`)!
    expect(Object.fromEntries(miss.headers)['cache-control']).toBe('public, max-age=60')
  })
})
