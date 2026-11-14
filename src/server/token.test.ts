import { describe, expect, it } from 'vitest'
import { createToken, randomId, signToken, taipeiDay, timingSafeEqual, verifyToken } from './token'

const SECRET = 'test-secret'

// Tokens are the only thing tying a submission to a real /api/start call; forging one must be impossible.
describe('test tokens', () => {
  it('round-trips a signed payload', async () => {
    const token = await createToken(SECRET, '1.2.3.4', 'TPE', 1_000)
    const p = await verifyToken(SECRET, token)
    expect(p).toMatchObject({ v: 1, iat: 1_000, colo: 'TPE' })
    expect(p!.ip).toHaveLength(16)
    expect(p!.nonce).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  it('rejects a payload edited after signing (e.g. backdated iat to dodge the 2 s minimum)', async () => {
    const token = await createToken(SECRET, '1.2.3.4', 'TPE', 10_000)
    const [body, sig] = token.split('.')
    const json = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')))
    json.iat = 1
    const forged = btoa(JSON.stringify(json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(await verifyToken(SECRET, `${forged}.${sig}`)).toBeNull()
  })

  it('rejects a flipped signature byte, a wrong secret and garbage', async () => {
    const token = await createToken(SECRET, '1.2.3.4', 'TPE', 1)
    // Flip the first signature char (the last one partly carries padding bits).
    const [body, sig] = token.split('.')
    const flipped = `${body}.${sig[0] === 'A' ? 'B' : 'A'}${sig.slice(1)}`
    expect(await verifyToken(SECRET, flipped)).toBeNull()
    expect(await verifyToken('other-secret', token)).toBeNull()
    expect(await verifyToken(SECRET, 'not-a-token')).toBeNull()
    expect(await verifyToken(SECRET, 'a.b.c')).toBeNull()
  })

  it('rejects a validly signed payload of the wrong version', async () => {
    const token = await signToken(SECRET, { v: 2 as 1, iat: 1, ip: 'x', colo: 'TPE', nonce: 'n' })
    expect(await verifyToken(SECRET, token)).toBeNull()
  })
})

describe('helpers', () => {
  it('public ids are 10 chars of [a-z0-9]', () => {
    for (let i = 0; i < 50; i++) expect(randomId()).toMatch(/^[a-z0-9]{10}$/)
  })

  // Dedup windows and stats days must follow Taiwan's calendar, not UTC.
  it('taipeiDay rolls over at 16:00 UTC', () => {
    expect(taipeiDay(Date.UTC(2026, 10, 14, 15, 59))).toBe('2026-11-14')
    expect(taipeiDay(Date.UTC(2026, 10, 14, 16, 0))).toBe('2026-11-15')
  })

  it('timingSafeEqual', () => {
    expect(timingSafeEqual('abcd', 'abcd')).toBe(true)
    expect(timingSafeEqual('abcd', 'abce')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })
})
