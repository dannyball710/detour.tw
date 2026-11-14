import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ARCHIVE_PREFIX, archiveDays, archiveKey } from './archive'
import { CRON_HOURLY, runCron } from './cron'
import { dailyExportResponse } from './export'
import { createFakeD1 } from './testing/fake-d1'
import { installMemoryCache, MemoryR2 } from './testing/fakes'

const NOW = Date.UTC(2026, 10, 15, 4, 0) // 2026-11-15 12:00 Taipei
const DAY = 86_400_000
const SITE = 'https://detour.tw'

let db: ReturnType<typeof createFakeD1>
let r2: MemoryR2
let seq = 0

function insert(at: number, over: { category?: string; counted?: number; flags?: string | null } = {}) {
  db.sqlite
    .prepare(
      `INSERT INTO tests (id, created_at, day, colo, country, region_code, region, lat, lon, asn, as_org, isp_key,
        server_rtt, rtt_ms, ref_colo, ref_rtt_ms, tz, conn, light, category, distance_km, ref_distance_km, extra_km,
        counted, baseline, flags, ip_hash, device_hash)
      VALUES (?, ?, ?, 'LAX', 'TW', 'TPE', 'Taiwan', 25.0375, 121.5637, 3462, 'Chunghwa Telecom', 'cht',
        140, 150, 'TPE', 10, 'Asia/Taipei', 'wifi', 'red', ?, 10920, 32, 10888, ?, 0, ?, 'secret-ip-hash', 'secret-device-hash')`,
    )
    .run(
      `pub${String(seq++).padStart(7, '0')}`,
      at,
      new Date(at + 8 * 3600_000).toISOString().slice(0, 10),
      over.category ?? 'tw',
      over.counted ?? 1,
      over.flags ?? null,
    )
}

