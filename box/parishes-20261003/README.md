# Clerk box: satellite parishes (parishes-20261003)

Satellite parishes now get the same help Kingdom Parish gets:

- month-end (cut-off, RRR), the RRR message with "I've paid", and the month-close checklist;
- Sunday records reminders and the late alert;
- the bot: their people join with their invite link and upload source documents, and see /month, /status and /paid,
  for their own parish only.

Satellite people never get Kingdom Parish's messages, and Kingdom's people are not mixed into theirs.
Set the parishes and their people up in the app: Automations > Parishes.

Files (all go to `/workspace/tools/` except `patch.py`, which changes four existing box files):
`satinfo.py`, `satclose.py`, `satbot.py`, `satmonthend.py`, `sat-fetch.cjs`. The box makes its own key
(kept only on the box); the app shows the public half.

Needs the month-close update (monthclose-20260930) and the month-end update first. Install (never between 07:25 and 09:05):
```bash
cd /tmp && rm -rf parishes-20261003 && mkdir parishes-20261003 && cd parishes-20261003 && B=https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/parishes-20261003 && \
for f in SHA256SUMS patch.py satinfo.py satclose.py satbot.py satmonthend.py sat-fetch.cjs install.sh undo.sh; do curl -fsSO "$B/$f" || echo "MISSING $f"; done && \
sha256sum -c SHA256SUMS && bash install.sh --check
```
then `bash install.sh`. Undo: `bash /workspace/backups/parishes-20261003/undo.sh`.
