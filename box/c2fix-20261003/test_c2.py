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
for d in ("rccg-remit/state", "rccg-attendance", "telegram", "state/monthend/out"):
    os.makedirs(os.path.join(TMP, d), exist_ok=True)
for f in ("tools/clerkcfg.py", "tools/mailer.py", "tools/monthend.py", "telegram/send_msg.py", "telegram/tg.py",
          "telegram/contacts.json", "rccg-remit/make-check-email.py", "rccg-remit/remit_match.py"):
    shutil.copy2(os.path.join(SRC, f), os.path.join(TMP, f))
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


# 0. each person's settings in Automations (the source of truth for everything below)
R = lambda t, k, ch: bool(((C._routing(t) or {}).get(k) or {}).get(ch))
print("== People (Automations)        buttons pays_rrr | email: check rrr att | telegram: check rrr")
for p in C.all_people():
    k = p["key"]
    print(f"  {k:<8} {('sat ' + str(p.get('parish'))) if C.is_sat(p) else 'kingdom':<12} {bool(p.get('buttons'))!s:<7} {bool(p.get('pays_rrr'))!s:<8} |"
          f"        {R('remittance_check', k, 'email')!s:<5} {R('rrr_generated', k, 'email')!s:<5} {R('attendance_filed', k, 'email')!s:<5} |"
          f"           {R('remittance_check', k, 'telegram')!s:<5} {R('rrr_generated', k, 'telegram')!s:<5}")

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

# 4. make-check-email.py: each person's address and buttons from Automations (only the top of the script is run)
print("\n== make-check-email.py recipients (from Automations)")
mce = open(os.path.join(TMP, "rccg-remit", "make-check-email.py")).read()
def mce_recipients(people_override=None):
    real = C.people
    if people_override is not None:
        C.people = lambda: people_override
    old_argv, sys.argv = sys.argv, ["make-check-email.py", "--out-dir", os.path.join(TMP, "mce")]
    g = {"__name__": "mce", "__file__": os.path.join(TMP, "rccg-remit", "make-check-email.py")}
    try:
        exec(compile(mce.split("\ndef acts(")[0], "make-check-email.py", "exec"), g)
    finally:
        sys.argv, C.people = old_argv, real
    return g["RECIPIENTS"]
rc = mce_recipients()
for k, (addr, nm, b) in rc.items():
    print(f"  {k:<7} address from Automations={addr.lower() == str(EM.get(k) or '').lower()!s:<5} buttons={b}")
    check(b == bool(next((p.get("buttons") for p in C.people() if p["key"] == k), False)), f"{k}: buttons follow the Automations flag")
alt = [dict(p, buttons=(False if p["key"] == "divine" else p.get("buttons"))) for p in C.people()]
check(mce_recipients(alt)["divine"][2] is False, "Bro. Divine switched to buttons off in Automations -> her check email has no buttons")
check("if RECIPIENTS[w][2] and not LINKS.get(w):" in mce, "buttons on but no signed link from the app -> no buttons (not a stop)")
check("if who == 'pastor' or not RECIPIENTS[who][2]:" in mce, "anyone without buttons gets the information-only wording")

# 5. send_msg.py (Telegram): who may get link buttons, and who gets the "I've paid" button (pays_rrr)
print("\n== Telegram (send_msg.py plan only, nothing sent)")
smsrc = open(os.path.join(TMP, "telegram", "send_msg.py")).read().split("\nUK = ZoneInfo")[0]
def sm_plan(bundle, key):
    bf = os.path.join(TMP, "bundle.json"); json.dump(bundle, open(bf, "w"))
    old_argv, sys.argv = sys.argv, ["send_msg.py", "--bundle", bf, "--guard", os.path.join(TMP, "g.json"), "--key", key]
    sys.path.insert(0, os.path.join(TMP, "telegram"))
    g = {"__name__": "sm", "__file__": os.path.join(TMP, "telegram", "send_msg.py")}
    try:
        exec(compile(smsrc, "send_msg.py", "exec"), g); return g["plan"], None
    except SystemExit as e:
        return g.get("plan"), str(e)
    finally:
        sys.argv = old_argv
url_btn = [[{"text": "Generate RRR", "url": "https://app.example/remit-action?t=x.y"}]]
plan, err = sm_plan({"messages": {"david": {"text": "t", "buttons": url_btn}, "divine": {"text": "t", "buttons": url_btn},
                                  "pastor": {"text": "t"}}}, "remit:602757:2026-10:r1")
check(err is None, "check message: link buttons for the people with buttons on are allowed")
plan, err = sm_plan({"messages": {"fabian": {"text": "t", "buttons": url_btn}}}, "remit:602757:2026-10:r1")
check(err is not None and "fabian" in err, "link buttons for Fabian (buttons off) are refused")
plan, err = sm_plan({"messages": {"david": {"text": "RRR"}}}, "rrr:602757:2026-10")
payers = {p["key"] for p in C.people() if p.get("pays_rrr")}
for who, _, kb in plan:
    paid = any(b.get("callback_data", "").startswith("paid|") for row in (kb or []) for b in row)
    print(f"  RRR message to {who:<7} pays_rrr={who in payers!s:<5} I've-paid button={paid}")
    check(paid == (who in payers), f"{who}: I've-paid button follows pays_rrr")

shutil.rmtree(TMP, ignore_errors=True)
print(f"\n{'ALL PASSED' if not FAIL else str(len(FAIL)) + ' FAILED'} (nothing was sent)")
sys.exit(1 if FAIL else 0)
