# srcdocinfo-20261003: SOURCE DOCUMENTS on /month, attendance filing from the portal

**What changes on the /month screen** (Kingdom Parish, every parish in the "Other parishes" picker, and a pastor's own bot).
The order follows the remittance procedure: REMITTANCE, ATTENDANCE FILING, then the new **SOURCE DOCUMENTS**, then Next step.

- **SOURCE DOCUMENTS**, for that parish and month: one line each for **Admin** and **Finance**:
  "✅ uploaded Sun 27 Sep", "⚠️ not uploaded yet (upload open until Sat 3 Oct)", "⏳ the portal needs the month's financial
  report first", "⏳ the portal's upload isn't open yet", "❌ not uploaded; the portal isn't taking uploads now". Each line
  ends with its source: **(RCCG portal)** (read-only), or **(Telegram bot's records)** (the bot's own upload log) when the
  portal can't be read. A parish with "Source documents" off in Automations → Parishes gets no section. Automations →
  Telegram bot → "Check portal upload slots on the Month screen" = Never: only the bot's records are used. The old
  "tap the button to check the upload slots" note is gone (the button still works).
- **ATTENDANCE FILING**: when the box has no record of its own (a month done outside the automation, the satellite
  parishes), the portal's stored attendance is shown: "✅ filed on the portal: 4 weeks, last saved Tue 29 Sep (RCCG portal)"
  or, after the cut-off, "⚠️ not filed on the portal yet (RCCG portal)". A month the box filed keeps the box's line.
- **Next step** adds an outstanding upload after the cut-off Sunday: "Upload the Finance source document (the portal
  closes …)". It ends with "with /upload" only for the person looking if they can upload that parish's documents with the
  bot (Automations → People → "Can use the Telegram bot", the Telegram bot menu, and their own parish or admin).

**Speed.** One read-only portal call (`tools/portal-month.cjs`, about 2 seconds) per parish and month, kept in
`/workspace/state/srcdocinfo-cache.json`: for 30 days once both documents are uploaded and attendance is filed, otherwise
30 minutes, a failed read 10 minutes. An upload through the bot makes the next /month read the portal again. Nothing is
added to the 5-minute cycle. Nothing is sent.

**Files changed** (anchored patches, all or nothing; see `patch.py`): `tools/monthinfo.py`, `tools/satinfo.py`,
`tools/satbot.py`, `tools/monthpick.py`, `telegram/srcdoc/poller.py`. New: `tools/srcdocinfo.py`, `tools/portal-month.cjs`.

**Install on the box.** You need remitinfo-20261003 installed first. Don't run this between 07:25 and 09:05. Paste this:
```bash
cd /tmp && rm -rf srcdocinfo-20261003 && mkdir srcdocinfo-20261003 && cd srcdocinfo-20261003 && B=https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/srcdocinfo-20261003 && \
for f in SHA256SUMS patch.py srcdocinfo.py portal-month.cjs install.sh undo.sh README.md; do curl -fsSO "$B/$f" || echo "MISSING $f"; done && \
sha256sum -c SHA256SUMS && bash install.sh --check
```
If it ends with "CHECK OK", run `bash install.sh`. `python3 /workspace/tools/srcdocinfo.py show 602757 2026-09` prints what the
portal and the bot's records say for a month.

**Undo:** `bash /workspace/backups/srcdocinfo-20261003/undo.sh` puts the five files back and restarts the bot.
