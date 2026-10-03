# c2fix-20261003: personal emails stay personal

**The bug (audit 2026-10-03, C2).** In box month-end mode, `monthend.send_checks()` sends three personal check emails
(David and Bro. Divine with their signed Generate RRR / Refresh buttons; the pastor without buttons). `mailer.py`
ran every email through `clerkcfg.filter_emails()`, which **adds** every person switched on for the message type.
So David's email (with his buttons) also went to Bro. Divine and the pastor, and everyone got three copies.

**The fix.**
- `clerkcfg.filter_emails(..., add_missing=False)` only drops switched-off people and never adds anyone.
- `clerkcfg.button_emails()` returns the addresses of the people with **buttons** on in the app.
- `mailer.py`: a *personal* email (payload `"personal": true` or `CLERK_PERSONAL=1`) is only filtered, and is skipped
  (not sent to anyone) when its person is switched off for that type. An email containing `/remit-action` button
  links is **refused** (exit 3) unless every To/Cc recipient has buttons on. Group emails (RRR, attendance, memo,
  month-close) keep today's behaviour: routing in Automations decides who is on the one email.
- `monthend.py`: the check emails and the webhook-test email are personal; a check email not addressed to exactly
  one person stops the run; a refused email is not retried.

**Install on the box:** `bash install.sh --check`, then `bash install.sh`. The installer runs `test_c2.py`, an
offline test that sends nothing, before and after patching. To undo: `bash /workspace/backups/c2fix-20261003/undo.sh`.

Note: the older installers in `box/*/install.sh` copy whole files (e.g. `monthend-20261001` installs `clerkcfg.py`
and `monthend.py`). Re-running an old installer would remove this fix (and every later patch); run this one again
afterwards.
