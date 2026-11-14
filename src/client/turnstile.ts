// Cloudflare Turnstile, invisible: keeps automated submissions out of the statistics. It never shows
// a challenge and never blocks a test; without a token the result is shown but not stored.

/** Public site keys. Dev uses Cloudflare's invisible always-pass test key. */
export const TURNSTILE_SITE_KEY = '0x4AAAAAAGA-TLnx4f6LdEZp'
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000BB'
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
// The submit waits for a token up to this long (counted from the request) before going without one.
const MAX_WAIT_MS = 15_000
const MAX_RETRIES = 2

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

/**
 * One fresh single-use token. A failed, timed-out or expired challenge is retried up to
 * MAX_RETRIES times with a new widget. Null only when Turnstile is out of reach: script blocked,
 * retries spent, a browser it does not support, a challenge that would need the visitor (we never
 * show one), the 15 s ceiling, or `signal` aborted by the caller.
 */
export function turnstileToken(signal?: AbortSignal): Promise<string | null> {
  return new Promise((resolve) => {
    let widget: string | undefined
    let host: HTMLElement | null = null
    let attempt = 0
    let done = false
    const clear = () => {
      try {
        if (widget) window.turnstile?.remove(widget)
      } catch {
        // Already gone.
      }
      widget = undefined
      host?.remove()
      host = null
    }
    const finish = (token: string | null) => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      clear()
      resolve(token)
    }
    const abort = () => finish(null)
    const timer = setTimeout(abort, MAX_WAIT_MS)
    if (signal?.aborted) return abort()
    signal?.addEventListener('abort', abort)

    const run = (ts: Turnstile) => {
      clear()
      const mine = ++attempt
      // Callbacks of a widget already replaced by a retry are ignored.
      const live = (fn: () => void) => () => {
        if (mine === attempt) fn()
      }
      const retry = live(() => (attempt <= MAX_RETRIES ? run(ts) : finish(null)))
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
          // Retries are ours (a fresh widget each time), so Turnstile's own are off.
          retry: 'never',
          'refresh-expired': 'never',
          callback: (token: string) => {
            if (mine === attempt) finish(token)
          },
          'before-interactive-callback': live(() => finish(null)),
          'unsupported-callback': live(() => finish(null)),
          'timeout-callback': retry,
          'expired-callback': retry,
          // Returning true marks the error as handled, so Turnstile does not throw it to the console.
          'error-callback': () => {
            retry()
            return true
          },
        })
        if (!widget) retry()
      } catch {
        retry()
      }
    }

    loadTurnstile().then((ts) => {
      if (done) return
      if (!ts) return finish(null)
      run(ts)
    })
  })
}
