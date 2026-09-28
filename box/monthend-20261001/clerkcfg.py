#!/usr/bin/env python3
"""Clerk box settings from the church app's Automations tab (installed 2026-09-28; month-end mailbox 2026-10-01).

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
             "sunday": "sunday_note", "nowake": "scheduler_fallback", "memohold": "memo_error"}
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
def people():
    c = config()
    return [p for p in (c or {}).get("people", []) if isinstance(p, dict) and p.get("key")]


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
    keys = {p["key"] for p in people()}
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
    for p in people():
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


def filter_emails(mtype, to, cc):
    """Apply email routing. Addresses of people in the app follow their switch; other addresses are kept;
    people switched on but missing are added to `to`. Returns (to, cc) or None when routing doesn't apply."""
    r = _routing(mtype)
    if r is None:
        return None
    byaddr = {str(p.get("email") or "").strip().lower(): p["key"] for p in people() if p.get("email")}
    on = lambda k: bool((r.get(k) or {}).get("email"))
    keep = lambda lst: [a for a in lst if a.strip().lower() not in byaddr or on(byaddr[a.strip().lower()])]
    to2, cc2 = keep(to), keep(cc)
    have = {a.strip().lower() for a in to2 + cc2}
    for p in people():
        e = str(p.get("email") or "").strip()
        if e and on(p["key"]) and e.lower() not in have:
            to2.append(e); have.add(e.lower())
    return to2, cc2


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
    ps = [p for p in people() if p.get("can_upload") and re.fullmatch(r"-?\d+", str(p.get("telegram_chat_id") or ""))]
    if config() is None or not ps:
        return default
    return {int(p["telegram_chat_id"]): (str(p.get("name") or p["key"]).split() or [p["key"]])[0] for p in ps}


def bot_admin(default):
    for p in people():
        if p.get("full_status") and re.fullmatch(r"-?\d+", str(p.get("telegram_chat_id") or "")):
            return int(p["telegram_chat_id"])
    return default


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
                   "attendance": enabled("attendance"), "attendance_from": get("automations.attendance.first_month", "2026-10"),
                   "attendance_hours": [hm(get("automations.attendance.active_from", "08:00"))[0], hm(get("automations.attendance.active_until", "22:00"))[0]]})
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
        L = _lines("/workspace/rccg-attendance/runner-log.txt", 5)
        act = [{"at": _ts(l[:16]), "text": l[17:][:160]} for l in reversed(L)]
        bad = bool(L) and any(w in L[-1] for w in ("exception", "failed"))
        return {"status": "warn" if bad else "ok", "last_run": act[0]["at"] if act else None,
                "summary": act[0]["text"] if act else "Nothing to check yet", "next_run": None, "activity": act}

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
        return {"status": st, "last_run": _ts(last) if last else None, "summary": f"Last sync {last}" if last else "No sync yet",
                "next_run": None, "activity": []}

    def month_end():
        L = _lines(os.path.join(MONTHEND_DIR, "log.txt"), 5)
        act = [{"at": _ts(l[:16]), "text": l[17:][:160]} for l in reversed(L)]
        st = _monthend_status()
        bad = st.get("state") in ("failed", "held")
        who = "Clerk box" if remittance_handler() == "box" else "Clerk AI (the box practises)"
        return {"status": "warn" if bad else "ok", "last_run": act[0]["at"] if act else None,
                "summary": st.get("summary") or f"Month-end run by: {who}. Nothing yet.", "next_run": None, "activity": act}

    for key, proc, fn in (("memo", "memo-runner.sh", memo), ("statement", "stmt-runner.py", statement),
                          ("attendance", "att-watch.py", attendance), ("source_doc_reminders", None, reminders),
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
    remittance = {"handler": remittance_handler(), "portal_lines": st.get("portal_lines") or [],
                  "categories": st.get("categories") or {}, "hold": st.get("hold")}
    return {"runners": runners, "activity": activity, "errors_7d": errs, "last_sync": runners["drive_sync"]["last_run"],
            "next_statement": nxt, "config_version": local_version(), "remittance": remittance}


def _monthend_status():
    try:
        d = json.load(open(os.path.join(MONTHEND_DIR, "status.json")))
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


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
