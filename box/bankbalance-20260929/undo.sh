#!/bin/bash
# Remove the real bank balance update (bankbalance-20260929).
BK=/workspace/backups/bankbalance-20260929
[ -d "$BK" ] || { echo "No backup found at $BK"; exit 1; }
( cd "$BK" && find . -type f ! -name undo.sh ) | while read -r f; do
  cp -p "$BK/$f" "/workspace/${f#./}" && [ "${1:-}" != "--quiet" ] && echo "restored ${f#./}"
done
rm -f /workspace/tools/bankbalance.cjs
(nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)
[ "${1:-}" != "--quiet" ] && echo "UNDONE. No more balance checks or /balance (the bot restarts with its old commands within a minute)."
