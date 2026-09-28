#!/usr/bin/env python3
"""Telegram bot menu refinements: reordered /help, a REMITTANCE section on /status (cut-off, total
collection, amount remitted), and button-driven /month and /statement (this month / latest, then a
Previous months / Previous statements list) (menu-refine-20260928). All or nothing.

  python3 patch.py --check    only test that every change fits the files on this box (changes nothing)
  python3 patch.py            apply (each file is changed only if EVERY change for EVERY file fits and compiles)

A change finds its line by content (spaces don't matter) and must find it exactly once (or the n-th time when given).
Files that already carry the marker are skipped, so running it twice is safe."""
import os, py_compile, re, shutil, subprocess, sys, tempfile

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "menu-refine-20260928"


def norm(s):
    return re.sub(r"\s+", " ", s.strip())


P = {}

# monthinfo.py: total Sunday-collection amount for a remittance period, for the bot's /status.
P["tools/monthinfo.py"] = [
    ("before", "# ---------------------------------------------------------------- /month text", [
        "def collection_total(f):  # " + MARK,
        '    """Sum of totalCollection for Sunday-collection income records within this period, or None if unreadable."""',
        "    try:",
        '        income = app_get("income") or []',
        "    except Exception:",
        "        return None",
        '    start, end = f["start"], f["end"]',
        "    total = 0.0",
        "    for r in income:",
        '        if not isinstance(r, dict) or r.get("source") not in SUNDAY_SOURCES:',
        "            continue",
        "        try:",
        '            d = _d(r.get("date"))',
        "        except Exception:",
        "            continue",
        "        if start <= d <= end:",
        '            total += float(r.get("totalCollection") or 0)',
        "    return total",
        "",
        ""]),
]

# clerkinfo.py: the full sent-statement history (latest_statement() only ever gave the last one), for /statement.
P["tools/clerkinfo.py"] = [
    ("before", "def memo_line():", [
        "def sent_statements():  # " + MARK,
        '    """All sent statements, newest first: [(url, pdf_or_None, label, period_to)]."""',
        '    sent = _load(f"{FIN}/state/sent.json", [])',
        "    out = []",
        "    for e in reversed(sent):",
        '        pdf = os.path.join(FIN, e.get("attachment") or "")',
        '        label = f"{_nice(e[\'period_from\'])} to {_nice(e[\'period_to\'])} {e[\'period_to\'][:4]}"',
        '        out.append((e.get("url"), pdf if os.path.isfile(pdf) else None, label, e.get("period_to", "")))',
        "    return out",
        "",
        ""]),
]

