#!/usr/bin/env python3
"""Statement day + Sunday records reminders (records-20260928). All or nothing.

  python3 patch.py --check    only test that every change fits the files on this box (changes nothing)
  python3 patch.py            apply (each file is changed only if EVERY change for EVERY file fits and compiles)

A change finds its line by content (spaces don't matter) and must find it exactly once (or the n-th time when given).
Files that already carry the marker are skipped, so running it twice is safe."""
import os, py_compile, re, shutil, subprocess, sys, tempfile

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "records-20260928"


def norm(s):
    return re.sub(r"\s+", " ", s.strip())


P = {}

# stmt-runner.py: the statement goes out N days after the cut-off Sunday (Automations > Monthly statement), and if the
# box missed that day it catches up for the set number of days. make-statement.js already takes --today (its due check
# asks "was yesterday a cut-off?") and --month (the period ending that month's cut-off), so it needs no change.
P["tools/stmt-runner.py"] = [
    ("before", "def cycle():", [
        "def due_check():  # " + MARK + ": N days after the cut-off (Automations), catching up for the set days",
        "    n = max(1, int(C.num(\"automations.statement.days_after_cutoff\", 1)))",
        "    k = max(1, int(C.num(\"automations.statement.catchup_days\", 7)))",
        "    sent = load(\"state/sent.json\", [])",
        "    for back in range(n, n + k):",
        "        day = (datetime.date.today() - datetime.timedelta(days=back - 1)).isoformat()",
        "        r = run([\"node\", \"make-statement.js\", \"--check-due\", \"--today\", day], FIN, 120)",
        "        if r[0] == 10:",
        "            continue",
        "        if r[0] != 0:",
        "            return r",
        "        d = js(r[1]) or {}",
        "        if any(e.get(\"period_from\") == d.get(\"from\") and e.get(\"period_to\") == d.get(\"to\") for e in sent):",
        "            continue",
        "        return r",
        "    return 10, \"\", \"\"",
        "",
        ""]),
    ("replace", 'rc, out, err = run(["node", "make-statement.js", "--check-due"], FIN, 120)', [
        "rc, out, err = due_check()  # " + MARK]),
    ("replace", 'rc, out, err = run(["node", "make-statement.js", "--live"], FIN, 1200)', [
        'rc, out, err = run(["node", "make-statement.js", "--live", "--month", to[:7]], FIN, 1200)  # ' + MARK + ": the due period, whatever today is"]),
]

# boxsched.py (the scheduler's back-up that wakes the Clerk AI when the statement is due and not sent): due on the same
# day as the runner, else it would wake the AI on the Monday while the runner waits for the set day.
P["telegram/srcdoc/boxsched.py"] = [
    ("replace", 'due = [p for p in ps if p["cutoff"] + dt.timedelta(days=1) <= today <= p["cutoff"] + dt.timedelta(days=catchup)]', [
        'off = max(1, int(cfg().get("statement_offset_days", 1)))  # ' + MARK + ": N days after the cut-off (Automations)",
        'due = [p for p in ps if p["cutoff"] + dt.timedelta(days=off) <= today <= p["cutoff"] + dt.timedelta(days=off + catchup - 1)]']),
    ("replace", 'nxt = min((p for p in ps if p["cutoff"] + dt.timedelta(days=1) > today), key=lambda p: p["cutoff"], default=None)', [
        'nxt = min((p for p in ps if p["cutoff"] + dt.timedelta(days=off) > today), key=lambda p: p["cutoff"], default=None)']),
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
