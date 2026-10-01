// clerk-watchdog: the Clerk box pings this Worker every ~10 minutes.
// Every hour: if no ping has arrived for longer than Automations > Box connection "alert after (hours)" (default 3),
// it sends the people ticked for "Box-down alert" a direct Telegram message (no AI; secret TELEGRAM_BOT_TOKEN), repeated
// once a day while the box stays silent, and a "reporting again" message when the pings come back.
// Once a day (cron 30 6 * * *): only if that Telegram alert couldn't be sent, it wakes Church Clerk via its webhook
// (max once per 20h), as before.
// Also serves as the config + health API for the Automations tab: KV keys config, config_version, health.
import { DEFAULT_CONFIG, validateConfig } from "./config.js";

const MAX_SILENCE_MS = 3 * 60 * 60 * 1000;
const MIN_WAKE_GAP_MS = 20 * 60 * 60 * 1000;
const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_EVENT_BYTES = 16 * 1024;
const EVENT_TTL_S = 60 * 24 * 60 * 60;
const DAILY_CRON = "30 6 * * *";
const ALERT_REPEAT_MS = 24 * 60 * 60 * 1000;

const json = (o, status = 200) =>
  new Response(JSON.stringify(o, null, 2), { status, headers: { "content-type": "application/json" } });

