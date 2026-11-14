// HMAC tokens and daily-rotating hashes. WebCrypto only, so it runs in Workers and Node tests alike.

export interface TokenPayload {
  v: 1
  iat: number
  ip: string
  colo: string
  nonce: string
}

const encoder = new TextEncoder()
const keyCache = new Map<string, Promise<CryptoKey>>()

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret)
  if (!key) {
    key = crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ])
    keyCache.set(secret, key)
  }
  return key
}

export function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(message: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(message)))
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  return toHex(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(message)))
}

/** Constant-time string comparison (for equal-length hashes). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** 10-char public id from [a-z0-9], unbiased (rejection sampling). */
export function randomId(length = 10): string {
  let out = ''
  while (out.length < length) {
    for (const b of randomBytes(16)) {
      // 252 = 36 * 7: values above it would favour the first letters.
      if (b < 252 && out.length < length) out += ID_ALPHABET[b % 36]
    }
  }
  return out
}

/** Calendar date (YYYY-MM-DD) in Asia/Taipei, which has no DST. */
export function taipeiDay(ms: number): string {
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10)
}

export async function ipHashForToken(secret: string, ip: string): Promise<string> {
  return (await hmacHex(secret, `tok|${ip}`)).slice(0, 16)
}

export function dailyHash(secret: string, day: string, value: string): Promise<string> {
  return hmacHex(secret, `${day}|${value}`)
}

export async function signToken(secret: string, payload: TokenPayload): Promise<string> {
  const body = base64url(encoder.encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body))
  return `${body}.${base64url(new Uint8Array(sig))}`
}

/** `ipKey`: the client's per-IP identity (see http.ts ipKey), not necessarily the raw address. */
export async function createToken(secret: string, ipKey: string, colo: string, now: number): Promise<string> {
  return signToken(secret, {
    v: 1,
    iat: now,
    ip: await ipHashForToken(secret, ipKey),
    colo,
    nonce: base64url(randomBytes(16)),
  })
}

/** Returns the payload when the signature is valid and the shape is right, otherwise null. */
export async function verifyToken(secret: string, token: string): Promise<TokenPayload | null> {
  if (token.length > 512) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const sig = fromBase64url(parts[1])
  if (!sig || sig.length !== 32) return null
  // subtle.verify compares in constant time.
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sig, encoder.encode(parts[0]))
  if (!ok) return null
  const raw = fromBase64url(parts[0])
  if (!raw) return null
  try {
    const p = JSON.parse(new TextDecoder().decode(raw))
    if (
      p?.v !== 1 ||
      typeof p.iat !== 'number' ||
      typeof p.ip !== 'string' ||
      typeof p.colo !== 'string' ||
      typeof p.nonce !== 'string'
    ) {
      return null
    }
    return { v: 1, iat: p.iat, ip: p.ip, colo: p.colo, nonce: p.nonce }
  } catch {
    return null
  }
}
