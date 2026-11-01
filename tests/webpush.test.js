import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto as crypto } from 'node:crypto';
import {
  b64uEncode, b64uDecode, encryptPayload, generateVapidKeys, sendWebPush, pushNotification, roleCanSee,
} from '../functions/_lib/webpush.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };

// Acts like a phone: makes a subscription, and can decrypt what the server sends (RFC 8291).
async function fakePhone() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  return {
    sub: { endpoint: 'https://push.example.test/abc', p256dh: b64uEncode(pub), auth: b64uEncode(authSecret) },
    async decrypt(body) {
      const salt = body.slice(0, 16);
      const idlen = body[20];
      const asPub = body.slice(21, 21 + idlen);
      const cipher = body.slice(21 + idlen);
      const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, pair.privateKey, 256));
      const ikm = await hkdf(authSecret, secret, cat(enc.encode('WebPush: info\0'), pub, asPub), 32);
      const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
      const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
      const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
      const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
      assert.equal(plain[plain.length - 1], 2, 'last-record delimiter');
      return dec.decode(plain.slice(0, -1));
    },
  };
}

test('b64u round-trips', () => {
  const bytes = crypto.getRandomValues(new Uint8Array(65));
  assert.deepEqual(b64uDecode(b64uEncode(bytes)), bytes);
});

test('encrypted payload can be read by the phone', async () => {
  const phone = await fakePhone();
  const body = await encryptPayload(enc.encode('{"title":"Hi","body":"Loan awaiting acknowledgement"}'), phone.sub.p256dh, phone.sub.auth);
  assert.equal(await phone.decrypt(body), '{"title":"Hi","body":"Loan awaiting acknowledgement"}');
});

test('sendWebPush signs a valid VAPID header and posts encrypted body', async () => {
  const phone = await fakePhone();
  const keys = await generateVapidKeys();
  let seen;
  const fakeFetch = async (url, init) => { seen = { url, init }; return { ok: true, status: 201 }; };
  const r = await sendWebPush(phone.sub, { title: 'T', body: 'B' }, keys, 'https://app.example.test', fakeFetch);
  assert.equal(r.ok, true);
  assert.equal(seen.url, phone.sub.endpoint);
  assert.equal(seen.init.headers['Content-Encoding'], 'aes128gcm');
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(seen.init.headers.Authorization);
  assert.ok(m, 'vapid header shape');
  assert.equal(m[4], keys.publicKey);
  // Verify the JWT signature with the public key.
  const pub = await crypto.subtle.importKey('raw', b64uDecode(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const okSig = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64uDecode(m[3]), enc.encode(`${m[1]}.${m[2]}`));
  assert.equal(okSig, true);
  const claims = JSON.parse(dec.decode(b64uDecode(m[2])));
  assert.equal(claims.aud, 'https://push.example.test');
  assert.equal(JSON.parse(await phone.decrypt(seen.init.body)).title, 'T');
});

test('role audience matches the in-app bell rule', () => {
  assert.equal(roleCanSee('', 'treasurer'), true);
  assert.equal(roleCanSee(',accountant,pastor,', 'pastor'), true);
  assert.equal(roleCanSee(',accountant,pastor,', 'treasurer'), false);
  assert.equal(roleCanSee(',accountant,', 'it_admin'), true);
});

// Minimal in-memory stand-in for D1 covering the statements webpush.js runs.
function fakeDb() {
  const subs = new Map(); const config = new Map();
  const stmt = sql => {
    let args = [];
    const s = {
      bind: (...a) => { args = a; return s; },
      async run() {
        if (/^INSERT INTO push_subscriptions/.test(sql)) subs.set(args[0], { endpoint: args[0], user_id: args[1], role: args[2], p256dh: args[3], auth: args[4] });
        else if (/^DELETE FROM push_subscriptions/.test(sql)) subs.delete(args[0]);
        else if (/^INSERT OR IGNORE INTO push_config/.test(sql)) { if (!config.has('vapid')) config.set('vapid', args[0]); }
        return {};
      },
      async first() {
        if (/FROM push_config/.test(sql)) return config.has('vapid') ? { value: config.get('vapid') } : null;
        if (/COUNT/.test(sql)) return { n: subs.size };
        return null;
      },
      async all() { return { results: [...subs.values()] }; },
    };
    return s;
  };
  return { prepare: stmt, subs, config };
}

test('pushNotification sends only to allowed roles, prunes dead phones, creates keys once', async () => {
  const db = fakeDb();
  const a = await fakePhone(); const b = await fakePhone(); const c = await fakePhone();
  a.sub.endpoint = 'https://push.example.test/a'; b.sub.endpoint = 'https://push.example.test/b'; c.sub.endpoint = 'https://push.example.test/c';
  for (const [p, role] of [[a, 'pastor'], [b, 'treasurer'], [c, 'pastor']]) {
    db.subs.set(p.sub.endpoint, { endpoint: p.sub.endpoint, role, p256dh: p.sub.p256dh, auth: p.sub.auth });
  }
  const calls = [];
  const fakeFetch = async url => { calls.push(url); return url.endsWith('/c') ? { ok: false, status: 410 } : { ok: true, status: 201 }; };
  const r = await pushNotification(db, { title: 'X', body: 'Y', roles: ',pastor,', subject: 'https://app.example.test' }, fakeFetch);
  assert.equal(r.sent, 1);
  assert.deepEqual(calls.sort(), ['https://push.example.test/a', 'https://push.example.test/c']);
  assert.equal(db.subs.has('https://push.example.test/c'), false, 'dead phone removed');
  assert.equal(db.subs.has('https://push.example.test/b'), true, 'other role untouched');
  assert.ok(db.config.get('vapid'), 'keys created automatically');
});

test('pushNotification never throws', async () => {
  const r = await pushNotification({ prepare() { throw new Error('db down'); } }, { title: 'x' });
  assert.equal(r.sent, 0);
});
