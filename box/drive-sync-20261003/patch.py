#!/usr/bin/env python3
"""drive-sync-20261003: drive-sync.sh copies parish/Clerk files only, chosen by tools/drive-sync.filter.

  python3 patch.py --check   only check (changes nothing)
  python3 patch.py           apply (a file with the marker is skipped; each block must match exactly once)

tools/drive-sync.sh: the list of --exclude options is replaced by --filter-from /workspace/tools/drive-sync.filter.
It still runs "rclone sync" WITHOUT --delete-excluded, so files the filter skips that are already on Google Drive stay
there (rclone does not even list them). The file is replaced atomically (new file + rename).
"""
import os, sys

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "drive-sync-20261003"
CHANGES = {
"tools/drive-sync.sh": [
('''#!/bin/sh
''',
'''#!/bin/sh
# drive-sync-20261003: parish/Clerk files only, chosen by /workspace/tools/drive-sync.filter. Files it skips that are
# already on Drive are left alone (sync without --delete-excluded never deletes excluded files). Never add --delete-excluded.
'''),
('''    --exclude "venv*/**" --exclude ".venv*/**" --exclude "node_modules/**" --exclude "__pycache__/**" --exclude ".git/**" \\
    --exclude ".secrets/**" --exclude "heartbeat.json" --exclude "*.lock" --exclude "*.pid" --exclude "nohup.out" --exclude "tools/rclone" --exclude "tools/*.log" --exclude "tools/.*" \\
    --exclude "state/monthend/lock" --exclude "*.tmp" --skip-links \\
''',
'''    --filter-from /workspace/tools/drive-sync.filter --skip-links \\
'''),
('''# cleanup-20260928
''',
'''# cleanup-20260928
# drive-sync-20261003
'''),
],
}


def main():
    check = "--check" in sys.argv
    plan = {}
    for rel, reps in CHANGES.items():
        path = os.path.join(ROOT, rel)
        s = open(path, encoding="utf-8").read()
        if MARK in s:
            print(f"   {rel}: already patched"); continue
        for old, new in reps:
            n = s.count(old)
            if n != 1:
                sys.exit(f"STOP: {rel}: a block to change was found {n} times (expected 1): {old.strip().splitlines()[0][:80]}")
            s = s.replace(old, new)
        if "--delete-excluded" in s.replace("Never add --delete-excluded", "").replace("without --delete-excluded", ""):
            sys.exit(f"STOP: {rel} uses --delete-excluded; it would delete skipped files from Drive.")
        plan[path] = s
        print(f"   {rel}: {len(reps)} change(s) {'would apply' if check else 'ready'}")
    if check:
        return
    for path, s in plan.items():
        tmp = path + ".tmp-" + MARK
        open(tmp, "w", encoding="utf-8").write(s)
        os.chmod(tmp, os.stat(path).st_mode)
        os.replace(tmp, path)
        print(f"   patched {os.path.relpath(path, ROOT)}")


if __name__ == "__main__":
    main()
