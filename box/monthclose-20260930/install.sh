#!/bin/bash
# Clerk box: RRR payment check on Remita, the "I've paid" button and /paid, and the month-close checklist (2026-09-30).
#   bash install.sh           install (backs up first; safe to run twice)
#   bash install.sh --check   only check; changes nothing
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
BK=/workspace/backups/monthclose-20260930
FILES="tools/monthinfo.py tools/supervisor.sh telegram/send_msg.py telegram/srcdoc/poller.py"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/6 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/monthclose.py" "$HERE/monthinfo.py" "$HERE/patch.py" || fail "the update files are damaged. Download them again."
node --check "$HERE/remita-check.cjs" || fail "remita-check.cjs is damaged. Download it again."
bash -n "$HERE/supervisor.sh" || fail "supervisor.sh is damaged. Download it again."
[ -f /workspace/tools/monthinfo.py ] || fail "the reminders update (reminders-20260929) is not installed on this box yet."
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
install -m 755 "$HERE/remita-check.cjs" /workspace/tools/remita-check.cjs
install -m 755 "$HERE/monthclose.py" /workspace/tools/monthclose.py
install -m 755 "$HERE/monthinfo.py" /workspace/tools/monthinfo.py
install -m 755 "$HERE/supervisor.sh" /workspace/tools/supervisor.sh
python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }
python3 /workspace/tools/monthclose.py baseline

say "== 4/6 Restarting the supervisor and the Telegram bot"
pkill -f "supervisor.sh" 2>/dev/null; sleep 1
(cd /workspace/tools && nohup setsid bash /workspace/tools/supervisor.sh >/dev/null 2>&1 < /dev/null &)
(nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)

say "== 5/6 Adding /paid to the bot's Telegram menu"
(cd /workspace/telegram && python3 -c "
import tg
c = [x for x in tg.call('getMyCommands').get('result', []) if x['command'] != 'paid']
i = next((k + 1 for k, x in enumerate(c) if x['command'] in ('month', 'statement')), len(c))
c.insert(i, {'command': 'paid', 'description': 'You paid the RRR: check Remita and tell everyone'})
print('   menu:', 'updated' if tg.call('setMyCommands', commands=c).get('ok') else 'NOT updated', [x['command'] for x in c])
") || say "   note: the menu could not be updated (the /paid command still works)."

say "== 6/6 Test: a real read-only Remita check on the newest RRR (nothing is paid or sent)"
R=$(python3 -c "import glob,json; f=sorted(glob.glob('/workspace/rccg-remit/runs/rrr-????-??.json')); d=json.load(open(f[-1])) if f else {}; print(((d.get('invoices') or [{}])[0].get('debits') or [{}])[0].get('RRR',''))" 2>/dev/null)
if [ -n "$R" ]; then say "   RRR $R:"; node /workspace/tools/remita-check.cjs "$R" | sed 's/^/   /'; else say "   no RRR saved on the box yet"; fi
say ""
say "DONE. Backup: $BK   To undo: bash $BK/undo.sh"
