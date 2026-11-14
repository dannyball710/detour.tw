import { env } from 'cloudflare:workers'
import type { Category, Light, NotCountedReason, TestResult } from '#/lib/types'
import { edgeCached, error, json } from './http'

/** Columns of `tests` needed to rebuild a public TestResult (no hashes, flags are only read for the reason). */
export interface ResultRow {
  id: string
  created_at: number
  colo: string
  country: string | null
  region_code: string | null
  region: string | null
  lat: number | null
  lon: number | null
  asn: number | null
  as_org: string | null
  isp_key: string | null
  rtt_ms: number
  ref_colo: string | null
  ref_rtt_ms: number | null
  /** From the published (county-level) point, like distance_km. */
  ref_distance_km: number | null
  light: string
  category: string
  distance_km: number | null
  extra_km: number | null
  counted: number
  flags: string | null
}

export const RESULT_COLUMNS =
  'id, created_at, colo, country, region_code, region, lat, lon, asn, as_org, isp_key, rtt_ms, ' +
  'ref_colo, ref_rtt_ms, ref_distance_km, light, category, distance_km, extra_km, counted, flags'

function notCountedReason(row: ResultRow): NotCountedReason | null {
  if (row.category !== 'tw') return row.category as NotCountedReason
  if (row.flags) return 'suspicious'
  if (!row.counted) return 'duplicate'
  return null
}

/** Single source of truth for TestResult, used both by /api/submit and by stored-result reads. */
export function rowToResult(row: ResultRow): TestResult {
  const ref =
    row.ref_colo != null && row.ref_rtt_ms != null
      ? { iata: row.ref_colo, rttMs: row.ref_rtt_ms, distanceKm: row.ref_distance_km }
      : null
  return {
    id: row.id,
    createdAt: row.created_at,
    light: row.light as Light,
    category: row.category as Category,
    counted: row.counted === 1,
    notCountedReason: notCountedReason(row),
    user: {
      country: row.country,
      regionCode: row.region_code,
      region: row.region,
      lat: row.lat,
      lon: row.lon,
    },
    isp: { key: row.isp_key ?? 'other', asn: row.asn, asOrganization: row.as_org },
    landing: { iata: row.colo, rttMs: row.rtt_ms, distanceKm: row.distance_km },
    ref,
    extraKm: row.extra_km,
    extraMs: ref ? row.rtt_ms - ref.rttMs : null,
  }
}

export const RESULT_ID_RE = /^[a-z0-9]{10}$/

export async function findResult(db: D1Database, id: string): Promise<TestResult | null> {
  if (!RESULT_ID_RE.test(id)) return null
  const row = await db.prepare(`SELECT ${RESULT_COLUMNS} FROM tests WHERE id = ?`).bind(id).first<ResultRow>()
  return row ? rowToResult(row) : null
}

export function loadResult(id: string): Promise<TestResult | null> {
  return findResult(env.DB, id)
}

/**
 * /api/result/:id behind the edge cache. Stored results never change; misses are cached briefly so
 * repeated requests for the same missing id do not each hit D1 (random ids still do: a cheap PK read).
 */
export function resultResponse(db: D1Database, siteUrl: string, id: string): Promise<Response> {
  return edgeCached(
    `${siteUrl}/api/result/${id}`,
    (r) => (r.ok ? 300 : 60),
    async () => {
      const result = await findResult(db, id)
      return result ? json(result, { cache: 'public, max-age=300' }) : error(404, 'not_found')
    },
  )
}
