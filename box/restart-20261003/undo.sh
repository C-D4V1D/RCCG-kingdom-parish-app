#!/bin/bash
# Undo restart-20261003 (the running supervisor keeps going; it picks up the old file the next time it starts).
BK=/workspace/backups/restart-20261003
for f in tools/supervisor.sh telegram/srcdoc/WAKE-RUN.md; do
  [ -e "$BK/$f" ] && { cp -p "$BK/$f" "/workspace/$f.undo-tmp" && mv -f "/workspace/$f.undo-tmp" "/workspace/$f"; }
done
rm -f /workspace/tools/start-box.sh /workspace/telegram/srcdoc/RESTART-RUN.md
[ "${1:-}" = "--quiet" ] || echo "Put back from $BK."
