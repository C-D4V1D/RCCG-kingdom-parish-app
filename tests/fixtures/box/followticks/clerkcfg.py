#!/usr/bin/env python3
"""Clerk box settings from the church app's Automations tab (installed 2026-09-28; month-end mailbox 2026-10-01; statement day records-20260928;
attendance polling removed, cleanup-20260928: attendance is filed with the month-end run).

The app saves one config in the clerk-watchdog Worker. `clerkcfg.py sync` (run by supervisor.sh every cycle) downloads
it to /workspace/config.json when its version changes; every runner then reads it through the helpers below.
No config yet, an unsaved default, or any error -> every helper returns the runner's own built-in value, so the box
behaves exactly as before.

  clerkcfg.py sync                      fetch the config if the Worker has a newer version, then apply it
  clerkcfg.py ping                      send the status report (health) to the Worker; fetch config if it says so
  clerkcfg.py health                    print the status report that `ping` would send
  clerkcfg.py show                      print the config the box is using (or "none")
  clerkcfg.py get <path> <default>      print one value, e.g. automations.memo.check_time 08:45
  clerkcfg.py int <path> <default> [min]
  clerkcfg.py flag <path> <true|false>  exit 0 if true, 3 if false
  clerkcfg.py due memo                  exit 0 if the memo check should run now, 3 if not
  clerkcfg.py events                    fetch new month-end signals from the Worker mailbox and start monthend.py
  clerkcfg.py apply                     rewrite the scheduler's sched_config.json from the saved settings

Month-end (monthend-20261001): `sync` also collects new month-end signals (cut-off collection saved, Generate RRR /
Refresh buttons) from the Worker mailbox into /workspace/state/monthend/inbox and starts monthend.py to act on them.
"""
import datetime, json, os, re, subprocess, sys, urllib.request, urllib.error

# The CLERK_* environment overrides exist for the repo tests only; the box never sets them.
CFG = os.environ.get("CLERK_CFG", "/workspace/config.json")
WORKER = os.environ.get("CLERK_WORKER", "https://clerk-watchdog.decan-inv.workers.dev")
TOKEN_FILE = os.environ.get("CLERK_TOKEN_FILE", "/workspace/.secrets/watchdog-token")
UA = "Mozilla/5.0 clerk-supervisor"
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
SCHED_CONFIG = "/workspace/telegram/srcdoc/sched_config.json"
MONTHEND_DIR = os.environ.get("CLERK_MONTHEND_DIR", "/workspace/state/monthend")
MONTHEND = os.environ.get("CLERK_MONTHEND", "/workspace/tools/monthend.py")
NOT_REMITTED = "__not_remitted__"

# message type for a send_msg.py --key prefix
KEY_TYPES = {"memo": "memo_forwarded", "stmt": "monthly_statement", "att": "attendance_filed", "attnudge": "attendance_nudge",
             "check": "remittance_check", "action": "remittance_check", "rrr": "rrr_generated", "pcheck": "parish_remittance_check",
             "sunday": "sunday_note", "nowake": "scheduler_fallback", "memohold": "memo_error",
             "mendatt": "attendance_error", "mendatt-fail": "attendance_error", "mendatt-diff": "attendance_error",
             "mendatt-nf": "attendance_error", "mendatt-nr": "attendance_error", "mendatt-same": "attendance_error",
             "mendatt-mail": "attendance_error", "mendatt-ign": "attendance_error"}  # month-end attendance problems
# message type for a tg_card / tgcard.py card, by the runner's CLERK_CONTEXT and the card icon
CONTEXT_TYPES = {"attendance": {"ok": "attendance_filed", "wait": "attendance_nudge_fallback", "*": "attendance_error"},
                 "statement": {"*": "statement_error"},
                 "memo": {"*": "memo_error"}}

_cache = {"mtime": None, "data": None}


# ---------------- reading ----------------
def _raw():
    try:
        m = os.path.getmtime(CFG)
    except OSError:
        return None
    if _cache["mtime"] != m:
        try:
            _cache["data"] = json.load(open(CFG))
        except Exception:
            _cache["data"] = None
        _cache["mtime"] = m
    return _cache["data"]


def config():
    """The saved config, or None (no file, unreadable, or still the unsaved default)."""
    d = _raw()
    if not isinstance(d, dict) or d.get("is_default") or not isinstance(d.get("config"), dict):
        return None
    return d["config"]


def get(path, default=None):
    c = config()
    if c is None:
        return default
    for k in path.split("."):
        if not isinstance(c, dict) or k not in c:
            return default
        c = c[k]
    return default if c is None else c


def num(path, default):
    v = get(path, default)
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else default


def enabled(auto):
    return get(f"automations.{auto}.enabled", True) is not False


def hm(s, default="00:00"):
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", str(s or ""))
    if not m:
        m = re.fullmatch(r"(\d{1,2}):(\d{2})", default)
    return int(m.group(1)), int(m.group(2))


def at_or_after(t, hhmm):
    return (t.hour, t.minute) >= hm(hhmm)


def in_window(t, start, end):
    return hm(start) <= (t.hour, t.minute) < hm(end)


