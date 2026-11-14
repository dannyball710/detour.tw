import { useMemo, useState } from 'react'
import { COLOS } from '#/data/colos'
import { TW_ISPS } from '#/data/isps'
import { countryName, getDict, pathFor } from '#/i18n'
import type { Lang } from '#/lib/types'
import { CsvDownload } from './CsvDownload'
import { PageBand } from './PageBand'
import { DownloadIcon, ExternalIcon, GithubIcon } from './icons'
import { CONTACT_EMAIL, REPO_URL } from './links'

const REGION_ORDER = ['asia', 'oceania', 'north-america', 'south-america', 'europe', 'middle-east', 'africa']

export function MethodologyPage({ lang }: { lang: Lang }) {
  const d = getDict(lang)
  const t = d.method
  const [q, setQ] = useState('')

  const rows = useMemo(
    () =>
      Object.values(COLOS)
        .map((c) => ({
          ...c,
          country: countryName(c.cc, lang),
          countryAlt: countryName(c.cc, lang === 'en' ? 'zh' : 'en'),
        }))
        .sort((a, b) => REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region) || a.iata.localeCompare(b.iata)),
    [lang],
  )
  const needle = q.trim().toLowerCase()
  const shown = needle
    ? rows.filter((r) => [r.iata, r.en, r.zh, r.country, r.countryAlt, r.cc].some((v) => v.toLowerCase().includes(needle)))
    : rows

  return (
    <main id="main">
      <PageBand eyebrow={t.eyebrow} title={t.title} lead={t.lead} />

      <div className="wrap method">
        <nav className="toc" aria-label={t.title}>
          {t.sections.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.h}
            </a>
          ))}
          <a href="#isps">{t.ispHeading}</a>
          <a href="#privacy">{t.privacyHeading}</a>
          <a href="#license">{t.licenseHeading}</a>
          <a href="#colos">{t.coloHeading}</a>
        </nav>

        <div className="method-body">
          {t.sections.map((s) => (
            <section key={s.id} id={s.id} className="prose">
              <h2>{s.h}</h2>
              {s.p.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </section>
          ))}

          <section id="isps" className="prose">
            <h2>{t.ispHeading}</h2>
            <p>{t.ispLead}</p>
            <ul className="points">
              {t.ispNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <div className="table-scroll" tabIndex={0} role="region" aria-label={t.ispHeading}>
              <table className="board">
                <thead>
                  <tr>
                    <th scope="col">{t.ispCols.isp}</th>
                    <th scope="col">{t.ispCols.asns}</th>
                  </tr>
                </thead>
                <tbody>
                  {TW_ISPS.map((isp) => (
                    <tr key={isp.key}>
                      <th scope="row">{lang === 'en' ? isp.en : isp.zh}</th>
                      <td className="mono">{isp.asns.map((n) => `AS${n}`).join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="privacy" className="prose">
            <h2>{t.privacyHeading}</h2>
            <p>{t.privacy}</p>
          </section>

          <section id="license" className="prose">
            <h2>{t.licenseHeading}</h2>
            <p>{t.licenseBody}</p>
            <p>{t.dataBody}</p>
            <p>{t.datedBody}</p>
            <p>
              {t.contactLead} <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </p>
            <div className="btn-row">
              <CsvDownload lang={lang} className="btn">
                <DownloadIcon />
                {t.download}
              </CsvDownload>
              <a className="btn" href={pathFor('/stats', lang)}>
                {d.footer.stats}
              </a>
              <a className="btn" href={REPO_URL} target="_blank" rel="noopener noreferrer">
                <GithubIcon />
                {t.openSource}
                <ExternalIcon />
              </a>
            </div>
          </section>

          <section id="colos" className="prose prose-wide">
            <h2>{t.coloHeading}</h2>
            <p>{t.coloLead(rows.length)}</p>
            <div className="search">
              <label htmlFor="colo-q" className="sr-only">
                {t.coloSearch}
              </label>
              <input
                id="colo-q"
                type="search"
                placeholder={t.coloSearch}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoComplete="off"
              />
              <span className="mono" aria-live="polite">
                {t.coloCount(shown.length, rows.length)}
              </span>
            </div>
            <div className="table-scroll colo-scroll" tabIndex={0}>
              <table className="board">
                <thead>
                  <tr>
                    <th scope="col">{t.coloCols.iata}</th>
                    <th scope="col">{t.coloCols.city}</th>
                    <th scope="col">{t.coloCols.country}</th>
                    <th scope="col">{t.coloCols.region}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.iata}>
                      <th scope="row">
                        <b className="code">{r.iata}</b>
                      </th>
                      <td>{lang === 'en' ? r.en : r.zh}</td>
                      <td>{r.country}</td>
                      <td>{t.regions[r.region]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
