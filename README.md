# QuikFly

Rides, buses, holidays and rentals in one app. This repo holds the website, the API they share, and (from Phase 3) the Flutter app.

```
apps/
  web/        Next.js website (static export)          → apps/web/README.md
  api/        REST API on Cloudflare Workers + D1      → apps/api/README.md
  mobile/     Flutter app (Phase 3, not started)
packages/
  shared/     @quikfly/shared: domain types and catalog seed data used by web and api
```

The website and the app call the same API. Types live once in `packages/shared/src/types.ts`; change them there.

## Commands (run at the repo root)

```bash
npm install                 # installs and links every workspace
npm run db:migrate:local    # first run: create the local API database
npm run dev                 # API on :8787 and website on :3000 together
npm run typecheck           # shared, api and web
npm run build               # API bundle (dry run) and website static export
npm run smoke               # endpoint tests against the running local API
```

To point the local website at the local API, create `apps/web/.env.local` with:

```
NEXT_PUBLIC_API_URL=http://localhost:8787/v1
NEXT_PUBLIC_DEMO_OTP=1234
```

Without it, the website runs on its built-in mock API.

## Hosting (Cloudflare free tier)

| | URL | Deployed by |
|---|---|---|
| Website | https://quikfly-web.quikfly-api.workers.dev | `npm run deploy -w @quikfly/web` (static export served by a Worker, `apps/web/wrangler.jsonc`) |
| API | https://quikfly-api.quikfly-api.workers.dev/v1 | `npm run deploy -w @quikfly/api` (Worker + D1 `quikfly-db`) |

`npm run deploy` does both, API first. Run `npm run db:migrate:remote` before deploying an API change that adds a migration. Deploys need `npx wrangler login` once per machine.

The production website build reads `apps/web/.env.production` (API URL and demo OTP). If a static host such as Vercel is ever connected to this repo, its root directory must be **`apps/web`**.

## Author

Designed and built by [Aswin Blix](https://aswinblix.dev/).
