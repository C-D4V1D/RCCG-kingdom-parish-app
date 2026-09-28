#!/usr/bin/env python3
"""Patch the Clerk box runners to read the Automations settings (clerkcfg.py). All or nothing.

  python3 patch.py --check    only test that every change fits the files on this box (changes nothing)
  python3 patch.py            apply (each file is changed only if EVERY change for EVERY file fits and compiles)

A change finds its line by content (spaces don't matter) and must find it exactly once (or the n-th time when given).
Files that already carry the marker are skipped, so running it twice is safe."""
import os, py_compile, re, shutil, subprocess, sys, tempfile

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "automations-20260928"


def norm(s):
    return re.sub(r"\s+", " ", s.strip())


# (op, anchor, lines, nth)   op: replace | before | after.  anchor "^..." = the line starts with that text.
# `lines` are indented relative to the anchor line (4 spaces = one level deeper).
P = {}

P["tools/common.py"] = [
    ("replace", 'def run(cmd, cwd=None, timeout=900):', ['def run(cmd, cwd=None, timeout=900, env=None):']),
    ("replace", 'p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)',
     ['p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)']),
    ("replace", 'def mail_send(*args):', ['def mail_send(*args, mtype=None):']),
    ("replace", 'rc, out, err = run(["python3", MAILER, "send", *args], timeout=180)',
     ['rc, out, err = run(["python3", MAILER, "send", *args], timeout=180, env=dict(os.environ, CLERK_MSG_TYPE=mtype) if mtype else None)']),
    ("replace", 'def tg_card(who, icon, title, sub=None, body=(), step=None, foot=None):',
     ['def tg_card(who, icon, title, sub=None, body=(), step=None, foot=None, mtype=None):']),
    ("replace", 'try: run(["python3", TG, who, card(icon, title, sub, body, step, foot)], timeout=180)', [
        'try:',
        '    import clerkcfg as _C  # ' + MARK + ': who gets it and the message type come from the Automations settings',
        '    t = mtype or _C.type_for(icon=icon)',
        '    who = _C.who(t, who) if t else who',
        '    if who: run(["python3", TG, who, card(icon, title, sub, body, step, foot)], timeout=180, env=dict(os.environ, CLERK_MSG_TYPE=t) if t else None)']),
]

P["tools/mailer.py"] = [
    ("after", '^lst = lambda v:', [
        'try:  # ' + MARK + ': email routing from the Automations settings (only when the caller names the message type)',
        '    sys.path.insert(0, "/workspace/tools"); import clerkcfg as _C',
        '    _r = _C.filter_emails(os.environ.get("CLERK_MSG_TYPE"), lst(to), lst(cc))',
        'except Exception:',
        '    _r = None',
        'if _r is not None:',
        '    to, cc = _r',
        '    if not to: to, cc = (cc or [USER]), []  # everyone switched off: the copy only lands in Sent']),
]

P["telegram/send_msg.py"] = [
    ("after", "contacts = json.load(open(os.path.join(HERE, 'contacts.json')))", [
        'try:  # ' + MARK + ': chat ids and who-gets-what from the Automations settings',
        "    sys.path.insert(0, '/workspace/tools'); import clerkcfg as _C",
        '    contacts = _C.merge_contacts(contacts); _MT = _C.type_for(key=a.key)',
        'except Exception:',
        '    _C = None; _MT = None']),
    ("after", "a.plain = a.plain or bool(B.get('plain'))", [
        "if _C is not None and _MT and B.get('messages'):  # people switched on in the app but not in this bundle get the no-button text",
        '    _have = {p[0] for p in plan}',
        "    _txt = next((m['text'] for m in B['messages'].values() if not m.get('buttons')), None) or next(iter(B['messages'].values()))['text']",
        "    for _w in [x for x in _C.who(_MT, '').split(',') if x and x not in _have]: plan.append((_w, _txt, None))"]),
    ("before", "if who not in contacts: out.append({'to': who, 'skipped': 'not in contacts'}); continue", [
        "if _C is not None and not _C.tg_allowed(_MT, who): out.append({'to': who, 'skipped': 'switched off in Automations'}); continue"]),
]

