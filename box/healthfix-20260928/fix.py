#!/usr/bin/env python3
"""Weekly health note: stop listing "Attendance watch" (att-watch.py was removed by cleanup-20260928, so the note
showed it as DOWN every week). One exact change to /workspace/tools/health.py; all or nothing; backup first.

  python3 fix.py --check   only check (changes nothing)
  python3 fix.py           apply (safe to run twice)
  python3 fix.py --undo    put the backed-up health.py back"""
import os, py_compile, shutil, sys, tempfile

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "healthfix-20260928"
F = os.path.join(ROOT, "tools/health.py")
BK = os.path.join(ROOT, "backups", MARK, "health.py")
OLD = '("Attendance watch", "att-watch.py"), '


def main(a):
    if a == "--undo":
        if not os.path.exists(BK): sys.exit(f"No backup at {BK}")
        shutil.copy2(BK, F); print("UNDONE: health.py put back"); return
    src = open(F).read()
    if MARK in src:
        print("health.py: already fixed"); return
    if src.count(OLD) != 1:
        sys.exit(f"STOPPED: health.py doesn't look as expected (found the Attendance watch entry {src.count(OLD)} times). Nothing changed.")
    new = src.replace(OLD, "", 1).rstrip("\n") + f"\n# {MARK}\n"
    fd, tmp = tempfile.mkstemp(suffix=".py"); os.close(fd)
    try:
        open(tmp, "w").write(new)
        py_compile.compile(tmp, doraise=True)
    except py_compile.PyCompileError as e:
        sys.exit(f"STOPPED: the fixed file would not run ({e}). Nothing changed.")
    finally:
        os.unlink(tmp)
    if a == "--check":
        print("CHECK OK: health.py can be fixed. Run again without --check."); return
    os.makedirs(os.path.dirname(BK), exist_ok=True)
    if not os.path.exists(BK): shutil.copy2(F, BK)
    open(F + ".tmp", "w").write(new); shutil.copymode(F, F + ".tmp"); os.replace(F + ".tmp", F)
    print("FIXED: the weekly health note no longer lists Attendance watch. Undo: python3 fix.py --undo")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "")
