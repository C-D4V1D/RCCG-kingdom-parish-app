# RESTART-RUN: the Clerk box went quiet (event = box_down)

The clerk-watchdog Worker sends this through the "Box scheduler wake" webhook when Automations > Box connection
"Wake the Clerk AI to restart a silent box" is on and the box has not pinged for the minutes set there (default 40).
`details` = {last_ping, silent_minutes, attempt, max_attempts}.
Usual cause: the box restarted or moved, which stops everything (there is no autostart on the box). Times are UK.
Never print secrets. Do not send emails. Do not run any month-end, statement or portal script by hand.

1. Run: `bash /workspace/tools/start-box.sh`
   It starts the supervisor only if none is running (never twice), waits up to a minute, then prints the status.
   The supervisor starts the bot, memo runner, statement runner and Drive sync, and pings the watchdog straight away.
2. Exit 0 ("bot heartbeat: fresh"): **done. Stay silent**: no message to anyone. The watchdog sees the ping and
   David is not alerted.
3. Exit 1: wait 2 minutes, then run `bash /workspace/tools/start-box.sh --status` once more.
   - Now healthy: done, stay silent.
   - Still not healthy: read the last 20 lines of `/workspace/tools/supervisor.log` and `/workspace/telegram/srcdoc/poller.log`.
     Fix only an obvious start problem (e.g. a missing folder); never edit the automation code.
     If it still isn't healthy, tell David on Telegram, once:
     `python3 /workspace/telegram/send_msg.py david "⚠️ The Clerk box was down and I could not restart it: <one-line reason>. Run: bash /workspace/tools/start-box.sh"`
     If Telegram fails too, say so in your final reply and stop.
4. Nothing else. Pending memos, statements and reminders catch up by themselves once the supervisor runs.
