import { env } from 'cloudflare:workers'
import { COLOS, getColo } from '#/data/colos'
import { TW_REGIONS } from '#/data/tw-regions'
import { median } from '#/lib/geo'
import type { IspStats, StatsResponse } from '#/lib/types'
import { conditional, edgeCached } from './http'
import { sha256Hex, taipeiDay } from './token'

export const WINDOW_DAYS = 30
// Medians are computed in JS (D1 has no median); cap the rows we pull so a viral week cannot blow the Worker's memory.
const MEDIAN_SAMPLE = 50_000
// The snapshot is rebuilt every 5 minutes by cron; the per-colo edge copy must not outlive that.
const EDGE_TTL_SECONDS = 300
export const STATS_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
// Bump on any StatsResponse shape change: the snapshot row and the edge copies are keyed by it, so no
// stale shape is served after a deploy (the new key starts empty and is computed once).
const SNAPSHOT_KEY = 'stats-v2'

const TW_COLOS = new Set(Object.values(COLOS).filter((c) => c.cc === 'TW').map((c) => c.iata))
const isDomestic = (iata: string) => TW_COLOS.has(iata)
const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0)
const roundOrNull = (n: number | null) => (n == null ? null : Math.round(n))

interface IspColoRow {
  isp_key: string
  colo: string
  n: number
  green: number
  yellow: number
  red: number
}

// Systematic sample over the whole window (every k-th row by insertion order), so medians cover the
// same 30 days and the same ISP mix as the counts, whatever the volume. `where` is a constant string.
const strideSql = (where: string) => `SELECT COUNT(*) / ${MEDIAN_SAMPLE} + 1 FROM tests WHERE ${where}`

