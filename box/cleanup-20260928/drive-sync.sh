#!/bin/sh
# cleanup-20260928: also skip ".venv" folders (a Python environment is thousands of small files: one pass took hours) and
# links; record every finished pass (.last-sync on success, .sync-error with the exit code otherwise) so the dashboard
# no longer freezes on the last fully clean pass.
while true; do
  /workspace/tools/rclone --config /workspace/.secrets/rclone.conf sync /workspace "gdrive:Clerk Box/workspace" \
    --backup-dir "gdrive:Clerk Box/_replaced" --suffix "-$(date +%Y%m%d-%H%M)" \
    --exclude "venv*/**" --exclude ".venv*/**" --exclude "node_modules/**" --exclude "__pycache__/**" --exclude ".git/**" \
    --exclude ".secrets/**" --exclude "heartbeat.json" --exclude "*.lock" --exclude "*.pid" --exclude "nohup.out" --exclude "tools/rclone" --exclude "tools/*.log" --exclude "tools/.*" \
    --exclude "state/monthend/lock" --exclude "*.tmp" --skip-links \
    --log-file /workspace/tools/drive-sync.log --log-level NOTICE
  RC=$?
  if [ "$RC" -eq 0 ]; then
    date '+%F %H:%M' > /workspace/tools/.last-sync; rm -f /workspace/tools/.sync-error
  else
    echo "$(date '+%F %H:%M') $RC" > /workspace/tools/.sync-error
  fi
  M=$(python3 /workspace/tools/clerkcfg.py int automations.drive_sync.interval_minutes 10 1 2>/dev/null)  # automations-20260928
  sleep $(( ${M:-10} * 60 ))
done
# automations-20260928
# cleanup-20260928
