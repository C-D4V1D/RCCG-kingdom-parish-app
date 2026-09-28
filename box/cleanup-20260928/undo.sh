#!/bin/bash
# Put back the hourly attendance checks (as before cleanup-20260928).
BK=/workspace/backups/cleanup-20260928
[ -d "$BK" ] || { echo "No backup found at $BK"; exit 1; }
( cd "$BK" && find . -type f ! -name undo.sh ) | while read -r f; do cp -p "$BK/$f" "/workspace/${f#./}" && echo "restored ${f#./}"; done
pkill -f "supervisor.sh" 2>/dev/null
pkill -f "drive-sync.sh" 2>/dev/null
(cd /workspace/tools && nohup setsid bash /workspace/tools/supervisor.sh >/dev/null 2>&1 < /dev/null &)
echo "UNDONE. The hourly attendance checks start again within 5 minutes."
