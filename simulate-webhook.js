/**
 * BizzHouse Webhook Simulator
 *
 * Use this script to simulate incoming WhatsApp messages and status receipts from Gupshup.
 *
 * Usage:
 *   node simulate-webhook.js message "Hi! What are your shop hours?"
 *   node simulate-webhook.js status <gupshup_msg_id> delivered
 *   node simulate-webhook.js status <gupshup_msg_id> read
 */

const http = require('http');

const API_PORT = process.env.API_PORT || 3001;
const DEFAULT_APP_ID = 'mock-app-demo';
const DEFAULT_PHONE = '919876543211';

async function sendWebhook(payload) {
  const data = JSON.stringify(payload);
  const options = {
    hostname: 'localhost',
    port: API_PORT,
    path: '/webhooks/gupshup',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        console.log(`[Simulator] Status: ${res.statusCode} ${res.statusMessage}`);
        resolve(body);
      });
    });

    req.on('error', (e) => {
      console.error(`[Simulator] Error: ${e.message}`);
      reject(e);
    });

    req.write(data);
    req.end();
  });
}

async function simulateInboundMessage(text = 'Hello from WhatsApp!', fromPhone = DEFAULT_PHONE, fromName = 'Pooja Sharma') {
  const msgId = `inbound-${Date.now()}`;
  console.log(`\n📨 Simulating Inbound Message: "${text}" from ${fromPhone} (${fromName})`);

  const payload = {
    gs_app_id: DEFAULT_APP_ID,
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-demo',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '919876543210',
                phone_number_id: 'waba-phone-1',
              },
              contacts: [
                {
                  profile: { name: fromName },
                  wa_id: fromPhone,
                },
              ],
              messages: [
                {
                  from: fromPhone,
                  id: msgId,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: 'text',
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  await sendWebhook(payload);
  console.log('✅ Webhook sent! Check your browser inbox at http://localhost:3000/inbox');
}

async function simulateStatus(messageId, status = 'delivered') {
  console.log(`\n🔄 Simulating Status Update: ${messageId} → ${status}`);

  const payload = {
    gs_app_id: DEFAULT_APP_ID,
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-demo',
        changes: [
          {
            field: 'statuses',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '919876543210',
                phone_number_id: 'waba-phone-1',
              },
              statuses: [
                {
                  id: messageId,
                  gs_id: messageId,
                  recipient_id: DEFAULT_PHONE,
                  status,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                },
              ],
            },
          },
        ],
      },
    ],
  };

  await sendWebhook(payload);
  console.log(`✅ Status webhook sent: ${status}`);
}

const args = process.argv.slice(2);
const command = args[0] || 'message';

if (command === 'message') {
  const text = args[1] || 'Hi there! Could you help me with an order?';
  simulateInboundMessage(text);
} else if (command === 'status') {
  const msgId = args[1];
  const status = args[2] || 'delivered';
  if (!msgId) {
    console.error('Usage: node simulate-webhook.js status <messageId> [delivered|read|failed]');
    process.exit(1);
  }
  simulateStatus(msgId, status);
} else {
  console.log('Usage:');
  console.log('  node simulate-webhook.js message "Your text here"');
  console.log('  node simulate-webhook.js status <messageId> [delivered|read|failed]');
}
