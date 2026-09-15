# BizzHouse — WhatsApp Business API Platform
### Complete Build Documentation: Product, Architecture, Database & Gupshup Integration

> **What this is:** everything needed to actually build BizzHouse — a multi-tenant platform where each shop gets its own WhatsApp Business account, picks its own number, and pays only from a credit wallet it tops up itself.
> **Status as of this doc:** Meta Business Portfolio + Meta App ("BizzHouse") created, Gupshup Partner Solution submitted, approval pending.
> **Last updated:** September 2026 — Gupshup's docs change often; treat exact numbers/URLs here as "true as of today," and re-check `partner-docs.gupshup.io` before you ship anything billing-related.

---

## 0. TL;DR — the five things to actually remember

1. **Every shop = one Gupshup "App" = one WABA = (usually) one phone number.** That's the unit you provision per shop.
2. **Gupshup's wallet is YOURS, not the shop's.** There's exactly one prepaid Gupshup wallet, at your partner account level. You must build your own internal per-shop ledger — Gupshup has no idea Shop A and Shop B exist as separate entities.
3. **Onboarding forks into two paths** — new number (Embedded Signup) or existing number (Migration) — exactly like you already figured out. Same "App," different API call.
4. There is **no solid official SDK**. You will call Gupshup's REST API directly. This is normal, not a red flag — even large BSPs' partners mostly do this.
5. The hard part of this product isn't the WhatsApp integration — it's the **wallet ledger being correct under concurrency**. Section 9 is the one to read twice.

---

## 1. What We're Building, In Plain English

BizzHouse is a multi-tenant SaaS platform that lets any shop send and receive WhatsApp messages through the official WhatsApp Business Platform, without that shop ever touching Meta, Gupshup, WABAs, or API keys directly.

Two kinds of people use it:

- **Shop owners** (your customers): sign up → connect a WhatsApp number (their own, or a new one) → top up a wallet → use a normal-looking chat/inbox app to talk to their customers, send broadcasts, manage contacts.
- **You** (BizzHouse admin): onboard shops, watch the platform's real Gupshup spend vs. what shops have paid in, set your markup, keep the lights on.

Under the hood, every shop is a separate WhatsApp Business Account, provisioned through **Gupshup** — your BSP (Business Solution Provider). You're the **Tech Provider** in Meta's terminology; that's exactly the "Partner Solution" flow you've already got pending approval.

---

## 2. Concepts You Need Before Writing Any Code

You said you don't have much background here — this table is the thing to bookmark. Get these ten terms solid and the rest of this doc (and Gupshup's docs) will make sense.

| Term | What it actually means |
|---|---|
| **WhatsApp Business Platform** (aka Cloud API) | Meta's official API for sending/receiving WhatsApp messages programmatically. This is what BizzHouse is built on. |
| **WABA** (WhatsApp Business Account) | The account object that owns one or more phone numbers on the platform. **In BizzHouse: one shop = one WABA.** |
| **BSP** (Business Solution Provider) | A company Meta has certified to host WABAs for other businesses. **Gupshup is your BSP.** You never call Meta's raw API directly — everything goes through Gupshup. |
| **Solution Partner** | Meta's name for a BSP like Gupshup. |
| **Tech Provider (TP)** | A company Meta has approved to manage *other* businesses' WhatsApp accounts on top of a Solution Partner. **This is you.** It's what your "Partner Solution" submission is for. |
| **Embedded Signup** | Meta's hosted popup flow where a business owner logs into their own Facebook/Meta account and creates or connects a WABA. Gupshup gives you a link to this per shop. |
| **Session message** | A free-form message sent within 24 hours of the customer's last message. No pre-approval needed, effectively free (see §4). |
| **Template message** | A pre-approved message format (Meta reviews and approves it) that you can send *outside* the 24-hour window — order updates, OTPs, promos, re-engagement. |
| **24-hour conversation window** | Opens when a customer messages you (or you open one with a template). Session messages inside it are free-form and unrestricted. |
| **Per-Message Pricing (PMP)** | Meta's current billing model, live since **1 July 2025**. You're billed per delivered template message, not per 24-hour conversation like the old (pre-2025) model. Rate depends on category (marketing / utility / authentication / service) and the recipient's country. |
| **Gupshup "App"** | Gupshup's unit of onboarding. In practice: **1 Gupshup App = 1 WABA = 1 shop** in BizzHouse. This is the object you create via the Partner API for every new shop. |
| **Quality Rating** | Meta scores every phone number (Green/Yellow/Red) based on block rates and complaints. A number that drops too low gets messaging limits cut, or in bad cases, restricted. Worth surfacing to shops (see §12). |

