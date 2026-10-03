#!/usr/bin/env python3
"""/month for another parish (month-parishes-20261003): who may pick a parish, and the buttons for it.

Who may: Automations -> People -> "Can view other parishes' month" (people[].month_all_parishes). The box also accepts a
list of parish codes there (only those parishes), so a later app version can narrow it without a box change. When a
person was saved before the setting existed (no value), it is on only for the admin (People -> full status), so nothing
changes for anyone else. Satellite parishes' people never get the picker (their bot shows their own parish only).
Which parishes: Automations -> Parishes (Kingdom Parish first, then the active parishes in the order of the app).

  monthpick.py show       who can pick which parishes (from the config; nothing is sent)
  monthpick.py selftest [--poller FILE]   offline test with made-up people and parishes (and the patched bot's
                          buttons with stand-ins for Telegram); reads nothing from the app, sends nothing

poller.py asks allowed(chat) every time a button is pressed, not only when the buttons are shown.
"""
import json, os, re, subprocess, sys

TOOLS = os.environ.get("CLERK_TOOLS", os.path.join(os.environ.get("CLERK_ROOT", "/workspace"), "tools"))
sys.path.insert(0, TOOLS)
import clerkcfg as C  # noqa: E402

KINGDOM = "602757"
FIELD = "month_all_parishes"
PY = sys.executable or "python3"
OTHER = "\U0001f3db Other parishes \u00bb"


def parishes():
    """[(code, name)]: Kingdom Parish first, then every active parish in Automations -> Parishes."""
    out = []
    for p in (C.config() or {}).get("parishes") or []:
        if not isinstance(p, dict):
            continue
        code = str(p.get("code") or "").strip()
        if not re.fullmatch(r"\d{4,8}", code) or p.get("active") is False or any(c == code for c, _ in out):
            continue
        out.append((code, C.parish_name(code)))
    out.sort(key=lambda x: x[0] != KINGDOM)
    return out


def _person(chat):
    if C.config() is None:
        return None
    for p in C.all_people():
        if str(p.get("telegram_chat_id") or "").strip() == str(chat):
            return p
    return None


def allowed(chat):
    """[(code, name)] this chat may pick (Kingdom Parish included), or [] (then no picker: /month as before)."""
    try:
        p = _person(chat)
        if not p or C.is_sat(p):
            return []
        v = p.get(FIELD)
        if v is None:
            v = bool(p.get("full_status"))  # saved before the setting existed: the admin only
        ps = parishes()
        if isinstance(v, list):
            codes = {str(x) for x in v} | {KINGDOM}
            ps = [x for x in ps if x[0] in codes]
        elif v is not True:
            return []
        return ps if len(ps) > 1 else []
    except Exception:
        return []


def may(chat, code):
    return any(c == str(code) for c, _ in allowed(chat))


def name(code):
    return C.parish_name(code)


def other_row(chat):
    """The extra row under "Which month?" ([] when this person can't pick a parish)."""
    return [[{"text": OTHER, "callback_data": "mpar|list|"}]] if allowed(chat) else []


def kb_parishes(chat):
    rows = [[{"text": n, "callback_data": f"mpar|pick|{c}"}] for c, n in allowed(chat)]
    rows.append([{"text": "\u00ab Back", "callback_data": "mpar|start|"}])
    return rows


def kb_parish_month(code):
    return [[{"text": "This month", "callback_data": f"mpar|go|{code}|"}],
            [{"text": "Previous months \u00bb", "callback_data": f"mpar|prev|{code}"}],
            [{"text": "\u00ab Parishes", "callback_data": "mpar|list|"}]]


def kb_parish_prev(code, months, label):
    rows = [[{"text": label(ym), "callback_data": f"mpar|go|{code}|{ym}"} for ym in months[i:i + 2]]
            for i in range(0, len(months), 2)]
    rows.append([{"text": "\u00ab Back", "callback_data": f"mpar|pick|{code}"}])
    return rows


def sat_month_text(code, month=None):
    """A satellite parish's month screen, worked out in its own process (satinfo.use() changes monthinfo's settings
    while it runs, so it is never run inside the bot)."""
    r = subprocess.run([PY, os.path.join(TOOLS, "satinfo.py"), "month", str(code)] + ([month] if month else []),
                       capture_output=True, text=True, timeout=180)
    t = (r.stdout or "").strip()
    if r.returncode != 0 or not t:
        raise RuntimeError(f"satinfo month {code}: rc={r.returncode} {(r.stderr or '')[-300:]}")
    return t


