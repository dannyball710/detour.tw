// Crawler-facing text files. Static pages only: result pages (/r/*) are user-generated and noindex.

const PAGES = ['/', '/stats', '/methodology']

const enPath = (p: string) => (p === '/' ? '/en' : `/en${p}`)
const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** W3C date (YYYY-MM-DD) for <lastmod>. */
export const sitemapDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * `deployedAt` dates the pages whose content only changes on deploy; /stats changes with every
 * stats snapshot, so it carries the snapshot's date when one is known.
 */
export function sitemapXml(origin: string, lastmod: { deployedAt: number; statsAt: number | null }): string {
  const urls: string[] = []
  for (const p of PAGES) {
    const zh = xmlEscape(origin + p)
    const en = xmlEscape(origin + enPath(p))
    const date = sitemapDate(p === '/stats' && lastmod.statsAt != null ? lastmod.statsAt : lastmod.deployedAt)
    const alternates =
      `    <lastmod>${date}</lastmod>\n` +
      `    <xhtml:link rel="alternate" hreflang="zh-Hant-TW" href="${zh}"/>\n` +
      `    <xhtml:link rel="alternate" hreflang="en" href="${en}"/>\n` +
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${zh}"/>\n`
    for (const loc of [zh, en]) urls.push(`  <url>\n    <loc>${loc}</loc>\n${alternates}  </url>`)
  }
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    urls.join('\n') +
    '\n</urlset>\n'
  )
}

export function robotsTxt(origin: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`
}

export function llmsTxt(origin: string): string {
  return `# Detour — 網路出國了嗎？

> Detour measures which Cloudflare data center (colo) a visitor's connection lands in when visiting an ordinary free-plan Cloudflare website, and publishes anonymous statistics by Taiwanese ISP. Many Chunghwa Telecom (HiNet) users land in the US instead of Taipei; the project asks Chunghwa Telecom and Cloudflare to interconnect directly in Taiwan.

The test runs in the browser: it times requests to /cdn-cgi/trace on this site (free-plan path) and on cloudflare.com (reference path that normally lands in Taipei or Kaohsiung), then reports the landing city, the distance and the added latency. Only tests from Taiwan on Taiwanese networks are counted in the Taiwan statistics; VPNs, roaming and foreign networks are classified separately. No IP addresses are stored.

## Pages

- [Run the test (中文)](${origin}/): result card, map, live summary
- [Run the test (English)](${origin}/en)
- [Statistics report](${origin}/en/stats): landing data centers, latency and trend by ISP, by county, international baseline
- [Methodology](${origin}/en/methodology): how we measure, anti-abuse rules, privacy, limitations

## Data

- [Daily statistics (CSV, CC BY 4.0)](${origin}/api/export.csv): one row per date, ISP and landing data center (cells under 3 tests folded into OTHER); columns date, isp, isp_name_en, landing_colo, landing_city, landing_country, tests, share_of_isp_day, median_rtt_ms, median_ref_rtt_ms, median_extra_ms. Single days: ${origin}/api/export/YYYY-MM-DD.csv
- [Aggregated statistics (JSON)](${origin}/api/stats)
`
}
