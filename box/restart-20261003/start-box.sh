#!/bin/bash
# restart-20261003: ONE command that brings the Clerk box automation up. Idempotent: safe to run any time, by a person,
# by the Clerk AI (RESTART-RUN.md) or twice in a row; it never starts a second supervisor.
#   bash /workspace/tools/start-box.sh            start the supervisor if it is not running, wait for the tree, print status
#   bash /workspace/tools/start-box.sh --status   only print status (changes nothing)
# Exit 0 = supervisor + Telegram bot running and the bot's heartbeat fresh; 1 = not healthy yet (see the lines printed).
# The supervisor then (re)starts the bot, memo runner, statement runner and Drive sync, and pings the watchdog at once.
T=/workspace/tools
D=/workspace/telegram/srcdoc
PIDF=$T/supervisor.pid
sup_pid() {
  local p; p=$(cat "$PIDF" 2>/dev/null)
  if [ -n "$p" ] && kill -0 "$p" 2>/dev/null && grep -q "supervisor.sh" "/proc/$p/cmdline" 2>/dev/null; then echo "$p"; return; fi
  # an older supervisor without a pid file: the session leader (its own subshells share the command line, not the session)
  for p in $(pgrep -f "^(/usr/bin/)?bash (/workspace/tools/)?supervisor[.]sh" 2>/dev/null); do
    [ "$(ps -o sid= -p "$p" 2>/dev/null | tr -d ' ')" = "$p" ] && { echo "$p"; return; }
  done
}
hb_age() {  # minutes since the bot's poll loop last ticked ("" when unknown)
  python3 - "$D/heartbeat.json" <<'PY' 2>/dev/null
import json, sys, datetime as dt
try:
    v = json.load(open(sys.argv[1])).get("poll_loop_at")
    print(int((dt.datetime.now().astimezone() - dt.datetime.fromisoformat(v)).total_seconds() // 60))
except Exception:
    pass
PY
}
status() {
  local p a ok=0
  p=$(sup_pid)
  if [ -n "$p" ]; then echo "supervisor: running (pid $p)"; else echo "supervisor: NOT RUNNING"; ok=1; fi
  for x in srcdoc/poller.py drive-sync.sh memo-runner.sh stmt-runner.py; do
    if pgrep -f "$x" >/dev/null; then echo "  $x: running"; else echo "  $x: not running"; [ "$x" = srcdoc/poller.py ] && ok=1; fi
  done
  a=$(hb_age)
  if [ -n "$a" ] && [ "$a" -le 15 ]; then echo "bot heartbeat: fresh ($a min ago)"; else echo "bot heartbeat: STALE (${a:-unknown} min)"; ok=1; fi
  echo "last supervisor log line: $(tail -n 1 "$T/supervisor.log" 2>/dev/null)"
  return $ok
}
if [ "${1:-}" = "--status" ]; then status; exit $?; fi
if [ -z "$(sup_pid)" ]; then
  (cd "$T" && nohup setsid bash "$T/supervisor.sh" >/dev/null 2>&1 </dev/null &)
  echo "supervisor: started"
  for _ in $(seq 1 30); do sleep 2; pgrep -f srcdoc/poller.py >/dev/null && [ -n "$(hb_age)" ] && [ "$(hb_age)" -le 15 ] && break; done
else
  echo "supervisor: already running, nothing started"
fi
status
