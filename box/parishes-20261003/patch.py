#!/usr/bin/env python3
"""Satellite parishes on the Clerk box (parishes-20261003). All or nothing.

  python3 patch.py --check    only test that every change fits the files on this box (changes nothing)
  python3 patch.py            apply (each file is changed only if EVERY change for EVERY file fits and compiles)

A change finds its line by content (spaces don't matter) and must find it exactly once.
Files that already carry the marker are skipped, so running it twice is safe."""
import os, py_compile, re, shutil, subprocess, sys, tempfile

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "parishes-20261003"


def norm(s):
    return re.sub(r"\s+", " ", s.strip())


P = {}

# clerkcfg.py: a satellite parish's people (people[].parish set to another parish's code) are kept out of everything
# Kingdom Parish does (its messages, emails, month-close, bot FYIs); all_people() has everyone, with the chat ids the
# bot linked from their invite (state/satlinks.json). health() also reports the parishes (satinfo.py).
P["tools/clerkcfg.py"] = [
    ("before", "def people():", [
        "def all_people():  # " + MARK + ": everyone, satellite parishes' people included (chat ids linked by the bot merged in)",
        "    c = config()",
        "    ps = [dict(p) for p in (c or {}).get(\"people\", []) if isinstance(p, dict) and p.get(\"key\")]",
        "    try:",
        "        links = json.load(open(os.path.join(os.environ.get(\"CLERK_ROOT\", \"/workspace\"), \"state\", \"satlinks.json\")))",
        "    except Exception:",
        "        links = {}",
        "    for p in ps:",
        "        cid = str((links if isinstance(links, dict) else {}).get(p[\"key\"]) or \"\")",
        "        if is_sat(p) and not p.get(\"telegram_chat_id\") and re.fullmatch(r\"-?\\d+\", cid):",
        "            p[\"telegram_chat_id\"] = cid",
        "    return ps",
        "",
        "",
        "def is_sat(p):  # " + MARK,
        "    return str(p.get(\"parish\") or \"602757\") != \"602757\"",
        "",
        ""]),
    ("replace", 'return [p for p in (c or {}).get("people", []) if isinstance(p, dict) and p.get("key")]', [
        "return [p for p in all_people() if not is_sat(p)]  # " + MARK + ": Kingdom Parish's people only"]),
    ("replace", 'keys = {p["key"] for p in people()}', ['keys = {p["key"] for p in all_people()}  # ' + MARK]),
    ("replace", "for p in people():", ["for p in all_people():  # " + MARK + ": chat ids of the satellite parishes' people too"], 1),
    ("replace", 'ps = [p for p in people() if p.get("can_upload") and re.fullmatch(r"-?\\d+", str(p.get("telegram_chat_id") or ""))]', [
        'ps = [p for p in all_people() if p.get("can_upload") and re.fullmatch(r"-?\\d+", str(p.get("telegram_chat_id") or ""))]  # ' + MARK]),
    ("before", "def bot_admin(default):", [
        "def bot_sat_parishes():  # " + MARK,
        '    """{chat id: parish code} for a satellite parish\'s people who may use the bot (their own parish only)."""',
        "    return {int(p[\"telegram_chat_id\"]): str(p[\"parish\"]) for p in all_people()",
        "            if is_sat(p) and p.get(\"can_upload\") and re.fullmatch(r\"-?\\d+\", str(p.get(\"telegram_chat_id\") or \"\"))}",
        "",
        ""]),
    ("replace", '"next_statement": nxt, "config_version": local_version(), "remittance": remittance}', [
        '"next_statement": nxt, "config_version": local_version(), "remittance": remittance, **_sat_health()}  # ' + MARK]),
    ("before", "def ping():", [
        "def _sat_health():  # " + MARK + ": the satellite parishes' month-end, bot links and the box's public key",
        "    try:",
        "        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))",
        "        import satinfo",
        "        return satinfo.health()",
        "    except Exception as e:",
        "        return {\"satellites_error\": f\"{type(e).__name__}: {e}\"[:160]}",
        "",
        ""]),
]

# monthend.py: a satellite parish's signal runs satmonthend.py (its own folder, people and messages) in its own process.
P["tools/monthend.py"] = [
    ("before", 'kind, handler = ev.get("event"), ev.get("handler") or "clerk_ai"', [
        'if ev.get("satellite"):  # ' + MARK + ": a satellite parish's signal: satmonthend.py, in its own process",
        '    r = subprocess.run([PY, os.path.join(TOOLS, "satmonthend.py"), ev.get("_file") or ""], capture_output=True, text=True, timeout=5400)',
        '    if r.returncode:',
        '        log(f"satmonthend.py exit {r.returncode} for parish {ev.get(\'parish\')}: {(r.stderr or r.stdout).strip()[-200:]}")',
        '    return "done"']),
]

