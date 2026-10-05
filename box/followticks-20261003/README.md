# followticks-20261003: the weekly Sunday-records message and the memo back-up follow their settings

**What changes**

- **Sunday records: weekly message.** Until now the box sent it only to one built-in person (if ticked), whatever else
  was ticked in Automations → People. After this patch it goes to everyone ticked (Telegram) for "Sunday records: weekly
  message" who has a chat ID, **once the Automations page has been saved** (Save adds
  `automations.weekly_attendance_reminder.follow_ticks = true`). Until then it is exactly as before. The app shows what the
  box really does, so before the first Save only the built-in person shows ticked; saving keeps it that way unless you
  change the ticks.
- **Memo check, Clerk AI back-up.** The scheduler's back-up now only runs on the memo "Days to check" (Automations → Memo
  forwarding). When that setting is missing it stays Monday to Saturday, as before. The Sunday check with the Sunday note
  is unchanged.

Nothing is sent by installing. No extra work is added to any cycle.

**Files changed** (anchored patches, all or nothing; see `patch.py`): `tools/clerkcfg.py`, `tools/reminders.py`,
`telegram/srcdoc/boxsched.py`. `telegram/srcdoc/sched_config.json` gets a `memo_days` entry.

**Install on the box.** You need srcdocinfo-20261003 installed first. Don't run this between 07:25 and 09:05. Paste this:
```bash
cd /tmp && rm -rf followticks-20261003 && mkdir followticks-20261003 && cd followticks-20261003 && B=https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/followticks-20261003 && \
for f in SHA256SUMS patch.py selftest.py install.sh undo.sh README.md; do curl -fsSO "$B/$f" || echo "MISSING $f"; done && \
sha256sum -c SHA256SUMS && bash install.sh --check
```
If it ends with "CHECK OK", run `bash install.sh`. `python3 selftest.py show` prints who gets the weekly message and the
memo days.

**Undo:** `bash /workspace/backups/followticks-20261003/undo.sh` puts the files back and restarts the bot.