async function sha256(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function authed(req, env) {
  const t = req.headers.get("x-watchdog-token");
  const h = await env.KV.get("token_hash");
  return !!(t && h && h === (await sha256(t)));
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // One-time: the script claims the Worker and receives its private token. Locks after first use.
    if (req.method === "POST" && url.pathname === "/claim") {
      if (await env.KV.get("token_hash")) return json({ error: "already claimed" }, 409);
      const tok = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, "0")).join("");
      await env.KV.put("token_hash", await sha256(tok));
      return json({ token: tok, note: "Store this token securely; it is never shown again." });
    }

    if (!(await authed(req, env))) return json({ error: "unauthorized" }, 401);

    if (req.method === "POST" && url.pathname === "/ping") {
      await env.KV.put("last_ping", String(Date.now()));
      const down = await env.KV.get("down_alert");
      if (down) {  // the box is back after a box-down alert: say so once
        await env.KV.delete("down_alert");
        let since = 0;
        try { since = JSON.parse(down).since || 0; } catch { /* old value */ }
        const h = since ? Math.max(1, Math.round((Date.now() - since) / 3600000)) : null;
        await telegram(env, "watchdog_down", `✅ <b>Clerk box is reporting again</b>${h ? `\nIt was silent for about ${h} hour${h === 1 ? "" : "s"}.` : ""}`);
      }
      let b = {};
      try { b = await req.json(); } catch { b = {}; } // old box script sends no body
      if (b && typeof b === "object" && b.health) {
        await env.KV.put("health", JSON.stringify({ ...b.health, received_at: new Date().toISOString() }));
      }
      const configVersion = +((await env.KV.get("config_version")) || 0);
      const bodyVersion = b && typeof b === "object" && Number.isFinite(b.config_version) ? b.config_version : 0;
      return json({ ok: true, config_version: configVersion, config_update: configVersion > bodyVersion });
    }

    // Script tells the Worker exactly how to call the wake webhook. "{{reason}}" in body is replaced.
    if (req.method === "POST" && url.pathname === "/register") {
      let b;
      try { b = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
      if (!b.url || !/^https:\/\//.test(b.url)) return json({ error: "url must start with https://" }, 400);
      const cfg = {
        url: b.url,
        method: (b.method || "POST").toUpperCase(),
        headers: b.headers || {},
        body: b.body === undefined || b.body === null ? null : typeof b.body === "string" ? b.body : JSON.stringify(b.body),
      };
      await env.KV.put("wake_config", JSON.stringify(cfg));
      return json({ ok: true });
    }

    if (req.method === "POST" && url.pathname === "/test-wake") return json(await wake(env, "setup test", true));

    // Sends one test message to the people ticked for "Box-down alert", to check the bot key and chat ids.
    if (req.method === "POST" && url.pathname === "/test-alert") {
      return json(await telegram(env, "watchdog_down", "🧪 <b>Test</b>: box-down alerts from the watchdog reach you here. No action needed."));
    }

    if (req.method === "GET" && url.pathname === "/health") {
      const [p, h] = await Promise.all(["last_ping", "health"].map((k) => env.KV.get(k)));
      return json({ last_ping: p ? new Date(+p).toISOString() : null, health: h ? JSON.parse(h) : null });
    }

    // Real church bank balance, fetched from the RCCG portal by the box (twice daily, or on
    // demand via the /events mailbox + Telegram /balance). Kept separate from /health, which is
    // operational status for the Automations tab — this is business data the Dashboard/Bank
    // pages read directly, open to any signed-in Finance user (see functions/api/[[route]].js).
    if (req.method === "POST" && url.pathname === "/bank-balance") {
      const raw = await req.text();
      if (new TextEncoder().encode(raw).length > MAX_EVENT_BYTES) return json({ error: "payload too large" }, 413);
      let b;
      try { b = JSON.parse(raw); } catch { return json({ error: "invalid JSON" }, 400); }
      // Number(null) and Number('') are both 0 — reject a missing/blank reading explicitly so a
      // failed portal check can never silently overwrite a real balance with ₦0.
      if (b?.balance === null || b?.balance === undefined || b?.balance === "") {
        return json({ error: "balance must be a number" }, 400);
      }
      const balance = Number(b.balance);
      if (!Number.isFinite(balance)) return json({ error: "balance must be a number" }, 400);
      const checked_at = new Date().toISOString();
      await env.KV.put("bank_balance", JSON.stringify({ balance, checked_at }));
      // Also keep a history entry for reconciliation, same id/list/cursor pattern as /events,
      // but with no TTL: balance history should persist, unlike the 60-day event mailbox.
      const id = `${String(Date.now()).padStart(13, "0")}-${crypto.randomUUID().slice(0, 8)}`;
      await env.KV.put(`bal:${id}`, JSON.stringify({ balance, checked_at, id }));
      await env.KV.put("balance_last", id);
      return json({ ok: true });
    }

    if (req.method === "GET" && url.pathname === "/bank-balance") {
      const v = await env.KV.get("bank_balance");
      return json(v ? JSON.parse(v) : { balance: null, checked_at: null });
    }

    if (req.method === "GET" && url.pathname === "/balance-history") {
      const after = url.searchParams.get("after") || "";
      // bal: entries never expire (unlike ev:, which TTLs out in 60 days), so the list can grow
      // past KV's ~1000-keys-per-page cap — follow the cursor until list_complete, or a caught-up
      // client's `after` id would eventually fall outside the single first page and see nothing new.
      let keys = [], cursor;
      for (;;) {
        const page = await env.KV.list({ prefix: "bal:", cursor });
        keys = keys.concat(page.keys);
        if (page.list_complete || !page.cursor) break;
        cursor = page.cursor;
      }
      const ids = keys.map((k) => k.name.slice(4)).filter((id) => id > after).sort().slice(0, 50);
      const history = [];
      for (const id of ids) {
        const v = await env.KV.get(`bal:${id}`);
        if (v) history.push(JSON.parse(v));
      }
      return json({ history, last: ids.length ? ids[ids.length - 1] : after });
    }

    if (req.method === "GET" && url.pathname === "/config") {
      const [c, v] = await Promise.all(["config", "config_version"].map((k) => env.KV.get(k)));
      return json({ config_version: +(v || 0), config: c ? JSON.parse(c) : DEFAULT_CONFIG, is_default: !c });
    }

    if (req.method === "PUT" && url.pathname === "/config") {
      const raw = await req.text();
      if (new TextEncoder().encode(raw).length > MAX_CONFIG_BYTES) {
        return json({ error: "invalid config", errors: ["config body must be 64 KB or smaller"] }, 400);
      }
      let b;
      try { b = JSON.parse(raw); } catch { return json({ error: "invalid JSON" }, 400); }
      const errors = validateConfig(b && b.config);
      if (errors.length) return json({ error: "invalid config", errors }, 400);

      const currentVersion = +((await env.KV.get("config_version")) || 0);
      if (Number.isFinite(b.base_version) && b.base_version !== currentVersion) {
        return json({ error: "conflict", config_version: currentVersion }, 409);
      }
      const nextVersion = currentVersion + 1;
      await env.KV.put("config", JSON.stringify(b.config));
      await env.KV.put("config_version", String(nextVersion));
      await env.KV.put("config_updated_at", new Date().toISOString());
      return json({ ok: true, config_version: nextVersion });
    }

    // Month-end mailbox: the app drops signals here (cut-off collection saved, button pressed);
    // the box reads them on its 5-minute config sync. Kept 60 days; ids sort by arrival time.
    if (req.method === "POST" && url.pathname === "/events") {
      const raw = await req.text();
      if (new TextEncoder().encode(raw).length > MAX_EVENT_BYTES) return json({ error: "event too large" }, 413);
      let ev;
      try { ev = JSON.parse(raw); } catch { return json({ error: "invalid JSON" }, 400); }
      if (!ev || typeof ev !== "object" || Array.isArray(ev) || typeof ev.event !== "string" || !ev.event) {
        return json({ error: "event must be an object with an event name" }, 400);
      }
      const id = `${String(Date.now()).padStart(13, "0")}-${crypto.randomUUID().slice(0, 8)}`;
      await env.KV.put(`ev:${id}`, JSON.stringify({ ...ev, id, received_at: new Date().toISOString() }), { expirationTtl: EVENT_TTL_S });
      await env.KV.put("events_last", id);
      return json({ ok: true, id });
    }

    if (req.method === "GET" && url.pathname === "/events") {
      const after = url.searchParams.get("after") || "";
      const listed = await env.KV.list({ prefix: "ev:" });
      const ids = listed.keys.map((k) => k.name.slice(3)).filter((id) => id > after).sort().slice(0, 50);
      const events = [];
      for (const id of ids) {
        const v = await env.KV.get(`ev:${id}`);
        if (v) events.push(JSON.parse(v));
      }
      return json({ events, last: ids.length ? ids[ids.length - 1] : after });
    }

    if (req.method === "GET" && url.pathname === "/config/version") {
      const [v, e] = await Promise.all(["config_version", "events_last"].map((k) => env.KV.get(k)));
      return json({ config_version: +(v || 0), events_last: e || null });
    }

    if (req.method === "GET" && url.pathname === "/status") {
      const [p, w, c, r] = await Promise.all(["last_ping", "last_wake", "wake_config", "last_result"].map(k => env.KV.get(k)));
      const cfg = c ? JSON.parse(c) : null;
      return json({
        last_ping: p ? new Date(+p).toISOString() : null,
        last_wake: w ? new Date(+w).toISOString() : null,
        wake_registered: !!cfg,
        wake_host: cfg ? new URL(cfg.url).host : null,
        last_result: r ? JSON.parse(r) : null,
      });
    }

    return json({ error: "not found" }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const alerted = await alertCheck(env);
      // the daily AI wake only when the direct Telegram alert couldn't be sent (saves AI compute)
      if ((!event || !event.cron || event.cron === DAILY_CRON) && !alerted) await check(env);
    })());
  },
};

