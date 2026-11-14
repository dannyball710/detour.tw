import { describe, expect, it } from 'vitest'
import { robotsTxt, sitemapXml } from './site'

describe('sitemap', () => {
  // Search engines need every language twin to list all alternates, including itself.
  it('lists 3 pages x 2 languages, each with zh-Hant-TW / en / x-default alternates', () => {
    const xml = sitemapXml('https://detour.tw', { deployedAt: Date.UTC(2026, 10, 14), statsAt: null })
    expect(xml.match(/<url>/g)).toHaveLength(6)
    expect(xml.match(/hreflang="zh-Hant-TW"/g)).toHaveLength(6)
    expect(xml.match(/hreflang="x-default" href="https:\/\/detour\.tw\/stats"/g)).toHaveLength(2)
    expect(xml).toContain('<loc>https://detour.tw/en/methodology</loc>')
    expect(xml).not.toContain('/r/')
  })

  // /stats changes with the data; the other pages only change when the site is deployed.
  it('dates /stats by the stats snapshot and the rest by the deploy', () => {
    const xml = sitemapXml('https://detour.tw', {
      deployedAt: Date.UTC(2026, 10, 14),
      statsAt: Date.UTC(2026, 10, 15, 3),
    })
    const lastmodOf = (loc: string) => xml.match(new RegExp(`<loc>${loc}</loc>\\n    <lastmod>([^<]+)</lastmod>`))?.[1]
    expect(lastmodOf('https://detour.tw/stats')).toBe('2026-11-15')
    expect(lastmodOf('https://detour.tw/en/stats')).toBe('2026-11-15')
    expect(lastmodOf('https://detour.tw/')).toBe('2026-11-14')
    expect(lastmodOf('https://detour.tw/en/methodology')).toBe('2026-11-14')
  })

  it('falls back to the deploy date for /stats when no snapshot is known', () => {
    const xml = sitemapXml('https://detour.tw', { deployedAt: Date.UTC(2026, 10, 14), statsAt: null })
    expect(xml.match(/<lastmod>2026-11-14<\/lastmod>/g)).toHaveLength(6)
  })

  it('robots allows everything and points at the sitemap', () => {
    expect(robotsTxt('https://detour.tw')).toBe('User-agent: *\nAllow: /\n\nSitemap: https://detour.tw/sitemap.xml\n')
  })
})
