#!/bin/bash
# Clerk box: connect the runners to the church app's Automations tab (2026-09-28).
#   bash install.sh           install (backs up every file first; safe to run twice)
#   bash install.sh --check   only check that the changes fit this box; changes nothing
set -u
# RETIRED (2026-10-03): superseded by newer installers; see box/INSTALL-ORDER.md. Kept for history only.
if [ "${FORCE_OLD_INSTALLER:-}" != 1 ]; then
  cat <<'RETIRED'
STOPPED: automations-20260928 has been replaced by newer installers. Nothing was changed.
Running it again would put back an OLDER copy of tools/clerkcfg.py
and undo newer fixes. The Clerk box already has everything this installer did.

Nothing to do on a working box. Only to build a fresh box from scratch, follow box/INSTALL-ORDER.md
and run these, in this order (this one is step 1):
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
WARNING: FORCE_OLD_INSTALLER=1: automations-20260928 is retired; it %s OLD files.
' "$1"; cat <<'RETIRED'
Afterwards re-run these newer installers, in this order (box/INSTALL-ORDER.md):
   - box/monthend-20261001/  (FORCE_OLD_INSTALLER=1)
   - box/cleanup-20260928/  (FORCE_OLD_INSTALLER=1)
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
   - box/m2fix-20261003/
   - box/sentlog-20261003/
RETIRED
}
_retired_warn "will put back"; trap '_retired_warn "has put back"' EXIT
HERE=$(cd "$(dirname "$0")" && pwd)
BK=/workspace/backups/automations-20260928
FILES="tools/common.py tools/mailer.py tools/tgcard.py tools/health.py tools/reminders.py tools/stmt-runner.py tools/att-watch.py
tools/supervisor.sh tools/drive-sync.sh telegram/send_msg.py telegram/srcdoc/poller.py telegram/srcdoc/imgproc.py
rccg-memos/memo-runner.sh telegram/srcdoc/sched_config.json"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/6 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/clerkcfg.py" "$HERE/patch.py" || fail "the update files are damaged. Download them again."
bash -n "$HERE/supervisor.sh" || fail "supervisor.sh is damaged. Download it again."
[ -f /workspace/.secrets/watchdog-token ] || say "   note: no watchdog token on this box, so settings can't be fetched yet (everything keeps working as before)."
CLERK_ROOT=/workspace python3 "$HERE/patch.py" --check || fail "nothing was changed. Send the lines above to Claude."
if [ "${1:-}" = "--check" ]; then say ""; say "CHECK OK. Run it again without --check to install."; exit 0; fi

H=$(date +%H%M)
if [ "$H" -ge 0725 ] && [ "$H" -le 0905 ] && [ "${FORCE:-}" != 1 ]; then
  fail "it's between 07:25 and 09:05, when the statement and memo checks run. Try again after 09:05 (or run: FORCE=1 bash $0)."
fi

say "== 2/6 Backing up to $BK"
mkdir -p "$BK"
for f in $FILES; do
  if [ -e "/workspace/$f" ] && [ ! -e "$BK/$f" ]; then mkdir -p "$BK/$(dirname "$f")"; cp -p "/workspace/$f" "$BK/$f"; fi
done
[ -e /workspace/telegram/srcdoc/sched_config.json ] || [ -e "$BK/.no-sched-config" ] || touch "$BK/.no-sched-config"
cp "$HERE/undo.sh" "$BK/undo.sh"

say "== 3/6 Installing"
install -m 755 "$HERE/clerkcfg.py" /workspace/tools/clerkcfg.py
python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }
grep -q automations-20260928 /workspace/tools/supervisor.sh || install -m 755 "$HERE/supervisor.sh" /workspace/tools/supervisor.sh

say "== 4/6 Fetching the settings from the app"
python3 /workspace/tools/clerkcfg.py sync -v
python3 /workspace/tools/clerkcfg.py show | head -3

say "== 5/6 Restarting the runners with the new code"
pkill -f "supervisor.sh" 2>/dev/null
for p in memo-runner.sh stmt-runner.py att-watch.py drive-sync.sh; do pkill -f "$p" 2>/dev/null; done
bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 || say "   note: the upload bot is mid-upload, so it keeps its old code until its next restart."
sleep 2
(cd /workspace/tools && nohup setsid bash /workspace/tools/supervisor.sh >/dev/null 2>&1 < /dev/null &)
sleep 8
for p in supervisor.sh srcdoc/poller.py memo-runner.sh stmt-runner.py att-watch.py drive-sync.sh; do
  if pgrep -f "$p" >/dev/null; then say "   running: $p"; else say "   NOT running yet: $p (the supervisor starts it within 5 minutes)"; fi
done

say "== 6/6 Sending the first status report to the app"
python3 /workspace/tools/clerkcfg.py ping && say "   sent. The dashboard fills in within a minute."
say ""
say "DONE. Backup: $BK"
say "To undo everything: bash $BK/undo.sh"
