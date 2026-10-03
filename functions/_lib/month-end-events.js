// Month-end signals (the cut-off Sunday collection, and the Generate RRR / Refresh / Refresh attendance
// buttons) go to whoever runs the month-end filing, chosen in Automations → "Month-end run by":
//
//   clerk_ai (default)  REMIT_WEBHOOK_URL (the Clerk AI routine), as before; a copy goes to the Clerk box
//                       mailbox marked handler:'clerk_ai' so the box can do a read-only practice run.
//   box                 the Clerk box mailbox only (the clerk-watchdog Worker's /events). If the box has not
//                       reported in for 30 minutes (switched off?) or the mailbox can't be reached, the signal
//                       falls back to the Clerk AI so a month is never dropped.
//
// The box mailbox needs the CLERK_WATCHDOG_TOKEN secret (as /api/automations does). Nothing here throws.
import { remitWebhookHeaders, REMIT_ACTION_PEOPLE, REMIT_ACTION_PERSON_RE, REMIT_ACTION_PARISH } from './remit-action-token.js';

export const CLERK_WATCHDOG_DEFAULT_URL = 'https://clerk-watchdog.decan-inv.workers.dev';
const TIMEOUT_MS = 15000;
const BOX_SILENT_MS = 30 * 60 * 1000;

function watchdogBase(env) {
  return String(env?.CLERK_WATCHDOG_URL || CLERK_WATCHDOG_DEFAULT_URL).replace(/\/$/, '');
}

function watchdogToken(env) {
  return String(env?.CLERK_WATCHDOG_TOKEN || '').trim();
}

function timeoutSignal() {
  return typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
}

/**
 * Who may have the signed Generate RRR / Refresh buttons: Kingdom Parish people with "buttons" on in Automations →
 * People. Returns { people: { key: label }, fromSettings }. When the saved settings can't be read (no token, Worker
 * unreachable, nothing saved yet) it falls back to REMIT_ACTION_PEOPLE (David and Bro. Divine), as before.
 */
export async function actionButtonPeople(env) {
  const fallback = { people: { ...REMIT_ACTION_PEOPLE }, fromSettings: false };
  const token = watchdogToken(env);
  if (!token) return fallback;
  try {
    const res = await fetch(`${watchdogBase(env)}/config`, { headers: { 'x-watchdog-token': token }, signal: timeoutSignal() });
    if (!res.ok) return fallback;
    const data = await res.json();
    if (data?.is_default !== false || !Array.isArray(data?.config?.people)) return fallback;
    const people = {};
    for (const p of data.config.people) {
      if (!p || p.buttons !== true || !REMIT_ACTION_PERSON_RE.test(String(p.key || ''))) continue;
      if (String(p.parish || REMIT_ACTION_PARISH) !== REMIT_ACTION_PARISH) continue;   // Kingdom Parish's people only
      people[p.key] = String(p.called || p.name || p.key).trim() || p.key;
    }
    return { people, fromSettings: true };
  } catch {
    return fallback;
  }
}

/** 'box' or 'clerk_ai' (the default, also whenever the saved settings can't be read). */
export async function monthEndHandler(env) {
  return (await monthEndRoute(env)).handler;
}

/** { handler, silent } — silent: the settings say box, but the box hasn't reported in for 30 minutes (or the minutes set). */
async function monthEndRoute(env) {
  const token = watchdogToken(env);
  if (!token) return { handler: 'clerk_ai' };
  try {
    const get = path => fetch(`${watchdogBase(env)}${path}`, { headers: { 'x-watchdog-token': token }, signal: timeoutSignal() });
    const res = await get('/config');
    if (!res.ok) return { handler: 'clerk_ai' };
    const data = await res.json();
    if (!(data?.is_default === false && data?.config?.remittance?.handler === 'box')) return { handler: 'clerk_ai' };
    const h = await get('/health');
    const last = h.ok ? Date.parse((await h.json())?.last_ping || '') : NaN;
    const mins = Number(data.config.automations?.supervisor?.ai_takeover_minutes);  // Automations > Box connection
    const silentMs = Number.isFinite(mins) && mins >= 10 && mins <= 240 ? mins * 60 * 1000 : BOX_SILENT_MS;
    if (!(Date.now() - last < silentMs)) return { handler: 'clerk_ai', silent: true };
    return { handler: 'box' };
  } catch {
    return { handler: 'clerk_ai' };
  }
}

