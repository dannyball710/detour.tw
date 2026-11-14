# 網路出國了嗎？ Detour

https://detour.tw — measures which Cloudflare data center a visitor's connection lands in, compares it with
the path to cloudflare.com, and publishes anonymous daily statistics per Taiwanese ISP.

## Stack

TanStack Start (React 19) on Cloudflare Workers, D1, R2, Workers Rate Limiting and Cron Triggers.
Share images are SVG templates rasterised with resvg-wasm.

## Development

```bash
npm install
echo "TOKEN_SECRET=dev-only-secret" > .dev.vars
npx wrangler d1 migrations apply detour --local
npm run dev            # http://localhost:3000
```

In dev the measurement uses `/api/dev-trace` (localhost has no `/cdn-cgi/trace`); `?demo=red|green|gru|…`
renders fixture results (dev only, see `src/client/demo.ts`).

```bash
npx tsc --noEmit
npm test
npm run build
```

Map assets are generated: `node scripts/gen-land.mjs` (share-image land outline) and
`node scripts/gen-maps.mjs` (hero map views in `public/maps/`).

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`: type-check, tests, build, D1 migrations, `wrangler deploy`.
Repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `TOKEN_SECRET`.

The `detour.tw` zone must stay on Cloudflare's Free plan: the measurement depends on it being routed like an
ordinary free-plan site.
