/**
 * Test fuer Notification Webhooks
 * Werner — 2026-04-07
 */

const { renderTemplate } = require('./notification-webhook');
const http = require('http');

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}`);
    console.log(`    erwartet: ${expected}`);
    console.log(`    bekommen: ${actual}`);
    failed++;
  }
}

// --- Template Tests ---
console.log('\n--- Template Engine ---');

assert('Einfache Ersetzung',
  renderTemplate('Hallo {name}!', { name: 'Mayk' }),
  'Hallo Mayk!'
);

assert('Mehrere Variablen',
  renderTemplate('{agent} hat {task} erledigt', { agent: 'Werner', task: 'Webhook' }),
  'Werner hat Webhook erledigt'
);

assert('Fehlender Wert → Strich',
  renderTemplate('Status: {status}', {}),
  'Status: –'
);

assert('Task-Done Template',
  renderTemplate('✅ Agent *{agentName}* hat Task erledigt:\n\n*{taskTitle}*\n{summary}', {
    agentName: 'Werner',
    taskTitle: 'Notification Webhook',
    summary: 'Event-driven, kein Polling',
  }),
  '✅ Agent *Werner* hat Task erledigt:\n\n*Notification Webhook*\nEvent-driven, kein Polling'
);

// --- HTTP Endpoint Test ---
console.log('\n--- HTTP Endpoint ---');

const { NotificationHub } = require('./notification-webhook');

// Mock: Kein Telegram senden, nur Events pruefen
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.MAYK_CHAT_ID = '12345';
process.env.WEBHOOK_SECRET = 'test-secret';

const hub = new NotificationHub();
let receivedEvent = null;

hub.on('agent.task.done', (data) => {
  receivedEvent = data;
});

const server = hub.app.listen(0, () => {
  const port = server.address().port;

  // Test: POST ohne Event-Feld → 400
  postJSON(port, '/webhooks/agent-event', {}, { 'x-webhook-secret': 'test-secret' }, (status, body) => {
    assert('Fehlendes Event → 400', status, 400);

    // Test: Falscher Secret → 401
    postJSON(port, '/webhooks/agent-event', { event: 'test' }, { 'x-webhook-secret': 'wrong' }, (status2) => {
      assert('Falscher Secret → 401', status2, 401);

      // Test: Valides Event → 200
      const payload = {
        event: 'agent.task.done',
        agentName: 'Werner',
        taskTitle: 'Test-Task',
        summary: 'Funktioniert!',
        duration: '2s',
      };
      postJSON(port, '/webhooks/agent-event', payload, { 'x-webhook-secret': 'test-secret' }, (status3, body3) => {
        assert('Valides Event → 200', status3, 200);
        assert('Event emittiert', receivedEvent?.agentName, 'Werner');
        assert('Task-Titel korrekt', receivedEvent?.taskTitle, 'Test-Task');

        // Test: Status Endpoint
        getJSON(port, '/webhooks/status', (status4, body4) => {
          assert('Status → 200', status4, 200);
          assert('Stats vorhanden', body4.stats?.received >= 1, true);

          server.close();
          console.log(`\n--- Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen ---\n`);
          process.exit(failed > 0 ? 1 : 0);
        });
      });
    });
  });
});

// --- HTTP Helpers ---
function postJSON(port, path, data, headers, cb) {
  const payload = JSON.stringify(data);
  const req = http.request({
    hostname: 'localhost', port, path, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers },
  }, (res) => {
    let body = '';
    res.on('data', (c) => body += c);
    res.on('end', () => cb(res.statusCode, JSON.parse(body || '{}')));
  });
  req.write(payload);
  req.end();
}

function getJSON(port, path, cb) {
  http.get({ hostname: 'localhost', port, path }, (res) => {
    let body = '';
    res.on('data', (c) => body += c);
    res.on('end', () => cb(res.statusCode, JSON.parse(body || '{}')));
  });
}
