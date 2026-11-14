// In-memory stand-ins for the Cache API and R2, with the constraints our code relies on.

export class MemoryCache {
  entries = new Map<string, { body: Uint8Array; status: number; headers: [string, string][] }>()

  async match(req: Request): Promise<Response | undefined> {
    const e = this.entries.get(req.url)
    return e && new Response(e.body.slice(), { status: e.status, headers: e.headers })
  }

  async put(req: Request, res: Response): Promise<void> {
    const body = new Uint8Array(await res.arrayBuffer())
    this.entries.set(req.url, { body, status: res.status, headers: [...res.headers] })
  }
}

/** Installs a fresh `caches.default` and returns it. */
export function installMemoryCache(): MemoryCache {
  const cache = new MemoryCache()
  ;(globalThis as unknown as { caches: { default: MemoryCache } }).caches = { default: cache }
  return cache
}

interface Stored {
  data: Uint8Array
  etag: string
  uploaded: Date
  customMetadata?: Record<string, string>
}

let etagSeq = 0

export class MemoryR2 {
  objects = new Map<string, Stored>()
  puts = 0

  async head(key: string) {
    return this.objects.get(key) ? { key } : null
  }

  async get(key: string) {
    const o = this.objects.get(key)
    if (!o) return null
    return {
      key,
      body: new Response(o.data.slice()).body!,
      httpEtag: `"${o.etag}"`,
      uploaded: o.uploaded,
      size: o.data.byteLength,
      customMetadata: o.customMetadata,
      text: async () => new TextDecoder().decode(o.data),
    }
  }

  async put(key: string, value: string, opts?: { customMetadata?: Record<string, string> }) {
    const data = new TextEncoder().encode(value)
    this.objects.set(key, { data, etag: `e${++etagSeq}`, uploaded: new Date(), customMetadata: opts?.customMetadata })
    this.puts++
  }

  asBucket(): R2Bucket {
    return this as unknown as R2Bucket
  }
}
