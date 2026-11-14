import { describe, expect, it } from 'vitest'
import { pathFor } from './index'

describe('pathFor', () => {
  it('maps a page to the other language', () => {
    expect(pathFor('/stats', 'en')).toBe('/en/stats')
    expect(pathFor('/en/stats', 'zh')).toBe('/stats')
    expect(pathFor('/en', 'zh')).toBe('/')
    expect(pathFor('/', 'en')).toBe('/en')
  })

  // The language switch on a 404 page links to "this page in the other language"; a path made
  // to start with // would turn that link into one to another site.
  it('never produces a link to another host', () => {
    expect(pathFor('/en//evil.example/x', 'zh')).toBe('/evil.example/x')
    expect(pathFor('//evil.example/x', 'zh')).toBe('/evil.example/x')
    expect(pathFor('//evil.example/x', 'en')).toBe('/en/evil.example/x')
  })
})
