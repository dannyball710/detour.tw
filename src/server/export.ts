import { getColo } from '#/data/colos'
import { getIsp, OTHER_ISP_KEY } from '#/data/isps'
import { median } from '#/lib/geo'
import { conditional, edgeCached, error } from './http'
import { taipeiDay } from './token'

// Public download = daily aggregates only, never per-test rows (owner decision).
export const EXPORT_HEADER =
  'date,isp,isp_name_en,landing_colo,landing_city,landing_country,tests,share_of_isp_day,' +
  'median_rtt_ms,median_ref_rtt_ms,median_extra_ms'
// Small-cell protection: a (date, isp, colo) cell with fewer tests is folded into OTHER, so one
// person's test cannot be singled out; OTHER itself shows no medians while it is below this size.
export const MIN_CELL = 3
export const OTHER_COLO = 'OTHER'
const PAGE = 5000

/** CSV cell with formula-injection protection: spreadsheet apps execute cells starting with = + - @. */
export function csvCell(v: string | number | null): string {
  if (v == null) return ''
  if (typeof v === 'number') return String(v)
  let s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

interface Cell {
  rtt: number[]
  ref: number[]
  extra: number[]
}

const newCell = (): Cell => ({ rtt: [], ref: [], extra: [] })
const roundedMedian = (v: number[]) => (v.length ? Math.round(median(v)!) : null)

/** CSV lines for one day: isp -> colo -> cell. Sorted by isp, then tests desc (colo as tie-break). */
export function dayLines(day: string, isps: Map<string, Map<string, Cell>>): string[] {
  const lines: string[] = []
  for (const isp of [...isps.keys()].sort()) {
    const colos = isps.get(isp)!
    const other = newCell()
    const cells: [string, Cell][] = []
    let total = 0
    for (const [colo, c] of colos) {
      total += c.rtt.length
      if (c.rtt.length >= MIN_CELL) cells.push([colo, c])
      else {
        other.rtt.push(...c.rtt)
        other.ref.push(...c.ref)
        other.extra.push(...c.extra)
      }
    }
    if (other.rtt.length) cells.push([OTHER_COLO, other])
    cells.sort((a, b) => b[1].rtt.length - a[1].rtt.length || a[0].localeCompare(b[0]))
    const name = getIsp(isp)?.en ?? (isp === OTHER_ISP_KEY ? 'Other / unmapped network' : isp)
    for (const [colo, c] of cells) {
      const n = c.rtt.length
      const suppressed = n < MIN_CELL
      const info = getColo(colo)
      lines.push(
        [
          day,
          isp,
          name,
          colo,
          info?.en ?? null,
          info?.cc ?? null,
          n,
          (n / total).toFixed(4),
          suppressed ? null : roundedMedian(c.rtt),
          suppressed ? null : roundedMedian(c.ref),
          suppressed ? null : roundedMedian(c.extra),
        ]
          .map(csvCell)
          .join(','),
      )
    }
  }
  return lines
}

interface TestRow {
  id: string
  created_at: number
  day: string
  isp_key: string | null
  colo: string
  rtt_ms: number
  ref_rtt_ms: number | null
}

/**
 * One ordered pass over counted tests (keyset on idx_tests_export). Rows arrive in created_at order,
 * so `day` is monotonic: memory holds one day's values, and medians are exact.
 */
export async function aggregateDays(
  db: D1Database,
  onDay: (day: string, lines: string[]) => void,
  pageSize = PAGE,
): Promise<void> {
  let cursor = { at: -1, id: '' }
  let day: string | null = null
  let isps = new Map<string, Map<string, Cell>>()
  for (;;) {
    const { results } = await db
      .prepare(
        `SELECT id, created_at, day, isp_key, colo, rtt_ms, ref_rtt_ms
        FROM tests WHERE counted = 1 AND created_at >= ?1 AND (created_at > ?1 OR id > ?2)
        ORDER BY created_at, id LIMIT ?3`,
      )
      .bind(cursor.at, cursor.id, pageSize)
      .all<TestRow>()
    for (const r of results) {
      if (r.day !== day) {
        if (day) onDay(day, dayLines(day, isps))
        day = r.day
        isps = new Map()
      }
      const isp = r.isp_key ?? OTHER_ISP_KEY
      let colos = isps.get(isp)
      if (!colos) isps.set(isp, (colos = new Map()))
      let cell = colos.get(r.colo)
      if (!cell) colos.set(r.colo, (cell = newCell()))
      cell.rtt.push(r.rtt_ms)
      if (r.ref_rtt_ms != null) {
        cell.ref.push(r.ref_rtt_ms)
        cell.extra.push(r.rtt_ms - r.ref_rtt_ms)
      }
    }
    if (results.length) {
      const last = results[results.length - 1]
      cursor = { at: last.created_at, id: last.id }
    }
    if (results.length < pageSize) break
  }
  if (day) onDay(day, dayLines(day, isps))
}

export const EXPORT_KEY = 'detour-daily.csv'
export const dailyExportKey = (day: string) => `daily/detour-daily-${day}.csv`
const CSV_TYPE = 'text/csv; charset=utf-8'
const DAY_MS = 86_400_000

const csvBody = (lines: string[]) => [EXPORT_HEADER, ...lines].join('\n') + '\n'

/**
 * Cron (hourly): rewrite the all-days aggregate in R2. The aggregate is small (one line per
 * date x isp x colo cell with >= 3 tests), so it is built in memory and written with a single put.
 * The first run of each Taipei day also writes the previous day's rows as an immutable dated file.
 */
export async function buildExport(
  db: D1Database,
  bucket: R2Bucket,
  now: number,
  opts: { pageSize?: number } = {},
): Promise<{ bytes: number; daily: string | null }> {
  const yesterday = taipeiDay(now - DAY_MS)
  const wantDaily = !(await bucket.head(dailyExportKey(yesterday)))
  const all: string[] = []
  let yesterdayLines: string[] = []
  await aggregateDays(
    db,
    (day, lines) => {
      all.push(...lines)
      if (day === yesterday) yesterdayLines = lines
    },
    opts.pageSize,
  )
  const options = {
    httpMetadata: { contentType: CSV_TYPE },
    customMetadata: { generatedAt: new Date(now).toISOString() },
  }
  const body = csvBody(all)
  await bucket.put(EXPORT_KEY, body, options)
  // Written even when nobody tested that day: a missing file would look like an outage.
  if (wantDaily) await bucket.put(dailyExportKey(yesterday), csvBody(yesterdayLines), options)
  return { bytes: new TextEncoder().encode(body).byteLength, daily: wantDaily ? yesterday : null }
}

export const CSV_CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400'
// Rebuilt hourly; the per-colo edge copy must not outlive that.
const EDGE_TTL_SECONDS = 3600
// Bumped when the file format changes, so no colo keeps serving an older format from its cache.
const CACHE_VERSION = 'daily-v1'

function r2Response(obj: R2ObjectBody, filename: string): Response {
  return new Response(obj.body, {
    headers: {
      'content-type': CSV_TYPE,
      'content-disposition': `attachment; filename="${filename}"`,
      etag: obj.httpEtag,
      'last-modified': obj.uploaded.toUTCString(),
      'x-data-generated-at': obj.customMetadata?.generatedAt ?? obj.uploaded.toISOString(),
    },
  })
}

const notFound = () => new Response(null, { status: 404 })
// Misses are cached briefly so a public URL cannot be used to hammer R2.
const MISS_TTL_SECONDS = 300

/**
 * Edge cache -> R2 object built by cron. Before the first cron run there is no file: 503 rather than
 * scanning D1 on request, which a public URL would let anyone repeat.
 */
export async function exportResponse(request: Request, bucket: R2Bucket, siteUrl: string): Promise<Response> {
  const res = await edgeCached(
    `${siteUrl}/api/export.csv?v=${CACHE_VERSION}`,
    (r) => (r.ok ? EDGE_TTL_SECONDS : MISS_TTL_SECONDS),
    async () => {
      const obj = await bucket.get(EXPORT_KEY)
      return obj ? r2Response(obj, 'detour-daily.csv') : notFound()
    },
  )
  if (res.ok) return conditional(request, res, CSV_CACHE_CONTROL)
  void res.body?.cancel()
  const unavailable = error(503, 'export_not_ready')
  unavailable.headers.set('retry-after', String(MISS_TTL_SECONDS))
  return unavailable
}

const DAILY_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.csv$/

/** One day's aggregate rows; never changes once written. Null when the name is invalid or no file exists. */
export async function dailyExportResponse(
  request: Request,
  bucket: R2Bucket,
  siteUrl: string,
  file: string,
): Promise<Response | null> {
  const day = DAILY_FILE_RE.exec(file)?.[1]
  if (!day) return null
  const res = await edgeCached(
    `${siteUrl}/api/export/${day}.csv?v=${CACHE_VERSION}`,
    (r) => (r.ok ? 86_400 : MISS_TTL_SECONDS),
    async () => {
      const obj = await bucket.get(dailyExportKey(day))
      return obj ? r2Response(obj, `detour-daily-${day}.csv`) : notFound()
    },
  )
  if (!res.ok) {
    void res.body?.cancel()
    return null
  }
  return conditional(request, res, 'public, max-age=31536000, immutable')
}
