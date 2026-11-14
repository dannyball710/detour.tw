import { createFileRoute } from '@tanstack/react-router'
import { handleOg } from '#/server/og/handler'

export const Route = createFileRoute('/api/og/{$id}.png')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          return await handleOg(request, params.id)
        } catch (e) {
          console.error('og render failed', e)
          return new Response('Render failed', { status: 500, headers: { 'cache-control': 'no-store' } })
        }
      },
    },
  },
})
