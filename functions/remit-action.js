// /remit-action?t=<token> — one-tap confirm page for the remittance check email.
//
// Self-contained: server-rendered HTML, no app bundle, no login (the signed token is
// the authorisation; see ./_lib/remit-action-token.js). Nothing here touches the
// database or any other page.
//
//   GET  shows what the token asks for, with ONE confirm button. It never calls the
//        webhook, so email link scanners that open the link can't trigger anything.
//   POST (the button) re-verifies the token and sends ONE notice to REMIT_WEBHOOK_URL
//        with the same key header as the cut-off webhook:
//        { event:'remit_action', action, parish, month, person, test, clickedAt }
//        Church Clerk (the box routine) ignores duplicates, so a second tap is harmless.
// REMIT_WEBHOOK_URL / REMIT_WEBHOOK_KEY stay on the server; the page never shows them.

import {
  verifyRemitActionToken,
  remitActionSecret,
  remitWebhookHeaders,
  REMIT_ACTION_PEOPLE,
} from './_lib/remit-action-token.js';

const WEBHOOK_TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 4096;
const PARISH_NAME = 'RCCG Kingdom Parish, Aguleri';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const ACTIONS = {
  generate_rrr: {
    button: 'Confirm Generate RRR',
    title: 'Generate RRR',
    what: "Church Clerk will generate the Remita RRR for this month's remittance on the RCCG portal, then email you the RRR code and the exact amounts. Nothing is paid automatically, and if an RRR already exists for the month it is not generated again.",
  },
  refresh: {
    button: 'Confirm Refresh',
    title: 'Refresh the check',
    what: 'Church Clerk will re-read the parish app and the RCCG portal and send a new check email. The report already submitted on the portal is not changed.',
  },
  refresh_attendance: {
    button: 'Confirm Refresh',
    title: 'Refresh attendance',
    what: 'Church Clerk will re-read this month\'s attendance and Monthly report from the parish app and send a new check email. Nothing already submitted on the portal is changed.',
  },
};

// Title for the page heading and the "Action" row. refresh_attendance includes the month
// (e.g. "Refresh attendance for October 2026"); the others use their fixed ACTIONS title.
function actionTitle(p) {
  if (p.action === 'refresh_attendance') return `Refresh attendance for ${monthLabel(p.month)}`;
  return ACTIONS[p.action].title;
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    if (request.method === 'GET' || request.method === 'HEAD') return await handleGet(request, env);
    if (request.method === 'POST') return await handlePost(request, env);
    return page(405, 'Not allowed', `<p>Please open the link from the remittance email.</p>`, { Allow: 'GET, HEAD, POST' });
  } catch (e) {
    console.error('[remit-action] unexpected error:', e?.message || e);
    return page(500, 'Something went wrong', `<p>Nothing was sent. Please try the link again in a minute.</p>`);
  }
}

async function handleGet(request, env) {
  const token = new URL(request.url).searchParams.get('t') || '';
  const secret = remitActionSecret(env);
  if (!secret) return notConfigured();
  const v = await verifyRemitActionToken(secret, token);
  if (!v.ok) return invalidPage(v);

  const p = v.payload;
  const a = ACTIONS[p.action];
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const body = `
${p.test ? testBanner() : ''}
${details(p)}
<p class="what"><b>What will happen:</b> ${esc(a.what)}</p>
<form method="post" action="/remit-action" id="f">
  <input type="hidden" name="t" value="${esc(token)}">
  <button type="submit" id="b" class="btn">${esc(a.button)}${p.test ? ' (test)' : ''}</button>
</form>
<p class="small">Only press once. Nothing happens until you press the button.</p>
<script nonce="${nonce}">
  (function () {
    var f = document.getElementById('f'), b = document.getElementById('b'), sent = false;
    f.addEventListener('submit', function (e) {
      if (sent) { e.preventDefault(); return; }
      sent = true; b.disabled = true; b.textContent = 'Sending\\u2026';
    });
    // Coming back to this page (browser back button) re-enables nothing: reload for a fresh page.
    window.addEventListener('pageshow', function (e) { if (e.persisted) location.reload(); });
  })();
</script>`;
  return page(200, actionTitle(p), body, {}, nonce);
}

