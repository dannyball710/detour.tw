import { useEffect, useState } from 'react'
import type { StatsResponse } from '#/lib/types'

/**
 * In dev, ?demo swaps the statistics for fixture numbers so the report can be reviewed with a
 * full table. The branch is compiled out of production builds.
 */
export function useDemoStats(stats: StatsResponse | null): StatsResponse | null {
  const [demo, setDemo] = useState<StatsResponse | null>(null)
  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
      import('./demo').then((m) => setDemo(m.DEMO_STATS))
    }
  }, [])
  return demo ?? stats
}
