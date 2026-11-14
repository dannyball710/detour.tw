// Minimal TrueType/OpenType reader: just enough to measure text (cmap + hmtx), place baselines
// (hhea) and learn the family/weight fontdb (inside resvg) will register the font under (name,
// OS/2). Google Fonts `text=` subsets are small, so everything is read eagerly.

export interface FontFace {
  /** Family name as resvg's fontdb sees it (typographic family, else legacy family). */
  family: string
  weight: number
  unitsPerEm: number
  /** hhea ascender/descender in em (descender is negative). */
  ascender: number
  descender: number
  /** Advance width in em, undefined when the font has no glyph for the code point. */
  advance(codePoint: number): number | undefined
}

export function parseFont(buffer: ArrayBuffer): FontFace {
  const view = new DataView(buffer)
  const tables = new Map<string, number>()
  const numTables = view.getUint16(4)
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    const tag = String.fromCharCode(...new Uint8Array(buffer, rec, 4))
    tables.set(tag, view.getUint32(rec + 8))
  }
  const table = (tag: string) => {
    const offset = tables.get(tag)
    if (offset == null) throw new Error(`Font has no ${tag} table`)
    return offset
  }

  const unitsPerEm = view.getUint16(table('head') + 18)
  const hhea = table('hhea')
  const ascender = view.getInt16(hhea + 4) / unitsPerEm
  const descender = view.getInt16(hhea + 6) / unitsPerEm
  const numberOfHMetrics = view.getUint16(hhea + 34)
  const hmtx = table('hmtx')
  const advanceOf = (glyph: number) =>
    view.getUint16(hmtx + 4 * Math.min(glyph, numberOfHMetrics - 1)) / unitsPerEm

  const glyphOf = readCmap(view, table('cmap'))
  const os2 = tables.get('OS/2')
  const weight = os2 == null ? 400 : view.getUint16(os2 + 4)

  return {
    family: readFamily(view, table('name')),
    weight,
    unitsPerEm,
    ascender,
    descender,
    advance(codePoint) {
      const glyph = glyphOf(codePoint)
      return glyph ? advanceOf(glyph) : undefined
    },
  }
}

function readCmap(view: DataView, cmap: number): (cp: number) => number {
  const count = view.getUint16(cmap + 2)
  let format4 = -1
  let format12 = -1
  for (let i = 0; i < count; i++) {
    const rec = cmap + 4 + i * 8
    const platform = view.getUint16(rec)
    const encoding = view.getUint16(rec + 2)
    const sub = cmap + view.getUint32(rec + 4)
    const format = view.getUint16(sub)
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10))
    if (!unicode) continue
    if (format === 12) format12 = sub
    else if (format === 4) format4 = sub
  }
  if (format12 >= 0) {
    const groups = view.getUint32(format12 + 12)
    return (cp) => {
      for (let g = 0; g < groups; g++) {
        const rec = format12 + 16 + g * 12
        const start = view.getUint32(rec)
        if (cp >= start && cp <= view.getUint32(rec + 4)) return view.getUint32(rec + 8) + (cp - start)
      }
      return 0
    }
  }
  if (format4 < 0) throw new Error('Font has no Unicode cmap (format 4 or 12)')
  const segCount = view.getUint16(format4 + 6) / 2
  const ends = format4 + 14
  const starts = ends + segCount * 2 + 2
  const deltas = starts + segCount * 2
  const rangeOffsets = deltas + segCount * 2
  return (cp) => {
    if (cp > 0xffff) return 0
    for (let s = 0; s < segCount; s++) {
      if (cp > view.getUint16(ends + s * 2)) continue
      const start = view.getUint16(starts + s * 2)
      if (cp < start) return 0
      const delta = view.getInt16(deltas + s * 2)
      const rangeOffset = view.getUint16(rangeOffsets + s * 2)
      if (rangeOffset === 0) return (cp + delta) & 0xffff
      const glyph = view.getUint16(rangeOffsets + s * 2 + rangeOffset + (cp - start) * 2)
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff
    }
    return 0
  }
}

function readFamily(view: DataView, name: number): string {
  const count = view.getUint16(name + 2)
  const strings = name + view.getUint16(name + 4)
  const found = new Map<number, string>()
  for (let i = 0; i < count; i++) {
    const rec = name + 6 + i * 12
    const platform = view.getUint16(rec)
    const language = view.getUint16(rec + 4)
    const id = view.getUint16(rec + 6)
    if (platform !== 3 || (id !== 1 && id !== 16) || (language !== 0x409 && found.has(id))) continue
    const length = view.getUint16(rec + 8)
    const offset = strings + view.getUint16(rec + 10)
    let s = ''
    for (let j = 0; j < length; j += 2) s += String.fromCharCode(view.getUint16(offset + j))
    found.set(id, s)
  }
  const family = found.get(16) ?? found.get(1)
  if (!family) throw new Error('Font has no family name')
  return family
}
