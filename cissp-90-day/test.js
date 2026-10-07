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
  assert.ok(again.completedAt['1:0'], 'completedAt stamped');

  // the database is a real Excel workbook
  const xlsxPath = path.join(dataDir, 'cissp-tracker.xlsx');
  assert.ok(fs.existsSync(xlsxPath), 'workbook written');
  const zlib = require('zlib');
  const xl = require('./xlsx-lite');
  const inflate = (u8) => new Uint8Array(zlib.inflateRawSync(u8));
  const readWorkbook = (b) => xl.readWorkbook(new Uint8Array(b), { inflate });
  const writeWorkbook = (s) => Buffer.from(xl.writeWorkbook(s, { deflate: (u8) => new Uint8Array(zlib.deflateRawSync(u8)) }));
  let sheets = await readWorkbook(fs.readFileSync(xlsxPath));
  assert.deepStrictEqual(sheets.map((s) => s.name), ['Settings', 'Tasks', 'Questions', 'Scores', 'Notes']);
  const tasks = sheets[1].rows;
  assert.strictEqual(tasks[0][7], 'Done');
  assert.strictEqual(tasks[1][0], 1); assert.strictEqual(tasks[1][3], 1); assert.strictEqual(tasks[1][7], true);
  assert.strictEqual(tasks[3][0], 2); assert.strictEqual(tasks[3][7], false);

  // a second save keeps the original tick time
  r = await fetch(`${base}/api/progress`, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...again, questions: { '1': 60 } }) });
  assert.strictEqual((await r.json()).completedAt['1:0'], again.completedAt['1:0']);

  // edit the workbook "in Excel" (tick day 2 task 1, type a note, enter a score) → the app picks it up
  sheets = await readWorkbook(fs.readFileSync(xlsxPath));
  const t = sheets.find((s) => s.name === 'Tasks');
  const row = t.rows.find((rw) => rw[0] === 2 && rw[3] === 1); row[7] = 'yes';
  const n = sheets.find((s) => s.name === 'Notes'); n.rows.find((rw) => rw[0] === 5)[1] = 'typed in Excel';
  const sc = sheets.find((s) => s.name === 'Scores'); sc.rows.find((rw) => rw[0] === 2 && rw[1] === 'd8')[3] = 71;
  fs.writeFileSync(xlsxPath, writeWorkbook(sheets));
  r = await fetch(`${base}/api/progress`, { headers: auth });
  const fromExcel = await r.json();
  assert.strictEqual(fromExcel.done['2:0'], true);
  assert.strictEqual(fromExcel.notes['5'], 'typed in Excel');
  assert.strictEqual(fromExcel.scores.e2_d8, 71);
  assert.strictEqual(fromExcel.questions['1'], 60);

  // download endpoint returns a valid workbook
  r = await fetch(`${base}/api/export.xlsx`, { headers: auth });
  assert.strictEqual(r.status, 200);
  assert.ok(r.headers.get('content-type').includes('spreadsheetml'));
  assert.ok(r.headers.get('content-disposition').includes('.xlsx'));
  const dl = await readWorkbook(Buffer.from(await r.arrayBuffer()));
  assert.strictEqual(dl.length, 5);

  // import: an uncompressed workbook (what the browser build produces) replaces the database
  const uncompressed = Buffer.from(xl.writeWorkbook(sheets)); // no deflate -> stored entries
  const sc2 = sheets.find((s) => s.name === 'Scores'); sc2.rows.find((rw) => rw[0] === 1 && rw[1] === 'd1')[3] = 88;
  r = await fetch(`${base}/api/import`, { method: 'POST', headers: auth, body: Buffer.from(xl.writeWorkbook(sheets)) });
  assert.strictEqual(r.status, 200, 'import ok');
  const imported = await r.json();
  assert.strictEqual(imported.scores.e1_d1, 88);
  assert.strictEqual(imported.done['2:0'], true);
  assert.strictEqual(imported.completedAt['1:0'], again.completedAt['1:0'], 'import keeps the file\'s completion times');
  r = await fetch(`${base}/api/import`, { method: 'POST', headers: auth, body: 'garbage' });
  assert.strictEqual(r.status, 400);
  assert.ok(uncompressed.length > 0);

  // the static build in public/ must match the sources it was generated from
  for (const f of ['xlsx-lite.js', 'tracker-model.js']) {
    assert.strictEqual(fs.readFileSync(path.join(__dirname, 'public', f), 'utf8'), fs.readFileSync(path.join(__dirname, f), 'utf8'), `public/${f} is stale — run node build-static.js`);
  }
  const planData = fs.readFileSync(path.join(__dirname, 'public', 'plan-data.js'), 'utf8');
  assert.ok(planData.includes(JSON.stringify(require('./plan'))), 'public/plan-data.js is stale — run node build-static.js');
  r = await fetch(`${base}/plan-data.js`, { headers: auth });
  assert.strictEqual(r.status, 200);
  for (const f of fs.readdirSync(path.join(__dirname, 'public'))) {
    const pagesCopy = path.join(__dirname, '..', 'cissp', f);
    assert.ok(fs.existsSync(pagesCopy), `cissp/${f} missing — run node build-static.js`);
    assert.ok(fs.readFileSync(pagesCopy).equals(fs.readFileSync(path.join(__dirname, 'public', f))), `cissp/${f} is stale — run node build-static.js`);
  }

  // server info for remote access
  r = await fetch(`${base}/api/info`, { headers: auth });
  const info = await r.json();
  assert.strictEqual(info.port, port);
  assert.strictEqual(info.authEnabled, true);
  assert.strictEqual(info.database.type, 'xlsx');
  assert.ok(Array.isArray(info.lanUrls));
  r = await fetch(`${base}/api/info`);
  assert.strictEqual(r.status, 401, 'info is protected too');

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
