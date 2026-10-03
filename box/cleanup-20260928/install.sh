#!/bin/bash
# Clerk box: stop the hourly attendance checks and the "not ready" reminders (2026-09-28).
# Attendance is filed with the month-end run (Clerk AI now, or the Clerk box's monthend.py), which the app only starts
# once every week's attendance and the Monthly report are in, so the separate hourly polling is no longer needed.
# Also: the app's Remittance lines list shows the real portal lines, and the Attendance card shows the month-end result;
# drive sync skips Python environments (.venv) and links; the status report goes out before the slower jobs.
#   bash install.sh           install (backs up first; safe to run twice)
#   bash install.sh --check   only check; changes nothing
set -u
# RETIRED (2026-10-03): superseded by newer installers; see box/INSTALL-ORDER.md. Kept for history only.
if [ "${FORCE_OLD_INSTALLER:-}" != 1 ]; then
  cat <<'RETIRED'
STOPPED: cleanup-20260928 has been replaced by newer installers. Nothing was changed.
Running it again would put back an OLDER copy of tools/clerkcfg.py and tools/supervisor.sh
and undo newer fixes. The Clerk box already has everything this installer did.

Nothing to do on a working box. Only to build a fresh box from scratch, follow box/INSTALL-ORDER.md
and run these, in this order (this one is step 3):
    1. box/automations-20260928/  (FORCE_OLD_INSTALLER=1 bash install.sh)
    2. box/monthend-20261001/  (FORCE_OLD_INSTALLER=1 bash install.sh)
    3. box/cleanup-20260928/  (FORCE_OLD_INSTALLER=1 bash install.sh)
    4. box/healthfix-20260928/  (python3 fix.py)
    5. box/reminders-20260929/  (FORCE_OLD_INSTALLER=1 bash install.sh)
    6. box/monthclose-20260930/  (FORCE_OLD_INSTALLER=1 bash install.sh)
    7. box/records-20260928/  (FORCE_OLD_INSTALLER=1 bash install.sh)
    8. box/menu-refine-20260928/  (FORCE_OLD_INSTALLER=1 bash install.sh)
    9. box/bankbalance-20260929/  (bash install.sh)
   10. box/bankbalance-fastcheck-20261001/  (bash install.sh)
   11. box/parishes-20261003/  (bash install.sh)
   12. box/bankbalance-reconcile-20261001/  (bash install.sh)
   13. box/restart-20261003/  (bash install.sh)
   14. box/appbackup-20261003/  (bash install.sh)
   15. box/c2fix-20261003/  (bash install.sh)
   16. box/checkpeople-20261003/  (bash install.sh)
   17. box/m2fix-20261003/  (bash install.sh)
   18. box/sentlog-20261003/  (bash install.sh)
For a fresh build only: FORCE_OLD_INSTALLER=1 bash install.sh
RETIRED
  exit 1
