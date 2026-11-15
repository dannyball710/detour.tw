import { carrierOf, getIsp } from '#/data/isps'
import { SITE_URL, coloCity, fmtDate, fmtNum, ispName, pathFor } from '#/i18n'
import type { StatsResponse, TestResult } from '#/lib/types'
import { MIN_SAMPLE } from './StatsSummary'
import { isDetour } from './result-model'

/**
 * Messages a visitor can send. Each is written in its reader's language, not the page's:
 * Chinese for a Taiwanese carrier or regulator, English for Cloudflare. All of them ask for
 * the same thing, direct interconnection in Taiwan, and blame no one.
 *
 * Every message is complete and ready to send. A visitor whose own connection took a detour
 * gets a message about that measurement; everyone else gets one about the public statistics.
 * The carrier's message spells shares out as 「百分之 N」: Chunghwa Telecom's feedback form rejects "%".
 */
export interface ActTemplates {
  isp: string
  regulator: string
  cloudflare: string
}

const ZH_ASK_ISP = '希望貴公司能與 Cloudflare 在台灣建立直接互連，改善連線品質。謝謝。'
const ZH_ASK_REGULATOR = '希望主管機關了解這個情況，協助電信業者與 Cloudflare 在台灣直接互連。謝謝。'
// A share inside 「有…落在」: the carrier's message spells it out, the regulator's uses "%".
type ZhPct = (n: number) => string
const PCT_ISP: ZhPct = (n) => `百分之 ${n} `
const PCT_REGULATOR: ZhPct = (n) => ` ${n}% `
// The carrier's message carries no link, so it names the site; the regulator's links the report.
const ZH_SITE = '（detour.tw）'
const STATS_ZH = `${SITE_URL}${pathFor('/stats', 'zh')}`
const STATS_EN = `${SITE_URL}${pathFor('/stats', 'en')}`

/** Share of the other carriers' tests landing in Taiwan, when there is enough data to quote. */
function othersDomesticPct(stats: StatsResponse | null, ispKey: string): number | null {
  if (!stats) return null
  // "Other carriers" leaves out every group of the visitor's own company (HiNet and its mobile network).
  const carrier = carrierOf(ispKey)
  const others = stats.isps.filter((i) => carrierOf(i.key) !== carrier && getIsp(i.key))
  const n = others.reduce((s, i) => s + i.n, 0)
  if (n < MIN_SAMPLE) return null
  return Math.round((others.reduce((s, i) => s + i.n * i.domestic, 0) / n) * 100)
}

function fromOwnResult(r: TestResult, stats: StatsResponse | null): ActTemplates {
  const ms = Math.round(r.landing.rttMs)
  const others = othersDomesticPct(stats, r.isp.key)
  const zhFacts = (pct: ZhPct, site = '') =>
    `我在 ${fmtDate(r.createdAt, 'zh')} 用「網路出國了嗎」${site}測試，連往 Cloudflare 的連線落在${coloCity(r.landing.iata, 'zh')}，延遲約 ${fmtNum(ms, 'zh')} 毫秒` +
    (others != null ? `。同一時間，其他電信用戶有${pct(others)}落在台灣` : '')
  const isp = ispName(r.isp, 'en')
  const baseline = r.ref
    ? `, while cloudflare.com answered from ${coloCity(r.ref.iata, 'en')} in about ${fmtNum(Math.round(r.ref.rttMs), 'en')} ms`
    : ''
  return {
    isp: `您好，我是貴公司的用戶。${zhFacts(PCT_ISP, ZH_SITE)}。${ZH_ASK_ISP}`,
    regulator: `您好，我是${ispName(r.isp, 'zh')}的用戶。${zhFacts(PCT_REGULATOR)}。全台的匿名統計公開在 ${STATS_ZH} 。${ZH_ASK_REGULATOR}`,
    cloudflare:
      `Hello, I am an internet user in Taiwan on ${isp}. On ${fmtDate(r.createdAt, 'en')}, a test on detour.tw showed my connection ` +
      `to a site on Cloudflare being served from ${coloCity(r.landing.iata, 'en')} (${r.landing.iata}), about ${fmtNum(ms, 'en')} ms per round trip${baseline}. ` +
      `Public statistics: ${STATS_EN}. ` +
      `I would like to ask Cloudflare to interconnect directly with ${isp} in Taiwan so that this traffic can be served locally. Thank you.`,
  }
}