/** True when the box has not reported in for the takeover minutes (Automations → Box connection; default 30). */
async function satelliteBoxSilent(env) {
  const token = watchdogToken(env);
  if (!token) return true;
  try {
    const get = path => fetch(`${watchdogBase(env)}${path}`, { headers: { 'x-watchdog-token': token }, signal: timeoutSignal() });
    const [c, h] = await Promise.all([get('/config'), get('/health')]);
    const mins = Number((c.ok ? await c.json() : null)?.config?.automations?.supervisor?.ai_takeover_minutes);
    const silentMs = Number.isFinite(mins) && mins >= 10 && mins <= 240 ? mins * 60 * 1000 : BOX_SILENT_MS;
    const last = h.ok ? Date.parse((await h.json())?.last_ping || '') : NaN;
    return !(Date.now() - last < silentMs);
  } catch {
    return true;
  }
}

async function postToBox(env, event) {
  const token = watchdogToken(env);
  if (!token) return false;
  try {
    const res = await fetch(`${watchdogBase(env)}/events`, {
      method: 'POST',
      headers: { 'x-watchdog-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: timeoutSignal(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function postToClerkAi(env, event) {
  const url = String(env?.REMIT_WEBHOOK_URL || '').trim();
  if (!url) return false;
  try {
    const res = await fetch(url, { method: 'POST', headers: remitWebhookHeaders(env), body: JSON.stringify(event), signal: timeoutSignal() });
    if (!res.ok) console.error(`[month-end] Clerk AI webhook answered HTTP ${res.status} for ${event.event}`);
    return res.ok;
  } catch (e) {
    console.error(`[month-end] Clerk AI webhook unreachable for ${event.event}:`, e?.message || e?.name || e);
    return false;
  }
}

/** True when at least one destination is configured. */
export function monthEndConfigured(env) {
  return !!(String(env?.REMIT_WEBHOOK_URL || '').trim() || watchdogToken(env));
}

/**
 * Deliver one month-end signal. Returns { ok, to } where `to` is 'box' or 'clerk_ai' (who will act on it)
 * and `ok` says whether that delivery was accepted.
 */
export async function deliverMonthEndEvent(env, payload) {
  // A satellite parish's signal always goes to the box, which applies that parish's own "Month-end run by"
  // (Automations → Parishes); only a silent or unreachable box sends it to the Clerk AI.
  if (payload?.satellite) {
    if (await satelliteBoxSilent(env)) return { ok: await postToClerkAi(env, { ...payload, fallback: 'box_silent' }), to: 'clerk_ai' };
    if (await postToBox(env, { ...payload, handler: 'box' })) return { ok: true, to: 'box' };
    return { ok: await postToClerkAi(env, { ...payload, fallback: 'box_unreachable' }), to: 'clerk_ai' };
  }
  const { handler, silent } = await monthEndRoute(env);
  if (silent) {
    console.error(`[month-end] Clerk box silent too long; ${payload.event} goes to the Clerk AI instead`);
    return { ok: await postToClerkAi(env, { ...payload, fallback: 'box_silent' }), to: 'clerk_ai' };
  }
  if (handler === 'box') {
    if (await postToBox(env, { ...payload, handler: 'box' })) return { ok: true, to: 'box' };
    console.error(`[month-end] Clerk box mailbox unreachable for ${payload.event}; falling back to the Clerk AI`);
    return { ok: await postToClerkAi(env, { ...payload, fallback: 'box_unreachable' }), to: 'clerk_ai' };
  }
  const ok = await postToClerkAi(env, payload);
  await postToBox(env, { ...payload, handler: 'clerk_ai' });   // practice copy for the box; never blocks
  return { ok, to: 'clerk_ai' };
}
