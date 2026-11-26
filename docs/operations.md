# Operations

## Environments

| | Website | API | Database |
|---|---|---|---|
| Production | https://quikfly.in | https://api.quikfly.in/v1 | D1 `quikfly-db` (id in `apps/api/wrangler.jsonc`, region APAC) |
| Local | http://localhost:3000 (`npm run dev:web`) | http://localhost:8787/v1 (`npm run dev:api`) | local D1 in `apps/api/.wrangler/` |

Admin panel (`apps/admin`): production https://admin.quikfly.in (owner account `admin@quikfly.com`; the owner keeps the password, reset it with `create-admin.mjs`); local `npm run dev:admin` on :3100. It talks to the same API.

Android app (`apps/mobile`): latest APK https://github.com/aswin-blix/quikfly-web/releases/latest/download/QuikFly-arm64.apk and the Partner app `.../QuikFlyPartner-arm64.apk` (GitHub Releases, `app-v0.1.0` … `app-v0.1.18`); builds use the production API unless `--dart-define=API_URL` says otherwise. Details in the Android app section below.

- Cloudflare account: the owner's (log in with `npx wrangler login`). The old addresses still answer and stay on: https://quikfly-web.quikfly-api.workers.dev, https://quikfly-api.quikfly-api.workers.dev/v1 and https://quikfly-admin.quikfly-api.workers.dev (the workers.dev subdomain is `quikfly-api`). Apps up to 0.1.18 call the old API address. See Domain below.
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
npm run deploy -w @quikfly/web # builds with .env.production, then uploads apps/web/out
npm run deploy -w @quikfly/admin
# wait until production answers with the new version everywhere (e.g. loop until a new endpoint stops returning 404
# several times in a row); Cloudflare serves old and new versions for about a minute
node apps/api/scripts/smoke.mjs https://api.quikfly.in/v1   # once per deploy
node apps/api/scripts/smoke-admin.mjs https://api.quikfly.in/v1 <owner email> <password>
```

**First admin account** (once, after the 0004 migration): `node apps/api/scripts/create-admin.mjs --remote <email> "<name>" owner`. It prints a generated password once. Re-run it to reset a forgotten password; there is no email-based reset.

Order matters: **migration → API → website**. The new website may call endpoints that only the new API has, and the new API may read columns only the migration adds. When the privacy notice version changes, deploy the website straight after the API: it bundles the version, so nobody can agree to the notice while the two differ. Run the smoke test after both.

The smoke test reuses one test user (+91 90000 00001) and leaves cancelled or completed bookings on it. That's expected. Run the production smoke test **once per deploy**: every run adds bookings, tickets and callbacks to production. It also leaves one SOS alert open per run, and an account can hold three: staff close them in admin → SOS, or the fourth run fails.

After a deploy, record it (migration, version ids, smoke result) in `docs/roadmap.md` with a small docs PR.

**New settings during a deploy:** for about a minute the website can load settings from the old API, without a field the new code reads (this crashed the holiday page once, before `whatsappLink()` accepted a missing number). Code that reads a new `Settings` field must cope with it being missing.

## Domain (quikfly.in)

- **Registrar:** GoDaddy, bought 2026-11-26 by the owner for 3 years (renews November 2029). Cloudflare Registrar doesn't sell `.in`. Keep 2-step verification on the GoDaddy account and the domain lock on.
- **DNS:** Cloudflare free plan on the same account as the Workers. GoDaddy's nameservers point at `jo.ns.cloudflare.com` and `jakub.ns.cloudflare.com`; DNSSEC is off at GoDaddy. Manage every record in Cloudflare, never at GoDaddy.
- **Hostnames:** `quikfly.in` and `www.quikfly.in` (website), `admin.quikfly.in`, `api.quikfly.in`. They are Worker custom domains in each app's `wrangler.jsonc` (`routes` with `custom_domain: true`): `wrangler deploy` creates the DNS record and the certificate, so don't add A or CNAME records for them by hand (a record already on the name makes the deploy fail). The first deploy of a new name can take a few minutes before HTTPS answers.
- **`workers_dev: true` stays in all three configs.** Adding `routes` would otherwise turn the workers.dev addresses off, and released apps (0.1.18 and older) call `quikfly-api.quikfly-api.workers.dev`; shared ride, ticket and parcel links from those apps open `quikfly-web.quikfly-api.workers.dev`. Turn it off only when no supported app uses it.
- **www → quikfly.in** (set 2026-11-26 in the dashboard): quikfly.in → Rules → Redirect Rules → "Redirect from WWW to root" (template: wildcard `https://www.*` → `https://${1}`, 301), with **Preserve query string** ticked so shared `?t=` and `?lr=` links survive.
- **Always Use HTTPS** is on (SSL/TLS → Edge Certificates, set 2026-11-26): every `http://` address answers 301 to `https://`, so admin logins never go unencrypted.
- **CORS:** `ALLOWED_ORIGINS` stays `*` (decisions.md 2026-11-26).
- **Tests:** `smoke.mjs` and the app contract test treat `*.quikfly.in` and `workers.dev` as production (fixed test accounts, no rentals or parcels left in staff queues). A new production hostname needs adding to both checks.
- **Email** (`info@quikfly.in`): not set up yet. Plan: Zoho Mail's free plan, with its MX, SPF (TXT), DKIM (TXT) and a DMARC record (`_dmarc`, `v=DMARC1; p=none`) added in Cloudflare DNS from the values Zoho shows; or Cloudflare Email Routing to forward to a personal inbox.

