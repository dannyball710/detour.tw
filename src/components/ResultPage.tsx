import { getDict, pathFor } from '#/i18n'
import type { Lang } from '#/lib/types'
import { ArrowIcon } from './icons'

/**
 * A result address that shows no result: it leads nowhere (`missing`), or the result could not
 * be read just now (`error`). A result that exists is shown on the home page itself (HomePage
 * with `shared`).
 */
export function ResultMissing({ lang, kind = 'missing' }: { lang: Lang; kind?: 'missing' | 'error' }) {
  const t = getDict(lang)
  const missing = kind === 'missing'
  return (
    <main id="main">
      <section className="hero hero-shared">
        <div className="wrap shared-missing">
          {missing && <p className="label">404</p>}
          <h1>
            {missing && t.result.notFound}
            {!missing && t.result.errorTitle}
          </h1>
          <p>
            {missing && t.result.notFoundBody}
            {!missing && t.result.errorBody}
          </p>
          <div className="shared-cta">
            <a className="btn btn-on-sea btn-large" href={pathFor('/', lang)}>
              {t.result.cta}
              <ArrowIcon />
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
