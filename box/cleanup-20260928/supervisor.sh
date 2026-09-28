#!/bin/bash
# cleanup-20260928: att-watch.py is gone (attendance is filed with the month-end run). The settings sync and the status
# report now run before the slower jobs, which get a time limit, so the app hears from the box every 10 minutes even when
# a job is slow; a cycle slower than 2 minutes is written to the log.
# automations-20260928: also syncs the Automations settings every cycle and sends the status report with each ping.
LOG=/workspace/tools/supervisor.log
CC="python3 /workspace/tools/clerkcfg.py"
up() { pgrep -f "$1" >/dev/null || { echo "$(date '+%F %H:%M') $1 down -> restart" >> "$LOG"; eval "$2"; }; }
oldping() {
  TOK=$(cat /workspace/.secrets/watchdog-token 2>/dev/null)
  [ -n "$TOK" ] && curl -s -m 20 -A "Mozilla/5.0 clerk-supervisor" -X POST -H "x-watchdog-token: $TOK" https://clerk-watchdog.decan-inv.workers.dev/ping >/dev/null
}
N=0
while true; do
  T0=$(date +%s)
  up "srcdoc/poller.py" 'bash /workspace/telegram/srcdoc/ensure_running.sh >> "$LOG" 2>&1'
  up "drive-sync.sh"    '(cd /workspace/tools && nohup ./drive-sync.sh >/dev/null 2>&1 &)'
  up "memo-runner.sh"   '(cd /workspace/rccg-memos && nohup ./memo-runner.sh >/dev/null 2>&1 &)'
  up "stmt-runner.py"    '(nohup python3 /workspace/tools/stmt-runner.py >/dev/null 2>&1 &)'
  timeout 120 $CC sync >>"$LOG" 2>&1
  EVERY=$($CC int automations.supervisor.ping_every_cycles 2 1 2>/dev/null); EVERY=${EVERY:-2}
  if [ $((N % EVERY)) -eq 0 ]; then
    timeout 120 $CC ping >>"$LOG" 2>&1 || oldping || echo "$(date '+%F %H:%M') ping failed" >> "$LOG"
  fi
  timeout 240 python3 /workspace/tools/health.py >/dev/null 2>&1 || [ $? -ne 124 ] || echo "$(date '+%F %H:%M') health.py took over 4 minutes (stopped)" >> "$LOG"
  timeout 240 python3 /workspace/tools/reminders.py >/dev/null 2>&1 || [ $? -ne 124 ] || echo "$(date '+%F %H:%M') reminders.py took over 4 minutes (stopped)" >> "$LOG"
  D=$(( $(date +%s) - T0 )); [ "$D" -gt 120 ] && echo "$(date '+%F %H:%M') slow cycle: ${D}s" >> "$LOG"
  N=$((N+1))
  S=$($CC int automations.supervisor.interval_seconds 300 60 2>/dev/null); sleep "${S:-300}"
done
