#!/usr/bin/env python3
"""Satellite parishes on the Clerk box: who they are, their app, their reminders (parishes-20261003).

A satellite parish is a parish in Automations → Parishes other than Kingdom Parish (602757). Its people are the people
whose `parish` is its code; the copies and the late-alert people are chosen on its card. Its app is Kingdom's app with
the X-Sat-Parish header (read-only automation key), so it has its own collections, attendance and Monthly report.

  satinfo.py tick                 every supervisor cycle: the Sunday records reminders of every active parish
                                  (same days and times as Kingdom's), and the daily late alert after the cut-off
  satinfo.py month CODE [YYYY-MM] print that parish's /month text
  satinfo.py health               print what the box reports for the parishes (Automations → Parishes)

Read-only in the app. Never files anything. Messages go through send_msg.py / mailer.py like every other runner.
"""
import base64, datetime, html, json, os, re, subprocess, sys, urllib.request

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
TOOLS = os.path.join(ROOT, "tools")
SAT_ROOT = os.environ.get("SAT_ROOT", os.path.join(ROOT, "rccg-sat"))
SATLINKS = os.path.join(ROOT, "state", "satlinks.json")
PRIV_KEY = os.path.join(ROOT, ".secrets", "box-portal-key.pem")   # made here; only the box ever reads it
PUB_KEY = os.path.join(ROOT, "state", "box-public-key.b64")
KINGDOM = "602757"
PY = sys.executable or "python3"

sys.path.insert(0, TOOLS)
import clerkcfg as C  # noqa: E402
import monthinfo as MI  # noqa: E402

_ORIG = {k: getattr(MI, k) for k in ("app_get", "CACHE", "LADDER_STATE", "REMIT_STATE", "MONTHCLOSE_STATE", "records_msg", "next_step")}


def rjson(p, d=None):
    try:
        return json.load(open(p))
    except Exception:
        return d


def wjson(p, o):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(o, open(p + ".tmp", "w"), indent=1, ensure_ascii=False, default=str)
    os.replace(p + ".tmp", p)


# ---------------------------------------------------------------- the parishes and their people
def person(key):
    return next((p for p in C.all_people() if p.get("key") == key), {"key": key})


def called(key):
    p = person(key)
    return (p.get("called") or "").strip() or (str(p.get("name") or key).split() or [key])[0]


class Parish:
    def __init__(self, code):
        self.code = str(code)
        cfg = C.config() or {}
        self.cfg = next((p for p in cfg.get("parishes") or [] if str(p.get("code")) == self.code), {}) or {}
        self.name = self.cfg.get("name") or f"Parish {self.code}"
        self.active = self.cfg.get("active") is not False
        self.people = [p for p in C.all_people() if str(p.get("parish") or "") == self.code]
        self.dir = os.path.join(SAT_ROOT, self.code)
        self.remit = os.path.join(self.dir, "remit")
        self.att = os.path.join(self.dir, "att")
        self.state = os.path.join(self.dir, "state")

    def keys(self, flag=None):
        """The parish's people (with `flag` on, e.g. pays_rrr; everyone when nobody has it on)."""
        ks = [p["key"] for p in self.people]
        if flag:
            on = [p["key"] for p in self.people if p.get(flag)]
            return on or ks
        return ks

    def _pick(self, field, default):
        v = self.cfg.get(field)
        keys = {p["key"] for p in C.all_people()}
        return [k for k in (v if isinstance(v, list) else default) if k in keys or not keys]

    def copies(self):
        return self._pick("copies", ["david"])

    def late_alert(self):
        return self._pick("late_alert", [])


def parishes(active_only=True):
    out = []
    for p in (C.config() or {}).get("parishes") or []:
        code = str(p.get("code") or "")
        if re.fullmatch(r"\d{4,8}", code) and code != KINGDOM:
            P = Parish(code)
            if P.active or not active_only:
                out.append(P)
    return out


def parish_for_chat(chat):
    """(Parish, person key) of a satellite parish's person with this Telegram chat id, else (None, None)."""
    for p in C.all_people():
        if C.is_sat(p) and str(p.get("telegram_chat_id") or "") == str(chat):
            return Parish(p["parish"]), p["key"]
    return None, None


