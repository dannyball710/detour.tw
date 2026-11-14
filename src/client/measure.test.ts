import { afterEach, describe, expect, it, vi } from 'vitest'
import { MeasureError, runMeasurement } from './measure'

/** A request that never answers, like one lost behind a captive portal: it only ends when aborted. */
function blackHole(_url: string, init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  })
}

describe('runMeasurement', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  // Without a time limit the test would sit on "testing…" until the browser gave up, minutes later.
  it('fails with a retryable error when the start request never answers', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(blackHole))
    const outcome = runMeasurement('zh', () => {}).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(8000)
    const error = await outcome
    expect(error).toBeInstanceOf(MeasureError)
    expect((error as MeasureError).kind).toBe('failed')
  })
})
