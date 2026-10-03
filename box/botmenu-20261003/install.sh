#!/bin/bash
# Clerk box: botmenu-20261003. The Telegram bot's new menus and screens: each person's own (/) menu from the app's
# settings, one /month screen, /upload, /system (admin), /statement 2026-09, the same wording in the satellite parishes' bot.
#   bash install.sh           install (backs up first; safe to run twice)
#   bash install.sh --check   only check; changes nothing
# Install sentlog-20261003 first (it is the newest change to the bot). Never between 07:25 and 09:05.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
TAG=botmenu-20261003
BK=/workspace/backups/$TAG
FILES="tools/clerkcfg.py tools/monthinfo.py tools/clerkinfo.py tools/satinfo.py tools/satbot.py telegram/srcdoc/poller.py"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/6 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/patch.py" "$HERE/botmenu.py" || fail "the update files are damaged. Download them again."
grep -q sentlog-20261003 /workspace/telegram/srcdoc/poller.py || fail "sentlog-20261003 is not installed on this box; install it first."
grep -q parishes-20261003 /workspace/tools/satbot.py || fail "parishes-20261003 is not installed on this box; install it first."
grep -q checkpeople-20261003 /workspace/tools/clerkcfg.py || fail "checkpeople-20261003 is not installed on this box; install it first."
CLERK_ROOT=/workspace python3 "$HERE/patch.py" --check || fail "nothing was changed. Send the lines above to Claude."
if [ "${1:-}" = "--check" ]; then say ""; say "CHECK OK. Run it again without --check to install."; exit 0; fi

H=$(date +%H%M)
if [ "$H" -ge 0725 ] && [ "$H" -le 0905 ] && [ "${FORCE:-}" != 1 ]; then
  fail "it's between 07:25 and 09:05, when the statement and memo checks run. Try again after 09:05."
fi

say "== 2/6 Backing up to $BK (and *.bak-20261003-botmenu next to each file)"
mkdir -p "$BK"
for f in $FILES; do
  if [ ! -e "$BK/$f" ]; then mkdir -p "$BK/$(dirname "$f")"; cp -p "/workspace/$f" "$BK/$f"; fi
  [ -e "/workspace/$f.bak-20261003-botmenu" ] || cp -p "/workspace/$f" "/workspace/$f.bak-20261003-botmenu"
done
cp "$HERE/undo.sh" "$BK/undo.sh"

say "== 3/6 Installing"
install -m 644 "$HERE/botmenu.py" /workspace/tools/botmenu.py
CLERK_ROOT=/workspace python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }
for f in $FILES tools/botmenu.py; do
  python3 -m py_compile "/workspace/$f" || { bash "$BK/undo.sh" --quiet; fail "$f did not compile, everything was put back."; }
done

say "== 4/6 Offline test (made-up data; nothing is read from the app, nothing is sent)"
python3 /workspace/tools/botmenu.py selftest >/tmp/$TAG-test.txt 2>&1 || { cat /tmp/$TAG-test.txt; bash "$BK/undo.sh" --quiet; fail "the offline test failed, everything was put back."; }
sed 's/^/   /' /tmp/$TAG-test.txt
say "   Who gets which commands (from Automations -> People and -> Telegram bot):"
python3 /workspace/tools/botmenu.py show 2>&1 | grep -v '^settings:' | sed 's/^/   /'

say "== 5/6 Restarting the Telegram bot (it waits for any upload in progress)"
(nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)

say "== 6/6 Sending each person's (/) menu to Telegram"
OUT=$(python3 /workspace/tools/botmenu.py apply --force 2>&1); RC=$?
printf '%s\n' "$OUT" | sed 's/^/   /'
[ "$RC" -eq 0 ] || say "   note: Telegram didn't take every menu just now; the bot tries again by itself (every command still works if typed)."
say ""
say "DONE. In Telegram, close and reopen the chat with the bot to see your new (/) menu, then send /help."
say "Backup: $BK   To undo: bash $BK/undo.sh"
