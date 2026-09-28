#!/bin/bash
# Clerk box: connect the runners to the church app's Automations tab (2026-09-28).
#   bash install.sh           install (backs up every file first; safe to run twice)
#   bash install.sh --check   only check that the changes fit this box; changes nothing
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
BK=/workspace/backups/automations-20260928
FILES="tools/common.py tools/mailer.py tools/tgcard.py tools/health.py tools/reminders.py tools/stmt-runner.py tools/att-watch.py
tools/supervisor.sh tools/drive-sync.sh telegram/send_msg.py telegram/srcdoc/poller.py telegram/srcdoc/imgproc.py
rccg-memos/memo-runner.sh telegram/srcdoc/sched_config.json"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/6 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/clerkcfg.py" "$HERE/patch.py" || fail "the update files are damaged. Download them again."
bash -n "$HERE/supervisor.sh" || fail "supervisor.sh is damaged. Download it again."
[ -f /workspace/.secrets/watchdog-token ] || say "   note: no watchdog token on this box, so settings can't be fetched yet (everything keeps working as before)."
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
[ -e /workspace/telegram/srcdoc/sched_config.json ] || [ -e "$BK/.no-sched-config" ] || touch "$BK/.no-sched-config"
cp "$HERE/undo.sh" "$BK/undo.sh"

say "== 3/6 Installing"
install -m 755 "$HERE/clerkcfg.py" /workspace/tools/clerkcfg.py
python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }
grep -q automations-20260928 /workspace/tools/supervisor.sh || install -m 755 "$HERE/supervisor.sh" /workspace/tools/supervisor.sh

say "== 4/6 Fetching the settings from the app"
python3 /workspace/tools/clerkcfg.py sync -v
python3 /workspace/tools/clerkcfg.py show | head -3

say "== 5/6 Restarting the runners with the new code"
pkill -f "supervisor.sh" 2>/dev/null
for p in memo-runner.sh stmt-runner.py att-watch.py drive-sync.sh; do pkill -f "$p" 2>/dev/null; done
bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 || say "   note: the upload bot is mid-upload, so it keeps its old code until its next restart."
sleep 2
(cd /workspace/tools && nohup setsid bash /workspace/tools/supervisor.sh >/dev/null 2>&1 < /dev/null &)
sleep 8
for p in supervisor.sh srcdoc/poller.py memo-runner.sh stmt-runner.py att-watch.py drive-sync.sh; do
  if pgrep -f "$p" >/dev/null; then say "   running: $p"; else say "   NOT running yet: $p (the supervisor starts it within 5 minutes)"; fi
done

say "== 6/6 Sending the first status report to the app"
python3 /workspace/tools/clerkcfg.py ping && say "   sent. The dashboard fills in within a minute."
say ""
say "DONE. Backup: $BK"
say "To undo everything: bash $BK/undo.sh"
