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
          "telegram/contacts.json", "rccg-remit/make-check-email.py", "rccg-remit/remit_match.py", "telegram/tg_msgs.py"):
    shutil.copy2(os.path.join(SRC, f), os.path.join(TMP, f))
for f in os.listdir(os.path.join(SRC, "rccg-remit")):  # make-check-email.py's helpers (section 6)
    if f.endswith(".py") and not os.path.exists(os.path.join(TMP, "rccg-remit", f)):
        shutil.copy2(os.path.join(SRC, "rccg-remit", f), os.path.join(TMP, "rccg-remit", f))
subprocess.run([sys.executable, os.path.join(HERE, "patch.py")], env=dict(os.environ, CLERK_ROOT=TMP), check=True,
               stdout=subprocess.DEVNULL)
# checkpeople-20261003 (installed after this fix): keep a copy without it to compare against, then apply it too
CP = os.path.join(os.path.dirname(HERE), "checkpeople-20261003", "patch.py")
OLD = TMP + "-before"
shutil.copytree(TMP, OLD)
if os.path.exists(CP):
    subprocess.run([sys.executable, CP], env=dict(os.environ, CLERK_ROOT=TMP), check=True, stdout=subprocess.DEVNULL)
for _r in (TMP, OLD):  # these copies use their own tools/clerkcfg.py (not the box's), so section 6 tests the right code
    for _f in [os.path.join(_r, "rccg-remit", x) for x in os.listdir(os.path.join(_r, "rccg-remit")) if x.endswith(".py")] + [os.path.join(_r, "telegram", "tg_msgs.py")]:
        _s = open(_f).read()
        if "'/workspace/tools'" in _s:
            open(_f, "w").write(_s.replace("'/workspace/tools'", repr(os.path.join(_r, "tools"))))
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

