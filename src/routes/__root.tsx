import { HeadContent, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router'
import { LangBanner } from '#/components/LangBanner'
import { SiteFooter } from '#/components/SiteFooter'
import { SiteHeader } from '#/components/SiteHeader'
import { ArrowIcon } from '#/components/icons'
import { getDict, langFromPath, pathFor } from '#/i18n'

import appCss from '../styles.css?url'

// Display: Fira Sans Extra Condensed (figures, IATA codes). Utility: B612 Mono. Body: Noto Sans TC.
const FONTS_CSS =
  'https://fonts.googleapis.com/css2?family=B612+Mono:wght@400;700&family=Fira+Sans+Extra+Condensed:wght@600;800&family=Noto+Sans+TC:wght@400;500;700&display=swap'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'theme-color', content: '#0e3b63' },
      { name: 'color-scheme', content: 'light' },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: FONTS_CSS },
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const lang = langFromPath(pathname)
  return (
    <html lang={getDict(lang).htmlLang}>
      <head>
        <HeadContent />
      </head>
      <body>
        <SiteHeader lang={lang} pathname={pathname} />
        {children}
        <SiteFooter lang={lang} />
        <LangBanner lang={lang} pathname={pathname} />
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const lang = langFromPath(pathname)
  const t = getDict(lang)
  return (
    <main id="main">
      {/* No route's head runs for an unknown address; React 19 hoists this into <head>. */}
      <title>{t.meta.pageNotFoundTitle}</title>
      <section className="hero hero-shared">
        <div className="wrap shared-missing">
          <p className="label">404</p>
          <h1>{t.notFound.title}</h1>
          <p>{t.notFound.body}</p>
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
