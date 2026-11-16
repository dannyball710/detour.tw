import type { MeasureErrorKind } from '#/client/measure'
import { getColo } from '#/data/colos'
import { coloCity, countryName, fmtDate, fmtNum, getDict, regionName } from '#/i18n'
import { kmFigure } from '#/lib/format'
import { haversineKm, isTaiwanColo } from '#/lib/geo'
import type { Lang, StatsResponse, TestResult } from '#/lib/types'
import { MIN_SAMPLE } from './StatsSummary'
import type { LampKind } from './icons'
import { TAIPEI } from './map/RouteMap'
import type { LatLon } from './map/geometry'

export type Visitor = TestResult['user']

export type TestState =
  | {
      phase: 'measuring'
      step: 0 | 1 | 2
      /** Landing colo, once the first response names it. */
      colo: string | null
      /** Who the server sees, known as soon as the test has started. */
      user: Visitor | null
      isp: TestResult['isp'] | null
    }
  | { phase: 'done'; result: TestResult }
  | { phase: 'error'; kind: MeasureErrorKind }

export function isDetour(r: TestResult): boolean {
  return r.light === 'yellow' || r.light === 'red'
}

/** Rounded, never-negative extra latency for display (the API may return negative values). */
export function displayExtraMs(r: TestResult): number | null {
  return r.extraMs == null ? null : Math.max(0, Math.round(r.extraMs))
}

/**
 * Extra distance of a detour. Without a measured baseline it is estimated against Taipei from
 * the visitor's published point; null when the visitor cannot be placed (the total distance
 * to the landing is not "extra" and must not be called so).
 */
export function detourKm(r: TestResult): number | null {
  if (r.extraKm != null) return r.extraKm
  const tpe = getColo('TPE')
  if (r.landing.distanceKm == null || r.user.lat == null || r.user.lon == null || !tpe) return null
  return Math.max(0, Math.round(r.landing.distanceKm - haversineKm(r.user.lat, r.user.lon, tpe.lat, tpe.lon)))
}

/**
 * Share of Chunghwa Telecom tests landing in the US, for the overseas card. Null unless the
 * sample is big enough to quote: a percentage of a handful of tests would read as a finding.
 */
export function chtUsShareOf(stats: StatsResponse | null): number | null {
  const cht = stats?.isps.find((i) => i.key === 'cht')
  if (!stats || !cht || cht.n < MIN_SAMPLE) return null
  return stats.chtUsShare
}

/** `shared`: someone else's result, opened from its link, told in the third person. */
export function verdict(r: TestResult, lang: Lang, chtUsShare: number | null, shared = false): { title: string; sub: string } {
  const card = getDict(lang).card
  const t = shared ? card.shared : card
  const city = coloCity(r.landing.iata, lang)
  const km = detourKm(r)
  const ms = displayExtraMs(r)
  switch (r.light) {
    case 'green':
      return { title: t.title.green(city), sub: t.sub.green(Math.round(r.landing.rttMs)) }
    case 'yellow':
      return { title: t.title.yellow(city), sub: t.sub.yellow(km, ms) }
    case 'red':
      return { title: t.title.red(city), sub: t.sub.red(km, ms) }
    case 'gray':
      return { title: t.title.gray(), sub: t.sub.gray }
    case 'blue':
      return {
        title: t.title.blue(city, countryName(r.user.country, lang)),
        sub: t.sub.blue(chtUsShare == null ? null : Math.round(chtUsShare * 100)),
      }
  }
}

/** Status light, headline and sentence for any state of the test. */
export function headline(
  state: TestState,
  lang: Lang,
  chtUsShare: number | null,
  shared = false,
): { lamp: LampKind; status: string; title: string; sub: string } {
  const t = getDict(lang)
  if (state.phase === 'done') {
    return { lamp: state.result.light, status: t.status[state.result.light], ...verdict(state.result, lang, chtUsShare, shared) }
  }
  if (state.phase === 'error') return { lamp: 'error', status: t.status.error, title: t.measure[state.kind], sub: '' }
  return { lamp: 'pending', status: t.status.pending, title: t.measure.steps[state.step], sub: t.measure.hint }
}

/**
 * The "from" end of the pass. Taiwan's ISO 3166-2 county codes are three letters, like the
 * airport codes at the other end; elsewhere the country code stands in.
 */
export function originOf(user: Visitor, lang: Lang): { code: string; name: string } {
  const t = getDict(lang)
  const { country, regionCode, region } = user
  if (country && country !== 'TW') return { code: country, name: countryName(country, lang) }
  const name = regionName(regionCode, region, lang)
  if (regionCode && name) return { code: regionCode, name }
  return { code: 'TWN', name: name ?? t.map.taiwan }
}

