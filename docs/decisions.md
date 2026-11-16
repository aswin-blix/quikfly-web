# Decisions

Why the project is built the way it is. Add an entry when you make a trade-off, and don't reverse one without asking the owner.

| Date | Decision | Why | Revisit when |
|---|---|---|---|
| 2026-11-16 | **Everything on free tiers** (no SMS, payment gateway, maps, Play Store fee, domain) | Dev stage; the goal is a live client demo at ₹0 | The client signs off |
| 2026-11-16 | **Monorepo** (npm workspaces): `apps/web`, `apps/api`, `apps/mobile`, `packages/shared` | One API serves web and app; types are defined once | — |
| 2026-11-16 | **API on Cloudflare Workers + Hono + D1** | Free, never sleeps (free Render-style hosts take 30–50 s to wake, which ruins a live demo), TypeScript shares types with web | Traffic outgrows the D1 free limits |
| 2026-11-16 | **Website as a static export served by a Worker** (`apps/web/wrangler.jsonc`), not Cloudflare Pages | Wrangler 4.16x routes new Pages projects through Workers; static-asset Workers are the supported, free path | SSR or middleware is needed |
| 2026-11-16 | **Vercel disconnected** | Its builds broke after the monorepo move, and Cloudflare is the single host. Don't add `vercel.json`. | — |
| 2026-11-16 | **Mobile app in Flutter** (not a Capacitor wrapper) | Owner's choice: a native app for the client | — |
| 2026-11-16 | **Phone + OTP login with a fixed demo OTP (`1234`)** | No SMS cost; the website shows the hint via `NEXT_PUBLIC_DEMO_OTP` | Add an SMS provider after sign-off |
| 2026-11-16 | **Sessions are random bearer tokens; only a SHA-256 hash is stored**, 30-day expiry | Simple, works for web and app alike, and a DB leak doesn't expose usable tokens | — |
| 2026-11-16 | **Catalog served from `@quikfly/shared` seed data**, not DB tables | No admin panel yet; one source for the API and for the website's static pages | An admin panel exists |
| 2026-11-16 | **Wallet is real inside QuikFly**: debit on booking, refund on cancel, in one D1 batch with a ledger row | The client noticed the wallet wasn't charged; money must never drift | A payment gateway is added |
| 2026-11-16 | **Rides are completed by the website** (`POST /bookings/:id/complete`) when the simulated trip ends | No driver app yet | The driver app exists |
| 2026-11-16 | **Account deletion: soft delete with a 30-day grace period** (sign-in restores the account; afterwards it is erased on the next sign-in) | Google Play requires in-app deletion; Uber's pattern | — |
| 2026-11-16 | **Licence check for self-drive is simulated**: "pending" becomes "verified" after `LICENCE_REVIEW_SECONDS` | Shows the Zoomcar-style KYC flow without a paid KYC service | A KYC provider is chosen |
| 2026-11-16 | **Invoices are printable pages** (browser "Save as PDF"), not server-made PDFs | Free, no PDF library in the Worker | Real GST invoicing is needed |
| 2026-11-16 | **SOS and alerts to contacts are simulated** and say so on screen; "Call 112" is a real `tel:` link | No SMS or telephony cost; honesty in the demo | An SMS provider is added |
