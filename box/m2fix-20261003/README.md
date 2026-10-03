# m2fix-20261003: a month-end email retry checks Gmail Sent first

**The bug (audit 2026-10-03, M2).** `monthend.mail()` retried a failed send once without looking at Gmail Sent. If
Gmail accepted the first try but the SMTP connection then timed out, the retry sent the same email twice.

**The fix.**
- `mailer.py sent --payload <payload.json> --minutes N`: the payload's subject and its recipients *after the same
  Automations routing `send` applies* (`CLERK_MSG_TYPE`, `CLERK_PERSONAL`), searched in Gmail Sent (IMAP, read-only)
  for messages Gmail received in the last N minutes. `FOUND` only when the subject is identical **and** one of those
  recipients is on the sent copy. The old `mailer.py sent <text> [--days N]` works as before.
- `monthend.py mail()`: before the retry it runs that check with the window starting just before the first try
  (whole minutes + 2). `FOUND` -> logged, not resent, counted as sent. `NONE` -> retried as before. If Sent can't be
  read, the retry goes ahead as before (logged). Refused emails (exit 3) are still never retried.

**Install on the box** (needs c2fix-20261003): `bash install.sh --check`, then `bash install.sh`. `test_m2.py` is an
offline test with mocked SMTP/IMAP; it sends nothing. To undo: `bash /workspace/backups/m2fix-20261003/undo.sh`.

Note: older installers copy whole files: `box/monthend-20261001/install.sh` installs its own `monthend.py` (and
`clerkcfg.py`). Re-running it would remove this fix (and c2fix / checkpeople / parishes); run this one again afterwards.
