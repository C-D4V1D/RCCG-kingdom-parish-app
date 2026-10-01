# bankbalance-20260929 — real RCCG portal bank balance

Ships the box side of the Dashboard/Bank page "real bank balance" feature (app + Worker side already in
PR #342). After this installs, the box:

- Checks the real balance on `new-portal.rccg.org` roughly twice a day (07:00 and 19:00), reports it to the
  clerk-watchdog Worker (`POST /bank-balance`), and the app's Dashboard and Bank page show it.
- Runs the same check immediately whenever someone presses **Refresh** on either page (the app drops a
  `bank_balance_refresh_requested` signal in the Worker's `/events` mailbox; `clerkcfg.py sync` — already
  running every cycle — picks it up and runs the check, instead of treating it as a month-end signal).
- Adds a `/balance` command to the Telegram bot: checks now, replies with the figure, and updates the app
  the same way.

## What it reuses

`tools/bankbalance.cjs` (new file) calls `rccg-portal/portal-api.js`'s existing `login()` — the same login
already used for the remittance/statement features — then a plain `GET /transaction/getAccountBalance` on
the FIN v3 API. No "switch active role" step is needed; confirmed from the live file that `login()`'s token
is used directly for FIN calls already. The Kingdom Parish bank account number (`1473624487`, Access Bank
PLC) is hardcoded the same way `PARISH` codes are hardcoded in `portal-api.js` — there's no sealed-constant
slot for this in the app's config, and it isn't expected to change.

## Files changed

- `tools/clerkcfg.py` (patch): adds `start_balance_check()` / `due_balance_check()`, branches
  `bank_balance_refresh_requested` events away from the month-end inbox, and starts the twice-daily check
  from `sync()`.
- `telegram/srcdoc/poller.py` (patch): adds `/balance`.
- `tools/bankbalance.cjs` (new file): the actual check + report script.

## Install

Never between 07:25 and 09:05 (statement/memo runs).

```bash
cd /tmp && rm -rf bb && mkdir bb && cd bb && B=https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/bankbalance-20260929 && \
for f in SHA256SUMS bankbalance.cjs patch.py install.sh undo.sh; do curl -fsSO "$B/$f" || echo "MISSING $f"; done && \
sha256sum -c SHA256SUMS && bash install.sh --check
```

then `bash install.sh`.

Undo: `bash /workspace/backups/bankbalance-20260929/undo.sh`
