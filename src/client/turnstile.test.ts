import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TURNSTILE_TEST_SITE_KEY, turnstileToken } from './turnstile'

type Options = Record<string, (...a: unknown[]) => unknown> & { sitekey?: string }

// Just enough DOM for the module: elements that can be appended and removed.
function fakeDom() {
  const appended: { kind: string; el: Record<string, unknown> }[] = []
  const element = (kind: string) => {
    const el: Record<string, unknown> = { style: {}, setAttribute: () => undefined, remove: () => (el.removed = true) }
    return { kind, el }
  }
  vi.stubGlobal('document', {
    createElement: (kind: string) => {
      const e = element(kind)
      appended.push(e)
      return e.el
    },
    body: { appendChild: () => undefined },
    head: { appendChild: () => undefined },
  })
  return appended
}

// Like the real widget, rendering starts the challenge and its outcome arrives later.
function fakeTurnstile(onRun: (o: Options) => void) {
  const rendered: Options[] = []
  const removed: string[] = []
  const ts = {
    render: (_el: unknown, o: Options) => {
      rendered.push(o)
      queueMicrotask(() => onRun(o))
      return `w${rendered.length}`
    },
    remove: (id: string) => removed.push(id),
  }
  vi.stubGlobal('window', { turnstile: ts })
  return { rendered, removed }
}

beforeEach(() => {
  vi.useFakeTimers()
  fakeDom()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('turnstileToken', () => {
  it('returns the token and tears the widget down, using the always-pass key in dev', async () => {
    const { rendered, removed } = fakeTurnstile((o) => o.callback('tok-1'))
    await expect(turnstileToken()).resolves.toBe('tok-1')
    expect(rendered[0].sitekey).toBe(TURNSTILE_TEST_SITE_KEY)
    expect(removed).toEqual(['w1'])
  })

  // Tokens are single-use: a retest must not reuse the previous widget's token.
  it('renders a fresh widget for every submit', async () => {
    let n = 0
    const { rendered } = fakeTurnstile((o) => o.callback(`tok-${++n}`))
    await expect(turnstileToken()).resolves.toBe('tok-1')
    await expect(turnstileToken()).resolves.toBe('tok-2')
    expect(rendered).toHaveLength(2)
  })

  // We never show a challenge: the visitor would see a box they did not ask for.
  it('gives up with null instead of letting an interactive challenge appear', async () => {
    fakeTurnstile((o) => o['before-interactive-callback']())
    await expect(turnstileToken()).resolves.toBeNull()
  })

  // A passing hiccup must not cost the visitor a stored result: retry with a fresh widget.
  it('retries an error with a new widget, and marks the error handled', async () => {
    let n = 0
    let handled: unknown
    const { rendered, removed } = fakeTurnstile((o) => {
      if (++n === 1) handled = o['error-callback']()
      else o.callback('tok-2')
    })
    await expect(turnstileToken()).resolves.toBe('tok-2')
    expect(handled).toBe(true)
    expect(rendered).toHaveLength(2)
    expect(removed).toEqual(['w1', 'w2'])
  })

  it('retries a timed-out or expired challenge too', async () => {
    let n = 0
    fakeTurnstile((o) => {
      n++
      if (n === 1) o['timeout-callback']()
      else if (n === 2) o['expired-callback']()
      else o.callback('tok-3')
    })
    await expect(turnstileToken()).resolves.toBe('tok-3')
  })

  it('gives up with null after two retries', async () => {
    const { rendered } = fakeTurnstile((o) => o['error-callback']())
    await expect(turnstileToken()).resolves.toBeNull()
    expect(rendered).toHaveLength(3)
  })

  // A replaced widget may still report; its word no longer counts.
  it('ignores a late token from a widget already replaced by a retry', async () => {
    let first: Options | undefined
    fakeTurnstile((o) => {
      if (!first) {
        first = o
        o['error-callback']()
      }
    })
    const token = turnstileToken()
    await vi.advanceTimersByTimeAsync(0)
    first!.callback('stale')
    let settled = false
    token.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)
  })

  // A failed test no longer wants a token; the widget must not linger after that.
  it('resolves null and removes the widget when the caller gives up', async () => {
    const { removed } = fakeTurnstile(() => undefined)
    const ctrl = new AbortController()
    const token = turnstileToken(ctrl.signal)
    await vi.advanceTimersByTimeAsync(500)
    ctrl.abort()
    await expect(token).resolves.toBeNull()
    expect(removed).toEqual(['w1'])
  })

  it('does not even render when the caller has already given up', async () => {
    const { rendered } = fakeTurnstile(() => undefined)
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(turnstileToken(ctrl.signal)).resolves.toBeNull()
    await vi.advanceTimersByTimeAsync(0)
    expect(rendered).toHaveLength(0)
  })

  // The submit waits for a token, but never forever: the visitor must still get a result.
  it('gives up after a 15 s ceiling', async () => {
    fakeTurnstile(() => undefined)
    const token = turnstileToken()
    let settled = false
    token.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(14_999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(token).resolves.toBeNull()
  })

  it('resolves null when the script is blocked', async () => {
    vi.stubGlobal('window', {})
    const appended = fakeDom()
    const token = turnstileToken()
    const script = appended.find((e) => e.kind === 'script')!.el
    ;(script.onerror as () => void)()
    await expect(token).resolves.toBeNull()
  })
})
