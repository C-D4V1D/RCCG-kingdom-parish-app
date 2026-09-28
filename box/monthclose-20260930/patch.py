#!/usr/bin/env python3
"""Month-close: the "I've paid" button and /paid (monthclose-20260930). All or nothing.

  python3 patch.py --check    only test that every change fits the files on this box (changes nothing)
  python3 patch.py            apply (each file is changed only if EVERY change for EVERY file fits and compiles)

A change finds its line by content (spaces don't matter) and must find it exactly once.
Files that already carry the marker are skipped, so running it twice is safe."""
import os, py_compile, re, shutil, subprocess, sys, tempfile

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "monthclose-20260930"


def norm(s):
    return re.sub(r"\s+", " ", s.strip())


P = {}

# send_msg.py: the RRR message (key "rrr:<parish>:<month>") gets an "I've paid" button for the people who pay the RRR
# (Automations → People → Pays the RRR); a button that only talks to the bot (no link) may go to anyone.
P["telegram/send_msg.py"] = [
    ("before", "for who, _, kb in plan:", [
        "if a.key and a.key.startswith('rrr:') and _C is not None:  # " + MARK + ": \"I've paid\" under the RRR message",
        "    try:",
        "        _ps = _C.people(); _m = a.key.split(':')[-1]",
        "        _payers = [p['key'] for p in _ps if p.get('pays_rrr')] if any('pays_rrr' in p for p in _ps) else ['david', 'fabian']",
        "        plan = [(w, t, (kb or []) + [[{'text': \"\\u2705 I've paid\", 'callback_data': f'paid|{_m}'}]]) if w in _payers else (w, t, kb) for w, t, kb in plan]",
        "    except Exception:",
        "        pass"]),
    ("replace", "if kb and who not in ('david', 'divine'): sys.exit(f'refused: buttons only for david/divine, not {who}')", [
        "if kb and who not in ('david', 'divine') and any('url' in b for row in kb for b in row): sys.exit(f'refused: link buttons only for david/divine, not {who}')  # " + MARK]),
]

# poller.py (the bot): "I've paid" taps and /paid go to monthclose.py (it checks the person may confirm payments).
P["telegram/srcdoc/poller.py"] = [
    ("before", '"/cancel - cancel the current upload\\n"', [
        '"/paid - you paid the RRR: I check Remita and tell everyone\\n"']),
    ("before", "def cmd_statement(chat):", [
        "def cmd_paid(chat, month=''):  # " + MARK,
        "    try:",
        '        args = ["python3", "/workspace/tools/monthclose.py", "paid", "--chat", str(chat)] + (["--month", month] if re.fullmatch(r"\\d{4}-\\d{2}", month or "") else [])',
        "        p = subprocess.run(args, capture_output=True, text=True, timeout=400)",
        '        if p.returncode not in (0, 3): log("paid cmd", p.returncode, (p.stderr or p.stdout)[-300:])',
        "    except Exception:",
        '        log("paid cmd error", traceback.format_exc()[-600:]); send(chat, "Sorry, I couldn\'t check the payment right now. Try /paid again later.")',
        "",
        ""]),
    ("before", 'if chat.get("type") != "private" or frm.get("id") not in PEOPLE:', [
        'if chat.get("type") == "private" and ((msg.get("text") or "").strip().lower().split("@")[0].split() or [""])[0] == "/paid":  # ' + MARK,
        '    threading.Thread(target=cmd_paid, args=(frm.get("id"), ((msg.get("text") or "").split() + ["", ""])[1]), daemon=True).start(); return']),
    ("after", 'chat = cq["from"]["id"]; data = cq.get("data") or ""', [
        'if data.startswith("paid|"):  # ' + MARK + ': the "I\'ve paid" button under the RRR message',
        '    api("answerCallbackQuery", callback_query_id=cq["id"], text="Checking Remita...")',
        '    threading.Thread(target=cmd_paid, args=(chat, data.split("|", 1)[1]), daemon=True).start(); return']),
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
