#!/bin/bash
# Remove the month-close update (monthclose-20260930).
BK=/workspace/backups/monthclose-20260930
[ -d "$BK" ] || { echo "No backup found at $BK"; exit 1; }
( cd "$BK" && find . -type f ! -name undo.sh ) | while read -r f; do
  cp -p "$BK/$f" "/workspace/${f#./}" && [ "${1:-}" != "--quiet" ] && echo "restored ${f#./}"
done
rm -f /workspace/tools/monthclose.py /workspace/tools/remita-check.cjs
pkill -f "supervisor.sh" 2>/dev/null; sleep 1
(cd /workspace/tools && nohup setsid bash /workspace/tools/supervisor.sh >/dev/null 2>&1 < /dev/null &)
(nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)
[ "${1:-}" != "--quiet" ] && echo "UNDONE. No more payment checks or month-close messages."
