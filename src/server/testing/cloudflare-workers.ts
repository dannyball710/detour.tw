// Test stand-in for the `cloudflare:workers` module (aliased in vitest.config.ts).
export const env = {} as Env

const pending: Promise<unknown>[] = []

export function waitUntil(promise: Promise<unknown>): void {
  pending.push(promise)
}

/** Lets tests await background work (e.g. cache writes) the way the runtime would before shutting down. */
export async function flushWaitUntil(): Promise<void> {
  while (pending.length) await Promise.all(pending.splice(0))
}
