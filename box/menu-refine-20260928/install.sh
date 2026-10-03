#!/bin/bash
# Clerk box: Telegram bot menu refinements (2026-09-28).
#   bash install.sh           install (backs up first; safe to run twice)
#   bash install.sh --check   only check; changes nothing
set -u
# RETIRED (2026-10-03): superseded by newer installers; see box/INSTALL-ORDER.md. Kept for history only.
if [ "${FORCE_OLD_INSTALLER:-}" != 1 ]; then
  cat <<'RETIRED'
STOPPED: menu-refine-20260928 has been replaced by newer installers. Nothing was changed.
Running it again would put back an OLDER copy of the bot's Telegram (/) menu (it would drop /balance)
and undo newer fixes. The Clerk box already has everything this installer did.

Nothing to do on a working box. Only to build a fresh box from scratch, follow box/INSTALL-ORDER.md
and run these, in this order (this one is step 8):
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
WARNING: FORCE_OLD_INSTALLER=1: menu-refine-20260928 is retired; it %s OLD files.
' "$1"; cat <<'RETIRED'
Afterwards re-run these newer installers, in this order (box/INSTALL-ORDER.md):
   - box/bankbalance-20260929/
RETIRED
}
_retired_warn "will put back"; trap '_retired_warn "has put back"' EXIT
HERE=$(cd "$(dirname "$0")" && pwd)
BK=/workspace/backups/menu-refine-20260928
FILES="tools/monthinfo.py tools/clerkinfo.py telegram/srcdoc/poller.py"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/6 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/patch.py" || fail "the update files are damaged. Download them again."
[ -f /workspace/tools/monthclose.py ] || fail "the month-close update (monthclose-20260930) is not installed on this box yet."
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
cp "$HERE/undo.sh" "$BK/undo.sh"

say "== 3/6 Patching"
python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }

say "== 4/6 Restarting the Telegram bot so it knows the new menu (it waits for any upload in progress)"
(nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)

say "== 5/6 Updating the bot's Telegram (/) menu: drops /paid and /cancel (both still work if typed; /paid also"
say "        rides along under every RRR message, /cancel under every upload step)"
(cd /workspace/telegram && python3 -c "
import tg
commands = [
    {'command': 'status', 'description': 'Remittance, attendance, deadlines and statement status'},
    {'command': 'month', 'description': 'This month\'s remittance and attendance (or a previous month)'},
    {'command': 'statement', 'description': 'The latest financial statement (or a previous one)'},
    {'command': 'refresh', 'description': 'Re-check attendance and re-file if it differs'},
    {'command': 'help', 'description': 'Show the commands and how to upload'},
]
print('   menu:', 'updated' if tg.call('setMyCommands', commands=commands).get('ok') else 'NOT updated', [c['command'] for c in commands])
") || say "   note: the menu could not be updated (every command still works if typed)."

say "== 6/6 Test: what /month and /status's remittance line show right now (read-only; nothing is sent)"
python3 /workspace/tools/monthinfo.py month | sed -e 's/<[^>]*>//g' -e 's/^/   /'
say ""
say "DONE. In Telegram, send /status or /month to the bot in a minute or two."
say "Backup: $BK   To undo: bash $BK/undo.sh"