# 6. checkpeople-20261003: the check goes to whoever Automations routes remittance_check to (email + Telegram)
if os.path.exists(CP):
    import base64, filecmp, time
    print("\n== Check emails + Telegram for everyone routed in Automations (make-check-email.py, tg_msgs.py)")
    RUN = os.path.join(SRC, "rccg-remit", "runs", "sample-2026-09.json")
    SL = json.load(open(os.path.join(SRC, "rccg-remit", "runs", "sample-links-2026-09.json")))
    def tok(url, person, exp):  # same link shape, our own person/expiry (the box never checks the signature)
        base, t = url.split("?t="); body, sig = t.split(".")
        pl = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4))); pl.update(person=person, exp=exp)
        return base + "?t=" + base64.urlsafe_b64encode(json.dumps(pl, separators=(",", ":")).encode()).decode().rstrip("=") + "." + sig
    EXP = int(time.time()) + 3 * 86400
    def links_for(people):
        d = dict(SL, links={w: {a: tok(u, w, EXP) for a, u in SL["links"]["david"].items()} for w in people})
        f = os.path.join(TMP, "links-" + "-".join(people) + ".json"); json.dump(d, open(f, "w")); return f
    def build(root, cfg, lf, tag):
        env = dict(os.environ, CLERK_CFG=cfg)
        out = os.path.join(TMP, "mce-" + tag)
        r = subprocess.run([sys.executable, os.path.join(root, "rccg-remit", "make-check-email.py"), "--in", RUN, "--links", lf,
                            "--out-dir", out], cwd=os.path.join(SRC, "rccg-remit"), env=env, capture_output=True, text=True)
        check(r.returncode == 0, f"{tag}: make-check-email.py builds" + ("" if not r.returncode else ": " + (r.stderr or r.stdout)[-200:]))
        tgf = os.path.join(TMP, "tg-" + tag + ".json")
        r = subprocess.run([sys.executable, os.path.join(root, "telegram", "tg_msgs.py"), "check", "--summary",
                            os.path.join(out, "check-summary.json"), "--links", lf, "--run", RUN, "--out", tgf],
                           env=env, capture_output=True, text=True)
        check(r.returncode == 0, f"{tag}: tg_msgs.py builds" + ("" if not r.returncode else ": " + (r.stderr or r.stdout)[-200:]))
        return out, (json.load(open(tgf)) if os.path.exists(tgf) else {"messages": {}})
    tree = lambda d: sorted(os.path.relpath(os.path.join(p, f), d) for p, _, fs in os.walk(d) for f in fs)
    nodir = lambda f: [{k: v for k, v in r.items() if k != "dir"} for r in json.load(open(f))]
    # 6a. current settings: exactly the same emails and Telegram messages as before this change
    lf = links_for(["david", "divine"])
    cfg0 = os.environ.get("CLERK_CFG", "/workspace/config.json")
    oa, ta = build(OLD, cfg0, lf, "before"); ob, tb = build(TMP, cfg0, lf, "after")
    same = tree(oa) == tree(ob) and all(f == "recipients.json" or filecmp.cmp(os.path.join(oa, f), os.path.join(ob, f), shallow=False)
                                        for f in tree(oa)) and nodir(os.path.join(oa, "recipients.json")) == nodir(os.path.join(ob, "recipients.json"))
    print(f"  current settings: emails to {','.join(json.load(open(os.path.join(ob, 'check-summary.json')))['recipients'])}; "
          f"Telegram to {','.join(tb['messages'])}")
    check(same, "current settings: every check email is byte-for-byte the same as before")
    check(ta["messages"] == tb["messages"], "current settings: the Telegram check messages are the same as before")
    # 6b. a 4th Kingdom person with buttons on, switched on for the check (a copy of the config; nothing is saved)
    raw = json.load(open(cfg0)); c4 = raw["config"]
    c4["people"].append({"key": "tester4", "name": "Test Person", "called": "Bro. Test", "email": "tester4@example.invalid",
                         "telegram_chat_id": "999000111", "buttons": True})
    c4["routing"]["remittance_check"]["tester4"] = {"email": True, "telegram": True}
    cfg4 = os.path.join(TMP, "config-4th.json"); json.dump(raw, open(cfg4, "w"))
    lf4 = links_for(["david", "divine", "tester4"])
    o4, t4 = build(TMP, cfg4, lf4, "4th")
    R4 = json.load(open(os.path.join(o4, "check-summary.json")))["recipients"]
    L4 = json.load(open(lf4))["links"]
    p4 = json.load(open(os.path.join(o4, "tester4", "payload.json"))) if os.path.exists(os.path.join(o4, "tester4", "payload.json")) else {}
    body4 = (p4.get("htmlBody") or "") + (p4.get("body") or "")
    found = set(re.findall(r"https://[^\s\"'<>]+/remit-action\?t=[A-Za-z0-9_.-]+", body4))
    print(f"  with a 4th person: emails to {','.join(R4)}; Telegram to {','.join(t4['messages'])}")
    check(R4.count("tester4") == 1 and p4.get("to") == ["tester4@example.invalid"], "4th person: one email, to their own address only")
    check(found and found <= set(L4["tester4"].values()), "4th person: their email has buttons, only their own signed links")
    check(all(not (set(L4["tester4"].values()) & set(re.findall(r"https://\S+?remit-action\?t=[A-Za-z0-9_.-]+",
              open(os.path.join(o4, w, "check-email.html")).read()))) for w in R4 if w != "tester4"), "nobody else gets the 4th person's links")
    m4 = t4["messages"].get("tester4") or {}
    tgu = [b["url"] for row in (m4.get("buttons") or []) for b in row if "url" in b]
    check(list(t4["messages"]).count("tester4") == 1 and tgu and set(tgu) <= set(L4["tester4"].values()),
          "4th person: one Telegram message with their own buttons")
    check(not (t4["messages"].get("pastor") or {}).get("buttons"), "the pastor still gets no buttons")
    check("Bro. Test" in (t4["messages"].get("pastor") or {}).get("text", ""), "the information text names everyone who can confirm")
    # sending: monthend.send_checks sends each one once; the mailer lets the 4th person's buttons through; Telegram plan OK
    C.CFG, C._cache["mtime"] = cfg4, None
    try:
        SENT.clear(); M.send_checks(ctx, o4, "r1"); n4 = len(SENT); M.send_checks(ctx, o4, "r1")
        got = [names(s["to"]) if s["to"] != ["tester4@example.invalid"] else "tester4" for s in SENT if s["result"] == "send"]
        check(len(SENT) == n4 == len(R4) and sorted(got) == sorted(R4), "send_checks: one email per routed person, none on the repeat")
        check(all(s["result"] == "send" for s in SENT), "the 4th person's buttons email is not refused (buttons on)")
        plan, err = sm_plan(t4, "check:2026-10-test:r1")
        check(err is None and [w for w, _, _ in plan].count("tester4") == 1, "Telegram: the 4th person's buttons are allowed, once")
        off = json.load(open(cfg4)); [p.update(buttons=False) for p in off["config"]["people"] if p["key"] == "tester4"]
        json.dump(off, open(cfg4, "w")); C._cache["mtime"] = None
        plan, err = sm_plan(t4, "check:2026-10-test:r1")
        check(err is not None and "tester4" in err, "buttons switched off for them -> their link buttons are refused")
        o5, t5 = build(TMP, cfg4, lf4, "4th-off")
        check(not (t5["messages"].get("tester4") or {}).get("buttons") and "/remit-action" not in open(os.path.join(o5, "tester4", "check-email.html")).read(),
              "buttons off -> they still get the check, without buttons")
    finally:
        C.CFG, C._cache["mtime"] = cfg0, None

shutil.rmtree(TMP, ignore_errors=True)
shutil.rmtree(OLD, ignore_errors=True)
print(f"\n{'ALL PASSED' if not FAIL else str(len(FAIL)) + ' FAILED'} (nothing was sent)")
sys.exit(1 if FAIL else 0)