def weekday(name, default):
    return DAYS.index(name) if name in DAYS else default


def att_reminders(close):
    """[(round, day, (h, m))] for the two attendance nudges before the portal closes."""
    out = []
    for n, dflt_days, dflt_time in ((1, 1, "18:00"), (2, 0, "12:00")):
        d = num(f"automations.attendance.reminder{n}.days_before_close", dflt_days)
        out.append((n, close - datetime.timedelta(days=int(d)), hm(get(f"automations.attendance.reminder{n}.time", dflt_time), dflt_time)))
    return out


# ---------------- people and routing ----------------
def all_people():  # parishes-20261003: everyone, satellite parishes' people included (chat ids linked by the bot merged in)
    c = config()
    ps = [dict(p) for p in (c or {}).get("people", []) if isinstance(p, dict) and p.get("key")]
    try:
        links = json.load(open(os.path.join(os.environ.get("CLERK_ROOT", "/workspace"), "state", "satlinks.json")))
    except Exception:
        links = {}
    for p in ps:
        cid = str((links if isinstance(links, dict) else {}).get(p["key"]) or "")
        if is_sat(p) and not p.get("telegram_chat_id") and re.fullmatch(r"-?\d+", cid):
            p["telegram_chat_id"] = cid
    return ps


def is_sat(p):  # parishes-20261003
    return str(p.get("parish") or "602757") != "602757"


def people():
    c = config()
    return [p for p in all_people() if not is_sat(p)]  # parishes-20261003: Kingdom Parish's people only


def _routing(mtype):
    c = config()
    if c is None or not mtype:
        return None
    r = (c.get("routing") or {}).get(mtype)
    return r if isinstance(r, dict) else None


def tg_allowed(mtype, who):
    """May `who` get this Telegram message? True whenever the config doesn't say otherwise."""
    if config() is None:
        return True
    keys = {p["key"] for p in all_people()}  # parishes-20261003
    if keys and who not in keys:
        return False                                  # person was removed in the app
    r = _routing(mtype)
    if r is None:
        return True                                   # message type the app doesn't manage
    return bool((r.get(who) or {}).get("telegram"))


def who(mtype, default, exclude=()):
    """Comma list of people who get this message on Telegram (and have a chat id). Falls back to `default`."""
    r = _routing(mtype)
    if r is None:
        return default
    ids = {p["key"]: p.get("telegram_chat_id") for p in people()}
    return ",".join(k for k, v in r.items() if (v or {}).get("telegram") and ids.get(k) and k not in exclude)


def one(mtype, key):
    """`key` if that person gets this message on Telegram, else ''."""
    return key if tg_allowed(mtype, key) else ""


def merge_contacts(contacts):
    """contacts.json plus chat ids set in the app (the app wins; nobody is removed here)."""
    out = dict(contacts)
    for p in all_people():  # parishes-20261003: chat ids of the satellite parishes' people too
        cid = str(p.get("telegram_chat_id") or "").strip()
        if re.fullmatch(r"-?\d+", cid):
            e = dict(out.get(p["key"]) or {})
            e["chat_id"] = int(cid)
            e.setdefault("name", p.get("name") or p["key"])
            out[p["key"]] = e
    return out


def type_for(key=None, context=None, icon=None):
    t = os.environ.get("CLERK_MSG_TYPE")
    if t:
        return t
    if key:
        return KEY_TYPES.get(str(key).split(":")[0])
    ctx = CONTEXT_TYPES.get(context or os.environ.get("CLERK_CONTEXT") or "")
    if ctx:
        return ctx.get(icon or "", ctx.get("*"))
    return None


def filter_emails(mtype, to, cc, add_missing=True):
    """Apply email routing. Addresses of people in the app follow their switch; other addresses are kept;
    people switched on but missing are added to `to`. Returns (to, cc) or None when routing doesn't apply.
    add_missing=False (c2fix-20261003): a personal email (one person's own copy, e.g. with their buttons) is only
    filtered: a switched-off person is dropped, nobody is ever added."""
    r = _routing(mtype)
    if r is None:
        return None
    byaddr = {str(p.get("email") or "").strip().lower(): p["key"] for p in people() if p.get("email")}
    on = lambda k: bool((r.get(k) or {}).get("email"))
    keep = lambda lst: [a for a in lst if a.strip().lower() not in byaddr or on(byaddr[a.strip().lower()])]
    to2, cc2 = keep(to), keep(cc)
    if not add_missing:  # c2fix-20261003
        return to2, cc2
    have = {a.strip().lower() for a in to2 + cc2}
    for p in people():
        e = str(p.get("email") or "").strip()
        if e and on(p["key"]) and e.lower() not in have:
            to2.append(e); have.add(e.lower())
    return to2, cc2


def check_people(channel, default=("david", "divine", "pastor")):  # checkpeople-20261003
    """Kingdom people who get their own remittance check on `channel` ("email" or "telegram"): remittance_check routing
    in Automations, in the app's people order, each once. `default` without a config or without that routing."""
    r = _routing("remittance_check")
    if r is None:
        return list(default)
    out = []
    for p in people():
        if p["key"] not in out and (r.get(p["key"]) or {}).get(channel):
            out.append(p["key"])
    return out


