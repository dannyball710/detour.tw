// Text helpers for hand-written SVG: XML escaping and a small, explicit line breaker.

export function escapeXml(s: string): string {
  return s
    // Characters XML 1.0 forbids outright (they would make resvg reject the whole SVG).
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Punctuation that must not start a line (closing) or end one (opening), per CJK line-breaking
// rules; ASCII equivalents included so mixed text behaves the same.
const NO_LINE_START = new Set('，。：；、！？）」』》〉】,.:;!?)]}%…'.split(''))
const NO_LINE_END = new Set('（「『《〈【([{'.split(''))
const CJK_BREAK_AFTER = new Set('，。：；、！？'.split(''))

const isCjk = (ch: string) => ch.codePointAt(0)! >= 0x2e80

interface Atom {
  text: string
  /** Whether a space separated this atom from the previous one (dropped at a line break). */
  spaceBefore: boolean
}

/** Splits text into unbreakable atoms: single CJK characters, Latin words, punctuation glued to its neighbour. */
export function atoms(text: string): Atom[] {
  const out: Atom[] = []
  let space = false
  for (const ch of text) {
    if (ch === ' ') {
      space = true
      continue
    }
    const prev = out[out.length - 1]
    const glue =
      prev &&
      !space &&
      (NO_LINE_START.has(ch) || NO_LINE_END.has(prev.text.slice(-1)) || (!isCjk(ch) && !isCjk(prev.text.slice(-1))))
    if (glue) prev.text += ch
    else out.push({ text: ch, spaceBefore: space && out.length > 0 })
    space = false
  }
  return out
}

function join(list: Atom[]): string {
  return list.map((a, i) => (i > 0 && a.spaceBefore ? ' ' : '') + a.text).join('')
}

/**
 * Breaks `text` into at most `maxLines` lines with the most even widths (minimising the widest
 * line). Balancing, rather than greedy filling, is what keeps a lone word ("Jose.") from being
 * stranded on the last line. Returns null when even the best split exceeds `maxWidth`.
 */
export function balance(
  text: string,
  maxWidth: number,
  maxLines: number,
  measure: (s: string) => number,
): string[] | null {
  const list = atoms(text)
  const n = list.length
  if (n === 0) return ['']
  const width = (i: number, j: number) => measure(join(list.slice(i, j)))
  if (width(0, n) <= maxWidth) return [join(list)]

  // best[k][i]: smallest possible widest line when atoms[i..n) are set in k lines.
  const best: number[][] = []
  const cut: number[][] = []
  for (let k = 1; k <= maxLines; k++) {
    best[k] = []
    cut[k] = []
    for (let i = 0; i < n; i++) {
      if (k === 1) {
        best[k][i] = width(i, n)
        continue
      }
      best[k][i] = Infinity
      for (let j = i + 1; j < n; j++) {
        const cost = Math.max(width(i, j), best[k - 1][j])
        if (cost < best[k][i]) {
          best[k][i] = cost
          cut[k][i] = j
        }
      }
    }
  }
  // Fewest lines that fit; within that count the split is the most even one.
  let lines = 0
  for (let k = 1; k <= maxLines && !lines; k++) if (best[k][0] <= maxWidth) lines = k
  if (!lines) return null

  // A CJK headline reads best when it breaks at its own punctuation (「出國了：」 / city), so for
  // two lines a fitting break right after full-width punctuation wins over a mid-word one.
  if (lines === 2) {
    let pick = -1
    let pickCost = Infinity
    for (let j = 1; j < n; j++) {
      if (!CJK_BREAK_AFTER.has(list[j - 1].text.slice(-1))) continue
      const cost = Math.max(width(0, j), width(j, n))
      if (cost <= maxWidth && cost < pickCost) {
        pick = j
        pickCost = cost
      }
    }
    if (pick > 0) return [join(list.slice(0, pick)), join(list.slice(pick))]
  }

  const out: string[] = []
  let i = 0
  for (let k = lines; k > 1; k--) {
    const j = cut[k][i]
    out.push(join(list.slice(i, j)))
    i = j
  }
  out.push(join(list.slice(i)))
  return out
}

/**
 * Largest font size (≤ max) at which `text` fits `maxWidth`: one line if that keeps the size at or
 * above `min`, else balanced over up to `maxLines` lines, shrinking further only if it must.
 * `measure` gives the width at size 1.
 */
export function fitLines(
  text: string,
  maxWidth: number,
  max: number,
  min: number,
  maxLines: number,
  measure: (s: string) => number,
): { size: number; lines: string[] } {
  const one = maxWidth / measure(text)
  if (one >= min) return { size: Math.floor(Math.min(max, one)), lines: [text] }
  for (let size = max; size >= min * 0.6; size--) {
    const lines = balance(text, maxWidth, maxLines, (s) => measure(s) * size)
    if (lines) return { size, lines }
  }
  const size = Math.floor(min * 0.6)
  return { size, lines: balance(text, Infinity, maxLines, (s) => measure(s) * size) ?? [text] }
}

/** Cuts `text` with an ellipsis so it fits `maxWidth`. */
export function truncate(text: string, maxWidth: number, measure: (s: string) => number): string {
  if (measure(text) <= maxWidth) return text
  const chars = [...text]
  while (chars.length > 1 && measure(`${chars.join('').trimEnd()}…`) > maxWidth) chars.pop()
  return `${chars.join('').trimEnd()}…`
}
