# Clerk box: Sunday collection reminders and the bot's /month (reminders-20260929)

The month-end filing starts only when the cut-off Sunday's collection is saved, and the app refuses that save while an
earlier Sunday of the period has no collection. These reminders make sure nothing is forgotten.

- `monthinfo.py` (new, `/workspace/tools/`): reads the app read-only (automation key): cut-off dates, saved Sunday
  collections, attendance weeks, the Monthly report, plus the month-end record (`rccg-remit/state/remit-runs.json`).
  - `/month` text; `python3 monthinfo.py month [YYYY-MM]`
  - collection reminders (`ladder`): 2nd reminder (default Thursday 10:00, Bro. Divine), cut-off Sunday 20:00 and the
    Monday after 10:00 (Bro. Divine + David) when the cut-off collection is still not saved. Each once; only while
    missing; not once the month-end has started. `python3 monthinfo.py ladder --dry-run` shows what would go out now.
  - reads the app only in those windows, at most every 30 minutes (cache `/workspace/tools/.monthinfo-cache.json`).
- `patch.py` (anchored, all or nothing):
  - `tools/reminders.py`: missing collections join Bro. Divine's Monday attendance message (one message); runs the ladder.
  - `telegram/srcdoc/poller.py`: `/month` (and help text); `/refresh` also finds months filed by the month-end run.
  - `tools/clerkinfo.py` (`/status`): attendance filed with the month-end run shows as filed.
  - `tools/att-refresh.py`: can refresh a month filed by att-fill.js from the month-end run.
- Settings (app → Automations → Settings → Source-doc reminders): "Sunday collection reminders" (on/off, 2nd-reminder
  day, time, cut-off Sunday check time). Routing: message type `collection_reminder` (default David + Bro. Divine).

Install (never between 07:25 and 09:05):
```bash
cd /tmp && rm -rf rm1 && mkdir rm1 && cd rm1 && B=https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/reminders-20260929 && \
for f in SHA256SUMS monthinfo.py patch.py install.sh undo.sh; do curl -fsSO "$B/$f" || echo "MISSING $f"; done && \
sha256sum -c SHA256SUMS && bash install.sh --check
```
then `bash install.sh`. Undo: `bash /workspace/backups/reminders-20260929/undo.sh`.
