import { edgeCache } from '#/server/http'
import { parseFont, type FontFace } from './ttf'

export interface FontSpec {
  family: string
  weights: number[]
}

export interface LoadedFont {
  /** Family as requested from Google Fonts (the role's family in theme.ts). */
  family: string
  weight: number
  data: Uint8Array
  /** Parsed metrics, plus the family name resvg will know this buffer by. */
  face: FontFace
}

// Bump when the requested families/weights change so stale subsets are not reused.
const FONT_CACHE_VERSION = 1

async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Unique code points of `text` (plus a space), sorted, so the same glyph set always yields the same cache key. */
export function glyphSet(text: string): string {
  return [...new Set(text.replace(/\s/g, '') + ' ')].sort().join('')
}

// The render waits on Google Fonts; a hung request must fail fast so the caller can fall back
// to the static default image instead of timing out the social crawler.
const FETCH_TIMEOUT_MS = 4000

// resvg (fontdb / ttf-parser) reads TTF/OTF but not WOFF2. Google Fonts serves TTF to clients
// without a modern browser UA.
async function fetchCss(spec: FontSpec, text: string): Promise<string> {
  const family = spec.family.replace(/ /g, '+')
  const url = `https://fonts.googleapis.com/css2?family=${family}:wght@${spec.weights.join(';')}&text=${encodeURIComponent(text)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Google Fonts CSS ${res.status} for ${spec.family}`)
  return res.text()
}

function parseFaces(css: string): { weight: number; url: string }[] {
  const faces: { weight: number; url: string }[] = []
  for (const block of css.split('@font-face').slice(1)) {
    const weight = block.match(/font-weight:\s*(\d+)/)?.[1]
    const url = block.match(/src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/)?.[1]
    // Only ever fetch font binaries from Google's font host, whatever the CSS response says.
    if (weight && url && isGstatic(url)) faces.push({ weight: Number(weight), url })
  }
  return faces
}

function isGstatic(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === 'fonts.gstatic.com'
  } catch {
    return false
  }
}

async function loadFamily(spec: FontSpec, text: string, cache: Cache): Promise<LoadedFont[]> {
  const hash = await sha1Hex(text)
  const keyFor = (w: number) =>
    new Request(`https://og-font.cache/v${FONT_CACHE_VERSION}/${encodeURIComponent(spec.family)}/${w}/${hash}.ttf`)
  const loaded = (weight: number, buffer: ArrayBuffer): LoadedFont => ({
    family: spec.family,
    weight,
    data: new Uint8Array(buffer),
    face: parseFont(buffer),
  })

  const cached = await Promise.all(spec.weights.map((w) => cache.match(keyFor(w))))
  if (cached.every((r) => r)) {
    return Promise.all(cached.map(async (r, i) => loaded(spec.weights[i], await r!.arrayBuffer())))
  }

  const faces = parseFaces(await fetchCss(spec, text))
  if (faces.length === 0) throw new Error(`No TTF faces in Google Fonts CSS for ${spec.family}`)
  return Promise.all(
    faces.map(async ({ weight, url }) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      if (!res.ok) throw new Error(`Font binary ${res.status} for ${spec.family} ${weight}`)
      const data = await res.arrayBuffer()
      // Parse before caching: a 200 that is not a font must not be stored for 30 days.
      const font = loaded(weight, data)
      await cache.put(
        keyFor(weight),
        // A copy, so the buffer the parsed font views is never handed to (and detached by) the Response.
        new Response(data.slice(0), { headers: { 'content-type': 'font/ttf', 'cache-control': 'public, max-age=2592000' } }),
      )
      return font
    }),
  )
}

/** Subset fonts containing exactly the glyphs of `text`, cached per family + weight + glyph set. */
export async function loadFonts(specs: FontSpec[], text: string): Promise<LoadedFont[]> {
  const glyphs = glyphSet(text)
  const cache = edgeCache()
  const families = await Promise.all(specs.map((s) => loadFamily(s, glyphs, cache)))
  return families.flat()
}
