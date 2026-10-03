#!/bin/bash
# Clerk box: checkpeople-20261003. The Kingdom remittance check (email + Telegram) goes to whoever Automations routes
# remittance_check to, each person their own copy once; buttons only for people with buttons on and a signed link.
#   bash install.sh           install (backs up first; safe to run twice)
#   bash install.sh --check   only check; changes nothing
# Needs c2fix-20261003 installed first. No restart needed: these scripts start fresh for every month-end run.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
TAG=checkpeople-20261003
BK=/workspace/backups/$TAG
FILES="tools/clerkcfg.py tools/monthend.py telegram/tg_msgs.py rccg-remit/make-check-email.py"
TEST="$HERE/../c2fix-20261003/test_c2.py"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/4 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/patch.py" "$TEST" || fail "the update files are damaged. Download them again."
grep -q c2fix-20261003 /workspace/rccg-remit/make-check-email.py || fail "install c2fix-20261003 first."
pgrep -f "python3? [^ ]*tools/monthend[.]py" >/dev/null && fail "a month-end run is in progress. Try again in a few minutes."
CLERK_ROOT=/workspace python3 "$HERE/patch.py" --check || fail "nothing was changed. Send the lines above to Claude."
python3 "$TEST" >/tmp/$TAG-test.txt 2>&1 || { cat /tmp/$TAG-test.txt; fail "the offline test failed; nothing was changed."; }
if [ "${1:-}" = "--check" ]; then say ""; say "CHECK OK (offline test passed). Run it again without --check to install."; exit 0; fi

say "== 2/4 Backing up to $BK (and *.bak-20261003-checkpeople next to each file)"
mkdir -p "$BK"
for f in $FILES; do
  if [ ! -e "$BK/$f" ]; then mkdir -p "$BK/$(dirname "$f")"; cp -p "/workspace/$f" "$BK/$f"; fi
  [ -e "/workspace/$f.bak-20261003-checkpeople" ] || cp -p "/workspace/$f" "/workspace/$f.bak-20261003-checkpeople"
done
cp "$HERE/undo.sh" "$BK/undo.sh"

say "== 3/4 Installing"
CLERK_ROOT=/workspace python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }
for f in $FILES; do python3 -m py_compile "/workspace/$f" || { bash "$BK/undo.sh" --quiet; fail "$f did not compile, everything was put back."; }; done

say "== 4/4 Offline test on the installed files (sends nothing)"
python3 "$TEST" | tail -1
say ""
say "DONE. Backup: $BK   To undo: bash $BK/undo.sh"