def button_emails():  # c2fix-20261003
    """Lower-case email addresses of the people allowed action buttons (buttons on in the app). None without a config."""
    if config() is None:
        return None
    return {str(p.get("email")).strip().lower() for p in all_people() if p.get("buttons") and str(p.get("email") or "").strip()}


# ---------------- parishes / upload bot ----------------
def parishes(flag, default):
    """{code: name} of parishes with `flag` on (e.g. source_docs); `default` (dict) when there is no config."""
    ps = (config() or {}).get("parishes")
    if not isinstance(ps, list):
        return default
    return {str(p["code"]): p.get("name") or str(p["code"]) for p in ps if isinstance(p, dict) and p.get("code") and p.get(flag)}


def parish_list(flag, default):
    """[(code, NAME)] like poller.py's PARISHES."""
    d = parishes(flag, None)
    return [(c, n.upper()) for c, n in d.items()] if d else default


def bot_people(default):
    ps = [p for p in all_people() if p.get("can_upload") and re.fullmatch(r"-?\d+", str(p.get("telegram_chat_id") or ""))]  # parishes-20261003
    if config() is None or not ps:
        return default
    return {int(p["telegram_chat_id"]): (str(p.get("name") or p["key"]).split() or [p["key"]])[0] for p in ps}


def bot_sat_parishes():  # parishes-20261003
    """{chat id: parish code} for a satellite parish's people who may use the bot (their own parish only)."""
    return {int(p["telegram_chat_id"]): str(p["parish"]) for p in all_people()
            if is_sat(p) and p.get("can_upload") and re.fullmatch(r"-?\d+", str(p.get("telegram_chat_id") or ""))}


def bot_admin(default):
    for p in people():
        if p.get("full_status") and re.fullmatch(r"-?\d+", str(p.get("telegram_chat_id") or "")):
            return int(p["telegram_chat_id"])
    return default


# ---------------- Telegram bot menus (botmenu-20261003) ----------------
BOT_DEFAULTS = {"menu": {"month": "everyone", "upload": "everyone", "paid": "payers", "statement": "kingdom",
                         "balance": "kingdom", "refresh": "admin", "system": "admin", "help": "everyone"},
                "previous_months": 6, "month_portal_check": "button", "reply_unknown": True,
                "unknown_contact": "the parish IT administrator"}
BOT_AUDIENCES = ("everyone", "kingdom", "payers", "admin", "off")


def bot_settings():
    """automations.telegram_bot from the app merged over BOT_DEFAULTS (each value checked); the defaults when there is
    no config, it is the unsaved default, or anything is invalid."""
    out = json.loads(json.dumps(BOT_DEFAULTS))
    try:
        s = get("automations.telegram_bot", None)
        if not isinstance(s, dict):
            return out
        m = s.get("menu")
        if isinstance(m, dict):
            for k in out["menu"]:
                if m.get(k) in BOT_AUDIENCES:
                    out["menu"][k] = m[k]
        n = s.get("previous_months")
        if isinstance(n, (int, float)) and not isinstance(n, bool):
            out["previous_months"] = max(3, min(12, int(n)))
        if s.get("month_portal_check") in ("button", "always", "off"):
            out["month_portal_check"] = s["month_portal_check"]
        if isinstance(s.get("reply_unknown"), bool):
            out["reply_unknown"] = s["reply_unknown"]
        c = s.get("unknown_contact")
        if isinstance(c, str) and c.strip():
            out["unknown_contact"] = " ".join(c.split())[:120]
    except Exception:
        pass
    return out


def parish_name(code, default=None):
    """A parish's name from Automations -> Parishes ("KINGDOM PARISH" is shown as "Kingdom Parish")."""
    code = str(code)
    try:
        p = next((p for p in (config() or {}).get("parishes") or [] if isinstance(p, dict) and str(p.get("code")) == code), None)
        n = str((p or {}).get("name") or "").strip()
    except Exception:
        n = ""
    n = n or default or ("Kingdom Parish" if code == "602757" else f"Parish {code}")
    if n.isupper():
        n = " ".join(w.lower() if i and w.lower() in ("of", "and") else w.capitalize() for i, w in enumerate(n.split()))
    return n


def sections(default):
    out = dict(default)
    for sec, key in (("admin", "admin_max_kb"), ("finance", "finance_max_kb")):
        kb = num(f"automations.upload_bot.{key}", None)
        if kb and sec in out:
            kb = int(kb)
            out[sec] = (out[sec][0], kb * 1000, f"{kb // 1000} MB" if kb % 1000 == 0 else f"{kb} KB")
    return out


# ---------------- month-end (remittance) ----------------
def remittance_handler():
    """'box' only when the saved settings say the Clerk box runs the month-end; otherwise 'clerk_ai'."""
    return "box" if get("remittance.handler", "clerk_ai") == "box" else "clerk_ai"