/**
 * Someone else's result, opened from its link: the visitor did not run it and may be on another
 * network, so the message reports it as a test that was run, not as "my connection".
 */
function fromSharedResult(r: TestResult, stats: StatsResponse | null): ActTemplates {
  const ms = Math.round(r.landing.rttMs)
  const others = othersDomesticPct(stats, r.isp.key)
  const zhIsp = ispName(r.isp, 'zh')
  const enIsp = ispName(r.isp, 'en')
  const zhFacts = (pct: ZhPct, site = '') =>
    `${fmtDate(r.createdAt, 'zh')}有一位${zhIsp}用戶用「網路出國了嗎」${site}測試，連往 Cloudflare 的連線落在${coloCity(r.landing.iata, 'zh')}，延遲約 ${fmtNum(ms, 'zh')} 毫秒` +
    (others != null ? `。同一時間，其他電信用戶有${pct(others)}落在台灣` : '')
  const baseline = r.ref
    ? `, while cloudflare.com answered from ${coloCity(r.ref.iata, 'en')} in about ${fmtNum(Math.round(r.ref.rttMs), 'en')} ms`
    : ''
  return {
    isp: `您好，${zhFacts(PCT_ISP, ZH_SITE)}。${ZH_ASK_ISP}`,
    regulator: `您好，${zhFacts(PCT_REGULATOR)}。全台的匿名統計公開在 ${STATS_ZH} 。${ZH_ASK_REGULATOR}`,
    cloudflare:
      `Hello. On ${fmtDate(r.createdAt, 'en')}, a test on detour.tw by a ${enIsp} user in Taiwan showed the connection ` +
      `to a site on Cloudflare being served from ${coloCity(r.landing.iata, 'en')} (${r.landing.iata}), about ${fmtNum(ms, 'en')} ms per round trip${baseline}. ` +
      `Public statistics: ${STATS_EN}. ` +
      `I would like to ask Cloudflare to interconnect directly with ${enIsp} in Taiwan so that this traffic can be served locally. Thank you.`,
  }
}

function fromStatistics(stats: StatsResponse | null): ActTemplates {
  const cht = stats?.isps.find((i) => i.key === 'cht')
  // A percentage is only quoted from a sample worth quoting; otherwise the message says "some".
  const abroad = stats && cht && cht.n >= MIN_SAMPLE ? Math.round((1 - cht.domestic) * 100) : null
  const zhFacts = (pct: ZhPct) =>
    abroad != null && stats
      ? `近 ${stats.windowDays} 天中華電信 HiNet 用戶連往 Cloudflare 網站的測試中，有${pct(abroad)}落在台灣以外的機房`
      : '部分中華電信 HiNet 用戶連往 Cloudflare 網站的連線，會落在台灣以外的機房'
  const enFacts =
    abroad != null && stats
      ? `${abroad}% of tests from Chunghwa Telecom (HiNet) users in Taiwan over the last ${stats.windowDays} days reached sites on Cloudflare through a data center outside Taiwan`
      : 'some connections from Chunghwa Telecom (HiNet) users in Taiwan reach sites on Cloudflare through a data center outside Taiwan'
  return {
    isp: `您好，根據「網路出國了嗎」${ZH_SITE}的公開統計，${zhFacts(PCT_ISP)}。${ZH_ASK_ISP}`,
    regulator: `您好，根據「網路出國了嗎」的公開統計（${STATS_ZH} ），${zhFacts(PCT_REGULATOR)}。${ZH_ASK_REGULATOR}`,
    cloudflare:
      `Hello. According to public measurements collected by detour.tw (${STATS_EN}), ${enFacts}. ` +
      'I would like to ask Cloudflare to interconnect directly with Chunghwa Telecom in Taiwan so that this traffic can be served locally. Thank you.',
  }
}

export function actTemplates(result: TestResult | null, stats: StatsResponse | null, shared = false): ActTemplates {
  if (!result || !isDetour(result)) return fromStatistics(stats)
  return shared ? fromSharedResult(result, stats) : fromOwnResult(result, stats)
}
