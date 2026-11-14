import handler from '@tanstack/react-start/server-entry'
import { runCron } from './server/cron'

// Shared results and API responses are user-generated or machine data: keep them out of search
// indexes even when the response is not HTML (the meta tag only covers SSR pages).
const NOINDEX_PATH = /^\/(?:en\/)?r\/|^\/api\//

// Applied to every Worker response (public/_headers only covers static assets). No page is meant to be framed.
const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'content-security-policy': "frame-ancestors 'none'",
  'referrer-policy': 'strict-origin-when-cross-origin',
}

export default {
  // Wrapped so Workers' (env, ctx) arguments are not mistaken for TanStack's request options.
  fetch: async (request: Request) => {
    const response = await handler.fetch(request)
    const headers = new Headers(response.headers)
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!headers.has(k)) headers.set(k, v)
    if (NOINDEX_PATH.test(new URL(request.url).pathname)) headers.set('x-robots-tag', 'noindex, follow')
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  },
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runCron(controller.cron, { db: env.DB, bucket: env.EXPORTS }, Date.now()))
  },
} satisfies ExportedHandler<Env>
