import { getColo } from '#/data/colos'
import { getIsp } from '#/data/isps'
import { TW_REGIONS } from '#/data/tw-regions'
import type { Lang } from '#/lib/types'
import { en } from './en'
import { zh } from './zh'
import type { Dict } from './zh'

export type { Dict }

export const SITE_URL = 'https://detour.tw'

export function getDict(lang: Lang): Dict {
  return lang === 'en' ? en : zh
}

export function langFromPath(pathname: string): Lang {
  return pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'zh'
}

/** Path of the same page in the given language, e.g. ('/stats', 'en') → '/en/stats'. */
export function pathFor(pathname: string, lang: Lang): string {
  const stripped = langFromPath(pathname) === 'en' ? pathname.replace(/^\/en(?=\/|$)/, '') || '/' : pathname
  // A path starting with "//" is a link to another host: '/en//evil.example' must not become one.
  const base = stripped.replace(/^\/{2,}/, '/')
  if (lang === 'zh') return base
  return base === '/' ? '/en' : `/en${base}`
}

const displayNames = new Map<Lang, Intl.DisplayNames | null>()

export function countryName(cc: string | null | undefined, lang: Lang): string {
  if (!cc) return lang === 'en' ? 'Unknown' : '不明'
  if (!displayNames.has(lang)) {
    try {
      displayNames.set(lang, new Intl.DisplayNames([lang === 'en' ? 'en' : 'zh-Hant-TW'], { type: 'region' }))
    } catch {
      displayNames.set(lang, null)
    }
  }
  try {
    return displayNames.get(lang)?.of(cc) ?? cc
  } catch {
    return cc
  }
}

/** City only, e.g. 「洛杉磯」 / "Los Angeles"; unknown colo → the code itself. */
export function coloCity(iata: string, lang: Lang): string {
  const c = getColo(iata)
  if (!c) return iata
  return lang === 'en' ? c.en : c.zh
}

/** 「洛杉磯（LAX）」 / "Los Angeles (LAX)"; unknown colo → 「XYZ（未知位置）」. */
export function coloLabel(iata: string, lang: Lang): string {
  const c = getColo(iata)
  const dict = getDict(lang)
  if (!c) return lang === 'en' ? `${iata} (${dict.unknownColo})` : `${iata}（${dict.unknownColo}）`
  return lang === 'en' ? `${c.en} (${iata})` : `${c.zh}（${iata}）`
}

export function ispName(
  isp: { key: string; asn: number | null; asOrganization: string | null },
  lang: Lang,
): string {
  const known = getIsp(isp.key)
  if (known) return lang === 'en' ? known.en : known.zh
  const parts = [isp.asOrganization, isp.asn != null ? `AS${isp.asn}` : null].filter(Boolean)
  return parts.length ? parts.join(' · ') : lang === 'en' ? 'Unknown network' : '不明網路'
}

export function ispKeyName(key: string, lang: Lang): string {
  const known = getIsp(key)
  if (known) return lang === 'en' ? known.en : known.zh
  if (key === 'other') return lang === 'en' ? 'Other Taiwanese networks' : '其他台灣網路'
  return key
}

export function regionName(code: string | null, raw: string | null, lang: Lang): string | null {
  const r = code ? TW_REGIONS[code] : undefined
  if (r) return lang === 'en' ? r.en : r.zh
  return raw
}

export function fmtNum(v: number, lang: Lang): string {
  return v.toLocaleString(lang === 'en' ? 'en-US' : 'zh-TW')
}

export function fmtPct(share: number): number {
  return Math.round(share * 100)
}

/** Date in Taiwan time, independent of the server's or the viewer's zone so SSR and hydration agree. */
export function fmtDate(ms: number, lang: Lang, withTime = false): string {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: lang === 'en' ? 'short' : 'numeric',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(new Date(ms))
}
