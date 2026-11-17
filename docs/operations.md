# Operations

## Environments

| | Website | API | Database |
|---|---|---|---|
| Production | https://quikfly-web.quikfly-api.workers.dev | https://quikfly-api.quikfly-api.workers.dev/v1 | D1 `quikfly-db` (id in `apps/api/wrangler.jsonc`, region APAC) |
| Local | http://localhost:3000 (`npm run dev:web`) | http://localhost:8787/v1 (`npm run dev:api`) | local D1 in `apps/api/.wrangler/` |

Admin panel (`apps/admin`): production address set at the L1 release (`quikfly-admin.quikfly-api.workers.dev` planned); local `npm run dev:admin` on :3100. It talks to the same API.

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
