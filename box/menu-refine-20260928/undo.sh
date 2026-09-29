#!/bin/bash
# Undo the Telegram bot menu refinements (menu-refine-20260928).
BK=/workspace/backups/menu-refine-20260928
[ -d "$BK" ] || { echo "No backup found at $BK"; exit 1; }
( cd "$BK" && find . -type f ! -name undo.sh ) | while read -r f; do
  cp -p "$BK/$f" "/workspace/${f#./}" && [ "${1:-}" != "--quiet" ] && echo "restored ${f#./}"
done
(nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)
[ "${1:-}" != "--quiet" ] && echo "UNDONE. The bot restarts with its old commands and menu within a minute. Note: the Telegram (/) menu itself is not restored automatically -- tell Claude if you need /paid and /cancel put back in it."
