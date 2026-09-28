#!/bin/bash
# Remove the collection reminders and /month (reminders-20260929).
BK=/workspace/backups/reminders-20260929
[ -d "$BK" ] || { echo "No backup found at $BK"; exit 1; }
( cd "$BK" && find . -type f ! -name undo.sh ) | while read -r f; do
  cp -p "$BK/$f" "/workspace/${f#./}" && [ "${1:-}" != "--quiet" ] && echo "restored ${f#./}"
done
rm -f /workspace/tools/monthinfo.py /workspace/tools/.monthinfo-cache.json
(nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)
[ "${1:-}" != "--quiet" ] && echo "UNDONE. The bot restarts with its old commands within a minute."
