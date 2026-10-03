#!/usr/bin/env python3
"""appbackup-20261003: supervisor.sh also runs appbackup.py tick each cycle (it only does something once a week).

  python3 patch.py --check   only check (changes nothing)
  python3 patch.py           apply (a file with the marker is skipped; the block must match exactly once)
The file is replaced atomically (new file + rename), so a supervisor that is running keeps its loop.
"""
import os, sys

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "appbackup-20261003"
CHANGES = {
"tools/supervisor.sh": [
('''  [ -f /workspace/tools/satinfo.py ] && { timeout 300 python3 /workspace/tools/satinfo.py tick >/dev/null 2>&1 || [ $? -ne 124 ] || echo "$(date '+%F %H:%M') satinfo.py took over 5 minutes (stopped)" >> "$LOG"; }
''',
'''  [ -f /workspace/tools/satinfo.py ] && { timeout 300 python3 /workspace/tools/satinfo.py tick >/dev/null 2>&1 || [ $? -ne 124 ] || echo "$(date '+%F %H:%M') satinfo.py took over 5 minutes (stopped)" >> "$LOG"; }
  [ -f /workspace/tools/appbackup.py ] && { timeout 600 python3 /workspace/tools/appbackup.py tick >/dev/null 2>&1 || [ $? -ne 124 ] || echo "$(date '+%F %H:%M') appbackup.py took over 10 minutes (stopped)" >> "$LOG"; }  # appbackup-20261003
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
