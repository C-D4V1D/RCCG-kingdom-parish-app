// Signed one-tap links for the remittance check email ("Generate RRR" / "Refresh").
//
// Shared by functions/api/[[route]].js (which puts the links in the cut-off and
// webhook_test payloads) and functions/remit-action.js (the confirm page). This
// file exports no onRequest handler, so Pages does not route it.
//
// Token = base64url(JSON payload) + '.' + base64url(HMAC-SHA256(REMIT_WEBHOOK_KEY, <payload part>))
// Payload = { v:1, parish:'602757', month:'YYYY-MM', person:'david'|'divine',
//             action:'generate_rrr'|'refresh', exp:<unix seconds>[, test:true] }
// The key is the existing REMIT_WEBHOOK_KEY Pages secret; it never leaves the server.

export const REMIT_ACTION_PARISH = '602757';
export const REMIT_ACTION_PEOPLE = Object.freeze({ david: 'David', divine: 'Bro. Divine' });
export const REMIT_ACTION_ACTIONS = Object.freeze(['generate_rrr', 'refresh']);
export const REMIT_ACTION_PATH = '/remit-action';
export const REMIT_ACTION_LINK_DAYS = 21;           // links stay valid 21 days after the cut-off Sunday
export const REMIT_ACTION_TEST_TTL_S = 24 * 3600;   // webhook_test links: 24 hours

const MAX_TOKEN_LEN = 1024;
const B64URL_RE = /^[A-Za-z0-9_-]+$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const enc = new TextEncoder();

function bytesToB64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret, usage) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

/** The shared secret, trimmed the same way remitWebhookHeaders trims it ('' when unset). */
export function remitActionSecret(env) {
  return String(env?.REMIT_WEBHOOK_KEY || '').trim();
}

/** Request headers for REMIT_WEBHOOK_URL: JSON, plus the shared key when one is set. */
export function remitWebhookHeaders(env) {
  const headers = { 'Content-Type': 'application/json' };
  const key = String(env?.REMIT_WEBHOOK_KEY || '').trim();
  if (key) {
    const headerName = String(env.REMIT_WEBHOOK_KEY_HEADER || '').trim() || 'Authorization';
    headers[headerName] = headerName.toLowerCase() === 'authorization' ? `Bearer ${key}` : key;
  }
  return headers;
}

export async function signRemitActionToken(secret, payload) {
  if (!secret) throw new Error('remit action secret missing');
  const body = bytesToB64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(body));
  return `${body}.${bytesToB64url(new Uint8Array(sig))}`;
}

function validPayload(p) {
  return !!p && typeof p === 'object'
    && p.v === 1
    && p.parish === REMIT_ACTION_PARISH
    && typeof p.month === 'string' && MONTH_RE.test(p.month)
    && Object.prototype.hasOwnProperty.call(REMIT_ACTION_PEOPLE, p.person)
    && REMIT_ACTION_ACTIONS.includes(p.action)
    && Number.isFinite(p.exp)
    && (p.test === undefined || typeof p.test === 'boolean');
}

/**
 * Verify a token. Returns { ok:true, payload } or { ok:false, reason } where reason is
 * 'malformed' | 'signature' | 'invalid' | 'expired'. The signature is checked (with the
 * constant-time crypto.subtle.verify) before the payload is even parsed.
 */
export async function verifyRemitActionToken(secret, token, nowMs = Date.now()) {
  const t = String(token || '');
  if (!secret || !t || t.length > MAX_TOKEN_LEN) return { ok: false, reason: 'malformed' };
  const parts = t.split('.');
  if (parts.length !== 2 || !B64URL_RE.test(parts[0]) || !B64URL_RE.test(parts[1])) return { ok: false, reason: 'malformed' };
  let sig;
  try { sig = b64urlToBytes(parts[1]); } catch { return { ok: false, reason: 'malformed' }; }
  if (sig.length !== 32) return { ok: false, reason: 'signature' };
  const good = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), sig, enc.encode(parts[0]));
  if (!good) return { ok: false, reason: 'signature' };
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0]))); } catch { return { ok: false, reason: 'invalid' }; }
  if (!validPayload(payload)) return { ok: false, reason: 'invalid' };
  if (Math.floor(nowMs / 1000) > payload.exp) return { ok: false, reason: 'expired', payload };
  return { ok: true, payload };
}

/** exp (unix seconds) for a cut-off: the end (23:59:59 UTC) of the day REMIT_ACTION_LINK_DAYS after it. */
export function remitActionExpForCutoff(periodEnd) {
  const d = new Date(`${periodEnd}T23:59:59Z`);
  d.setUTCDate(d.getUTCDate() + REMIT_ACTION_LINK_DAYS);
  return Math.floor(d.getTime() / 1000);
}

/**
 * The four personal links: { david: { generate_rrr, refresh }, divine: { generate_rrr, refresh } }.
 * Returns null when there is no secret (links can't be signed) or anything goes wrong,
 * so the caller's webhook still goes out without them.
 */
export async function buildRemitActionLinks(env, origin, { month, exp, test = false }) {
  const secret = remitActionSecret(env);
  if (!secret || !origin || !MONTH_RE.test(String(month || '')) || !Number.isFinite(exp)) return null;
  try {
    const links = {};
    for (const person of Object.keys(REMIT_ACTION_PEOPLE)) {
      links[person] = {};
      for (const action of REMIT_ACTION_ACTIONS) {
        const payload = { v: 1, parish: REMIT_ACTION_PARISH, month, person, action, exp };
        if (test) payload.test = true;
        links[person][action] = `${origin}${REMIT_ACTION_PATH}?t=${await signRemitActionToken(secret, payload)}`;
      }
    }
    return links;
  } catch (e) {
    console.error('[remit-action] could not sign links:', e?.message || e);
    return null;
  }
}
