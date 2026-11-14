import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import type { StartResponse } from '#/lib/types'
import { serverViewFromCf, visitorOf } from '#/server/classify'
import { cfOf, clientIp, error, ipKey, json } from '#/server/http'
import { createToken } from '#/server/token'

export const Route = createFileRoute('/api/start')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = clientIp(request)
        const cf = cfOf(request)
        const colo = cf?.colo
        if (!ip || typeof colo !== 'string') return error(400, 'bad_request')
        const key = ipKey(ip)
        const { success } = await env.START_LIMITER.limit({ key })
        if (!success) return error(429, 'rate_limited')
        const body: StartResponse = {
          token: await createToken(env.TOKEN_SECRET, key, colo, Date.now()),
          colo,
          ...visitorOf(serverViewFromCf(ip, cf)),
        }
        return json(body)
      },
    },
  },
})
