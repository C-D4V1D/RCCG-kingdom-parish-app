# appbackup-20261003: weekly app backup to Google Drive

**Why.** The app's data lives only in Cloudflare. Cloudflare's own history goes back 7–30 days. If the account were
lost, the books would be lost too. This keeps a weekly copy of everything on the box, which drive-sync already copies
to Google Drive.

**What it does.**
- `tools/appbackup.py tick` runs every supervisor cycle and makes a backup once a week. It skips 07:00–09:30 and
  retries 6 hours after a failure. The backup is the app's own "Download full backup" (`GET /api/admin/backup`, read
  with the box's read-only automation key): every table of Kingdom's database and of each satellite parish, without
  PINs or sign-in secrets.
- The file is saved as `/workspace/app-backups/rccg-full-backup-YYYY-MM-DD.json.gz` (written to a `.tmp` file first,
  which drive-sync skips). The newest 12 are kept on the box; an older file is pruned on the box but moved to
  Drive's `Clerk Box/_replaced` rather than deleted.
- The state is kept in `/workspace/state/appbackup.json` and the log in `tools/appbackup.log`. The app shows the date
  of the last weekly backup under IT Admin → Backup & Restore.
- To restore: download the file from Drive, then app → IT Admin → Backup & Restore → Restore from backup file.

**Install** (needs restart-20261003): `bash install.sh --check`, then `bash install.sh`. It makes the first backup
straight away and restarts only the supervisor. **Undo:** `bash /workspace/backups/appbackup-20261003/undo.sh`.
