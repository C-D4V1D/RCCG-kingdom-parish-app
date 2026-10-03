# botmenu-20261003: the Telegram bot's new menus and screens

**What changes for people using the bot**

- **Everyone gets their own (/) menu**, showing only the commands they can use. Who sees what is set in the app
  (Automations → Telegram bot). People the bot doesn't know see a small menu (month, help).
- **One main screen: /month.** "📅 Kingdom Parish · September 2026": the period, a table of the Sundays (collection and
  attendance), the Monthly report, REMITTANCE (total collection, month-end, RRR paid or not, amount), ATTENDANCE FILING,
  SOURCE DOCUMENTS and a **Next step** line saying who has to do what. The buttons "This month" and "Previous months »"
  stay, and `/month 2026-09` still works. `/status` still works when typed and shows the same screen.
- **Source documents** on the portal are slow to check (about a minute), so by default the screen has a button
  "🔎 Check upload slots on the portal". The app can switch this to "always" or "off".
- **New commands:** `/upload` (the steps for uploading a source document), `/system` (admin only: the behind-the-scenes
  part of the old /status: box health, every parish's source documents, attendance runs, statement, memos, bank check).
  `/statement 2026-09` now works too.
- **/help** lists only the person's own commands, then one line about sending photos or PDFs.
- If someone types a command that isn't theirs: "This isn't available for you. Use /help to see your commands."
- Someone the bot doesn't know gets one polite reply a day (can be switched off in the app) naming who to contact.
- **Satellite parishes' pastors** get the same screens, with their parish's name, and no Kingdom-only commands.
  Their wording no longer mentions email or Automations.
- **No names in the code.** "Next step" names the people from Automations → People (the accountant, the people who pay
  the RRR, the people with the Generate RRR button, the admin). Same icons everywhere: ✅ done · ⚠️ needs action ·
  ⏳ waiting · ❌ missing. One date style: "Sun 27 Sep", "closes 30 Sep".

**Settings** (`automations.telegram_bot`, read by `clerkcfg.bot_settings()`; without them the box uses these defaults):
`menu` = month everyone, upload everyone, paid payers, statement kingdom, balance kingdom, refresh admin, system admin,
help everyone (everyone · kingdom · payers · admin · off); `previous_months` 6 (3–12); `month_portal_check` button
(always · off); `reply_unknown` on; `unknown_contact` "the parish IT administrator". Upload also needs "can upload" on
the person; statement, balance, refresh and system are always Kingdom Parish only.

**How the menus reach Telegram.** `tools/botmenu.py` (new) works out each person's menu. The bot checks two file dates
on every poll (the config and the satellite links). When one changes, it works the menus out again in the background
and only calls Telegram if they really changed (`/workspace/state/botmenu.json` keeps a fingerprint). If Telegram
fails, it tries again an hour later. Nothing is added to the 5-minute cycle. `python3 /workspace/tools/botmenu.py show`
prints who gets which commands.

**Files changed** (anchored patches, all or nothing; see `patch.py`): `tools/clerkcfg.py`, `tools/monthinfo.py`,
`tools/clerkinfo.py`, `tools/satinfo.py`, `tools/satbot.py`, `telegram/srcdoc/poller.py`. New: `tools/botmenu.py`.

**Install on the box.** You need sentlog-20261003 installed first. Don't run this between 07:25 and 09:05. Paste this:
```bash
cd /tmp && rm -rf botmenu-20261003 && mkdir botmenu-20261003 && cd botmenu-20261003 && B=https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/botmenu-20261003 && \
for f in SHA256SUMS patch.py botmenu.py install.sh undo.sh README.md; do curl -fsSO "$B/$f" || echo "MISSING $f"; done && \
sha256sum -c SHA256SUMS && bash install.sh --check
```
If it ends with "CHECK OK", run `bash install.sh`. It backs up every file first, runs an offline test, restarts the bot
and sends the menus. Then, in Telegram, close and reopen the chat with the bot and send /help.

**Undo:** `bash /workspace/backups/botmenu-20261003/undo.sh` puts back the old single menu and the old files, then
restarts the bot.

Not changed here: the upload preview still shows the portal's closing date as given by the portal, and the Sunday
records reminders (`monthinfo.records_msg`) keep their wording.
