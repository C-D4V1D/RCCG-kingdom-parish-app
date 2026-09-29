#!/bin/bash
# Remove the satellite parishes update (parishes-20261003). Keeps the box key, /workspace/rccg-sat and the parish links.
BK=/workspace/backups/parishes-20261003
[ -d "$BK" ] || { echo "No backup found at $BK"; exit 1; }
( cd "$BK" && find . -type f ! -name undo.sh ) | while read -r f; do
  cp -p "$BK/$f" "/workspace/${f#./}" && [ "${1:-}" != "--quiet" ] && echo "restored ${f#./}"
done
rm -f /workspace/tools/satinfo.py /workspace/tools/satclose.py /workspace/tools/satbot.py /workspace/tools/satmonthend.py /workspace/tools/sat-fetch.cjs
pkill -f "supervisor.sh" 2>/dev/null; sleep 1
(cd /workspace/tools && nohup setsid bash /workspace/tools/supervisor.sh >/dev/null 2>&1 < /dev/null &)
(nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)
[ "${1:-}" != "--quiet" ] && echo "UNDONE. Satellite parishes are switched off again."
