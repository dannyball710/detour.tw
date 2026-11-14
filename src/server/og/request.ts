import type { Lang } from '#/lib/types'
import type { Layout } from './template'

// Part of the cache key: bump when the card design changes so cached PNGs are re-rendered.
export const OG_VERSION = 14

/**
 * Layout, language and cache key for a request. The key is canonical: unknown or repeated
 * parameters can't fan out into separate renders.
 */
export function ogRequest(url: string, id: string): { layout: Layout; lang: Lang; key: string } {
  const { origin, searchParams } = new URL(url)
  const layout: Layout = searchParams.get('layout') === 'story' ? 'story' : 'wide'
  const lang: Lang = searchParams.get('lang') === 'en' ? 'en' : 'zh'
  return { layout, lang, key: `${origin}/api/og/${id}.png?layout=${layout}&lang=${lang}&v=${OG_VERSION}` }
}
