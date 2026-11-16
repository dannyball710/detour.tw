import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { serverViewFromCf } from '#/server/classify'
import { cfOf, clientIp, error, ipKey, isForeignOrigin, isPrivateIp, json, readBodyCapped } from '#/server/http'
import { MAX_BODY_BYTES, parseSubmit, processSubmit } from '#/server/submit'

export const Route = createFileRoute('/api/submit')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = clientIp(request)
        if (!ip) return error(400, 'bad_request')
        const { success } = await env.SUBMIT_LIMITER.limit({ key: ipKey(ip) })
        if (!success) return error(429, 'rate_limited')

        const text = await readBodyCapped(request, MAX_BODY_BYTES)
        if (text == null) return error(413, 'payload_too_large')
        const body = parseSubmit(text)
        if (!body) return error(400, 'invalid_body')

        try {
          const outcome = await processSubmit(body, serverViewFromCf(ip, cfOf(request)), {
            db: env.DB,
            secret: env.TOKEN_SECRET,
            now: Date.now(),
            // In dev the reference trace sees our public IP while this server sees loopback.
            skipRefIdentity: import.meta.env.DEV && isPrivateIp(ip),
            foreignOrigin: isForeignOrigin(request, env.ALLOWED_ORIGINS, import.meta.env.DEV),
          })
          if (!outcome.ok) return error(outcome.status, outcome.error)
          return json(outcome.result)
        } catch (e) {
          console.error('submit failed', e)
          return error(500, 'internal_error')
        }
      },
    },
  },
})
