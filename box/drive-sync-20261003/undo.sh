#!/bin/bash
# Undo drive-sync-20261003 (a running drive-sync loop keeps going; it uses the old file the next time it starts).
BK=/workspace/backups/drive-sync-20261003
for f in tools/drive-sync.sh; do
  [ -e "$BK/$f" ] && { cp -p "$BK/$f" "/workspace/$f.undo-tmp" && mv -f "/workspace/$f.undo-tmp" "/workspace/$f"; }
done
rm -f /workspace/tools/drive-sync.filter
[ "${1:-}" = "--quiet" ] || echo "Put back from $BK."
