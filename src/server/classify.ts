import { getColo } from '#/data/colos'
import { isHostingAsn, ispForAsn, OTHER_ISP_KEY } from '#/data/isps'
import { distanceToColoKm, lightForLanding, minPhysicalRttMs } from '#/lib/geo'
import type { Category, Light, SubmitRequest, TestResult } from '#/lib/types'
import { COUNTY_SEATS, deriveCounty } from './county'

/** What the server itself knows about the request (authoritative, from request.cf). */
export interface ServerView {
  ip: string
  colo: string | null
  country: string | null
  /** For Taiwan: the derived county (TW_REGIONS key) or null; elsewhere Cloudflare's subdivision code. */
  regionCode: string | null
  region: string | null
  /**
   * Raw geo-IP coordinates: used by the rtt-physics check only, never stored or returned. Public
   * distances are derived from publicCoords — exact distances from this point would allow triangulation.
   */
  lat: number | null
  lon: number | null
  asn: number | null
  asOrganization: string | null
  /** Server-side TCP/QUIC handshake RTT in ms, when Cloudflare reports one. */
  rtt: number | null
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null
}

export function serverViewFromCf(ip: string, cf: IncomingRequestCfProperties | undefined): ServerView {
  const raw = (cf ?? {}) as Record<string, unknown>
  const lat = num(raw.latitude)
  const lon = num(raw.longitude)
  const rtt = num(raw.clientTcpRtt) || num(raw.clientQuicRtt)
  const rawCountry = str(raw.country, 2)
  const country = rawCountry && /^[A-Z0-9]{2}$/.test(rawCountry) ? rawCountry : null
  const rawRegion = str(raw.regionCode, 8)
  const regionCode = rawRegion && /^[A-Z0-9]{1,3}$/.test(rawRegion) ? rawRegion : null
  return {
    ip,
    colo: str(raw.colo, 3),
    country,
    regionCode:
      country === 'TW' ? deriveCounty({ regionCode, city: str(raw.city, 64), lat, lon }) : regionCode,
    region: str(raw.region, 64),
    lat,
    lon,
    asn: num(raw.asn),
    asOrganization: str(raw.asOrganization, 128),
    rtt: rtt && rtt > 0 ? rtt : null,
  }
}

/**
 * The only coordinates we store or publish: never finer than a county. Taiwan gets its county seat
 * (or nothing); elsewhere whole degrees (~100 km).
 */
export function publicCoords(view: ServerView): { lat: number | null; lon: number | null } {
  if (view.country === 'TW') {
    const seat = view.regionCode ? COUNTY_SEATS[view.regionCode] : undefined
    return seat ? { lat: seat.lat, lon: seat.lon } : { lat: null, lon: null }
  }
  if (view.lat == null || view.lon == null) return { lat: null, lon: null }
  // `+ 0` turns -0 into 0.
  return { lat: Math.round(view.lat) + 0, lon: Math.round(view.lon) + 0 }
}

/** Public description of the visitor. /api/start and stored results both derive from this, so they cannot disagree. */
export function visitorOf(view: ServerView): Pick<TestResult, 'user' | 'isp'> {
  return {
    user: { country: view.country, regionCode: view.regionCode, region: view.region, ...publicCoords(view) },
    isp: { key: ispForAsn(view.asn)?.key ?? OTHER_ISP_KEY, asn: view.asn, asOrganization: view.asOrganization },
  }
}

const TAIPEI_TZ = 'Asia/Taipei'
// Cloudflare reports Tor exit traffic with the pseudo-country T1.
const TOR_COUNTRY = 'T1'

export function classify(input: {
  asn: number | null
  country: string | null
  tz: string
  ref: SubmitRequest['ref']
  landingColo: string
}): { category: Category; light: Light } {
  const { asn, country, tz, ref } = input
  const warp = ref?.warp === 'on' || ref?.warp === 'plus'
  if (isHostingAsn(asn) || warp || ref?.gateway === 'on' || country === TOR_COUNTRY) {
    return { category: 'vpn', light: 'gray' }
  }
  if (country !== 'TW') {
    return { category: tz === TAIPEI_TZ ? 'foreign-sim' : 'intl', light: 'blue' }
  }
  const light = lightForLanding(input.landingColo)
  return { category: tz === TAIPEI_TZ ? 'tw' : 'roaming', light }
}

function ipFamily(ip: string): 4 | 6 {
  return ip.includes(':') ? 6 : 4
}

/**
 * Anti-abuse checks that do not reject the test but keep it out of the statistics.
 * `skipRefIdentity` is only set in local dev, where the reference trace sees our real public IP
 * while the dev server sees loopback.
 */
export function softFlags(input: {
  view: ServerView
  now: number
  ownColo: string
  ownMedian: number
  ref: SubmitRequest['ref']
  refMedian: number | null
  skipRefIdentity?: boolean
}): string[] {
  const { view, ref, ownMedian, refMedian } = input
  const flags: string[] = []

  // A colo missing from COLOS (e.g. newly opened) cannot be placed: its light would default to red.
  if (!getColo(input.ownColo)) flags.push('own-colo')

  const ownKm = distanceToColoKm(view.lat, view.lon, input.ownColo)
  const refKm = ref ? distanceToColoKm(view.lat, view.lon, ref.colo) : null
  const tooFast = (median: number | null, km: number | null) =>
    median != null && km != null && median < minPhysicalRttMs(km) * 0.9
  if (tooFast(ownMedian, ownKm) || tooFast(refMedian, refKm)) flags.push('rtt-physics')

  // Band around the handshake RTT we observed ourselves. The upper side is wide because honest
  // measurements do spike (Wi-Fi power save, mobile radio wake-up); it only catches gross inflation.
  if (view.rtt != null && (ownMedian > 5 * view.rtt + 150 || ownMedian < view.rtt / 3 - 10)) {
    flags.push('rtt-server')
  }

  if (ref) {
    if (!input.skipRefIdentity) {
      const refIp = ref.ip.toLowerCase()
      const ip = view.ip.toLowerCase()
      if (ipFamily(refIp) === ipFamily(ip) && refIp !== ip) flags.push('ref-ip')
    }
    if (Math.abs(ref.ts - input.now / 1000) > 180) flags.push('ref-ts')
    if (!input.skipRefIdentity && view.country != null && ref.loc !== view.country) flags.push('ref-loc')
    if (!getColo(ref.colo)) flags.push('ref-colo')
  }
  return flags
}
