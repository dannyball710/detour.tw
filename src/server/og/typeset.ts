import type { LoadedFont } from './fonts'
import { escapeXml } from './text'

export type Role = 'figure' | 'mono' | 'body'

export interface TextStyle {
  role: Role
  weight: number
  size: number
  fill: string
  /** Letter spacing in em. */
  tracking?: number
  anchor?: 'start' | 'middle' | 'end'
}

const f = (n: number) => Math.round(n * 100) / 100

/**
 * Picks a loaded font for each string, measures it from the font's own advance widths and emits
 * `<text>` that resvg resolves to exactly that buffer (by the family name inside the font and its
 * OS/2 weight). A string the role's font cannot fully cover (e.g. Chinese in a mono label) is set
 * in the body font instead, so nothing falls back to tofu.
 */
export class Typesetter {
  constructor(
    private fonts: LoadedFont[],
    private families: Record<Role, string>,
  ) {}

  private nearest(family: string, weight: number): LoadedFont | undefined {
    let best: LoadedFont | undefined
    for (const font of this.fonts) {
      if (font.family !== family) continue
      if (!best || Math.abs(font.weight - weight) < Math.abs(best.weight - weight)) best = font
    }
    return best
  }

  font(text: string, role: Role, weight: number): LoadedFont {
    const own = this.nearest(this.families[role], weight)
    const covers = (font: LoadedFont) => [...text].every((ch) => ch === ' ' || font.face.advance(ch.codePointAt(0)!) != null)
    if (own && covers(own)) return own
    const body = this.nearest(this.families.body, weight)
    if (!body) throw new Error(`No ${this.families.body} font loaded`)
    // The subsets hold only the glyphs allText() asked for; anything else would render as tofu.
    if (!covers(body)) console.warn(`og: no loaded font covers every glyph of ${JSON.stringify(text)}`)
    return body
  }

  /** Width in px, including letter spacing after every character (as resvg applies it). */
  width(text: string, style: Omit<TextStyle, 'fill'>): number {
    const face = this.font(text, style.role, style.weight).face
    let em = 0
    let count = 0
    for (const ch of text) {
      em += face.advance(ch.codePointAt(0)!) ?? 0.5
      count++
    }
    return (em + (style.tracking ?? 0) * count) * style.size
  }

  /** Width measurer at font size 1, for the line breaker. */
  measurer(style: Omit<TextStyle, 'fill' | 'size'>): (s: string) => number {
    return (s) => this.width(s, { ...style, size: 1 })
  }

  /** Baseline of a single line set in a box of `lineHeight` × size starting at `top` (CSS half-leading). */
  baseline(text: string, style: Omit<TextStyle, 'fill'>, top: number, lineHeight: number): number {
    const { ascender, descender } = this.font(text, style.role, style.weight).face
    return top + ((lineHeight - (ascender - descender)) * style.size) / 2 + ascender * style.size
  }

  /** Baseline that centres the font's ascender–descender box on `cy`. */
  centred(text: string, style: Omit<TextStyle, 'fill'>, cy: number): number {
    const { ascender, descender } = this.font(text, style.role, style.weight).face
    return cy + ((ascender + descender) / 2) * style.size
  }

  text(text: string, x: number, y: number, style: TextStyle): string {
    const font = this.font(text, style.role, style.weight)
    const tracking = style.tracking ? ` letter-spacing="${f(style.tracking * style.size)}"` : ''
    const anchor = style.anchor && style.anchor !== 'start' ? ` text-anchor="${style.anchor}"` : ''
    return (
      `<text x="${f(x)}" y="${f(y)}" font-family="${escapeXml(font.face.family)}" font-weight="${font.face.weight}" ` +
      `font-size="${f(style.size)}" fill="${style.fill}"${tracking}${anchor}>${escapeXml(text)}</text>`
    )
  }
}
