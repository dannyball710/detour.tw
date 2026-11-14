import { getColo } from '#/data/colos'
import type { Light } from './types'

const EARTH_RADIUS_KM = 6371

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

/** Distance from a point to a colo, or null when either side is unknown. */
export function distanceToColoKm(lat: number | null, lon: number | null, iata: string): number | null {
  const colo = getColo(iata)
  if (!colo || lat == null || lon == null) return null
  return Math.round(haversineKm(lat, lon, colo.lat, colo.lon))
}

export const TAIWAN_COLOS = ['TPE', 'KHH'] as const

export function isTaiwanColo(iata: string): boolean {
  return getColo(iata)?.cc === 'TW'
}

// Landing within this radius of Taipei counts as a "small detour" (HKG, NRT, KIX, ICN, MNL, SIN…).
export const NEARBY_RADIUS_KM = 4000
const TAIPEI = { lat: 25.0777, lon: 121.233 }

/** Light for a test from Taiwan on a Taiwanese network, based purely on the landing colo. */
export function lightForLanding(iata: string): Exclude<Light, 'gray' | 'blue'> {
  const colo = getColo(iata)
  if (!colo) return 'red'
  if (colo.cc === 'TW') return 'green'
  return haversineKm(TAIPEI.lat, TAIPEI.lon, colo.lat, colo.lon) <= NEARBY_RADIUS_KM ? 'yellow' : 'red'
}

// Light in fibre covers ~200 km per ms; a round trip needs twice the path.
// Real paths are longer than the great circle, so this is a hard lower bound.
export const FIBRE_KM_PER_MS = 200

export function minPhysicalRttMs(distanceKm: number): number {
  return (2 * distanceKm) / FIBRE_KM_PER_MS
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