async function handlePost(request, env) {
  const secret = remitActionSecret(env);
  const url = String(env?.REMIT_WEBHOOK_URL || '').trim();
  if (!secret || !url) return notConfigured();

  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_BODY_BYTES) return page(413, 'Not sent', `<p>That request was too large. Please use the button in the email.</p>`);
  let token = '';
  try {
    const form = await request.formData();
    token = String(form.get('t') || '');
  } catch {
    return page(400, 'Not sent', `<p>Please open the link from the remittance email and press the button there.</p>`);
  }
  const v = await verifyRemitActionToken(secret, token);
  if (!v.ok) return invalidPage(v);

  const p = v.payload;
  const notice = {
    event: 'remit_action',
    action: p.action,
    parish: p.parish,
    month: p.month,
    person: p.person,
    test: p.test === true,
    clickedAt: new Date().toISOString(),
  };
  let res;
  try {
    res = await fetch(url, {
      method: 'POST', headers: remitWebhookHeaders(env), body: JSON.stringify(notice),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    console.error(`[remit-action] ${timedOut ? 'timeout' : 'network error'} sending ${notice.action} for ${notice.month} (${notice.person})`);
    return notSent(p, timedOut);
  }
  if (!res.ok) {
    console.error(`[remit-action] webhook answered HTTP ${res.status} for ${notice.action} ${notice.month} (${notice.person})`);
    return notSent(p, false);
  }
  console.log(`[remit-action] sent ${notice.action} ${notice.month} by ${notice.person}${notice.test ? ' (test)' : ''}`);
  const body = `
${p.test ? testBanner() : ''}
<div class="ok">&#10003; Sent.</div>
<p class="lead">Church Clerk is working on it and will email the result shortly.</p>
${p.test ? '<p>This was a test: Church Clerk will only send David a chat message. Nothing is done on the portal.</p>' : ''}
${details(p)}
<p class="small">You can close this page.</p>`;
  return page(200, 'Sent', body);
}

// ── pieces ───────────────────────────────────────────────────────────

function monthLabel(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  return `${MONTHS[m - 1] || ''} ${y}`.trim();
}

function details(p) {
  return `<table class="kv" role="presentation">
  <tr><th>Parish</th><td>${esc(PARISH_NAME)}</td></tr>
  <tr><th>Remittance</th><td>${esc(monthLabel(p.month))}</td></tr>
  <tr><th>Confirming as</th><td>${esc(REMIT_ACTION_PEOPLE[p.person] || p.person)}</td></tr>
  <tr><th>Action</th><td>${esc(actionTitle(p))}</td></tr>
</table>`;
}

function testBanner() {
  return `<div class="test">TEST link from the webhook test button. Nothing will be done on the RCCG portal.</div>`;
}

function invalidPage(v) {
  if (v.reason === 'expired') {
    return page(410, 'Link expired',
      `<p class="lead">This link has expired.</p>
<p>Buttons in a remittance check email work for 21 days after the cut-off Sunday (test buttons for 24 hours). Please use the latest check email, or ask David.</p>`);
  }
  return page(400, 'Link not valid',
    `<p class="lead">This link isn't valid.</p>
<p>It may have been cut short or changed. Please open it again from the remittance check email, or ask David.</p>`);
}

function notConfigured() {
  return page(503, 'Not available',
    `<p class="lead">The remittance buttons are not set up on this site.</p><p>Nothing was sent. Please tell David.</p>`);
}

function notSent(p, timedOut) {
  return page(502, 'Not sent',
    `<p class="lead">${timedOut ? 'Church Clerk did not answer in time.' : 'Church Clerk could not be reached.'}</p>
<p>${timedOut ? 'It may or may not have been received. ' : ''}Please go back and press the button again in a minute. Pressing it again is safe: an action is only done once.</p>
${details(p)}`);
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function page(status, title, body, extraHeaders = {}, nonce = '') {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(title)} · Kingdom Parish remittance</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#eef1f5;font:16px/1.5 Arial,Helvetica,sans-serif;color:#1f2933}
  .wrap{max-width:480px;margin:0 auto;padding:16px 12px}
  .card{background:#fff;border:1px solid #d9dfe7;border-radius:10px;overflow:hidden}
  .hd{background:#1f3f7a;color:#fff;padding:16px}
  .hd .p{font-size:14px;color:#d6e0f5}
  .hd h1{margin:2px 0 0;font-size:21px;line-height:1.3}
  .bd{padding:16px}
  .lead{font-size:18px;font-weight:bold;margin:0 0 8px}
  .kv{width:100%;border-collapse:collapse;margin:8px 0 14px;font-size:15px}
  .kv th{text-align:left;color:#4a5563;font-weight:normal;padding:6px 8px 6px 0;width:42%;vertical-align:top}
  .kv td{padding:6px 0;font-weight:bold}
  .kv tr+tr th,.kv tr+tr td{border-top:1px solid #eef1f5}
  .what{background:#f5f7fa;border-radius:8px;padding:12px;margin:0 0 16px;font-size:15px}
  .btn{display:block;width:100%;min-height:56px;border:0;border-radius:10px;background:#1e6b3a;color:#fff;font:bold 19px Arial,Helvetica,sans-serif;padding:14px;cursor:pointer}
  .btn:disabled{background:#8a94a3;cursor:default}
  .small{font-size:13px;color:#6b7380;margin:12px 0 0}
  .test{background:#fff6db;border:1px solid #e9c46a;color:#6b4e00;border-radius:8px;padding:10px 12px;margin:0 0 12px;font-size:14px;font-weight:bold}
  .ok{font-size:26px;font-weight:bold;color:#1e6b3a;margin:0 0 4px}
</style></head>
<body><div class="wrap"><div class="card">
<div class="hd"><div class="p">${esc(PARISH_NAME)}</div><h1>Remittance · ${esc(title)}</h1></div>
<div class="bd">${body}</div>
</div></div></body></html>`;
  const csp = `default-src 'none'; style-src 'unsafe-inline'; ${nonce ? `script-src 'nonce-${nonce}'; ` : ''}form-action 'self'; base-uri 'none'; frame-ancestors 'none'`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': csp,
      ...extraHeaders,
    },
  });
}
