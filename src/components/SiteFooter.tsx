import { getDict, pathFor } from '#/i18n'
import type { Lang } from '#/lib/types'
import { ExternalIcon, GithubIcon } from './icons'
import { REPO_URL } from './links'

export function SiteFooter({ lang }: { lang: Lang }) {
  const d = getDict(lang)
  const t = d.footer
  return (
    <footer className="site-footer">
      <div className="wrap">
        <nav aria-label={d.name}>
          <a href={pathFor('/methodology', lang)}>{t.method}</a>
          <a href={pathFor('/stats', lang)}>{t.stats}</a>
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer license">
            {t.license}
          </a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            <GithubIcon />
            {t.source}
            <ExternalIcon />
          </a>        </nav>
      </div>
    </footer>
  )
}
