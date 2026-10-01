#!/bin/bash
# Clerk box: real RCCG portal bank balance — twice-daily check, Refresh from the app, and the bot's
# /balance (bankbalance-20260929).
#   bash install.sh           install (backs up first; safe to run twice)
#   bash install.sh --check   only check; changes nothing
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
BK=/workspace/backups/bankbalance-20260929
FILES="tools/clerkcfg.py telegram/srcdoc/poller.py"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/6 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/patch.py" || fail "the update files are damaged. Download them again."
node --check "$HERE/bankbalance.cjs" || fail "bankbalance.cjs is damaged. Download it again."
[ -f /workspace/rccg-portal/portal-api.js ] || fail "rccg-portal/portal-api.js was not found on this box. Tell Claude before continuing."
CLERK_ROOT=/workspace python3 "$HERE/patch.py" --check || fail "nothing was changed. Send the lines above to Claude."
if [ "${1:-}" = "--check" ]; then say ""; say "CHECK OK. Run it again without --check to install."; exit 0; fi

H=$(date +%H%M)
if [ "$H" -ge 0725 ] && [ "$H" -le 0905 ] && [ "${FORCE:-}" != 1 ]; then
  fail "it's between 07:25 and 09:05, when the statement and memo checks run. Try again after 09:05 (or run: FORCE=1 bash $0)."
fi

say "== 2/6 Backing up to $BK"
mkdir -p "$BK"
for f in $FILES; do
  if [ -e "/workspace/$f" ] && [ ! -e "$BK/$f" ]; then mkdir -p "$BK/$(dirname "$f")"; cp -p "/workspace/$f" "$BK/$f"; fi
done
cp "$HERE/undo.sh" "$BK/undo.sh"

say "== 3/6 Installing"
install -m 755 "$HERE/bankbalance.cjs" /workspace/tools/bankbalance.cjs
python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }

say "== 4/6 Restarting the Telegram bot so it knows /balance (it waits for any upload in progress)"
(nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)

say "== 5/6 Adding /balance to the bot's Telegram menu"
(cd /workspace/telegram && python3 -c "
import tg
c = [x for x in tg.call('getMyCommands').get('result', []) if x['command'] != 'balance']
i = next((k + 1 for k, x in enumerate(c) if x['command'] == 'statement'), len(c))
c.insert(i, {'command': 'balance', 'description': 'Check the real bank balance from the RCCG portal now'})
print('   menu:', 'updated' if tg.call('setMyCommands', commands=c).get('ok') else 'NOT updated', [x['command'] for x in c])
") || say "   note: the menu could not be updated (the /balance command still works)."

say "== 6/6 Test: a real check against the RCCG portal right now (this also updates the app's figure)"
OUT=$(node /workspace/tools/bankbalance.cjs check 2>&1); RC=$?
echo "$OUT" | sed 's/^/   /'
[ "$RC" -eq 0 ] || fail "the real balance check failed (see the line above). The box files are installed; fix the" \
  "portal login/credentials, then run: node /workspace/tools/bankbalance.cjs check"

say ""
say "DONE. In Telegram, send /balance to the bot in a minute or two."
say "The next automatic checks run around 07:00 and 19:00 (and whenever Refresh is pressed in the app)."
say "Backup: $BK   To undo: bash $BK/undo.sh"
