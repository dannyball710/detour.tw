import { waitUntil } from 'cloudflare:workers'
import type { ApiError } from '#/lib/types'

export function json(data: unknown, init: { status?: number; cache?: string } = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': init.cache ?? 'no-store',
    },
  })
}

export function error(status: number, code: string): Response {
  const body: ApiError = { error: code }
  return json(body, { status })
}

/**
 * Client IP as Cloudflare saw it. The Vite dev server (Miniflare) does not always set the header,
 * so dev falls back to loopback; production without it is treated as unusable.
 */
export function clientIp(request: Request): string | null {
  const ip = request.headers.get('cf-connecting-ip')
  if (ip) return ip
  return import.meta.env.DEV ? '127.0.0.1' : null
}

/**
 * Identity used for every per-IP control (rate limits, token binding, daily IP hash / cap).
 * An IPv6 household gets a whole /64 and can rotate addresses inside it for free, so IPv6 is keyed by
 * its /64 prefix; IPv4 (incl. IPv4-mapped IPv6) by the full address.
 */
export function ipKey(ip: string): string {
  const v = ip.trim().toLowerCase()
  if (!v.includes(':')) return v
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v)
  if (mapped) return mapped[1]
  const [head, tail] = v.split('::')
  const h = head ? head.split(':') : []
  let groups = h
  if (tail !== undefined) {
    const t = tail ? tail.split(':') : []
    // A trailing dotted IPv4 occupies two groups.
    const tLen = t.length + (t.at(-1)?.includes('.') ? 1 : 0)
    groups = [...h, ...Array<string>(Math.max(0, 8 - h.length - tLen)).fill('0'), ...t]
  }
  return `${groups
    .slice(0, 4)
    .map((g) => (parseInt(g, 16) || 0).toString(16))
    .join(':')}::/64`
}

/** Cloudflare request metadata. Present on the Request in production and in the Vite dev server. */
export function cfOf(request: Request): IncomingRequestCfProperties | undefined {
  return (request as Request & { cf?: IncomingRequestCfProperties }).cf
}

export function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase()
  return (
    v === '::1' ||
    v.startsWith('127.') ||
    v.startsWith('10.') ||
    v.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(v) ||
    v.startsWith('fc') ||
    v.startsWith('fd') ||
    v.startsWith('fe80:') ||
    v.startsWith('::ffff:127.')
  )
}

// The DOM lib's CacheStorage type shadows the Workers one, which has `default`.
export function edgeCache(): Cache {
  return (caches as unknown as { default: Cache }).default
}

/**
 * Per-colo cache in front of `load`. The stored copy gets its own TTL (callers keep it at or below the
 * cadence at which the underlying data is rebuilt); the client-facing Cache-Control is set by `conditional`.
 * `ttl` may depend on the response, e.g. a short TTL for a cached miss (404).
 */
export async function edgeCached(
  key: string,
  ttl: number | ((res: Response) => number),
  load: () => Promise<Response>,
): Promise<Response> {
  const cache = edgeCache()
  const cacheKey = new Request(key)
  const hit = await cache.match(cacheKey)
  if (hit) return hit
  const res = await load()
  const copy = res.clone()
  const stored = new Response(copy.body, { status: copy.status, headers: copy.headers })
  stored.headers.set('cache-control', `public, max-age=${typeof ttl === 'number' ? ttl : ttl(res)}`)
  waitUntil(cache.put(cacheKey, stored))
  return res
}

function etagMatches(request: Request, etag: string): boolean {
  const header = request.headers.get('if-none-match')
  if (!header) return false
  // The edge may weaken our ETag when it compresses the body; If-None-Match uses weak comparison anyway.
  const bare = (t: string) => t.trim().replace(/^W\//, '')
  return header.split(',').some((t) => t.trim() === '*' || bare(t) === bare(etag))
}

const NOT_MODIFIED_HEADERS = ['etag', 'cache-control', 'last-modified', 'x-data-generated-at']

/** 304 when the client already has this version, otherwise `res` with the client-facing Cache-Control. */
export function conditional(request: Request, res: Response, cacheControl: string): Response {
  const headers = new Headers(res.headers)
  headers.set('cache-control', cacheControl)
  const etag = headers.get('etag')
  if (etag && etagMatches(request, etag)) {
    void res.body?.cancel()
    const kept = new Headers()
    for (const k of NOT_MODIFIED_HEADERS) {
      const v = headers.get(k)
      if (v) kept.set(k, v)
    }
    return new Response(null, { status: 304, headers: kept })
  }
  return new Response(res.body, { status: res.status, headers })
}

/** Reads at most `max` bytes of the body; null when it is larger (without buffering the rest). */
export async function readBodyCapped(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'))
  if (declared > max) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    all.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder().decode(all)
}
