// functions/api/_helpers.js
// Shared utilities for all Cloudflare Pages Functions

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

export function err(msg, status = 400) {
  return json({ error: msg }, status);
}

export function ok(data = {}) {
  return json({ ok: true, ...data });
}

export function handleOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function now() {
  return new Date().toISOString();
}
