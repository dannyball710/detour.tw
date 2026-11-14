import { archiveDays } from './archive'
import { buildExport } from './export'
import { refreshStatsSnapshot } from './stats'

const HASH_TTL_MS = 48 * 3600_000
const NONCE_TTL_MS = 3600_000

// Must match `triggers.crons` in wrangler.jsonc.
export const CRON_STATS = '*/5 * * * *'
export const CRON_HOURLY = '17 * * * *'

/** Privacy promise: the daily IP/device hashes live for 48 h only. Tokens die after 120 s, so nonces can go after 1 h. */
export async function purgeExpired(db: D1Database, now: number): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE tests SET ip_hash = NULL, device_hash = NULL
        WHERE created_at < ? AND (ip_hash IS NOT NULL OR device_hash IS NOT NULL)`,
      )
      .bind(now - HASH_TTL_MS),
    db.prepare('DELETE FROM nonces WHERE created_at < ?').bind(now - NONCE_TTL_MS),
  ])
}

// Invocation logs are off (privacy), so a failing task must log its own error; rethrow to keep the
// platform's failure count.
async function task(name: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run()
  } catch (e) {
    console.error(`cron ${name} failed`, e)
    throw e
  }
}

export async function runCron(cron: string, deps: { db: D1Database; bucket: R2Bucket }, now: number): Promise<void> {
  switch (cron) {
    case CRON_STATS:
      await task('stats-snapshot', () => refreshStatsSnapshot(deps.db, now))
      return
    case CRON_HOURLY: {
      // Purge first: the privacy promise must not depend on the export succeeding.
      await task('purge', () => purgeExpired(deps.db, now))
      // Export and archive are independent: one failing must not starve the other; both retry next hour.
      const outcomes = await Promise.allSettled([
        task('export', () => buildExport(deps.db, deps.bucket, now)),
        task('archive', () => archiveDays(deps.db, deps.bucket, now)),
      ])
      const failed = outcomes.find((o): o is PromiseRejectedResult => o.status === 'rejected')
      if (failed) throw failed.reason
      return
    }
    default:
      console.warn('unknown cron schedule', cron)
  }
}
