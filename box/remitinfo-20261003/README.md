# remitinfo-20261003: /month shows the RRR, the amount remitted and whether it is paid

**Why September showed none.** The REMITTANCE section only looked at the box's own records: the RRR file the box writes
when *it* generates an RRR (`rccg-remit/runs/rrr-YYYY-MM.json`) and the Remita checks the box makes after that
(`state/monthclose.json`). Kingdom Parish's September RRR was generated outside the automation, so neither file exists and
the screen only said "Month-end: no box run recorded (done outside the automation)". For a satellite parish the box looked
for its RRR file under `rccg-sat/<code>/remit/runs/`, while the RRRs made for them are kept in `rccg-remit/runs/`, so they
never showed either.

**What changes on the /month screen** (Kingdom Parish and every parish in the "Other parishes" picker or a pastor's own bot):

- **RRR**: from the RCCG portal's invoices for the month (the same read-only call the month-end uses before any RRR
  step: `api-fill.js invoices`). Else the box's own RRR file.
- **Amount remitted** (when paid, including the Remita fee) or **Amount to remit** (and the amount with the fee): from the
  portal. Else the parish app's Remittances (Part A, paid, same period). Else the box's RRR file.
- **Paid**: from the portal (PAID / not paid yet). Else "recorded as paid in the parish app on <date>". Else the box's
  Remita check. When the app also has the payment, the line adds "recorded in the parish app on <date>".
- Every line says where it came from: (RCCG portal), (parish app) or (Clerk box). The portal wins when sources disagree.
- **Month-end** no longer repeats the RRR: "✅ RRR generated (outside the automation)" or "✅ RRR generated".
- **Next step** follows the same answer: "Nothing. The RRR is paid ✅." or who has to pay it (Automations → People).

**Speed.** The portal is asked only after the cut-off Sunday (no RRR can exist before), takes about 3 seconds, and its
answer is kept in `/workspace/state/remitinfo-cache.json`: a PAID month for 30 days, anything else for 30 minutes, a failed
read for 10 minutes (then the app and the box's files are used). The app's Remittances are one extra read on a past month.
Nothing is added to the 5-minute cycle. Read-only everywhere; nothing is sent.

**Files changed** (anchored patches, all or nothing; see `patch.py`): `tools/monthinfo.py`, `tools/satinfo.py`.
New: `tools/remitinfo.py`.

**Install on the box.** You need month-parishes-20261003 installed first. Don't run this between 07:25 and 09:05. Paste this:
```bash
cd /tmp && rm -rf remitinfo-20261003 && mkdir remitinfo-20261003 && cd remitinfo-20261003 && B=https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/remitinfo-20261003 && \
for f in SHA256SUMS patch.py remitinfo.py install.sh undo.sh README.md; do curl -fsSO "$B/$f" || echo "MISSING $f"; done && \
sha256sum -c SHA256SUMS && bash install.sh --check
```
If it ends with "CHECK OK", run `bash install.sh`. It backs up the two files, runs an offline test (made-up invoices and
months; nothing read, nothing sent) and restarts the bot. `python3 /workspace/tools/remitinfo.py show 602757 2026-09`
prints what the portal says for a month.

**Undo:** `bash /workspace/backups/remitinfo-20261003/undo.sh` puts the two files back and restarts the bot.
