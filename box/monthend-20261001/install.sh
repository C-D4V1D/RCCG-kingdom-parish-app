#!/bin/bash
# Clerk box: the month-end runner (2026-10-01). The box can file the monthly remittance itself when the app says so
# (Automations -> Settings -> Remittance (month-end)); until then it only does practice runs next to the Clerk AI.
#   bash install.sh           install (backs up every file first; safe to run twice)
#   bash install.sh --check   only check that the changes fit this box; changes nothing
set -u
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
