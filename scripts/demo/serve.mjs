/**
 * Local demo server.
 *
 * Runs the real Cloudflare Pages Function (functions/api/[[route]].js) in Node
 * against a local SQLite file through a small D1-compatible adapter, and serves
 * the static front end alongside it. Nothing about the application code changes —
 * this is the same worker that runs at the edge in production.
 *
 * Used to produce the screenshots in docs/screenshots/ from synthetic data, and
 * useful for poking at the app without deploying a preview.
 *
 *   node scripts/demo/seed.mjs      # create + populate scripts/demo/demo.sqlite
 *   node scripts/demo/serve.mjs     # http://localhost:8788
 *
 * Requires Node 22+ (node:sqlite).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createD1 } from './d1-sqlite-adapter.mjs';
import { onRequest } from '../../functions/api/[[route]].js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const PORT = Number(process.env.PORT || 8788);
// Loopback only by default. This serves files off the developer's disk and needs
// no network reachability; set HOST explicitly to widen it.
const HOST = process.env.HOST || '127.0.0.1';
const DB = createD1(process.env.DEMO_DB || path.join(HERE, 'demo.sqlite'));
const env = { DB };

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.webmanifest':'application/manifest+json' };

/**
 * Resolves a request path to a servable file inside ROOT, or null if it is not one.
 *
 * Two things to get right:
 *
 *  - `new URL()` collapses literal `../` segments but leaves percent-encoded ones
 *    (`..%2f`) alone, so decoding first and joining second would walk out of the
 *    repository — `/..%2f..%2fetc%2fpasswd` resolves to `/etc/passwd`. Resolve, then
 *    check containment against ROOT before touching the filesystem.
 *  - Staying inside ROOT is not on its own enough: `.git/config` is inside it and
 *    should never be served. Cloudflare Pages does not publish dot-directories
 *    either, so refusing them here also keeps the harness faithful to production.
 */
function safeResolve(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }   // malformed %-escape
  if (decoded.includes('\0')) return null;
  const normalised = path.posix.normalize(decoded);
  if (normalised.split('/').some(seg => seg.startsWith('.') && seg !== '.' && seg !== '..')) return null;
  const resolved = path.resolve(ROOT, '.' + normalised);
  return resolved === ROOT || resolved.startsWith(ROOT + path.sep) ? resolved : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/api')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers[k] = v;
    const request = new Request(url.toString(), { method: req.method, headers, body: (req.method === 'GET' || req.method === 'HEAD') ? undefined : body });
    try {
      const out = await onRequest({ request, env, waitUntil: () => {} });
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(Buffer.from(await out.arrayBuffer()));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e && e.stack || e) }));
    }
    return;
  }
  const target = safeResolve(url.pathname);
  if (!target) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad request');
    return;
  }
  // Fall back to the SPA shell, exactly as the Pages _redirects rule does.
  let file = path.join(ROOT, 'index.html');
  if (fs.existsSync(target) && !fs.statSync(target).isDirectory()) {
    file = target;
  } else if (fs.existsSync(path.join(target, 'index.html'))) {
    file = path.join(target, 'index.html');
  }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
server.listen(PORT, HOST, () => console.log(`Demo server on http://${HOST}:${PORT}`));
