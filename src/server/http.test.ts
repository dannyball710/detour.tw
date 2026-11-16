import { describe, expect, it } from 'vitest'
import { ipKey, isForeignOrigin } from './http'

describe('isForeignOrigin', () => {
  const ALLOWED = 'https://detour.tw'
  const req = (origin?: string, url = 'https://detour.tw/api/submit') =>
    new Request(url, { method: 'POST', headers: origin != null ? { origin } : {} })

  it('our listed site is not foreign', () => {
    expect(isForeignOrigin(req('https://detour.tw'), ALLOWED)).toBe(false)
  })

  it('another site, a lookalike subdomain or an opaque "null" origin is foreign', () => {
    expect(isForeignOrigin(req('https://evil.example'), ALLOWED)).toBe(true)
    expect(isForeignOrigin(req('https://detour.tw.evil.example'), ALLOWED)).toBe(true)
    expect(isForeignOrigin(req('http://detour.tw'), ALLOWED)).toBe(true)
    expect(isForeignOrigin(req('null'), ALLOWED)).toBe(true)
  })

  // Our pages always send Origin with the POST; a request without it is a script, not our page.
  it('no Origin header is foreign', () => {
    expect(isForeignOrigin(req(), ALLOWED)).toBe(true)
  })

  // Test domains bound to the same Worker run the same code: their own pages must not store results.
  it('another domain bound to this Worker is foreign on its own pages', () => {
    expect(isForeignOrigin(req('https://test.example', 'https://test.example/api/submit'), ALLOWED)).toBe(true)
  })

  // The dev server runs on localhost at whatever port; only there is the own origin trusted.
  it('the own origin passes only on the dev server', () => {
    const local = req('http://localhost:3100', 'http://localhost:3100/api/submit')
    expect(isForeignOrigin(local, ALLOWED, true)).toBe(false)
    expect(isForeignOrigin(local, ALLOWED, false)).toBe(true)
  })

  it('matches listed origins exactly, ignoring spaces and a trailing slash', () => {
    const list = ' https://www.detour.tw/ ,https://detour.tw'
    expect(isForeignOrigin(req('https://www.detour.tw'), list)).toBe(false)
    expect(isForeignOrigin(req('https://detour.tw'), list)).toBe(false)
    expect(isForeignOrigin(req('https://www.detour.tw.evil'), list)).toBe(true)
  })

  it('a stray comma or a listed "null" never lets an empty or opaque origin through', () => {
    expect(isForeignOrigin(req('null'), 'null,')).toBe(true)
    expect(isForeignOrigin(req(''), 'https://detour.tw,')).toBe(true)
    expect(isForeignOrigin(req('https://detour.tw'), '')).toBe(true)
  })
})

// One IPv6 household owns a whole /64; keying by full address would let it rotate past every per-IP control.
describe('ipKey', () => {
  it('IPv4 is kept as is', () => {
    expect(ipKey('203.0.113.7')).toBe('203.0.113.7')
  })

  it('IPv6 collapses to its /64, whatever the notation', () => {
    const key = '2001:db8:1:2::/64'
    expect(ipKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe(key)
    expect(ipKey('2001:0DB8:0001:0002::1')).toBe(key)
    expect(ipKey('2001:db8:1:2::')).toBe(key)
    expect(ipKey('2001:db8:1:2:0:0:0:ffff')).toBe(key)
  })

  it('different /64s stay different, including zero-compressed prefixes', () => {
    expect(ipKey('2001:db8:1:3::1')).toBe('2001:db8:1:3::/64')
    expect(ipKey('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(ipKey('::1')).toBe('0:0:0:0::/64')
  })

  it('IPv4-mapped IPv6 is treated as the IPv4 address', () => {
    expect(ipKey('::ffff:203.0.113.7')).toBe('203.0.113.7')
  })

  it('a trailing dotted IPv4 counts as two groups when expanding ::', () => {
    expect(ipKey('64:ff9b:1:2::203.0.113.7')).toBe('64:ff9b:1:2::/64')
    expect(ipKey('64:ff9b::203.0.113.7')).toBe('64:ff9b:0:0::/64')
  })
})