def routed(key, mtype, channel="telegram"):
    """The person's switch for this message type (Automations routing); on when the type isn't routed for them."""
    r = C._routing(mtype) or {}
    return bool((r.get(key) or {}).get(channel, True)) if key in r else True


# ---------------------------------------------------------------- sending
def tg(who, text, key, guard):
    who = ",".join(dict.fromkeys(k for k in who if k))
    if not who:
        return
    subprocess.run([PY, os.path.join(ROOT, "telegram", "send_msg.py"), who, text, "--guard", guard, "--key", key],
                   capture_output=True, text=True, timeout=180)


def email(to, subject, text):
    to = [a for a in dict.fromkeys(to) if a]
    if not to:
        return
    pf = os.path.join(ROOT, "state", "satinfo-out", f"mail-{datetime.datetime.now():%Y%m%d-%H%M%S-%f}.json")
    wjson(pf, {"to": to, "subject": subject, "body": re.sub(r"<[^>]+>", "", html.unescape(text)) + "\n\nChurch Clerk"})
    subprocess.run([PY, os.path.join(TOOLS, "mailer.py"), "send", "--payload", pf], capture_output=True, text=True, timeout=180)


# ---------------------------------------------------------------- the parish's app, through monthinfo.py
def use(P):
    """Point monthinfo.py at the parish: its app (X-Sat-Parish), its caches, its month-end and month-close records, and
    its own names in the texts. use(None) puts Kingdom back."""
    for k, v in _ORIG.items():
        setattr(MI, k, v)
    if P is None:
        return

    def app_get(path):
        h = {"User-Agent": "kp-box-satinfo/1", "Accept": "application/json", "X-Sat-Parish": P.code}
        k = MI._key()
        if k:
            h["X-Automation-Key"] = k
        with urllib.request.urlopen(urllib.request.Request(f"{MI.APP}/api/{path}", headers=h), timeout=40) as r:
            return json.load(r)
    MI.app_get = app_get
    MI.CACHE = os.path.join(P.state, "monthinfo-cache.json")
    MI.LADDER_STATE = os.path.join(P.state, "monthinfo-ladder.json")
    MI.REMIT_STATE = os.path.join(P.remit, "state", "remit-runs.json")
    MI.MONTHCLOSE_STATE = os.path.join(ROOT, "state", f"monthclose-{P.code}.json")
    os.makedirs(P.state, exist_ok=True)
    pastor = called(P.keys()[0]) if P.keys() else "Pastor"

    def local(t):
        return (t or "").replace("Kingdom Parish", P.name).replace("Bro. Divine", pastor).replace("David or Bro. Divine", pastor) \
            if t else t

    def records_msg(f, kind, today):
        P._kind = kind
        return local(_ORIG["records_msg"](f, kind, today))

    def next_step(f):
        t = _ORIG["next_step"](f).replace("David or Bro. Divine: check the email", f"{pastor}: check the Telegram message")
        return re.sub(r"^(David|Bro\. Divine): ", "The Area office: " if t.startswith("David") else f"{pastor}: ", t)
    MI.records_msg, MI.next_step = records_msg, next_step


def month_text(P, month=None):
    use(P)
    try:
        return f"<b>{html.escape(P.name)}</b>\n" + MI.month_text(MI.facts(month=month, prefer_open=True))
    finally:
        use(None)


# ---------------------------------------------------------------- reminders (the same days and times as Kingdom's)
class _Cfg:
    """clerkcfg for monthinfo.ladder(): Kingdom's reminder settings, the parish's people. A parish has no separate weekly
    attendance message, so its Monday reminder comes from the ladder."""
    def __init__(self, P):
        self.P = P

    def get(self, path, default=None):
        if path == "automations.weekly_attendance_reminder.enabled":
            return False
        return C.get(path, default)

    def num(self, path, default):
        return C.num(path, default)

    def who(self, mtype, default, exclude=()):
        return ",".join(k for k in self.P.keys() if routed(k, mtype))