def remittance_lines():
    """{app category key: portal line or NOT_REMITTED} from the app's Remittance lines, or None (not saved yet)."""
    lines = get("remittance.lines", None)
    if not isinstance(lines, dict) or not lines:
        return None
    return {str(k): str(v).strip() for k, v in lines.items() if isinstance(v, str) and v.strip()}


def remittance_overrides(weekly, unmapped):
    """remit_match.py's (APP_KEY_TO_WEEKLY_LINE, UNMAPPED_APP_KEYS, NOT_REMITTED_APP_KEYS) with the app's Remittance
    lines applied, or None to keep the built-in lists. Keys keep the built-in order; new keys follow."""
    lines = remittance_lines()
    if lines is None:
        return None
    order = [k for k, _ in weekly] + sorted(k for k in lines if k not in dict(weekly))
    new_weekly = [(k, lines[k]) for k in order if lines.get(k) and lines[k] != NOT_REMITTED]
    not_remitted = {k for k, v in lines.items() if v == NOT_REMITTED}
    new_unmapped = {k: n for k, n in unmapped.items() if k not in lines}
    return new_weekly, new_unmapped, not_remitted


def _cursor():
    try:
        return open(os.path.join(MONTHEND_DIR, "cursor")).read().strip()
    except Exception:
        return None


def events(last=None):
    """Copy new mailbox signals into the inbox (never twice), then start monthend.py if there is anything to do.
    First run: start from the newest signal (older ones were for the Clerk AI)."""
    inbox = os.path.join(MONTHEND_DIR, "inbox")
    os.makedirs(inbox, exist_ok=True)
    cur = _cursor()
    if last and cur is None:
        open(os.path.join(MONTHEND_DIR, "cursor"), "w").write(last); cur = last
    n = 0
    while last and cur is not None and last > cur:
        d = _call("GET", "/events?after=" + urllib.request.quote(cur))
        for ev in d.get("events") or []:
            if ev.get("event") == "bank_balance_refresh_requested":  # bankbalance-20260929: not a month-end signal
                start_balance_check()
                continue
            eid = re.sub(r"[^0-9A-Za-z-]", "", str(ev.get("id") or ""))
            if not eid:
                continue
            p = os.path.join(inbox, eid + ".json")
            if not os.path.exists(os.path.join(MONTHEND_DIR, "done", eid + ".json")) and not os.path.exists(p):
                json.dump(ev, open(p + ".tmp", "w"), indent=1); os.replace(p + ".tmp", p); n += 1
        nxt = str(d.get("last") or cur)
        if nxt <= cur:
            break
        cur = nxt
        open(os.path.join(MONTHEND_DIR, "cursor"), "w").write(cur)
    if n:
        print(f"{datetime.datetime.now():%F %H:%M} {n} month-end signal(s) received")
    start_monthend()
    return n


BALANCE_DIR = os.environ.get("CLERK_BALANCE_DIR", "/workspace/state/bankbalance")  # bankbalance-20260929
BALANCE_SCRIPT = os.environ.get("CLERK_BALANCE_SCRIPT", "/workspace/tools/bankbalance.cjs")
NODE_BIN = os.environ.get("CLERK_NODE", "node")
BALANCE_TIMES = ("07:00", "19:00")  # roughly twice daily; Refresh / the bot also trigger one


def balance_check_times():
    """Today's balance-check times, from automations.supervisor config
    (balance_check_interval_minutes, balance_check_active_from, balance_check_active_until) — a dense
    list of HH:MM slots across the active window, one gap apart. Falls back to the old fixed twice-daily
    BALANCE_TIMES when any of the three settings is missing/unsaved, invalid, or the window doesn't make
    sense, or the interval isn't a whole number of minutes (bankbalance-reconcile-20261001)."""
    mins = num("automations.supervisor.balance_check_interval_minutes", None)
    start = get("automations.supervisor.balance_check_active_from", None)
    end = get("automations.supervisor.balance_check_active_until", None)
    if not mins or mins <= 0 or mins != int(mins) or not start or not end:
        return list(BALANCE_TIMES)
    sh, sm = hm(start, "06:00")
    eh, em = hm(end, "22:00")
    start_min, end_min = sh * 60 + sm, eh * 60 + em
    if end_min <= start_min:
        return list(BALANCE_TIMES)
    out = []
    t = start_min
    while t < end_min:
        out.append(f"{t // 60:02d}:{t % 60:02d}")
        t += int(mins)
    return out or list(BALANCE_TIMES)



def start_balance_check():
    """Start the real bank-balance check (detached): Refresh, /balance, or the twice-daily schedule."""
    if os.path.exists(BALANCE_SCRIPT):
        subprocess.Popen([NODE_BIN, BALANCE_SCRIPT, "check"], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                          stderr=subprocess.DEVNULL, start_new_session=True)


BALANCE_CURSOR = os.path.join(BALANCE_DIR, "cursor")  # bankbalance-fastcheck-20261001
BALANCE_CHECK_TIMEOUT = 4  # seconds — must never meaningfully stall the Telegram bot's own loop
BALANCE_CHECK_MIN_GAP = 5  # seconds between attempts, even if the loop iterates faster than this
_balance_check_last_attempt = [0.0]


