# greetings-20261003: each person is greeted by their own name

**What changes for people getting the Sunday-records reminders**

- The weekly Monday message and the 2nd reminder start with "Good morning" and **the reader's own name**, for example
  "Good morning Bro. Ade," or "Good morning Pastor Demo,". Before, Kingdom Parish's messages were always addressed to one
  fixed person, and a satellite parish's messages greeted *everyone* in that parish (and anyone else who got a copy) with the
  first listed person's name.
- The name is the one in the app: **Automations → People → "Called"** for that person. If "Called" is empty, the box uses
  the name in brackets ("Full Name (Sis. Demo)"), then the first word of their name (a title such as "Pastor" or "Bro."
  stays with the next word). If the person isn't in People, or has no name there, the message simply starts
  "Good morning,". To change how someone is greeted, change their "Called" in People; nothing is typed into the code.
- It works the same for Telegram messages and for the emails to people who have no Telegram yet.
- Two other Kingdom Parish messages that used the same fixed greeting (source documents still empty on the portal, and the
  Monday attendance reminder) are greeted the same way.
- Wording, days, times, who is routed to receive what, and the "only once" rules are **not** changed. Messages that have
  no greeting (the cut-off Sunday evening message, the daily messages after the cut-off, the copies and late alerts) are sent
  exactly as before.

**How it is sent.** A message that has a greeting now goes to each person as their own message (before, one message went to
everyone at once). The "already sent" record is kept per person and per message, as before, so nothing that went out earlier
today is sent again after the change, and a person who already has today's message never gets a second one.

**Files changed** (anchored patches, all or nothing; see `patch.py`): `tools/monthinfo.py` (the reminder text now starts with
the plain greeting), `tools/reminders.py` (Kingdom Parish's sending), `tools/satinfo.py` (the satellite parishes' sending).
New: `tools/greet.py`, which works out each person's name from Automations → People. Nothing is restarted; the reminders
start fresh each 5-minute cycle.

**Install on the box.** You need botmenu-20261003 installed first. Don't run this between 07:25 and 09:05. Paste this:
```bash
cd /tmp && rm -rf greetings-20261003 && mkdir greetings-20261003 && cd greetings-20261003 && B=https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/greetings-20261003 && \
for f in SHA256SUMS patch.py greet.py install.sh undo.sh README.md; do curl -fsSO "$B/$f" || echo "MISSING $f"; done && \
sha256sum -c SHA256SUMS && bash install.sh --check
```
If it ends with "CHECK OK", run `bash install.sh`. It backs up the three files first, runs an offline test with made-up people,
and prints how each person in People is greeted. Please send a screenshot of that list.

**Undo:** `bash /workspace/backups/greetings-20261003/undo.sh` puts the three files back (the greeting then goes back to the old,
fixed names).

Not changed here: who the weekly attendance reminder and the source-documents reminder go to (they are still addressed to the
person with the key `divine` in People, as before; their routing is the one set in Automations).
