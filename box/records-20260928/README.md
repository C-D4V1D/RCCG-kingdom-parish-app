# records-20260928: statement send day + Sunday records reminders

- **Statement day**: `stmt-runner.py` asks `make-statement.js --check-due --today <day>` for each of the last
  `days_after_cutoff .. days_after_cutoff + catchup_days - 1` days, so the statement goes out N days after the cut-off
  Sunday (Automations > Monthly statement) and catches up if the box missed that day; `--live --month <YYYY-MM>` builds
  the due period whatever today is. `boxsched.py` (the Clerk AI back-up) uses the same day via `sched_config.json`
  (`statement_offset_days`, `statement_catchup_days`, written by `clerkcfg.py apply`).
- **Sunday records reminders** (`monthinfo.py`): one list per Sunday, collection first ("attendance, then collection" /
  "collection (attendance ✅)") plus the Monthly report from the cut-off week. Weekly message (reminders.py), 2nd
  reminder, cut-off Sunday evening, and daily for `collection_reminders.after_days` days after the cut-off. The app is
  read at most once per slot a day.

Install: `bash install.sh --check`, then `bash install.sh` (not 07:25–09:05). Undo: `bash /workspace/backups/records-20260928/undo.sh`.
