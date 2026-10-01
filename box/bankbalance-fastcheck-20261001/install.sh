#!/bin/bash
# Clerk box: near-instant pickup of a bank-balance Refresh request (bankbalance-fastcheck-20261001).
#   bash install.sh           install (backs up first; safe to run twice)
#   bash install.sh --check   only check; changes nothing
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
BK=/workspace/backups/bankbalance-fastcheck-20261001
FILES="tools/clerkcfg.py telegram/srcdoc/poller.py"
say() { printf '%s\n' "$*"; }
fail() { say ""; say "STOPPED: $*"; exit 1; }

say "== 1/5 Checking"
(cd "$HERE" && sha256sum -c --quiet SHA256SUMS) || fail "the update files did not download completely. Download them again."
python3 -m py_compile "$HERE/patch.py" || fail "the update files are damaged. Download them again."
grep -q bankbalance-20260929 /workspace/tools/clerkcfg.py || fail "the bankbalance-20260929 update is not installed on this box yet. Install that first."
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
python3 "$HERE/patch.py" || { bash "$BK/undo.sh" --quiet; fail "patching failed, everything was put back."; }

say "== 4/5 Restarting the Telegram bot so it picks up the faster check"
(nohup setsid bash /workspace/telegram/srcdoc/ensure_running.sh --restart >/dev/null 2>&1 < /dev/null &)

say "== 5/5 Done. Nothing more to test here — press Refresh in the app in a minute or two and watch it update."
say ""
say "Backup: $BK   To undo: bash $BK/undo.sh"
