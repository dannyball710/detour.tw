import { distanceToColoKm, median } from '#/lib/geo'
import type { SubmitRequest, TestResult } from '#/lib/types'
import { classify, softFlags, visitorOf, type ServerView } from './classify'
import { ipKey } from './http'
import { rowToResult, type ResultRow } from './results'
import { dailyHash, ipHashForToken, randomId, taipeiDay, timingSafeEqual, verifyToken } from './token'
import { verifyTurnstile, type TurnstileConfig } from './turnstile'

export const MAX_BODY_BYTES = 8192
const MIN_TOKEN_AGE_MS = 2_000
const MAX_TOKEN_AGE_MS = 120_000
// Mobile CGNAT puts many people behind one IP, so an IP may count several times a day.
export const MAX_COUNTED_PER_IP_PER_DAY = 20

const COLO_RE = /^[A-Z]{3}$/
const DEVICE_RE = /^[A-Za-z0-9_-]{16,64}$/
const TZ_RE = /^[A-Za-z0-9_+\-/]{1,64}$/
const CONN_RE = /^[a-z0-9-]{1,16}$/
const LOC_RE = /^[A-Z0-9]{2}$/
const FLAG_RE = /^[a-z]{1,8}$/

function isRtts(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length >= 3 &&
    v.length <= 10 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 5000)
  )
}

/** Strict shape validation; returns a clean copy (unknown keys dropped) or null. */
export function parseSubmit(text: string): SubmitRequest | null {
  let b: any
  try {
    b = JSON.parse(text)
  } catch {
    return null
  }
  if (!b || typeof b !== 'object') return null
  if (typeof b.token !== 'string' || b.token.length > 512) return null
  if (!b.own || typeof b.own.colo !== 'string' || !COLO_RE.test(b.own.colo) || !isRtts(b.own.rtts)) return null
  if (typeof b.tz !== 'string' || !TZ_RE.test(b.tz)) return null
  if (typeof b.deviceId !== 'string' || !DEVICE_RE.test(b.deviceId)) return null
  if (typeof b.contribute !== 'boolean') return null
  if (!(b.conn === null || (typeof b.conn === 'string' && CONN_RE.test(b.conn)))) return null
  if (b.lang !== 'zh' && b.lang !== 'en') return null
  // Missing (older client) or null both mean "no Turnstile token": the test is shown but not stored.
  const turnstile = b.turnstile ?? null
  if (!(turnstile === null || (typeof turnstile === 'string' && turnstile.length <= 2048))) return null

  let ref: SubmitRequest['ref'] = null
  if (b.ref !== null) {
    const r = b.ref
    if (
      !r ||
      typeof r !== 'object' ||
      typeof r.colo !== 'string' ||
      !COLO_RE.test(r.colo) ||
      typeof r.ip !== 'string' ||
      !/^[0-9A-Fa-f.:]{2,45}$/.test(r.ip) ||
      typeof r.ts !== 'number' ||
      !Number.isFinite(r.ts) ||
      typeof r.loc !== 'string' ||
      !LOC_RE.test(r.loc) ||
      typeof r.warp !== 'string' ||
      !FLAG_RE.test(r.warp) ||
      typeof r.gateway !== 'string' ||
      !FLAG_RE.test(r.gateway) ||
      !isRtts(r.rtts)
    ) {
      return null
    }
    ref = { colo: r.colo, ip: r.ip, ts: r.ts, loc: r.loc, warp: r.warp, gateway: r.gateway, rtts: [...r.rtts] }
  }

  return {
    token: b.token,
    own: { colo: b.own.colo, rtts: [...b.own.rtts] },
    ref,
    tz: b.tz,
    deviceId: b.deviceId,
    contribute: b.contribute,
    conn: b.conn,
    lang: b.lang,
    turnstile,
  }
}

export interface Evaluation {
  row: ResultRow
  day: string
  tz: string
  conn: string | null
  serverRtt: number | null
  /** Taiwan statistics: passes everything except dedup, which needs the database. */
  eligible: boolean
  /** International baseline: same rules, its own dedup pool. */
  baselineEligible: boolean
}

/** Pure part of a submission: classification, soft checks and derived values. */
export function evaluate(body: SubmitRequest, view: ServerView, now: number, skipRefIdentity = false): Evaluation {
  const ownMedian = Math.round(median(body.own.rtts)!)
  const refMedian = body.ref ? Math.round(median(body.ref.rtts)!) : null
  const landing = body.own.colo
  const { category, light } = classify({
    asn: view.asn,
    country: view.country,
    tz: body.tz,
    ref: body.ref,
    landingColo: landing,
  })
  const flags = softFlags({
    view,
    now,
    ownColo: landing,
    ownMedian,
    ref: body.ref,
    refMedian,
    skipRefIdentity,
  })
  const { user, isp } = visitorOf(view)
  // Public distances come from the published (county-level) point: two exact distances to two known
  // colos would otherwise pinpoint the raw geo-IP location. Raw coords only feed the physics check.
  const distanceKm = distanceToColoKm(user.lat, user.lon, landing)
  const refKm = body.ref ? distanceToColoKm(user.lat, user.lon, body.ref.colo) : null
  const extraKm = distanceKm != null && refKm != null ? Math.max(0, distanceKm - refKm) : null

  const row: ResultRow = {
    id: '',
    created_at: now,
    colo: landing,
    country: user.country,
    region_code: user.regionCode,
    region: user.region,
    lat: user.lat,
    lon: user.lon,
    asn: isp.asn,
    as_org: isp.asOrganization,
    isp_key: isp.key,
    rtt_ms: ownMedian,
    ref_colo: body.ref?.colo ?? null,
    ref_rtt_ms: refMedian,
    ref_distance_km: refKm,
    light,
    category,
    distance_km: distanceKm,
    extra_km: extraKm,
    counted: 0,
    flags: flags.length ? flags.join(',') : null,
  }
  const clean = body.contribute && flags.length === 0
  // Cloudflare's "XX" means the country is unknown: useless as an international reference point.
  const knownCountry = view.country != null && view.country !== 'XX'
  return {
    row,
    day: taipeiDay(now),
    tz: body.tz,
    conn: body.conn,
    serverRtt: view.rtt == null ? null : Math.round(view.rtt),
    eligible: clean && category === 'tw',
    baselineEligible: clean && knownCountry && (category === 'intl' || category === 'foreign-sim'),
  }
}