export function landingPlace(iata: string, lang: Lang): { city: string; country: string } {
  const colo = getColo(iata)
  return {
    city: coloCity(iata, lang),
    country: colo ? countryName(colo.cc, lang) : getDict(lang).unknownColo,
  }
}

export interface Figure {
  label: string
  value: string
  unit: string
}

/** The two hero figures: distance first, then time. */
export function figuresOf(r: TestResult, lang: Lang): [Figure, Figure] {
  const t = getDict(lang).card
  const num = (v: number | null) => (v == null ? '—' : fmtNum(Math.round(v), lang))
  const kmNum = (v: number | null) => (v == null ? '—' : kmFigure(v))
  const rtt: Figure = { label: t.latency, value: num(r.landing.rttMs), unit: t.ms }
  const distance: Figure = { label: t.distanceLabel, value: kmNum(r.landing.distanceKm), unit: t.km }
  if (isDetour(r)) {
    const extra = displayExtraMs(r)
    return [distance, extra != null && extra > 0 ? { label: t.extraMsHero, value: `+${num(extra)}`, unit: t.ms } : rtt]
  }
  return [distance, rtt]
}

/**
 * Baseline cell of the stub: 台灣節點 TPE 8 毫秒 in Taiwan, 就近節點 NRT 12 毫秒 abroad, where
 * Taiwan has nothing to do with the visitor's route. Null when no baseline was measured.
 */
export function baselineOf(r: TestResult, lang: Lang): { label: string; value: string } | null {
  if (!r.ref) return null
  const t = getDict(lang).card
  let label = t.viaRef(r.ref.iata)
  if (r.user.country !== 'TW') label = t.nearest(r.ref.iata)
  else if (isTaiwanColo(r.ref.iata)) label = t.taiwanNode(r.ref.iata)
  return { label, value: `${fmtNum(Math.round(r.ref.rttMs), lang)} ${t.ms}` }
}

export interface StubCell {
  label: string
  value: string
}

/**
 * The two facts on the pass's stub, chosen per light so each says something the big figures do
 * not: a detour sets its latency against the Taiwan baseline; a result with no detour names
 * where it landed, then the baseline abroad or the time of the test. Always two, so the stub
 * keeps its shape.
 */
export function stubOf(r: TestResult, lang: Lang): [StubCell, StubCell] {
  const t = getDict(lang).card
  const landing = { label: t.landingDc, value: `${r.landing.iata} ${coloCity(r.landing.iata, lang)}` }
  const time = { label: t.testedAt, value: fmtDate(r.createdAt, lang, true) }
  const baseline = baselineOf(r, lang)
  if (isDetour(r)) return [{ label: t.latency, value: `${fmtNum(Math.round(r.landing.rttMs), lang)} ${t.ms}` }, baseline ?? time]
  // On green the Taiwan-node baseline is the result itself: it says nothing new.
  if (r.light === 'green') return [landing, time]
  return [landing, baseline ?? time]
}

/** The baseline label while the test runs, before it is known whether there is one. */
export function pendingBaselineLabel(user: Visitor | null, lang: Lang): string {
  const t = getDict(lang).card
  return user && user.country !== 'TW' ? t.nearest() : t.taiwanNode()
}

/** Why this test is shown but not counted, when the visitor should know. */
export function notesOf(r: TestResult, lang: Lang): string[] {
  const t = getDict(lang).card
  const notes: string[] = []
  if (r.category === 'roaming') notes.push(t.roaming)
  if (r.category === 'foreign-sim') notes.push(t.foreignSim)
  if (r.notCountedReason === 'suspicious') notes.push(t.suspicious)
  if (r.notCountedReason === 'opt-out') notes.push(t.optOut)
  if (r.notCountedReason === 'unstable-route') notes.push(t.unstableRoute)
  return notes
}

/** Taipei stands in when the visitor is in Taiwan but could not be placed more precisely. */
export function latLonOf(user: Visitor): LatLon | null {
  if (user.lat != null && user.lon != null) return { lat: user.lat, lon: user.lon }
  return user.country === 'TW' ? TAIPEI : null
}

/** A route with neither end in Taiwan is drawn on charts that do not feature the island. */
export function isAbroadRoute(user: Visitor, colo: string | null): boolean {
  return user.country !== 'TW' && !(colo && isTaiwanColo(colo))
}
