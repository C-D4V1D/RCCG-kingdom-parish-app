#!/bin/bash
# Clerk box: month-parishes-20261003. /month can show another parish's month (Kingdom Parish and the parishes in
# Automations -> Parishes), for the people with "Can view other parishes' month" on in Automations -> People.
#   bash install.sh           install (backs up first; safe to run twice)
#   bash install.sh --check   only check; changes nothing
# Install botmenu-20261003 first (this change builds on it). Never between 07:25 and 09:05. The Telegram bot is restarted
# to load the change (it waits for any upload in progress). No message is sent and the (/) menus are not changed.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
TAG=month-parishes-20261003
BK=/workspace/backups/$TAG
FILES="telegram/srcdoc/poller.py"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/5 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/patch.py" "$HERE/monthpick.py" || fail "the update files are damaged. Download them again."
grep -q botmenu-20261003 /workspace/telegram/srcdoc/poller.py || fail "botmenu-20261003 is not installed on this box; install it first."
grep -q parishes-20261003 /workspace/tools/satinfo.py || fail "parishes-20261003 is not installed on this box; install it first."
CLERK_ROOT=/workspace python3 "$HERE/patch.py" --check || fail "nothing was changed. Send the lines above to Claude."
if [ "${1:-}" = "--check" ]; then say ""; say "CHECK OK. Run it again without --check to install."; exit 0; fi

H=$(date +%H%M)
if [ "$H" -ge 0725 ] && [ "$H" -le 0905 ] && [ "${FORCE:-}" != 1 ]; then
  fail "it's between 07:25 and 09:05, when the statement and memo checks run. Try again after 09:05."
fi

say "== 2/5 Backing up to $BK (and *.bak-20261003-month-parishes next to each file)"
mkdir -p "$BK"
for f in $FILES; do
  if [ ! -e "$BK/$f" ]; then mkdir -p "$BK/$(dirname "$f")"; cp -p "/workspace/$f" "$BK/$f"; fi
  [ -e "/workspace/$f.bak-20261003-month-parishes" ] || cp -p "/workspace/$f" "/workspace/$f.bak-20261003-month-parishes"
done
cp "$HERE/undo.sh" "$BK/undo.sh"

say "== 3/5 Installing"
install -m 644 "$HERE/monthpick.py" /workspace/tools/monthpick.py
CLERK_ROOT=/workspace python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }
for f in $FILES tools/monthpick.py; do
  python3 -m py_compile "/workspace/$f" || { bash "$BK/undo.sh" --quiet; fail "$f did not compile, everything was put back."; }
done

say "== 4/5 Offline test (made-up people, parishes and chats; nothing is read from the app, nothing is sent)"
python3 /workspace/tools/monthpick.py selftest --poller /workspace/telegram/srcdoc/poller.py >/tmp/$TAG-test.txt 2>&1 \
  || { cat /tmp/$TAG-test.txt; bash "$BK/undo.sh" --quiet; fail "the offline test failed, everything was put back."; }
sed 's/^/   /' /tmp/$TAG-test.txt
say "   Who can pick a parish under /month (from Automations -> People and -> Parishes):"
python3 /workspace/tools/monthpick.py show 2>&1 | sed 's/^/   /'

say "== 5/5 Restarting the Telegram bot (it waits for any upload in progress)"
(nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/tmp/$TAG-restart.txt 2>&1 < /dev/null &)
say ""
say "DONE. In Telegram send /month: people allowed in the app get an extra button \"Other parishes\"."
say "Backup: $BK   To undo: bash $BK/undo.sh"
