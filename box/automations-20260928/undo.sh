#!/bin/bash
# Put the Clerk box back exactly as it was before the Automations update.
BK=/workspace/backups/automations-20260928
[ -d "$BK" ] || { echo "No backup found at $BK"; exit 1; }
pkill -f "supervisor.sh" 2>/dev/null
( cd "$BK" && find . -type f ! -name undo.sh ! -name .no-sched-config ) | while read -r f; do
  cp -p "$BK/$f" "/workspace/${f#./}" && [ "${1:-}" != "--quiet" ] && echo "restored ${f#./}"
done
[ -e "$BK/.no-sched-config" ] && rm -f /workspace/telegram/srcdoc/sched_config.json
rm -f /workspace/tools/clerkcfg.py
for p in memo-runner.sh stmt-runner.py att-watch.py drive-sync.sh; do pkill -f "$p" 2>/dev/null; done
bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1
(cd /workspace/tools && nohup setsid bash /workspace/tools/supervisor.sh >/dev/null 2>&1 < /dev/null &)
[ "${1:-}" != "--quiet" ] && echo "UNDONE. The box is back to its old scripts (they restart within 5 minutes)."
