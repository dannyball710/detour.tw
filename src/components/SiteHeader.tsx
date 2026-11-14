import { KEYS, writeStore } from '#/client/storage'
import { getDict, pathFor } from '#/i18n'
import type { Lang } from '#/lib/types'

/** The mark: a route that leaves, over the dashed one that would have been enough. */
export function Logo() {
  return (
    <svg className="logo-mark" width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="#fff" />
      <path d="M7 22h18" stroke="#0e3b63" strokeWidth="2" strokeDasharray="2.5 3" strokeLinecap="round" fill="none" />
      <path d="M7 22C9 9 21 7 25 12" stroke="#0e3b63" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <circle cx="7" cy="22" r="2.6" fill="#0e3b63" />
      <circle cx="25" cy="12" r="2.6" fill="#0e3b63" />
    </svg>
  )
}

interface Props {
  lang: Lang
  /** The page being shown. */
  pathname: string
}

export function SiteHeader({ lang, pathname }: Props) {
  const t = getDict(lang)
  const otherLang: Lang = lang === 'zh' ? 'en' : 'zh'
  const isHome = pathname === '/' || pathname === '/en' || pathname === '/en/'
  const name = (
    <>
      <span className="brand-name">DETOUR</span>
      <span className="brand-zh">{t.name}</span>
    </>
  )
  return (
    <header className="site-header">
      <a className="skip" href="#main">
        {t.nav.skip}
      </a>
      <div className="wrap site-header-inner">
        <a className="brand" href={pathFor('/', lang)}>
          <Logo />
          {/* The name is the page heading on the home page only. */}
          {isHome && <h1 className="brand-text">{name}</h1>}
          {!isHome && <span className="brand-text">{name}</span>}
        </a>
        <nav className="site-nav" aria-label={t.nav.menu}>
          <a href={pathFor('/methodology', lang)} aria-current={pathname.endsWith('/methodology') ? 'page' : undefined}>
            {t.nav.how}
          </a>
          <a className="nav-stats" href={pathFor('/stats', lang)} aria-current={pathname.endsWith('/stats') ? 'page' : undefined}>
            {t.nav.stats}
          </a>
          <a
            className="lang-switch"
            href={pathFor(pathname, otherLang)}
            hrefLang={getDict(otherLang).htmlLang}
            lang={getDict(otherLang).htmlLang}
            aria-label={t.nav.switchTo}
            onClick={() => writeStore(KEYS.lang, otherLang)}
          >
            {t.nav.switchShort}
          </a>
        </nav>
      </div>
    </header>
  )
}