P["tools/tgcard.py"] = [
    ("after", 'text = card(a.icon, a.title, a.sub, a.line, a.step, a.foot)', [
        'import os, clerkcfg as _C  # ' + MARK,
        '_t = _C.type_for(key=extra[extra.index("--key") + 1] if "--key" in extra[:-1] else None, icon=a.icon)',
        'if _t: os.environ["CLERK_MSG_TYPE"] = _t']),
]

P["tools/health.py"] = [
    ("after", 'T = "/workspace/tools"', ['import clerkcfg as C  # ' + MARK]),
    ("replace", 'if os.path.exists(p) and os.path.getsize(p) > 1_000_000:',
     ['if os.path.exists(p) and os.path.getsize(p) > C.num("automations.health_note.log_trim_mb", 1) * 1_000_000:']),
    ("replace", 'lines = open(p, errors="replace").readlines()[-2000:]; open(p, "w").writelines(lines)',
     ['lines = open(p, errors="replace").readlines()[-int(C.num("automations.health_note.log_trim_lines", 2000)):]; open(p, "w").writelines(lines)']),
    ("replace", 'def send(text): run(["python3", TG, "david", text])',
     ['def send(text): run(["python3", TG, C.who("weekly_health", "david"), text], env=dict(os.environ, CLERK_MSG_TYPE="weekly_health"))']),
    ("replace", 'if t.weekday() == 5 and t.hour >= 18:',
     ['if C.enabled("health_note") and t.weekday() == C.weekday(C.get("automations.health_note.day", "sat"), 5) and C.at_or_after(t, C.get("automations.health_note.after_time", "18:00")):']),
]

P["tools/reminders.py"] = [
    ("after", 'from common import card, MON3, BUL', ['import clerkcfg as C  # ' + MARK]),
    ("replace", '^PARISHES = {"602757"',
     ['PARISHES = C.parishes("source_docs", {"602757": "Kingdom Parish", "659840": "Sanctuary of Favour Parish", "597445": "Good Shepherd Parish", "761516": "God Is Able"})']),
    ("replace", 'def tg(who, text): subprocess.run(["python3", TG, who, text], capture_output=True, timeout=120)', [
        'def tg(who, text, mtype=None):',
        '    if who: subprocess.run(["python3", TG, who, text], capture_output=True, timeout=120, env=dict(os.environ, CLERK_MSG_TYPE=mtype) if mtype else None)']),
    ("replace", 'if left in (3, 1): due.append((left, end[:10], p, f"{lab} ({mo} {yr})"))',
     ['if left in [int(x) for x in C.get("automations.source_doc_reminders.days_before_close", [3, 1])]: due.append((left, end[:10], p, f"{lab} ({mo} {yr})"))']),
    ("replace", 'left = "3 days" if due[0][0] == 3 else "1 day"', ['left = f"{due[0][0]} day" + ("" if due[0][0] == 1 else "s")']),
    ("replace", 'if now.hour >= 10 and once("srcdoc", today.isoformat()):',
     ['if C.enabled("source_doc_reminders") and C.at_or_after(now, C.get("automations.source_doc_reminders.after_time", "10:00")) and once("srcdoc", today.isoformat()):']),
    ("replace", 'if t: tg("david", t)', ['if t: tg(C.who("source_doc_reminder", "david", exclude=("divine",)), t, "source_doc_reminder")']),
    ("replace", 'if t: tg("divine", t)', ['if t: tg(C.one("source_doc_reminder", "divine"), t, "source_doc_reminder")'], 1),
    ("replace", 'if now.weekday() == 0 and now.hour >= 9 and once("divine", today.isoformat()):',
     ['if C.enabled("weekly_attendance_reminder") and now.weekday() == C.weekday(C.get("automations.weekly_attendance_reminder.day", "mon"), 0) and C.at_or_after(now, C.get("automations.weekly_attendance_reminder.after_time", "09:00")) and once("divine", today.isoformat()):']),
    # the 2nd `tg("divine", t)` (weekly attendance) is the only one left after the change above
    ("replace", 'if t: tg("divine", t)', ['if t: tg(C.one("weekly_attendance_reminder", "divine"), t, "weekly_attendance_reminder")']),
]

