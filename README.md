# BizzHouse — WhatsApp Business API Platform

> Multi-tenant WhatsApp Business API Platform with per-shop wallet billing and Gupshup Partner integration.

---

## ☁️ Deploy the frontend to Vercel

The Next.js app lives in **`bizzhouse-web/`**. Vercel auto-detects Next.js there:

1. Import this repo on [vercel.com/new](https://vercel.com/new).
2. Under **Build & Output Settings → Root Directory**, set `bizzhouse-web` (Vercel will prompt for this on monorepos and show "Next.js" detected).
3. Add the environment variable:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://your-api-host.com/api` (the URL where `bizzhouse-api` runs) |

4. Deploy — `bizzhouse-web/vercel.json` pins the framework so detection never misses.

> The API (`bizzhouse-api`) is a long-running NestJS server (Postgres + Redis + websockets) — host it on Render/Railway/Fly/a VPS, not Vercel.

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: v20+
- **Docker & Docker Compose**: (for PostgreSQL 16, Redis 7, MinIO)
- **Git**

---

### Step 1: Start Supporting Services (Database & Redis)

Start PostgreSQL, Redis, and MinIO in Docker:

```bash
# In project root:
docker compose up -d
```

This starts:
- **PostgreSQL 16**: `localhost:5432` (`bizzhouse` / `bizzhouse_dev_2026`)
- **Redis 7**: `localhost:6379`
- **MinIO**: `localhost:9000` (Console: `localhost:9001`)

> *Note: If you already have PostgreSQL and Redis installed locally, update `.env` in `bizzhouse-api/` with your local connection details.*

### Migrations (backend)

Schema changes are tracked via TypeORM migrations (`bizzhouse-api/src/database/migrations/`):

```bash
cd bizzhouse-api
npm run migration:run       # apply pending migrations (recorded in the `migrations` table)
npm run migration:revert    # revert the last one
npm run migration:generate -- SomeName   # generate from entity diffs
npm run migration:create -- SomeName    # create an empty migration file
```

---

### Step 2: Start the Backend API (`bizzhouse-api`)

```bash
cd bizzhouse-api
npm install
npm run start:dev
```

When started, the backend automatically:
1. Synchronizes TypeORM tables to PostgreSQL.
2. Connects to BullMQ Redis queues for webhook ingestion.
3. Seeds default accounts:
   - **Super Admin**: `admin@123` / `password@123`
   - **Demo Shop**: `demo@bizzhouse.com` / `Demo@BizzHouse2026` (Pre-funded with **₹500.00** credit and active WhatsApp connection)
4. Listens on `http://localhost:3001` (Webhook endpoint: `http://localhost:3001/webhooks/gupshup`).

---

### Step 3: Start the Web App (`bizzhouse-web`)

Open a new terminal window:

```bash
cd bizzhouse-web
npm install
npm run dev
```

The Next.js frontend starts on `http://localhost:3000`.

---

## 🔑 Ready-to-Use Accounts

| Role | Email | Password | What You Can Test |
|---|---|---|---|
| **Shop Owner** | `demo@bizzhouse.com` | `Demo@BizzHouse2026` | Live WhatsApp Inbox, Contacts, Real-time WebSocket chat, Wallet balance (₹500.00) |
| **Platform Admin** | `admin@123` | `password@123` | Platform Overview, Shop activation/suspension, Manual wallet crediting |

---

## 🧪 Testing the WhatsApp Flows

### 1. Test Outbound Messaging from UI
1. Log in as `demo@bizzhouse.com` at `http://localhost:3000/login`.
2. Go to **Inbox** (`/inbox`).
3. Select an existing conversation (e.g. *Pooja Sharma*) or click **"+"** to start a new chat with any 10-digit number.
4. Type a message and hit **Enter** or click **Send**.
5. The message is dispatched, wallet is atomically deducted (₹0.00 for session service or ₹1.50 for template), and in mock mode, the status automatically transitions from `queued` → `sent` → `delivered` → `read` with real-time blue double ticks!

### 2. Simulate Inbound WhatsApp Messages (Webhook)
To test receiving incoming WhatsApp customer messages into your inbox in real time:

```bash
# In the root folder:
node simulate-webhook.js message "Hi! What are your shop hours?"
```

Watch the message appear instantly in the BizzHouse inbox via WebSocket without refreshing!

### 3. Simulate Message Status Updates
```bash
node simulate-webhook.js status mock-msg-demo-1 read
```

---

## 📁 Repository Structure

```
oddbroad/
├── docker-compose.yml          # PostgreSQL 16, Redis 7, MinIO
├── simulate-webhook.js         # Interactive webhook test script
├── .env.example                # Root environment sample
│
├── bizzhouse-api/              # NestJS Backend API
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/           # JWT, role guards (super_admin / shop_owner), rate limiting
│   │   │   ├── shops/          # Multi-tenant shop management
│   │   │   ├── wallet/         # Atomic ledger, credit/debit/refund
│   │   │   ├── messages/       # Inbound/outbound chat & Socket.IO gateway
│   │   │   ├── broadcasts/     # Template broadcast campaigns via BullMQ dispatch queue
│   │   │   ├── contacts/       # Contact directory, CSV import, opt-in audit trail
│   │   │   ├── gupshup/        # Gupshup Partner API client & mock engine
│   │   │   ├── templates/      # Template submission + approval webhook tracking
│   │   │   ├── payments/       # Razorpay orders + signature-verified webhooks
│   │   │   ├── tasks/          # Scheduled jobs: low-balance & ledger-drift alerts
│   │   │   └── webhooks/       # High-throughput queue & background processor
│   │   ├── shared/             # Pricing engine + alert dispatcher (Slack-compatible)
│   │   └── database/           # TypeORM migrations & auto-bootstrap seeding
│
└── bizzhouse-web/              # Next.js 16 (App Router) Frontend
    ├── src/
    │   ├── app/
    │   │   ├── (dashboard)/
    │   │   │   ├── inbox/      # WhatsApp chat UI with real-time ticks
    │   │   │   ├── broadcasts/ # Live campaign builder with real-time progress
    │   │   │   ├── contacts/   # Contact list, CSV import with opt-in confirmation
    │   │   │   ├── templates/  # Template submission & approval tracking
    │   │   │   ├── wallet/     # Transaction history & balance
    │   │   │   └── admin/      # Shops management & wallet crediting
    │   │   ├── login/          # Authentication
    │   │   └── register/       # Self-serve onboarding
    │   ├── hooks/useAuth.ts    # Zustand global auth & shop state
    │   └── lib/socket.ts       # Socket.IO client with auto-reconnect
```

---

## 🛡️ Reliability & Safety Architecture

- **Atomic Wallet Debits**: Single PostgreSQL `UPDATE ... WHERE wallet_balance_paise >= $1 RETURNING` query prevents race conditions and balance overdrafts.
- **Idempotent Webhook Refunds**: If a message fails, refunds are guarded by row-level locking (`FOR UPDATE`) and checked against transaction history to prevent duplicate credits.
- **Nightly Ledger Reconciliation**: A scheduled job sums every shop's `wallet_transactions` and alerts (critical, no cooldown) if the cached balance drifts from the ledger.
- **Defensive Error Handling**: Universal error parser extracts exact messages from API responses to prevent truncated error toasts.
- **Automated Mock Engine**: Full local WhatsApp workflow testing without requiring live Meta or Gupshup credentials (`GUPSHUP_MOCK_MODE=true`, `RAZORPAY_MOCK_MODE=true`).

## 🔐 Production Hardening

- **Fail-fast config validation**: in `NODE_ENV=production` the API refuses to boot with a weak/missing `JWT_SECRET`, missing Gupshup/Razorpay credentials when mock mode is off, or a missing `RAZORPAY_WEBHOOK_SECRET`.
- **Rate limiting**: in-memory sliding-window limiter on `POST /auth/login` (10/min/IP) and `POST /auth/register` (5/min/IP).
- **Password policy**: minimum 8 characters with letter + number requirement.
- **Webhook IP allowlist**: set `WEBHOOK_IP_WHITELIST=1.2.3.4,5.6.7.8` to restrict `/webhooks/*` to Gupshup's egress IPs (email `devsupport@gupshup.io` for the current list).
- **Opt-in enforcement (Meta policy)**: template sends outside the 24-hour session window are rejected server-side unless the contact has a recorded opt-in (`contacts.opted_in_at`); CSV import requires an explicit opt-in confirmation checkbox in the UI.
- **Operational alerts**: set `ALERT_WEBHOOK_URL` to a Slack-compatible webhook; low Gupshup partner wallet, low shop balances, and ledger drift are dispatched with per-key cooldown (`ALERT_COOLDOWN_HOURS`, default 12).

## 📣 Broadcast Campaigns

Broadcasts send an approved template to every opted-in contact of a shop (optionally filtered by tag):

1. Backend validates the template is `APPROVED`, counts the opted-in audience, and **requires the wallet to cover the estimated cost up front**.
2. Dispatch runs on a dedicated BullMQ queue, sending sequentially with `BROADCAST_SEND_DELAY_MS` (default 100ms) between sends; every message is individually debited via the atomic ledger and refunded on provider failure.
3. If the wallet runs dry mid-campaign, remaining recipients are marked skipped and the broadcast is marked `failed` with the reason.
4. Progress (`sent/failed/cost`) is persisted per message and pushed live to open tabs over Socket.IO (`broadcast:update`).

## 📲 Gupshup Integration — What's Actually Wired

- **v3 callback subscription**: when a shop onboards (and again the moment its WABA flips LIVE), the API registers `POST /partner/app/{appId}/subscription` with `modes=ALL`, `version=3` and the callback URL from `PUBLIC_API_BASE_URL`. Without this step Gupshup never delivers inbound events — it's automatic here, with an idempotency check via `GET .../subscription`.
- **Inbound webhook authentication**: set `GUPSHUP_WEBHOOK_SECRET` and every callback must carry the matching `X-Gupshup-Webhook-Secret` header (registered via the subscription's `meta` field) — combined with `WEBHOOK_IP_WHITELIST` for defense in depth.
- **Template creation** uses the real `POST /partner/app/{appId}/templates` contract: `elementName/languageCode/category/content`, `example` auto-generated from `{{N}}` placeholders (Meta rejects submissions without it), header/footer (60-char limits), and structured button objects (`QUICK_REPLY`/`URL`/`PHONE_NUMBER`). Submission failures set the template to FAILED with the provider's reason.
- **Template status sync**: a 15-minute job polls `GET /partner/app/{appId}/templates` for every LIVE app and reconciles local rows (status + rejection reason + provider id) — webhooks are the fast path, this is the safety net.
- **Template variables**: sends accept `templateValues` (validated against the template's placeholder count) and broadcast accepts `bodyVariables`, both compiled into Meta `body` components before dispatch. A broadcast refuses to launch with unfilled variables.
- **E.164 normalization**: user input like `098765 43210` is normalized to `919876543210` on every send/contact/broadcast path.
- **Inbound media & interactive**: button replies, list replies, reactions, media (with mime type), locations and contact cards are all mapped into the message payload instead of falling into an opaque `raw` bucket.

## 🔄 Switching to Live API Keys

The platform runs fully on mocks locally. To go live, only `.env` changes are needed in `bizzhouse-api/`:

| Variable | Action |
|---|---|
| `GUPSHUP_MOCK_MODE` | Set `false`, fill `GUPSHUP_EMAIL` + `GUPSHUP_CLIENT_SECRET` (Partner Portal → Settings → API client details) |
| `RAZORPAY_MOCK_MODE` | Set `false`, fill `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` + `RAZORPAY_WEBHOOK_SECRET` |
| `JWT_SECRET` | Random 64+ character string (required in production) |
| `WEBHOOK_IP_WHITELIST` | Gupshup's webhook egress IPs |
| `ALERT_WEBHOOK_URL` | Slack/ops webhook for operational alerts |

No code changes required — the same code paths serve mock and live modes, with signature verification and token caching active in live mode.
