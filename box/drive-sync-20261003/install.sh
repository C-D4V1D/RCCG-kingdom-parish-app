#!/bin/bash
# Clerk box: drive-sync-20261003. The Google Drive copy ("Clerk Box/workspace") gets parish/Clerk files only, chosen by
# tools/drive-sync.filter (job-hunt files, other agents' work, Python environments, app git clones and the portal
# capture are skipped). Files it skips that are already on Drive stay there: nothing is deleted from Drive.
#   bash install.sh               install, then restart the drive-sync loop (only that loop) so the filter is used
#   bash install.sh --check       only check; changes nothing
#   bash install.sh --no-restart  install; the filter is used the next time drive-sync.sh starts
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
TAG=drive-sync-20261003
BK=/workspace/backups/$TAG
FILES="tools/drive-sync.sh"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/4 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/patch.py" || fail "the update files are damaged. Download them again."
grep -q '^- \*\*$' "$HERE/drive-sync.filter" && grep -q '^- /.secrets/\*\*$' "$HERE/drive-sync.filter" \
  || fail "drive-sync.filter is damaged. Download it again."
CLERK_ROOT=/workspace python3 "$HERE/patch.py" --check || fail "nothing was changed. Send the lines above to Claude."
if [ "${1:-}" = "--check" ]; then say ""; say "CHECK OK. Run it again without --check to install."; exit 0; fi

say "== 2/4 Backing up to $BK (and *.bak-20261003-drivesync next to each file)"
mkdir -p "$BK"
for f in $FILES; do
  if [ ! -e "$BK/$f" ]; then mkdir -p "$BK/$(dirname "$f")"; cp -p "/workspace/$f" "$BK/$f"; fi
  [ -e "/workspace/$f.bak-20261003-drivesync" ] || cp -p "/workspace/$f" "/workspace/$f.bak-20261003-drivesync"
done
cp "$HERE/undo.sh" "$BK/undo.sh"

say "== 3/4 Installing"
install -m 644 "$HERE/drive-sync.filter" /workspace/tools/drive-sync.filter
CLERK_ROOT=/workspace python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }
sh -n /workspace/tools/drive-sync.sh || { bash "$BK/undo.sh" --quiet; fail "drive-sync.sh check failed, everything was put back."; }

say "== 4/4 Drive sync loop"
if [ "${1:-}" != "--no-restart" ]; then
  # Only the loop itself (/bin/sh ./drive-sync.sh), found by exact command line; waits for a pass in progress to end.
  for p in $(pgrep -x -f '/bin/sh (\./|/workspace/tools/)drive-sync[.]sh'); do
    for i in $(seq 1 60); do pgrep -P "$p" -x rclone >/dev/null || break; sleep 10; done
    if pgrep -P "$p" -x rclone >/dev/null; then say "   a Drive pass is still running after 10 minutes; not restarting (the filter is used next start)"; continue; fi
    C=$(pgrep -P "$p" -x sleep); kill "$p" 2>/dev/null && say "   stopped the old drive-sync loop (pid $p)"; [ -n "$C" ] && kill $C 2>/dev/null
  done
  sleep 1
  if ! pgrep -f 'drive-sync[.]sh' >/dev/null; then
    (cd /workspace/tools && nohup ./drive-sync.sh >/dev/null 2>&1 &) && say "   started drive-sync.sh (the supervisor keeps watching it)"
  fi
fi
say ""
say "DONE. Backup: $BK   To undo: bash $BK/undo.sh"
