#!/bin/bash
# Undo botmenu-20261003: put back the old single (/) menu, then the patched files, then restart the bot.
# tools/botmenu.py and /workspace/state/botmenu*.json are left; nothing uses them once the files are back.
BK=/workspace/backups/botmenu-20261003
if [ -e /workspace/state/botmenu.json ] && [ -e /workspace/tools/botmenu.py ]; then
  python3 /workspace/tools/botmenu.py reset 2>&1 | sed 's/^/   /' || echo "   note: the old menu could not be put back in Telegram (the commands still work if typed)."
fi
for f in tools/clerkcfg.py tools/monthinfo.py tools/clerkinfo.py tools/satinfo.py tools/satbot.py telegram/srcdoc/poller.py; do
  [ -e "$BK/$f" ] && cp -p "$BK/$f" "/workspace/$f"
done
if [ "${1:-}" != "--quiet" ]; then
  (nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)
  echo "Put back from $BK. The Telegram bot is restarting with its old code."
fi
