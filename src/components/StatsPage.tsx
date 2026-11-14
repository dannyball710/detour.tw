import type { ReactNode } from 'react'
import { useDemoStats } from '#/client/use-demo-stats'
import { coloCity, countryName, fmtDate, fmtNum, getDict, ispKeyName } from '#/i18n'
import { lightForLanding } from '#/lib/geo'
import type { IspStats, Lang, StatsResponse } from '#/lib/types'
import { PageBand } from './PageBand'
import { IspBoard, LightLegend, MIN_SAMPLE } from './StatsSummary'
import { ShareBar, TrendChart, pct } from './charts'
import type { TrendSeries } from './charts'

const TREND_SERIES = 6
const COLO_ROWS = 6

function ColoDistribution({ lang, isp }: { lang: Lang; isp: IspStats }) {
  const t = getDict(lang)
  const rest = isp.colos.slice(COLO_ROWS).reduce((s, c) => s + c.n, 0)
  const rows = isp.colos.slice(0, COLO_ROWS).map((c) => ({
    key: c.iata,
    code: c.iata,
    name: coloCity(c.iata, lang),
    n: c.n,
    light: lightForLanding(c.iata) as 'green' | 'yellow' | 'red' | 'gray',
  }))
  if (rest > 0) rows.push({ key: 'other', code: '···', name: t.report.other, n: rest, light: 'gray' })
  const total = rows.reduce((s, r) => s + r.n, 0) || 1
  return (
    <div className="dist" data-low={isp.n < MIN_SAMPLE ? '' : undefined}>
      <h3>
        {ispKeyName(isp.key, lang)}
        {isp.n < MIN_SAMPLE && <span className="tag">{t.stats.lowSample}</span>}
      </h3>
      <ul>
        {rows.map((r) => (
          <li key={r.key}>
            <b className="code">{r.code}</b>
            <span className="dist-name">{r.name}</span>
            <ShareBar value={r.n / total} light={r.light} />
            <span className="dist-pct">{pct(r.n / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** `labelledBy`: the section heading; a narrow screen scrolls the table, so keyboards must reach it. */
function Table({ head, children, labelledBy }: { head: ReactNode; children: ReactNode; labelledBy: string }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-labelledby={labelledBy}>
      <table className="board">
        <thead>{head}</thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function StatsPage({ lang, stats: loaded }: { lang: Lang; stats: StatsResponse | null }) {
  const stats = useDemoStats(loaded)
  const d = getDict(lang)
  const t = d.report
  const isps = stats ? [...stats.isps].sort((x, y) => y.n - x.n) : []
  const days = stats ? [...new Set(stats.trend.map((r) => r.day))].sort() : []
  const series: TrendSeries[] = isps
    .filter((i) => i.n >= MIN_SAMPLE)
    .slice(0, TREND_SERIES)
    .map((i) => ({
      key: i.key,
      name: ispKeyName(i.key, lang),
      points: (stats?.trend ?? []).filter((r) => r.isp === i.key).map((r) => ({ day: r.day, v: r.domestic, n: r.n })),
    }))
  const intl = stats ? [...stats.intl].sort((x, y) => y.n - x.n) : []
  const empty = !!stats && stats.totals.allTime === 0

  return (
    <main id="main">
      <PageBand eyebrow={t.eyebrow} title={t.title} lead={stats ? t.lead(stats.windowDays) : undefined}>
        {stats && <p className="band-meta mono">{t.updated(fmtDate(stats.generatedAt, lang, true))}</p>}
      </PageBand>

      <div className="wrap report">
        {!stats && <p className="empty">{t.unavailable}</p>}
        {empty && <p className="empty">{t.empty}</p>}

        {stats && !empty && (
          <>
            <section className="report-section" aria-labelledby="isp-h">
              <h2 id="isp-h">{t.ispHeading}</h2>
              <IspBoard lang={lang} isps={isps} full />
              <LightLegend lang={lang} />
            </section>

            {isps.length > 0 && (
              <section className="report-section" aria-labelledby="colo-h">
                <h2 id="colo-h">{t.coloHeading}</h2>
                <div className="dist-grid">
                  {isps.map((i) => (
                    <ColoDistribution key={i.key} lang={lang} isp={i} />
                  ))}
                </div>
              </section>
            )}

            {series.length > 0 && days.length > 1 && (
              <section className="report-section" aria-labelledby="trend-h">
                <h2 id="trend-h">{t.trendHeading}</h2>
                <TrendChart series={series} days={days} label={t.trendHeading} />
              </section>
            )}

            {intl.length > 0 && (
              <section className="report-section" aria-labelledby="intl-h">
                <h2 id="intl-h">{t.intlHeading}</h2>
                <Table
                  labelledBy="intl-h"
                  head={
                    <tr>
                      <th scope="col">{t.intlCols.country}</th>
                      <th scope="col">{t.intlCols.top}</th>
                      <th scope="col" className="num">
                        {t.intlCols.dist}
                      </th>
                      <th scope="col" className="num">
                        {t.intlCols.n}
                      </th>
                    </tr>
                  }
                >
                  {intl.map((c) => (
                    <tr key={c.country} data-low={c.n < MIN_SAMPLE ? '' : undefined}>
                      <th scope="row">
                        <b className="code">{c.country}</b>
                        {countryName(c.country, lang)}
                        {c.n < MIN_SAMPLE && <span className="tag">{d.stats.lowSample}</span>}
                      </th>
                      <td>
                        {c.topColo && (
                          <span className="board-dest">
                            <b className="code">{c.topColo}</b>
                            {coloCity(c.topColo, lang)}
                          </span>
                        )}
                        {!c.topColo && '—'}
                      </td>
                      <td className="num">
                        {c.medianDistanceKm != null && `${fmtNum(Math.round(c.medianDistanceKm), lang)} ${d.card.km}`}
                        {c.medianDistanceKm == null && '—'}
                      </td>
                      <td className="num">{fmtNum(c.n, lang)}</td>
                    </tr>
                  ))}
                </Table>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}
