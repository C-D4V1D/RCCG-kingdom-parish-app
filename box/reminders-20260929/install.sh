#!/bin/bash
# Clerk box: Sunday collection reminders and the bot's /month command (2026-09-29).
#   bash install.sh           install (backs up first; safe to run twice)
#   bash install.sh --check   only check; changes nothing
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
BK=/workspace/backups/reminders-20260929
FILES="tools/reminders.py tools/clerkinfo.py tools/att-refresh.py telegram/srcdoc/poller.py"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/5 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/monthinfo.py" "$HERE/patch.py" || fail "the update files are damaged. Download them again."
grep -q cleanup-20260928 /workspace/tools/clerkcfg.py || fail "the clean-up update (cleanup-20260928) is not installed on this box yet."
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
python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }

say "== 4/5 Restarting the Telegram bot so it knows /month (it waits for any upload in progress)"
(nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)

say "== 5/5 Test: what /month shows right now (read from the app; nothing is sent)"
python3 /workspace/tools/monthinfo.py month | sed -e 's/<[^>]*>//g' -e 's/^/   /'
say ""
python3 /workspace/tools/monthinfo.py ladder --dry-run | sed 's/^/   /'
say ""
say "DONE. In Telegram, send /month to the bot in a minute or two."
say "Backup: $BK   To undo: bash $BK/undo.sh"
