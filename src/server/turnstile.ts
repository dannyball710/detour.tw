import { fromBase64url } from './token'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TIMEOUT_MS = 3000
const MAX_TOKEN_LENGTH = 2048

/**
 * siteverify wants a UUID as idempotency_key. The submit token's nonce is 16 random bytes, so it maps to a
 * deterministic UUIDv4: a retried verification of the same submission reuses the same key.
 */
export function nonceToUuid(nonce: string): string {
  const b = fromBase64url(nonce)
  if (!b || b.length !== 16) return crypto.randomUUID()
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export interface TurnstileConfig {
  secret: string
  /** Expected widget hostname; null skips the check (local dev). */
  hostname: string | null
}

/**
 * Server-side Turnstile check. Any doubt (missing token or secret, network error, non-200, timeout,
 * failure, wrong hostname) counts as not verified. Only Cloudflare's error codes are logged — never
 * the token or the IP.
 */
export async function verifyTurnstile(
  config: TurnstileConfig,
  token: string | null,
  remoteIp: string,
  nonce: string,
): Promise<boolean> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return false
  if (!config.secret) {
    console.error('turnstile: TURNSTILE_SECRET is not set')
    return false
  }
  try {
    const form = new FormData()
    form.append('secret', config.secret)
    form.append('response', token)
    form.append('remoteip', remoteIp)
    form.append('idempotency_key', nonceToUuid(nonce))
    const res = await fetch(SITEVERIFY_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) {
      console.warn('turnstile: siteverify status', res.status)
      return false
    }
    const out = (await res.json()) as { success?: boolean; hostname?: string; 'error-codes'?: string[] }
    if (out.success !== true) {
      console.warn('turnstile: not verified', out['error-codes'] ?? [])
      return false
    }
    if (config.hostname != null && out.hostname !== config.hostname) {
      console.warn('turnstile: hostname mismatch')
      return false
    }
    return true
  } catch (e) {
    console.warn('turnstile: siteverify unreachable', e instanceof Error ? e.name : 'error')
    return false
  }
}
