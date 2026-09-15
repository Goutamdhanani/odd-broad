# BizzHouse Agent Progress

> Persistent working memory for the coding agent. Update after every meaningful
> work batch. Read this BEFORE starting work — do not re-discover the project.

## Current Milestone

**Continuous-improvement automation is active** (every 30 min × 20 runs). Each run must pick
ONE end-to-end improvement, verify, commit; append a dated bullet here so the next run
inherits context. Running locally: Postgres 16 at C:\bizzhouse-deps (user pgsvc), Redis,
API :3001 (`npm run start:dev` in bizzhouse-api), Web :3000 (`npm run dev` in bizzhouse-web).
Admin login: admin@123 / password@123 (seeded; LoginDto allows non-email identifiers).

- **Pass #1 — Contacts CSV export**: `GET /api/contacts/export` (streamed `text/csv`,
  Excel-safe BOM, formula-injection escaping in `buildCsv`, honors the same search/tag
  filters as the list view, registered before `:id`); Export button on the Contacts page
  downloads via authenticated blob request; 4 new unit tests (68 API tests green).
- **Pass #2 — Request logging middleware**: `src/common/middleware/request-logger.ts`
  mounted in `main.ts` after helmet — one line per finished request
  (`METHOD route STATUS latencyMs`), UUID/numeric segments collapsed to `:id` for
  low-cardinality logs, health probes + OPTIONS skipped, 5xx error-level, 4xx/slow(>1s)
  warn-level. 7 new unit tests (75 API tests green); verified live:
  `[HTTP] POST /api/auth/login 200 267ms`.
- **Pass #3 — Broadcast wizard live preview**: `src/lib/template-preview.ts`
  (`splitTemplatePreview` — pure runs of literal/filled/pending, positional
  {{N}} semantics matching the provider) + a WhatsApp-style green bubble preview
  under the template-variable inputs (entered values highlighted, pending
  placeholders dimmed). Replaces the stale dark-mode raw-body box. 5 new web
  tests (20 web green), web build passes.
- **Pass #4 — NumberHealthService test coverage + tier fix**: new
  `number-health.service.spec.ts` — 21 tests locking the anti-ban contract:
  tierCeiling mappings (incl. new **TIER_1M** handling — previously "TIER_1M"
  parsed as ceiling 1), §2.3 scoring thresholds (RED→red, YELLOW→yellow,
  failure-rate 10%/30% with the 20-send minimum sample, 70%/100% usage),
  §2.4 routing (pinned live/red rejections, never auto-pick red, lowest usage
  wins, all-red + no-numbers errors), canContinueSending, and pollRatings
  (update vs "no event update available" vs never-throws-to-cron).
  96/96 API tests now green; lint clean.
- **Pass #5 — Campaign delivery attribution (spec §2.1 summary view)**:
  `messages.broadcast_id` (migration 1789400000000, indexed
  broadcast+status); dispatcher stamps `broadcastId` on every campaign
  send; `GET /api/broadcasts/:id/stats` aggregates per-message statuses
  (delivered ⊇ read, read-rate of the at-least-delivered portion,
  progress vs totalRecipients, tenant-scoped in SQL); broadcasts table
  rows expand to a live delivery summary (queued/sent/delivered/read/
  failed chips + read rate + progress). 4 new tests — 99/99 API green,
  web 20/20, both builds pass; route + 404 verified live.
- **Pass #6 — Failure reason surfacing (spec §3.5 errors[])**:
  webhook processor extracts `statuses[].errors[0]` ({code,title} — e.g.
  Meta 131047 re-engagement); `updateMessageStatus` persists it as
  `payload.failureReason`; socket `message:status` now carries it;
  inbox failed bubbles render "Error 131047: …" inline instead of a bare
  "Failed". 2 new tests — 101/101 API green, web 20/20.
- **Pass #7 — Idempotent debits (money correctness)**: `debitForMessage`
  now guards against duplicate charges the same way refunds do — an
  existing `wallet_transactions` debit row for (shop, messageId) short-
  circuits to success with the current balance, so a retried send can
  never debit the shop twice. Fixes the one asymmetric guard in the
  ledger. 1 new test + updated mocks — 102/102 API green.
