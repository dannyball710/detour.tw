import { Resvg, initWasm } from '@resvg/resvg-wasm'
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm'
import type { Lang, TestResult } from '#/lib/types'
import { allText, buildCopy, type CardCopy } from './copy'
import { loadFonts } from './fonts'
import { buildMap } from './map'
import { FOCUS, SIZES, card, type Layout } from './template'
import { BODY_FAMILY, FIGURE_FAMILY, FONTS, MONO_FAMILY } from './theme'
import { Typesetter } from './typeset'

// Workers forbid compiling wasm from bytes at runtime, so resvg gets a precompiled
// WebAssembly.Module import (the Cloudflare Vite plugin bundles *.wasm as CompiledWasm).
// Init once per isolate; a failed init is retried on the next request.
let resvgReady: Promise<void> | null = null
function ensureResvg(): Promise<void> {
  resvgReady ??= initWasm(resvgWasm).catch((err) => {
    // resvg keeps its own module-level state; after a dev HMR reload this module forgets it.
    if (String(err).includes('Already initialized')) return
    resvgReady = null
    throw err
  })
  return resvgReady
}

function buildSvg(result: TestResult, copy: CardCopy, layout: Layout, ts: Typesetter): string {
  const size = SIZES[layout]
  const map = buildMap(result, size, FOCUS[layout])
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">` +
    map.svg +
    card(layout, copy, map, ts) +
    `</svg>`
  )
}

export async function renderOgPng(result: TestResult, layout: Layout, lang: Lang): Promise<Uint8Array<ArrayBuffer>> {
  const copy = buildCopy(result, lang)
  const [fonts] = await Promise.all([loadFonts(FONTS, allText(copy)), ensureResvg()])
  const ts = new Typesetter(fonts, { figure: FIGURE_FAMILY, mono: MONO_FAMILY, body: BODY_FAMILY })
  const svg = buildSvg(result, copy, layout, ts)

  // Only the subset buffers are loaded; every <text> names one of them by its internal family
  // name and weight (see Typesetter), so nothing resolves to a fallback face.
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: {
      fontBuffers: fonts.map((font) => font.data),
      defaultFontFamily: fonts.find((font) => font.family === BODY_FAMILY)?.face.family,
      loadSystemFonts: false,
    },
  })
  // wasm memory is not garbage-collected: free it even when rendering throws.
  let image: ReturnType<typeof resvg.render> | undefined
  try {
    image = resvg.render()
    return image.asPng() as Uint8Array<ArrayBuffer>
  } finally {
    image?.free()
    resvg.free()
  }
}
