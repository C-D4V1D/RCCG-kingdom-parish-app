---
name: clerk-box
description: Everything needed to change the Clerk box (the parish's no-AI automation VM), the clerk-watchdog Cloudflare Worker, or the app's Automations tab — how the three connect, where the box's files are, how to ship a box change safely, and how to deploy the Worker. Use for any request about the Clerk box, its runners (memo, statement, attendance, reminders, upload bot, health, drive sync), Telegram/email routing, the Automations tab or the watchdog.
---

# Clerk box, watchdog Worker and the Automations tab

Background doc (the original spec, with the owner's intended routing table): the Claude Doc
"Clerk Box Configuration Inventory", https://claude.ai/code/artifact/b3c848f7-5f30-4cd5-853c-552dc35b2287
(read it with the Claude Docs connector, not web fetch). The owner is David Chukwuemeka (IT admin); he is
not a developer — give him copy-paste terminal commands and plain English, one step at a time.

## How the pieces connect

```
Clerk box (VM, /workspace)  --POST /ping {health, config_version} every 10 min-->  clerk-watchdog Worker (KV)
        ^  supervisor.sh: `clerkcfg.py sync` each 5-min cycle (GET /config/version, GET /config)     ^
        |                                                                                           |
        +------ /workspace/config.json <--- settings saved in the app ---- PUT /config ----- Pages Function
                                                                              /api/automations/{health,config}
                                                                              (functions/api/[[route]].js, secret
                                                                               CLERK_WATCHDOG_TOKEN) <- Automations page
```

- The browser never sees the watchdog token: the app's server proxies to the Worker. IT admin (`it_admin`)
  reads/writes; the accountant gets a read-only view filtered to his own rows; everyone else gets 403.
- The Worker: `workers/clerk-watchdog/` (worker.js, config.js = DEFAULT_CONFIG + validateConfig, README).
  KV binding `KV`, namespace id `6a977aa2091048e18512cfdb5d3e1008`; Cloudflare account `63d7bbd4f912ddc7b6272dbda2881a82`.
  Existing cron `30 6 * * *` (daily wake check). wrangler.toml deliberately has NO [triggers] block so deploys keep it.
  KV free tier ≈ 1000 writes/day: each ping writes 2 keys; don't ping more often than every 10 minutes.
- The app page: `src/js/app.js` (search `renderAutomations`), CSS `.at-*` in `src/css/styles.css`; run
  `npm run build` after editing src/ (dist/ and index.html's hash are committed). Tests: `npm test`
  (tests/clerk-watchdog-worker.test.js, tests/automations-api.test.js).

## Config (what the app saves, what the box reads)

Shape: `{people[], parishes[], routing{<message_type>: {<person>: {telegram, email}}}, automations{memo, statement,
attendance, source_doc_reminders, weekly_attendance_reminder, sunday_note, health_note, upload_bot, drive_sync, supervisor}}`.
Message types: memo_forwarded, memo_error, remittance_check, rrr_generated, parish_remittance_check, monthly_statement,
statement_error, attendance_filed, attendance_nudge, attendance_nudge_fallback, attendance_error, source_doc_reminder,
weekly_attendance_reminder, weekly_health, upload_confirmation, upload_fyi, sunday_note, watchdog_down, scheduler_fallback.
DEFAULT_CONFIG mirrors what the box did before the app existed (not the doc's table, which differed). The owner has
saved the config (v4 on 2026-09-28), so the box follows the saved values now. To see them on the box:
`python3 /workspace/tools/clerkcfg.py show`.

## The box

Paths: `/workspace/tools` (common.py, mailer.py, tgcard.py, health.py, reminders.py, stmt-runner.py, att-watch.py,
supervisor.sh, drive-sync.sh, clerkcfg.py), `/workspace/telegram` (send_msg.py, tg_msgs.py, contacts.json, tg.py),
`/workspace/telegram/srcdoc` (poller.py = upload bot + boxsched.py scheduler thread, imgproc.py, ensure_running.sh,
sched_config.json), `/workspace/rccg-memos/memo-runner.sh`, `/workspace/fin-statement`, `/workspace/rccg-attendance`.
Secrets are in `/workspace/.secrets/` (never read, print or copy them). No cron: supervisor.sh keeps everything alive.

- `clerkcfg.py` is the only way runners read settings. Every helper falls back to the runner's old hard-coded value
  when there is no config, the config is the unsaved default, or anything fails. Keep that property in every change.
- Telegram routing is enforced in `send_msg.py` (type from `CLERK_MSG_TYPE` env, else the `--key` prefix, e.g.
  `stmt:` → monthly_statement), email routing in `mailer.py` (only when the caller sets `CLERK_MSG_TYPE`).
  `common.tg_card` derives the type from `CLERK_CONTEXT` (set by stmt-runner/att-watch) and the card icon.
- boxsched.py is configured only through `sched_config.json`, which `clerkcfg.apply()` writes.

### Reading the box's files

You cannot reach the box. Its /workspace is mirrored (every 10 min, excluding .secrets, logs, venvs) to Google Drive:
`Clerk Box/workspace` (folder id `188CYyeNY5XCWPnT8Vl1BdXmIQxmKeVkA`; `tools` = `1VIwn3foQJgmd88E1sPt2I-cvBKBNM0Cy`,
`telegram` = `1y0bsh_zuUUXbKiYm7tprTTfudq3ZzRSy`, `telegram/srcdoc` = `1WbmHZxxkOxAiEey3EVptkkDoHewag_Bw`,
`rccg-memos` = `14Ag3TnYBq6GVBWv4Rf1AVvHruGETxgGB`). Use the Google Drive connector:
`read_file_content` gives readable text but loses indentation and markdown-escapes it (fine for understanding, not
for exact copies); `download_file_content` gives exact bytes as base64 (use for .sh files and when exactness matters).
Don't let a subagent download many files — base64 overflows its context.

### Shipping a box change (the only safe way)

1. Change `box/automations-20260928/` (or add a new dated folder for a big change): `patch.py` holds anchored,
   all-or-nothing edits (each anchor must match exactly once, whitespace-insensitive; every patched file must compile;
   files carrying the marker are skipped), `clerkcfg.py`, `supervisor.sh`, `install.sh`, `undo.sh`.
   For a new round of patches on already-patched files, use a NEW marker/folder; the old marker makes patch.py skip them.
2. Test on fixtures (build a fake root with the anchor lines; `CLERK_ROOT=<fake> python3 patch.py --check`, apply,
   run twice, break one anchor and confirm nothing changed).
3. Regenerate `SHA256SUMS` (`sha256sum clerkcfg.py patch.py supervisor.sh undo.sh install.sh > SHA256SUMS`), PR, merge.
   The repo is public, so the box downloads from `https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/...`.
4. Give the owner one copy-paste command: download with curl, `sha256sum -c`, then `bash install.sh --check`, then
   `bash install.sh`. Never between 07:25 and 09:05 (statement/memo runs). Undo:
   `bash /workspace/backups/automations-20260928/undo.sh`. Ask him for a screenshot of the output.
5. A single-file fix to clerkcfg.py can be shipped as "curl it, sha256sum -c --ignore-missing, install -m 755 to
   /workspace/tools/clerkcfg.py" (no restart needed).

## Deploying the Worker

Automatic: `.github/workflows/deploy-watchdog.yml` tests and deploys `workers/clerk-watchdog` whenever a change to it
reaches main (repo secret `CLOUDFLARE_API_TOKEN`, "Edit Cloudflare Workers" template; without it the job skips with a
notice). Re-run by hand with the GitHub MCP `actions_run_trigger` (workflow `deploy-watchdog.yml`, ref main). The cron
schedule now lives in wrangler.toml `[triggers]` ("30 6 * * *" daily AI wake only if the direct alert failed, "17 * * * *"
hourly box-down check). The Worker secret `TELEGRAM_BOT_TOKEN` (set in the Cloudflare dashboard) sends the direct
box-down alerts to the people ticked for `watchdog_down`; `POST /test-alert` (watchdog token) sends a test message.
A changed bank balance (`POST /bank-balance`) makes the Worker call the app's
`/api/internal/run-bank-recon` with the box's token (wrangler.toml var `APP_URL`), so reconciliation and its Telegram
alerts don't wait for the GitHub cron (whose `CRON_SECRET` repo secret was missing as of 2026-10-02). Verify the live code with the Cloudflare connector (`workers_get_worker_code clerk-watchdog`). The app's Pages secret
`CLERK_WATCHDOG_TOKEN` must equal the box's `/workspace/.secrets/watchdog-token` (only the owner can copy it).

## Month-end (remittance) — who runs it

- The app sends month-end signals (cut-off Sunday collection saved; Generate RRR / Refresh / Refresh attendance button
  confirmed) through `functions/_lib/month-end-events.js`. Automations → Settings → Remittance (month-end) →
  "Month-end run by" (`config.remittance.handler`):
  - `clerk_ai` (default): the Clerk AI webhook as before, plus a copy to the Worker mailbox (`POST /events`) marked
    `handler:'clerk_ai'` → the box does a **practice run** only (offline dry run after the AI finished; Telegram to David).
  - `box`: the Worker mailbox only; the box does the real run. Falls back to the Clerk AI if the mailbox is unreachable
    or the box hasn't pinged for 30 minutes (`fallback: 'box_unreachable' | 'box_silent'`).
- The app also refuses the cut-off Sunday collection until every earlier Sunday of the period has one
  (`checkEarlierCollectionsGate` in `functions/api/[[route]].js`).
- Box side: bundle `box/monthend-20261001/`. `clerkcfg.py sync` copies new mailbox signals to
  `/workspace/state/monthend/inbox/` and starts `/workspace/tools/monthend.py run` (WEBHOOK-RUN.md / REPLY-RUN.md as a
  script: same scripts, `state/remit-runs.json`, logs). Emails go through `mailer.py` (SMTP), not Gmail.
  The Clerk AI is woken (SCHED webhook, event `monthend_needs_ai`, runbook `/workspace/tools/MONTHEND-AI.md`) only when a
  step fails after one retry, a result is unclear, or a signal is unknown.
- Remittance lines (`config.remittance.lines`, app key → portal line or `__not_remitted__`) override remit_match.py's
  `APP_KEY_TO_WEEKLY_LINE` / `UNMAPPED_APP_KEYS` on the box (patch). Money in a category with no line **holds** the month
  (David + Bro. Divine told by email and Telegram; not the AI); saving the line in the app resumes it within 5 minutes.
- Status: `/workspace/state/monthend/status.json` → `health.remittance` {handler, portal_lines, categories, hold} and the
  dashboard's Month-end card. Tests: `tests/box-monthend.test.js` (real box files against a fake /workspace of stubs).
- Newest clerkcfg.py: `box/cleanup-20260928/clerkcfg.py` (bundles are applied in order: automations-20260928 →
  monthend-20261001 → cleanup-20260928). Never re-run an older bundle's install.sh: it would put back an older clerkcfg.py.
- reminders-20260929: `tools/monthinfo.py` (read-only app status) drives the Sunday collection reminders (in
  reminders.py) and the bot's `/month`; `/status` and `/refresh` also understand months filed by the month-end run.
  App settings: automations.collection_reminders; routing type `collection_reminder` (app-side default when not saved:
  AUTOMATION_ROUTING_DEFAULTS). When adding a message type or settings block, give it an app-side default like these, or
  the next Save stores it switched off. Also add its AUTOMATION_MESSAGE_GUIDE entry (what, when, example; the page's
  "Message guide" — tests/automations-guide.test.js fails without it).
- monthclose-20260930: `tools/monthclose.py` (supervisor runs `tick` each cycle) + `tools/remita-check.cjs` (read-only
  remita.net pay-rrr lookup; status "23" = paid). Payers tap "✅ I've paid" under the RRR Telegram message (send_msg adds it
  for `rrr:` keys) or send `/paid` to the bot; PAID + checklist to everyone once; warning N days before the portal closes;
  "complete" once. App: People → title / called / pays_rrr / can_upload; settings automations.month_close; routing
  `month_close`. Newest supervisor.sh is in this bundle. `/paid` is in the bot menu (setMyCommands in the installer).
- records-20260928 (after monthclose): statement send day + Sunday records reminders. `stmt-runner.py` patched:
  `due_check()` runs `make-statement.js --check-due --today <day>` for days_after_cutoff..+catchup_days-1 back, and
  `--live --month <to[:7]>`; `boxsched.py` patched to use `sched_config.json` `statement_offset_days` (written by the new
  `clerkcfg.py` apply) so the AI back-up waits for the same day. New `monthinfo.py`: one list per Sunday, collection first,
  Monthly report from the cut-off week; weekly message (reminders.py `monday_msg`), 2nd reminder, cut-off evening, daily
  for `collection_reminders.after_days` after the cut-off; app read once per slot a day (`.monthinfo-ladder.json`).
  App: automations.statement.{days_after_cutoff,catchup_days}, collection_reminders.after_days,
  supervisor.{alert_after_hours (Worker daily check), ai_takeover_minutes (functions/_lib/month-end-events.js)}.
  Tests: tests/box-records.test.js.
- healthfix-20260928: `fix.py` removes the "Attendance watch" row from `tools/health.py` (att-watch.py was retired by
  cleanup-20260928, so the weekly health note showed it DOWN). Backup + `--undo`; tests/box-healthfix.test.js.
- cleanup-20260928 removed the hourly attendance polling: `att-watch.py` is no longer started and the scheduler's
  sched_config.json always has `"attendance": false`. Attendance is filed only by the month-end run (and Refresh attendance).

## Satellite parishes (parishes-20261003)

- App: each satellite parish (659840, 597445, 761516) has its own D1 (`SAT_<code>` in wrangler.toml); `/api/sat/<route>`
  runs Kingdom's handlers on it. Role `satellite` + `users.parish_code` (pastor login: Sunday records + Attendance only).
  The box reads a parish with its automation key + header `X-Sat-Parish: <code>` (`sat-fetch.cjs` adds it to node scripts).
  A parish's cut-off collection signal carries `satellite:true, parish` and always goes to the box (Clerk AI only if silent).
- Config: `people[].parish` marks a parish's people; `parishes[]` for satellites add `active, handler, copies, late_alert,
  portal_login (area|own), portal_username, portal_password_sealed` (RSA-OAEP-256 with the box key from health).
  `clerkcfg.people()` is Kingdom's people only (a pastor never gets Kingdom messages); `all_people()` is everyone, with
  bot-linked chat ids from `/workspace/state/satlinks.json` merged in.
- Box: `satmonthend.py` (monthend.py dispatches `satellite` signals to it) runs Kingdom's month-end in
  `/workspace/rccg-sat/<code>/{remit,att}` (localized copies of the scripts, refreshed each run); buttons are bot callbacks
  `mend|<code>|<month>|generate_rrr|refresh` and `paid|<month>|<code>`. `satclose.py` = monthclose per parish
  (state `state/monthclose-<code>.json`), `satinfo.py` = reminders (Kingdom's timings) + health, `satbot.py` = the bot for
  parish people (`/start inv_<invite>` links them; uploads fixed to their parish; /month /status /paid /help).
- Not done yet: using a parish's own portal login (the password is stored sealed; portal-api `login()` still uses the Area
  account).

## Known open items

- The repo is public and `workers/clerk-watchdog/config.js` contains people's emails and Telegram chat ids. The owner
  chose to leave it for now; don't add more personal data to the repo.
- Parish flags other than `source_docs` (attendance/remittance/statement) are informational: the box only handles
  Kingdom Parish for those. `upload_fyi`/`upload_confirmation` routing is not enforced (poller sends those directly).
