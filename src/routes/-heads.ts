import { SITE_URL, coloCity, getDict, ispName, pathFor } from '#/i18n'
import { pageHead } from '#/i18n/seo'
import type { Lang, TestResult } from '#/lib/types'

export function homeHead(lang: Lang) {
  const t = getDict(lang)
  return pageHead({
    lang,
    path: '/',
    title: t.meta.homeTitle,
    description: t.meta.homeDesc,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: t.meta.appName,
        alternateName: 'Detour',
        url: SITE_URL + pathFor('/', lang),
        description: t.meta.homeDesc,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        inLanguage: t.htmlLang,
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'TWD' },
      },
    ],
  })
}

export function statsHead(lang: Lang) {
  const t = getDict(lang)
  return pageHead({
    lang,
    path: '/stats',
    title: t.meta.statsTitle,
    description: t.meta.statsDesc,
    crumbs: [[t.footer.stats, '/stats']],
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: t.meta.datasetName,
        description: t.meta.datasetDesc,
        url: SITE_URL + pathFor('/stats', lang),
        inLanguage: t.htmlLang,
        license: 'https://creativecommons.org/licenses/by/4.0/',
        isAccessibleForFree: true,
        creator: { '@type': 'Organization', name: t.meta.appName, url: SITE_URL },
        spatialCoverage: { '@type': 'Place', name: 'Taiwan' },
        temporalCoverage: '2026-11/..',
        // The CSV's columns: date is the temporal coverage, and the ISP key and English name are one variable.
        variableMeasured: [
          'ISP',
          'landing Cloudflare colo',
          'landing city',
          'landing country',
          'tests',
          "share of the ISP's tests that day",
          'median round-trip time (ms)',
          'median Taiwan-node (cloudflare.com, measured) round-trip time (ms)',
          'median added latency (ms)',
        ],
        measurementTechnique: SITE_URL + pathFor('/methodology', lang),
        distribution: [
          { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${SITE_URL}/api/export.csv` },
          { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${SITE_URL}/api/stats` },
        ],
      },
    ],
  })
}

export function methodHead(lang: Lang) {
  const t = getDict(lang)
  return pageHead({
    lang,
    path: '/methodology',
    title: t.meta.methodTitle,
    description: t.meta.methodDesc,
    crumbs: [[t.footer.method, '/methodology']],
  })
}

export function resultHead(lang: Lang, id: string, result: TestResult | null | undefined) {
  const t = getDict(lang)
  if (!result) {
    // An address that leads nowhere has no canonical form; the id may be anything typed in.
    const head = pageHead({ lang, path: '/', title: t.meta.notFoundTitle, description: t.meta.homeDesc, noindex: true })
    return { ...head, links: [] }
  }
  const city = coloCity(result.landing.iata, lang)
  return pageHead({
    lang,
    path: `/r/${id}`,
    title: t.meta.resultTitle(city),
    description: t.meta.resultDesc(city, ispName(result.isp, lang)),
    image: `${SITE_URL}/api/og/${id}.png?layout=wide&lang=${lang}`,
    noindex: true,
  })
}