fi
_retired_warn() { printf '
WARNING: FORCE_OLD_INSTALLER=1: cleanup-20260928 is retired; it %s OLD files.
' "$1"; cat <<'RETIRED'
Afterwards re-run these newer installers, in this order (box/INSTALL-ORDER.md):
   - box/monthclose-20260930/  (FORCE_OLD_INSTALLER=1)
   - box/records-20260928/  (FORCE_OLD_INSTALLER=1)
   - box/menu-refine-20260928/  (FORCE_OLD_INSTALLER=1)
   - box/bankbalance-20260929/
   - box/bankbalance-fastcheck-20261001/
   - box/parishes-20261003/
   - box/bankbalance-reconcile-20261001/
   - box/restart-20261003/
   - box/appbackup-20261003/
   - box/c2fix-20261003/
   - box/checkpeople-20261003/
RETIRED
}
_retired_warn "will put back"; trap '_retired_warn "has put back"' EXIT
HERE=$(cd "$(dirname "$0")" && pwd)
BK=/workspace/backups/cleanup-20260928
FILES="tools/clerkcfg.py tools/supervisor.sh tools/drive-sync.sh telegram/srcdoc/sched_config.json"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/5 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/clerkcfg.py" || fail "clerkcfg.py is damaged. Download it again."
bash -n "$HERE/supervisor.sh" || fail "supervisor.sh is damaged. Download it again."
sh -n "$HERE/drive-sync.sh" || fail "drive-sync.sh is damaged. Download it again."
[ -f /workspace/tools/monthend.py ] || fail "the month-end update (monthend-20261001) is not installed on this box yet."
say "   supervisor running: $(pgrep -f supervisor.sh >/dev/null && echo yes || echo NO)"
say "   drive sync running: $(pgrep -f drive-sync.sh >/dev/null && echo yes || echo NO)"
say "   last supervisor log lines:"; tail -n 3 /workspace/tools/supervisor.log 2>/dev/null | sed 's/^/     /'
say "   last drive-sync log lines:"; tail -n 3 /workspace/tools/drive-sync.log 2>/dev/null | cut -c1-160 | sed 's/^/     /'
say "   last drive-sync errors:"; grep -E "ERROR|Failed" /workspace/tools/drive-sync.log 2>/dev/null | tail -n 3 | cut -c1-160 | sed 's/^/     /'
if [ "${1:-}" = "--check" ]; then say ""; say "CHECK OK. Run it again without --check to install."; exit 0; fi

H=$(date +%H%M)
if [ "$H" -ge 0725 ] && [ "$H" -le 0905 ] && [ "${FORCE:-}" != 1 ]; then
  fail "it's between 07:25 and 09:05, when the statement and memo checks run. Try again after 09:05 (or run: FORCE=1 bash $0)."
fi

say "== 2/5 Backing up to $BK"
mkdir -p "$BK"
for f in $FILES; do
  if [ -e "/workspace/$f" ] && [ ! -e "$BK/$f" ]; then mkdir -p "$BK/$(dirname "$f")"; cp -p "/workspace/$f" "$BK/$f"; fi
done
cp "$HERE/undo.sh" "$BK/undo.sh"

say "== 3/5 Installing"
install -m 755 "$HERE/clerkcfg.py" /workspace/tools/clerkcfg.py
install -m 755 "$HERE/supervisor.sh" /workspace/tools/supervisor.sh
install -m 755 "$HERE/drive-sync.sh" /workspace/tools/drive-sync.sh
python3 /workspace/tools/clerkcfg.py apply
python3 -c "import json; print('   scheduler attendance polling:', 'ON' if json.load(open('/workspace/telegram/srcdoc/sched_config.json')).get('attendance') else 'off')" 2>/dev/null

say "== 4/5 Restarting"
pkill -f "att-watch.py" 2>/dev/null
pkill -f "supervisor.sh" 2>/dev/null
pkill -f "drive-sync.sh" 2>/dev/null
pkill -f "rclone --config /workspace/.secrets/rclone.conf sync" 2>/dev/null  # the next pass picks up where it stopped
sleep 1
(cd /workspace/tools && nohup setsid bash /workspace/tools/supervisor.sh >/dev/null 2>&1 < /dev/null &)
# (the scheduler inside the upload bot re-reads sched_config.json every minute: no restart needed)
sleep 8
for p in supervisor.sh srcdoc/poller.py memo-runner.sh stmt-runner.py drive-sync.sh; do
  if pgrep -f "$p" >/dev/null; then say "   running: $p"; else say "   NOT running yet: $p (the supervisor starts it within 5 minutes)"; fi
done
pgrep -f att-watch.py >/dev/null && say "   WARNING: att-watch.py is still running" || say "   stopped: att-watch.py (hourly attendance checks)"

say "== 5/5 Sending a status report to the app"
python3 /workspace/tools/clerkcfg.py ping && say "   sent."
say ""
say "DONE. Backup: $BK"
say "To undo: bash $BK/undo.sh"
