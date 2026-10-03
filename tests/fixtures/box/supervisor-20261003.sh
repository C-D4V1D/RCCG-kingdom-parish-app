#!/bin/bash
# monthclose-20260930: also runs monthclose.py tick (RRR payment check on Remita, month-close checklist).
# cleanup-20260928: att-watch.py is gone (attendance is filed with the month-end run). The settings sync and the status
# report now run before the slower jobs, which get a time limit, so the app hears from the box every 10 minutes even when
# a job is slow; a cycle slower than 2 minutes is written to the log.
# automations-20260928: also syncs the Automations settings every cycle and sends the status report with each ping.
LOG=/workspace/tools/supervisor.log
CC="python3 /workspace/tools/clerkcfg.py"
# restart-20261003: one supervisor only. Start it with: bash /workspace/tools/start-box.sh
PIDF=/workspace/tools/supervisor.pid
OLD=$(cat "$PIDF" 2>/dev/null)
if [ -n "$OLD" ] && [ "$OLD" != "$$" ] && kill -0 "$OLD" 2>/dev/null && grep -q supervisor.sh "/proc/$OLD/cmdline" 2>/dev/null; then
  echo "$(date '+%F %H:%M') supervisor already running (pid $OLD); this copy exits" >> "$LOG"; exit 0
fi
echo $$ > "$PIDF"
echo "$(date '+%F %H:%M') supervisor start pid $$" >> "$LOG"
up() { pgrep -f "$1" >/dev/null || { echo "$(date '+%F %H:%M') $1 down -> restart" >> "$LOG"; eval "$2"; }; }
oldping() {
  TOK=$(cat /workspace/.secrets/watchdog-token 2>/dev/null)
  [ -n "$TOK" ] && curl -sf -m 20 -A "Mozilla/5.0 clerk-supervisor" -X POST -H "x-watchdog-token: $TOK" https://clerk-watchdog.decan-inv.workers.dev/ping >/dev/null
}
N=0
FAILS=0
botcheck() {  # restart-20261003: the bot process is up but its loop has stopped: restart it, max once an hour
  # Automations > Box connection: bot_hung_restart_minutes (default 30; 0 = never)
  local A P E LIM M=/workspace/tools/.bot-hung-restart
  LIM=$($CC int automations.supervisor.bot_hung_restart_minutes 30 0 2>/dev/null); LIM=${LIM:-30}
  [ "$LIM" -gt 0 ] 2>/dev/null || return 0
  P=$(cat /workspace/telegram/srcdoc/poller.pid 2>/dev/null); E=$(ps -o etimes= -p "${P:-0}" 2>/dev/null | tr -d ' ')
  [ -n "$E" ] && [ "$E" -gt 900 ] || return 0  # only a bot that has been up for 15+ minutes
  A=$(python3 -c "import json,datetime as d;v=json.load(open('/workspace/telegram/srcdoc/heartbeat.json')).get('poll_loop_at');print(int((d.datetime.now().astimezone()-d.datetime.fromisoformat(v)).total_seconds()//60))" 2>/dev/null)
  [ -n "$A" ] && [ "$A" -gt "$LIM" ] || return 0
  [ -f "$M" ] && [ $(( $(date +%s) - $(stat -c %Y "$M") )) -lt 3600 ] && return 0
  touch "$M"; echo "$(date '+%F %H:%M') bot heartbeat ${A} min old -> restart" >> "$LOG"
  (nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >> "$LOG" 2>&1 </dev/null &)
}
while true; do
  T0=$(date +%s)
  up "srcdoc/poller.py" 'bash /workspace/telegram/srcdoc/ensure_running.sh >> "$LOG" 2>&1'
  up "drive-sync.sh"    '(cd /workspace/tools && nohup ./drive-sync.sh >/dev/null 2>&1 &)'
  up "memo-runner.sh"   '(cd /workspace/rccg-memos && nohup ./memo-runner.sh >/dev/null 2>&1 &)'
  up "stmt-runner.py"    '(nohup python3 /workspace/tools/stmt-runner.py >/dev/null 2>&1 &)'
  botcheck
  timeout 120 $CC sync >>"$LOG" 2>&1
  EVERY=$($CC int automations.supervisor.ping_every_cycles 2 1 2>/dev/null); EVERY=${EVERY:-2}
  if [ "$FAILS" -gt 0 ] || [ $((N % EVERY)) -eq 0 ]; then  # restart-20261003: after a failed ping, ping every cycle
    if timeout 120 $CC ping >>"$LOG" 2>&1 || oldping; then
      [ "$FAILS" -gt 0 ] && echo "$(date '+%F %H:%M') connection to the watchdog back (after $FAILS failed pings)" >> "$LOG"
      FAILS=0
    else
      FAILS=$((FAILS+1))
      [ "$FAILS" -eq 1 ] && echo "$(date '+%F %H:%M') ping failed: lost connection to the watchdog; retrying every cycle" >> "$LOG"
    fi
  fi
  timeout 240 python3 /workspace/tools/health.py >/dev/null 2>&1 || [ $? -ne 124 ] || echo "$(date '+%F %H:%M') health.py took over 4 minutes (stopped)" >> "$LOG"
  timeout 240 python3 /workspace/tools/reminders.py >/dev/null 2>&1 || [ $? -ne 124 ] || echo "$(date '+%F %H:%M') reminders.py took over 4 minutes (stopped)" >> "$LOG"
  [ -f /workspace/tools/monthclose.py ] && { timeout 600 python3 /workspace/tools/monthclose.py tick >/dev/null 2>&1 || [ $? -ne 124 ] || echo "$(date '+%F %H:%M') monthclose.py took over 10 minutes (stopped)" >> "$LOG"; }
  [ -f /workspace/tools/satclose.py ] && { timeout 600 python3 /workspace/tools/satclose.py tick >/dev/null 2>&1 || [ $? -ne 124 ] || echo "$(date '+%F %H:%M') satclose.py took over 10 minutes (stopped)" >> "$LOG"; }  # parishes-20261003
  [ -f /workspace/tools/satinfo.py ] && { timeout 300 python3 /workspace/tools/satinfo.py tick >/dev/null 2>&1 || [ $? -ne 124 ] || echo "$(date '+%F %H:%M') satinfo.py took over 5 minutes (stopped)" >> "$LOG"; }
  D=$(( $(date +%s) - T0 )); [ "$D" -gt 120 ] && echo "$(date '+%F %H:%M') slow cycle: ${D}s" >> "$LOG"
  N=$((N+1))
  S=$($CC int automations.supervisor.interval_seconds 300 60 2>/dev/null); S=${S:-300}
  if [ "$FAILS" -ge 1 ] && [ "$FAILS" -le 3 ]; then B=$((60 << (FAILS - 1))); [ "$B" -lt "$S" ] && S=$B; fi  # 60, 120, 240 s
  sleep "$S"
done
# parishes-20261003