# supervisor.sh: each cycle, the satellite parishes' month-close (RRR paid?) and their Sunday records reminders.
P["tools/supervisor.sh"] = [
    ("after", "^[ -f /workspace/tools/monthclose.py ] && {", [
        '[ -f /workspace/tools/satclose.py ] && { timeout 600 python3 /workspace/tools/satclose.py tick >/dev/null 2>&1 || [ $? -ne 124 ] || echo "$(date \'+%F %H:%M\') satclose.py took over 10 minutes (stopped)" >> "$LOG"; }  # ' + MARK,
        '[ -f /workspace/tools/satinfo.py ] && { timeout 300 python3 /workspace/tools/satinfo.py tick >/dev/null 2>&1 || [ $? -ne 124 ] || echo "$(date \'+%F %H:%M\') satinfo.py took over 5 minutes (stopped)" >> "$LOG"; }']),
]

# poller.py (the bot): a satellite parish's people link themselves with their invite (/start inv_<code>), upload for
# their own parish only, get their own /month, /status and /paid (satbot.py), press their parish's month-end buttons,
# and never get Kingdom Parish's upload notices.
P["telegram/srcdoc/poller.py"] = [
    ("after", "DAVID = C.bot_admin(8910112376)", [
        "SATP = C.bot_sat_parishes()  # " + MARK + ": {chat id: parish code} of the satellite parishes' people"]),
    ("replace", "for pid, name in PEOPLE.items():", [
        "for pid, name in [x for x in PEOPLE.items() if x[0] not in SATP]:  # " + MARK + ": Kingdom Parish's people only"]),
    ("replace", "for pid in PEOPLE:", ["for pid in [x for x in PEOPLE if x not in SATP]:  # " + MARK], 1),
    ("replace", "for pid in PEOPLE:", ["for pid in [x for x in PEOPLE if x not in SATP]:  # " + MARK]),
    ("replace", 'else: b["parish"] = "602757"; _preview(st, chat, b)', [
        "else:  # " + MARK + ": a satellite parish's people upload for their own parish only",
        '    b["parish"] = SATP.get(chat, "602757")',
        '    if b["parish"] not in PNAME:',
        '        cancel(st, chat, "Source-document uploads are switched off for your parish, so nothing was uploaded."); return',
        "    _preview(st, chat, b)"]),
    ("after", 'chat = cq["from"]["id"]; data = cq.get("data") or ""', [
        'if data.startswith("mend|") or (data.startswith("paid|") and data.count("|") == 2):  # ' + MARK + ": a satellite parish's buttons",
        '    api("answerCallbackQuery", callback_query_id=cq["id"], text="Received")',
        '    threading.Thread(target=_sat_reply, args=(chat, ["button", "--chat", chat, "--data", data]), daemon=True).start(); return']),
    ("before", "def handle_callback(st, cq):", [
        "def _satbot(*args, timeout=400):  # " + MARK,
        '    p = subprocess.run(["python3", "/workspace/tools/satbot.py", *[str(x) for x in args]], capture_output=True, text=True, timeout=timeout)',
        "    try:",
        '        return json.loads((p.stdout or "").strip().splitlines()[-1])',
        "    except Exception:",
        '        log("satbot", args[:1], p.returncode, (p.stderr or p.stdout)[-300:]); return {}',
        "",
        "",
        "def _sat_reply(cid, args, timeout=400):  # " + MARK,
        "    try:",
        "        r = _satbot(*args, timeout=timeout)",
        '        if r.get("reply"): send(cid, r["reply"], r.get("kb"), html=bool(r.get("html")))',
        '        elif not r: send(cid, "Sorry, something went wrong. Please try again later.")',
        "        return r",
        "    except Exception:",
        '        log("satbot error", traceback.format_exc()[-600:]); send(cid, "Sorry, something went wrong. Please try again later."); return {}',
        "",
        "",
        "def _sat_msg(st, cid, msg):  # " + MARK,
        '    """A satellite parish\'s people: /start inv_<code> links them; then uploads (their own parish only), /month, /status,',
        '    /paid and /help are theirs. True when handled here."""',
        '    t = (msg.get("text") or "").strip()',
        '    w = t.lower().split("@")[0].split() or [""]',
        '    if w[0] == "/start" and len(t.split()) > 1 and t.split()[1].startswith("inv_"):',
        '        r = _sat_reply(cid, ["link", "--chat", cid, "--code", t.split()[1][4:]], timeout=60)',
        '        if r.get("ok") and r.get("parish"):',
        '            PEOPLE[cid] = r.get("name") or "Pastor"; SATP[cid] = r["parish"]',
        "        return True",
        "    if cid not in SATP:",
        "        return False",
        '    if msg.get("photo") or msg.get("document") or w[0] in ("/cancel", "cancel", "stop", "/done", "done"):',
        "        return False  # the normal upload flow (fixed to their own parish)",
        '    arg = (t.split() + ["", ""])[1]',
        '    cmd = {"/month": "month", "/status": "status", "/paid": "paid"}.get(w[0], "help")',
        '    extra = ["--month", arg] if cmd in ("month", "paid") and re.fullmatch(r"\\d{4}-\\d{2}", arg) else []',
        '    threading.Thread(target=_sat_reply, args=(cid, [cmd, "--chat", cid] + extra), daemon=True).start()',
        "    return True",
        "",
        ""]),
    ("before", '^if chat.get("type") == "private" and ((msg.get("text") or "").strip().lower().split("@")[0].split() or [""])[0] == "/paid":', [
        'if chat.get("type") == "private" and frm.get("id") and _sat_msg(st, frm.get("id"), msg):  # ' + MARK,
        "    return"]),
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