One more thing worth knowing since you'll see it in your Meta dashboard: Gupshup's BSP entity shows up as **"Gupshup OD"** or **"OneDirect"** — that's just Gupshup's dedicated BSP license for the partner/reseller ecosystem (as opposed to their direct self-serve product). Nothing to worry about; it's supposed to say that.

### 2.1 Does the shop need their own Meta Developer account?

No — worth being precise about this, since it's the difference between a self-serve product and one that needs a developer on every onboarding call.

- **The Meta Developer account + Meta App is BizzHouse's burden, once.** You've already done this — the "BizzHouse" app plus Business Portfolio (§12). Every shop reuses it.
- **The shop only ever needs a personal Facebook login.** Embedded Signup runs entirely inside a popup: log in → pick or create a lightweight Business Manager (auto-created inline if they don't have one) → select/verify their number → pick a display name → done. No developer console, no app creation, on their side, ever.
- **Sub-accounts:** Gupshup's Partner API lets you spin up a new "App" per shop under your one partner account — that's the sub-account mechanism (§8.2), and it's exactly what makes managing 100+ shops possible without 100+ separate Meta apps.
- **The one thing that IS per-shop and separate:** each shop's WABA gets its own WhatsApp Business Profile — photo, display name, description, catalog — set independently once they're live. None of that is shared with, or visible on, BizzHouse's own profile.

---

## 3. How the Money Actually Flows (read this section twice)

This is the part that quietly breaks platforms like this if it's not designed right up front.

### There is only ONE Gupshup wallet — and it's yours, not any shop's.

Gupshup's prepaid wallet operates at the **partner account level**. You recharge one wallet, in USD, via Stripe or Ebanx (minimum $10, maximum $10,000 per top-up), and Gupshup silently debits it for every message *any* of your shops send — across your entire platform. Gupshup has no concept of "Shop A's balance" vs. "Shop B's balance." That distinction only exists inside BizzHouse's own database, because you build it.

```
Shop A tops up ₹2,000 ─┐
Shop B tops up ₹500    ─┼──▶  YOUR database (Postgres)
Shop C tops up ₹10,000 ─┘     tracks each shop's balance separately

                               │
                               ▼ (your backend decides: does Shop A
                                  have enough for THIS message?)

                        YOUR ONE Gupshup wallet (USD, prepaid)
                               │
                               ▼ (Gupshup deducts the real cost per
                                  message — doesn't know or care
                                  which shop it was for)

                    Meta's per-message fee + Gupshup's fee
```

Practically, this means **BizzHouse is running its own internal bank**:

1. A shop tops up their BizzHouse wallet in ₹ (via Razorpay) → credited to that shop's balance in your DB.
2. On every outgoing message, BizzHouse checks that shop's balance, and — critically — **debits it atomically before calling Gupshup** (see §9 for exactly how).
3. Your backend then calls Gupshup's Send Message API, which draws down your *one* Gupshup wallet in USD (Meta's fee + Gupshup's fee).
4. **You must keep your own Gupshup wallet topped up ahead of aggregate shop usage.** If it hits zero, sending fails for *every shop at once*, even ones sitting on a healthy BizzHouse balance. Gupshup emails you at $5 remaining — set your own internal alert well above that (e.g. based on your daily burn rate), and ask your Gupshup account manager whether programmatic auto-recharge is available on your plan.

Your margin, in one line: **(what you charge shops per message) − (what Meta + Gupshup actually charge you)**. That spread is the entire unit economics of this business — get comfortable with the numbers in §10 before writing any billing code.

*(Aside: if the ₹5,000 flat setup-fee idea from earlier is still the plan, it fits neatly on top of this as a one-time onboarding charge, separate from the per-message wallet spend — worth deciding explicitly, since it changes how you'll want to message it to shop owners during signup.)*

---

## 4. Product Features

### 4.1 Shop onboarding
- Sign up: business name, category, contact details
- The choice screen you already designed:
  - "Connect my existing WhatsApp number" → Migration flow
  - "Set up a new WhatsApp number" → Embedded Signup flow
- Business/KYC verification status tracking (mirrors Meta's own verification state)
- Default currency/timezone/language

### 4.2 Wallet & billing
- Add credits via Razorpay (UPI, cards, netbanking — UPI will be most of your volume)
- Real-time balance, auto-debit per message sent
- Low-balance warnings (in-app, email, and — obviously — WhatsApp)
- Downloadable transaction history / statement
- Optional: auto-recharge threshold ("top up ₹500 automatically when balance < ₹100")
- Optional: monthly plan + bundled credits instead of pure pay-as-you-go, for shops who want predictability

### 4.3 Inbox — the "actual WhatsApp app" part
This is the piece that makes it feel like a real product instead of an API demo:
- Real-time two-way chat per contact, session + template messages
- Shared inbox with multiple agents, conversation assignment/ownership
- Sent / delivered / read / failed ticks
- Media: image, video, document, audio, sticker, location, contact cards
- Quick replies / saved responses
- Notes and tags on conversations
- Search and filters — unread, assigned to me, by tag, by shop (for your admin view)

### 4.4 Templates
- Create and submit templates to Meta for approval, through Gupshup
- Track approval status (pending / approved / rejected, with reason)
- Variables, buttons (quick reply, URL, call, copy-code), media headers, carousels
- Per-template performance (sent / delivered / read / button-clicked)

### 4.5 Contacts & broadcasts
- CSV import, tags/segments
- **Opt-in/opt-out tracking — not optional, this is a Meta policy requirement, not a nice-to-have** (see §12)
- Broadcast a template against a segment, with scheduling

### 4.6 Automation
- Keyword/rule-based auto-reply
- Business-hours auto-response
- WhatsApp Flows for structured multi-step forms (address collection, feedback, bookings)
- Bot → human hand-off

### 4.7 Analytics
- Per-shop: sent/received/delivered/read, spend over time, template performance
- Platform-wide (your admin view): total real spend vs. Gupshup wallet balance, shop growth, top shops by usage/revenue

### 4.8 Team & roles
- Shop owner invites agents; roles (owner / agent / viewer)
- Per-agent conversation assignment

### 4.9 BizzHouse super-admin panel
- Onboard / approve / suspend shops
- Per-shop Gupshup "App" status (pending / live / rejected) with the raw error if something failed
- Markup/pricing rules editor — per message category, optionally per shop tier
- Global Gupshup wallet monitor + top-up shortcut
- Support view into any shop's conversations, for troubleshooting

---

## 5. System Architecture

```
┌──────────────┐            ┌───────────────┐
│  Shop Owner  │            │  End Customer  │
│ (BizzHouse   │            │  (on WhatsApp) │
│  web/app)    │            │                │
└──────┬───────┘            └───────┬────────┘
       │ HTTPS                       │ WhatsApp
       ▼                             ▼
┌───────────────────────────────────────────────┐
│                BizzHouse Backend                │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐ │
│  │   API    │  │  Webhook   │  │    Queue     │ │
│  │  Server  │  │  Receiver  │  │   Workers    │ │
│  └────┬─────┘  └─────┬──────┘  └──────┬───────┘ │
│       │              │                │         │
│  ┌────▼──────────────▼────────────────▼──────┐  │
│  │        Core services (multi-tenant)         │  │
│  │  Auth · Wallet Ledger · Messaging ·         │  │
│  │  Templates · Contacts · Automation          │  │
│  └────┬─────────────────────────────────────┘  │
│       │                                          │
│  ┌────▼─────┐   ┌───────────┐   ┌─────────────┐ │
│  │ Postgres │   │   Redis   │   │  S3 (media)  │ │
│  │ (source  │   │ (queues,  │   │              │ │
│  │ of truth)│   │  cache,   │   │              │ │
│  │          │   │  pub/sub) │   │              │ │
│  └──────────┘   └───────────┘   └─────────────┘ │
└─────────────────────┬───────────────────────────┘
                       │ REST — Partner API
                       ▼
             ┌──────────────────────┐
             │  Gupshup Partner      │
             │  Platform (your BSP)  │
             │  partner.gupshup.io   │
             └──────────┬─────────────┘
                       ▼
             ┌──────────────────────┐
             │  Meta WhatsApp        │
             │  Cloud API             │
             └──────────────────────┘
```

**What each piece does:**

- **API server** — REST endpoints for the shop dashboard and your admin panel.
- **Webhook receiver** — a deliberately dumb, fast endpoint. Its only job is to acknowledge Gupshup's callback in under a second and dump the raw payload onto a queue. Gupshup's own rule: **respond 2xx within 10 seconds or it's treated as failed and retried** — but aim for under 100ms in practice, since every millisecond you take delays every inbound message for every shop.
- **Queue workers** — do the actual work asynchronously: route inbound messages to the right shop's inbox, handle outbound sending with rate limiting/retries, process wallet debits.
- **Core services** — everything here is scoped by `shop_id`. No exceptions.
- **Postgres** — source of truth, and non-negotiable for the wallet ledger, which needs real ACID transactions.
- **Redis** — BullMQ queues, caching, and pub/sub for pushing live inbox updates to connected agents over websockets.
- **S3** — WhatsApp media URLs from Meta expire quickly; you need to fetch and re-host media yourself if you want it to persist in a shop's chat history.

### 5.1 Multi-tenancy model
At the scale you're likely starting at (tens to low hundreds of shops), **row-level multi-tenancy** — a `shop_id` column on every tenant-owned table, enforced in every query — is the right call over schema-per-tenant or database-per-tenant. Simpler to operate, simpler to migrate. Add Postgres **Row-Level Security (RLS)** policies as a backstop so a bug in application code can't leak one shop's data into another's query — this is cheap insurance and worth doing from day one, not retrofitting later.

### 5.2 Sending a message — step by step
1. Agent sends a message via the BizzHouse UI → API server.
2. API server checks the shop's wallet balance and **atomically reserves/debits the cost before calling Gupshup** (§9 has the exact SQL).
3. API server calls Gupshup's Send Message API with that shop's app token.
4. Gupshup returns a message ID → stored with `status = sent_to_provider`.
5. Gupshup/Meta later POSTs a status webhook (sent/delivered/read/failed) → webhook receiver → queue → `messages.status` updated.
6. If the final status is `failed`, refund the shop's wallet reservation and notify them.

### 5.3 Receiving a message — step by step
1. Customer messages the shop's WhatsApp number → Meta → Gupshup → your webhook URL (subscribed per-app).
2. Webhook receiver acks immediately, pushes the raw payload to a queue.
3. A worker identifies the shop from the payload's app/phone identifiers, resolves or creates the contact, stores the message, and pushes it live to that shop's inbox over websocket.
4. Auto-reply / business-hours rules are checked and triggered if applicable.

---

## 6. Tech Stack

Given your existing background — Kubernetes, Docker, CI/CD, AWS, and the Next.js projects you've already shipped — here's a stack that plays to what you already know rather than asking you to learn a second stack just for this:

| Layer | Recommendation | Why |
|---|---|---|
| Backend | Node.js + TypeScript (NestJS) | Structured, DI-friendly, scales well for multi-tenant SaaS; strong ecosystem for queues/webhooks |
| Database | PostgreSQL | ACID transactions are non-negotiable for a wallet ledger — this isn't a place to compromise |
| Cache / Queue | Redis + BullMQ | Webhook processing, send queue, retries, rate limiting — this is basically your Job Queue Worker System pattern again, applied here |
| Realtime | Socket.IO (or raw WebSockets) | Live inbox updates for agents without polling |
| Frontend (shop app + admin panel) | Next.js + TypeScript + Tailwind | You've already built with this stack |
| Payments (wallet top-up) | Razorpay | UPI-first, built for Indian shop owners, easy webhook-based settlement confirmation |
| WhatsApp integration | Direct REST calls to Gupshup's Partner API | No mature official SDK exists (§8.0) — a thin internal client you control is more reliable than a barely-maintained community package |
| Infra | Docker + Kubernetes + AWS | Matches your existing DevOps stack directly |
| CI/CD | GitHub Actions, same pattern as your End-to-End DevOps Pipeline project | Reuse, don't rebuild |
| Object storage | S3 (or S3-compatible) | Re-hosting WhatsApp media before Meta's URLs expire |
| Monitoring | Prometheus/Grafana, or a hosted equivalent | The two numbers that matter most here: webhook ack latency, and queue depth |

---

## 7. Database Schema — Core Tables

This is deliberately concrete — copy/adapt directly.

```sql
-- Shops = tenants
CREATE TABLE shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'onboarding',       -- onboarding | active | suspended
  wallet_balance_paise BIGINT NOT NULL DEFAULT 0,  -- ALWAYS integer paise, never float rupees
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per WhatsApp number/WABA = one Gupshup "App"
CREATE TABLE gupshup_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id),
  gupshup_app_id TEXT NOT NULL UNIQUE,     -- the appId Gupshup returns on creation
  app_token TEXT,                          -- app-level access token — encrypt at rest
  phone_number TEXT,
  onboarding_type TEXT NOT NULL,           -- 'new_number' | 'existing_number'
  waba_status TEXT NOT NULL DEFAULT 'pending', -- pending | live | rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only ledger. Never UPDATE a row here — only INSERT.
CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id),
  type TEXT NOT NULL,             -- 'topup' | 'debit' | 'refund'
  amount_paise BIGINT NOT NULL,   -- positive for topup/refund, negative for debit
  reference_id TEXT,              -- razorpay payment id, or the message id it paid for
  balance_after_paise BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id),
  wa_id TEXT NOT NULL,             -- customer's WhatsApp number
  name TEXT,
  opted_in BOOLEAN NOT NULL DEFAULT false,
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shop_id, wa_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  direction TEXT NOT NULL,          -- 'outbound' | 'inbound'
  message_type TEXT NOT NULL,       -- 'text' | 'template' | 'image' | ...
  gupshup_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued', -- queued|sent|delivered|read|failed
  cost_paise BIGINT,                -- what THIS message cost the shop
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,           -- MARKETING | UTILITY | AUTHENTICATION
  language TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Raw webhook log — keep every payload, forever if you can afford it.
-- This is what you'll grep through at 11pm when a shop says "my message never arrived."
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gupshup_app_id TEXT,
  event_type TEXT,
  raw_payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

The one query that matters more than any other in this whole system:

```sql
-- Atomic "debit if there's enough balance." This single statement
-- IS your race-condition protection — don't split it into a
-- read-balance-then-write-balance pair, that's how two concurrent
-- sends both succeed against a balance that only covered one.
UPDATE shops
SET wallet_balance_paise = wallet_balance_paise - :cost_paise
WHERE id = :shop_id
  AND wallet_balance_paise >= :cost_paise
RETURNING wallet_balance_paise;

-- Zero rows returned = insufficient balance. Reject the send
-- BEFORE calling Gupshup, not after.
```

---

## 8. Gupshup Integration — Step by Step

Base URL for everything below: **`https://partner.gupshup.io`**

### 8.0 A note on SDKs — don't go looking for one
There's no actively maintained, official Gupshup SDK for Node, Python, or anything else. What exists (`gupshup-whatsapp-sdk` on npm, a couple of Python/Laravel community packages) are thin, low-adoption wrappers you'd be trusting with your billing-critical send path. Build your own small internal `GupshupClient` around the REST API instead — you only need ~10–15 endpoints, it's genuinely not much code, and you get full control over retries, logging, and error handling.

### 8.1 Authentication — two tiers of tokens
**Partner token** — account-level, used for things like creating apps:
```bash
curl --location --request POST 'https://partner.gupshup.io/partner/account/login' \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'email={{EMAIL}}' \
  --data-urlencode 'secret={{CLIENT_SECRET}}'
```
Returns a JWT (`token`) valid for **24 hours**, rate-limited to 10 requests/60s. Generate the client secret from Settings → API client details on the Partner Portal; rotate at least every 3 months.

**App token** — scoped to one shop's Gupshup App, used for actual messaging (`GET /partner/app/{appId}/token`). Cache both token types and refresh proactively before expiry rather than on-failure.

### 8.2 Creating a shop's Gupshup "App"
```bash
curl --location --request POST 'https://partner.gupshup.io/partner/app' \
  --header 'token: {{PARTNER_TOKEN}}' \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'name={{appName}}' \
  --data-urlencode 'templateMessaging=true' \
  --data-urlencode 'disableOptinPrefUrl=false'
```
`name` must be 6–150 characters, no special characters, unique across Gupshup. Response: `{"appId": "<app_id>"}` — store this as `gupshup_apps.gupshup_app_id`.

### 8.3 Onboarding Flow A — New Number (Embedded Signup)
```bash
curl --location --request GET \
  'https://partner.gupshup.io/partner/app/:appId/onboarding/embed/link?regenerate=false&user=<shop_owner_name>&lang=en' \
  --header 'token: {{PARTNER_TOKEN}}'
```
Response: `{"status": "success", "link": "<embed_link>"}`. Show this link (or embed it) to the shop owner — they log into their own Facebook Business account, pick or verify a number, and accept WhatsApp's terms entirely inside Meta's hosted flow.

Practical limits worth designing around: **the link expires after 5 days**, can be regenerated up to 40 times, and only 5 *new* links can be issued per app — so build a "resend link" action rather than silently generating a fresh one on every page load.

### 8.4 Onboarding Flow B — Existing Number (Migration)
```bash
curl --location --request POST \
  'https://partner.gupshup.io/partner/app/:appId/onboarding/phoneMigration' \
  --header 'token: {{PARTNER_TOKEN}}' \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'migrationStatus=META_EMBED_MIGRATION'
```
Use `META_EMBED_MIGRATION` if the app isn't live yet, `MIGRATED_IN` if it's already live elsewhere. This flags the number as coming from another BSP so Meta/Gupshup expect the handover — the shop owner still goes through Embedded Signup, just with this flag set first.

**Be honest with shop owners about this path**: it's the one with real-world friction — the number might still be active on the WhatsApp Business *app* (not API) or with another BSP, which needs to be released first, plus OTP re-verification. Budget for this needing support hand-holding, at least initially; don't market it as fully self-serve on day one.

### 8.5 Sending a message
```bash
curl --location --request POST \
  'https://partner.gupshup.io/partner/app/{appId}/v3/message' \
  --header 'Authorization: {{APP_TOKEN}}' \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'messaging_product=whatsapp' \
  --data-urlencode 'recipient_type=individual' \
  --data-urlencode 'to=91XXXXXXXXXX' \
  --data-urlencode 'type=text' \
  --data-urlencode 'text={"body":"Hello from BizzHouse!"}'
```
Response:
```json
{
  "messages": [{ "id": "8b149927-8f3c-40da-b62c-58eeff60903e" }],
  "messaging_product": "whatsapp",
  "contacts": [{ "input": "91XXXXXXXXXX", "wa_id": "91XXXXXXXXXX" }]
}
```
This is Gupshup's **v3 passthrough API**, which mirrors Meta's own payload format — use this over the older v1/v2 APIs for new builds; it gets new WhatsApp features faster and makes it easier to switch BSPs later if you ever need to. Template messages use `type=template` with the template's language/namespace/name/components instead of `text`.

### 8.6 Receiving messages & status — webhooks
Subscribe your webhook URL per app (v3 subscription API). Two event shapes you'll parse constantly:

**Incoming message:**
```json
{
  "entry": [{
    "changes": [{
      "field": "messages",
      "value": {
        "contacts": [{ "profile": { "name": "Sneha" }, "wa_id": "9199XXXXXXXX" }],
        "messages": [{
          "from": "9199XXXXXXXX",
          "id": "wamid.HBgM...",
          "text": { "body": "Hi" },
          "timestamp": "1705574871",
          "type": "text"
        }],
        "messaging_product": "whatsapp",
        "metadata": { "display_phone_number": "9183XXXXXXXX", "phone_number_id": "207437372456043" }
      }
    }],
    "id": "216141188246170"
  }],
  "gs_app_id": "bf9ee64c-3d4d-4ac4-8668-732e577007c4",
  "object": "whatsapp_business_account"
}
```

**Status update:**
```json
{
  "entry": [{
    "changes": [{
      "field": "messages",
      "value": {
        "metadata": { "display_phone_number": "9183XXXXXXXX", "phone_number_id": "207437372456043" },
        "statuses": [{
          "gs_id": "3de985af-d06e-41e1-acaf-c379b429668a",
          "id": "fc46fadf-5075-4bb6-9cff-f3ff8c6f6478",
          "recipient_id": "9199XXXXXXXX",
          "status": "read",
          "timestamp": "1705574869"
        }]
      }
    }],
    "id": "216141188246170"
  }],
  "gs_app_id": "bf9ee64c-3d4d-4ac4-8668-732e577007c4",
  "object": "whatsapp_business_account"
}
```
Use `gs_app_id` to resolve which shop this event belongs to. Status values you'll see: `sent`, `delivered`, `read`, `failed`, `deleted`, `warning`.

**Non-negotiable webhook rules** (Gupshup will retry-storm you if you skip these):
- Respond **2xx with an empty body**, and do it fast — acknowledge synchronously in under ~100ms if you can, treat 500ms–1s as the outer limit, and 10 seconds as an outright failure that triggers a retry.
- Do all real processing **asynchronously**, off a queue — the webhook handler's only job is "receive, ack, enqueue."
- Whitelist Gupshup's inbound IPs at your firewall/load balancer (email `devsupport@gupshup.io` to get the current list) — cheap security win.

### 8.7 Templates
Category must be `MARKETING`, `UTILITY`, or `AUTHENTICATION`. Separate creation endpoints exist per content type (text, image, video, location, product, catalog, carousel, limited-time-offer, flow) — all under `/partner/app/{appId}/templates/...`. Submitted templates go to Meta for review (hours to a couple of days); poll `GET /partner/app/{appId}/templates` or watch for the status webhook rather than assuming instant approval.

### 8.8 Health-check endpoints worth wiring into your admin panel
| Purpose | Endpoint pattern |
|---|---|
| Is this app's WABA healthy? | `GET /partner/app/{appId}/health` |
| App-level wallet/usage snapshot | `GET /partner/app/{appId}/wallet-balance` |
| Number quality rating | `GET /partner/app/{appId}/ratings` |
| Daily usage / discount data | `GET /partner/app/{appId}/usage` |

*(These four follow Gupshup's consistent `/partner/app/{appId}/...` pattern confirmed throughout their docs — double-check exact response fields against the live API reference before you build against them, since I'm confident on the paths but haven't hand-verified every response shape.)*

---

## 9. Credit / Wallet System — Implementation Detail

Building directly on §3 and §7:

**1. Maintain your own price list, not a hardcoded number.** Store ₹-per-message rates by category (and shop tier, if you ever segment) in a table your admin panel can edit — never hardcode a margin in application code. Meta's rates move; yours needs to move with them without a deploy.

**2. Reserve before you send, don't debit after.** The atomic `UPDATE ... WHERE balance >= cost` from §7 has to run **synchronously, in the request path, before the Gupshup API call** — not after a webhook confirms delivery. If you debit only on delivery confirmation, a shop can fire off far more messages than their balance covers in the gap before webhooks come back; the deduction has to happen at send-time.

**3. Refund on failure.** If a message ends in `status = failed`, insert a `refund` row and add it back to `wallet_balance_paise` — same atomic pattern, just adding instead of subtracting.

**4. Reconcile nightly.** A scheduled job that sums each shop's `wallet_transactions` and compares it to the cached `wallet_balance_paise` catches drift early — belt and suspenders around money is cheap insurance.

**5. Watch your own Gupshup wallet separately from any shop's.** Alert yourself well above Gupshup's own $5 trigger — base it on your platform's daily burn rate, not a fixed number, since that trigger point should grow as you onboard more shops.

### Illustrative unit economics (verify live before pricing anything)
Meta's own rate card varies by country and category, and gets revised periodically — India rates in particular were recently updated for 2026. As a **rough, illustrative** starting point (not a number to hardcode):

| Category | Approx. Meta rate (India) | Notes |
|---|---|---|
| Marketing | ~₹0.85–1.10 / message | Most expensive category by a wide margin; nudged up again around Jan 2026 |
| Utility | ~₹0.12–0.15 / message | Transactional — order updates, receipts |
| Authentication | ~₹0.12–0.15 / message | OTPs, login codes |
| Authentication (international) | ~₹2.30 / message | Triggered whenever the OTP recipient's number is outside India — easy to miss if you budget off the domestic rate alone |
| Service (session) | Free | Any reply within the 24-hour customer-initiated window |

On top of that, Gupshup adds a flat **$0.001 per outgoing template or session message** (confirmed from their current self-serve pricing page) — a small amount, but it multiplies at volume, so bake it into your margin calculation rather than treating it as noise.

**Design your ₹-per-message price to shops as: Meta's rate + Gupshup's fee + your margin — priced in whole paise, stored as an integer, recalculated whenever you update the admin price list.** Don't let shops see or need to understand any of the underlying layers.

---

## 10. Onboarding UX (shop-facing)

Formalizing the flow you'd already landed on:

```
How do you want to use WhatsApp?

 ○ Connect my existing WhatsApp Business number
   → We'll migrate it over — you keep your number
   → Backend: §8.4 (Migration)

 ○ Set up a new WhatsApp number
   → Point us to a number that isn't on WhatsApp yet
   → Backend: §8.3 (Embedded Signup)
```

The shop owner should never see the words "WABA," "BSP," "Solution ID," or "Tech Provider." Your UI copy should read like a normal SaaS onboarding step, with all of Meta/Gupshup's complexity handled behind the two buttons above.

Set expectations in your support materials/FAQ: **new-number setup is reliably self-serve** (Embedded Signup is designed for exactly this); **existing-number migration has more real-world edge cases** and may need a human on your side to unblock occasionally, at least until you've onboarded enough shops to know the common failure modes cold.

---

## 11. Security & Compliance

- Encrypt `app_token` and any Gupshup secrets at rest (KMS or equivalent); never log them, even at debug level.
- Rotate the partner client secret on a schedule — Gupshup's own recommendation is at most every 3 months for admin/developer accounts.
- Validate and rate-limit the webhook endpoint; whitelist Gupshup's IPs (§8.6).
- **Opt-in is a Meta policy requirement, not a BizzHouse feature choice** — customers need to have opted in before a shop messages them outside a session window. Build this into contact import and broadcast sending so a shop literally cannot skip it, rather than relying on shops to self-police.
- Contact phone numbers and message content are personal data, potentially across 100+ shops' customer bases — encrypt sensitive fields, define a retention policy, and treat this with the same seriousness you'd want your own data treated with.
- Monitor quality ratings (§8.8) and warn shops *before* a number gets throttled or restricted for spammy sending patterns — this is the kind of thing that quietly kills trust in a platform if shops discover it after the fact.
- Meta's business verification typically wants a GST certificate (or Udyam/MSME registration), a certificate of incorporation, and/or a utility bill, depending on business type — worth listing in your shop onboarding checklist so it's not a surprise mid-flow. Confirm current requirements against Meta's verification page since these do get revised.

---

## 12. Where You Are Right Now vs. What's Left

Grounding this in your actual progress so far:

- ✅ Meta Business Portfolio created/verified
- ✅ Meta App ("BizzHouse") created, WhatsApp use case added
- ✅ Partner Solution submitted (`ONLY MY PARTNER` permission, Gupshup's app ID `340384197887925`)
- ⏳ Partner Solution: pending Gupshup approval
- ⬜ Business verification
- ⬜ App Review — needs two short screen recordings: one showing a message sent and received, one showing a template created (via Gupshup UI/API is an accepted substitute for your own app footage at this stage)
- ⬜ Meta app flipped from DEV to LIVE mode
- ⬜ Approved Solution ID registered on the Gupshup Partner Portal
- ⬜ Production setup / your first real Embedded Signup, end to end

Nothing in this document changes that sequence — it's all still the right next steps. This doc is what to build once that pipe is proven end-to-end with one real number.

---

## 13. Development Roadmap

**Phase 0 — prove the pipe (now):** finish Tech Provider approval, get one number live, send and receive a test message with raw `curl`/Postman calls. No product code yet — just confirm Meta → Gupshup → you works end to end.

**Phase 1 — MVP, single shop:** backend skeleton (auth, DB, one hardcoded Gupshup app), basic inbox (text + one media type), manual wallet credit (you add balance directly, no payment gateway yet), reliable webhook receiver with status tracking.

**Phase 2 — multi-shop onboarding:** shop signup flow with both onboarding paths wired to real Gupshup calls, Razorpay wallet top-up, the atomic per-message debit logic from §9 running for real.

**Phase 3 — the actual product:** templates UI with approval tracking, contacts/broadcasts/campaigns, team roles and multi-agent inbox, analytics dashboards at both shop and admin level.

**Phase 4 — scale and retain:** automation/bot layer, WhatsApp Flows, quality-rating monitoring with shop-facing alerts, auto-recharge, tiered pricing plans.

---

## 14. API Quick Reference

| Purpose | Method & Path | Auth |
|---|---|---|
| Get partner token | `POST /partner/account/login` | Email + client secret |
| Create app (= shop) | `POST /partner/app` | Partner token |
| Get app-level token | `GET /partner/app/{appId}/token` | Partner token |
| Generate Embedded Signup link (new number) | `GET /partner/app/{appId}/onboarding/embed/link` | Partner token |
| Mark app for migration (existing number) | `POST /partner/app/{appId}/onboarding/phoneMigration` | Partner token |
| Send a message | `POST /partner/app/{appId}/v3/message` | App token |
| Get app health | `GET /partner/app/{appId}/health` | Partner token |
| Get wallet balance | `GET /partner/app/{appId}/wallet-balance` | Partner token |
| Get quality rating | `GET /partner/app/{appId}/ratings` | Partner token |
| Get / create templates | `GET,POST /partner/app/{appId}/templates` | Partner token |

Base URL: `https://partner.gupshup.io`

---

## 15. Sources

- Gupshup Partner Documentation — https://partner-docs.gupshup.io/
- Gupshup Partner API Reference — https://partner-docs.gupshup.io/reference
- Gupshup Self-Serve WhatsApp Pricing — https://www.gupshup.ai/isv-partners/whatsapp-api/pricing
- Meta Tech Provider onboarding guide — https://developers.facebook.com/docs/whatsapp/solution-providers/get-started-for-tech-providers

All API paths, parameters, and JSON shapes above were pulled directly from Gupshup's live partner documentation as of September 2026 — re-verify anything billing-critical against the current docs before shipping, since BSP APIs do evolve.