// How long the box may be silent before the daily check wakes Church Clerk: Automations > Box connection
// (automations.supervisor.alert_after_hours), else MAX_SILENCE_MS.
async function maxSilenceMs(env) {
  try {
    const h = Number(JSON.parse((await env.KV.get("config")) || "null")?.automations?.supervisor?.alert_after_hours);
    if (Number.isFinite(h) && h >= 1 && h <= 48) return h * 60 * 60 * 1000;
  } catch { /* unreadable config: the default */ }
  return MAX_SILENCE_MS;
}

async function check(env) {
  const p = +((await env.KV.get("last_ping")) || 0);
  const now = Date.now();
  if (p && now - p < await maxSilenceMs(env)) return; // healthy: do nothing
  const reason = p ? `no ping from the script for ${Math.round((now - p) / 3600000)} hours` : "no ping ever received from the script";
  await wake(env, reason, false);
}

async function wake(env, reason, force) {
  const c = await env.KV.get("wake_config");
  if (!c) {
    await env.KV.put("last_result", JSON.stringify({ at: new Date().toISOString(), reason, outcome: "wake webhook not registered" }));
    return { ok: false, error: "wake webhook not registered" };
  }
  const lw = +((await env.KV.get("last_wake")) || 0);
  if (!force && Date.now() - lw < MIN_WAKE_GAP_MS) return { ok: false, skipped: "already woke Church Clerk in the last 20 hours" };
  const cfg = JSON.parse(c);
  const body = cfg.method === "GET" ? undefined
    : cfg.body !== null ? cfg.body.replaceAll("{{reason}}", reason)
    : JSON.stringify({ source: "clerk-watchdog", reason });
  let outcome;
  try {
    const r = await fetch(cfg.url, { method: cfg.method, headers: cfg.headers, body });
    outcome = { status: r.status };
  } catch (e) {
    outcome = { error: String(e) };
  }
  await env.KV.put("last_wake", String(Date.now()));
  await env.KV.put("last_result", JSON.stringify({ at: new Date().toISOString(), reason, ...outcome }));
  return { ok: !!outcome.status && outcome.status < 300, reason, ...outcome };
}

