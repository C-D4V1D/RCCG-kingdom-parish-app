#!/bin/bash
# Clerk box: greetings-20261003. The Sunday-records reminders greet each person by their own name (Automations -> People),
# for Kingdom Parish and the satellite parishes. A person who isn't in People, or has no name there, gets "Good morning,".
#   bash install.sh           install (backs up first; safe to run twice)
#   bash install.sh --check   only check; changes nothing
# Install botmenu-20261003 first (this change builds on it). Never between 07:25 and 09:05. Nothing is restarted: the
# reminders start fresh each 5-minute cycle and pick the change up by themselves.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
TAG=greetings-20261003
BK=/workspace/backups/$TAG
FILES="tools/reminders.py tools/monthinfo.py tools/satinfo.py"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/5 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/patch.py" "$HERE/greet.py" || fail "the update files are damaged. Download them again."
grep -q botmenu-20261003 /workspace/tools/satinfo.py || fail "botmenu-20261003 is not installed on this box; install it first."
grep -q botmenu-20261003 /workspace/tools/monthinfo.py || fail "botmenu-20261003 is not installed on this box; install it first."
CLERK_ROOT=/workspace python3 "$HERE/patch.py" --check || fail "nothing was changed. Send the lines above to Claude."
if [ "${1:-}" = "--check" ]; then say ""; say "CHECK OK. Run it again without --check to install."; exit 0; fi

H=$(date +%H%M)
if [ "$H" -ge 0725 ] && [ "$H" -le 0905 ] && [ "${FORCE:-}" != 1 ]; then
  fail "it's between 07:25 and 09:05, when the statement and memo checks run. Try again after 09:05."
fi

say "== 2/5 Backing up to $BK (and *.bak-20261003-greetings next to each file)"
mkdir -p "$BK"
for f in $FILES; do
  if [ ! -e "$BK/$f" ]; then mkdir -p "$BK/$(dirname "$f")"; cp -p "/workspace/$f" "$BK/$f"; fi
  [ -e "/workspace/$f.bak-20261003-greetings" ] || cp -p "/workspace/$f" "/workspace/$f.bak-20261003-greetings"
done
cp "$HERE/undo.sh" "$BK/undo.sh"

say "== 3/5 Installing"
install -m 644 "$HERE/greet.py" /workspace/tools/greet.py
CLERK_ROOT=/workspace python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }
for f in $FILES tools/greet.py; do
  python3 -m py_compile "/workspace/$f" || { bash "$BK/undo.sh" --quiet; fail "$f did not compile, everything was put back."; }
done

say "== 4/5 Offline test (made-up people and data; nothing is read from the app, nothing is sent)"
python3 /workspace/tools/greet.py selftest >/tmp/$TAG-test.txt 2>&1 || { cat /tmp/$TAG-test.txt; bash "$BK/undo.sh" --quiet; fail "the offline test failed, everything was put back."; }
python3 - >>/tmp/$TAG-test.txt 2>&1 <<'PYEOF' || { cat /tmp/$TAG-test.txt; bash "$BK/undo.sh" --quiet; fail "the offline test failed, everything was put back."; }
import datetime, sys
sys.path.insert(0, "/workspace/tools")
import monthinfo as MI
d = datetime.date
f = {"month": "2026-10", "start": d(2026, 9, 7), "end": d(2026, 10, 4), "today": d(2026, 10, 1), "report": False, "entry": {},
     "sundays": [{"date": d(2026, 9, 20), "collection": False, "attendance": "submitted"}]}
t = MI.records_msg(f, "weekly", d(2026, 10, 1))
assert t.startswith("Good morning,\n\n"), "the reminder does not start with the plain greeting"
print("reminder text OK: it starts with the plain greeting and each person's name is added when it is sent")
PYEOF
sed 's/^/   /' /tmp/$TAG-test.txt
say "   How each person in Automations -> People is greeted:"
python3 /workspace/tools/greet.py show 2>&1 | sed 's/^/   /'

say "== 5/5 Done"
say ""
say "DONE. Nothing needs restarting. The next Sunday-records reminder greets each person by their own name."
say "Backup: $BK   To undo: bash $BK/undo.sh"
