# Clerk box: Automations update (2026-09-28)

> **RETIRED (2026-10-03).** Do not run this `install.sh` on the box: newer installers changed the same files and it would undo them. It stops unless `FORCE_OLD_INSTALLER=1`. See [`box/INSTALL-ORDER.md`](../INSTALL-ORDER.md).


Connects the Clerk box's runners to the church app's **Automations** tab. After it's installed:

- The box sends a status report every 10 minutes, and the dashboard shows it.
- The box fetches the settings you save in the app within 5 minutes and uses them. Until the first save, it keeps its built-in values and nothing changes.

It patches these box scripts: `common.py`, `mailer.py`, `tgcard.py`, `health.py`, `reminders.py`, `stmt-runner.py`, `att-watch.py`, `supervisor.sh`, `drive-sync.sh`, `send_msg.py`, `poller.py`, `imgproc.py` and `memo-runner.sh`. It also adds `tools/clerkcfg.py`.

## Install (on the box)

```bash
mkdir -p /workspace/updates/automations-20260928 && cd /workspace/updates/automations-20260928 && \
for f in install.sh undo.sh clerkcfg.py patch.py supervisor.sh SHA256SUMS; do \
  curl -fsSLO "https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/automations-20260928/$f" || break; done && \
bash install.sh --check
```

If that ends with `CHECK OK`, run `bash install.sh`.

## Safety

- **Checks before changing anything:** the installer verifies the files' checksums, then checks that every change fits this box's files. If one change doesn't fit, it changes nothing.
- **Backup:** every original file is copied to `/workspace/backups/automations-20260928/` first.
- **Timing:** it refuses to run between 07:25 and 09:05, when the statement and memo checks run.
- **Undo:** `bash /workspace/backups/automations-20260928/undo.sh`

## Update: clerkcfg.py fix (2026-09-28)

Boxes installed before this fix: the upload-bot restart after a settings change now runs in the background instead of holding up the supervisor for up to 2 minutes. To apply it:

```bash
cd /workspace/updates/automations-20260928 && curl -fsSLO "https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/automations-20260928/clerkcfg.py" && curl -fsSLO "https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/box/automations-20260928/SHA256SUMS" && sha256sum -c --ignore-missing SHA256SUMS && install -m 755 clerkcfg.py /workspace/tools/clerkcfg.py && echo UPDATED
```
