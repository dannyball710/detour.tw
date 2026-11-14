import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { error } from '#/server/http'
import { RESULT_ID_RE, resultResponse } from '#/server/results'

export const Route = createFileRoute('/api/result/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!RESULT_ID_RE.test(params.id)) return error(404, 'not_found')
        try {
          return await resultResponse(env.DB, env.SITE_URL, params.id)
        } catch (e) {
          console.error('result failed', e)
          return error(500, 'internal_error')
        }
      },
    },
  },
})
