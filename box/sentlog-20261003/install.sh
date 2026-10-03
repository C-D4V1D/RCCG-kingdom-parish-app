#!/bin/bash
# Clerk box: sentlog-20261003. Every outgoing email (mailer.py) and Telegram send (tg.py, send_msg.py, send_doc.py,
# the upload bot) appends one line to /workspace/logs/sent.log (rotated monthly to sent-YYYY-MM.log).
#   bash install.sh           install (backs up first; safe to run twice)
#   bash install.sh --check   only check; changes nothing
# Install m2fix-20261003 first. The upload bot (srcdoc/poller.py) logs its own sends after its next restart.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
TAG=sentlog-20261003
BK=/workspace/backups/$TAG
FILES="tools/mailer.py tools/monthend.py telegram/tg.py telegram/send_msg.py telegram/send_doc.py telegram/srcdoc/poller.py"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/4 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/patch.py" "$HERE/sentlog.py" "$HERE/test_sentlog.py" || fail "the update files are damaged. Download them again."
grep -q m2fix-20261003 /workspace/tools/monthend.py || fail "m2fix-20261003 is not installed on this box; install it first."
pgrep -f "python3? [^ ]*tools/monthend[.]py" >/dev/null && fail "a month-end run is in progress. Try again in a few minutes."
CLERK_ROOT=/workspace python3 "$HERE/patch.py" --check || fail "nothing was changed. Send the lines above to Claude."
if [ "${1:-}" = "--check" ]; then say ""; say "CHECK OK. Run it again without --check to install."; exit 0; fi

say "== 2/4 Backing up to $BK (and *.bak-20261003-sentlog next to each file)"
mkdir -p "$BK"
for f in $FILES; do
  if [ ! -e "$BK/$f" ]; then mkdir -p "$BK/$(dirname "$f")"; cp -p "/workspace/$f" "$BK/$f"; fi
  [ -e "/workspace/$f.bak-20261003-sentlog" ] || cp -p "/workspace/$f" "/workspace/$f.bak-20261003-sentlog"
done
cp "$HERE/undo.sh" "$BK/undo.sh"

say "== 3/4 Installing"
install -m 644 "$HERE/sentlog.py" /workspace/tools/sentlog.py
mkdir -p /workspace/logs   # drive-sync copies all of /workspace (no exclude matches logs/), so the log is backed up
CLERK_ROOT=/workspace python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }
for f in $FILES; do python3 -m py_compile "/workspace/$f" || { bash "$BK/undo.sh" --quiet; fail "$f did not compile, everything was put back."; }; done

say "== 4/4 Offline test on the installed files (mocked SMTP/Telegram; sends nothing)"
CLERK_ROOT=/workspace python3 "$HERE/test_sentlog.py" >/tmp/$TAG-test.txt 2>&1 || { cat /tmp/$TAG-test.txt; bash "$BK/undo.sh" --quiet; fail "the offline test failed, everything was put back."; }
tail -1 /tmp/$TAG-test.txt
say ""
say "DONE. Backup: $BK   To undo: bash $BK/undo.sh"
say "The upload bot logs its own replies after its next restart (bash /workspace/telegram/srcdoc/ensure_running.sh after stopping it)."
