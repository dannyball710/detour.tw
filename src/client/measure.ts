import type { Lang, StartResponse, SubmitRequest, TestResult, Trace } from '#/lib/types'
import { KEYS, readStore, writeStore } from './storage'
import { turnstileToken } from './turnstile'

export type MeasureErrorKind = 'failed' | 'rate' | 'offline'

export class MeasureError extends Error {
  constructor(public kind: MeasureErrorKind) {
    super(kind)
  }
}

export interface MeasureProgress {
  /** 0 正在追蹤 → 1 搭飛機 → 2 落地了 */
  step: 0 | 1 | 2
  /** Landing colo of our hostname, known after the warm-up request. */
  colo?: string
  /** Who the server sees, from the reply that starts the test: the UI can place the visitor at once. */
  user?: TestResult['user']
  isp?: TestResult['isp']
}

const SAMPLES = 5
const FETCH_TIMEOUT_MS = 4000
const TEST_BUDGET_MS = 15000
// A request lost in a network black hole (a captive portal, a Wi-Fi hand-over) would otherwise
// hang until the browser gives up, minutes later, with the test stuck on screen.
const START_TIMEOUT_MS = 8000
const SUBMIT_TIMEOUT_MS = 10000
// The server rejects tokens younger than 2 s (a real test takes that long); keep a margin.
const MIN_TOKEN_AGE_MS = 2300
const REF_URL = 'https://cloudflare.com/cdn-cgi/trace'

function ownTraceUrl(): string {
  // Localhost has no /cdn-cgi/trace; the dev API mimics it.
  return import.meta.env.DEV ? '/api/dev-trace' : `${location.origin}/cdn-cgi/trace`
}

export function parseTrace(text: string): Trace {
  const kv: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const i = line.indexOf('=')
    if (i > 0) kv[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return {
    colo: kv.colo ?? '',
    ip: kv.ip ?? '',
    ts: Number(kv.ts) || 0,
    loc: kv.loc ?? '',
    warp: kv.warp ?? 'off',
    gateway: kv.gateway ?? 'off',
    http: kv.http ?? '',
  }
}

/**
 * Runs requests that give up after `ms`, body included: the abort surfaces as an ordinary
 * failed request.
 */
async function within<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Math.max(0, ms))
  try {
    return await run(ctrl.signal)
  } finally {
    clearTimeout(timer)
  }
}

