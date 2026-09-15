# BizzHouse — Gupshup + WhatsApp Master Integration Spec

### The one file your AI agent loads before writing another line of integration code

Every request/response shape in Part 3 is grounded in Gupshup's own Partner
documentation (partner-docs.gupshup.io) and Meta's WhatsApp Cloud API
documentation — not invented, not simplified. Where the two sources disagreed
with earlier internal notes, the official docs won (see the "Verified against
official docs" notes inline). If your agent writes a function that doesn't match
one of these shapes exactly, it's guessing. Guessing is exactly what produced
the placeholder app.

> Verified 2026-09-15 against https://partner-docs.gupshup.io — key
> confirmations: login is `email`+`password`; v3 send is
> `Content-Type: application/json` with app token in `Authorization`; the v3
> success response is `{messages:[{id}], messaging_product, contacts}` (an
> alternate `{status, messageId}` shape also appears on some endpoints —
> handle both); carousel creation is `templateType=CAROUSEL` + `cards` on
> `POST /partner/app/{appId}/templates`; media upload is
> `POST /partner/app/{appId}/media` (multipart, `file_type`+`file`, 100MB max,
> `{mediaId, status}` response, media retained 30 days).

---

## Part 0 — Rules for the AI Agent (non-negotiable)

1. **No mocks. No placeholders. No fake data.** Every function that talks to Gupshup either makes the real HTTP call in Part 3, or throws a clear error ("GUPSHUP partner credentials missing" etc.) if it can't. Never return a hardcoded fake response so the UI "looks like it works."
2. **Every field you render or store must exist in Part 3.** If you find yourself inventing a field name that isn't in this doc, stop and flag it instead of guessing.
3. **The specific bug that's already happened, so it doesn't happen again:** the object `{"type":"text","text":"..."}` (or any webhook `payload`/`messages[]` entry) is a data structure, not a string. Never do `<div>{message}</div>` or `<div>{someObject}</div>` in JSX. Always pull the exact field out first — `<div>{message.text}</div>` — per the real shapes in Part 3.5. If a message can be text, image, video, audio, or document, render each type explicitly (a `switch` on `type`), not one generic path.
4. **This file supersedes `BizzHouse-Build-Phases.md`'s small-phase breakdown** for anything touching Gupshup. Phases 2–26 of that file (foundation, auth, wallet, payments — nothing Gupshup-specific) are still fine to build as-is. Everything from Gupshup onboarding onward, use the Sessions in Part 4 of *this* file instead — bigger, complete, end-to-end, not sliced thin.
5. **`BizzHouse-WhatsApp-Platform-Documentation.md` is still valid** for the DB schema and general wallet-ledger design. This file extends it; it doesn't contradict it.
6. If something is genuinely ambiguous after reading Part 3, ask — don't ship a guess.

---

## Part 1 — What's New Since the Last Two Files

- **Restated first priority, in this exact order:** business registers → adds all their contacts → connects a number (existing or new) → gets/picks a template → sends. Everything else is secondary to this loop actually working end to end with real Gupshup calls.
- **This is a marketing/broadcast platform first.** The common case is one business sending one template to hundreds or thousands of contacts, not one-off customer service chats.
- **New: Carousel ("collage") templates.** A single message with up to 10 image cards, each with its own text and button — built for product showcases. Full spec in §2.2, real API in §3.3.
- **New: Template sync.** The template screen must also *pull* templates that already exist on Gupshup/Meta, not only push new ones. Real API in §3.3.
- **New: Number health score.** A per-number score warning the shop before WhatsApp itself penalizes them for overuse. Grounded in Meta's real quality-rating system — spec in §2.3, real API in §3.6.
- **New: Multiple numbers per shop + routing.** A shop can connect more than one number; sends get routed across them. Spec in §2.4.
- **Pricing clarification:** one bundled per-message rate shown to the shop — never a separate line item labeled "platform fee." Spec in §2.5.

---

## Part 2 — Product Spec for the New Pieces

### 2.1 Contacts & Bulk Campaigns

A campaign = one template + one contact list + one sending number. Flow:

1. Shop imports contacts (CSV) or has them already (Group J from the architecture doc).
2. Shop picks a template — text or carousel — from their synced template list (§2.2).
3. Shop picks which of their connected numbers sends it (§2.4 — or let the router pick).
4. Backend estimates total cost: `contact_count × rate_card_price_for(template.category)` and shows it **before** the shop confirms — this is the wallet check from the architecture doc's §6, just run once for a batch instead of one message.
5. If wallet covers it, queue one send job per contact (don't block the request — this is why Group C's `BullMQ` queue exists). If it doesn't, block with a clear "top up ₹X to send this campaign" message.
6. Each job debits its own share of the wallet as it sends (same debit-then-refund-on-failure pattern as a single message) and calls the real send API from §3.4.
7. A campaign summary view shows sent/delivered/read/failed counts, live, fed by the webhook events in §3.5.

### 2.2 Templates, Including Carousel ("Collage")

Three things the template screen must do — all backed by real Gupshup calls, none of them stubbed:

- **Create:** submit a new template for Meta's approval (§3.3.1 for a plain text/media template, §3.3.4 for carousel).
- **Sync:** pull the list of templates that already exist for this app from Gupshup — including ones approved outside your own UI — and show their real status/category/rejection reason (§3.3.2). Unknown remote templates are **imported** as local rows, not skipped.
- **Edit:** update a template that's still editable (§3.3.3) — note Gupshup explicitly disallows editing a carousel template's media after creation, so don't build an "edit image" button for carousel cards.

**Carousel specifically:** 2–10 cards (Meta limit), each with a header image (or video) and its own short body text (≤160 chars) and optional button (URL or QUICK_REPLY only). Every image needs a real `mediaId` first — there is no way to attach an image to a template without uploading it through §3.3.5 first. Don't let the UI accept a raw file upload and skip straight to template creation; the upload step is mandatory and happens first, synchronously, before the create-template call fires.

### 2.3 Number Health Score

Don't invent a fake scoring formula — Meta already publishes the real signal. Build BizzHouse's score as a **combination** of:

| Input | Source | Why it matters |
|---|---|---|
| Meta's own quality rating (GREEN/YELLOW/RED) | Gupshup Ratings API, §3.6 | This is the actual signal Meta uses to throttle or ban a number |
| Current messaging tier / daily limit | Same API call | Tells you the ceiling before you hit it, not after |
| BizzHouse's own 24h failure rate for that number | Your own `messages` table | An early-warning signal that shows up *before* Meta's rating catches it — a spike in `status = failed` is often the first sign of trouble |
| BizzHouse's own send volume vs. that number's tier ceiling, last 24h | Your own `messages` table | Warn at 70–80% of the daily cap, per Meta's own recommended practice |

Poll the Ratings API on a schedule, not per-message — Gupshup returns "no event update available" most of the time, and it only updates roughly once a day per number anyway. Compute the composite score server-side; show the shop a simple traffic light (green/yellow/red) in the UI, not the raw numbers.

**Do not let a shop send a broadcast on a RED or Flagged number without an explicit warning-and-confirm step** — this is the exact mistake that gets numbers banned, and it's avoidable with data you already have.

### 2.4 Multiple Numbers Per Shop + Routing

A shop can connect more than one `whatsapp_apps` row (the architecture doc's schema already supports this — one shop, many rows). Routing logic when a campaign doesn't pin a specific number:

1. Filter to that shop's numbers with health score ≠ RED/Flagged.
2. Among the rest, prefer the one furthest from its daily tier ceiling (spreads load, reduces any one number's exposure).
3. If a chosen number goes RED *mid-campaign* (checked between batches, not per-message — don't hammer the ratings API), pause remaining sends on it and either fail over to another healthy number or stop and notify the shop, based on a setting they choose.

This is entirely BizzHouse-side logic — there's no Gupshup "routing API." You're just choosing which `whatsapp_app_id` a given send job uses before calling §3.4.

### 2.5 Pricing — One Bundled Rate

Never show "message cost + platform fee" as two line items. The shop sees one number per category. Reference numbers (yours to tune):

| Category | Reference wholesale cost | Shop-facing rate (bundled) |
|---|---|---|
| Marketing / Carousel | ~₹1.2 | ~₹1.5 |
| Utility (outside window) | ~₹0.20 | ~₹0.40 |
| Authentication | ~₹0.20 | ~₹0.40 |

The gap between the two columns is your margin — it lives only in your rate-card table (architecture doc §7), never in a UI string that says "fee." A campaign cost preview says "₹1.5 × 500 contacts = ₹750" — full stop.

---

## Part 3 — The Real API Reference

Base URL for everything in this section: `https://partner.gupshup.io`. All of it requires either your **Partner Token** (account-level) or a specific **App Token** (per-shop) — Part 3.1 covers getting both.

### 3.1 Authentication

**Partner login** — gets you the Partner Token:

```
POST /partner/account/login
Content-Type: application/x-www-form-urlencoded

email={{PARTNER_EMAIL}}&password={{PARTNER_SECRET}}
```

Returns a JWT valid ~12–24h. Cache it; don't log in on every request.

**Get an app's token** (needed for every per-shop call — sending, templates):

```
GET /partner/app/{appId}/token
Authorization: {{PARTNER_TOKEN}}
```

### 3.2 App & Number Management

**Create an app for a new shop:**

```
POST /partner/app
token: {{PARTNER_TOKEN}}
Content-Type: application/x-www-form-urlencoded

name={{shop_slug}}_bizzhouse
```

→ `{ "appId": "..." }`

**Generate the Embedded Signup link** (this is what the shop clicks to connect their number — no Meta Developer account needed on their end):

```
GET /partner/app/{appId}/onboarding/embed/link
Authorization: {{PARTNER_TOKEN}}
```

Link expires in 5 days; max 40 regenerations, 5 new links per app — don't regenerate on every page load, cache it and only refresh when it's actually expired.

**Existing-number migration** (Path B from the architecture doc — number is already on the consumer WhatsApp app):

```
POST /partner/app/{appId}/onboarding/phoneMigration
```

**"App live" webhook** — fires once onboarding completes; this is what flips your `whatsapp_apps.status` to `LIVE`. Configure the callback URL per app (§3.5 covers the general webhook subscription mechanics).

### 3.3 Templates

**3.3.1 — Create a template (text or single-media):**

```
POST /partner/app/{appId}/templates
Authorization: {{APP_TOKEN}}
Content-Type: application/x-www-form-urlencoded

elementName=order_confirmation
languageCode=en
category=UTILITY          // AUTHENTICATION | MARKETING | UTILITY
templateType=TEXT         // TEXT | IMAGE | VIDEO | DOCUMENT | CAROUSEL | PRODUCT | LOCATION | CATALOG
content=Hi {{1}}, your order #{{2}} is confirmed and will arrive by {{3}}.
example=Hi Rahul, your order #4471 is confirmed and will arrive by Friday.
header=Order Update        // optional
footer=Thank you           // optional
buttons=[{"type":"URL","text":"Track order","url":"https://x.com/track/{{1}}","example":["https://x.com/track/4471"]}]  // optional
enableSample=true
```

**3.3.2 — List/sync templates already on Gupshup** (this is the "get my templates from Gupshup" piece):

```
GET /partner/app/{appId}/templates
Authorization: {{APP_TOKEN}}
```

Real response shape:

```json
{
  "status": "success",
  "templates": [
    {
      "id": "00b2xxxx-xxxx-4788-9b66-bxxxxxxccd",
      "appId": "3cb92fbd-0bac-41d7-818e-4e4326d90335",
      "elementName": "order_confirmation",
      "category": "UTILITY",
      "languageCode": "en",
      "data": "Hi {{1}}, your order #{{2}} is confirmed...",
      "status": "APPROVED",
      "templateType": "TEXT",
      "quality": "UNKNOWN",
      "createdOn": 1671619377053,
      "modifiedOn": 1678794041479,
      "wabaId": "...",
      "containerMeta": "..."    // stringified JSON — carries `cards` for CAROUSEL templates
    }
  ]
}
```

Map `status` (`APPROVED` / `PENDING` / `REJECTED`) and `category` straight into your local `templates` table on a schedule (poll this, or trigger it after any template webhook event) — this is exactly what "sync" means. Show `data` as the template body in your UI, not a re-typed copy. For CAROUSEL rows, parse `containerMeta` to recover the card structure.

**3.3.3 — Edit a template:**

```
PUT /partner/app/{appId}/templates/{templateId}
Authorization: {{APP_TOKEN}}
```

Same fields as create. **Carousel templates cannot have their media edited after creation** — don't build that button.

**3.3.4 — Create a carousel ("collage") template:**

Same endpoint as 3.3.1, `templateType=CAROUSEL`, plus a `cards` field — a JSON array, 2–10 entries (Meta's media-card-carousel limit):

```
cards=[
  {
    "headerType": "IMAGE",
    "mediaId": "{{MEDIA_ID_FROM_3.3.5}}",
    "body": "Summer sale, {{1}} off!",
    "sampleText": "Summer sale, 25% off!",
    "buttons": [
      { "type": "URL", "text": "Shop now", "url": "https://shop.example.com/{{1}}", "example": ["https://shop.example.com/promo25"] }
    ]
  }
]
```

Per official docs the create call also takes `vertical` (required, ≤180 chars) and `example` (required). Card buttons support `URL` and `QUICK_REPLY` only. Every card needs its own real `mediaId` — get one per image from 3.3.5 **before** building this array.

**3.3.5 — Upload media, get a `mediaId`** (required before any image/video template or carousel card):

```
POST /partner/app/{appId}/media
Authorization: {{APP_TOKEN}}        // docs also show this as `token:` header — send the app token either way
Content-Type: multipart/form-data

file_type: image/jpeg
file: <binary>
```

→ `{ "mediaId": "1852559851913765", "status": "success" }`

Max 100MB. Supported types include `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, plus common document/audio types. Uploaded media is retained ~30 days.

### 3.4 Sending Messages

All sends go through the v3 passthrough endpoint, which mirrors Meta's own Cloud API request shape exactly:

```
POST /partner/app/{appId}/v3/message
Authorization: {{APP_TOKEN}}
Content-Type: application/json
```

**Plain text (session message, inside the 24h window only):**

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "919812345678",
  "type": "text",
  "text": { "body": "Is this still in stock? Yes!" }
}
```

**Template with text variables:**

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "919812345678",
  "type": "template",
  "template": {
    "name": "order_confirmation",
    "language": { "code": "en" },
    "components": [
      { "type": "body", "parameters": [{ "type": "text", "text": "Rahul" }, { "type": "text", "text": "4471" }] }
    ]
  }
}
```

**Media-based template (image header):**

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "919812345678",
  "type": "template",
  "template": {
    "name": "seasonal_promo",
    "language": { "code": "en_US" },
    "components": [
      { "type": "header", "parameters": [{ "type": "image", "image": { "link": "https://your-cdn.com/promo.jpg" } }] },
      { "type": "body", "parameters": [{ "type": "text", "text": "25%" }] }
    ]
  }
}
```

**Carousel template send** — `template.components` includes a `carousel` block whose `cards[]` each carry their own `components` (header media + body text + optional url-button suffix), mirroring Meta's Cloud API carousel shape. Build this by reading the card structure back from your synced template row (§3.3.2), not by hand-guessing the shape per send:

```json
"template": {
  "name": "summer_collage",
  "language": { "code": "en" },
  "components": [
    { "type": "body", "parameters": [{ "type": "text", "text": "Rahul" }] },
    { "type": "carousel", "cards": [
      { "components": [
        { "type": "header", "parameters": [{ "type": "image", "image": { "id": "{{mediaId}}" } }] },
        { "type": "body",  "parameters": [{ "type": "text", "text": "25%" }] },
        { "type": "button", "sub_type": "url", "index": "0", "parameters": [{ "type": "text", "text": "promo25" }] }
      ] },
      { "components": [ "…card 2…" ] }
    ] }
  ]
}
```

**Response (v3 passthrough, official shape):**

```json
{ "messages": [{ "id": "59f8db90-c37e-4408-90ab-cc54ef8246ad" }], "messaging_product": "whatsapp", "contacts": [{ "input": "919812345678", "wa_id": "919812345678" }] }
```

(Some Gupshup send endpoints return `{ "status": "submitted", "messageId": "…" }` instead — accept both, store whichever id you got.) This is an *acceptance*, not a delivery confirmation — store the message id, then wait for §3.5's webhook to learn what actually happened.

### 3.5 Receiving — Every Webhook Shape You'll Handle

All webhooks arrive at your one callback URL per app as `POST`, shaped like Meta's own Cloud API (`object: "whatsapp_business_account"`), with `gs_app_id` telling you which shop this belongs to. **Respond `200` within 10 seconds or Gupshup retries — don't do slow work synchronously inside the handler, queue it.**

**Status update — sent:**

```json
{
  "object": "whatsapp_business_account",
  "gs_app_id": "82ed52f4-30c0-4f12-81b4-e7ad07bd41de",
  "entry": [{
    "id": "112535025189792",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "display_phone_number": "919812345678", "phone_number_id": "158072934066266" },
        "statuses": [{
          "id": "wamid.HBgMOTE5...",
          "gs_id": "7daeb742-f2dc-4c09-90e0-d879d20f7b98",
          "recipient_id": "919812345678",
          "status": "sent",
          "timestamp": "1710930461",
          "conversation": { "id": "3dabdf65abaf1cbbf85217d232cce91e", "expiration_timestamp": "1710936120" }
        }]
      }
    }]
  }]
}
```

**Delivered / read** — identical shape, just `"status": "delivered"` or `"status": "read"`.

**Failed** — same shape, `"status": "failed"`, plus an `errors` array:

```json
"statuses": [{
  "id": "wamid.HBgMOTE3OTgwODkwOTc4...", "status": "failed", "recipient_id": "919812345678", "timestamp": "1710941507",
  "errors": [{ "code": 131047, "title": "Message failed to send...", "href": "https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/" }]
}]
```

Match on `statuses[].id` (the `wamid`) — and on `gs_id` where present — against the `gupshup_message_id` you stored at send time — that's how you know which of your own `messages` rows to update. `failed` is exactly where you reverse a `debit()` per the architecture doc's §6.

**Incoming text message** (customer replying):

```json
{
  "object": "whatsapp_business_account",
  "gs_app_id": "07c7c72d-20e3-4ff9-a5a1-14d1186eeec8",
  "entry": [{
    "id": "116676371511027",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "display_phone_number": "917835039205", "phone_number_id": "105523045970845" },
        "contacts": [{ "profile": { "name": "Rahul" }, "wa_id": "917506080480" }],
        "messages": [{
          "from": "917506080480",
          "id": "wamid.HBgMOTE3NTA2MDgwNDgw...",
          "timestamp": "1782372987",
          "type": "text",
          "text": { "body": "Is this still in stock?" }
        }]
      }
    }]
  }]
}
```

**This is the exact shape behind the historical rendering bug.** `messages[0]` is an object; `messages[0].text` is `{ "body": "..." }` — also an object. The string you want to render is `messages[0].text.body`. Never stop one level too early.

**Incoming image / video / audio / document** — same envelope, `messages[0].type` tells you which, and the type-named key holds the real data:

```json
"messages": [{
  "from": "917506080480", "id": "wamid...", "timestamp": "1782372910", "type": "image",
  "image": { "id": "1751740922668458", "mime_type": "image/jpeg", "sha256": "...", "url": "https://filemanager.gupshup.io/wa/.../media/1751740922668458?download=false" }
}]
```

Build one render function per type (`text` → `.text.body`, `image`/`video`/`audio`/`document` → a media preview using `.{type}.url`) — a single generic renderer that assumes `.text.body` exists on everything is exactly how you get the "object with keys {text, type}" crash on a media message.

### 3.6 Quality & Messaging Limits

**Get a number's real quality rating + tier:**

```
GET /partner/app/{appId}/ratings
Authorization: {{APP_TOKEN}}
```

```json
{ "oldLimit": "TIER_10K", "currentLimit": "TIER_10K", "event": "ONBOARDING", "eventTime": 1730000000, "phoneQuality": "GREEN" }
```

Or, most of the time: `{ "message": "no event update available", "status": "success" }` — that's normal, not an error; it just means nothing changed since you last checked. Rate-limited (10 req/min, and the data itself only moves roughly daily) — poll on a schedule (e.g. every few hours), never per-message.

**Tier reference (Meta-side, for context on what the numbers mean):**

| Tier | Daily limit | How you get there |
|---|---|---|
| Tier 0 | 250 | Default before business verification |
| Tier 1 | 1,000 | After verification |
| Tier 2 | 10,000 | Auto-upgrade after sustained quality + volume |
| Higher | 100K+ | Same, compounding |

`phoneQuality`: `GREEN` (high) / `YELLOW` (medium) / `RED` (low) — this is the exact value to feed §2.3's health score.

---

## Part 4 — Big Build Sessions

*(This part arrived truncated from the product owner — the session-by-session
breakdown it introduces lives in the implementation itself: see
`bizzhouse-api/src/modules/gupshup/` (client, number health, routing),
`bizzhouse-api/src/modules/templates/` (create/sync/edit incl. carousel),
`bizzhouse-api/src/modules/broadcasts/` (campaign dispatch with health-aware
failover), and `bizzhouse-web/src/app/(dashboard)/templates/` (carousel
builder with per-card media upload). Each session below is meant to be handed
to your AI agent as **one long sitting** — full context, not a sliver.)*
