# Operations

## Environments

| | Website | API | Database |
|---|---|---|---|
| Production | https://quikfly-web.quikfly-api.workers.dev | https://quikfly-api.quikfly-api.workers.dev/v1 | D1 `quikfly-db` (id in `apps/api/wrangler.jsonc`, region APAC) |
| Local | http://localhost:3000 (`npm run dev:web`) | http://localhost:8787/v1 (`npm run dev:api`) | local D1 in `apps/api/.wrangler/` |

Admin panel (`apps/admin`): production https://quikfly-admin.quikfly-api.workers.dev (owner account `admin@quikfly.com`; the owner keeps the password, reset it with `create-admin.mjs`); local `npm run dev:admin` on :3100. It talks to the same API.

Android app (`apps/mobile`): latest APK https://github.com/aswin-blix/quikfly-web/releases/latest/download/QuikFly-arm64.apk (GitHub Releases, `app-v0.1.0` first); builds use the production API unless `--dart-define=API_URL` says otherwise. Details in the Android app section below.

- Cloudflare account: the owner's (log in with `npx wrangler login`). The workers.dev subdomain is `quikfly-api`, which is why both URLs contain it.
- Production website settings are in `apps/web/.env.production` (API URL, demo OTP hint). Public values only.
- Local website against the local API: create `apps/web/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:8787/v1` and `NEXT_PUBLIC_DEMO_OTP=1234`. Without it, the site uses the mock API.
- API settings: `vars` in `apps/api/wrangler.jsonc` (`DEMO_OTP`, `ALLOWED_ORIGINS`).

## Deploying (from `main`, after the PR is merged)

```bash
git switch main && git pull
npm install
npm run typecheck
npm run db:migrate:remote      # first, whenever apps/api/migrations has a new file
npm run deploy -w @quikfly/api
# wait ~60 s: Cloudflare serves old and new versions while the deploy spreads
node apps/api/scripts/smoke.mjs https://quikfly-api.quikfly-api.workers.dev/v1
node apps/api/scripts/smoke-admin.mjs https://quikfly-api.quikfly-api.workers.dev/v1 <owner email> <password>
npm run deploy -w @quikfly/web # builds with .env.production, then uploads apps/web/out
npm run deploy -w @quikfly/admin
```

**First admin account** (once, after the 0004 migration): `node apps/api/scripts/create-admin.mjs --remote <email> "<name>" owner`. It prints a generated password once. Re-run it to reset a forgotten password; there is no email-based reset.

Order matters: **migration → API → website**. The new website may call endpoints that only the new API has, and the new API may read columns only the migration adds.

The smoke test reuses one test user (+91 90000 00001) and leaves cancelled or completed bookings on it. That's expected.

## Android app (apps/mobile)

- Builds against the production API by default; `--dart-define=API_URL=...` points it elsewhere (see `apps/mobile/README.md`).
- Signed release: upload key at `%USERPROFILE%\keys\quikfly-upload.jks`, alias `quikfly`, certificate SHA-256 `C7:84:CE:F5:50:DC:5F:A5:FC:64:C5:5A:2E:C6:EE:C8:99:81:FD:2D:75:0A:FF:9A:49:6C:9B:40:17:03:3A:AE` (owner keeps the file and the password, backed up), `apps/mobile/android/key.properties` (git-ignored) with path + alias, password in `QUIKFLY_KEYSTORE_PASSWORD`. Steps in `apps/mobile/README.md` → Release.
- Distribution: GitHub Releases on the public repo (tags `app-v<version>`). Latest APK, no login: https://github.com/aswin-blix/quikfly-web/releases/latest/download/QuikFly-arm64.apk (older phones: `QuikFly-armv7.apk`). Releases (all 2026-11-17): `app-v0.1.0`, `app-v0.1.1` (new service photos), `app-v0.1.2` (trip-card fixes, latest). A new release with the same asset names automatically becomes what the website's download button serves.
- Contract test before a release: `flutter test --dart-define=API_URL=<api>/v1`. Against production it uses the test number +91 90000 00002 and leaves a cancelled booking and a pending licence on it.

## Testing

- `npm run typecheck`: must pass.
- `npm run smoke` against a local API after `npm run db:migrate:local`. Run it twice: the second run proves the tests don't depend on a fresh database.
- `npm run smoke:admin` (local) creates test admins in the local D1 and checks every `/admin` endpoint, roles and lockout. Against production pass the URL, an owner email and password; lockout and role checks are skipped there so no real account gets locked.
- Run typecheck and the smoke tests after each step, not only at the end of a slice (owner's request).
- UI: check in a browser at 390 px width (phone) in light and dark mode. Use the website against the local API, not the mock, for anything that touches data.
- Mock (demo) mode: build with `NEXT_PUBLIC_API_URL=` (empty) to check the single-file or offline demo still works.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Smoke test hits old behaviour right after deploying | Deploy still spreading | Wait about a minute and re-run |
| `wrangler dev` picks another port, or the API answers with old code | A previous `wrangler dev` child process still holds 8787 | Use `--port 8791` and pass that URL to the smoke script |
| "Another next dev server is already running" | Only one `next dev` per app folder | Reuse the running one, or test a production build served with `npx wrangler dev --port 3300` in `apps/web` |
| Local API stops answering after many hot reloads | `wrangler dev` hang | Restart it on a fresh port |
| Website served by `wrangler dev` (in `apps/web`) loads but nothing is clickable; console shows `ChunkLoadError` | The site was rebuilt after `wrangler dev` started, and it still serves the old file list | Restart `wrangler dev` after every `next build` |
| Browser automation: clicks land under the bottom bar, or date inputs stay empty | Smooth scrolling and native date pickers | Scroll the target to the centre (`behavior: "instant"`) before clicking; set date inputs through the native value setter plus an `input` event |
| Website shows "Request failed (401)" and signs out | Session expired or revoked | Expected; sign in again |
| `next dev` shows "missing param in generateStaticParams" for a holiday or car | That item was added in the admin after the build; only the real host falls back to the 404 page, which renders it | Test on a build: `NEXT_PUBLIC_API_URL=<api> npx next build` then `npx wrangler dev --port <port>` in `apps/web` |
| An admin edit doesn't show yet | The API caches catalog and settings for 30 s per isolate; the website loads /config once per page load | Wait up to 30 s and reload |
| Checkout says the price expired or was already used | Quotes are valid 30 minutes and book once | Go back to the service page and book again (a new quote is fetched) |
