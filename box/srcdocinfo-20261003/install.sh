#!/bin/bash
# Clerk box: srcdocinfo-20261003. /month gets a SOURCE DOCUMENTS section (Admin, Finance: uploaded on the RCCG portal or
# not, with the day; else the upload bot's records), attendance filing from the portal when the box has no record, and an
# outstanding upload in Next step (with /upload for people who can upload). Every parish, the picker included.
#   bash install.sh           install (backs up first; safe to run twice)
#   bash install.sh --check   only check; changes nothing
# Install remitinfo-20261003 first. Never between 07:25 and 09:05. The Telegram bot is restarted to load the change
# (it waits for any upload in progress). No message is sent and the (/) menus are not changed.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
TAG=srcdocinfo-20261003
BK=/workspace/backups/$TAG
FILES="tools/monthinfo.py tools/satinfo.py tools/satbot.py tools/monthpick.py telegram/srcdoc/poller.py"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/5 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/patch.py" "$HERE/srcdocinfo.py" || fail "the update files are damaged. Download them again."
node --check "$HERE/portal-month.cjs" || fail "the update files are damaged. Download them again."
grep -q remitinfo-20261003 /workspace/tools/monthinfo.py || fail "remitinfo-20261003 is not installed on this box; install it first."
grep -q month-parishes-20261003 /workspace/telegram/srcdoc/poller.py || fail "month-parishes-20261003 is not installed on this box; install it first."
[ -e /workspace/rccg-portal/portal-api.js ] || fail "rccg-portal/portal-api.js is missing on this box."
CLERK_ROOT=/workspace python3 "$HERE/patch.py" --check || fail "nothing was changed. Send the lines above to Claude."
if [ "${1:-}" = "--check" ]; then say ""; say "CHECK OK. Run it again without --check to install."; exit 0; fi

H=$(date +%H%M)
if [ "$H" -ge 0725 ] && [ "$H" -le 0905 ] && [ "${FORCE:-}" != 1 ]; then
  fail "it's between 07:25 and 09:05, when the statement and memo checks run. Try again after 09:05."
fi

say "== 2/5 Backing up to $BK (and *.bak-20261003-srcdocinfo next to each file)"
mkdir -p "$BK"
for f in $FILES; do
  if [ ! -e "$BK/$f" ]; then mkdir -p "$BK/$(dirname "$f")"; cp -p "/workspace/$f" "$BK/$f"; fi
  [ -e "/workspace/$f.bak-20261003-srcdocinfo" ] || cp -p "/workspace/$f" "/workspace/$f.bak-20261003-srcdocinfo"
done
cp "$HERE/undo.sh" "$BK/undo.sh"

say "== 3/5 Installing"
install -m 644 "$HERE/srcdocinfo.py" /workspace/tools/srcdocinfo.py
install -m 644 "$HERE/portal-month.cjs" /workspace/tools/portal-month.cjs
CLERK_ROOT=/workspace python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }
for f in $FILES tools/srcdocinfo.py; do
  python3 -m py_compile "/workspace/$f" || { bash "$BK/undo.sh" --quiet; fail "$f did not compile, everything was put back."; }
done

say "== 4/5 Offline test (made-up portal answers, bot records, months and chats; nothing is read from the portal, nothing is sent)"
{ SRCDOCINFO_OFFLINE=1 REMITINFO_OFFLINE=1 python3 /workspace/tools/srcdocinfo.py selftest --render \
  && python3 /workspace/tools/monthpick.py selftest --poller /workspace/telegram/srcdoc/poller.py; } >/tmp/$TAG-test.txt 2>&1 \
  || { cat /tmp/$TAG-test.txt; bash "$BK/undo.sh" --quiet; fail "the offline test failed, everything was put back."; }
sed 's/^/   /' /tmp/$TAG-test.txt

say "== 5/5 Restarting the Telegram bot (it waits for any upload in progress)"
(nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/tmp/$TAG-restart.txt 2>&1 < /dev/null &)
say ""
say "DONE. In Telegram send /month: after ATTENDANCE FILING there is a SOURCE DOCUMENTS section for that parish and month."
say "Backup: $BK   To undo: bash $BK/undo.sh"
