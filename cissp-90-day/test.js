'use strict';

/**
 * Smoke test: boots the server on a random port with a temp DATA_DIR and
 * exercises every route. Run with `npm test` (no dependencies needed).
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cissp-test-'));
const port = 18000 + Math.floor(Math.random() * 1000);

const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, APP_PASSWORD: 'secret' },
  stdio: ['ignore', 'pipe', 'inherit'],
});

const base = `http://127.0.0.1:${port}`;
const auth = { Authorization: 'Basic ' + Buffer.from('user:secret').toString('base64') };

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${base}/healthz`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

async function main() {
  await waitForServer();

  // health is public
  let r = await fetch(`${base}/healthz`);
  assert.strictEqual(r.status, 200);

  // everything else needs the password when APP_PASSWORD is set
  r = await fetch(`${base}/`);
  assert.strictEqual(r.status, 401);
  r = await fetch(`${base}/api/plan`);
  assert.strictEqual(r.status, 401);

  // UI and plan
  r = await fetch(`${base}/`, { headers: auth });
  assert.strictEqual(r.status, 200);
  assert.ok((await r.text()).includes('90-Day CISSP Challenge'));
  assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');

  r = await fetch(`${base}/api/plan`, { headers: auth });
  const plan = await r.json();
  assert.strictEqual(plan.days.length, 90);
  assert.strictEqual(plan.weeks.length, 13);
  assert.strictEqual(plan.days[0].dayName, 'Mon');
  assert.strictEqual(plan.days[82].dayName, 'Sat'); // day 83 = exam day, week 12 Saturday
  assert.ok(plan.days[82].tasks[0].text.includes('EXAM DAY'));

  // path traversal is blocked
  r = await fetch(`${base}/../server.js`, { headers: auth });
  assert.ok([403, 404].includes(r.status), `traversal returned ${r.status}`);

  // progress round-trip with sanitisation
  r = await fetch(`${base}/api/progress`, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate: '2026-10-12',
      done: { '1:0': true, '1:1': true, 'bogus': true, '2:0': 'yes' },
      questions: { '1': 50, '2': -5, '3': 'x' },
      scores: { e1_d1: 82, e1_d3: 140, 'bad key!': 10 },
      notes: { '1': 'BIA before RTO', '2': 42 },
      evil: { injected: true },
    }),
  });
  assert.strictEqual(r.status, 200);
  const saved = await r.json();
  assert.deepStrictEqual(saved.done, { '1:0': true, '1:1': true });
  assert.deepStrictEqual(saved.questions, { '1': 50 });
  assert.deepStrictEqual(saved.scores, { e1_d1: 82 });
  assert.deepStrictEqual(saved.notes, { '1': 'BIA before RTO' });
  assert.strictEqual(saved.startDate, '2026-10-12');
  assert.strictEqual(saved.evil, undefined);

  r = await fetch(`${base}/api/progress`, { headers: auth });
  const again = await r.json();
  assert.deepStrictEqual(again.done, saved.done);
  assert.ok(fs.existsSync(path.join(dataDir, 'progress.json')));

  // bad input
  r = await fetch(`${base}/api/progress`, { method: 'PUT', headers: auth, body: '{not json' });
  assert.strictEqual(r.status, 400);
  r = await fetch(`${base}/api/progress`, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ startDate: 'tomorrow' }) });
  assert.strictEqual(r.status, 400);
  r = await fetch(`${base}/api/progress`, { method: 'DELETE', headers: auth });
  assert.strictEqual(r.status, 405);

  console.log('all tests passed');
}

main()
  .then(() => { child.kill('SIGTERM'); process.exit(0); })
  .catch((err) => { console.error(err); child.kill('SIGTERM'); process.exit(1); })
  .finally(() => fs.rmSync(dataDir, { recursive: true, force: true }));