export async function computeStats(db: D1Database, now: number): Promise<StatsResponse> {
  const today = taipeiDay(now)
  const since = taipeiDay(now - (WINDOW_DAYS - 1) * 86_400_000)

  const [totalsRes, ispColoRes, trendRes, regionRes, rttRes, intlRes] = await db.batch([
    db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM tests WHERE counted = 1 AND day >= ?1) AS counted,
          (SELECT COUNT(*) FROM tests WHERE counted = 1 AND day = ?2) AS today,
          (SELECT COUNT(*) FROM tests WHERE counted = 1) AS allTime`,
      )
      .bind(since, today),
    db
      .prepare(
        `SELECT isp_key, colo, COUNT(*) AS n,
          SUM(light = 'green') AS green, SUM(light = 'yellow') AS yellow, SUM(light = 'red') AS red
        FROM tests WHERE counted = 1 AND day >= ? GROUP BY isp_key, colo`,
      )
      .bind(since),
    db
      .prepare(
        `SELECT day, isp_key, light, COUNT(*) AS n FROM tests
        WHERE counted = 1 AND day >= ? GROUP BY day, isp_key, light`,
      )
      .bind(since),
    db
      .prepare(
        `SELECT region_code, colo, COUNT(*) AS n FROM tests
        WHERE counted = 1 AND day >= ? AND region_code IS NOT NULL GROUP BY region_code, colo`,
      )
      .bind(since),
    db
      .prepare(
        `SELECT isp_key, rtt_ms, ref_rtt_ms FROM tests
        WHERE counted = 1 AND day >= ?1 AND rowid % (${strideSql('counted = 1 AND day >= ?1')}) = 0
        LIMIT ${MEDIAN_SAMPLE}`,
      )
      .bind(since),
    db
      .prepare(
        `SELECT country, colo, distance_km FROM tests
        WHERE baseline = 1 AND day >= ?1 AND country IS NOT NULL
          AND rowid % (${strideSql('baseline = 1 AND day >= ?1 AND country IS NOT NULL')}) = 0
        LIMIT ${MEDIAN_SAMPLE}`,
      )
      .bind(since),
  ])

  const totals = (totalsRes.results[0] ?? { counted: 0, today: 0, allTime: 0 }) as StatsResponse['totals']

  const isps = new Map<string, { n: number; dom: number; green: number; yellow: number; red: number; us: number; colos: Map<string, number> }>()
  for (const r of ispColoRes.results as unknown as IspColoRow[]) {
    let s = isps.get(r.isp_key)
    if (!s) isps.set(r.isp_key, (s = { n: 0, dom: 0, green: 0, yellow: 0, red: 0, us: 0, colos: new Map() }))
    s.n += r.n
    s.green += r.green
    s.yellow += r.yellow
    s.red += r.red
    if (isDomestic(r.colo)) s.dom += r.n
    if (getColo(r.colo)?.cc === 'US') s.us += r.n
    s.colos.set(r.colo, (s.colos.get(r.colo) ?? 0) + r.n)
  }

  const rtts = new Map<string, { own: number[]; ref: number[]; extra: number[] }>()
  for (const r of rttRes.results as unknown as { isp_key: string; rtt_ms: number; ref_rtt_ms: number | null }[]) {
    let s = rtts.get(r.isp_key)
    if (!s) rtts.set(r.isp_key, (s = { own: [], ref: [], extra: [] }))
    s.own.push(r.rtt_ms)
    if (r.ref_rtt_ms != null) {
      s.ref.push(r.ref_rtt_ms)
      s.extra.push(r.rtt_ms - r.ref_rtt_ms)
    }
  }

  const ispStats: IspStats[] = [...isps.entries()]
    .map(([key, s]) => {
      const r = rtts.get(key)
      return {
        key,
        n: s.n,
        domestic: share(s.dom, s.n),
        lights: { green: share(s.green, s.n), yellow: share(s.yellow, s.n), red: share(s.red, s.n) },
        medianRtt: roundOrNull(median(r?.own ?? [])),
        medianRefRtt: roundOrNull(median(r?.ref ?? [])),
        medianExtraMs: roundOrNull(median(r?.extra ?? [])),
        colos: [...s.colos.entries()].map(([iata, n]) => ({ iata, n })).sort((a, b) => b.n - a.n || a.iata.localeCompare(b.iata)),
      }
    })
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))

  // Counted rows are category `tw`, whose light is always green / yellow / red, so the shares sum to 1.
  const trend = new Map<string, { day: string; isp: string; n: number; green: number; yellow: number; red: number }>()
  for (const r of trendRes.results as unknown as { day: string; isp_key: string; light: string; n: number }[]) {
    const k = `${r.day}|${r.isp_key}`
    let t = trend.get(k)
    if (!t) trend.set(k, (t = { day: r.day, isp: r.isp_key, n: 0, green: 0, yellow: 0, red: 0 }))
    t.n += r.n
    if (r.light === 'green' || r.light === 'yellow' || r.light === 'red') t[r.light] += r.n
  }

  const regions = new Map<string, { n: number; abroad: number }>()
  for (const r of regionRes.results as unknown as { region_code: string; colo: string; n: number }[]) {
    if (!(r.region_code in TW_REGIONS)) continue
    let g = regions.get(r.region_code)
    if (!g) regions.set(r.region_code, (g = { n: 0, abroad: 0 }))
    g.n += r.n
    if (!isDomestic(r.colo)) g.abroad += r.n
  }

  const intl = new Map<string, { distances: number[]; colos: Map<string, number>; n: number }>()
  for (const r of intlRes.results as unknown as { country: string; colo: string; distance_km: number | null }[]) {
    let g = intl.get(r.country)
    if (!g) intl.set(r.country, (g = { distances: [], colos: new Map(), n: 0 }))
    g.n++
    if (r.distance_km != null) g.distances.push(r.distance_km)
    g.colos.set(r.colo, (g.colos.get(r.colo) ?? 0) + 1)
  }

  const cht = isps.get('cht')
  return {
    generatedAt: now,
    windowDays: WINDOW_DAYS,
    totals: { counted: totals.counted, today: totals.today, allTime: totals.allTime },
    isps: ispStats,
    trend: [...trend.values()]
      .map((t) => {
        const lights = { green: share(t.green, t.n), yellow: share(t.yellow, t.n), red: share(t.red, t.n) }
        return { day: t.day, isp: t.isp, n: t.n, domestic: lights.green, lights }
      })
      .sort((a, b) => a.day.localeCompare(b.day) || a.isp.localeCompare(b.isp)),
    // abroad is a share (0..1), like `domestic` elsewhere.
    regions: [...regions.entries()]
      .map(([code, g]) => ({ code, n: g.n, abroad: share(g.abroad, g.n) }))
      .sort((a, b) => b.n - a.n || a.code.localeCompare(b.code)),
    intl: [...intl.entries()]
      .map(([country, g]) => ({
        country,
        n: g.n,
        medianDistanceKm: roundOrNull(median(g.distances)),
        topColo: [...g.colos.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null,
      }))
      .sort((a, b) => b.n - a.n || a.country.localeCompare(b.country)),
    chtUsShare: cht && cht.n > 0 ? cht.us / cht.n : null,
  }
}

export interface Snapshot {
  body: string
  etag: string
  generated_at: number
}

/** Cron (every 5 min): aggregate once, store the serialised payload. */
export async function refreshStatsSnapshot(db: D1Database, now: number): Promise<Snapshot> {
  const body = JSON.stringify(await computeStats(db, now))
  const snap: Snapshot = { body, etag: `"${(await sha256Hex(body)).slice(0, 32)}"`, generated_at: now }
  await db
    .prepare(
      `INSERT INTO snapshots (key, body, etag, generated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (key) DO UPDATE SET body = excluded.body, etag = excluded.etag, generated_at = excluded.generated_at`,
    )
    .bind(SNAPSHOT_KEY, snap.body, snap.etag, snap.generated_at)
    .run()
  return snap
}

/** A single primary-key read; aggregates only if no snapshot exists yet (fresh deploy before the first cron). */
export async function loadStatsSnapshot(db: D1Database, now: number): Promise<Snapshot> {
  const row = await db
    .prepare('SELECT body, etag, generated_at FROM snapshots WHERE key = ?')
    .bind(SNAPSHOT_KEY)
    .first<Snapshot>()
  return row ?? refreshStatsSnapshot(db, now)
}

/** Edge cache (fixed key, so it cannot be busted) -> snapshot row -> compute once. */
function cachedStats(db: D1Database, siteUrl: string): Promise<Response> {
  return edgeCached(`${siteUrl}/api/stats?v=${SNAPSHOT_KEY}`, EDGE_TTL_SECONDS, async () => {
    const s = await loadStatsSnapshot(db, Date.now())
    return new Response(s.body, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        etag: s.etag,
        'last-modified': new Date(s.generated_at).toUTCString(),
      },
    })
  })
}

export async function statsResponse(request: Request, db: D1Database, siteUrl: string): Promise<Response> {
  return conditional(request, await cachedStats(db, siteUrl), STATS_CACHE_CONTROL)
}

/** Same data path as /api/stats, for the pages' server functions. */
export async function getStats(): Promise<StatsResponse> {
  return (await cachedStats(env.DB, env.SITE_URL)).json()
}
