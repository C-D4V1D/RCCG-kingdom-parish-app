#!/bin/bash
# Clerk box: statement send day + Sunday records reminders (2026-09-28).
#   bash install.sh           install (backs up first; safe to run twice)
#   bash install.sh --check   only check; changes nothing
set -u
# RETIRED (2026-10-03): superseded by newer installers; see box/INSTALL-ORDER.md. Kept for history only.
if [ "${FORCE_OLD_INSTALLER:-}" != 1 ]; then
  cat <<'RETIRED'
STOPPED: records-20260928 has been replaced by newer installers. Nothing was changed.
Running it again would put back an OLDER copy of tools/clerkcfg.py and tools/monthinfo.py
and undo newer fixes. The Clerk box already has everything this installer did.

Nothing to do on a working box. Only to build a fresh box from scratch, follow box/INSTALL-ORDER.md
and run these, in this order (this one is step 7):
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
WARNING: FORCE_OLD_INSTALLER=1: records-20260928 is retired; it %s OLD files.
' "$1"; cat <<'RETIRED'
Afterwards re-run these newer installers, in this order (box/INSTALL-ORDER.md):
   - box/menu-refine-20260928/  (FORCE_OLD_INSTALLER=1)
   - box/bankbalance-20260929/
   - box/bankbalance-fastcheck-20261001/
   - box/parishes-20261003/
   - box/bankbalance-reconcile-20261001/
   - box/c2fix-20261003/
   - box/checkpeople-20261003/
RETIRED
}
_retired_warn "will put back"; trap '_retired_warn "has put back"' EXIT
HERE=$(cd "$(dirname "$0")" && pwd)
BK=/workspace/backups/records-20260928
FILES="tools/monthinfo.py tools/clerkcfg.py tools/stmt-runner.py telegram/srcdoc/boxsched.py telegram/srcdoc/sched_config.json"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/5 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/monthinfo.py" "$HERE/clerkcfg.py" "$HERE/patch.py" || fail "the update files are damaged. Download them again."
grep -q monthclose-20260930 /workspace/tools/monthinfo.py 2>/dev/null || fail "the month-close update (monthclose-20260930) is not installed on this box yet."
CLERK_ROOT=/workspace python3 "$HERE/patch.py" --check || fail "nothing was changed. Send the lines above to Claude."
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
install -m 755 "$HERE/monthinfo.py" /workspace/tools/monthinfo.py
install -m 755 "$HERE/clerkcfg.py" /workspace/tools/clerkcfg.py
python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }
python3 /workspace/tools/clerkcfg.py apply >/dev/null 2>&1 || true   # the scheduler learns the statement day now

say "== 4/5 Restarting the statement runner and the Telegram bot (the bot waits for any upload in progress)"
pkill -f "stmt-runner.py" 2>/dev/null; sleep 1
(nohup setsid python3 /workspace/tools/stmt-runner.py >/dev/null 2>&1 < /dev/null &)
(nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)

say "== 5/5 Test (read from the app; nothing is sent)"
python3 -c "import json; c=json.load(open('/workspace/telegram/srcdoc/sched_config.json')); print('   statement: sent', c.get('statement_offset_days', 1), 'day(s) after the cut-off; catch-up', c.get('statement_catchup_days', 7), 'days')"
say "   Bro. Divine's weekly message, if it were sent now:"
(cd /workspace/tools && python3 -c "import monthinfo as M; print(M.monday_msg('(the app could not be read)', M.facts()) or 'nothing missing, so nothing would be sent')") | sed -e 's/<[^>]*>//g' -e 's/^/     /'
say ""
python3 /workspace/tools/monthinfo.py ladder --dry-run | sed -e 's/<[^>]*>//g' -e 's/^/   /'
say ""
say "DONE. Backup: $BK   To undo: bash $BK/undo.sh"
