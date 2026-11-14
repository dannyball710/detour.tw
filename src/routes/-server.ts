import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import type { StatsResponse, TestResult } from '#/lib/types'

// Loaders call the backend logic in-process through server functions: a Worker fetching its own
// hostname is not routed back to itself, and this also works for client-side navigations (RPC).

export const fetchStats = createServerFn({ method: 'GET' }).handler(async (): Promise<StatsResponse | null> => {
  try {
    const { getStats } = await import('#/server/stats')
    return await getStats()
  } catch (e) {
    console.error('stats unavailable', e)
    return null
  }
})

export const fetchResult = createServerFn({ method: 'GET' })
  .validator((id: unknown) => {
    if (typeof id !== 'string' || !/^[a-z0-9]{10}$/.test(id)) throw new Error('invalid id')
    return id
  })
  .handler(async ({ data: id }): Promise<TestResult | null> => {
    const { loadResult } = await import('#/server/results')
    return loadResult(id)
  })

export interface ResultPageData {
  result: TestResult
  /** The page is the home page with this result on it, statistics included. */
  stats: StatsResponse | null
}

/** Loader of /r/:id in both languages. */
export async function loadResultPage(id: string): Promise<ResultPageData> {
  const [result, stats] = await Promise.all([/^[a-z0-9]{10}$/.test(id) ? fetchResult({ data: id }) : null, fetchStats()])
  // notFound() makes the SSR response a real 404 instead of a 200 "not found" page.
  if (!result) throw notFound()
  return { result, stats }
}
