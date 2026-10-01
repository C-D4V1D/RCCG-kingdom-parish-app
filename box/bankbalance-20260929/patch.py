#!/usr/bin/env python3
"""Real RCCG portal bank balance: twice-daily check, Refresh from the app, and the bot's /balance (bankbalance-20260929).
All or nothing.

  python3 patch.py --check    only test that every change fits the files on this box (changes nothing)
  python3 patch.py            apply (each file is changed only if EVERY change for EVERY file fits and compiles)

A change finds its line by content (spaces don't matter) and must find it exactly once (or the n-th time when given).
Files that already carry the marker are skipped, so running it twice is safe."""
import os, py_compile, re, shutil, subprocess, sys, tempfile

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "bankbalance-20260929"


def norm(s):
    return re.sub(r"\s+", " ", s.strip())


P = {}

# clerkcfg.py: a `bank_balance_refresh_requested` mailbox signal is not a month-end signal — it starts
# the balance check directly instead of going to monthend.py. `sync()` also runs the check itself
# roughly twice a day. Reuses the same Worker call style as `_call`/ping (token from TOKEN_FILE).
P["tools/clerkcfg.py"] = [
    ("before", "def start_monthend(*extra):", [
        "BALANCE_DIR = os.environ.get(\"CLERK_BALANCE_DIR\", \"/workspace/state/bankbalance\")  # " + MARK,
        "BALANCE_SCRIPT = os.environ.get(\"CLERK_BALANCE_SCRIPT\", \"/workspace/tools/bankbalance.cjs\")",
        "NODE_BIN = os.environ.get(\"CLERK_NODE\", \"node\")",
        "BALANCE_TIMES = (\"07:00\", \"19:00\")  # roughly twice daily; Refresh / the bot also trigger one",
        "",
        "",
        "def start_balance_check():",
        "    \"\"\"Start the real bank-balance check (detached): Refresh, /balance, or the twice-daily schedule.\"\"\"",
        "    if os.path.exists(BALANCE_SCRIPT):",
        "        subprocess.Popen([NODE_BIN, BALANCE_SCRIPT, \"check\"], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,",
        "                          stderr=subprocess.DEVNULL, start_new_session=True)",
        "",
        "",
        "def due_balance_check():",
        "    \"\"\"True once per scheduled slot per day (BALANCE_TIMES), so sync() starts the twice-daily check.\"\"\"",
        "    t = datetime.datetime.now()",
        "    slot = None",
        "    for hhmm in BALANCE_TIMES:",
        "        if at_or_after(t, hhmm):",
        "            slot = hhmm",
        "    if slot is None:",
        "        return False",
        "    today = t.strftime(\"%F\")",
        "    try:",
        "        marker = json.load(open(os.path.join(BALANCE_DIR, \"last-check.json\")))",
        "    except Exception:",
        "        marker = {}",
        "    if marker.get(\"date\") == today and marker.get(\"slot\") == slot:",
        "        return False",
        "    os.makedirs(BALANCE_DIR, exist_ok=True)",
        "    tmp = os.path.join(BALANCE_DIR, \"last-check.json.tmp\")",
        "    json.dump({\"date\": today, \"slot\": slot}, open(tmp, \"w\"))",
        "    os.replace(tmp, os.path.join(BALANCE_DIR, \"last-check.json\"))",
        "    return True",
        "",
        ""]),
    ("after", "for ev in d.get(\"events\") or []:", [
        "    if ev.get(\"event\") == \"bank_balance_refresh_requested\":  # " + MARK + ": not a month-end signal",
        "        start_balance_check()",
        "        continue"]),
    ("after", 'cv = _call("GET", "/config/version")', [
        "try:  # " + MARK + ": roughly twice-daily automatic check",
        "    if due_balance_check():",
        "        start_balance_check()",
        "except Exception as e:",
        "    print(f\"{datetime.datetime.now():%F %H:%M} bank balance check: {type(e).__name__}: {e}\"[:200])"]),
]

# poller.py (the Telegram bot): /balance checks now and replies with the real figure (also updates the app).
P["telegram/srcdoc/poller.py"] = [
    ("after", '"/statement - the latest financial statement (link + PDF; tap for previous months)\\n"', [
        '"/balance - check the real bank balance from the RCCG portal now\\n"']),
    ("before", "def cmd_paid(chat, month=''):  # monthclose-20260930", [
        "def cmd_balance(chat):  # " + MARK,
        "    import json, shutil, subprocess",
        "    try:",
        '        send(chat, "Checking the real balance on the RCCG portal...")',
        '        node = shutil.which("node") or "node"',
        '        r = subprocess.run([node, "/workspace/tools/bankbalance.cjs", "check"], capture_output=True, text=True, timeout=45)',
        '        lines = [l for l in (r.stdout or "").splitlines() if l.strip()]',
        "        d = json.loads(lines[-1]) if lines else {}",
        '        if d.get("ok"):',
        '            send(chat, f"\U0001f3e6 Real bank balance: ₦{d[\'balance\']:,.2f}\\nThe app\'s Dashboard and Bank page now show this too.")',
        "        else:",
        '            send(chat, f"Sorry, I couldn\'t check the balance just now ({d.get(\'error\') or \'no response\'}).")',
        "    except Exception:",
        '        log("balance cmd error", traceback.format_exc()[-600:]); send(chat, "Sorry, something went wrong checking the balance.")',
        "",
        ""]),
    ("before", 'if cmd.split()[0] == "/refresh":', [
        'if cmd.split()[0] == "/balance":  # ' + MARK,
        '    threading.Thread(target=cmd_balance, args=(cid,), daemon=True).start(); return']),
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
