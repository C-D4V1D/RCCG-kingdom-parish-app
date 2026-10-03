#!/bin/bash
# Undo srcdocinfo-20261003: put back the five files, then restart the bot. tools/srcdocinfo.py, tools/portal-month.cjs
# and state/srcdocinfo-cache.json are left; nothing uses them once the files are back.
BK=/workspace/backups/srcdocinfo-20261003
for f in tools/monthinfo.py tools/satinfo.py tools/satbot.py tools/monthpick.py telegram/srcdoc/poller.py; do
  [ -e "$BK/$f" ] && cp -p "$BK/$f" "/workspace/$f"
done
if [ "${1:-}" != "--quiet" ]; then
  (nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)
  echo "Put back from $BK. The Telegram bot is restarting with its old code."
fi
