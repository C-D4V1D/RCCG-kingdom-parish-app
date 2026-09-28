# Clerk box: no more hourly attendance checks (cleanup-20260928)

Attendance is filed with the month-end run (the Clerk AI's WEBHOOK-RUN.md §3-ATT today, or the box's `monthend.py`).
The app only lets the last Sunday collection of the period be saved once every week's attendance, the Monthly report and
every earlier Sunday collection are in, so the separate polling was a duplicate. This bundle:

- `supervisor.sh`: no longer starts `att-watch.py` (hourly portal checks + the "not ready" reminders); the installer stops it.
- `clerkcfg.py` (the newest version; replaces the monthend-20261001 copy):
  - always writes `"attendance": false` to the scheduler's `sched_config.json` (boxsched's attendance polling and its
    `attendance_ready` / `attendance_not_ready` wakes stop; the scheduler re-reads that file every minute);
  - the Attendance card reports the month-end runs' attendance result (`state/remit-runs.json`);
  - `health.remittance.portal_lines` falls back to the newest `rccg-remit/runs/portal-items-YYYY-MM.json`, so the app's
    Remittance lines list shows the lines actually on the portal;
  - `clerkcfg.py apply` rewrites sched_config.json from the saved settings.
- `drive-sync.sh`: also skips `.venv` folders (a Python environment made one pass take hours) and links; every pass
  is recorded (`.last-sync` when clean, `.sync-error` otherwise), shown on the Drive sync card.
- `supervisor.sh`: the settings sync and status report run before the slower jobs (health note, reminders), which get a
  4-minute limit; slow cycles are logged.
- Kept: Bro. Divine's Monday "attendance not yet in the app" reminder (`reminders.py`, weekly_attendance_reminder).

Install (never between 07:25 and 09:05):
```bash
cd /tmp && rm -rf cu && mkdir cu && cd cu && B=https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/cleanup-20260928 && \
for f in SHA256SUMS clerkcfg.py supervisor.sh drive-sync.sh install.sh undo.sh; do curl -fsSO "$B/$f" || echo "MISSING $f"; done && \
sha256sum -c SHA256SUMS && bash install.sh --check
```
then `bash install.sh`. Undo: `bash /workspace/backups/cleanup-20260928/undo.sh`.
