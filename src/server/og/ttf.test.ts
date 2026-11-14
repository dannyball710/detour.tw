import { describe, expect, it } from 'vitest'
import { parseFont } from './ttf'

// Builds a minimal TrueType font in memory: just the tables parseFont reads, laid out the way
// Google's subsets are (cmap format 4, legacy family name only, static OS/2 weight).
function buildFont(opts: { family: string; weight: number; glyphs: [cp: number, advance: number][] }): ArrayBuffer {
  const upm = 1000
  const tables: Record<string, Uint8Array> = {}
  const table = (tag: string, size: number, fill: (v: DataView) => void) => {
    const bytes = new Uint8Array(size)
    fill(new DataView(bytes.buffer))
    tables[tag] = bytes
  }
  const glyphs = [...opts.glyphs].sort((a, b) => a[0] - b[0])

  table('head', 54, (v) => v.setUint16(18, upm))
  table('hhea', 36, (v) => {
    v.setInt16(4, 900)
    v.setInt16(6, -250)
    v.setUint16(34, glyphs.length + 1)
  })
  table('hmtx', (glyphs.length + 1) * 4, (v) => {
    v.setUint16(0, 500) // .notdef
    glyphs.forEach(([, adv], i) => v.setUint16((i + 1) * 4, adv))
  })
  // One segment per glyph plus the 0xFFFF terminator; glyph ids via idDelta.
  const segs = glyphs.length + 1
  table('cmap', 4 + 8 + 16 + segs * 8, (v) => {
    v.setUint16(2, 1)
    v.setUint16(4, 3)
    v.setUint16(6, 1)
    v.setUint32(8, 12)
    const s = 12
    v.setUint16(s, 4)
    v.setUint16(s + 6, segs * 2)
    const ends = s + 14
    const starts = ends + segs * 2 + 2
    const deltas = starts + segs * 2
    glyphs.forEach(([cp], i) => {
      v.setUint16(ends + i * 2, cp)
      v.setUint16(starts + i * 2, cp)
      v.setInt16(deltas + i * 2, (i + 1 - cp) & 0xffff)
    })
    v.setUint16(ends + glyphs.length * 2, 0xffff)
    v.setUint16(starts + glyphs.length * 2, 0xffff)
    v.setInt16(deltas + glyphs.length * 2, 1)
  })
  const name = [...opts.family].flatMap((c) => [0, c.charCodeAt(0)])
  table('name', 6 + 12 + name.length, (v) => {
    v.setUint16(2, 1)
    v.setUint16(4, 18)
    v.setUint16(6, 3)
    v.setUint16(8, 1)
    v.setUint16(10, 0x409)
    v.setUint16(12, 1)
    v.setUint16(14, name.length)
    name.forEach((b, i) => v.setUint8(18 + i, b))
  })
  table('OS/2', 78, (v) => v.setUint16(4, opts.weight))

  const tags = Object.keys(tables)
  let offset = 12 + tags.length * 16
  const total = tags.reduce((n, t) => n + tables[t].length, offset)
  const out = new Uint8Array(total)
  const dir = new DataView(out.buffer)
  dir.setUint32(0, 0x00010000)
  dir.setUint16(4, tags.length)
  tags.forEach((tag, i) => {
    ;[...tag].forEach((c, j) => dir.setUint8(12 + i * 16 + j, c.charCodeAt(0)))
    dir.setUint32(12 + i * 16 + 8, offset)
    dir.setUint32(12 + i * 16 + 12, tables[tag].length)
    out.set(tables[tag], offset)
    offset += tables[tag].length
  })
  return out.buffer
}

describe('parseFont', () => {
  const font = buildFont({ family: 'Noto Sans TC Black', weight: 900, glyphs: [[0x41, 600], [0x4f60, 1000]] })

  it('reports the family and weight resvg registers the buffer under', () => {
    const face = parseFont(font)
    expect(face.family).toBe('Noto Sans TC Black')
    expect(face.weight).toBe(900)
  })

  it('reads metrics in em and advances per code point, undefined for missing glyphs', () => {
    const face = parseFont(font)
    expect(face.ascender).toBeCloseTo(0.9)
    expect(face.descender).toBeCloseTo(-0.25)
    expect(face.advance(0x41)).toBeCloseTo(0.6)
    expect(face.advance(0x4f60)).toBeCloseTo(1)
    expect(face.advance(0x42)).toBeUndefined()
  })

  it('throws on a truncated buffer instead of returning garbage metrics', () => {
    expect(() => parseFont(font.slice(0, 40))).toThrow()
    expect(() => parseFont(font.slice(0, font.byteLength - 120))).toThrow()
  })
})
