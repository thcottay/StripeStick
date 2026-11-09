// Minimal, dependency-free server: static site plus the two waitlist endpoints.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_ROUTES, MAX_BODY, createStoreFromEnv, runRoute } from './waitlist.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;

const store = createStoreFromEnv();
if (!process.env.GOOGLE_SHEETS_WEBHOOK_URL || !process.env.GOOGLE_SHEETS_SECRET) {
  console.warn('GOOGLE_SHEETS_WEBHOOK_URL and GOOGLE_SHEETS_SECRET are not set. Waitlist sign-ups will fail.');
}

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

async function handleApi(req, res, pathname) {
  const raw = await readBody(req);
  const result = await runRoute(pathname, store, { contentType: req.headers['content-type'], raw });
  if (result.location) return send(res, 303, '', { Location: result.location });
  return sendJson(res, result.status, result.json);
}

// Steps of the waitlist flow. All are the same page, and waitlist.js shows the right step.
const FLOW_PATHS = new Set(['/waitlist', '/waitlist/questions', '/waitlist/thanks', '/waitlist/skipped']);

const compressedCache = new Map();

async function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }
  if (decoded.includes('\0')) return send(res, 400, 'Bad request');

  const target = FLOW_PATHS.has(decoded.replace(/\/+$/, '')) ? 'index.html' : decoded;
  let filePath = path.normalize(path.join(PUBLIC_DIR, target));
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

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (API_ROUTES[pathname]) {
      if (req.method !== 'POST') return send(res, 405, '', { Allow: 'POST' });
      if (rateLimited(clientIp(req))) {
        return sendJson(res, 429, { error: 'Too many attempts. Please wait a minute and try again.' });
      }
      return await handleApi(req, res, pathname);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, '', { Allow: 'GET, HEAD' });
    return await serveStatic(req, res, pathname);
  } catch (err) {
    if (res.headersSent) return res.end();
    if (err.status) {
      res.setHeader('Connection', 'close');
      return sendJson(res, err.status, { error: 'That request could not be processed.' });
    }
    console.error('Request failed:', err.message);
    return sendJson(res, 500, { error: 'Something went wrong on our end. Please try again.' });
  }
});

server.listen(PORT, () => console.log(`StripeStick running at http://localhost:${PORT}`));
