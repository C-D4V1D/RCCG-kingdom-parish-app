#!/bin/bash
# Undo appbackup-20261003 (the running supervisor keeps going; it picks up the old file the next time it starts).
# The backups already made stay in /workspace/app-backups (and on Google Drive).
BK=/workspace/backups/appbackup-20261003
for f in tools/supervisor.sh; do
  [ -e "$BK/$f" ] && { cp -p "$BK/$f" "/workspace/$f.undo-tmp" && mv -f "/workspace/$f.undo-tmp" "/workspace/$f"; }
done
rm -f /workspace/tools/appbackup.py
[ "${1:-}" = "--quiet" ] || echo "Put back from $BK."