function timedTrace(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<{ ms: number; trace: Trace }> {
  return within(timeoutMs, async (signal) => {
    const sep = url.includes('?') ? '&' : '?'
    const t0 = performance.now()
    const res = await fetch(`${url}${sep}_=${Math.random().toString(36).slice(2)}`, {
      cache: 'no-store',
      credentials: 'omit',
      signal,
    })
    const text = await res.text()
    const ms = performance.now() - t0
    if (!res.ok) throw new Error(`trace ${res.status}`)
    const trace = parseTrace(text)
    if (!/^[A-Z]{3}$/.test(trace.colo)) throw new Error('trace without colo')
    return { ms, trace }
  })
}

export function getDeviceId(): string {
  const existing = readStore(KEYS.device)
  if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  writeStore(KEYS.device, id)
  return id
}

export function getContribute(): boolean {
  return readStore(KEYS.contribute) !== 'false'
}

export function setContribute(on: boolean): void {
  writeStore(KEYS.contribute, on ? 'true' : 'false')
}

export function connectionType(): string | null {
  const conn = (navigator as Navigator & { connection?: { type?: string } }).connection
  return conn?.type ?? null
}

// Server validation wants 3–10 finite numbers in [1, 5000].
const toRtt = (ms: number) => Math.min(5000, Math.max(1, Math.round(ms * 10) / 10))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function runMeasurement(lang: Lang, onProgress: (p: MeasureProgress) => void): Promise<TestResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new MeasureError('offline')
  // A failed test no longer wants a token: this stops Turnstile and removes its widget.
  const tokenWait = new AbortController()
  const fail = (e: unknown): never => {
    tokenWait.abort()
    if (e instanceof MeasureError) throw e
    throw new MeasureError(navigator.onLine === false ? 'offline' : 'failed')
  }

  onProgress({ step: 0 })
  const startedAt = performance.now()
  let start: StartResponse
  try {
    start = await within(START_TIMEOUT_MS, async (signal) => {
      const res = await fetch('/api/start', { cache: 'no-store', signal })
      if (res.status === 429) throw new MeasureError('rate')
      if (!res.ok) throw new MeasureError('failed')
      return (await res.json()) as StartResponse
    })
  } catch (e) {
    return fail(e)
  }
  // The server dates the token when /api/start arrives; counting from our response (not our request)
  // keeps the minimum age even when /api/start had to open a fresh, slow connection.
  const tokenAt = performance.now()

  const who = { user: start.user, isp: start.isp }
  onProgress({ step: 0, ...who })
  // Turnstile only gates the submit, so it runs alongside the timed requests instead of after them
  // (owner's call: a little overlapping traffic over a result ~2 s later). Opted out, nothing is
  // stored, so the server skips the check and so do we.
  const contribute = getContribute()
  const turnstile = contribute ? turnstileToken(tokenWait.signal) : Promise.resolve(null)

  // No request may run past the test's budget: the 15 s limit is a real ceiling.
  const budget = () => Math.min(FETCH_TIMEOUT_MS, TEST_BUDGET_MS - (performance.now() - startedAt))

  const ownUrl = ownTraceUrl()
  let ownTrace: Trace
  try {
    ownTrace = (await timedTrace(ownUrl, budget())).trace
  } catch (e) {
    return fail(e)
  }
  const seen = { colo: ownTrace.colo, ...who }
  onProgress({ step: 1, ...seen })
  // A blocked or failing baseline must not fail the test (extensions often block cloudflare.com).
  let refTrace: Trace | null = await timedTrace(REF_URL, budget()).then(
    (r) => r.trace,
    () => null,
  )

  const ownRtts: number[] = []
  const refRtts: number[] = []
  for (let i = 0; i < SAMPLES; i++) {
    if (budget() <= 0) break
    try {
      const r = await timedTrace(ownUrl, budget())
      ownRtts.push(toRtt(r.ms))
    } catch {
      // A single lost sample is tolerated; too few samples fails below.
    }
    if (refTrace && budget() > 0) {
      try {
        const r = await timedTrace(REF_URL, budget())
        refRtts.push(toRtt(r.ms))
      } catch {
        // Same tolerance as above.
      }
    }
  }
  if (ownRtts.length < 3) return fail(null)
  if (refRtts.length < 3) refTrace = null

  const wait = MIN_TOKEN_AGE_MS - (performance.now() - tokenAt)
  if (wait > 0) await sleep(wait)
  onProgress({ step: 2, ...seen })
  // Submit only with a token in hand: the "landed" state stays up while a slow one arrives. Null
  // means Turnstile is out of reach (blocked, retries spent, 15 s): the visitor still gets a result.
  const token = await turnstile

  const conn = connectionType()
  const body: SubmitRequest = {
    token: start.token,
    own: { colo: ownTrace.colo, rtts: ownRtts },
    ref: refTrace
      ? {
          colo: refTrace.colo,
          ip: refTrace.ip,
          ts: refTrace.ts,
          loc: refTrace.loc,
          warp: refTrace.warp,
          gateway: refTrace.gateway,
          rtts: refRtts,
        }
      : null,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    deviceId: getDeviceId(),
    contribute,
    conn,
    lang,
    // Without a token the result is still shown, just not stored.
    turnstile: token,
  }

  try {
    return await within(SUBMIT_TIMEOUT_MS, async (signal) => {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      })
      if (res.status === 429) throw new MeasureError('rate')
      if (!res.ok) throw new MeasureError('failed')
      return (await res.json()) as TestResult
    })
  } catch (e) {
    return fail(e)
  }
}
