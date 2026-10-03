# restart-20261003: the box comes back on its own

**The problem (audit 2026-10-03, H1).** Nothing on the box survives a restart or a move. There is no cron, no systemd,
and the desktop session runs no user autostart. After the move on 2 Oct everything stayed down until someone started
`supervisor.sh` by hand.

**What this adds.**
1. `tools/start-box.sh`: one idempotent command. It starts the supervisor if none is running and never starts a second
   one. It then waits for the bot heartbeat and prints the status (exit 0 = healthy). `--status` only reports.
2. `supervisor.sh` self-healing:
   - one copy only (`supervisor.pid`);
   - a failed ping is retried every cycle with a shorter wait (60 / 120 / 240 s), with "lost connection" and
     "connection back" written once each to `supervisor.log`. A lost connection never stops it;
   - the fallback curl ping counts HTTP errors as failures;
   - a bot that is running but whose heartbeat is older than Automations `bot_hung_restart_minutes` (default 30,
     0 = never) is restarted, at most once an hour. This uses `ensure_running.sh --restart`, which refuses while an
     upload is in progress.
3. `telegram/srcdoc/RESTART-RUN.md` + a `box_down` section in `WAKE-RUN.md`: what the Clerk AI does when the
   clerk-watchdog Worker wakes it. It runs `start-box.sh`, stays silent if that works, and tells David once if it can't fix it.
4. `workers/clerk-watchdog` (same PR):
   - the Worker cron runs every 15 minutes;
   - only when Automations > Box connection `restart_wake` is on (default **off**): once the box has been silent for
     `restart_wake_minutes` (default 40), the Worker POSTs `{event: "box_down", ...}` to the "Box scheduler wake"
     webhook. That needs the Worker secrets `SCHED_WEBHOOK_URL` and `SCHED_WEBHOOK_KEY`;
   - it tries again every `restart_wake_repeat_hours` (default 3), at most `restart_wake_max` (default 3) times per silence;
   - the direct Telegram box-down alert to David (after "alert after hours") is unchanged.

**Install on the box:** `bash install.sh --check`, then `bash install.sh`. It restarts only the supervisor; the bot and
runners keep running. To undo: `bash /workspace/backups/restart-20261003/undo.sh`.
