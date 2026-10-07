'use strict';

/**
 * 90-Day CISSP Challenge — web server
 *
 * Zero-dependency Node.js server (built-ins only) so it runs the same on a
 * laptop, an AWS EC2 / Azure VM / GCE instance, or any container platform.
 *
 *   GET  /                  tracker UI
 *   GET  /api/plan          the 90-day plan (read-only)
 *   GET  /api/progress      saved progress (read from the Excel workbook)
 *   PUT  /api/progress      save progress (JSON body, max 256 KB) → written to the workbook
 *   GET  /api/export.xlsx   download the Excel database
 *   POST /api/import        upload a tracker workbook (.xlsx body, max 4 MB) and make it the database
 *   GET  /api/info          server info: LAN addresses for opening on a phone, data file path
 *
 * The same public/ folder also runs with no server at all (GitHub Pages): the UI
 * then keeps progress in the browser and builds the Excel workbook client-side.
 * Run `node build-static.js` after changing plan.js, xlsx-lite.js or tracker-model.js.
 *   GET  /healthz           liveness probe for load balancers / Cloud Run / App Service
 *
 * Environment variables
 *   PORT          listen port            (default 8080)
 *   HOST          bind address           (default 0.0.0.0)
 *   DATA_DIR      where cissp-tracker.xlsx is written (default ./data)
 *   APP_PASSWORD  if set, HTTP Basic auth is required (user: any, pass: this)
 *   PUBLIC_URL    optional: the public address to show under "open from anywhere"
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PLAN = require('./plan');
const { Store, emptyProgress } = require('./store');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PUBLIC_DIR = path.join(__dirname, 'public');
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const MAX_BODY = 256 * 1024;

const store = new Store(DATA_DIR);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

// ---------- helpers ----------

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
  );
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  securityHeaders(res);
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function authorized(req) {
  if (!APP_PASSWORD) return true;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  const pass = idx >= 0 ? decoded.slice(idx + 1) : '';
  return timingSafeEqual(pass, APP_PASSWORD);
}

async function loadProgress() {
  try {
    return await store.load();
  } catch (e) {
    console.error('[cissp-90-day] could not read workbook, starting empty:', e.message);
    return emptyProgress();
  }
}

function saveProgress(obj) {
  store.save(obj);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Whitelist the shape of what we persist so a client cannot store arbitrary junk. */
function sanitizeProgress(input, previous = emptyProgress()) {
  if (!isPlainObject(input)) throw Object.assign(new Error('body must be an object'), { status: 400 });
  const out = emptyProgress();
  const now = new Date().toISOString();

  if (input.startDate !== null && input.startDate !== undefined) {
    if (typeof input.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
      throw Object.assign(new Error('startDate must be YYYY-MM-DD'), { status: 400 });
    }
    out.startDate = input.startDate;
  }

  const done = isPlainObject(input.done) ? input.done : {};
  for (const [k, v] of Object.entries(done)) {
    if (/^\d{1,2}:\d$/.test(k) && v === true) {
      out.done[k] = true;
      out.completedAt[k] = previous.completedAt?.[k] || now; // keep the original tick time
    }
  }

  const questions = isPlainObject(input.questions) ? input.questions : {};
  for (const [k, v] of Object.entries(questions)) {
    const n = Number(v);
    if (/^\d{1,2}$/.test(k) && Number.isInteger(n) && n >= 0 && n <= 1000) out.questions[k] = n;
  }

  const scores = isPlainObject(input.scores) ? input.scores : {};
  for (const [k, v] of Object.entries(scores)) {
    const n = Number(v);
    if (/^[a-z0-9_-]{1,32}$/.test(k) && Number.isFinite(n) && n >= 0 && n <= 100) out.scores[k] = n;
  }

  const notes = isPlainObject(input.notes) ? input.notes : {};
  for (const [k, v] of Object.entries(notes)) {
    if (/^\d{1,2}$/.test(k) && typeof v === 'string') out.notes[k] = v.slice(0, 4000);
  }

  out.updatedAt = now;
  return out;
}

/** Non-loopback IPv4 addresses, so the UI can show "open this on your phone". */
function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ iface: name, address: a.address });
    }
  }
  return out;
}

function serverInfo(req) {
  const hostHeader = req.headers.host || `localhost:${PORT}`;
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0] || 'http';
  return {
    hostname: os.hostname(),
    port: PORT,
    currentUrl: `${proto}://${hostHeader}/`,
    lanUrls: lanAddresses().map((a) => `http://${a.address}:${PORT}/`),
    publicUrl: PUBLIC_URL || null,
    authEnabled: Boolean(APP_PASSWORD),
    database: { type: 'xlsx', file: store.file, exists: fs.existsSync(store.file) },
  };
}

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const abs = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!abs.startsWith(PUBLIC_DIR + path.sep) && abs !== PUBLIC_DIR) {
    return send(res, 403, { error: 'forbidden' });
  }
  fs.readFile(abs, (err, data) => {
    if (err) return send(res, 404, { error: 'not found' });
    const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    send(res, 200, data, type);
  });
}

// ---------- router ----------

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (p === '/healthz') return send(res, 200, { ok: true, uptime: Math.round(process.uptime()) });

  if (!authorized(req)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="CISSP 90-day challenge", charset="UTF-8"');
    return send(res, 401, { error: 'unauthorized' });
  }

  if (p === '/api/plan' && req.method === 'GET') return send(res, 200, PLAN);
  if (p === '/api/info' && req.method === 'GET') return send(res, 200, serverInfo(req));

  if (p === '/api/import' && req.method === 'POST') {
    try {
      const bytes = await readBody(req, 4 * 1024 * 1024);
      const parsed = await Store.parse(bytes);
      const clean = sanitizeProgress(parsed, parsed); // keep the file's own completion times
      saveProgress(clean);
      return send(res, 200, clean);
    } catch (e) {
      return send(res, e.status || 400, { error: e.status ? e.message : 'not a valid tracker workbook: ' + e.message });
    }
  }

  if (p === '/api/export.xlsx' && req.method === 'GET') {
    try {
      const buf = await store.exportBuffer();
      securityHeaders(res);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="cissp-tracker-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        'Content-Length': buf.length,
      });
      return res.end(buf);
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  if (p === '/api/progress') {
    if (req.method === 'GET') return send(res, 200, await loadProgress());
    if (req.method === 'PUT') {
      let body;
      try {
        body = JSON.parse((await readBody(req)).toString('utf8'));
      } catch (e) {
        return send(res, e.status || 400, { error: e.status ? e.message : 'invalid JSON' });
      }
      try {
        const clean = sanitizeProgress(body, await loadProgress());
        saveProgress(clean);
        return send(res, 200, clean);
      } catch (e) {
        return send(res, e.status || 500, { error: e.message });
      }
    }
    res.setHeader('Allow', 'GET, PUT');
    return send(res, 405, { error: 'method not allowed' });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { error: 'method not allowed' });
  }
  return serveStatic(req, res, p);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) send(res, 500, { error: 'internal error' });
  });
});

server.headersTimeout = 10_000;
server.requestTimeout = 30_000;

server.listen(PORT, HOST, () => {
  console.log(`[cissp-90-day] listening on http://${HOST}:${PORT}  db=${store.file}  auth=${APP_PASSWORD ? 'basic' : 'off'}`);
  for (const a of lanAddresses()) console.log(`[cissp-90-day] on this network: http://${a.address}:${PORT}/  (${a.iface})`);
  if (PUBLIC_URL) console.log(`[cissp-90-day] public: ${PUBLIC_URL}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[cissp-90-day] ${sig} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
