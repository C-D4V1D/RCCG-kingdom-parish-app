#!/bin/bash
# Undo m2fix-20261003: put back the two patched files from the backup.
BK=/workspace/backups/m2fix-20261003
for f in tools/mailer.py tools/monthend.py; do
  [ -e "$BK/$f" ] && cp -p "$BK/$f" "/workspace/$f"
done
[ "${1:-}" = "--quiet" ] || echo "Put back from $BK."
