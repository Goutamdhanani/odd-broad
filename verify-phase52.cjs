/**
 * Phase 52 verification: connect a socket.io client to the inbox namespace
 * with a valid JWT, then push an inbound webhook through the queue and
 * confirm the 'new_message' event arrives within ~2s.
 */
const { io } = require('socket.io-client');
const http = require('http');

const API = 'http://localhost:3001';

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${API}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  // 1. Login as demo shop
  const login = await post('/api/auth/login', {
    email: 'demo@bizzhouse.com',
    password: 'Demo@BizzHouse2026',
  });
  if (login.status !== 200) throw new Error('login failed: ' + login.body);
  const token = login.body.token;
  console.log('1. logged in');

  // 2. Find demo shop's gs_app_id
  const { execSync } = require('child_process');
  const gsAppId = execSync(
    `docker exec bizzhouse-db psql -U bizzhouse -d bizzhouse -t -A -c "SELECT gupshup_app_id FROM gupshup_apps LIMIT 1"`
  ).toString().trim();
  console.log('2. gs_app_id:', gsAppId);

  // 3. Connect socket to /inbox namespace with auth token
  const socket = io(`${API}/inbox`, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: false,
    timeout: 8000,
  });

  const received = [];
  const t0 = Date.now();

  socket.on('connect', () => console.log('3. socket connected:', socket.id));
  socket.on('connect_error', (e) => console.log('socket error:', e.message));
  socket.on('message:new', (data) => {
    received.push({ at: Date.now() - t0, data });
    console.log(`4. message:new received after ${Date.now() - t0}ms:`, JSON.stringify(data).slice(0, 120));
  });

  await new Promise((r) => setTimeout(r, 1500));
  if (!socket.connected) throw new Error('socket never connected');
  console.log('   connected at', Date.now() - t0, 'ms — firing inbound webhook NOW');

  // 4. Push an inbound WhatsApp message through the real webhook
  const hookBody = JSON.stringify({
    gs_app_id: gsAppId,
    object: 'whatsapp_business_account',
    entry: [{
      id: '1',
      changes: [{
        field: 'messages',
        value: {
          contacts: [{ profile: { name: 'Socket Tester' }, wa_id: '919800000001' }],
          messages: [{
            from: '919800000001',
            id: 'wamid.smoke_' + Date.now(),
            text: { body: 'Real-time push test' },
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: 'text',
          }],
          messaging_product: 'whatsapp',
        },
      }],
    }],
  });

  await post('/webhooks/gupshup', JSON.parse(hookBody));

  // 5. Wait up to 5s for the event
  const deadline = Date.now() + 5000;
  while (received.length === 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }

  if (received.length > 0) {
    const ms = received[0].at;
    console.log(`RESULT: PASS — event arrived ${ms}ms after webhook fired${ms < 2500 ? ' (<2.5s, Phase 52 done-when met)' : ' (SLOW)'}`);
  } else {
    console.log('RESULT: FAIL — no new_message event within 5s');
  }

  socket.disconnect();
  process.exit(received.length > 0 ? 0 : 1);
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
