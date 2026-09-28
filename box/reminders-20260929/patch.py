#!/usr/bin/env python3
"""Collection reminders and the bot's /month (reminders-20260929). All or nothing.

  python3 patch.py --check    only test that every change fits the files on this box (changes nothing)
  python3 patch.py            apply (each file is changed only if EVERY change for EVERY file fits and compiles)

A change finds its line by content (spaces don't matter) and must find it exactly once (or the n-th time when given).
Files that already carry the marker are skipped, so running it twice is safe."""
import os, py_compile, re, shutil, subprocess, sys, tempfile

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "reminders-20260929"


def norm(s):
    return re.sub(r"\s+", " ", s.strip())


P = {}

# reminders.py: missing Sunday collections join Bro. Divine's Monday attendance message (one message), and the other
# collection reminders (2nd reminder, cut-off Sunday evening, Monday after the cut-off) come from monthinfo.ladder().
P["tools/reminders.py"] = [
    ("after", "import clerkcfg as C  # automations-20260928", [
        "try:  # " + MARK + ": Sunday collection reminders (monthinfo.py)",
        "    import monthinfo as MI",
        "except Exception:",
        "    MI = None"]),
    ("replace", "t = divine_att_msg()", [
        "t = divine_att_msg()",
        "if MI is not None:  # " + MARK + ": missing Sunday collections go in the same Monday message",
        "    try: t = MI.monday_msg(t, MI.facts())",
        "    except Exception: pass"]),
    ("before", '^if C.enabled("weekly_attendance_reminder")', [
        "if MI is not None:  # " + MARK + ": 2nd collection reminder, cut-off Sunday evening, Monday after the cut-off",
        "    try: MI.ladder(now, tg, once, C)",
        "    except Exception: pass"]),
]

# clerkinfo.py (/status): attendance filed with the month-end run counts as filed (att-watch.py is gone).
P["tools/clerkinfo.py"] = [
    ("after", 'if m in runs: L.append(f"{lab}: filed on the portal"); continue', [
        "try:  # " + MARK + ": filed with the month-end run",
        "    import monthinfo as _MI; _a = _MI.att_filed(m)",
        '    if _a: L.append(f"{lab}: {_a}"); continue',
        "except Exception: pass"]),
]

# att-refresh.py (the bot's /refresh): a month filed by att-fill.js from the month-end run can be refreshed too.
P["tools/att-refresh.py"] = [
    ("replace", 'if m not in runs: out("error", "This month wasn\'t filed by this flow, so it can\'t be refreshed here.")', [
        'if m not in runs and not os.path.exists(f"runs/att-submit-{m}.json"): out("error", "This month wasn\'t filed by this flow, so it can\'t be refreshed here.")',
        'runs.setdefault(m, {"status": "filed", "by": "month-end run"})  # ' + MARK]),
    ("replace", 'runs = load("state/att-runs.json", {})', [
        'runs = load("state/att-runs.json", {}); runs.setdefault(m, {"status": "filed", "by": "month-end run"})  # ' + MARK], 2),
]

# poller.py (the Telegram bot): /month, and /refresh also finds months filed with the month-end run.
P["telegram/srcdoc/poller.py"] = [
    ("after", '"/statement - the latest financial statement (link + PDF)\\n"', [
        '"/month - this month\'s remittance: collections, attendance, month-end (/month 2026-09 for another)\\n"']),
    ("before", "def cmd_statement(chat):", [
        "def cmd_month(chat, arg):  # " + MARK,
        "    try:",
        "        import monthinfo as MI",
        '        send(chat, "Reading the parish app...")',
        '        m = arg if re.fullmatch(r"\\d{4}-\\d{2}", arg or "") else None',
        "        send(chat, MI.month_text(MI.facts(month=m, prefer_open=True)), html=True)",
        "    except Exception:",
        '        log("month cmd error", traceback.format_exc()[-600:]); send(chat, "Sorry, I couldn\'t read the month\'s status right now.")',
        "",
        ""]),
    ("before", 'if cmd.split()[0] == "/refresh":', [
        'if cmd.split()[0] == "/month":  # ' + MARK,
        '    threading.Thread(target=cmd_month, args=(cid, (t.split() + [""])[1]), daemon=True).start(); return']),
    ("replace", 'm = arg if re.fullmatch(r"\\d{4}-\\d{2}", arg or "") else (sorted(runs)[-1] if runs else None)', [
        '_filed = set(runs) | {f[11:18] for f in (os.listdir("/workspace/rccg-attendance/runs") if os.path.isdir("/workspace/rccg-attendance/runs") else []) if re.fullmatch(r"att-submit-\\d{4}-\\d{2}\\.json", f)}  # ' + MARK,
        'm = arg if re.fullmatch(r"\\d{4}-\\d{2}", arg or "") else (sorted(_filed)[-1] if _filed else None)']),
    ("replace", "if not m or m not in runs:", ["if not m or m not in _filed:"]),
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
