# BizzHouse Product Completeness Matrix

Status legend: ✅ real (UI → API → DB/provider → UI) · 🟡 partial · ⬜ not started
"Provider" = Gupshup (WhatsApp) / Razorpay (payments). Mock-mode paths count as
real only when they exercise the same domain pipeline as live mode.

| Feature | Frontend | Backend | Database | Provider | Tests | Status | Blocker |
|---|---|---|---|---|---|---|---|
| Auth (signup/login/profile) | ✅ | ✅ rate-limited | ✅ users | — | ✅ | ✅ | — |
| Roles / authorization | ✅ role-gated nav | ✅ RolesGuard server-side | ✅ users.role | — | partial | ✅ | — |
| Tenant isolation (shop_id scoping) | ✅ shop context | ✅ every query scoped | ✅ FK + per-shop rows | — | 🟡 add regression test | ✅ | — |
| Shop onboarding (2 paths) | ✅ | ✅ | ✅ shops/gupshup_apps | ✅ createApp/migration/embed link | smoke | ✅ | real creds |
| WhatsApp connection status | ✅ polling page | ✅ webhook-driven | ✅ waba_status | ✅ app-live event | smoke | ✅ | real creds |
| v3 webhook subscription | — (auto) | ✅ idempotent | — | ✅ verified docs contract | smoke (mock) | ✅ | real creds |
| Inbound messages | ✅ live inbox | ✅ queue worker | ✅ messages | ✅ webhook + secret | smoke (mock) | ✅ | real creds |
| Outbound session messages | ✅ composer | ✅ | ✅ | ✅ v3/message | ✅ | ✅ | real creds |
| 24h session window | ✅ honest states | ✅ canonical rule | ✅ last_inbound_at | — | ✅ | ✅ | — |
| Template sends + variables | ✅ inputs | ✅ count-validated | ✅ | ✅ Meta components | ✅ | ✅ | real creds |
| Delivery status ticks | ✅ realtime | ✅ status webhook | ✅ messages.status | ✅ | smoke | ✅ | real creds |
| Refunds on failure | — (ledger view) | ✅ idempotent | ✅ refund rows | — | ✅ | ✅ | — |
| Templates CRUD/submit | ✅ + reasons | ✅ real payload | ✅ templates | ✅ /templates API | ✅ | ✅ | real creds |
| Template status sync | — (auto) | ✅ 15-min poll | ✅ | ✅ | — | ✅ | real creds |
| Contacts CRUD + search | ✅ | ✅ | ✅ contacts | — | — | ✅ | — |
| CSV import + opt-in confirm | ✅ | ✅ bulk, dedup | ✅ opted_in_at | — | — | ✅ | — |
| Broadcasts | ✅ wizard + live progress | ✅ queue dispatch | ✅ broadcasts | ✅ | ✅ | ✅ | real creds |
| Wallet ledger | ✅ history | ✅ atomic debit/refund | ✅ paise ledger | — | ✅ | ✅ | — |
| Razorpay recharge | ✅ Checkout SDK | ✅ HMAC webhook | ✅ topups | ✅ | smoke | ✅ | real creds |
| Pricing rate card | ✅ admin editor page | ✅ DB-backed + PATCH API | ✅ rate_cards | — | ✅ | ✅ | — |
| Shop Overview metrics | 🟡 in progress | 🟡 stats endpoint | ✅ derived | — | — | 🟡 | — |
| Automation rules | ⬜ | ⬜ execution planned | ⬜ | ✅ sends via pipeline | ⬜ | ⬜ | — |
| Team / agents | ✅ invite + list page | ✅ owner-only CRUD | ✅ users | — | ✅ live-verified | ✅ | — |
| Analytics (shop, time-range) | ✅ overview chart | ✅ daily buckets API | ✅ | — | ✅ live-verified | ✅ | — |
| Media re-hosting (S3) | ⬜ | ⬜ URL passthrough now | ⬜ | — | — | ⬜ | — |
| Admin shops/credit/stats | ✅ | ✅ | ✅ | — | — | ✅ | — |
| Alerts (low balance/drift) | — (webhook out) | ✅ dedup + thresholds | — | — | — | ✅ | ALERT_WEBHOOK_URL |
| Health checks | — | ✅ DB+Redis probes | — | — | — | ✅ | — |
| Observability (metrics) | ⬜ | 🟡 structured logs | — | — | — | 🟡 | Prometheus later |

## Honest gaps to call out

1. **Outbound media upload** — inbound media is re-hosted durably; sending
   media from the composer still needs an upload endpoint.
2. **Business-hours automation** — keyword rules execute; schedules/handoff later.
3. **Observability** — structured logs exist; Prometheus metrics not wired.
