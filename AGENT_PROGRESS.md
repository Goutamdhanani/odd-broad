# BizzHouse Agent Progress

> Persistent working memory for the coding agent. Update after every meaningful
> work batch. Read this BEFORE starting work — do not re-discover the project.

## Current Milestone

One-go directive batch DONE: media re-hosting (MinIO + secure access),
rate-card admin UI, team management + conversation assignment, analytics
time-range view, frontend vitest with normalization regression tests.
Fixed: "can't login" was a stale .next served under a running next start.
Fixed: React object-child crash ({text,type}) via normalization layer
(`lib/normalize.ts` + `MessageContent.tsx`); template sends now store a
render-friendly `bodyText`; provider jargon removed from shop UI.

## Completed

- **Foundation (Groups A–B)**: NestJS 12 + TypeORM + Postgres/Redis/MinIO via
  docker-compose; JWT auth (super_admin / shop_owner) with rate limiting,
  password policy, production fail-fast config; tenant context interceptor;
  TypeORM migrations (5 applied, `migrationsRun: true`).
- **Wallet ledger (Group C)**: atomic debit (`UPDATE ... WHERE balance >= cost
  RETURNING`), idempotent refunds (`FOR UPDATE` + reference check), append-only
  `wallet_transactions` (debits stored NEGATIVE — sign bug fixed), admin
  credit/debit, nightly reconciliation with drift alerts.
- **Payments (Group D)**: Razorpay orders (mock + live), HMAC-verified
  `payment.captured` webhook → idempotent credit; frontend opens real Checkout
  SDK in live mode; mock mode settles through the REAL webhook handler.
- **Gupshup wiring (Group E)**: partner token cache, app creation, per-app
  token, embedded signup link, phone migration flag, **v3 callback subscription
  registration** (on onboard + on app-live, idempotent), quality/health endpoints.
- **Onboarding UI (Group F)**: two-path flow (new number / existing number with
  migration), polling status page, auto shop activation on WABA live.
- **Templates (Group G)**: real `POST /partner/app/{appId}/templates` payload
  (auto `example` from `{{N}}`, structured buttons, header/footer), status
  webhook handling + 15-min provider sync job, rejection reasons surfaced.
- **Messaging (Groups H–I)**: send pipeline = validate → normalize E.164 →
  session-window check → opt-in enforcement → category pricing → atomic debit →
  provider send → persist provider message id → refund on failure. Inbound
  webhook: IP allowlist + shared-secret verification, queue-based processing,
  contact resolution, 24h window tracking, text/button/interactive/reaction/
  media/location handling. Socket.IO live updates.
- **Broadcasts**: queued BullMQ dispatch, opted-in audience, wallet pre-check,
  per-message debit, live websocket progress, template variable filling.
- **Inbox**: normalized message rendering (`lib/normalize.ts` +
  `MessageContent.tsx` — objects never reach JSX), template send with variable
  inputs when session closed, quick replies, optimistic sends with status ticks.
- **Admin**: real platform stats (`GET /shops/admin/stats`), shops list,
  activation/suspension, wallet crediting.
- **UI**: Apple-style light design system (globals.css), all pages swept.
- **Testing**: 61 backend + 15 frontend tests green (frontend covers the
  normalization layer — the {text,type} object-child crash class, phone
  normalization, Meta component building). Live smoke passed for: media
  re-hosting to MinIO + tenant-scoped access (owner 200 / cross-tenant 403 /
  anonymous 401), team invite + agent login, conversation assignment +
  assigned-to-me filter, admin rate-card updates, analytics buckets.
- **NOTE**: never run `next build` while `next start` is serving — it corrupts
  the served page (caused the "can't login" report; chunks 404'd). Restart
  after every build.

## In Progress

- (nothing — batch complete: media re-hosting, rate-card UI, team/assignment,
  analytics, frontend tests)

## Known Bugs

- None currently open. (React `{text,type}` object-child crash FIXED via
  normalization layer; root cause was template buttons stored as objects and
  rendered raw.)

## Architecture Decisions

- **Provider modes**: `GUPSHUP_MOCK_MODE` / `RAZORPAY_MOCK_MODE` env flags;
  mock paths return deterministic data and use the same code paths as live.
  Demo seeding is dev-only (`NODE_ENV !== 'production'`).
- **Money**: integer paise everywhere; ledger is append-only; cached balance on
  `shops.wallet_balance_paise` reconciled against ledger sum by cron.
- **Webhooks**: controller only validates + persists + enqueues (<100ms);
  BullMQ worker does the real processing; events tracked by row id.
- **Normalization**: frontend `src/lib/normalize.ts` is the ONLY place that
  interprets provider payload shapes; backend stores a render-friendly
  `bodyText` on template message payloads.
- **Provider jargon** (WABA / app ids) must not appear in shop-facing UI.

## Important File Locations

- API config: `bizzhouse-api/src/config/configuration.ts`
- Gupshup client: `bizzhouse-api/src/modules/gupshup/gupshup.service.ts`
- Send pipeline: `bizzhouse-api/src/modules/messages/messages.service.ts`
- Webhook processor: `bizzhouse-api/src/modules/webhooks/webhooks.processor.ts`
- Wallet ledger: `bizzhouse-api/src/modules/wallet/wallet.service.ts`
- Cron/alerts: `bizzhouse-api/src/modules/tasks/cron-tasks.service.ts`,
  `bizzhouse-api/src/shared/alert.service.ts`
- Frontend normalizer: `bizzhouse-web/src/lib/normalize.ts`
- Design system: `bizzhouse-web/src/app/globals.css`
- Migrations: `bizzhouse-api/src/database/migrations/` (also mirrored in
  `app.module.ts` and `data-source.ts` — keep all three in sync)

## Environment / Integration Status

- Gupshup: **mock mode** (real client code complete; awaiting partner approval
  + credentials). Set `GUPSHUP_MOCK_MODE=false` + `GUPSHUP_EMAIL` +
  `GUPSHUP_CLIENT_SECRET` + `PUBLIC_API_BASE_URL` + `GUPSHUP_WEBHOOK_SECRET`.
- Razorpay: **mock mode**; same one-flag switch + 3 key vars.
- Postgres/Redis/MinIO: docker-compose, healthy.

## Tests Passing

- Backend: 47/47 (vitest). Frontend: no test runner configured yet.

## Next Work Batch

1. Business-hours automation rules; bot-to-human handoff.
2. Media upload for OUTBOUND media messages (inbound re-hosting done).
3. Conversation notes/tags panel in inbox sidebar.
4. Prometheus/Grafana metrics (webhook latency, queue depth).
5. Per-template performance analytics.

## Do Not Repeat

- Do NOT render `template.buttons` or message `payload` directly in JSX —
  always through `normalize.ts` / `MessageContent`.
- Do NOT store admin debits as positive amounts (sign convention: debits
  negative) — this broke reconciliation once.
- Do NOT add columns/entities to only one of app.module / data-source.
- Do NOT mark things "sent/live/approved" from React state — backend truth only.
- Do NOT seed demo accounts in production.
