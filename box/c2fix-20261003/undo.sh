#!/bin/bash
# Undo c2fix-20261003: put back the five patched files from the backup.
BK=/workspace/backups/c2fix-20261003
for f in tools/clerkcfg.py tools/mailer.py tools/monthend.py telegram/send_msg.py rccg-remit/make-check-email.py; do
  [ -e "$BK/$f" ] && cp -p "$BK/$f" "/workspace/$f"
done
[ "${1:-}" = "--quiet" ] || echo "Put back from $BK."
