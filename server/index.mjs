// Minimal, dependency-free server: static site plus the two waitlist endpoints.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLeadStore } from './store.mjs';
import { validateSignup, validateAnswers } from './validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_BODY = 16 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;

const store = createLeadStore(process.env.DATA_DIR || path.join(ROOT, 'data'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.webmanifest', '.txt', '.xml', '.svg']);

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_MAX;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of hits) {
    if (times.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(ip);
  }
}, RATE_WINDOW_MS).unref();

function clientIp(req) {
  if (TRUST_PROXY) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const sendJson = (res, status, payload) =>
  send(res, status, JSON.stringify(payload), { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        // Stop buffering but let the 413 response reach the client before the socket closes.
        chunks.length = 0;
        reject(Object.assign(new Error('too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function parseBody(req) {
  const raw = await readBody(req);
  const type = String(req.headers['content-type'] || '').split(';')[0].trim();
  if (type === 'application/json') {
    const data = JSON.parse(raw || '{}');
    if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new SyntaxError('not an object');
    return { data, isForm: false };
  }
  if (type === 'application/x-www-form-urlencoded') {
    return { data: Object.fromEntries(new URLSearchParams(raw)), isForm: true };
  }
  throw Object.assign(new Error('unsupported'), { status: 415 });
}

async function handleSignup(req, res) {
  const { data, isForm } = await parseBody(req);

  // Bots that fill the honeypot get a normal-looking success and nothing is stored.
  if (data.website) {
    if (isForm) return send(res, 303, '', { Location: '/thanks.html' });
    return sendJson(res, 201, { token: 'ok' });
  }

  const { errors, value } = validateSignup(data);
  if (errors) {
    if (isForm) return send(res, 303, '', { Location: '/#waitlist' });
    return sendJson(res, 422, { error: 'Please check the highlighted fields.', fields: errors });
  }

  const token = await store.upsertSignup(value);
  if (isForm) return send(res, 303, '', { Location: '/thanks.html' });
  return sendJson(res, 201, { token });
}

async function handleAnswers(req, res) {
  const { data } = await parseBody(req);
  const { error, value } = validateAnswers(data.answers);
  if (error) return sendJson(res, 422, { error });
  if (typeof data.token !== 'string' || !(await store.saveAnswers(data.token, value))) {
    return sendJson(res, 404, { error: 'We couldn’t match these answers to your sign-up. Your place on the waitlist is still saved.' });
  }
  return sendJson(res, 200, { ok: true });
}

const compressedCache = new Map();

async function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }
  if (decoded.includes('\0')) return send(res, 400, 'Bad request');

  let filePath = path.normalize(path.join(PUBLIC_DIR, decoded));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');

  let info = await stat(filePath).catch(() => null);
  if (info && info.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    info = await stat(filePath).catch(() => null);
  }
  if (!info || !info.isFile()) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });

  const ext = path.extname(filePath);
  const etag = `"${info.size.toString(16)}-${Math.round(info.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    // File names aren't fingerprinted, so code and images revalidate; fonts can be cached for a day.
    'Cache-Control': ['.html', '.css', '.js', '.png', '.jpg'].includes(ext) ? 'no-cache' : 'public, max-age=86400',
    ETag: etag,
  };
  if (req.headers['if-none-match'] === etag) return send(res, 304, undefined, headers);

  let body = await readFile(filePath);
  if (COMPRESSIBLE.has(ext)) {
    headers.Vary = 'Accept-Encoding';
    if (/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
      const key = `${filePath}:${info.mtimeMs}`;
      if (!compressedCache.has(key)) compressedCache.set(key, gzipSync(body));
      body = compressedCache.get(key);
      headers['Content-Encoding'] = 'gzip';
    }
  }
  if (req.method === 'HEAD') return send(res, 200, undefined, headers);
  return send(res, 200, body, headers);
}

const API_ROUTES = {
  '/api/waitlist': handleSignup,
  '/api/waitlist/answers': handleAnswers,
};

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    const route = API_ROUTES[pathname];
    if (route) {
      if (req.method !== 'POST') return send(res, 405, '', { Allow: 'POST' });
      if (rateLimited(clientIp(req))) {
        return sendJson(res, 429, { error: 'Too many attempts. Please wait a minute and try again.' });
      }
      return await route(req, res);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, '', { Allow: 'GET, HEAD' });
    return await serveStatic(req, res, pathname);
  } catch (err) {
    if (res.headersSent) return res.end();
    if (err instanceof SyntaxError) return sendJson(res, 400, { error: 'That request could not be read.' });
    if (err.status) {
      res.setHeader('Connection', 'close');
      return sendJson(res, err.status, { error: 'That request could not be processed.' });
    }
    console.error('Request failed:', err.message);
    return sendJson(res, 500, { error: 'Something went wrong on our end. Please try again.' });
  }
});

server.listen(PORT, () => console.log(`StripeStick running at http://localhost:${PORT}`));
