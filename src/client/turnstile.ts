// Cloudflare Turnstile, invisible: keeps automated submissions out of the statistics. It never shows
// a challenge and never blocks a test; without a token the result is shown but not stored.

/** Public site keys. Dev uses Cloudflare's invisible always-pass test key. */
export const TURNSTILE_SITE_KEY = '0x4AAAAAAGA-TLnx4f6LdEZp'
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000BB'
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const TOKEN_WAIT_MS = 3000

interface Turnstile {
  render: (el: HTMLElement, options: Record<string, unknown>) => string | undefined
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

let loading: Promise<Turnstile | null> | null = null

/** Starts loading the script once; resolves to null when it cannot load (blocked, offline). */
export function loadTurnstile(): Promise<Turnstile | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!loading) {
    loading = new Promise((resolve) => {
      const script = document.createElement('script')
      script.src = SCRIPT_URL
      script.async = true
      script.defer = true
      script.onload = () => resolve(window.turnstile ?? null)
      script.onerror = () => {
        // A later test may try again (the network may be back).
        loading = null
        script.remove()
        resolve(null)
      }
      document.head.appendChild(script)
    })
  }
  return loading
}

/** True once the script is in, or after `ms`: the measurement waits on this so the download never overlaps a timed request. */
export function turnstileSettled(ms: number): Promise<void> {
  return Promise.race([loadTurnstile().then(() => undefined), new Promise<void>((r) => setTimeout(r, ms))])
}

/**
 * One fresh single-use token, or null within ~3 s when there is none: script blocked, error,
 * timeout, or a challenge that would need the visitor (we never show one).
 */
export function turnstileToken(): Promise<string | null> {
  return new Promise((resolve) => {
    let widget: string | undefined
    let host: HTMLElement | null = null
    let done = false
    const finish = (token: string | null) => {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        if (widget) window.turnstile?.remove(widget)
      } catch {
        // Already gone.
      }
      host?.remove()
      resolve(token)
    }
    const timer = setTimeout(() => finish(null), TOKEN_WAIT_MS)
    loadTurnstile().then((ts) => {
      if (done) return
      if (!ts) return finish(null)
      // Zero-size and clipped: even an interactive challenge could never become visible.
      host = document.createElement('div')
      host.setAttribute('aria-hidden', 'true')
      host.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;overflow:hidden;pointer-events:none'
      document.body.appendChild(host)
      try {
        widget = ts.render(host, {
          sitekey: import.meta.env.DEV ? TURNSTILE_TEST_SITE_KEY : TURNSTILE_SITE_KEY,
          // Rendered only when a token is wanted, so rendering is what runs the challenge.
          appearance: 'interaction-only',
          size: 'flexible',
          retry: 'never',
          'refresh-expired': 'never',
          callback: (token: string) => finish(token),
          'before-interactive-callback': () => finish(null),
          'unsupported-callback': () => finish(null),
          'timeout-callback': () => finish(null),
          'expired-callback': () => finish(null),
          // Returning true marks the error as handled, so Turnstile does not throw it to the console.
          'error-callback': () => {
            finish(null)
            return true
          },
        })
        if (!widget) finish(null)
      } catch {
        finish(null)
      }
    })
  })
}
