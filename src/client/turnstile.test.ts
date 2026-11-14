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

  it('treats a widget error as no token, and marks the error handled', async () => {
    let handled: unknown
    fakeTurnstile((o) => (handled = o['error-callback']()))
    await expect(turnstileToken()).resolves.toBeNull()
    expect(handled).toBe(true)
  })

  // The submit must never hang on Turnstile.
  it('submits without a token after 3 s of silence', async () => {
    fakeTurnstile(() => undefined)
    const token = turnstileToken()
    await vi.advanceTimersByTimeAsync(2999)
    let settled = false
    token.then(() => (settled = true))
    await Promise.resolve()
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
