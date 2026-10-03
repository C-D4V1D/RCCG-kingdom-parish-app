# checkpeople-20261003: the remittance check goes to whoever Automations routes it to

**Before:** `make-check-email.py`, `tg_msgs.py check` and `monthend.send_checks()` used a fixed list: David and
Bro. Divine with buttons, and the pastor without. A new Kingdom person with **buttons** on got signed links from the
app (PR #371) but no check email. On Telegram they only got the pastor's no-button text (added by `send_msg.py`).

**Now** (Automations is the source of truth):
- `clerkcfg.check_people("email"|"telegram")` lists the Kingdom people with `routing.remittance_check` switched on for
  that channel, in the app's people order, each once. Without settings it falls back to David, Bro. Divine and the pastor.
- `make-check-email.py` writes one personal email for each person on that list who has an address. A person gets
  buttons only if their `buttons` flag is on **and** the app signed links for them. The "who can confirm" wording is
  built from those people; it is word-for-word the same as before for David and Bro. Divine.
- `tg_msgs.py check` builds one message for each person routed on Telegram. Buttons follow the same rule; everyone
  else gets the information-only text.
- `monthend.send_checks()` sends exactly the people `make-check-email.py` wrote (`check-summary.json` "recipients").
  Each is sent once per round, and the c2fix guards still apply: one address per check email, buttons refused for
  flag-off people, the routing filter never adds anyone.

With today's settings the emails are byte-for-byte the same as before, and so are the Telegram messages
(`test_c2.py` section 6).

**Install:** `bash install.sh --check`, then `bash install.sh`. It needs c2fix-20261003, and the offline test is
`../c2fix-20261003/test_c2.py`, which sends nothing. **Undo:** `bash /workspace/backups/checkpeople-20261003/undo.sh`.
