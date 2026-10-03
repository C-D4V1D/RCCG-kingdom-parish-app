#!/usr/bin/env python3
"""restart-20261003: supervisor.sh self-healing + the box_down section in WAKE-RUN.md.

  python3 patch.py --check   only check (changes nothing)
  python3 patch.py           apply (files with the marker are skipped; each block must match exactly once)

supervisor.sh:
  - one supervisor only (supervisor.pid): a second copy exits at once;
  - a failed ping is retried every cycle with a shorter wait (60 s, 120 s, 240 s, then the normal interval), and
    "lost connection" / "connection back" is written once to supervisor.log (it never stops on a lost connection);
  - the fallback ping uses curl -f, so an HTTP error counts as a failed ping;
  - a bot whose process is up but whose heartbeat is older than Automations bot_hung_restart_minutes (default 30,
    0 = never) is restarted (ensure_running.sh --restart, which refuses mid-upload), at most once an hour.
WAKE-RUN.md: event = box_down -> RESTART-RUN.md.
Files are replaced atomically (new file + rename), so a supervisor that is running keeps its loop.
"""
import os, sys

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "restart-20261003"
CHANGES = {
"tools/supervisor.sh": [
('''CC="python3 /workspace/tools/clerkcfg.py"
''',
'''CC="python3 /workspace/tools/clerkcfg.py"
# restart-20261003: one supervisor only. Start it with: bash /workspace/tools/start-box.sh
PIDF=/workspace/tools/supervisor.pid
OLD=$(cat "$PIDF" 2>/dev/null)
if [ -n "$OLD" ] && [ "$OLD" != "$$" ] && kill -0 "$OLD" 2>/dev/null && grep -q supervisor.sh "/proc/$OLD/cmdline" 2>/dev/null; then
  echo "$(date '+%F %H:%M') supervisor already running (pid $OLD); this copy exits" >> "$LOG"; exit 0
fi
echo $$ > "$PIDF"
echo "$(date '+%F %H:%M') supervisor start pid $$" >> "$LOG"
'''),
('''  [ -n "$TOK" ] && curl -s -m 20 -A''', '''  [ -n "$TOK" ] && curl -sf -m 20 -A'''),
('''N=0
while true; do
''',
'''N=0
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
'''),
('''  up "stmt-runner.py"    '(nohup python3 /workspace/tools/stmt-runner.py >/dev/null 2>&1 &)'
''',
'''  up "stmt-runner.py"    '(nohup python3 /workspace/tools/stmt-runner.py >/dev/null 2>&1 &)'
  botcheck
'''),
('''  if [ $((N % EVERY)) -eq 0 ]; then
    timeout 120 $CC ping >>"$LOG" 2>&1 || oldping || echo "$(date '+%F %H:%M') ping failed" >> "$LOG"
  fi
''',
'''  if [ "$FAILS" -gt 0 ] || [ $((N % EVERY)) -eq 0 ]; then  # restart-20261003: after a failed ping, ping every cycle
    if timeout 120 $CC ping >>"$LOG" 2>&1 || oldping; then
      [ "$FAILS" -gt 0 ] && echo "$(date '+%F %H:%M') connection to the watchdog back (after $FAILS failed pings)" >> "$LOG"
      FAILS=0
    else
      FAILS=$((FAILS+1))
      [ "$FAILS" -eq 1 ] && echo "$(date '+%F %H:%M') ping failed: lost connection to the watchdog; retrying every cycle" >> "$LOG"
    fi
  fi
'''),
('''  S=$($CC int automations.supervisor.interval_seconds 300 60 2>/dev/null); sleep "${S:-300}"
''',
'''  S=$($CC int automations.supervisor.interval_seconds 300 60 2>/dev/null); S=${S:-300}
  if [ "$FAILS" -ge 1 ] && [ "$FAILS" -le 3 ]; then B=$((60 << (FAILS - 1))); [ "$B" -lt "$S" ] && S=$B; fi  # 60, 120, 240 s
  sleep "$S"
'''),
],
"telegram/srcdoc/WAKE-RUN.md": [
('''## event = new_memo
''',
'''## event = box_down (restart-20261003)
Sent by the clerk-watchdog Worker (not the scheduler) when the box has stopped pinging. Follow
`/workspace/telegram/srcdoc/RESTART-RUN.md` exactly; it is short. Stay silent when the restart works.

## event = new_memo
'''),
],
}


def main():
    check = "--check" in sys.argv
    plan = {}
    for rel, reps in CHANGES.items():
        path = os.path.join(ROOT, rel)
        s = open(path, encoding="utf-8").read()
        if MARK in s:
            print(f"   {rel}: already patched"); continue
        for old, new in reps:
            n = s.count(old)
            if n != 1:
                sys.exit(f"STOP: {rel}: a block to change was found {n} times (expected 1): {old.strip().splitlines()[0][:80]}")
            s = s.replace(old, new)
        plan[path] = s
        print(f"   {rel}: {len(reps)} change(s) {'would apply' if check else 'ready'}")
    if check:
        return
    for path, s in plan.items():
        tmp = path + ".tmp-" + MARK
        open(tmp, "w", encoding="utf-8").write(s)
        os.chmod(tmp, os.stat(path).st_mode)
        os.replace(tmp, path)
        print(f"   patched {os.path.relpath(path, ROOT)}")


if __name__ == "__main__":
    main()
