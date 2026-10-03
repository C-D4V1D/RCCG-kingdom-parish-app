# month-parishes-20261003: /month for another parish

**What changes for people using the bot**

- For a person with **Automations → People → "Can view other parishes' month (/month)"** ticked, `/month` asks
  "Which month?" with one more button: **🏛 Other parishes »**. It lists Kingdom Parish first, then every active parish
  in Automations → Parishes (one button each). Tapping a parish asks "<Parish>: which month?" with **This month**,
  **Previous months »** (the same number of months as Kingdom's, from Automations → Telegram bot) and **« Parishes**.
  The screen is the same month screen the parish's own pastor gets (Sunday records, remittance, attendance, next step).
  Kingdom Parish shows the usual Kingdom screen. A satellite parish's screen can take about a minute (the parish app is read).
- **Everyone else: no change.** `/month`, "This month", "Previous months" and `/month 2026-09` stay Kingdom Parish's.
  The satellite parishes' pastors keep seeing only their own parish (the setting is only on the People list, not on the
  parish cards, and the box ignores it for parish people).
- **Checked on every press.** The setting is read again from the box's copy of the app settings each time a button is
  pressed, so switching it off in the app stops the next press (about 5 minutes for a Save to reach the box). A refused
  press shows "This isn't available for you."

**The setting** (`people[].month_all_parishes`, saved with the rest of People, like "Pays the RRR"): true or false.
Before a person has been saved with it, the app shows it ticked only for the IT admin's entry and the box treats it as on
only for the admin (People → full status), so nothing changes for anyone else until someone ticks it. The box also accepts
a list of parish codes there (only those parishes are offered, Kingdom Parish always), so a later app version can narrow
it per parish without another box change; the app saves true/false for now.

**Files changed** (one anchored patch, all or nothing; see `patch.py`): `telegram/srcdoc/poller.py` (a block before
`main()` that wraps the bot's `handle_message` / `handle_callback` for `/month` and the new `mpar|…` buttons; everything
else goes to the existing code). New: `tools/monthpick.py` (who may pick which parishes, the buttons, and the satellite
screen worked out in its own process with `satinfo.py month`). Nothing is added to the 5-minute cycle and no
`satbot.py`, `satinfo.py` or `monthinfo.py` code changes.

**Install on the box.** You need botmenu-20261003 installed first. Don't run this between 07:25 and 09:05. Paste this:
```bash
cd /tmp && rm -rf month-parishes-20261003 && mkdir month-parishes-20261003 && cd month-parishes-20261003 && B=https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/month-parishes-20261003 && \
for f in SHA256SUMS patch.py monthpick.py install.sh undo.sh README.md; do curl -fsSO "$B/$f" || echo "MISSING $f"; done && \
sha256sum -c SHA256SUMS && bash install.sh --check
```
If it ends with "CHECK OK", run `bash install.sh`. It backs up `poller.py` first, runs an offline test (made-up people,
parishes and chats; nothing is read from the app, nothing is sent), prints who can pick which parishes, and restarts the
bot (it waits for any upload in progress). No message is sent and the (/) menus are not changed.
`python3 /workspace/tools/monthpick.py show` prints the list again at any time.

**Undo:** `bash /workspace/backups/month-parishes-20261003/undo.sh` puts `poller.py` back and restarts the bot
(`/month` is then Kingdom Parish only for everyone).