def _balance_cursor():
    try:
        return open(BALANCE_CURSOR).read().strip()
    except Exception:
        return None


def _call_fast(method, path):
    """Like _call(), but with a short timeout and no raise — only for balance_events_check(),
    so a slow or unreachable Worker can never meaningfully stall the Telegram bot's own loop."""
    tok = _token()
    if not tok:
        return None
    req = urllib.request.Request(WORKER + path, headers={"x-watchdog-token": tok, "User-Agent": UA}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=BALANCE_CHECK_TIMEOUT) as r:
            return json.load(r)
    except Exception:
        return None


def balance_events_check():
    """Lightweight, frequent check for a bank_balance_refresh_requested signal, independent of
    the 5-minute config/month-end sync. Called from the Telegram bot's own loop (poller.py) so
    pressing Refresh in the app is picked up within a few seconds, worst case under a minute,
    instead of waiting up to 5 minutes. Never touches the month-end cursor or inbox. Uses a short
    timeout and a minimum gap between attempts, so a slow/unreachable Worker can never stall the
    bot's own message handling."""
    now = datetime.datetime.now().timestamp()
    if now - _balance_check_last_attempt[0] < BALANCE_CHECK_MIN_GAP:
        return
    _balance_check_last_attempt[0] = now
    cv = _call_fast("GET", "/config/version")
    if cv is None:
        return
    last = cv.get("events_last")
    cur = _balance_cursor()
    if cur is None:
        if last:
            os.makedirs(BALANCE_DIR, exist_ok=True)
            open(BALANCE_CURSOR, "w").write(last)
        return
    if not last or last <= cur:
        return
    d = _call_fast("GET", "/events?after=" + urllib.request.quote(cur))
    if d is None:
        return
    triggered = any(ev.get("event") == "bank_balance_refresh_requested" for ev in (d.get("events") or []))
    nxt = str(d.get("last") or cur)
    if nxt != cur:
        tmp = BALANCE_CURSOR + ".tmp"; open(tmp, "w").write(nxt); os.replace(tmp, BALANCE_CURSOR)
    if triggered:
        start_balance_check()


def due_balance_check():
    """True once per scheduled slot per day (BALANCE_TIMES), so sync() starts the twice-daily check."""
    t = datetime.datetime.now()
    slot = None
    for hhmm in balance_check_times():
        if at_or_after(t, hhmm):
            slot = hhmm
    if slot is None:
        return False
    today = t.strftime("%F")
    try:
        marker = json.load(open(os.path.join(BALANCE_DIR, "last-check.json")))
    except Exception:
        marker = {}
    if marker.get("date") == today and marker.get("slot") == slot:
        return False
    os.makedirs(BALANCE_DIR, exist_ok=True)
    tmp = os.path.join(BALANCE_DIR, "last-check.json.tmp")
    json.dump({"date": today, "slot": slot}, open(tmp, "w"))
    os.replace(tmp, os.path.join(BALANCE_DIR, "last-check.json"))
    return True


def start_monthend(*extra):
    """Start monthend.py (detached) when its inbox has work or a held month may now go ahead. It locks itself."""
    inbox = os.path.join(MONTHEND_DIR, "inbox")
    busy = os.path.isdir(inbox) and any(f.endswith(".json") for f in os.listdir(inbox))
    if (busy or extra) and os.path.exists(MONTHEND):
        subprocess.Popen(["python3", MONTHEND, "run", *extra], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, start_new_session=True)


# ---------------- Worker calls ----------------
def _token():
    try:
        return open(TOKEN_FILE).read().strip()
    except Exception:
        return ""


