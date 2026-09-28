# Clerk box: RRR payment check and the month-close checklist (monthclose-20260930)

- `remita-check.cjs` (→ `/workspace/tools/`): read-only check on remita.net/pay/pay-rrr (headless Chromium from
  `/workspace/tools/pw`). Remita's answer to the page's lookup: status "23" "Transaction already processed" = paid.
- `monthclose.py` (→ `/workspace/tools/`, run by `supervisor.sh` every cycle as `monthclose.py tick`):
  - "✅ I've paid" under the RRR Telegram message (payers only) or `/paid` → checks Remita at once; paid → everyone gets
    "PAID by <who> (<title>)" + the checklist; not yet → only the payer is told, re-checked at the check times.
  - check times (default 10:00, 14:00, 18:00) until Remita shows it paid; payer "not recorded" if nobody tapped.
  - warning N days (default 2) before the portal closes if something is still open; "month-close COMPLETE" once.
  - checklist: remittance filed, paid, attendance, source docs (Admin/Finance, portal read once a day), recorded in the
    app (Remittances, read-only), CSR (placeholder). State: `/workspace/state/monthclose.json`, log `monthclose.log`.
- `monthinfo.py`: `/month` shows the payment ("paid ✅ (Fabian)").
- `patch.py`: `telegram/send_msg.py` (the button for payers on `rrr:` messages; callback-only buttons allowed for anyone),
  `telegram/srcdoc/poller.py` (`/paid`, the button, help line; works for payers who can't otherwise use the bot).
- `supervisor.sh`: adds `monthclose.py tick` (10-minute limit).
- Settings (app → Automations): People → Title, Called in messages, Pays the RRR, Can use the Telegram bot;
  "Month-close checklist & payment" section; message type `month_close` (default everyone, Telegram + email).

Install (never between 07:25 and 09:05):
```bash
cd /tmp && rm -rf mc && mkdir mc && cd mc && B=https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/monthclose-20260930 && \
for f in SHA256SUMS remita-check.cjs monthclose.py monthinfo.py supervisor.sh patch.py install.sh undo.sh; do curl -fsSO "$B/$f" || echo "MISSING $f"; done && \
sha256sum -c SHA256SUMS && bash install.sh --check
```
then `bash install.sh`. Undo: `bash /workspace/backups/monthclose-20260930/undo.sh`.
