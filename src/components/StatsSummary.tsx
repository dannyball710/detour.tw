import { asnOfKey } from '#/data/isps'
import { coloCity, fmtNum, getDict, ispKeyName, pathFor } from '#/i18n'
import { lightForLanding } from '#/lib/geo'
import type { IspStats, Lang, StatsResponse } from '#/lib/types'
import { LightBar, pct } from './charts'
import { ArrowIcon, Lamp } from './icons'

/** Groups with fewer tests than this are shown greyed out and labelled. */
export const MIN_SAMPLE = 30
const HOME_ROWS = 6

/** The per-ISP table, laid out like a departures board: carrier, destination, share, time. */
export function IspBoard({ lang, isps, full }: { lang: Lang; isps: IspStats[]; full?: boolean }) {
  const d = getDict(lang)
  const t = d.report.ispCols
  const labels = { green: d.stats.domestic, yellow: d.stats.yellow, red: d.stats.red }
  const ms = (v: number | null) => (v == null ? '—' : `${fmtNum(Math.round(v), lang)} ms`)
  return (
    // A narrow screen scrolls the table sideways, so keyboards must be able to reach it.
    <div className="table-scroll" tabIndex={0} role="region" aria-label={d.report.ispHeading}>
      <table className={full ? 'board' : 'board board-compact'}>
        <thead>
          <tr>
            <th scope="col">{t.isp}</th>
            <th scope="col">{t.top}</th>
            <th scope="col" className="col-share">
              {t.domestic}
            </th>
            <th scope="col" className="num">
              {t.rtt}
            </th>
            {full && (
              <>
                <th scope="col" className="num">
                  {t.ref}
                </th>
                <th scope="col" className="num">
                  {t.extra}
                </th>
                <th scope="col" className="num">
                  {t.n}
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {isps.map((i) => {
            const top = i.colos[0]
            const low = i.n < MIN_SAMPLE
            return (
              <tr key={i.key} data-low={low ? '' : undefined}>
                <th scope="row">
                  {ispKeyName(i.key, lang)}
                  {low && <span className="tag">{d.stats.lowSample}</span>}
                </th>
                <td>
                  {top && (
                    <span className="board-dest">
                      <Lamp kind={lightForLanding(top.iata)} size={18} />
                      <b className="code">{top.iata}</b>
                      {coloCity(top.iata, lang)}
                      <span className="board-dest-share">{pct(top.n / i.n)}</span>
                    </span>
                  )}
                  {!top && '—'}
                </td>
                <td className="col-share">
                  <b className="board-pct">{pct(i.domestic)}</b>
                  <LightBar lights={i.lights} labels={labels} sep={d.listSep} />
                </td>
                <td className="num">{ms(i.medianRtt)}</td>
                {full && (
                  <>
                    <td className="num">{ms(i.medianRefRtt)}</td>
                    <td className="num">{i.medianExtraMs == null ? '—' : `+${ms(Math.max(0, i.medianExtraMs))}`}</td>
                    <td className="num">{fmtNum(i.n, lang)}</td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function LightLegend({ lang }: { lang: Lang }) {
  const t = getDict(lang).stats
  return (
    <ul className="legend">
      <li>
        <i data-light="green" />
        {t.domestic}
      </li>
      <li>
        <i data-light="yellow" />
        {t.yellow}
      </li>
      <li>
        <i data-light="red" />
        {t.red}
      </li>
    </ul>
  )
}

export function StatsSummary({ lang, stats }: { lang: Lang; stats: StatsResponse | null }) {
  const t = getDict(lang).stats
  // The home board shows brands only; networks known by ASN alone are on /stats.
  const isps = stats
    ? stats.isps
        .filter((i) => asnOfKey(i.key) == null)
        .sort((a, b) => b.n - a.n)
        .slice(0, HOME_ROWS)
    : []
  return (
    <section id="stats" className="section section-paper" aria-labelledby="stats-h">
      <div className="wrap">
        <div className="section-head">
          <h2 id="stats-h">{t.heading}</h2>
        </div>
        {!stats && <p className="empty">{t.unavailable}</p>}
        {stats && (
          <>
            {isps.length === 0 && <p className="empty">{t.empty}</p>}
            {isps.length > 0 && (
              <>
                <IspBoard lang={lang} isps={isps} />
                <LightLegend lang={lang} />
              </>
            )}
          </>
        )}
        <a className="more-link" href={pathFor('/stats', lang)}>
          {t.more}
          <ArrowIcon />
        </a>
      </div>
    </section>
  )
}