def remind(P, now=None):
    now = now or datetime.datetime.now()
    if not P.people:
        return []
    once_f = os.path.join(P.state, "reminders-sent.json")
    sent_before = rjson(once_f, {}) or {}
    guard = os.path.join(P.state, "tg-sent.json")

    def once(flag, key):
        k = f"{flag}:{key}"
        if k in sent_before:
            return False
        sent_before[k] = now.isoformat(timespec="seconds")
        wjson(once_f, {k2: v for k2, v in sent_before.items() if v[:10] >= f"{now - datetime.timedelta(days=60):%Y-%m-%d}"})
        return True

    def send(who, text, mtype):
        keys = [k for k in who.split(",") if k]
        kind = getattr(P, "_kind", "")
        # the late alert after the cut-off also goes to the people chosen for it; the copies get the cut-off day ones only
        extra = (P.late_alert() if kind == "after" else []) + (P.copies() if kind in ("cutoff", "after") else [])
        tag = f"satrem:{P.code}:{getattr(P, '_kind', '')}:{now:%Y-%m-%d}"
        tg(keys + [k for k in extra if k not in keys], text, tag, guard)
        no_tg = [k for k in keys if not person(k).get("telegram_chat_id") and routed(k, mtype, "email")]
        email([person(k).get("email") for k in no_tg], f"{P.name}: Sunday records reminder", text)

    use(P)
    try:
        return MI.ladder(now, send, once, _Cfg(P))
    finally:
        use(None)


def tick():
    for P in parishes():
        try:
            remind(P)
        except Exception as e:
            print(f"{datetime.datetime.now():%F %H:%M} satinfo {P.code}: {type(e).__name__}: {e}"[:300])


# ---------------------------------------------------------------- health (Automations → Parishes, Area overview)
def public_key():
    """The box's RSA public key (base64 SPKI) for the app to lock a parish's portal password; made once."""
    if os.path.exists(PUB_KEY):
        return open(PUB_KEY).read().strip()
    if not os.path.exists(PRIV_KEY):
        os.makedirs(os.path.dirname(PRIV_KEY), exist_ok=True)
        old = os.umask(0o077)
        try:
            r = subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", PRIV_KEY],
                               capture_output=True, timeout=60)
        finally:
            os.umask(old)
        if r.returncode:
            return None
    r = subprocess.run(["openssl", "pkey", "-in", PRIV_KEY, "-pubout", "-outform", "DER"], capture_output=True, timeout=30)
    if r.returncode or not r.stdout:
        return None
    b = base64.b64encode(r.stdout).decode()
    os.makedirs(os.path.dirname(PUB_KEY), exist_ok=True)
    open(PUB_KEY, "w").write(b)
    return b


def month_end_summary(P):
    runs = rjson(os.path.join(P.remit, "state", "remit-runs.json"), {}) or {}
    ks = sorted(k for k, e in runs.items() if isinstance(e, dict) and ".." in k)
    if not ks:
        return {}
    e = runs[ks[-1]]
    m = e.get("month") or ks[-1].split("..")[-1][:7]
    words = {"awaiting-reply": "check sent", "done": "RRR generated", "held": "on hold", "failed": "stopped",
             "generating": "generating RRR", "refreshing": "refreshing"}
    paid = ((rjson(os.path.join(ROOT, "state", f"monthclose-{P.code}.json"), {}) or {}).get(m) or {}).get("paid")
    return {"month": m, "month_end": f"{MI.month_label(m)}: {words.get(e.get('status'), e.get('status') or 'started')}",
            "rrr": ((e.get("rrr") or {}).get("code")) or None, "paid": bool(paid)}


def health():
    links = rjson(SATLINKS, {}) or {}
    out = {"satellites": {}, "satellite_links": {k: True for k in links}}
    for P in parishes(active_only=False):
        try:
            out["satellites"][P.code] = month_end_summary(P)
        except Exception as e:
            out["satellites"][P.code] = {"error": str(e)[:100]}
    try:
        k = public_key()
        if k:
            out["box_public_key"] = k
    except Exception:
        pass
    return out


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["tick"]:
        tick()
    elif a[:1] == ["month"] and len(a) > 1:
        print(month_text(Parish(a[1]), a[2] if len(a) > 2 else None))
    elif a[:1] == ["health"]:
        print(json.dumps(health(), indent=1))
    else:
        print(__doc__)
        sys.exit(2)
# parishes-20261003
