import { waitUntil } from 'cloudflare:workers'
import { edgeCache } from '#/server/http'
import { RESULT_ID_RE, loadResult } from '#/server/results'
import { renderOgPng } from './render'
import { ogRequest } from './request'

const notFound = () =>
  new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } })

/** GET /api/og/<id>.png?layout=wide|story&lang=zh|en */
export async function handleOg(request: Request, id: string): Promise<Response> {
  if (!RESULT_ID_RE.test(id)) return notFound()

  const { layout, lang, key: keyUrl } = ogRequest(request.url, id)
  const key = new Request(keyUrl)
  const cache = edgeCache()
  const hit = await cache.match(key)
  if (hit) return hit

  const result = await loadResult(id)
  if (!result) return notFound()

  let png: Uint8Array<ArrayBuffer>
  try {
    png = await renderOgPng(result, layout, lang)
  } catch (e) {
    // Link previews (wide) must never come back empty: if rendering fails (e.g. Google Fonts slow
    // or down) send crawlers to the static default image. Not cached, so the next fetch retries.
    if (layout !== 'wide') throw e
    console.error('og render failed, serving default image', e)
    return new Response(null, {
      status: 302,
      headers: { location: new URL('/og-default.png', request.url).href, 'cache-control': 'no-store' },
    })
  }
  const response = new Response(png, {
    headers: {
      'content-type': 'image/png',
      // Stored results never change.
      'cache-control': 'public, max-age=86400, immutable',
    },
  })
  waitUntil(cache.put(key, response.clone()))
  return response
}
