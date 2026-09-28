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
import { remitWebhookHeaders } from './remit-action-token.js';

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
