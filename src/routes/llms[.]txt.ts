import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { llmsTxt } from '#/server/site'

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: () =>
        new Response(llmsTxt(env.SITE_URL), {
          headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' },
        }),
    },
  },
})
