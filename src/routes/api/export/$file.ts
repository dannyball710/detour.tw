import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { dailyExportResponse } from '#/server/export'
import { error } from '#/server/http'

// /api/export/YYYY-MM-DD.csv: the dated daily copy, for reproducible citations.
export const Route = createFileRoute('/api/export/$file')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const res = await dailyExportResponse(request, env.EXPORTS, env.SITE_URL, params.file)
          return res ?? error(404, 'not_found')
        } catch (e) {
          console.error('daily export failed', e)
          return error(500, 'internal_error')
        }
      },
    },
  },
})
