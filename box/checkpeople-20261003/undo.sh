#!/bin/bash
# Undo checkpeople-20261003: put back the four patched files from the backup.
BK=/workspace/backups/checkpeople-20261003
for f in tools/clerkcfg.py tools/monthend.py telegram/tg_msgs.py rccg-remit/make-check-email.py; do
  [ -e "$BK/$f" ] && cp -p "$BK/$f" "/workspace/$f"
done
[ "${1:-}" = "--quiet" ] || echo "Put back from $BK."