# poller.py (the Telegram bot): reordered /help, REMITTANCE on /status, and button-driven /month and /statement.
P["telegram/srcdoc/poller.py"] = [
    # /help: commands reordered (status, month, statement, refresh, paid, cancel, help) and re-worded to match.
    ("replace", '"/status - deadlines, empty upload slots, attendance and statement\\n"', [
        '"/status - remittance, attendance, source-doc deadlines & slots, and the statement\\n"',
        '"/month - this month\'s remittance: collections, attendance, month-end (tap for other months, or /month 2026-09)\\n"',
        '"/statement - the latest financial statement (link + PDF; tap for previous months)\\n"',
        '"/refresh - re-check attendance against the app and re-file only if it differs (/refresh 2026-09 for another month)\\n"',
        '"/paid - you paid the RRR: I check Remita and tell everyone (/paid 2026-09 for another month)\\n"']),
    ("replace", '"/statement - the latest financial statement (link + PDF)\\n"', []),
    ("replace", '"/month - this month\'s remittance: collections, attendance, month-end (/month 2026-09 for another)\\n"', []),
    ("replace", '"/refresh - re-check attendance against the app and re-file only if it differs\\n"', []),
    ("replace", '"/paid - you paid the RRR: I check Remita and tell everyone\\n"', []),

    # /status: a REMITTANCE helper, and the sections reordered to Remittance, Attendance, Source documents,
    # Monthly statement, Memos (was Source documents, Attendance, Monthly statement, Memos).
    ("before", "def cmd_status(chat):", [
        "def _remit_status_lines():  # " + MARK,
        "    try:",
        "        import monthinfo as MI, monthclose as MC",
        "        f = MI.facts(prefer_open=True)",
        '        if f.get("error"):',
        '            return [f"couldn\'t check ({f[\'error\']})"]',
        '        lines = [f"{MI.month_label(f[\'month\'])} (cut-off {f[\'end\']:%a} {MI.nice(f[\'end\'])})"]',
        "        try:",
        "            ct = MI.collection_total(f)",
        "        except Exception:",
        "            ct = None",
        "        if ct is not None:",
        '            lines.append(f"Total collection: {MC.naira(ct)}")',
        "        lines.append(MI.month_end_line(f))",
        "        try:",
        '            info = (MC.months_with_rrr() or {}).get(f["month"])',
        "        except Exception:",
        "            info = None",
        '        if info and info.get("amount"):',
        '            lines.append(f"Amount remitted: {MC.naira(info[\'amount\'])}")',
        "        return lines",
        "    except Exception:",
        "        return [\"couldn't check\"]",
        "",
        ""]),
    ("replace", 'L += ["", "<b>ATTENDANCE</b>"] + [f"\\u2022 {H(x)}" for x in (ci.att_lines() or ["nothing to report"])]', []),
    ("replace", 'L = ["\\U0001f4cb <b>Clerk status</b>", f"{t:%a} {t.day} {t:%b}, {t:%H:%M}", "", "<b>SOURCE DOCUMENTS</b>"]', [
        'L = ["\\U0001f4cb <b>Clerk status</b>", f"{t:%a} {t.day} {t:%b}, {t:%H:%M}"]',
        'L += ["", "<b>REMITTANCE</b>"] + [f"\\u2022 {H(x)}" for x in _remit_status_lines()]',
        'L += ["", "<b>ATTENDANCE</b>"] + [f"\\u2022 {H(x)}" for x in (ci.att_lines() or ["nothing to report"])]',
        'L += ["", "<b>SOURCE DOCUMENTS</b>"]']),

    # /month: was a plain text reply; now This month / Previous months (last 6) buttons, typing a month still works.
    ("before", "def cmd_paid(chat, month=''):  # monthclose-20260930", [
        "def _send_month_report(chat, m):  # " + MARK,
        "    try:",
        "        import monthinfo as MI",
        '        send(chat, "Reading the parish app...")',
        "        send(chat, MI.month_text(MI.facts(month=m, prefer_open=True)), html=True)",
        "    except Exception:",
        '        log("month cmd error", traceback.format_exc()[-600:]); send(chat, "Sorry, I couldn\'t read the month\'s status right now.")',
        "",
        "",
        "def _recent_months(n=6):  # " + MARK,
        "    t = datetime.now(); y, m = t.year, t.month",
        "    out = []",
        "    for _ in range(n):",
        "        m -= 1",
        "        if m == 0: m, y = 12, y - 1",
        '        out.append(f"{y:04d}-{m:02d}")',
        "    return out",
        "",
        "",
        "def kb_month_start():  # " + MARK,
        '    return [[{"text": "This month", "callback_data": "month|this|"}],',
        '            [{"text": "Previous months \\u00bb", "callback_data": "month|prev|"}]]',
        "",
        "",
        "def kb_recent_months():  # " + MARK,
        "    import monthinfo as MI",
        "    months = _recent_months(6)",
        '    rows = [[{"text": MI.month_label(ym), "callback_data": f"month|go|{ym}"} for ym in months[i:i + 2]]',
        "            for i in range(0, len(months), 2)]",
        '    rows.append([{"text": "\\u00ab Back", "callback_data": "month|back|"}])',
        "    return rows",
        "",
        "",
        "def cmd_month(chat, arg):  # " + MARK + ": overrides the reminders-20260929 version above with buttons",
        "    if not arg:",
        '        send(chat, "Which month?", kb_month_start()); return',
        '    m = arg if re.fullmatch(r"\\d{4}-\\d{2}", arg) else None',
        "    _send_month_report(chat, m)",
        "",
        ""]),

    # /statement: was always the latest; now Latest / Previous statements (last 6) buttons.
    ("before", "def _attref(args, timeout=900):", [
        "def _send_statement(chat, idx=0):  # " + MARK,
        "    try:",
        "        stmts = _ci().sent_statements()",
        "        if not stmts:",
        '            send(chat, "No financial statement has been sent yet."); return',
        "        if idx >= len(stmts):",
        '            send(chat, "No earlier statement found."); return',
        "        url, pdf, label, _ = stmts[idx]",
        '        cap = f"\\U0001f4c4 Monthly financial statement\\n{label}\\n\\n{url}"',
        "        if pdf: send_file(chat, pdf, cap)",
        "        else: send(chat, cap)",
        "    except Exception:",
        '        log("statement cmd error", traceback.format_exc()[-600:]); send(chat, "Sorry, I couldn\'t fetch the statement right now.")',
        "",
        "",
        "def kb_statement_start():  # " + MARK,
        '    return [[{"text": "Latest", "callback_data": "statement|this|"}],',
        '            [{"text": "Previous statements \\u00bb", "callback_data": "statement|prev|"}]]',
        "",
        "",
        "def _statement_prev_kb():  # " + MARK,
        "    stmts = _ci().sent_statements()",
        "    opts = stmts[1:7]",
        "    if not opts:",
        "        return None",
        '    kb = [[{"text": lbl, "callback_data": f"statement|go|{1 + i}"}] for i, (_, _, lbl, _) in enumerate(opts)]',
        '    kb.append([{"text": "\\u00ab Back", "callback_data": "statement|back|"}])',
        "    return kb",
        "",
        "",
        "def cmd_statement(chat):  # " + MARK + ": overrides the version above with buttons",
        '    send(chat, "Which statement?", kb_statement_start())',
        "",
        ""]),

    # handle_callback: route "month|..." and "statement|..." button presses (parallel to the existing "attref|" block).
    ("before", 'bid, _, rest = data.partition("|"); action, _, val = rest.partition("|")', [
        'if data.startswith("month|"):  # ' + MARK,
        '    api("answerCallbackQuery", callback_query_id=cq["id"])',
        '    _, act, val = (data.split("|") + ["", ""])[:3]',
        '    msg_id = (cq.get("message") or {}).get("message_id")',
        "    drop_kb(chat, msg_id)",
        '    if act == "this":',
        "        threading.Thread(target=_send_month_report, args=(chat, None), daemon=True).start()",
        '    elif act == "prev":',
        '        send(chat, "Choose a month:", kb_recent_months())',
        '    elif act == "go" and re.fullmatch(r"\\d{4}-\\d{2}", val):',
        "        threading.Thread(target=_send_month_report, args=(chat, val), daemon=True).start()",
        "    else:",
        '        send(chat, "Which month?", kb_month_start())',
        "    return",
        'if data.startswith("statement|"):  # ' + MARK,
        '    api("answerCallbackQuery", callback_query_id=cq["id"])',
        '    _, act, val = (data.split("|") + ["", ""])[:3]',
        '    msg_id = (cq.get("message") or {}).get("message_id")',
        "    drop_kb(chat, msg_id)",
        '    if act == "this":',
        "        threading.Thread(target=_send_statement, args=(chat, 0), daemon=True).start()",
        '    elif act == "prev":',
        "        kb = _statement_prev_kb()",
        '        if kb: send(chat, "Choose a statement:", kb)',
        '        else: send(chat, "No earlier statements on record.")',
        '    elif act == "go" and val.isdigit():',
        "        threading.Thread(target=_send_statement, args=(chat, int(val)), daemon=True).start()",
        "    else:",
        '        send(chat, "Which statement?", kb_statement_start())',
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
