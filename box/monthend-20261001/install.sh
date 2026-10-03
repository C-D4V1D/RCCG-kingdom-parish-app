#!/bin/bash
# Clerk box: the month-end runner (2026-10-01). The box can file the monthly remittance itself when the app says so
# (Automations -> Settings -> Remittance (month-end)); until then it only does practice runs next to the Clerk AI.
#   bash install.sh           install (backs up every file first; safe to run twice)
#   bash install.sh --check   only check that the changes fit this box; changes nothing
set -u
# RETIRED (2026-10-03): superseded by newer installers; see box/INSTALL-ORDER.md. Kept for history only.
if [ "${FORCE_OLD_INSTALLER:-}" != 1 ]; then
  cat <<'RETIRED'
STOPPED: monthend-20261001 has been replaced by newer installers. Nothing was changed.
Running it again would put back an OLDER copy of tools/clerkcfg.py and tools/monthend.py
and undo newer fixes. The Clerk box already has everything this installer did.

Nothing to do on a working box. Only to build a fresh box from scratch, follow box/INSTALL-ORDER.md
and run these, in this order (this one is step 2):
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
WARNING: FORCE_OLD_INSTALLER=1: monthend-20261001 is retired; it %s OLD files.
' "$1"; cat <<'RETIRED'
Afterwards re-run these newer installers, in this order (box/INSTALL-ORDER.md):
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
BK=/workspace/backups/monthend-20261001
FILES="tools/clerkcfg.py rccg-remit/remit_match.py rccg-remit/api-fill.js"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/5 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/clerkcfg.py" "$HERE/monthend.py" "$HERE/patch.py" || fail "the update files are damaged. Download them again."
[ -f /workspace/tools/clerkcfg.py ] || fail "the Automations update (automations-20260928) is not installed on this box."
command -v node >/dev/null || fail "node is not installed on this box."
CLERK_ROOT=/workspace python3 "$HERE/patch.py" --check || fail "nothing was changed. Send the lines above to Claude."
if [ "${1:-}" = "--check" ]; then say ""; say "CHECK OK. Run it again without --check to install."; exit 0; fi

H=$(date +%H%M)
if [ "$H" -ge 0725 ] && [ "$H" -le 0905 ] && [ "${FORCE:-}" != 1 ]; then
  fail "it's between 07:25 and 09:05, when the statement and memo checks run. Try again after 09:05 (or run: FORCE=1 bash $0)."
fi
if pgrep -f "api-fill.js|att-fill.js|compute-remit.js" >/dev/null; then
  fail "a remittance or attendance script is running right now. Try again in 15 minutes."
fi

say "== 2/5 Backing up to $BK"
mkdir -p "$BK"
for f in $FILES; do
  if [ -e "/workspace/$f" ] && [ ! -e "$BK/$f" ]; then mkdir -p "$BK/$(dirname "$f")"; cp -p "/workspace/$f" "$BK/$f"; fi
done
cp "$HERE/undo.sh" "$BK/undo.sh"

say "== 3/5 Installing"
install -m 755 "$HERE/clerkcfg.py" /workspace/tools/clerkcfg.py
install -m 755 "$HERE/monthend.py" /workspace/tools/monthend.py
install -m 644 "$HERE/MONTHEND-AI.md" /workspace/tools/MONTHEND-AI.md
mkdir -p /workspace/state/monthend/inbox /workspace/state/monthend/done
python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }
python3 -c "import sys; sys.path.insert(0, '/workspace/rccg-remit'); import remit_match as m; assert len(m.APP_KEY_TO_WEEKLY_LINE) >= 1" \
  || { bash "$BK/undo.sh" --quiet; fail "remit_match.py did not load after the change, everything was put back."; }

say "== 4/5 Connecting to the month-end mailbox"
python3 /workspace/tools/clerkcfg.py sync -v
python3 /workspace/tools/clerkcfg.py events || say "   note: the mailbox could not be reached yet; the box tries again every 5 minutes."
say "   month-end run by: $(python3 -c "import sys; sys.path.insert(0,'/workspace/tools'); import clerkcfg as C; print(C.remittance_handler())")"

say "== 5/5 Sending a status report to the app"
python3 /workspace/tools/clerkcfg.py ping && say "   sent. The Month-end card appears on the Automations page within a minute."
say ""
say "DONE. Backup: $BK"
say "To undo: bash $BK/undo.sh"