P["tools/stmt-runner.py"] = [
    ("after", 'log = logger(FIN + "/runner-log.txt")', ['import clerkcfg as C; os.environ["CLERK_CONTEXT"] = "statement"  # ' + MARK]),
    ("replace", '^f"remittance period ({long_}).',
     [r'f"remittance period ({long_}).\n\nView online: {url}\n\nThe PDF copy (A4, landscape) is attached.\n\n" + str(C.get("automations.statement.signature", "God bless.\nBro. David Chukwuemeka")))']),
    ("before", 'open(stop, "w").write(now().isoformat())', [
        'if C.get("automations.statement.auto_send", True) is False:',
        '    if once_per_day(f"{FIN}/.runner-hold-{frm}_{to}"): tg_card("david", "wait", "Statement due, not sent", nice_period(frm, to), ["Auto-send is off in Automations, so nothing was created or emailed."], foot="Turn Auto-send on and it goes out at the next daily check.")',
        '    return']),
    ("replace", '^ok, info = mail_send("--to", ",".join(TO),',
     ['ok, info = mail_send("--to", ",".join(TO), "--subject", subj, "--text", body, "--attach", pdf, mtype="monthly_statement")']),
    ("replace", 'if (t.hour, t.minute) >= (7, 30) and once_per_day(FIN + "/.runner-last-day"):',
     ['if C.enabled("statement") and C.at_or_after(t, C.get("automations.statement.check_time", "07:30")) and once_per_day(FIN + "/.runner-last-day"):']),
]

P["tools/att-watch.py"] = [
    ("after", 'log = logger(ATT + "/runner-log.txt")', ['import clerkcfg as C; os.environ["CLERK_CONTEXT"] = "attendance"  # ' + MARK]),
    ("replace", 'return [m for m in (prev.strftime("%Y-%m"), t.strftime("%Y-%m")) if m >= FIRST]',
     ['return [m for m in (prev.strftime("%Y-%m"), t.strftime("%Y-%m")) if m >= str(C.get("automations.attendance.first_month", FIRST))]']),
    ("replace", 'ok, info = mail_send("--payload", P)', ['ok, info = mail_send("--payload", P, mtype="attendance_filed")']),
    ("replace", 'if not (subj and mail_sent(subj, 7)): mail_send("--payload", P)',
     ['if not (subj and mail_sent(subj, 7)): mail_send("--payload", P, mtype="attendance_nudge")']),
    ("before", 'if s["ready"]:', [
        'if s["ready"] and C.get("automations.attendance.auto_file", True) is False:',
        '    if once_per_day(f"runs/.att-watch-hold-{m}"): tg_card("david", "wait", f"Attendance ready: {nice_month(m)}", "Kingdom Parish", ["Everything is in the app and the portal is open.", "Auto-file is off in Automations, so it was not filed."], foot="Turn Auto-file on and it is filed at the next hourly check.")',
        '    return']),
    ("replace", 'for n, day, hour in ((1, c - datetime.timedelta(days=1), 18), (2, c, 12)):', ['for n, day, hour in C.att_reminders(c):']),
    ("replace", 'if (t.date(), t.hour) >= (day, hour) and t.date() <= c and not os.path.exists(flag):',
     ['if (t.date(), (t.hour, t.minute)) >= (day, hour) and t.date() <= c and not os.path.exists(flag):']),
    ("replace", 'if 8 <= t.hour < 22 and (last is None or (t - last).total_seconds() >= 3600):',
     ['if C.enabled("attendance") and C.in_window(t, C.get("automations.attendance.active_from", "08:00"), C.get("automations.attendance.active_until", "22:00")) and (last is None or (t - last).total_seconds() >= 60 * C.num("automations.attendance.check_interval_minutes", 60)):']),
]

P["telegram/srcdoc/poller.py"] = [
    ("after", '^import tg, imgproc', ['sys.path.insert(0, "/workspace/tools"); import clerkcfg as C  # ' + MARK]),
    ("replace", '^PEOPLE = {8910112376: "David", 6871279109: "Divine"}',
     ['PEOPLE = C.bot_people({8910112376: "David", 6871279109: "Divine"})  # only these may use the bot (app: Automations > People)']),
    ("replace", 'DAVID = 8910112376', ['DAVID = C.bot_admin(8910112376)']),
    ("replace", 'PARISHES = [(c, _PName(n)) for c, n in PARISHES]; PNAME = dict(PARISHES)',
     ['PARISHES = [(c, _PName(n)) for c, n in C.parish_list("source_docs", PARISHES)]; PNAME = dict(PARISHES)']),
    ("replace", '^SECTION = {"admin":',
     ['SECTION = C.sections({"admin": ("Admin", 500_000, "500 KB"), "finance": ("Finance", 1_000_000, "1 MB")})']),
]

