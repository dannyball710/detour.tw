import { getColo } from '#/data/colos'
import { getIsp } from '#/data/isps'
import { TW_REGIONS } from '#/data/tw-regions'
import { getDict } from '#/i18n'
import { kmFigure } from '#/lib/format'
import type { Lang, Light, TestResult } from '#/lib/types'

export interface Stat {
  label: string
  value: string
  unit: string
}

export interface Field {
  label: string
  value: string
}

/** Every string on the boarding pass, already localised. */
export interface CardCopy {
  light: Light
  /** Status word next to the light's icon, so the state never relies on colour alone. */
  status: string
  /** The result-card headline from the brief, city included. */
  verdict: string
  /** Extra line for cases the brief asks to explain (VPN, roaming). */
  note: string | null
  /** Taiwan county ISO code (TXG…), TWN when unknown, or the country code outside Taiwan. */
  origin: { code: string; name: string }
  landing: { code: string; name: string }
  stats: Stat[]
  /** Stub small print: network, where, date. */
  stub: Field[]
  cta: string
  site: string
}

const STATUS: Record<Light, Record<Lang, string>> = {
  green: { zh: '沒繞路', en: 'No detour' },
  yellow: { zh: '小繞一下', en: 'Small detour' },
  red: { zh: '出國了', en: 'Left Taiwan' },
  gray: { zh: '結果可能不準', en: 'May not be accurate' },
  blue: { zh: '海外連線', en: 'Abroad' },
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

function countryName(cc: string, lang: Lang): string {
  try {
    return new Intl.DisplayNames([lang === 'zh' ? 'zh-Hant-TW' : 'en'], { type: 'region' }).of(cc) ?? cc
  } catch {
    return cc
  }
}

/** Date of the test in Asia/Taipei, YYYY-MM-DD. */
export function taipeiDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date(ms))
}

// Cloudflare sometimes reports a province-level code for Taiwan (e.g. "04"), so only a known
// county code is shown; anything else falls back to the whole country.
function origin(r: TestResult, lang: Lang): CardCopy['origin'] {
  const { country, regionCode } = r.user
  if (country === 'TW') {
    const region = regionCode ? TW_REGIONS[regionCode] : undefined
    if (region && regionCode) return { code: regionCode, name: region[lang] }
    return { code: 'TWN', name: lang === 'zh' ? '台灣' : 'Taiwan' }
  }
  if (country == null) return { code: '—', name: lang === 'zh' ? '位置不明' : 'Unknown' }
  return { code: country, name: countryName(country, lang) }
}

function ispName(r: TestResult, lang: Lang): string {
  const isp = getIsp(r.isp.key)
  if (isp) return isp[lang]
  // Raw AS names are external input: drop control/format characters and lone surrogates (they
  // break the font request and the SVG) and cut by code point, never inside a surrogate pair.
  const chars = [...(r.isp.asOrganization ?? '').replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim()]
  if (chars.length === 0) return lang === 'zh' ? '其他網路' : 'Other network'
  // Long names ("… Co., Ltd.") keep the stub on one line.
  return chars.length > 26 ? `${chars.slice(0, 25).join('').trimEnd()}…` : chars.join('')
}

export function buildCopy(r: TestResult, lang: Lang): CardCopy {
  const zh = lang === 'zh'
  const colo = getColo(r.landing.iata)
  const city = colo ? colo[lang] : r.landing.iata
  const from = origin(r, lang)

  // Headlines match the result card's on the site.
  let verdict: string
  let note: string | null = null
  switch (r.light) {
    case 'green':
      verdict = zh ? `你的連線在${city}落地` : `Your connection landed in ${city}.`
      break
    case 'yellow':
      verdict = zh ? `小繞一下，你的連線去了${city}` : `A small detour — your connection went to ${city}.`
      break
    case 'red':
      verdict = zh ? `你的網路出國了：${city}` : `Your connection left the country: ${city}.`
      break
    case 'gray':
      verdict = zh ? '這次的結果可能不代表你家的網路' : 'This result may not reflect your home connection.'
      note = zh ? '偵測到 VPN 或公司網路，關掉後再測一次才準。' : 'Try again without a VPN.'
      break
    case 'blue': {
      const where = r.user.country ? from.name : zh ? '海外' : 'outside Taiwan'
      verdict = zh ? `你在${where}，連線在${city}落地` : `You're testing from ${where}; your connection landed in ${city}.`
      break
    }
  }
  // Same wording as the result card on the site (brief §例外狀況).
  if (r.category === 'roaming') note = getDict(lang).card.roaming
  if (r.category === 'foreign-sim') note = getDict(lang).card.foreignSim

  const stats: Stat[] = []
  const km = zh ? '公里' : 'km'
  const ms = zh ? '毫秒' : 'ms'
  // Measured, as on the site's card; never called an estimate.
  const latency = { label: zh ? '實測延遲' : 'MEASURED LATENCY', value: fmt(r.landing.rttMs), unit: ms }
  // The whole way to the landing data center, as on the site's card; the extra is in the headline's story.
  if (r.landing.distanceKm != null) {
    stats.push({ label: zh ? '連線走了' : 'DISTANCE', value: kmFigure(r.landing.distanceKm), unit: km })
  }
  if ((r.light === 'yellow' || r.light === 'red') && r.extraMs != null && r.extraMs > 0) {
    stats.push({ label: zh ? '每次來回多約' : 'EXTRA PER ROUND TRIP', value: `+${fmt(r.extraMs)}`, unit: ms })
  } else {
    stats.push(latency)
  }

  return {
    light: r.light,
    status: STATUS[r.light][lang],
    verdict,
    note,
    origin: from,
    landing: { code: r.landing.iata, name: city },
    stats,
    stub: [
      { label: zh ? '網路' : 'NETWORK', value: ispName(r, lang) },
      { label: zh ? '位置' : 'FROM', value: from.name },
      { label: zh ? '日期' : 'DATE', value: taipeiDate(r.createdAt) },
    ],
    cta: zh ? '測測你的連線' : 'Test your connection',
    site: 'detour.tw',
  }
}

// Glyphs any card may draw whatever the result: printable ASCII (digits, codes, English copy) and
// every fixed Chinese string. Always requesting them means the font subset — and its cache key —
// only varies with the truly variable names (city, country, ISP), so subsets are shared across cards.
const BASE_GLYPHS = [
  Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join(''),
  '—→…·，。：、（）',
  ...Object.values(STATUS).map((s) => s.zh),
  '沒繞路你的連線在落地小繞一下去了網路出國這次結果可能不代表家海外偵測到或公司關掉後再測才準',
  '多走距離每來回約實延遲公里毫秒位置日期其他不明灣測',
  getDict('zh').card.roaming,
  getDict('zh').card.foreignSim,
].join('')

/** Every string rendered on the card plus BASE_GLYPHS, used to subset the fonts. */
export function allText(c: CardCopy): string {
  return [
    BASE_GLYPHS,
    c.status,
    c.verdict,
    c.note ?? '',
    c.origin.code,
    c.origin.name,
    c.landing.code,
    c.landing.name,
    ...c.stats.flatMap((s) => [s.label, s.value, s.unit]),
    ...c.stub.flatMap((f) => [f.label, f.value]),
    c.cta,
    c.site,
    // Drawn by the template rather than copy: the CTA arrow and the ellipsis of truncated names.
    '→…',
  ].join('')
}
