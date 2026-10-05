#!/bin/bash
# Clerk box: followticks-20261003. Two jobs follow their Automations settings instead of a built-in rule:
#  - the weekly Sunday-records message goes to the people ticked for "Sunday records: weekly message" (once the app has
#    saved those ticks; until then exactly as before);
#  - the scheduler's Clerk AI back-up for the memo check only runs on the memo "Days to check".
#   bash install.sh           install (backs up first; safe to run twice)
#   bash install.sh --check   only check; changes nothing
# Never between 07:25 and 09:05. The Telegram bot (which runs the scheduler) is restarted to load the change (it waits
# for any upload in progress). No message is sent.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
TAG=followticks-20261003
BK=/workspace/backups/$TAG
FILES="tools/clerkcfg.py tools/reminders.py telegram/srcdoc/boxsched.py telegram/srcdoc/sched_config.json"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/6 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/patch.py" "$HERE/selftest.py" || fail "the update files are damaged. Download them again."
grep -q greetings-20261003 /workspace/tools/reminders.py || fail "greetings-20261003 is not installed on this box; install it first."
grep -q botmenu-20261003 /workspace/tools/clerkcfg.py || fail "botmenu-20261003 is not installed on this box; install it first."
CLERK_ROOT=/workspace python3 "$HERE/patch.py" --check || fail "nothing was changed. Send the lines above to Claude."
if [ "${1:-}" = "--check" ]; then say ""; say "CHECK OK. Run it again without --check to install."; exit 0; fi

H=$(date +%H%M)
if [ "$H" -ge 0725 ] && [ "$H" -le 0905 ] && [ "${FORCE:-}" != 1 ]; then
  fail "it's between 07:25 and 09:05, when the statement and memo checks run. Try again after 09:05."
fi

say "== 2/6 Backing up to $BK (and *.bak-20261003-followticks next to each file)"
mkdir -p "$BK"
for f in $FILES; do
  [ -e "/workspace/$f" ] || continue
  if [ ! -e "$BK/$f" ]; then mkdir -p "$BK/$(dirname "$f")"; cp -p "/workspace/$f" "$BK/$f"; fi
  [ -e "/workspace/$f.bak-20261003-followticks" ] || cp -p "/workspace/$f" "/workspace/$f.bak-20261003-followticks"
done
cp "$HERE/undo.sh" "$BK/undo.sh"

say "== 3/6 Installing"
CLERK_ROOT=/workspace python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }
for f in tools/clerkcfg.py tools/reminders.py telegram/srcdoc/boxsched.py; do
  python3 -m py_compile "/workspace/$f" || { bash "$BK/undo.sh" --quiet; fail "$f did not compile, everything was put back."; }
done

say "== 4/6 Offline test (made-up people and settings; nothing is read from the app, nothing is sent)"
python3 "$HERE/selftest.py" test --root /workspace >/tmp/$TAG-test.txt 2>&1 \
  || { cat /tmp/$TAG-test.txt; bash "$BK/undo.sh" --quiet; fail "the offline test failed, everything was put back."; }
sed 's/^/   /' /tmp/$TAG-test.txt

say "== 5/6 Writing the memo days into the scheduler's settings (from the box's copy of the app settings)"
python3 /workspace/tools/clerkcfg.py apply >/dev/null 2>&1 || { bash "$BK/undo.sh" --quiet; fail "the scheduler settings could not be written, everything was put back."; }
python3 "$HERE/selftest.py" show --root /workspace 2>&1 | sed 's/^/   /'

say "== 6/6 Restarting the Telegram bot and scheduler (it waits for any upload in progress)"
(nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/tmp/$TAG-restart.txt 2>&1 < /dev/null &)
say ""
say "DONE. Nothing changes for anyone until the Automations page is saved; then the weekly message follows its ticks."
say "Backup: $BK   To undo: bash $BK/undo.sh"
