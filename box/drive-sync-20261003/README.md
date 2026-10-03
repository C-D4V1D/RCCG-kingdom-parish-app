# drive-sync-20261003: the Google Drive copy holds parish/Clerk files only

**The problem.** `tools/drive-sync.sh` copied the whole of `/workspace` to Google Drive (`Clerk Box/workspace`). The
box is shared with other agents, so that included job-hunt files (JobTracker sheets, scout and sweep folders,
`jobhunt/`), other agents' tool output, Python environments and git clones of this app.

**The fix.** `drive-sync.sh` now uses `--filter-from /workspace/tools/drive-sync.filter` instead of its list of
`--exclude` options. The filter names what goes to Drive and skips everything else (`- **` at the end).

- **Copied:** `config.json`, `tools/`, `telegram/`, `logs/`, `backups/`, `app-backups/`, `state/`, `updates/`,
  `rccg-attendance/`, `rccg-memos/`, `rccg-remit/`, `rccg-portal/`, `rccg-sat/`, `rccg-verify/`, `fin-statement/`,
  `sample-20260926/`, `example-20260926/`, `m2fix-20261003/`, `sentlog-20261003/`, `perf-auth/`, `pr-finance-auth/`,
  and a few root files (`finance-auth-plan.md`, `AUDIT-2026-10-03.md`, the September remittance memo PDF, and the root
  `install.sh` / `patch.py` / `undo.sh` / `SHA256SUMS` of bankbalance-reconcile-20261001).
- **Never copied (as before):** `.secrets/`, Python environments, `node_modules`, `__pycache__`, `.git`, the rclone
  program, `tools/*.log`, `tools/.*`, locks, pid and temp files.
- **No longer copied:** job-hunt files and folders, `agent-tools/`, `.playwright-mcp/`, `venv-*`, the app git clones
  (`rccg-app*`, `pr313`, `kp-app-webhook-test`, `repo-audit-*`; they are on GitHub) and the 46 MB
  `rccg-portal-capture/`. A new folder is not copied until it is added to the filter.

**Nothing is deleted from Drive.** It is still `rclone sync`, without `--delete-excluded`, so rclone does not look at
skipped files on Drive and leaves the copies already there. Checked with a dry run on 2026-10-03: 0 deletions. Never add
`--delete-excluded`. Parish files deleted on the box still move to `Clerk Box/_replaced`, as before.

**Install on the box:** `bash install.sh --check`, then `bash install.sh`. It restarts only the drive-sync loop (after
any Drive pass in progress), and the supervisor keeps watching it. To undo: `bash /workspace/backups/drive-sync-20261003/undo.sh`.

Note: `box/cleanup-20260928/install.sh` (retired) installs a whole `drive-sync.sh`. If it is ever re-run, run this one
again afterwards.