- **Pass #8 — Inbox N+1 eliminated**: `getConversations` no longer runs
  2 queries per contact — now one `contact` page + `DISTINCT ON` newest-
  message + `GROUP BY` unread-count aggregates = 3 fixed round-trips per
  page (60 queries for 30 threads → 2). Response shape byte-identical
  (camelCase mapping kept, `count`→`unread`), verified live against real
  Postgres via the demo shop. 2 new tests — 104/104 API green.
- **Pass #9 — CSV import batching (first-run critical path)**:
  `bulkImport` no longer runs findOne+save per row (5000-contact import
  = 10k queries on the shop's very first onboarding step). Now:
  normalize + intra-batch dedupe (first occurrence wins, tags merged),
  chunked `IN` lookups (500/SELECT), one INSERT batch, and no-op UPDATEs
  skipped (name compares before writing). Semantics preserved:
  created/updated/skipped + auto-opt-in with consent timestamp.
  4 new tests caught+fixed a missing name-equality check — 108/108
  API green; verified live (created:2/updated:1/skipped:1 against the
  demo shop, FK guard held, test rows cleaned after).
- **Pass #10 — Embedded Signup link caching (spec §3.2 quota)**: Gupshup
  caps each app at 5 new links / 40 regenerations and says cache + only
  refresh when expired — the onboard endpoint was refetching on every
  click. Now `gupshup_apps.embed_link` + `embed_link_expires_at` (
  migration 1789500000000) store the last link with a 4-day TTL (links
  live 5); `isEmbedLinkFresh()` (5-min safety margin) decides reuse;
  response carries `linkSource: cache|fresh`. One bug caught & fixed
  while writing: freshness was re-evaluated AFTER the save, making every
  fresh fetch report 'cache'. 5 new tests — 113/113 API green; columns
  verified live in Postgres after the server restart.
- **Pass #11 — webhook_events retention pruning**: raw payload audit rows
  grew unbounded. New cron step deletes only PROCESSED events older than
  WEBHOOK_EVENTS_RETENTION_DAYS (default 7; 0 disables) — failed/un-
  processed events are never removed so the replay path stays intact.
  Config + .env.example documented; 5 new tests — 118/118 API green;
  DELETE query with correct cutoff observed executing live on boot.
- **Pass #12 — Campaign stop/cancel**: `POST /api/broadcasts/:id/cancel`
  marks queued/sending campaigns `cancelled` (text column — no migration);
  dispatch worker re-reads the row between batches and halts at the next
  boundary. Race closed: per-message persistence switched from full-entity
  save to targeted counter UPDATEs so a mid-batch cancel can't be clobbered.
  UI Stop button with confirm on live rows, cancelled badge. 4 new tests
  — 122/122 API green, web 20/20, route mapped live.
- **Pass #13 — Wallet ledger CSV export**: `GET /api/wallet/transactions/export`
  (days param, default 90, clamped 1-365) streams the shop's ledger as
  Excel-safe CSV (BOM, ₹ conversions with ledger sign convention, escaped
  reference/description). New shared `src/shared/csv.ts` (escapeCsvValue +
  toCsv) — contacts export refactored onto it byte-identically. Wallet page
  gets an Export CSV button. 8 new tests — 132/132 API green; CSV verified
  live (topup rows with correct ₹ amounts, clamp path 200).
- **Pass #14 — Campaign failure-reason breakdown**: deliveryStats now also
  returns `failureReasons` — top 5 distinct (code,title) groups over the
  campaign's failed messages (jsonb `payload->'failureReason'`), and the
  broadcast detail panel lists them as "2× Error 131047: …" with the
  "refunded automatically" note. 1 new test + mock plumbing — 133/133 API
  green; verified live against real Postgres with a temp campaign +
  failed rows (grouping correct, smoke data cleaned up, demo counts
  restored to 2 messages / 0 broadcasts).
- **Pass #15 — Failed recipients drill-down**: `GET
  /api/broadcasts/:id/messages/failed` (tenant-checked, paginated, newest
  first) joins failed campaign messages with contact identity + reason;
  the expanded campaign panel now lists WHO didn't get the message
  (name/number + error + time, scrollable, "showing N of M"). 2 new tests
  — 135/135 API green, web 20/20 + build; route + 404 guard verified live.

## Recent completed batches (pre-automation)

**Gupshup real-integration batch DONE (see `docs/GUPSHUP-MASTER-SPEC.md` — the
authoritative API reference, verified against partner-docs.gupshup.io):**

- **Mock mode REMOVED.** `GupshupService` makes only real HTTP calls; missing
  `GUPSHUP_EMAIL`/`GUPSHUP_CLIENT_SECRET` throws a clear config error. Login
  uses the official `email`+`password` form fields (env var name unchanged).
- **v3 send is JSON** (`application/json`, app token in `Authorization`) with
  Meta Cloud API shapes; response ids read from `messages[0].id` OR
  `messageId` (both official variants).
- **Carousel ("collage") templates end to end**: `POST /templates/media`
  multipart upload → real Gupshup `mediaId` (mandatory first step, UI
  enforces upload-before-create), `templateType=CAROUSEL` + `cards[]`
  (2–10 cards, headerType/mediaId/body/sampleText/buttons), per-app
  submission to every live number, send path builds Meta's
  `{type:'carousel', cards:[{components:[header/body/button]}]}` block from
  the stored card structure. Template entity + migration:
  `template_type`, `cards`, `vertical`, `header_text`, `footer_text`,
  `example`, `gupshup_template_ids` (per-app id map).
- **Template sync (spec §2.2)**: `POST /templates/sync` + 15-min cron pulls
  GET /partner/app/{appId}/templates for every live app — updates statuses
  AND **imports** templates created outside the UI (parses containerMeta for
  carousel cards). Templates UI has a "Sync from Gupshup" button.
- **Number health (spec §2.3)**: `NumberHealthService` combines Meta quality
  (GREEN/YELLOW/RED from GET /partner/app/{appId}/ratings, app-token auth,
  polled on a schedule only — cached on `gupshup_apps`), 24h failure rate
  and usage vs tier ceiling (`messages.gupshup_app_id` column added).
  Traffic light via `GET /gupshup/numbers`; ratings refresh endpoint has a
  10-min cooldown (API is 10 req/min).
- **Multi-number routing (spec §2.4)**: shops can connect many numbers
  (onboard resumes pending, else creates a new app). Router picks the
  healthy number furthest from its tier ceiling; broadcasts pin a number or
  route automatically; mid-campaign RED → failover between batches or stop;
  pinned RED requires explicit `confirmUnhealthyNumber` (UI checkbox).
- **Templates UI**: text OR carousel builder (per-card image upload with
  mediaId badge, card text ≤160, optional URL/quick-reply button per card,
  2–10 cards, add/remove), footer field, optional real buttons — the old
  hardcoded `['Visit Store','Stop Promotions']` are gone. Broadcast wizard
  shows sending-number picker with health lights + confirm gate for RED.
- Tests: **61 backend + 15 frontend green**; both apps typecheck and build.

## Completed

- **Foundation (Groups A–B)**: NestJS 12 + TypeORM + Postgres/Redis/MinIO via
  docker-compose; JWT auth (super_admin / shop_owner) with rate limiting,
  password policy, production fail-fast config; tenant context interceptor;
  TypeORM migrations (8 applied, `migrationsRun: true` — register every new
  migration in BOTH `app.module.ts` and `database/data-source.ts`).
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
  route to number → session-window check → opt-in enforcement → category
  pricing → atomic debit → provider send → persist provider message id →
  refund on failure. Inbound webhook: IP allowlist + shared-secret
  verification, queue-based processing, contact resolution, 24h window
  tracking, text/button/interactive/reaction/media/location handling.
  Socket.IO live updates.
- **Broadcasts**: queued BullMQ dispatch, opted-in audience, wallet pre-check,
  per-message debit, live websocket progress, template variable filling,
  health-aware number routing with mid-campaign failover.
- **Inbox**: normalized message rendering (`lib/normalize.ts` +
  `MessageContent.tsx` — objects never reach JSX), template send with variable
  inputs when session closed, quick replies, optimistic sends with status ticks.
- **Admin**: real platform stats (`GET /shops/admin/stats`), shops list,
  activation/suspension, wallet crediting.
- **UI**: Apple-style light design system (globals.css), all pages swept.
- **Testing**: 61 backend + 15 frontend tests green (frontend covers the
  normalization layer — the {text,type} object-child crash class, phone
  normalization, Meta component building).
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
