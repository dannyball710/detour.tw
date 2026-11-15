import { describe, expect, it } from 'vitest'
import { HOSTING_ASNS, TW_ISPS } from './isps'

describe('ISP tables', () => {
  // Hosting wins in classify(): a brand's ASN that is also listed as hosting would never be counted.
  it('no brand ASN is also a hosting / VPN / enterprise ASN', () => {
    const overlap = TW_ISPS.flatMap((i) => i.asns).filter((a) => a in HOSTING_ASNS)
    expect(overlap).toEqual([])
  })

  it('each ASN belongs to one brand only', () => {
    const asns = TW_ISPS.flatMap((i) => i.asns)
    expect(new Set(asns).size).toBe(asns.length)
  })
})
