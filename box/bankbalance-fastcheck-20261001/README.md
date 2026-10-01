# bankbalance-fastcheck-20261001 — near-instant Refresh pickup

Requires `bankbalance-20260929` to already be installed (reuses its `start_balance_check()`).

Pressing Refresh in the app used to wait for the box's separate 5-minute config/month-end sync
before it was even noticed. This adds a second, independent, much lighter check — piggybacked on
the Telegram bot's own loop, which already runs every few seconds (worst case ~50s when fully
idle) — so a Refresh request is picked up and the portal checked within that same window instead
of up to 5 minutes. It never touches the month-end cursor, inbox, or its cadence — only looks for
`bank_balance_refresh_requested` signals, using its own separate cursor file
(`/workspace/state/bankbalance/cursor`).

- `tools/clerkcfg.py` (patch): adds `balance_events_check()` + `_balance_cursor()`.
- `telegram/srcdoc/poller.py` (patch): calls it once per loop, guarded so it can never disrupt the
  bot's actual messaging (same style as the existing `boxsched.poll_tick()` guard next to it).

No new files, no new secrets, no change to how often the box actually logs into the real RCCG
portal — that still only happens on an actual Refresh, `/balance`, or the twice-daily automatic
check.

## Install

Never between 07:25 and 09:05 (statement/memo runs).

```bash
cd /tmp && rm -rf bbfc && mkdir bbfc && cd bbfc && B=https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/bankbalance-fastcheck-20261001 && \
for f in SHA256SUMS patch.py install.sh undo.sh; do curl -fsSO "$B/$f" || echo "MISSING $f"; done && \
sha256sum -c SHA256SUMS && bash install.sh --check
```

then `bash install.sh`. Undo: `bash /workspace/backups/bankbalance-fastcheck-20261001/undo.sh`.
