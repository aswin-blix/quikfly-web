# QuikFly

Rides, buses, holidays and rentals in one app. This repo holds the website, the staff admin panel, the Android app and the API they all share.

```
apps/
  web/        Next.js website (static export)          → apps/web/README.md
  admin/      Next.js staff admin panel (static export) → apps/admin/README.md
  api/        REST API on Cloudflare Workers + D1      → apps/api/README.md
  mobile/     Flutter Android app                      → apps/mobile/README.md
packages/
  shared/     @quikfly/shared: domain types, rules, settings, pricing and catalog seed used by api, web and admin
```

**Docs:** [AGENTS.md](AGENTS.md) (how to work in this repo) · [docs/roadmap.md](docs/roadmap.md) (status and current task) · [docs/decisions.md](docs/decisions.md) (why) · [docs/operations.md](docs/operations.md) (deploying, testing, troubleshooting).

The website, the admin panel and the app call the same API. Types live once in `packages/shared/src/types.ts`; change them there (the app's Dart copy is `apps/mobile/lib/api/models.dart`).

## Commands (run at the repo root)

```bash
npm install                 # installs and links every workspace
npm run db:migrate:local    # first run: create the local API database
npm run dev                 # API on :8787 and website on :3000 together
npm run dev:admin           # admin panel on :3100 against the local API
npm run typecheck           # shared, api, web and admin
npm run build               # API bundle (dry run), website and admin static exports
npm run smoke               # endpoint tests against the running local API (smoke:admin for staff endpoints)
```

The Android app is built with Flutter from `apps/mobile` (`flutter analyze`, `flutter test`, `flutter build apk`); see [apps/mobile/README.md](apps/mobile/README.md).

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
| Admin panel | https://quikfly-admin.quikfly-api.workers.dev | `npm run deploy -w @quikfly/admin` |
| Android app (APK) | https://github.com/aswin-blix/quikfly-web/releases/latest/download/QuikFly-arm64.apk | GitHub Releases (`app-v<version>`), signed with the owner's upload key; see apps/mobile/README.md → Release |

`npm run deploy` does API, website and admin, API first. Run `npm run db:migrate:remote` before deploying an API change that adds a migration. Deploys need `npx wrangler login` once per machine.

The production website build reads `apps/web/.env.production` (API URL and demo OTP). If a static host such as Vercel is ever connected to this repo, its root directory must be **`apps/web`**.

## Author

Designed and built by [Aswin Blix](https://aswinblix.dev/).
