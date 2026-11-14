import { describe, expect, it } from 'vitest'
import { OG_VERSION, ogRequest } from './request'

describe('ogRequest', () => {
  const id = 'abc1234567'

  it('ignores unknown and junk parameters, so they cannot create extra renders', () => {
    const plain = ogRequest(`https://detour.tw/api/og/${id}.png?layout=story&lang=en`, id)
    const junk = ogRequest(`https://detour.tw/api/og/${id}.png?lang=en&x=1&layout=story&cb=${Date.now()}`, id)
    expect(junk.key).toBe(plain.key)
    expect(plain.key).toBe(`https://detour.tw/api/og/${id}.png?layout=story&lang=en&v=${OG_VERSION}`)
  })

  it('falls back to the wide Chinese image for missing or unsupported values', () => {
    const r = ogRequest(`https://detour.tw/api/og/${id}.png?layout=square&lang=fr`, id)
    expect(r).toMatchObject({ layout: 'wide', lang: 'zh' })
    expect(r.key).toBe(ogRequest(`https://detour.tw/api/og/${id}.png`, id).key)
  })
})