P["telegram/srcdoc/imgproc.py"] = [
    ("replace", 'WIDTHS = [1800, 1600, 1400, 1240, 1100, 1000, 900, 800, 720, 640, 560, 480]', [
        'import sys; sys.path.insert(0, "/workspace/tools"); import clerkcfg as C  # ' + MARK,
        'WIDTHS = [w for w in [1800, 1600, 1400, 1240, 1100, 1000, 900, 800, 720, 640, 560, 480] if w <= C.num("automations.upload_bot.max_width_px", 1800)] or [int(C.num("automations.upload_bot.max_width_px", 1800))]']),
    ("replace", 'QUALS = [85, 78, 70, 62, 55, 48, 42]',
     ['QUALS = [q for q in [85, 78, 70, 62, 55, 48, 42] if q <= C.num("automations.upload_bot.jpeg_quality", 85)] or [int(C.num("automations.upload_bot.jpeg_quality", 85))]']),
    ("replace", 'for min_w, quals in ((900, [q for q in QUALS if q >= 62]), (0, QUALS)):',
     ['for min_w, quals in (((900, [q for q in QUALS if q >= 62]),) if any(q >= 62 for q in QUALS) else ()) + ((0, QUALS),):']),
]

P["rccg-memos/memo-runner.sh"] = [
    ("after", 'TGC=/workspace/tools/tgcard.py', [
        'export CLERK_MSG_TYPE=memo_forwarded  # ' + MARK + ': routing + schedule from the Automations settings',
        'CC="python3 /workspace/tools/clerkcfg.py"']),
    ("replace", 'alert() { python3 "$TGC" david "$@" >>"$LOG" 2>&1; }',
     ['alert() { CLERK_MSG_TYPE=memo_error python3 "$TGC" david "$@" >>"$LOG" 2>&1; }']),
    ("after", '[ -z "$ID" ] && continue', [
        '$CC flag automations.memo.auto_forward true; if [ $? -eq 3 ]; then',
        '  CLERK_MSG_TYPE=memo_error python3 "$TGC" david memo "New RCCG memo waiting" --sub="$TITLE" --line="Ref: $REF" --line="Auto-forward is off in Automations, so it was not sent to anyone." --foot="Turn Auto-forward on and it goes out at the next daily check." -- --guard tg-sent.json --key "memohold:$REF" --log tg-log.txt >>"$LOG" 2>&1',
        '  REFS="$REFS${REFS:+, }$REF (held)"; continue',
        'fi']),
    ("after", 'TODAY=$(date +%F)', [
        'S=$($CC get automations.memo.stop_after 2099-12-31 2>/dev/null); [[ "$S" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] && STOP_AFTER=$S']),
    ("replace", 'if [ "$DOW" -le 6 ] && [ "$((10#$HM))" -ge 845 ] && [ "$(cat runner-last-run 2>/dev/null)" != "$TODAY" ]; then', [
        '$CC due memo; R=$?  # 0 = due, 3 = not due, anything else = settings problem -> the old rule',
        'if { [ $R -eq 0 ] || { [ $R -ne 3 ] && [ "$DOW" -le 6 ] && [ "$((10#$HM))" -ge 845 ]; }; } && [ "$(cat runner-last-run 2>/dev/null)" != "$TODAY" ]; then']),
]

P["tools/drive-sync.sh"] = [
    ("replace", 'sleep 600', [
        'M=$(python3 /workspace/tools/clerkcfg.py int automations.drive_sync.interval_minutes 10 1 2>/dev/null)  # ' + MARK,
        'sleep $(( ${M:-10} * 60 ))']),
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
    return out + ("# " + MARK + nl)


def check_syntax(path, name):
    if name.endswith(".py"):
        py_compile.compile(path, doraise=True)
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
