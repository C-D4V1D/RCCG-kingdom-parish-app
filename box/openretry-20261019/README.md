# openretry-20261019: the box retries a month-end run by itself when the portal opens

Problem: a run that stops at "1e pre-check: remittance not open" is marked failed and never retried (WEBHOOK-RUN.md,
monthend.py "not retried automatically"). Someone has to re-send the signal.

What it does (tools/openretry.py, cron every 30 min, off until `install.sh --enable`):
- Finds a failed entry whose failure is the not-open pre-check and that holds a saved cut-off signal.
- Reads the cut-off date from the app's own setting (monthinfo.period_for_month, GET only). No portal check before it.
- From that date: `api-fill.js precheck` (read-only). Exit 10 = not open: silent. Other API trouble: silent, tries again.
- Open: writes a once-only marker, sends David one Telegram line, then calls monthend.live_cutoff with the saved signal and
  the app's period (new period key if the cut-off day moved; otherwise the old entry goes `held` and the existing
  resume path runs). It fills the portal and stops at the same confirmations as any run. It does not touch submit logic.
- A run that stops notifies by itself (stop()). The timer itself pings a Healthchecks URL after each clean pass
  (`/fail` on an exception); the check's URL goes in /home/ubuntu/.config/clerkbox/openretry.hc.
- Before starting it runs the same check as the app's earlier-Sundays gate: every Sunday of the period (including one on the cut-off date) must have a saved collection (monthinfo.facts/missing_collections). If one is missing it holds, tells David once (key per missing set) and keeps checking every 30 min; when saved it starts.
- It will not start if the saved signal has no app-signed button links or they expired (the box cannot mint them).
- Uses monthend's lock, so it never overlaps a run.

Tests: `python3 test_openretry.py` (13 tests). Mutation checks: without the date gate, the once-only marker, the links guard, the missing-Sunday hold, or the +1 day (Sunday on the cut-off date) a test fails. NOT tested: the real live_cutoff after an open portal (stubbed), the real Telegram send, the live cron.
Undo: `bash install.sh --disable`, then restore backups/openretry-20261019.
