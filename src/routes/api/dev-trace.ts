import { createFileRoute } from '@tanstack/react-router'
import { cfOf, clientIp } from '#/server/http'

// Stand-in for /cdn-cgi/trace, which does not exist on localhost. Never served outside dev.
export const Route = createFileRoute('/api/dev-trace')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!import.meta.env.DEV) return new Response('Not found', { status: 404 })
        const cf = cfOf(request)
        const url = new URL(request.url)
        const lines = {
          fl: 'dev',
          h: url.host,
          ip: clientIp(request) ?? '',
          ts: (Date.now() / 1000).toFixed(3),
          visit_scheme: url.protocol.replace(':', ''),
          uag: request.headers.get('user-agent') ?? '',
          colo: String(cf?.colo ?? 'TPE'),
          sliver: 'none',
          http: String(cf?.httpProtocol ?? 'http/1.1'),
          loc: String(cf?.country ?? 'TW'),
          tls: 'off',
          sni: 'off',
          warp: 'off',
          gateway: 'off',
          rbi: 'off',
          kex: 'none',
        }
        const body = Object.entries(lines).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
        return new Response(body, {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'no-store',
            'access-control-allow-origin': '*',
          },
        })
      },
    },
  },
})
