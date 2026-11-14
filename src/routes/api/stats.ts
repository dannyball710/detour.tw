import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { error } from '#/server/http'
import { statsResponse } from '#/server/stats'

export const Route = createFileRoute('/api/stats')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await statsResponse(request, env.DB, env.SITE_URL)
        } catch (e) {
          console.error('stats failed', e)
          return error(500, 'internal_error')
        }
      },
    },
  },
})
