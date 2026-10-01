#!/usr/bin/env python3
"""Near-instant pickup of a bank-balance Refresh request (bankbalance-fastcheck-20261001). All or nothing.

  python3 patch.py --check    only test that every change fits the files on this box (changes nothing)
  python3 patch.py            apply (each file is changed only if EVERY change for EVERY file fits and compiles)

Requires bankbalance-20260929 to already be installed (it adds start_balance_check(), which this reuses).

A change finds its line by content (spaces don't matter) and must find it exactly once (or the n-th time when given).
Files that already carry the marker are skipped, so running it twice is safe."""
import os, py_compile, re, shutil, subprocess, sys, tempfile

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "bankbalance-fastcheck-20261001"


def norm(s):
    return re.sub(r"\s+", " ", s.strip())


P = {}

# clerkcfg.py: a lightweight, independent check for a bank_balance_refresh_requested signal, using
# its own cursor file (never touches the month-end cursor/inbox or its 5-minute cadence). Meant to
# be called much more often than sync() — from the Telegram bot's own already-running loop.
P["tools/clerkcfg.py"] = [
    ("before", "def due_balance_check():", [
        "BALANCE_CURSOR = os.path.join(BALANCE_DIR, \"cursor\")  # " + MARK,
        "BALANCE_CHECK_TIMEOUT = 4  # seconds — must never meaningfully stall the Telegram bot's own loop",
        "BALANCE_CHECK_MIN_GAP = 5  # seconds between attempts, even if the loop iterates faster than this",
        "_balance_check_last_attempt = [0.0]",
        "",
        "",
        "def _balance_cursor():",
        "    try:",
        "        return open(BALANCE_CURSOR).read().strip()",
        "    except Exception:",
        "        return None",
        "",
        "",
        "def _call_fast(method, path):",
        "    \"\"\"Like _call(), but with a short timeout and no raise — only for balance_events_check(),",
        "    so a slow or unreachable Worker can never meaningfully stall the Telegram bot's own loop.\"\"\"",
        "    tok = _token()",
        "    if not tok:",
        "        return None",
        "    req = urllib.request.Request(WORKER + path, headers={\"x-watchdog-token\": tok, \"User-Agent\": UA}, method=method)",
        "    try:",
        "        with urllib.request.urlopen(req, timeout=BALANCE_CHECK_TIMEOUT) as r:",
        "            return json.load(r)",
        "    except Exception:",
        "        return None",
        "",
        "",
        "def balance_events_check():",
        "    \"\"\"Lightweight, frequent check for a bank_balance_refresh_requested signal, independent of",
        "    the 5-minute config/month-end sync. Called from the Telegram bot's own loop (poller.py) so",
        "    pressing Refresh in the app is picked up within a few seconds, worst case under a minute,",
        "    instead of waiting up to 5 minutes. Never touches the month-end cursor or inbox. Uses a short",
        "    timeout and a minimum gap between attempts, so a slow/unreachable Worker can never stall the",
        "    bot's own message handling.\"\"\"",
        "    now = datetime.datetime.now().timestamp()",
        "    if now - _balance_check_last_attempt[0] < BALANCE_CHECK_MIN_GAP:",
        "        return",
        "    _balance_check_last_attempt[0] = now",
        "    cv = _call_fast(\"GET\", \"/config/version\")",
        "    if cv is None:",
        "        return",
        "    last = cv.get(\"events_last\")",
        "    cur = _balance_cursor()",
        "    if cur is None:",
        "        if last:",
        "            os.makedirs(BALANCE_DIR, exist_ok=True)",
        "            open(BALANCE_CURSOR, \"w\").write(last)",
        "        return",
        "    if not last or last <= cur:",
        "        return",
        "    d = _call_fast(\"GET\", \"/events?after=\" + urllib.request.quote(cur))",
        "    if d is None:",
        "        return",
        "    triggered = any(ev.get(\"event\") == \"bank_balance_refresh_requested\" for ev in (d.get(\"events\") or []))",
        "    nxt = str(d.get(\"last\") or cur)",
        "    if nxt != cur:",
        "        tmp = BALANCE_CURSOR + \".tmp\"; open(tmp, \"w\").write(nxt); os.replace(tmp, BALANCE_CURSOR)",
        "    if triggered:",
        "        start_balance_check()",
        "",
        ""]),
]

# poller.py (the Telegram bot): the bot's main loop already calls boxsched.poll_tick() every
# iteration (every few seconds, worst case ~50s when idle). Piggyback the same lightweight check
# on that existing loop instead of waiting for the separate 5-minute sync.
P["telegram/srcdoc/poller.py"] = [
    ("before", 'pending = [cid for cid, c in st["chats"].items() if (c.get("batch") or {}).get("needs_prompt")]', [
        "try: C.balance_events_check()  # " + MARK + ": near-instant Refresh pickup",
        "except Exception: pass"]),
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
