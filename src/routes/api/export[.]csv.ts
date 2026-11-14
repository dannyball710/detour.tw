import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { exportResponse } from '#/server/export'
import { error } from '#/server/http'

export const Route = createFileRoute('/api/export.csv')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await exportResponse(request, env.EXPORTS, env.SITE_URL)
        } catch (e) {
          console.error('export failed', e)
          return error(500, 'internal_error')
        }
      },
    },
  },
})