def _show():
    if C.config() is None:
        print("no saved config: nobody gets the parish picker"); return
    print("parishes: " + ", ".join(f"{n} ({c})" for c, n in parishes()))
    for p in C.all_people():
        if C.is_sat(p):
            continue
        cid = str(p.get("telegram_chat_id") or "")
        a = allowed(cid) if cid else []
        v = p.get(FIELD)
        src = "not saved yet, admin default" if v is None else "Automations -> People"
        print(f"{p.get('key')}: " + (("can pick " + ", ".join(n for _, n in a)) if a else "Kingdom Parish only")
              + f"  ({src}{'' if cid else '; no Telegram'})")


def _selftest():
    """Made-up people and parishes in a temporary config; checks who gets the picker and the buttons. Sends nothing."""
    import tempfile
    d = tempfile.mkdtemp(prefix="monthpick-test-")
    cfg = {"people": [
        {"key": "admin1", "name": "Admin One", "telegram_chat_id": "1001", "full_status": True},
        {"key": "clerk1", "name": "Clerk One", "telegram_chat_id": "1002", "full_status": False},
        {"key": "viewer", "name": "Viewer", "telegram_chat_id": "1003", FIELD: True},
        {"key": "noadmin", "name": "Off", "telegram_chat_id": "1004", "full_status": True, FIELD: False},
        {"key": "some", "name": "Some", "telegram_chat_id": "1005", FIELD: ["100002"]},
        {"key": "pastor9", "name": "Pastor Nine", "telegram_chat_id": "1006", "parish": "100002", FIELD: True}],
        "parishes": [{"code": "100002", "name": "TEST PARISH TWO"}, {"code": KINGDOM, "name": "Kingdom Parish"},
                     {"code": "100003", "name": "Test Parish Three", "active": True},
                     {"code": "100004", "name": "Closed Parish", "active": False}]}
    old = (C.CFG, os.environ.get("CLERK_ROOT"))
    try:
        C.CFG = os.path.join(d, "config.json")
        os.environ["CLERK_ROOT"] = d
        json.dump({"config_version": 1, "is_default": False, "config": cfg}, open(C.CFG, "w"))
        allp = [c for c, _ in allowed(1001)]
        assert allp == [KINGDOM, "100002", "100003"], allp  # Kingdom first, inactive left out
        assert allowed(1002) == [] and other_row(1002) == [], "a person saved before the setting must not get the picker"
        assert [c for c, _ in allowed(1003)] == allp, "the setting on must give the picker"
        assert allowed(1004) == [], "the setting off must win over the admin default"
        assert [c for c, _ in allowed(1005)] == [KINGDOM, "100002"], "a list must give only those parishes"
        assert allowed(1006) == [] and allowed(999) == [], "satellite people and unknown chats never get it"
        assert may(1001, "100003") and not may(1005, "100003") and not may(1002, KINGDOM)
        assert dict(allowed(1001))["100002"] == "Test Parish Two"
        rows = kb_parishes(1001) + kb_parish_month("100002") + kb_parish_prev("100002", ["2026-09", "2026-08", "2026-07"], str)
        for r in rows:
            for b in r:
                assert b["callback_data"].startswith("mpar|") and len(b["callback_data"].encode()) <= 64, b
        assert other_row(1001)[0][0]["callback_data"] == "mpar|list|"
        cfg["people"][0][FIELD] = False  # changed in the app: the next press is refused straight away
        json.dump({"config_version": 2, "is_default": False, "config": cfg}, open(C.CFG, "w"))
        os.utime(C.CFG, (1, 1))
        assert allowed(1001) == [] and not may(1001, "100002"), "a change in the app must apply to the next press"
        json.dump({"config_version": 3, "is_default": True, "config": cfg}, open(C.CFG, "w"))
        assert allowed(1003) == [], "the unsaved default config must give nobody the picker"
    finally:
        C.CFG = old[0]
        if old[1] is None:
            os.environ.pop("CLERK_ROOT", None)
        else:
            os.environ["CLERK_ROOT"] = old[1]
        C._cache.update(mtime=None, data=None)
    print("selftest OK (made-up people and parishes; nothing read from the app, nothing sent)")


