#!/bin/bash
# Clerk box: statement send day + Sunday records reminders (2026-09-28).
#   bash install.sh           install (backs up first; safe to run twice)
#   bash install.sh --check   only check; changes nothing
set -u
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
