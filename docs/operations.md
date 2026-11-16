# Operations

## Environments

| | Website | API | Database |
|---|---|---|---|
| Production | https://quikfly-web.quikfly-api.workers.dev | https://quikfly-api.quikfly-api.workers.dev/v1 | D1 `quikfly-db` (id in `apps/api/wrangler.jsonc`, region APAC) |
| Local | http://localhost:3000 (`npm run dev:web`) | http://localhost:8787/v1 (`npm run dev:api`) | local D1 in `apps/api/.wrangler/` |

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
npm run deploy -w @quikfly/web # builds with .env.production, then uploads apps/web/out
```

Order matters: **migration → API → website**. The new website may call endpoints that only the new API has, and the new API may read columns only the migration adds.

The smoke test reuses one test user (+91 90000 00001) and leaves cancelled or completed bookings on it. That's expected.

## Testing

- `npm run typecheck`: must pass.
- `npm run smoke` against a local API after `npm run db:migrate:local`. Run it twice: the second run proves the tests don't depend on a fresh database.
- UI: check in a browser at 390 px width (phone) in light and dark mode. Use the website against the local API, not the mock, for anything that touches data.
- Mock (demo) mode: build with `NEXT_PUBLIC_API_URL=` (empty) to check the single-file or offline demo still works.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Smoke test hits old behaviour right after deploying | Deploy still spreading | Wait about a minute and re-run |
| `wrangler dev` picks another port, or the API answers with old code | A previous `wrangler dev` child process still holds 8787 | Use `--port 8791` and pass that URL to the smoke script |
| "Another next dev server is already running" | Only one `next dev` per app folder | Reuse the running one, or test a production build served with `npx wrangler dev --port 3300` in `apps/web` |
| Local API stops answering after many hot reloads | `wrangler dev` hang | Restart it on a fresh port |
| Website shows "Request failed (401)" and signs out | Session expired or revoked | Expected; sign in again |