async function gunzipText(key: string): Promise<string> {
  const buf = await (await r2.get(key))!.arrayBuffer()
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

beforeEach(() => {
  db = createFakeD1()
  r2 = new MemoryR2()
  installMemoryCache()
  seq = 0
})

// The archive exists to re-derive statistics later; it must hold every row of the day and nothing that
// identifies a person.
describe('private raw archive', () => {
  it("archives yesterday's rows of every category, without hashes, ids or exact timestamps", async () => {
    const at = Date.UTC(2026, 10, 14, 1, 23, 45, 678) // 2026-11-14 09:23:45.678 Taipei
    insert(at)
    insert(at + 1000, { category: 'vpn', counted: 0 })
    insert(at + 2000, { counted: 0, flags: 'rtt-physics' })
    insert(NOW - 1000) // today: not finished, not archived
    expect(await archiveDays(db.d1, r2.asBucket(), NOW)).toEqual(['2026-11-14'])
    const csv = await gunzipText(archiveKey('2026-11-14'))
    const [header, ...rows] = csv.trim().split('\n')
    expect(header).toBe(
      'day,created_hour,colo,country,region_code,region,lat,lon,asn,as_org,isp_key,server_rtt,rtt_ms,ref_colo,' +
        'ref_rtt_ms,tz,conn,light,category,distance_km,ref_distance_km,extra_km,counted,baseline,flags',
    )
    expect(rows).toHaveLength(3)
    expect(rows[0]).toBe(
      `2026-11-14,${Date.UTC(2026, 10, 14, 1)},LAX,TW,TPE,Taiwan,25.0375,121.5637,3462,Chunghwa Telecom,cht,140,150,` +
        'TPE,10,Asia/Taipei,wifi,red,tw,10920,32,10888,1,0,',
    )
    expect(rows.map((r) => r.split(',')[18])).toEqual(['tw', 'vpn', 'tw'])
    expect(rows[2].endsWith(',0,0,rtt-physics')).toBe(true)
    expect(csv).not.toMatch(/secret-|pub0|678/)
    expect(archiveKey('2026-11-14')).toBe('raw/2026/11/detour-raw-2026-11-14.csv.gz')
  })

  it('is idempotent: an existing archive is never rewritten', async () => {
    insert(NOW - DAY)
    await archiveDays(db.d1, r2.asBucket(), NOW)
    const first = r2.objects.get(archiveKey('2026-11-14'))
    insert(NOW - DAY + 1) // a late row must not silently change a published-to-ourselves archive
    expect(await archiveDays(db.d1, r2.asBucket(), NOW + 3600_000)).toEqual([])
    expect(r2.objects.get(archiveKey('2026-11-14'))).toBe(first)
  })

  it('backfills earlier days newest first, bounded per run, header-only for days without tests', async () => {
    for (const daysAgo of [1, 3, 5, 6]) insert(NOW - daysAgo * DAY)
    expect(await archiveDays(db.d1, r2.asBucket(), NOW, { maxDays: 4 })).toEqual([
      '2026-11-14',
      '2026-11-13',
      '2026-11-12',
      '2026-11-11',
    ])
    expect(await gunzipText(archiveKey('2026-11-13'))).toMatch(/^day,created_hour,[^\n]*\n$/)
    expect(await archiveDays(db.d1, r2.asBucket(), NOW, { maxDays: 4 })).toEqual(['2026-11-10', '2026-11-09'])
    expect(await archiveDays(db.d1, r2.asBucket(), NOW, { maxDays: 4 })).toEqual([])
  })

  it('pages through a day without losing rows that share a timestamp', async () => {
    for (let i = 0; i < 5; i++) insert(NOW - DAY + (i < 3 ? 0 : i))
    await archiveDays(db.d1, r2.asBucket(), NOW, { pageSize: 2 })
    expect((await gunzipText(archiveKey('2026-11-14'))).trim().split('\n')).toHaveLength(6)
  })

  it('the hourly cron archives even when the export fails, and still reports the failure', async () => {
    insert(NOW - DAY)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const put = r2.put.bind(r2)
    r2.put = async (key, value, opts) => {
      if (key.startsWith('detour-daily')) throw new Error('R2 down')
      return put(key, value, opts)
    }
    await expect(runCron(CRON_HOURLY, { db: db.d1, bucket: r2.asBucket() }, NOW)).rejects.toThrow('R2 down')
    expect(r2.objects.has(archiveKey('2026-11-14'))).toBe(true)
    spy.mockRestore()
  })
})

// The raw archive is private: no request path may ever produce a key under raw/.
describe('raw archive is unreachable', () => {
  it('the dated-file route cannot be steered to the raw/ prefix', async () => {
    insert(NOW - DAY)
    await archiveDays(db.d1, r2.asBucket(), NOW)
    const requested: string[] = []
    const get = r2.get.bind(r2)
    r2.get = async (key) => (requested.push(key), get(key))
    const names = [
      '2026-11-14.csv',
      '../raw/2026/11/detour-raw-2026-11-14.csv.gz',
      'raw/2026/11/detour-raw-2026-11-14.csv.gz',
      '2026-11-14.csv.gz',
      '2026-11-14.csv/../../raw',
      '%2e%2e%2fraw%2f2026-11-14.csv',
    ]
    for (const name of names) {
      const res = await dailyExportResponse(new Request(`${SITE}/api/export/x`), r2.asBucket(), SITE, name)
      expect(res?.status ?? 404).not.toBe(500)
    }
    expect(requested.length).toBeGreaterThan(0)
    expect(requested.every((k) => !k.startsWith(ARCHIVE_PREFIX))).toBe(true)
  })

  it('only the cron imports the archive module, and no route or page mentions the raw/ prefix', () => {
    const src = fileURLToPath(new URL('..', import.meta.url))
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('routeTree.gen.ts')) files.push(p)
      }
    }
    walk(src)
    const importers = files.filter((f) => /from '(?:\.\/|#\/server\/)archive'/.test(readFileSync(f, 'utf8')))
    expect(importers.map((f) => f.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/'))).toEqual(['src/server/cron.ts'])
    const mentions = files.filter((f) => !/[\\/]server[\\/]archive\.ts$/.test(f) && /['"`]raw\//.test(readFileSync(f, 'utf8')))
    expect(mentions).toEqual([])
  })
})
