#!/usr/bin/env python3
"""c2fix-20261003 offline test. Sends NOTHING: works on a temporary copy of tools/{clerkcfg,mailer,monthend}.py
(patched with patch.py), reads the box's saved Automations config (/workspace/config.json, read-only) and intercepts
every mailer call, printing who each email would go to and whether it carries buttons.

  python3 test_c2.py            exit 0 = all checks passed
"""
import json, os, re, shutil, subprocess, sys, tempfile

SRC = os.environ.get("CLERK_ROOT", "/workspace")
HERE = os.path.dirname(os.path.abspath(__file__))
TMP = tempfile.mkdtemp(prefix="c2test-")
os.makedirs(os.path.join(TMP, "tools"))
for f in ("clerkcfg.py", "mailer.py", "monthend.py"):
    shutil.copy2(os.path.join(SRC, "tools", f), os.path.join(TMP, "tools", f))
for d in ("rccg-remit/state", "rccg-attendance", "telegram", "state/monthend/out"):
    os.makedirs(os.path.join(TMP, d), exist_ok=True)
subprocess.run([sys.executable, os.path.join(HERE, "patch.py")], env=dict(os.environ, CLERK_ROOT=TMP), check=True,
               stdout=subprocess.DEVNULL)
os.environ["CLERK_ROOT"] = TMP
os.environ.pop("CLERK_MSG_TYPE", None); os.environ.pop("CLERK_PERSONAL", None)
sys.path.insert(0, os.path.join(TMP, "tools"))
import clerkcfg as C  # the patched copy; config read from /workspace/config.json

src = open(os.path.join(TMP, "tools", "mailer.py")).read()
MAILER = {"__name__": "mailer_under_test"}
exec(compile(src.split("\nap = argparse.ArgumentParser()")[0], "mailer.py", "exec"), MAILER)  # functions only
resolve = MAILER["resolve"]

import monthend as M
KEY = {str(p.get("email") or "").lower(): p["key"] for p in C.all_people() if p.get("email")}
EM = {p["key"]: p.get("email") for p in C.all_people()}
BTN = {k for k, v in ((p["key"], p.get("buttons")) for p in C.all_people()) if v}
names = lambda lst: ",".join(KEY.get(a.lower(), "OTHER") for a in lst) or "-"
SENT, FAIL = [], []


def fake_py(script, *args, cwd=None, env=None, timeout=300):
    if not script.endswith("mailer.py") or args[0] != "send":
        raise RuntimeError(f"unexpected call {script} {args}")
    p = json.load(open(args[args.index("--payload") + 1]))
    env = env or {}
    personal = env.get("CLERK_PERSONAL") == "1" or bool(p.get("personal"))
    lst = lambda v: [x.strip() for x in (v if isinstance(v, list) else str(v or "").split(",")) if x.strip()]
    content = (p.get("htmlBody") or "") + "\n" + (p.get("body") or "")
    to, cc, why = resolve(lst(p.get("to")), lst(p.get("cc")), env.get("CLERK_MSG_TYPE"), personal, content)
    SENT.append({"subject": p.get("subject"), "type": env.get("CLERK_MSG_TYPE") or "-", "personal": personal,
                 "to": to, "cc": cc, "buttons": bool(MAILER["ACTION_LINK"].search(content)), "result": why or "send"})
    if why == "skip":
        return 0, json.dumps({"ok": True, "skipped": "x"}), ""
    if why:
        return 3, json.dumps({"ok": False, "error": why}), ""
    return 0, json.dumps({"ok": True}), ""


class Stopped(Exception):
    pass


def fake_stop(ctx, step, message, **kw):
    raise Stopped(f"{step}: {message}")


M.py, M.log, M.stop = fake_py, (lambda *a, **k: None), fake_stop
M.entry_set, M.entry_get, M.RETRY_WAIT = (lambda *a, **k: None), (lambda *a, **k: {}), 0
M.time.sleep = lambda s: None


def payload(d, to, cc=(), subject="TEST", buttons=False):
    os.makedirs(d, exist_ok=True)
    html = "<p>test</p>" + ('<a href="https://app.example/remit-action?t=AAAA.BBBB">Generate RRR</a>' if buttons else "")
    json.dump({"to": list(to), "cc": list(cc), "subject": subject, "body": "test", "htmlBody": html},
              open(os.path.join(d, "payload.json"), "w"))
    return os.path.join(d, "payload.json")


def check(cond, what):
    print(("  PASS " if cond else "  FAIL ") + what)
    if not cond:
        FAIL.append(what)


# 1. the three check emails, through monthend.send_checks (twice: the second round must send nothing)
out = os.path.join(TMP, "rccg-remit", "runs", "out-test")
for who in ("david", "divine", "pastor"):
    payload(os.path.join(out, who), [EM[who]], subject=f"Kingdom Parish remittance check ({who})", buttons=who in ("david", "divine"))
