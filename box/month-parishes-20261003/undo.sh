#!/bin/bash
# Undo month-parishes-20261003: put back the bot's file, then restart the bot. tools/monthpick.py is left; nothing uses it
# once poller.py is back. /month then shows Kingdom Parish only, for everyone, as before.
BK=/workspace/backups/month-parishes-20261003
for f in telegram/srcdoc/poller.py; do
  [ -e "$BK/$f" ] && cp -p "$BK/$f" "/workspace/$f"
done
if [ "${1:-}" != "--quiet" ]; then
  (nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)
  echo "Put back from $BK. The Telegram bot is restarting with its old code."
fi