// ---- direct Telegram alerts (no AI) ----
async function recipients(env, type) {
  let cfg = null;
  try { cfg = JSON.parse((await env.KV.get("config")) || "null"); } catch { /* unreadable: defaults */ }
  cfg = cfg || DEFAULT_CONFIG;
  const r = (cfg.routing && cfg.routing[type]) || {};
  return (cfg.people || []).filter(p => p && r[p.key] && r[p.key].telegram && p.telegram_chat_id).map(p => p.telegram_chat_id);
}

async function telegram(env, type, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "no bot key (TELEGRAM_BOT_TOKEN) set on the Worker" };
  const ids = await recipients(env, type);
  if (!ids.length) return { ok: false, error: `nobody is ticked for Telegram on ${type}` };
  let sent = 0;
  for (const chat_id of ids) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id, text, parse_mode: "HTML", disable_web_page_preview: true }),
      });
      if (r.ok) sent++;
    } catch { /* next person */ }
  }
  return { ok: sent > 0, sent, of: ids.length };
}

const ukTime = ms => new Date(ms).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// true when the box is silent and a direct alert was sent (now, or within the last day).
async function alertCheck(env) {
  const p = +((await env.KV.get("last_ping")) || 0);
  if (!p || Date.now() - p < await maxSilenceMs(env)) return false;
  let st = null;
  try { st = JSON.parse((await env.KV.get("down_alert")) || "null"); } catch { st = null; }
  if (st && st.since === p && Date.now() - st.at < ALERT_REPEAT_MS) return !!(st.result && st.result.ok);
  const h = Math.floor((Date.now() - p) / 3600000);
  const result = await telegram(env, "watchdog_down",
    `🔴 <b>Clerk box not reporting</b>\nNo report from the box for ${h} hour${h === 1 ? "" : "s"} (last: ${ukTime(p)}).\n\n` +
    "<b>Next step:</b> check that the VM is switched on and running. You'll get a message when it reports again.");
  await env.KV.put("down_alert", JSON.stringify({ at: Date.now(), since: p, result }));
  return !!result.ok;
}
