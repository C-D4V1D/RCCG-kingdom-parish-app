# Clerk box: Telegram bot menu refinements (menu-refine-20260928)

> **RETIRED (2026-10-03).** Do not run this `install.sh` on the box: newer installers changed the same files and it would undo them. It stops unless `FORCE_OLD_INSTALLER=1`. See [`box/INSTALL-ORDER.md`](../INSTALL-ORDER.md).


A review of the bot's `/help` list and `/status` output turned up: `/status` promised "deadlines... and statement"
but never showed remittance at all; no section showed the period's total collection or amount remitted; `/month` and
`/statement` were type-the-month-yourself with no way to browse previous ones; and `/paid` / `/cancel` cluttered the
Telegram "/" menu despite already riding along on inline buttons. This bundle fixes all of that, code only (no new
app settings).

- `patch.py` (anchored, all or nothing):
  - `tools/monthinfo.py`: new `collection_total(f)`, the period's total Sunday-collection amount (sums the app's
    `totalCollection` on `sunday_collection` income records within the period).
  - `tools/clerkinfo.py`: new `sent_statements()`, the full sent-statement history newest-first (`latest_statement()`
    only ever gave the last one).
  - `telegram/srcdoc/poller.py`:
    - `/help`: commands reordered (status, month, statement, refresh, paid, cancel, help) and re-worded to match.
    - `/status`: new REMITTANCE section (cut-off date, total collection, remittance state, amount remitted once an
      RRR exists) sourced from `monthinfo.month_end_line()` / `monthclose.months_with_rrr()`. Sections reordered to
      Remittance, Attendance, Source documents, Monthly statement, Memos (was Source documents, Attendance, ...).
    - `/month`: now "This month" / "Previous months" (last 6, as buttons) instead of plain text; typing
      `/month 2026-09` still works.
    - `/statement`: now "Latest" / "Previous statements" (last 6, as buttons) instead of always the latest.
- Telegram `/` menu (`setMyCommands`, install step 5/6): rebuilt to `status, month, statement, refresh, help` —
  `/paid` and `/cancel` are dropped from the tap list since both already surface elsewhere (an "I've paid" button
  under every RRR message, a "Cancel" button at every upload step); typing either still works exactly as before.

Requires `monthclose-20260930` already installed (uses `monthclose.naira()` / `monthclose.months_with_rrr()`).

Install (never between 07:25 and 09:05):
```bash
cd /tmp && rm -rf mr1 && mkdir mr1 && cd mr1 && B=https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/menu-refine-20260928 && \
for f in SHA256SUMS patch.py install.sh undo.sh; do curl -fsSO "$B/$f" || echo "MISSING $f"; done && \
sha256sum -c SHA256SUMS && bash install.sh --check
```
then `bash install.sh`. Undo: `bash /workspace/backups/menu-refine-20260928/undo.sh`.
