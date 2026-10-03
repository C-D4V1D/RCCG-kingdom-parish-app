#!/bin/bash
# Clerk box: appbackup-20261003. A weekly full backup of the parish app, saved in /workspace/app-backups and so
# copied to Google Drive (Clerk Box/workspace/app-backups) by drive-sync.
#   bash install.sh               install, make the first backup now, then restart the supervisor (only the supervisor)
#   bash install.sh --check       only check; changes nothing
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
TAG=appbackup-20261003
BK=/workspace/backups/$TAG
FILES="tools/supervisor.sh"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/5 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/patch.py" "$HERE/appbackup.py" || fail "the update files are damaged. Download them again."
[ -f /workspace/tools/start-box.sh ] || fail "this needs the restart-20261003 update first (tools/start-box.sh is missing)."
CLERK_ROOT=/workspace python3 "$HERE/patch.py" --check || fail "nothing was changed. Send the lines above to Claude."
H=$(date +%H%M)
if [ "${1:-}" != "--check" ] && [ "$H" -ge 0725 ] && [ "$H" -le 0905 ] && [ "${FORCE:-}" != 1 ]; then
  fail "it's between 07:25 and 09:05, when the statement and memo checks run. Try again after 09:05 (or run: FORCE=1 bash $0)."
fi
if [ "${1:-}" = "--check" ]; then say ""; say "CHECK OK. Run it again without --check to install."; exit 0; fi

say "== 2/5 Backing up to $BK"
mkdir -p "$BK"
for f in $FILES; do
  if [ ! -e "$BK/$f" ]; then mkdir -p "$BK/$(dirname "$f")"; cp -p "/workspace/$f" "$BK/$f"; fi
done
cp "$HERE/undo.sh" "$BK/undo.sh"

say "== 3/5 Installing"
install -m 755 "$HERE/appbackup.py" /workspace/tools/appbackup.py
CLERK_ROOT=/workspace python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }
bash -n /workspace/tools/supervisor.sh || { bash "$BK/undo.sh" --quiet; fail "supervisor.sh check failed, everything was put back."; }

say "== 4/5 First backup (can take a minute)"
python3 /workspace/tools/appbackup.py now || say "   (The first backup did not work. The box will try again in 6 hours; send this screen to Claude.)"

say "== 5/5 Supervisor"
OLD=$(cat /workspace/tools/supervisor.pid 2>/dev/null)
if [ -n "$OLD" ] && kill -0 "$OLD" 2>/dev/null; then
  kill "$OLD" 2>/dev/null && say "   stopped the supervisor (pid $OLD) so it picks up the new step; the bot and runners keep running"
  rm -f /workspace/tools/supervisor.pid; sleep 1
fi
bash /workspace/tools/start-box.sh
say ""
say "DONE. Backups go to /workspace/app-backups and reach Google Drive (Clerk Box/workspace/app-backups) within 10 minutes."
say "To undo: bash $BK/undo.sh"
