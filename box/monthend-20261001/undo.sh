#!/bin/bash
# Put the Clerk box back as it was before the month-end update (2026-10-01).
BK=/workspace/backups/monthend-20261001
[ -d "$BK" ] || { echo "No backup found at $BK"; exit 1; }
( cd "$BK" && find . -type f ! -name undo.sh ) | while read -r f; do
  cp -p "$BK/$f" "/workspace/${f#./}" && [ "${1:-}" != "--quiet" ] && echo "restored ${f#./}"
done
rm -f /workspace/tools/monthend.py /workspace/tools/MONTHEND-AI.md
[ "${1:-}" != "--quiet" ] && echo "UNDONE. The month-end runner is removed. In the app, set Automations -> Settings -> Remittance (month-end) -> Month-end run by: Clerk AI."
