import { describe, expect, it } from 'vitest'
import { ipKey } from './http'

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
