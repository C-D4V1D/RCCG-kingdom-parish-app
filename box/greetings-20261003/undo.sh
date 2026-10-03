#!/bin/bash
# Undo greetings-20261003: put back the three files (tools/greet.py is left; nothing uses it once the files are back).
# The reminders then greet as before: "Good morning Bro. Divine," for Kingdom Parish, the first listed person's name in a parish.
BK=/workspace/backups/greetings-20261003
for f in tools/reminders.py tools/monthinfo.py tools/satinfo.py; do
  [ -e "$BK/$f" ] && cp -p "$BK/$f" "/workspace/$f"
done
[ "${1:-}" = "--quiet" ] || echo "Put back from $BK. Nothing to restart."
