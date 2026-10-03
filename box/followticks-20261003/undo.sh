#!/bin/bash
# Undo followticks-20261003: put back clerkcfg.py, reminders.py, boxsched.py and sched_config.json, then restart the bot.
BK=/workspace/backups/followticks-20261003
for f in tools/clerkcfg.py tools/reminders.py telegram/srcdoc/boxsched.py telegram/srcdoc/sched_config.json; do
  [ -e "$BK/$f" ] && cp -p "$BK/$f" "/workspace/$f"
done
if [ "${1:-}" != "--quiet" ]; then
  (nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)
  echo "Put back from $BK. The Telegram bot and scheduler are restarting with their old code."
fi
