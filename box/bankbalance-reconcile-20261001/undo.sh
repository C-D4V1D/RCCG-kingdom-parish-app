#!/bin/bash
# Remove dynamic balance-check times (bankbalance-reconcile-20261001).
BK=/workspace/backups/bankbalance-reconcile-20261001
[ -d "$BK" ] || { echo "No backup found at $BK"; exit 1; }
( cd "$BK" && find . -type f ! -name undo.sh ) | while read -r f; do
  cp -p "$BK/$f" "/workspace/${f#./}" && [ "${1:-}" != "--quiet" ] && echo "restored ${f#./}"
done
[ "${1:-}" != "--quiet" ] && echo "UNDONE. Balance checks reverted to fixed times (07:00, 19:00) within the next 5-minute sync cycle."
