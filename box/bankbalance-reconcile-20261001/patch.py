#!/usr/bin/env python3
"""Dynamic balance-check times from automations settings (bankbalance-reconcile-20261001). All or nothing.

  python3 patch.py --check    only test that every change fits the files on this box (changes nothing)
  python3 patch.py            apply (each file is changed only if EVERY change for EVERY file fits and compiles)

Requires bankbalance-20260929 to already be installed (it adds BALANCE_TIMES and due_balance_check(), which this reuses).

A change finds its line by content (spaces don't matter) and must find it exactly once (or the n-th time when given).
Files that already carry the marker are skipped, so running it twice is safe."""
import os, py_compile, re, shutil, subprocess, sys, tempfile

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "bankbalance-reconcile-20261001"


def norm(s):
    return re.sub(r"\s+", " ", s.strip())


P = {}

# clerkcfg.py: dynamic balance check times, with fallback to fixed BALANCE_TIMES. Reads from
# automations.supervisor config (balance_check_interval_minutes, balance_check_active_from,
# balance_check_active_until); when any setting is missing/invalid/unsaved, falls back to the old
# twice-daily times. due_balance_check() calls the new function instead of using the static tuple.
P["tools/clerkcfg.py"] = [
    ("after", 'BALANCE_TIMES = ("07:00", "19:00")  # roughly twice daily; Refresh / the bot also trigger one', [
        "",
        "",
        "def balance_check_times():",
        "    \"\"\"Today's balance-check times, from automations.supervisor config",
        "    (balance_check_interval_minutes, balance_check_active_from, balance_check_active_until) — a dense",
        "    list of HH:MM slots across the active window, one gap apart. Falls back to the old fixed twice-daily",
        "    BALANCE_TIMES when any of the three settings is missing/unsaved, invalid, or the window doesn't make",
        "    sense (bankbalance-reconcile-20261001).\"\"\"",
        "    mins = num(\"automations.supervisor.balance_check_interval_minutes\", None)",
        "    start = get(\"automations.supervisor.balance_check_active_from\", None)",
        "    end = get(\"automations.supervisor.balance_check_active_until\", None)",
        "    if not mins or mins <= 0 or not start or not end:",
        "        return list(BALANCE_TIMES)",
        "    sh, sm = hm(start, \"06:00\")",
        "    eh, em = hm(end, \"22:00\")",
        "    start_min, end_min = sh * 60 + sm, eh * 60 + em",
        "    if end_min <= start_min:",
        "        return list(BALANCE_TIMES)",
        "    out = []",
        "    t = start_min",
        "    while t < end_min:",
        "        out.append(f\"{t // 60:02d}:{t % 60:02d}\")",
        "        t += int(mins)",
        "    return out or list(BALANCE_TIMES)",
        ""]),
    ("replace", "^    for hhmm in BALANCE_TIMES:", [
        "for hhmm in balance_check_times():"]),
]


def apply_ops(text, ops, name):
    nl = "\r\n" if "\r\n" in text else "\n"
    lines = text.split(nl)
    for spec in ops:
        op, anchor, new = spec[0], spec[1], spec[2]
        nth = spec[3] if len(spec) > 3 else None
        pre = anchor.startswith("^")
        a = norm(anchor[1:] if pre else anchor)
        hits = [i for i, l in enumerate(lines) if (norm(l).startswith(a) if pre else norm(l) == a)]
        if nth is not None:
            if len(hits) < nth:
                raise ValueError(f"{name}: line not found (#{nth}): {anchor[:70]}")
            i = hits[nth - 1]
        else:
            if len(hits) != 1:
                raise ValueError(f"{name}: expected 1 match, found {len(hits)}: {anchor[:70]}")
            i = hits[0]
        ind = re.match(r"[ \t]*", lines[i]).group(0)
        block = [ind + x if x else x for x in new]
        if op == "replace":
            lines[i:i + 1] = block
        elif op == "before":
            lines[i:i] = block
        elif op == "after":
            lines[i + 1:i + 1] = block
    out = nl.join(lines)
    if not out.endswith(nl):
        out += nl
    return out + (("// " if name.endswith(".js") else "# ") + MARK + nl)


def check_syntax(path, name):
    if name.endswith(".py"):
        py_compile.compile(path, doraise=True)
    elif name.endswith(".js"):
        r = subprocess.run(["node", "--check", path], capture_output=True, text=True)
        if r.returncode:
            raise ValueError(f"{name}: javascript syntax: {r.stderr.strip()[:200]}")
    else:
        shell = "sh" if open(path).readline().startswith("#!/bin/sh") else "bash"
        r = subprocess.run([shell, "-n", path], capture_output=True, text=True)
        if r.returncode:
            raise ValueError(f"{name}: shell syntax: {r.stderr.strip()[:200]}")


def main():
    check = "--check" in sys.argv
    tmp = tempfile.mkdtemp(prefix="clerk-patch-")
    staged, skipped, errors = [], [], []
    for name, ops in P.items():
        src = os.path.join(ROOT, name)
        try:
            text = open(src, encoding="utf-8").read()
        except Exception as e:
            errors.append(f"{name}: cannot read ({e})"); continue
        if MARK in text:
            skipped.append(name); continue
        try:
            out = apply_ops(text, ops, name)
            dst = os.path.join(tmp, name.replace("/", "__"))
            open(dst, "w", encoding="utf-8").write(out)
            check_syntax(dst, name)
            staged.append((src, dst, name))
        except Exception as e:
            errors.append(str(e).splitlines()[0][:300])
    if errors:
        print("NOT CHANGED. These changes did not fit this box's files:")
        for e in errors: print("  -", e)
        shutil.rmtree(tmp, ignore_errors=True); sys.exit(1)
    if check:
        print(f"CHECK OK: {len(staged)} file(s) would be changed" + (f", {len(skipped)} already done" if skipped else ""))
        shutil.rmtree(tmp, ignore_errors=True); return
    for src, dst, name in staged:
        shutil.copymode(src, dst)
        os.replace(dst, src) if os.stat(src).st_dev == os.stat(dst).st_dev else shutil.copyfile(dst, src)
        print("patched", name)
    for name in skipped: print("already patched", name)
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
