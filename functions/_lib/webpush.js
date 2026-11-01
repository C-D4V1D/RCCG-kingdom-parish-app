// Web Push (phone notifications) for Cloudflare Workers — no dependencies.
//
// Pieces:
//   - VAPID keys: generated automatically the first time they are needed and kept in the
//     push_config table (NOT in the backup/export table lists, never sent to browsers except the public half).
//   - Payload encryption: RFC 8291 (aes128gcm) with WebCrypto.
//   - Sending: RFC 8292 (VAPID) signed request to the browser's push service.
// Everything fails soft: a push problem must never break the request that created the notification.

const enc = new TextEncoder();
const MAX_SUBSCRIPTIONS = 200;
const PUSH_TTL_SECONDS = 24 * 60 * 60;

export function b64uEncode(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDecode(str) {
  const b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// ── VAPID keys ───────────────────────────────────────────────────────
export async function generateVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: b64uEncode(publicRaw), privateJwk };
}

async function vapidAuthorization(endpoint, subject, keys) {
  const aud = new URL(endpoint).origin;
  const header = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64uEncode(enc.encode(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  })));
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto returns the raw r||s form that JWT ES256 expects.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput)));
  return `vapid t=${signingInput}.${b64uEncode(sig)}, k=${keys.publicKey}`;
}

// ── Payload encryption (RFC 8291, aes128gcm) ─────────────────────────
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

export async function encryptPayload(payloadBytes, p256dhB64u, authB64u) {
  const uaPublic = b64uDecode(p256dhB64u);
  const authSecret = b64uDecode(authB64u);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('bad push subscription keys');

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const asPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asPair.publicKey));
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPair.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // A single record: payload followed by the 0x02 "last record" delimiter.
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(payloadBytes, new Uint8Array([2]))));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

// Sends one push. Returns { ok, status, gone } — gone=true means the subscription is dead and should be removed.
export async function sendWebPush(sub, payload, keys, subject, fetchImpl = fetch) {
  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), sub.p256dh, sub.auth);
  const res = await fetchImpl(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, subject, keys),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(PUSH_TTL_SECONDS),
      Urgency: 'normal',
    },
    body,
  });
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}

// ── Storage (D1) ─────────────────────────────────────────────────────
const readyDbs = new WeakSet();

export async function ensurePushTables(DB) {
  if (readyDbs.has(DB)) return;
  await DB.prepare(`CREATE TABLE IF NOT EXISTS push_config (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')`).run();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint   TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL DEFAULT '',
    role       TEXT NOT NULL DEFAULT '',
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
  readyDbs.add(DB);
}

// Returns the VAPID key pair, creating and saving it on first use.
export async function getVapidKeys(DB) {
  await ensurePushTables(DB);
  const read = async () => {
    const row = await DB.prepare(`SELECT value FROM push_config WHERE key='vapid'`).first();
    if (!row?.value) return null;
    try {
      const k = JSON.parse(row.value);
      return k?.publicKey && k?.privateJwk ? k : null;
    } catch { return null; }
  };
  const existing = await read();
  if (existing) return existing;
  const fresh = await generateVapidKeys();
  // INSERT OR IGNORE: if two requests race, the first key wins and both then read the same one.
  await DB.prepare(`INSERT OR IGNORE INTO push_config (key, value) VALUES ('vapid', ?)`).bind(JSON.stringify(fresh)).run();
  return (await read()) || fresh;
}

function validEndpoint(endpoint) {
  try { return new URL(endpoint).protocol === 'https:' && String(endpoint).length <= 1000; } catch { return false; }
}

export async function saveSubscription(DB, user, sub) {
  const endpoint = String(sub?.endpoint || '');
  const p256dh = String(sub?.keys?.p256dh || '');
  const auth = String(sub?.keys?.auth || '');
  if (!validEndpoint(endpoint) || !p256dh || !auth) return { ok: false, error: 'That phone subscription looks incomplete.' };
  await ensurePushTables(DB);
  const count = await DB.prepare(`SELECT COUNT(*) AS n FROM push_subscriptions`).first();
  if ((count?.n || 0) >= MAX_SUBSCRIPTIONS) {
    const known = await DB.prepare(`SELECT 1 AS x FROM push_subscriptions WHERE endpoint=?`).bind(endpoint).first();
    if (!known) return { ok: false, error: 'Too many phones are already registered.' };
  }
  await DB.prepare(`INSERT INTO push_subscriptions (endpoint, user_id, role, p256dh, auth) VALUES (?,?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, role=excluded.role, p256dh=excluded.p256dh, auth=excluded.auth`)
    .bind(endpoint, String(user?.id || ''), String(user?.role || ''), p256dh, auth).run();
  return { ok: true };
}

export async function removeSubscription(DB, user, endpoint) {
  await ensurePushTables(DB);
  // Only the person who registered the phone (or the IT admin) can remove it.
  if (user?.role === 'it_admin') {
    await DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint=?`).bind(String(endpoint || '')).run();
  } else {
    await DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?`).bind(String(endpoint || ''), String(user?.id || '')).run();
  }
}

// Same audience rule as the in-app bell: empty roles = everyone, IT admin sees everything.
export function roleCanSee(rolesColumn, role) {
  return !rolesColumn || role === 'it_admin' || String(rolesColumn).includes(`,${role},`);
}

// Sends a push for a notification that was just created. Never throws.
export async function pushNotification(DB, { title, body, roles, subject }, fetchImpl = fetch) {
  try {
    await ensurePushTables(DB);
    const { results } = await DB.prepare(`SELECT endpoint, role, p256dh, auth FROM push_subscriptions`).all();
    const targets = (results || []).filter(s => roleCanSee(roles, s.role));
    if (!targets.length) return { sent: 0 };
    const keys = await getVapidKeys(DB);
    const payload = { title: String(title || 'Kingdom Parish').slice(0, 120), body: String(body || '').slice(0, 300), url: '/' };
    let sent = 0;
    await Promise.all(targets.map(async s => {
      try {
        const r = await sendWebPush(s, payload, keys, subject, fetchImpl);
        if (r.ok) sent++;
        else if (r.gone) await DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint=?`).bind(s.endpoint).run();
      } catch (e) {
        console.warn('[push] send failed:', e?.message || e);
      }
    }));
    return { sent };
  } catch (e) {
    console.warn('[push] skipped:', e?.message || e);
    return { sent: 0 };
  }
}
