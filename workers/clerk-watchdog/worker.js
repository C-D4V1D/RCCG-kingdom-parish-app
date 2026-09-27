// clerk-watchdog: Church Clerk's script pings this Worker every hour.
// Once a day, if no ping has arrived for 3 hours, it wakes Church Clerk via its webhook (max once per 20h).
const MAX_SILENCE_MS = 3 * 60 * 60 * 1000;
const MIN_WAKE_GAP_MS = 20 * 60 * 60 * 1000;

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
      return json({ ok: true });
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
    ctx.waitUntil(check(env));
  },
};

async function check(env) {
  const p = +((await env.KV.get("last_ping")) || 0);
  const now = Date.now();
  if (p && now - p < MAX_SILENCE_MS) return; // healthy: do nothing
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
