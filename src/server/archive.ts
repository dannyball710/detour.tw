import { csvCell } from './export'
import { taipeiDay } from './token'

// PRIVATE raw archive: one gzip CSV per Taipei day under raw/, so statistics can be re-derived later.
// No route reads this prefix (see archive.test.ts); it is never linked or published.
export const ARCHIVE_PREFIX = 'raw/'
export const archiveKey = (day: string) => `${ARCHIVE_PREFIX}${day.slice(0, 4)}/${day.slice(5, 7)}/detour-raw-${day}.csv.gz`

/**
 * Archived columns: everything needed to re-derive the statistics, minus anything that links a row to a
 * person or a public share link. Excluded: ip_hash, device_hash (re-identification across tests), id (joins
 * the row to its public /r/:id page) and the exact created_at (ms timestamps can be matched against ISP or
 * server logs) — `created_hour` keeps it to the hour.
 */
const COLUMNS = [
  'day',
  'created_hour',
  'colo',
  'country',
  'region_code',
  'region',
  'lat',
  'lon',
  'asn',
  'as_org',
  'isp_key',
  'server_rtt',
  'rtt_ms',
  'ref_colo',
  'ref_rtt_ms',
  'tz',
  'conn',
  'light',
  'category',
  'distance_km',
  'ref_distance_km',
  'extra_km',
  'counted',
  'baseline',
  'flags',
] as const

// Selected explicitly (never `*`) so new identifying columns cannot slip in.
const SELECT_SQL = `SELECT id, created_at, day, (created_at / 3600000) * 3600000 AS created_hour, colo, country,
  region_code, region, lat, lon, asn, as_org, isp_key, server_rtt, rtt_ms, ref_colo, ref_rtt_ms, tz, conn, light,
  category, distance_km, ref_distance_km, extra_km, counted, baseline, flags
  FROM tests WHERE created_at >= ?1 AND created_at < ?2 AND created_at >= ?3 AND (created_at > ?3 OR id > ?4)
  ORDER BY created_at, id LIMIT ?5`

const DAY_MS = 86_400_000
const TAIPEI_OFFSET_MS = 8 * 3600_000
const PAGE = 5000
// Backfill bound: at most this many days are written per hourly run.
const MAX_DAYS_PER_RUN = 7

/** Start of a Taipei calendar day in unix ms. */
const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`) - TAIPEI_OFFSET_MS

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

/** The day's rows as CSV (all categories, counted or not), keyset-paged over idx_tests_created. */
export async function dayCsv(db: D1Database, day: string, pageSize = PAGE): Promise<{ csv: string; rows: number }> {
  const start = dayStart(day)
  const lines: string[] = [COLUMNS.join(',')]
  let cursor = { at: -1, id: '' }
  for (;;) {
    const { results } = await db
      .prepare(SELECT_SQL)
      .bind(start, start + DAY_MS, cursor.at, cursor.id, pageSize)
      .all<Record<string, string | number | null>>()
    for (const r of results) lines.push(COLUMNS.map((c) => csvCell(r[c] ?? null)).join(','))
    if (results.length) {
      const last = results[results.length - 1]
      cursor = { at: last.created_at as number, id: last.id as string }
    }
    if (results.length < pageSize) break
  }
  return { csv: lines.join('\n') + '\n', rows: lines.length - 1 }
}

async function archivedKeys(bucket: R2Bucket): Promise<Set<string>> {
  const keys = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix: ARCHIVE_PREFIX, cursor })
    for (const o of page.objects) keys.add(o.key)
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return keys
}

/**
 * Cron (hourly): archive every finished Taipei day that has no archive yet, newest first, from the oldest
 * stored test up to yesterday; at most MAX_DAYS_PER_RUN per run. Existing objects are never rewritten.
 * A day without tests gets a header-only file, so it is not retried forever.
 */
export async function archiveDays(
  db: D1Database,
  bucket: R2Bucket,
  now: number,
  opts: { pageSize?: number; maxDays?: number } = {},
): Promise<string[]> {
  const oldest = await db.prepare('SELECT MIN(created_at) AS at FROM tests').first<{ at: number | null }>()
  if (oldest?.at == null) return []
  const firstDay = taipeiDay(oldest.at)
  const done = await archivedKeys(bucket)
  const written: string[] = []
  for (let t = now - DAY_MS; ; t -= DAY_MS) {
    const day = taipeiDay(t)
    if (day < firstDay || written.length >= (opts.maxDays ?? MAX_DAYS_PER_RUN)) break
    const key = archiveKey(day)
    if (done.has(key)) continue
    const { csv, rows } = await dayCsv(db, day, opts.pageSize)
    await bucket.put(key, await gzip(csv), {
      httpMetadata: { contentType: 'application/gzip' },
      customMetadata: { rows: String(rows), generatedAt: new Date(now).toISOString() },
    })
    written.push(day)
  }
  return written
}
