import { describe, expect, it } from 'vitest'
import { kmFigure } from './format'

// The big distance figure has room for four digits; longer detours read in thousands.
describe('kmFigure', () => {
  it('keeps the full number below 10,000 km', () => {
    expect(kmFigure(3230)).toBe('3,230')
    expect(kmFigure(9999)).toBe('9,999')
  })

  it('switches to thousands with one decimal from 10,000 km', () => {
    expect(kmFigure(10_000)).toBe('10.0k')
    expect(kmFigure(10_049)).toBe('10.0k')
    expect(kmFigure(10_781)).toBe('10.8k')
    expect(kmFigure(18_569)).toBe('18.6k')
  })

  it('rounds half up, not to the nearest float', () => {
    expect(kmFigure(10_050)).toBe('10.1k')
    expect(kmFigure(99_950)).toBe('100.0k')
  })

  it('decides on the rounded distance', () => {
    expect(kmFigure(9999.4)).toBe('9,999')
    expect(kmFigure(9999.5)).toBe('10.0k')
  })
})
