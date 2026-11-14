import { describe, expect, it } from 'vitest'
import { atoms, balance, escapeXml, fitLines, truncate } from './text'

// Monospace stand-in for font metrics: CJK = 1 unit, everything else 0.5.
const measure = (s: string) => [...s].reduce((w, ch) => w + (ch.codePointAt(0)! >= 0x2e80 ? 1 : 0.5), 0)

describe('escapeXml', () => {
  it('escapes every XML-significant character so result text cannot break the SVG', () => {
    expect(escapeXml(`AT&T <"x"> 'y'`)).toBe('AT&amp;T &lt;&quot;x&quot;&gt; &apos;y&apos;')
  })
})

describe('atoms', () => {
  it('keeps closing CJK punctuation with the character before it', () => {
    expect(atoms('出國了：洛杉磯').map((a) => a.text)).toEqual(['出', '國', '了：', '洛', '杉', '磯'])
  })

  it('treats Latin words as unbreakable and remembers the spaces between them', () => {
    expect(atoms('left: San Jose.')).toEqual([
      { text: 'left:', spaceBefore: false },
      { text: 'San', spaceBefore: true },
      { text: 'Jose.', spaceBefore: true },
    ])
  })
})

describe('balance', () => {
  it('returns one line when the text fits', () => {
    expect(balance('Hello world', 100, 2, measure)).toEqual(['Hello world'])
  })

  it('never strands a single word on the last line of an English headline', () => {
    const lines = balance('Your connection left the country: San Jose.', 20, 2, measure)!
    expect(lines).toHaveLength(2)
    expect(lines[1].split(' ').length).toBeGreaterThan(1)
    expect(lines.join(' ')).toBe('Your connection left the country: San Jose.')
  })

  it('never starts a CJK line with closing punctuation', () => {
    const lines = balance('你的網路出國了：阿迪斯阿貝巴', 8, 2, measure)!
    expect(lines).toHaveLength(2)
    for (const line of lines) expect('，。：、！？」').not.toContain(line[0])
    expect(lines.join('')).toBe('你的網路出國了：阿迪斯阿貝巴')
  })

  it('breaks a long CJK headline after its colon rather than inside the city name', () => {
    expect(balance('你的網路出國了：聖地牙哥德洛斯卡巴耶羅斯', 13, 2, measure)).toEqual([
      '你的網路出國了：',
      '聖地牙哥德洛斯卡巴耶羅斯',
    ])
  })

  it('uses the fewest lines that fit', () => {
    expect(balance('aa bb cc dd', 4, 3, measure)).toHaveLength(2)
  })

  it('reports null when the text cannot fit in the allowed lines', () => {
    expect(balance('一二三四五六', 2, 2, measure)).toBeNull()
  })
})

describe('fitLines', () => {
  it('prefers one smaller line over wrapping while the size stays above the minimum', () => {
    expect(fitLines('沒繞路，你的連線在台北落地', 400, 40, 28, 2, measure)).toEqual({ size: 30, lines: ['沒繞路，你的連線在台北落地'] })
  })

  it('wraps at full size once one line would drop below the minimum', () => {
    const fit = fitLines('Your connection left the country: Los Angeles.', 500, 34, 25, 2, measure)
    expect(fit.size).toBe(34)
    expect(fit.lines).toHaveLength(2)
  })
})

describe('truncate', () => {
  it('adds an ellipsis only when needed and stays within the width', () => {
    expect(truncate('KDDI', 10, measure)).toBe('KDDI')
    const cut = truncate('Taiwan Fixed Network Co., Ltd.', 8, measure)
    expect(cut.endsWith('…')).toBe(true)
    expect(measure(cut)).toBeLessThanOrEqual(8)
  })
})
