#!/bin/bash
# Undo sentlog-20261003: put back the patched files (tools/sentlog.py and /workspace/logs are left; they do nothing alone).
BK=/workspace/backups/sentlog-20261003
for f in tools/mailer.py tools/monthend.py telegram/tg.py telegram/send_msg.py telegram/send_doc.py telegram/srcdoc/poller.py; do
  [ -e "$BK/$f" ] && cp -p "$BK/$f" "/workspace/$f"
done
[ "${1:-}" = "--quiet" ] || echo "Put back from $BK."
