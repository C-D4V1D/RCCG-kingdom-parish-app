#!/bin/bash
# Remove the fast-check update (bankbalance-fastcheck-20261001). The Refresh button still works,
# just back to waiting up to 5 minutes (the bankbalance-20260929 update stays in place).
BK=/workspace/backups/bankbalance-fastcheck-20261001
[ -d "$BK" ] || { echo "No backup found at $BK"; exit 1; }
( cd "$BK" && find . -type f ! -name undo.sh ) | while read -r f; do
  cp -p "$BK/$f" "/workspace/${f#./}" && [ "${1:-}" != "--quiet" ] && echo "restored ${f#./}"
done
(nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)
[ "${1:-}" != "--quiet" ] && echo "UNDONE. Refresh now waits for the normal 5-minute check again."
