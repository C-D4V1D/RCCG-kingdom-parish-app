#!/bin/bash
# Remove the statement send day + Sunday records reminders update (records-20260928).
BK=/workspace/backups/records-20260928
[ -d "$BK" ] || { echo "No backup found at $BK"; exit 1; }
( cd "$BK" && find . -type f ! -name undo.sh ) | while read -r f; do
  cp -p "$BK/$f" "/workspace/${f#./}" && [ "${1:-}" != "--quiet" ] && echo "restored ${f#./}"
done
rm -f /workspace/tools/.monthinfo-cache.json /workspace/tools/.monthinfo-ladder.json
pkill -f "stmt-runner.py" 2>/dev/null; sleep 1
(nohup setsid python3 /workspace/tools/stmt-runner.py >/dev/null 2>&1 < /dev/null &)
(nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)
[ "${1:-}" != "--quiet" ] && echo "UNDONE. The old reminders and the Monday statement are back."
