# sentlog-20261003: one send log for every email and Telegram message

Audit 2026-10-03 (M5, part): failures were invisible. Now every outgoing email and Telegram send appends one line to
`/workspace/logs/sent.log`:

    2026-10-03T03:40:12+01:00  email  monthend.py>mailer.py  divine@…  September 2026 remittance check  ok

Tab-separated: ISO time, channel (`email`/`telegram`), job, recipient(s), subject or short label (Telegram: the guard
key, e.g. `rrr:602757:2026-09`, or `bot sendMessage`), `ok` / `failed` / `skipped`, error. **Never the message body,
never a secret** (anything shaped like a bot token is masked). The first write in a new month renames the file to
`sent-YYYY-MM.log`. A logging problem never blocks a send. Job = `CLERK_JOB` if set, else the script that started the
helper (e.g. `monthend.py>mailer.py`). `python3 /workspace/tools/sentlog.py tail 50` shows the latest lines.

Covered: `tools/mailer.py` (all email: monthend, monthclose, satinfo, stmt-runner, att-watch… go through it; refused
and switched-off emails are logged as failed / skipped), the m2fix "already in Gmail Sent" case (skipped),
`telegram/tg.py call()` send methods, `send_msg.py` (messages and documents), `send_doc.py`, and the upload bot's own
sends in `srcdoc/poller.py` (after its next restart). `drive-sync.sh` syncs all of /workspace with no exclude matching
`logs/`, so the log goes to Drive (if the sync is narrowed later, as audit M4 suggests, keep `logs/`).

**Install** (after m2fix-20261003): `bash install.sh --check`, then `bash install.sh`. `test_sentlog.py` is offline
(mocked SMTP and Telegram, temp log folder). Undo: `bash /workspace/backups/sentlog-20261003/undo.sh`.

Older whole-file installers (e.g. `box/monthend-20261001`, `box/c2fix-20261003` backups) would remove this; re-run
m2fix and this installer afterwards.