def _call(method, path, body=None):
    tok = _token()
    if not tok:
        raise RuntimeError("no watchdog token")
    data = json.dumps(body).encode() if body is not None else None
    h = {"x-watchdog-token": tok, "User-Agent": UA}
    if data is not None:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(WORKER + path, data=data, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def local_version():
    d = _raw()
    return int(d.get("config_version") or 0) if isinstance(d, dict) else 0


def fetch():
    d = _call("GET", "/config")
    if not isinstance(d.get("config"), dict):
        raise RuntimeError("worker sent no config")
    old = config()
    tmp = CFG + ".tmp"
    json.dump({"config_version": d.get("config_version", 0), "is_default": bool(d.get("is_default")),
               "fetched_at": datetime.datetime.now().isoformat(timespec="seconds"), "config": d["config"]}, open(tmp, "w"), indent=1)
    os.replace(tmp, CFG)
    apply(old)
    return d.get("config_version", 0)


def apply(old):
    """Side effects of a new config: the scheduler's sched_config.json, and an upload-bot restart when its settings changed."""
    new = config()
    try:
        sc = json.load(open(SCHED_CONFIG)) if os.path.exists(SCHED_CONFIG) else {}
    except Exception:
        sc = {}
    if new is not None:
        def plus(hhmm, mins):
            h, m = hm(hhmm); t = h * 60 + m + mins; return f"{min(t, 1439) // 60:02d}:{min(t, 1439) % 60:02d}"
        sc.update({"memo": enabled("memo"), "memo_time": plus(get("automations.memo.check_time", "08:45"), 6),
                   "sunday": enabled("sunday_note"), "sunday_time": plus(get("automations.sunday_note.after_time", "09:00"), 1),
                   "statement": enabled("statement"), "statement_time": plus(get("automations.statement.check_time", "07:30"), 24),
                   # records-20260928: the statement goes out N days after the cut-off; the scheduler's AI back-up waits for the same day
                   "statement_offset_days": max(1, int(num("automations.statement.days_after_cutoff", 1))),
                   "statement_catchup_days": max(1, int(num("automations.statement.catchup_days", 7))),
                   "attendance": False, "attendance_from": get("automations.attendance.first_month", "2026-10"),
                   "attendance_hours": [hm(get("automations.attendance.active_from", "08:00"))[0], hm(get("automations.attendance.active_until", "22:00"))[0]]})
    if new is not None or os.path.exists(SCHED_CONFIG):
        # cleanup-20260928: the scheduler never polls attendance any more; it is filed with the month-end run
        # (WEBHOOK-RUN.md §3-ATT / monthend.py), which the app only starts once every week and the Monthly report are in.
        sc["attendance"] = False
        tmp = SCHED_CONFIG + ".tmp"; json.dump(sc, open(tmp, "w"), indent=1); os.replace(tmp, SCHED_CONFIG)
    bot = lambda c: json.dumps([(c or {}).get("people"), (c or {}).get("parishes"), ((c or {}).get("automations") or {}).get("upload_bot")], sort_keys=True)
    rem = lambda c: json.dumps((c or {}).get("remittance"), sort_keys=True)
    if rem(old) != rem(new):
        start_monthend("--resume")  # a month held for a missing Remittance line can go ahead now
    if bot(old) != bot(new):
        # detached: the restart can take minutes (it waits for an upload to finish) and must never hold up the supervisor
        subprocess.Popen(["bash", "/workspace/telegram/srcdoc/ensure_running.sh", "--restart"], stdin=subprocess.DEVNULL,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


def sync(quiet=True):
    try:
        cv = _call("GET", "/config/version")
        try:  # bankbalance-20260929: roughly twice-daily automatic check
            if due_balance_check():
                start_balance_check()
        except Exception as e:
            print(f"{datetime.datetime.now():%F %H:%M} bank balance check: {type(e).__name__}: {e}"[:200])
        v = int(cv.get("config_version") or 0)
        if v != local_version() or not os.path.exists(CFG):
            n = fetch()
            print(f"{datetime.datetime.now():%F %H:%M} config v{n} downloaded")
        elif not quiet:
            print(f"config v{v} is current")
        try:
            events(cv.get("events_last"))
        except Exception as e:
            print(f"{datetime.datetime.now():%F %H:%M} month-end mailbox: {type(e).__name__}: {e}"[:200])
        return True
    except Exception as e:
        f = "/workspace/tools/.cfg-sync-err"  # say it at most once an hour
        try: last = os.path.getmtime(f)
        except OSError: last = 0
        if datetime.datetime.now().timestamp() - last > 3600:
            print(f"{datetime.datetime.now():%F %H:%M} config sync failed: {e}")
            try: open(f, "w").write(str(e))
            except Exception: pass
        return False


# ---------------- status report ----------------
def _alive(pat):
    return subprocess.run(["pgrep", "-f", pat], capture_output=True).returncode == 0


def _lines(p, n=5):
    try:
        return [l.rstrip("\n") for l in open(p, errors="replace").readlines()[-n:] if l.strip()]
    except Exception:
        return []


def _ts(s):
    try:
        return datetime.datetime.fromisoformat(str(s).strip()[:16].replace(" ", "T")).astimezone().isoformat(timespec="seconds")
    except Exception:
        return None


def _next_daily(hhmm, days=None):
    now = datetime.datetime.now().astimezone(); h, m = hm(hhmm)
    for i in range(8):
        d = now + datetime.timedelta(days=i)
        t = d.replace(hour=h, minute=m, second=0, microsecond=0)
        if t > now and (days is None or DAYS[t.weekday()] in days):
            return t.isoformat(timespec="seconds")
    return None


def _runner(key, proc, build):
    try:
        r = build()
    except Exception as e:
        r = {"status": "warn", "last_run": None, "summary": f"status unavailable ({type(e).__name__})", "next_run": None, "activity": []}
    if proc and not _alive(proc):
        r["status"], r["summary"] = "error", "Not running. The box restarts it within 5 minutes."
    return key, r


def health():
    runners, activity = {}, {}

    def memo():
        L = _lines("/workspace/rccg-memos/check-log.txt", 5)
        act = []
        for l in reversed(L):
            p = [x.strip() for x in l.split("|")]
            act.append({"at": _ts(p[0]), "text": " · ".join(x for x in p[1:] if x and x != "-") or l})
        last = act[0] if act else None
        bad = bool(L) and "| fail |" in L[-1]
        return {"status": "error" if bad else "ok", "last_run": last and last["at"], "summary": (last and last["text"]) or "No check yet",
                "next_run": _next_daily(get("automations.memo.check_time", "08:45"), get("automations.memo.days", DAYS[:6])) if enabled("memo") else None,
                "activity": act}

    def statement():
        try:
            sent = json.load(open("/workspace/fin-statement/state/sent.json"))
        except Exception:
            sent = []
        L = _lines("/workspace/fin-statement/runner-log.txt", 5)
        act = [{"at": _ts(l[:16]), "text": l[17:][:160]} for l in reversed(L)]
        last = sent[-1] if sent else None
        bad = bool(L) and any(w in L[-1] for w in ("exception", "failed", "exit 1"))
        return {"status": "warn" if bad else "ok", "last_run": act[0]["at"] if act else None,
                "summary": f"Last sent: {last['period_from']} to {last['period_to']}" if last else "No statement sent yet",
                "next_run": _next_daily(get("automations.statement.check_time", "07:30")) if enabled("statement") else None, "activity": act}

    def attendance():
        # cleanup-20260928: attendance is filed with the month-end run; report what the last runs recorded.
        try:
            runs = json.load(open(REMIT_STATE))
        except Exception:
            runs = {}
        act = []
        for key, e in sorted((runs or {}).items(), key=lambda kv: str((kv[1] or {}).get("month", "")), reverse=True):
            a = (e or {}).get("attendance") if isinstance(e, dict) else None
            if not isinstance(a, dict):
                continue
            act.append({"at": _ts(str(a.get("at") or "")[:16].replace("T", " ")), "text": f"{_month_name(e.get('month'))}: {_att_text(a)}",
                        "exit": a.get("exit")})
        bad = bool(act) and act[0]["exit"] not in (0, 12)
        for x in act:
            x.pop("exit", None)
        return {"status": "warn" if bad else "ok", "last_run": act[0]["at"] if act else None,
                "summary": act[0]["text"] if act else "Filed with the month-end run. Nothing filed yet.", "next_run": None,
                "activity": act[:5]}

    def reminders():
        try:
            d = open("/workspace/tools/.remind-srcdoc").read().strip()
        except Exception:
            d = ""
        return {"status": "ok", "last_run": _ts(d + " " + get("automations.source_doc_reminders.after_time", "10:00")) if d else None,
                "summary": f"Checked for empty upload slots on {d}" if d else "No reminder check yet",
                "next_run": _next_daily(get("automations.source_doc_reminders.after_time", "10:00")) if enabled("source_doc_reminders") else None, "activity": []}

    def upload_bot():
        L = [l for l in _lines("/workspace/telegram/srcdoc/poller.log", 400) if "upload result" in l][-5:]
        act = [{"at": _ts(l[:16]), "text": l[20:][:160]} for l in reversed(L)]
        return {"status": "ok", "last_run": act[0]["at"] if act else None,
                "summary": "Running" + (f"; last upload {act[0]['at'][:10]}" if act else ""), "next_run": None, "activity": act}

    def drive_sync():
        try:
            last = open("/workspace/tools/.last-sync").read().strip()
        except Exception:
            last = ""
        age = None
        if last:
            try: age = (datetime.datetime.now() - datetime.datetime.fromisoformat(last[:16].replace(" ", "T"))).total_seconds() / 60
            except Exception: pass
        st = "ok" if age is not None and age < 30 else "warn" if age is not None and age < 120 else "error"
        summary = f"Last sync {last}" if last else "No sync yet"
        try:  # cleanup-20260928: drive-sync.sh records a pass that ended with an error ("<date> <time> <exit code>")
            bad = open("/workspace/tools/.sync-error").read().split()
            summary = f"Last pass {bad[0]} {bad[1]} ended with an error (code {bad[2]}); last clean sync {last or 'never'}"
            st = "warn" if st == "ok" else st
        except Exception:
            pass
        return {"status": st, "last_run": _ts(last) if last else None, "summary": summary, "next_run": None, "activity": []}

    def month_end():
        L = _lines(os.path.join(MONTHEND_DIR, "log.txt"), 5)
        act = [{"at": _ts(l[:16]), "text": l[17:][:160]} for l in reversed(L)]
        st = _monthend_status()
        bad = st.get("state") in ("failed", "held")
        who = "Clerk box" if remittance_handler() == "box" else "Clerk AI (the box practises)"
        return {"status": "warn" if bad else "ok", "last_run": act[0]["at"] if act else None,
                "summary": st.get("summary") or f"Month-end run by: {who}. Nothing yet.", "next_run": None, "activity": act}

    for key, proc, fn in (("memo", "memo-runner.sh", memo), ("statement", "stmt-runner.py", statement),
                          ("attendance", None, attendance), ("source_doc_reminders", None, reminders),
                          ("upload_bot", "srcdoc/poller.py", upload_bot), ("drive_sync", "drive-sync.sh", drive_sync),
                          ("month_end", None, month_end)):
        k, r = _runner(key, proc, fn)
        activity[k] = r.pop("activity", [])[:5]
        runners[k] = r
    cut = (datetime.datetime.now() - datetime.timedelta(days=7)).strftime("%F")
    errs = 0
    for p, w in (("/workspace/tools/supervisor.log", "restart"), ("/workspace/tools/drive-sync.log", "ERROR")):
        try: errs += sum(1 for l in open(p, errors="replace") if l[:10] >= cut and w in l)
        except Exception: pass
    try:
        hb = json.load(open("/workspace/telegram/srcdoc/heartbeat.json"))
        nxt = (hb.get("last_statement_check") or {}).get("next_due")
    except Exception:
        nxt = None
    st = _monthend_status()
    remittance = {"handler": remittance_handler(), "portal_lines": st.get("portal_lines") or _portal_lines(),
                  "categories": st.get("categories") or {}, "hold": st.get("hold")}
    return {"runners": runners, "activity": activity, "errors_7d": errs, "last_sync": runners["drive_sync"]["last_run"],
            "next_statement": nxt, "config_version": local_version(), "remittance": remittance, **_sat_health()}  # parishes-20261003


REMIT_DIR = os.environ.get("CLERK_REMIT_DIR", "/workspace/rccg-remit")
REMIT_STATE = os.path.join(REMIT_DIR, "state", "remit-runs.json")
PORTAL_ITEMS = os.path.join(REMIT_DIR, "runs")


def _month_name(m):
    try:
        return datetime.date(int(str(m)[:4]), int(str(m)[5:7]), 1).strftime("%B %Y")
    except Exception:
        return str(m or "?")


def _att_text(a):
    """One line for the Attendance card from a month-end run's attendance record (att-fill.js exit code)."""
    x = a.get("exit")
    return {0: "filed on the portal; it matches the app", 12: "already on the portal",
            16: "filed, but the portal differs from the app (see the check email)", 10: "portal not open for this month yet",
            15: "not filed: not everything was in the app", 13: "not filed: the portal refused it",
            17: "not filed yet"}.get(x, f"filing failed (code {x}); the Clerk AI was asked to look at it")


def _portal_lines():
    """Portal line names from the newest saved portal item list (Kingdom Parish), for the app's Remittance lines."""
    try:
        files = sorted(f for f in os.listdir(PORTAL_ITEMS) if re.match(r"^portal-items-\d{4}-\d{2}\.json$", f))
        d = json.load(open(os.path.join(PORTAL_ITEMS, files[-1]))) if files else {}
        items = (d.get("data") or {}).get("paymentItems") or []
        return sorted({str(p.get("paymentItem") or p.get("itemName")).strip() for p in items if p.get("paymentItem") or p.get("itemName")})
    except Exception:
        return []


def _monthend_status():
    try:
        d = json.load(open(os.path.join(MONTHEND_DIR, "status.json")))
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _sat_health():  # parishes-20261003: the satellite parishes' month-end, bot links and the box's public key
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import satinfo
        return satinfo.health()
    except Exception as e:
        return {"satellites_error": f"{type(e).__name__}: {e}"[:160]}


def ping():
    try:
        r = _call("POST", "/ping", {"health": health(), "config_version": local_version()})
    except urllib.error.HTTPError as e:
        print(f"{datetime.datetime.now():%F %H:%M} ping failed: HTTP {e.code}"); return False
    except Exception as e:
        print(f"{datetime.datetime.now():%F %H:%M} ping failed: {e}"); return False
    if r.get("config_update"):
        sync()
    return True


# ---------------- CLI ----------------
def _cli(a):
    cmd = a[0] if a else ""
    if cmd == "sync": sys.exit(0 if sync(quiet="-v" not in a) else 1)
    if cmd == "ping": sys.exit(0 if ping() else 1)
    if cmd == "health": print(json.dumps(health(), indent=1)); return
    if cmd == "apply":
        apply(config()); print("applied"); return
    if cmd == "events":
        print(events(_call("GET", "/config/version").get("events_last")), "new"); return
    if cmd == "show": print(json.dumps(config(), indent=1) if config() else "none (the box uses its built-in values)"); return
    if cmd == "get":
        v = get(a[1], a[2] if len(a) > 2 else "")
        print(json.dumps(v) if isinstance(v, (list, dict)) else v); return
    if cmd == "int":
        v = num(a[1], None)
        d = int(a[2]); lo = int(a[3]) if len(a) > 3 else 0
        print(max(lo, int(v)) if v is not None else d); return
    if cmd == "flag":
        v = get(a[1], (a[2] if len(a) > 2 else "true") == "true")
        sys.exit(0 if v is True or v == "true" else 3)  # 3 = false; a crash (1) must never read as "off"
    if cmd == "due" and a[1:2] == ["memo"]:
        t = datetime.datetime.now()
        ok = enabled("memo") and DAYS[t.weekday()] in get("automations.memo.days", DAYS[:6]) and at_or_after(t, get("automations.memo.check_time", "08:45"))
        sys.exit(0 if ok else 3)
    print(__doc__); sys.exit(2)


if __name__ == "__main__":
    _cli(sys.argv[1:])
# bankbalance-20260929
# bankbalance-fastcheck-20261001
# parishes-20261003
# bankbalance-reconcile-20261001
# botmenu-20261003
