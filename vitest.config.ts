import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Plain Node: server logic is tested without workerd. `cloudflare:workers` is stubbed and D1 is
// emulated over node:sqlite (src/server/testing/fake-d1.ts) so the real SQL runs in tests.
export default defineConfig({
  resolve: {
    alias: {
      '#': fileURLToPath(new URL('./src', import.meta.url)),
      'cloudflare:workers': fileURLToPath(new URL('./src/server/testing/cloudflare-workers.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
