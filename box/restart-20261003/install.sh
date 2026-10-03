#!/bin/bash
# Clerk box: restart-20261003. One command starts everything (tools/start-box.sh, idempotent); the supervisor runs
# once only, retries a lost connection sooner and restarts a hung bot; RESTART-RUN.md is the runbook the Clerk AI follows
# when the clerk-watchdog Worker wakes it because the box went quiet (event box_down in WAKE-RUN.md).
#   bash install.sh               install, then restart the supervisor (only the supervisor) so the new loop runs
#   bash install.sh --check       only check; changes nothing
#   bash install.sh --no-restart  install; the new loop starts the next time the supervisor starts
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
TAG=restart-20261003
BK=/workspace/backups/$TAG
FILES="tools/supervisor.sh telegram/srcdoc/WAKE-RUN.md"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/4 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/patch.py" && bash -n "$HERE/start-box.sh" || fail "the update files are damaged. Download them again."
CLERK_ROOT=/workspace python3 "$HERE/patch.py" --check || fail "nothing was changed. Send the lines above to Claude."
H=$(date +%H%M)
if [ "${1:-}" != "--check" ] && [ "$H" -ge 0725 ] && [ "$H" -le 0905 ] && [ "${FORCE:-}" != 1 ]; then
  fail "it's between 07:25 and 09:05, when the statement and memo checks run. Try again after 09:05 (or run: FORCE=1 bash $0)."
fi
if [ "${1:-}" = "--check" ]; then say ""; say "CHECK OK. Run it again without --check to install."; exit 0; fi

say "== 2/4 Backing up to $BK (and *.bak-20261003-restart next to each file)"
mkdir -p "$BK"
for f in $FILES; do
  if [ ! -e "$BK/$f" ]; then mkdir -p "$BK/$(dirname "$f")"; cp -p "/workspace/$f" "$BK/$f"; fi
  [ -e "/workspace/$f.bak-20261003-restart" ] || cp -p "/workspace/$f" "/workspace/$f.bak-20261003-restart"
done
cp "$HERE/undo.sh" "$BK/undo.sh"

say "== 3/4 Installing"
install -m 755 "$HERE/start-box.sh" /workspace/tools/start-box.sh
install -m 644 "$HERE/RESTART-RUN.md" /workspace/telegram/srcdoc/RESTART-RUN.md
CLERK_ROOT=/workspace python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }
bash -n /workspace/tools/supervisor.sh || { bash "$BK/undo.sh" --quiet; fail "supervisor.sh check failed, everything was put back."; }

say "== 4/4 Supervisor"
if [ "${1:-}" != "--no-restart" ]; then
  OLD=""
  for p in $(pgrep -f "^(/usr/bin/)?bash (/workspace/tools/)?supervisor[.]sh"); do  # the session leader, not its subshells
    [ "$(ps -o sid= -p "$p" 2>/dev/null | tr -d ' ')" = "$p" ] && OLD=$p
  done
  if [ -n "$OLD" ] && [ "$(cat /workspace/tools/supervisor.pid 2>/dev/null)" != "$OLD" ]; then  # an old-code supervisor
    kill "$OLD" 2>/dev/null && say "   stopped the old supervisor (pid $OLD); the bot and runners keep running"
    rm -f /workspace/tools/supervisor.pid; sleep 1
  fi
fi
bash /workspace/tools/start-box.sh
say ""
say "DONE. Backup: $BK   To undo: bash $BK/undo.sh"