def _selftest_poller(path):
    """The bot's new buttons, run from the patched poller.py with stand-ins for Telegram (made-up chats; nothing sent)."""
    s = open(path, encoding="utf-8").read()
    a = s.index("# ---------------- month-parishes-20261003")
    b = s.index("\ndef main():", a)
    sent, answers = [], []
    allow = {"on": True}
    me = sys.modules[__name__]

    class FakeMP:
        OTHER = OTHER
        allowed = staticmethod(lambda chat: [(KINGDOM, "Kingdom Parish"), ("100002", "Test Parish Two")] if allow["on"] and chat == 1001 else [])
        name = staticmethod(lambda code: "Test Parish Two")
        kb_parishes = staticmethod(lambda chat: [[{"text": n, "callback_data": f"mpar|pick|{c}"}] for c, n in FakeMP.allowed(chat)])
        kb_parish_month = staticmethod(me.kb_parish_month)
        kb_parish_prev = staticmethod(me.kb_parish_prev)
        sat_month_text = staticmethod(lambda code, m=None: f"MONTH {code} {m}")
    before = {"msg": [], "cb": []}
    g = {"__name__": "pollertest", "log": lambda *x: None, "traceback": __import__("traceback"), "re": re,
         "handle_message": lambda st, msg: before["msg"].append(msg), "handle_callback": lambda st, cq: before["cb"].append(cq),
         "send": lambda chat, text, kb=None, html=False: sent.append((chat, text, kb)),
         "_send_long": lambda chat, text, kb=None: sent.append((chat, text, kb)),
         "api": lambda method, **k: answers.append(k.get("text")), "drop_kb": lambda chat, mid: None,
         "_known": lambda chat: chat in (1001, 1002), "_can": lambda chat, cmd: True, "_is_sat": lambda chat: False,
         "_bm": lambda *a, **k: None, "_go": lambda fn, *a: fn(*a), "_bset": lambda k, d: d,
         "_recent_months": lambda n=6: ["2026-09", "2026-08"][:n],
         "_send_month_report": lambda chat, m: sent.append((chat, f"KINGDOM {m}", None)),
         "kb_month_start": lambda: [[{"text": "This month", "callback_data": "month|this|"}]]}
    g["_words"] = lambda msg: (lambda w: (w[0].lower() if w else "", w[1] if len(w) > 1 else "", None))((msg.get("text") or "").split())
    exec(compile(s[a:b], path, "exec"), g)
    g["MP"] = FakeMP
    try:
        import monthinfo  # noqa: F401  (month names for the Previous months buttons)
    except Exception:
        sys.modules["monthinfo"] = type(sys)("monthinfo"); sys.modules["monthinfo"].month_label = str
    msg = lambda chat, t: {"chat": {"type": "private"}, "from": {"id": chat}, "text": t}
    cq = lambda chat, d: {"id": "x", "from": {"id": chat}, "data": d, "message": {"message_id": 1}}
    g["handle_message"]({}, msg(1001, "/month"))
    assert sent[-1][1] == "Which month?" and sent[-1][2][-1][0]["callback_data"] == "mpar|list|", sent[-1]
    g["handle_message"]({}, msg(1002, "/month"))
    assert before["msg"] and sent[-1][0] == 1001, "someone without the setting must get /month exactly as before"
    g["handle_callback"]({}, cq(1001, "mpar|list|"))
    assert sent[-1][1] == "Which parish?"
    g["handle_callback"]({}, cq(1001, "mpar|pick|100002"))
    assert sent[-1][1] == "Test Parish Two: which month?"
    g["handle_callback"]({}, cq(1001, "mpar|prev|100002"))
    assert [b["callback_data"] for b in sent[-1][2][0]] == ["mpar|go|100002|2026-09", "mpar|go|100002|2026-08"], sent[-1]
    g["handle_callback"]({}, cq(1001, "mpar|go|100002|2026-09"))
    assert sent[-1][1] == "MONTH 100002 2026-09", sent[-1]
    g["handle_callback"]({}, cq(1001, "mpar|go|602757|"))
    assert sent[-1][1] == "KINGDOM None"
    n = len(sent)
    g["handle_callback"]({}, cq(1001, "mpar|go|999999|"))
    assert len(sent) == n and answers[-1] == "This isn't available for you.", "a parish not in the list must be refused"
    g["handle_callback"]({}, cq(1002, "mpar|pick|100002"))
    assert len(sent) == n and answers[-1] == "This isn't available for you."
    allow["on"] = False  # switched off in the app after the buttons were shown: the next press is refused
    g["handle_callback"]({}, cq(1001, "mpar|go|100002|"))
    assert len(sent) == n and answers[-1] == "This isn't available for you.", "the setting must be checked on every press"
    g["handle_callback"]({}, cq(1001, "month|back|"))
    g["handle_callback"]({}, cq(1001, "month|this|"))
    assert len(before["cb"]) == 2 and len(sent) == n, "other buttons must go to the earlier handler unchanged"
    print("bot buttons OK (made-up chats; Telegram replaced by stand-ins, nothing sent)")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["show"]:
        _show()
    elif a[:1] == ["selftest"]:
        _selftest()
        if "--poller" in a:
            _selftest_poller(a[a.index("--poller") + 1])
    else:
        print(__doc__)
        sys.exit(2)
