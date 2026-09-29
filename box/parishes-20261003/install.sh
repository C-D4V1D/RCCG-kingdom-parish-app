#!/bin/bash
# Clerk box: satellite parishes (month-end, RRR, "I've paid", month-close, Sunday records reminders, bot invites and uploads) (2026-10-03).
#   bash install.sh           install (backs up first; safe to run twice)
#   bash install.sh --check   only check; changes nothing
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
BK=/workspace/backups/parishes-20261003
FILES="tools/clerkcfg.py tools/monthend.py tools/supervisor.sh telegram/srcdoc/poller.py"
NEW="satinfo.py satclose.py satbot.py satmonthend.py sat-fetch.cjs"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/5 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/satinfo.py" "$HERE/satclose.py" "$HERE/satbot.py" "$HERE/satmonthend.py" "$HERE/patch.py" || fail "the update files are damaged. Download them again."
node --check "$HERE/sat-fetch.cjs" || fail "sat-fetch.cjs is damaged. Download it again."
for f in monthclose.py monthinfo.py monthend.py clerkinfo.py; do
  [ -f "/workspace/tools/$f" ] || fail "the month-close / month-end updates are not installed on this box yet."
done
openssl version >/dev/null 2>&1 || fail "openssl is not available on this box (it is needed for the box key)."
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
for f in $NEW; do install -m 755 "$HERE/$f" "/workspace/tools/$f"; done
python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }
mkdir -p /workspace/rccg-sat /workspace/state
python3 -c "import sys; sys.path.insert(0,'/workspace/tools'); import satinfo; print('   box key:', 'ready' if satinfo.public_key() else 'NOT made')"

say "== 4/5 Restarting the supervisor and the Telegram bot"
pkill -f "supervisor.sh" 2>/dev/null; sleep 1
(cd /workspace/tools && nohup setsid bash /workspace/tools/supervisor.sh >/dev/null 2>&1 < /dev/null &)
(nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)

say "== 5/5 Test: what the box reports to the app"
python3 /workspace/tools/clerkcfg.py health | python3 -c "import json,sys; h=json.load(sys.stdin); print('   parishes seen by the box:', ', '.join(h.get('satellites') or {}) or 'none yet (add them in the app: Automations > Parishes)'); print('   box key published:', 'yes' if h.get('box_public_key') else 'NO')"
say ""
say "DONE. Backup: $BK   To undo: bash $BK/undo.sh"