## Push notifications (free)

The in-app inboxes (customers' bell, staff alerts in admin) work without any setup. Push to browsers and phones is switched on by secrets the owner sets; until then the API stays silent and nothing else changes.

**Browsers (website and admin): Web Push with VAPID keys, no Firebase.**

1. Once, from `apps/api`: `node scripts/vapid-keys.mjs mailto:<a contact address>`. It prints three `npx wrangler secret put` commands (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`); run them and paste each value. Nothing is written to disk; keep the private key out of chats and the repo.
2. No redeploy needed: `GET /config` and `GET /admin/alerts` start returning `push: { vapidPublicKey }`, the website's and admin's "Turn on notifications" cards appear, and the next cron run sends.
3. To turn it off: delete the three secrets. Rotating the keys (a new pair) ends every browser's subscription; people turn notifications on again when they next visit.
4. Locally: the same three lines in `apps/api/.dev.vars` as `NAME=value` (git-ignored). Start the API with `npx wrangler dev --test-scheduled` and `GET /__scheduled?cron=*+*+*+*+*` runs the cron once.

**Phones (both apps): Firebase Cloud Messaging.** The owner creates the project:

1. [console.firebase.google.com](https://console.firebase.google.com) → new project (Analytics off is fine) → add **two** Android apps: package `com.quikfly.app` (QuikFly) and `com.quikfly.partner` (QuikFly Partner).
2. For each app, Project settings → Your apps → **google-services.json**: save them as `apps/mobile/android/app/src/customer/google-services.json` and `apps/mobile/android/app/src/partner/google-services.json`. They are git-ignored (public repo): keep copies with the upload key. Builds without them still work, with push off. The app side ships in the first app release after the notifications PRs (see apps/mobile/README.md → Phone notifications).
3. Project settings → Service accounts → **Generate new private key** (a JSON file). Keep it out of the repo.
4. From `apps/api`: `npx wrangler secret put FCM_SERVICE_ACCOUNT` and paste the whole JSON. No redeploy needed; the next cron run starts sending.
5. To turn phone push off again: `npx wrangler secret delete FCM_SERVICE_ACCOUNT`.

The cron (`* * * * *`) is free on Workers (5 triggers per account on the free plan; this uses one). It only sends notifications and staff alerts less than an hour old, so turning push on doesn't flood old ones. Cron runs show in the Cloudflare dashboard → Workers → quikfly-api → Logs.

## Partner document storage (R2)

Partner document photos (profile, RC, insurance) and self-drive rental checklist photos (`rentals/<booking>/…`) are stored in a private R2 bucket. R2's free tier is 10 GB-month, 1M writes and 10M reads a month, with free egress; Cloudflare may ask for a card on the account to switch R2 on (the owner does this in the dashboard).

1. Owner: Cloudflare dashboard → R2 → enable.
2. Once: `cd apps/api && npx wrangler r2 bucket create quikfly-docs` (the binding `DOCS` in `wrangler.jsonc` points at it). **Deploying the API fails until the bucket exists.**
3. Locally, `wrangler dev` simulates the bucket; nothing to set up.

Photos are only served to the partner who uploaded them and to staff with `vendors.review`, never cached.

## Android app (apps/mobile)

- Two apps from one project: the customer app (default flavor) and **QuikFly Partner** (`--flavor partner -t lib/main_partner.dart`, package `com.quikfly.partner`). Release APK names now include the flavor (`app-arm64-v8a-customer-release.apk`); copy them to the same stable asset names as before.
- Builds against the production API by default; `--dart-define=API_URL=...` points it elsewhere (see `apps/mobile/README.md`).
- Signed release: upload key at `%USERPROFILE%\keys\quikfly-upload.jks`, alias `quikfly`, certificate SHA-256 `C7:84:CE:F5:50:DC:5F:A5:FC:64:C5:5A:2E:C6:EE:C8:99:81:FD:2D:75:0A:FF:9A:49:6C:9B:40:17:03:3A:AE` (owner keeps the file and the password, backed up), `apps/mobile/android/key.properties` (git-ignored) with path + alias, password in `QUIKFLY_KEYSTORE_PASSWORD`. Steps in `apps/mobile/README.md` → Release.
- Distribution: GitHub Releases on the public repo (tags `app-v<version>`, both apps share a version). Latest APKs, no login: https://github.com/aswin-blix/quikfly-web/releases/latest/download/QuikFly-arm64.apk (older phones: `QuikFly-armv7.apk`) and `QuikFlyPartner-arm64.apk` / `QuikFlyPartner-armv7.apk`. Latest: `app-v0.1.18` (2026-11-23). From 0.1.18 a release build needs both `google-services.json` files in `apps/mobile/android/app/src/{customer,partner}/` (git-ignored) or it ships with push off; check `aapt2 dump resources <apk> | grep google_app_id`. A new release with the same asset names automatically becomes what the website's download buttons serve.
- Release flow: a `release/app-<version>` PR bumps `version:` in `pubspec.yaml` → after merge the owner builds both flavors from `main` (only the owner knows the keystore password) → Claude verifies (`aapt2 dump badging`: package, label, version name, version code = 1000 × ABI + build number, e.g. 2013 arm64 / 1013 armv7; `apksigner verify --print-certs`: certificate `c784cef5…3aae`; new screen texts present in the right flavor's `lib/arm64-v8a/libapp.so`, partner texts absent from the customer build) → installs over the previous version on the test phone with `adb install -r` and looks at the new screens → after the owner's yes, `gh release create` with the four stable asset names and tester notes → downloads `releases/latest/download/…` and compares SHA-256 with the builds → docs PR.
- Contract test before a release: `flutter test` (production by default) or `--dart-define=API_URL=<api>/v1`. Against production it uses the test number +91 90000 00002 and leaves a cancelled booking and a pending licence on it; tests that would create staff work (support tickets, Safety changes) only parse responses there.

## Testing

- `npm run typecheck`: must pass.
- `npm run smoke` against a local API after `npm run db:migrate:local`. Run it twice: the second run proves the tests don't depend on a fresh database.
- `npm run smoke:admin` (local) creates test admins in the local D1 and checks every `/admin` endpoint, roles and lockout. Its two cron checks need the API started with `wrangler dev --test-scheduled`. Against production the **owner** runs it with the URL, owner email and password (Claude never signs in to production); lockout and role checks are skipped there. Each run makes one deliberate wrong-password attempt, so a run with a wrong password costs two of the five tries before the account locks. In Windows `cmd` use double quotes around the password (single quotes are passed literally).
- Run typecheck and the smoke tests after each step, not only at the end of a slice (owner's request).
- UI: check in a browser at 390 px width (phone) in light and dark mode. Use the website against the local API, not the mock, for anything that touches data.
- Mock (demo) mode: build with `NEXT_PUBLIC_API_URL=` (empty) to check the single-file or offline demo still works.
- Rolling back past migration 0030: first disable the counter accounts (admin → Team). An older admin panel doesn't know the role; the older API gives it no permissions. The column itself can stay.
- Parcels locally: admin → Settings → Services → Parcels (website and API follow within 30 s). In the offline demo: `NEXT_PUBLIC_DEMO_PARCELS=1 npm run build:demo`. Switch them on in production only after the app with parcels is published and the owner says so. Scripts and curl need `-H "Accept: application/json; services=parcel"` to see parcel bookings.
- A plain `next build` in `apps/web` reads `.env.production`, so it talks to the **production** API. To test a build against the local API, set it explicitly: `NEXT_PUBLIC_API_URL=http://127.0.0.1:8787/v1 npx next build`, then serve it with `npx wrangler dev --port <port>` (restart that after every build).
- Admin panel against a local API on another port: `NEXT_PUBLIC_API_URL=http://127.0.0.1:<port>/v1 npx next dev -p 3101` in `apps/admin`; local staff accounts come from `node scripts/create-admin.mjs --local <email> "<name>" <role> <password>` (local D1 only).
- Another session has the repo folder on a release branch? Build and deploy from a separate worktree: `git worktree add <scratch>/qf-x -b <branch> origin/main`, `npm install` there; run wrangler from the main folder's `node_modules/wrangler/bin/wrangler.js` (npm skips workerd's install script in a fresh worktree). Remove the worktree when done.
- No Chrome extension? Browser checks can drive headless Chrome over the DevTools protocol (`chrome --headless=new --remote-debugging-port=9334`) from a small Node script: set a 390 px mobile viewport, navigate, fill inputs through the native value setter, screenshot.

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