export interface SubmitDeps {
  db: D1Database
  secret: string
  now: number
  /** Dev only: skip ref-ip / ref-loc because the dev server sees loopback, not our public IP. */
  skipRefIdentity?: boolean
  turnstile: TurnstileConfig
}

export type SubmitOutcome = { ok: true; result: TestResult } | { ok: false; status: number; error: string }

const fail = (status: number, error: string): SubmitOutcome => ({ ok: false, status, error })

// One device once a day, at most N per IP (/64 for IPv6) a day, within a pool (`counted` or `baseline`).
// INDEXED BY: otherwise SQLite may pick the (pool, day) index and scan the whole day's pool.
const dedup = (eligibleParam: string, pool: 'counted' | 'baseline') => `CASE WHEN ${eligibleParam} = 1
    AND NOT EXISTS (
      SELECT 1 FROM tests INDEXED BY idx_tests_device_day WHERE device_hash = ?26 AND day = ?3 AND ${pool} = 1
    )
    AND (SELECT COUNT(*) FROM (
      SELECT 1 FROM tests INDEXED BY idx_tests_ip_day WHERE ip_hash = ?25 AND day = ?3 AND ${pool} = 1
      LIMIT ${MAX_COUNTED_PER_IP_PER_DAY}
    )) < ${MAX_COUNTED_PER_IP_PER_DAY}
  THEN 1 ELSE 0 END`

// Dedup is decided inside the INSERT so two concurrent submits cannot both be counted.
const INSERT_SQL = `INSERT INTO tests (
  id, created_at, day, colo, country, region_code, region, lat, lon, asn, as_org, isp_key, server_rtt,
  rtt_ms, ref_colo, ref_rtt_ms, tz, conn, light, category, distance_km, extra_km, counted, flags,
  ip_hash, device_hash, baseline, ref_distance_km
) VALUES (
  ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22,
  ${dedup('?23', 'counted')},
  ?24, ?25, ?26,
  ${dedup('?27', 'baseline')},
  ?28
) RETURNING counted`

export async function processSubmit(body: SubmitRequest, view: ServerView, deps: SubmitDeps): Promise<SubmitOutcome> {
  const { db, secret, now } = deps
  const token = await verifyToken(secret, body.token)
  if (!token) return fail(400, 'invalid_token')
  const age = now - token.iat
  if (age < MIN_TOKEN_AGE_MS) return fail(400, 'too_fast')
  if (age > MAX_TOKEN_AGE_MS) return fail(400, 'token_expired')
  if (!timingSafeEqual(token.ip, await ipHashForToken(secret, ipKey(view.ip)))) return fail(400, 'ip_mismatch')
  // The browser can switch colo between /api/start and submit only in rare edge cases; anything else is fabricated.
  if (body.own.colo !== view.colo && body.own.colo !== token.colo) return fail(400, 'colo_mismatch')

  // Burn the nonce last among the hard checks, so it is only spent by an otherwise valid request. It is spent
  // even if Turnstile then fails: the nonces table is replay protection, not test data, and an unverified
  // submission must not be replayable either (each replay would cost a siteverify call).
  const nonce = await db
    .prepare('INSERT OR IGNORE INTO nonces (nonce, created_at) VALUES (?, ?)')
    .bind(token.nonce, now)
    .run()
  if (!nonce.meta.changes) return fail(409, 'replay')

  const ev = evaluate(body, view, now, deps.skipRefIdentity)
  const notStored = (reason: 'opt-out' | 'unverified'): SubmitOutcome => ({
    ok: true,
    result: { ...rowToResult(ev.row), id: null, counted: false, notCountedReason: reason },
  })

  // Same computation, nothing stored. Opt-out needs no human check, so siteverify is skipped.
  if (!body.contribute) return notStored('opt-out')
  // Owner rule: an unverified visitor still sees the full result, but nothing is written.
  if (!(await verifyTurnstile(deps.turnstile, body.turnstile, view.ip, token.nonce))) return notStored('unverified')

  const row = { ...ev.row, id: randomId() }
  const [ipHash, deviceHash] = await Promise.all([
    dailyHash(secret, ev.day, ipKey(view.ip)),
    dailyHash(secret, ev.day, body.deviceId),
  ])
  const inserted = await db
    .prepare(INSERT_SQL)
    .bind(
      row.id,
      row.created_at,
      ev.day,
      row.colo,
      row.country,
      row.region_code,
      row.region,
      row.lat,
      row.lon,
      row.asn,
      row.as_org,
      row.isp_key,
      ev.serverRtt,
      row.rtt_ms,
      row.ref_colo,
      row.ref_rtt_ms,
      ev.tz,
      ev.conn,
      row.light,
      row.category,
      row.distance_km,
      row.extra_km,
      ev.eligible ? 1 : 0,
      row.flags,
      ipHash,
      deviceHash,
      ev.baselineEligible ? 1 : 0,
      row.ref_distance_km,
    )
    .first<{ counted: number }>()
  return { ok: true, result: rowToResult({ ...row, counted: inserted?.counted ?? 0 }) }
}
