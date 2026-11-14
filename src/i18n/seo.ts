import type { Lang } from '#/lib/types'
import { SITE_URL, getDict, pathFor } from './index'

interface PageHeadOptions {
  lang: Lang
  /** zh path of the page, e.g. '/stats'. */
  path: string
  title: string
  description: string
  image?: string
  imageAlt?: string
  noindex?: boolean
  jsonLd?: object[]
  /** Breadcrumb trail below the home page: [name, zh path]. */
  crumbs?: [string, string][]
}

export function pageHead(o: PageHeadOptions) {
  const dict = getDict(o.lang)
  const url = SITE_URL + pathFor(o.path, o.lang)
  const zhUrl = SITE_URL + pathFor(o.path, 'zh')
  const enUrl = SITE_URL + pathFor(o.path, 'en')
  const image = o.image ?? `${SITE_URL}/og-default.png`
  const jsonLd = [...(o.jsonLd ?? [])]
  if (o.crumbs?.length) {
    const trail: [string, string][] = [[dict.breadcrumbHome, '/'], ...o.crumbs]
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: trail.map(([name, p], i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name,
        item: SITE_URL + pathFor(p, o.lang),
      })),
    })
  }
  return {
    meta: [
      { title: o.title },
      { name: 'description', content: o.description },
      ...(o.noindex ? [{ name: 'robots', content: 'noindex,follow' }] : []),
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: dict.meta.appName },
      { property: 'og:locale', content: dict.ogLocale },
      { property: 'og:title', content: o.title },
      { property: 'og:description', content: o.description },
      { property: 'og:url', content: url },
      { property: 'og:image', content: image },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: o.imageAlt ?? o.title },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: o.title },
      { name: 'twitter:description', content: o.description },
      { name: 'twitter:image', content: image },
      // TanStack renders this meta key as <script type="application/ld+json">, but a route's
      // head() types its meta as React <meta> attributes, which do not have it.
      ...jsonLd.map((j) => ({ 'script:ld+json': j }) as unknown as { name: string; content: string }),
    ],
    links: [
      { rel: 'canonical', href: url },
      { rel: 'alternate', hrefLang: 'zh-Hant-TW', href: zhUrl },
      { rel: 'alternate', hrefLang: 'en', href: enUrl },
      { rel: 'alternate', hrefLang: 'x-default', href: zhUrl },
    ],
  }
}