ctx = {"key": "2026-10-test", "month": "2026-10"}
M.send_checks(ctx, out, "r1")
n1 = len(SENT)
M.send_checks(ctx, out, "r1")
print("\n== Check emails (monthend.send_checks), then the same round again")
for s in SENT:
    print(f"  {s['subject']:<45} type={s['type']:<17} personal={s['personal']!s:<5} to={names(s['to']):<10} cc={names(s['cc']):<6} buttons={s['buttons']!s:<5} -> {s['result']}")
for s in SENT[:n1]:
    who = re.search(r"\((\w+)\)", s["subject"]).group(1)
    if s["result"] == "send":
        check(names(s["to"] + s["cc"]) == who, f"{who}'s check email goes only to {who}")
    if s["buttons"]:
        check(all(KEY.get(a.lower()) in BTN for a in s["to"] + s["cc"]), f"{who}'s buttons only to people with buttons on")
check(len(SENT) == n1 == 3, "three emails in round r1, none when the round runs again (once per person)")

# 2. group emails: RRR and attendance as monthend sends them; memo and month-close for comparison
SENT.clear()
cases = [
    ("rrr_generated", "RRR email (monthend.py RRR step)", [EM["david"], EM["divine"], EM["fabian"]], []),
    ("attendance_filed", "attendance email (refresh step)", [EM["david"], EM["divine"]], [EM["pastor"]]),
    ("memo_forwarded", "memo (memo-runner)", [EM["pastor"], EM["divine"], EM["fabian"]], []),
    ("month_close", "month-close (monthclose.py)", [EM[k] for k in ("david", "divine", "fabian", "pastor")], []),
]
print("\n== Group emails (one email; routing in Automations decides who is on it)")
for mtype, label, to, cc in cases:
    ok = M.mail(payload(os.path.join(TMP, "g", mtype), to, cc, subject=label), mtype)
    s = SENT[-1]
    routed = {k for k, v in (C._routing(mtype) or {}).items() if (v or {}).get("email") and k in {p["key"] for p in C.people()}}
    got = [KEY.get(a.lower()) for a in s["to"] + s["cc"]]
    print(f"  {label:<38} to={names(s['to']):<26} cc={names(s['cc']):<8} buttons={s['buttons']!s:<5} -> {s['result']}")
    check(ok and len(got) == len(set(got)), f"{label}: one email, nobody twice")
    check(set(got) == routed, f"{label}: exactly the people switched on in routing ({','.join(sorted(routed))})")

# 3. guards
SENT.clear()
print("\n== Guards")
r = M.mail(payload(os.path.join(TMP, "n1"), [EM["pastor"]], buttons=True, subject="buttons to pastor"), "remittance_check", personal=True)
check(not r and SENT[-1]["result"].startswith("refused"), "a buttons email to the pastor is refused (and not retried)")
check(len(SENT) == 1, "refused email tried once only")
r = M.mail(payload(os.path.join(TMP, "n2"), [EM["david"]], [EM["pastor"]], buttons=True, subject="buttons cc pastor"), "remittance_check", personal=True)
check(not r, "David's buttons email with the pastor on cc is refused")
r = M.mail(payload(os.path.join(TMP, "n3"), [EM["fabian"]], buttons=True, subject="buttons, no type"))
check(not r, "a buttons email to Fabian with no message type is refused")
r = M.mail(payload(os.path.join(TMP, "n4"), [EM["david"]], buttons=True, subject="webhook test"), personal=True)
check(r and names(SENT[-1]["to"]) == "david", "the webhook-test email goes to David only")
to, cc, why = resolve([EM["fabian"]], [], "remittance_check", True, "")
check(why == "skip", "a personal email to someone switched off for that type is skipped (nobody added)")
try:
    os.makedirs(os.path.join(out, "x"), exist_ok=True)
    payload(os.path.join(TMP, "rccg-remit", "runs", "out-bad", "david"), [EM["david"], EM["pastor"]], buttons=True)
    for w in ("divine", "pastor"):
        payload(os.path.join(TMP, "rccg-remit", "runs", "out-bad", w), [EM[w]])
    M.send_checks(ctx, os.path.join(TMP, "rccg-remit", "runs", "out-bad"), "r1")
    check(False, "a check email with two addresses stops the run")
except Stopped:
    check(True, "a check email with two addresses stops the run")

shutil.rmtree(TMP, ignore_errors=True)
print(f"\n{'ALL PASSED' if not FAIL else str(len(FAIL)) + ' FAILED'} (nothing was sent)")
sys.exit(1 if FAIL else 0)
