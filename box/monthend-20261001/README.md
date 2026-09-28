# Clerk box: month-end runner (monthend-20261001)

Lets the Clerk box do the monthly remittance itself, as a script, instead of the Clerk AI. Until David switches
Automations → Settings → Remittance (month-end) → "Month-end run by" to **Clerk box**, the box only does a
**practice run** each month next to the Clerk AI's real one and tells David on Telegram whether it matched.

| File | What it is |
|---|---|
| `monthend.py` | the runner (→ `/workspace/tools/monthend.py`): WEBHOOK-RUN.md / REPLY-RUN.md as a script |
| `clerkcfg.py` | settings helper (→ `/workspace/tools/clerkcfg.py`): now also fetches the month-end mailbox, applies the Remittance lines, reports the Month-end card |
| `MONTHEND-AI.md` | what the Clerk AI reads when the box asks it for help (→ `/workspace/tools/`) |
| `patch.py` | anchored all-or-nothing edits: `rccg-remit/remit_match.py` (app lines override), `rccg-remit/api-fill.js` (categories sharing a line are added) |
| `install.sh`, `undo.sh` | install with backups to `/workspace/backups/monthend-20261001`; undo |

How it runs: `supervisor.sh` already runs `clerkcfg.py sync` every 5 minutes. `sync` copies new signals from the
Worker mailbox (`GET /events`) into `/workspace/state/monthend/inbox/` and starts `monthend.py run` (detached, locked).
Status for the app: `/workspace/state/monthend/status.json` → `health.remittance` and the Month-end card.
Log: `/workspace/state/monthend/log.txt` plus the usual `rccg-remit/state/run-log.txt`.

Tests: `tests/box-monthend.test.js` (runs these files against a fake /workspace with stub scripts).

Install (never between 07:25 and 09:05):
```bash
cd /tmp && rm -rf me && mkdir me && cd me && B=https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/monthend-20261001 && \
for f in SHA256SUMS clerkcfg.py monthend.py MONTHEND-AI.md patch.py install.sh undo.sh; do curl -fsSO "$B/$f" || echo "MISSING $f"; done && \
sha256sum -c SHA256SUMS && bash install.sh --check
```
then `bash install.sh`. Undo: `bash /workspace/backups/monthend-20261001/undo.sh`.
