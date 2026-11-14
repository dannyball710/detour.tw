import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { sitemapXml } from '#/server/site'
import { getStats } from '#/server/stats'

// Injected by vite.config.ts at build time: the moment this deploy's static content was produced.
declare const __BUILD_TIME__: number

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        // A stats failure must not take the sitemap down; /stats then falls back to the deploy date.
        const statsAt = await getStats().then((s) => s.generatedAt, () => null)
        return new Response(sitemapXml(env.SITE_URL, { deployedAt: __BUILD_TIME__, statsAt }), {
          // Short enough for /stats' lastmod to follow the daily data.
          headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
        })
      },
    },
  },
})
