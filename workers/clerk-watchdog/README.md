# clerk-watchdog

Cloudflare Worker that the Church Clerk box pings, and the config + health API
behind the app's Automations tab. Backed by a single KV namespace (binding
`KV`).

## Endpoints

All endpoints except `/claim` require the header `x-watchdog-token: <token>`.

- `POST /claim` — one-time: issues the watchdog token and stores its hash.
  Locks after first use (409 if already claimed).
- `POST /ping` — the box's heartbeat. Body is optional JSON:
  `{ "health": {...}, "config_version": n }`. Always updates `last_ping`;
  if `health` is present it's stored (with `received_at`) in KV key `health`.
  An empty/non-JSON body still works, for the old box script.
  Returns `{ ok, config_version, config_update }` — `config_update` is true
  when the Worker's config is newer than the version the box last saw, so the
  box knows to fetch `/config`.
- `POST /register` — box tells the Worker how to call its wake webhook.
- `POST /test-wake` — fires the wake webhook immediately (bypasses the
  20h cooldown), for setup testing.
- `GET /status` — ping/wake/webhook registration summary (unchanged).
- `GET /health` — `{ last_ping, health }`, the latest health snapshot for the
  Automations dashboard.
- `GET /config` — `{ config_version, config, is_default }`. Returns
  `DEFAULT_CONFIG` (see `config.js`) with `is_default: true` until a config
  has been saved.
- `PUT /config` — body `{ config: {...}, base_version?: n }`. Validates the
  config (see `config.js` `validateConfig`); on failure returns
  `400 { error: "invalid config", errors: [...] }`. If `base_version` is
  given and doesn't match the stored `config_version`, returns
  `409 { error: "conflict", config_version }` without writing. Otherwise
  stores the config, increments `config_version`, stamps
  `config_updated_at`, and returns `{ ok: true, config_version }`. The body
  is capped at 64 KB.
- `GET /config/version` — `{ config_version }`, cheap enough for the box to
  poll every ping.

The scheduled cron (`scheduled()`/`check()`) is unchanged: if the box has
been silent for more than `MAX_SILENCE_MS` (3h), it wakes it via the
registered webhook, at most once per `MIN_WAKE_GAP_MS` (20h).

## Config shape

See `config.js` for `DEFAULT_CONFIG` (the current box settings, taken from
the Clerk Box Configuration Inventory) and `MESSAGE_TYPES` (the ordered list
of notification types used as `routing` keys). `validateConfig(cfg)` returns
an array of plain-English error strings (empty means valid) and is the same
check `PUT /config` runs.

## Deploy

```
cd workers/clerk-watchdog
npx wrangler deploy
```

`wrangler.toml` already has the `KV` binding configured, and intentionally
has no `[triggers]` block so `wrangler deploy` doesn't touch the existing
cron schedule on the deployed Worker.

## Bank balance → reconciliation

`POST /bank-balance` (the box, every 15 minutes) stores the reading and a `bal:<id>` history entry. When the
balance changed — or the last hand-off failed (`recon_synced` != "1") — it calls the app's
`POST {APP_URL}/api/internal/run-bank-recon`, forwarding the box's own `x-watchdog-token` (the app holds the same
value as `CLERK_WATCHDOG_TOKEN`), so movements are recorded and announced on Telegram straight away. `APP_URL` is a
plain var in wrangler.toml; without it nothing is called.
