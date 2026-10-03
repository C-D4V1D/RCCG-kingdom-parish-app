# Clerk box: install order

**On a working box, do not re-run anything here.** Every installer below is already on the box. To change the box,
write a NEW small patch installer (see "Making a box change" at the end).

## Retired installers (do not run)

These copy whole files over the box. Newer installers changed the same files afterwards, so running one again would
put back an older copy and undo newer fixes. Their `install.sh` now stops straight away and changes nothing. It runs
only with `FORCE_OLD_INSTALLER=1`, and then it prints which newer installers must be re-run afterwards.

| Installer | What it would undo |
|---|---|
| `automations-20260928` | overwrites `tools/clerkcfg.py` (every later clerkcfg change) |
| `monthend-20261001` | overwrites `tools/clerkcfg.py` and `tools/monthend.py` (parishes, c2fix, checkpeople, m2fix, sentlog) |
| `cleanup-20260928` | overwrites `tools/clerkcfg.py`, `tools/supervisor.sh` and `tools/drive-sync.sh` (records … checkpeople; monthclose, parishes, restart, appbackup; drive-sync) |
| `reminders-20260929` | overwrites `tools/monthinfo.py` (monthclose, records, menu-refine) |
| `monthclose-20260930` | overwrites `tools/monthinfo.py` and `tools/supervisor.sh` (records, menu-refine; parishes, restart, appbackup) |
| `records-20260928` | overwrites `tools/clerkcfg.py` and `tools/monthinfo.py` (menu-refine, bankbalance…, parishes, c2fix, checkpeople) |
| `menu-refine-20260928` | resets the bot's Telegram (/) menu to a fixed list without `/balance` (bankbalance) |

The others only add new files that nothing changed later, plus anchored patches that skip a file that already has
their marker. Re-running one changes no files (checked on a copy of the box, 2026-10-03). It still restarts things
and sends test messages, so don't re-run them without a reason either.

## Fresh box: the full chain, in order

This order reproduces the box exactly as it was on 2026-10-03, 03:40 BST (see "How this was checked").
Download each folder from `https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/<folder>/`,
`cd` into it, run `bash install.sh --check` first, then run the command shown. Never run between 07:25 and 09:05.

| # | Folder | Command |
|---|---|---|
| 1 | `automations-20260928` | `FORCE_OLD_INSTALLER=1 bash install.sh` |
| 2 | `monthend-20261001` | `FORCE_OLD_INSTALLER=1 bash install.sh` |
| 3 | `cleanup-20260928` | `FORCE_OLD_INSTALLER=1 bash install.sh` |
| 4 | `healthfix-20260928` | `python3 fix.py` |
| 5 | `reminders-20260929` | `FORCE_OLD_INSTALLER=1 bash install.sh` |
| 6 | `monthclose-20260930` | `FORCE_OLD_INSTALLER=1 bash install.sh` |
| 7 | `records-20260928` | `FORCE_OLD_INSTALLER=1 bash install.sh` |
| 8 | `menu-refine-20260928` | `FORCE_OLD_INSTALLER=1 bash install.sh` |
| 9 | `bankbalance-20260929` | `bash install.sh` |
| 10 | `bankbalance-fastcheck-20261001` | `bash install.sh` |
| 11 | `parishes-20261003` | `bash install.sh` |
| 12 | `bankbalance-reconcile-20261001` | `bash install.sh` |
| 13 | `restart-20261003` | `bash install.sh` |
| 14 | `appbackup-20261003` | `bash install.sh` |
| 15 | `c2fix-20261003` | `bash install.sh` |
| 16 | `checkpeople-20261003` | `bash install.sh` |
| 17 | `m2fix-20261003` | `bash install.sh` |
| 18 | `sentlog-20261003` | `bash install.sh` |
| 19 | `drive-sync-20261003` | `bash install.sh` |
| 20 | `botmenu-20261003` | `bash install.sh` |

In a fresh build the retired steps print a "re-run afterwards" warning. You can ignore it there, because the later steps
come next anyway. Add every new installer to the end of this table in the same PR that adds it.

**Starting point.** Step 1 patches the box's original scripts, which are not in this repo (`tools/common.py`,
`mailer.py`, `health.py`, `stmt-runner.py`, `telegram/send_msg.py`, `tg.py`, `tg_msgs.py`, `srcdoc/poller.py`,
`boxsched.py`, `rccg-remit/*`, …). A fresh box starts from the Google Drive mirror (`Clerk Box/workspace`). The
pre-change copies are in the box's `/workspace/backups/<installer>/` folders, which the mirror also holds.

## How this was checked

On 2026-10-03 the chain was replayed on a copy, never on the box. A sandbox `CLERK_ROOT` was seeded with the earliest
backed-up copy of every file from `/workspace/backups/<installer>/`. Each step's whole-file installs and
`CLERK_ROOT=<sandbox> python3 patch.py` were then run in the order above. All 39 files the chain writes came out
byte-identical to the live `/workspace/tools`, `/workspace/telegram` and `/workspace/rccg-remit`. Their checksums are in
[`INSTALL-ORDER.sha256`](INSTALL-ORDER.sha256). After a rebuild, run `cd /workspace && sha256sum -c
<path>/INSTALL-ORDER.sha256` to check the box.

`drive-sync-20261003` (step 19, `tools/drive-sync.sh` + the new `tools/drive-sync.filter`) went onto the box at 03:45
BST, after that replay. Its `patch.py` was run on the backed-up `drive-sync.sh` and came out byte-identical to the box's
file, so `INSTALL-ORDER.sha256` now lists 40 files.

`botmenu-20261003` (step 20: the bot's per-person menus and screens) was tested on exact copies of the live
`clerkcfg.py`, `monthinfo.py`, `clerkinfo.py`, `satinfo.py`, `satbot.py` and `srcdoc/poller.py`, whose checksums
matched `INSTALL-ORDER.sha256`. Once it is installed on the box, update those six sums and add `tools/botmenu.py`.

## Making a box change

Add a NEW dated folder with a small `patch.py` (anchored, all-or-nothing, skips files with its marker), an `install.sh`
that checks first (`--check`), backs up every file it touches to `/workspace/backups/<tag>/`, and an `undo.sh`. Never
ship a whole copy of a file that already exists on the box. Regenerate `SHA256SUMS`. Then add the folder to the table
above.
