#!/usr/bin/env python3
"""Month status from the parish app, read-only (reminders-20260929; Sunday records reminders records-20260928). Used by:

  reminders.py   the Sunday records reminders: Bro. Divine's weekly message, a 2nd reminder, the cut-off Sunday evening
                 and every day after the cut-off (for the days set) - one list per Sunday saying what is still needed
                 (a collection can only be saved once that week's attendance is in; the last one also needs the Monthly
                 report and every earlier collection), each sent once, only while something is missing
  poller.py      the Telegram bot's /month command (and /status's attendance line, via clerkinfo.py)

  python3 monthinfo.py month [YYYY-MM]    print the /month text for the current (or that) remittance month
  python3 monthinfo.py ladder --dry-run   print which collection reminders would go out now

Reads the app with its read-only automation key (GET only): /api/settings (cut-off dates), /api/income (which Sundays
have a collection saved), /api/attendance and /api/attendance-further (attendance weeks, Monthly report), plus the
month-end record in /workspace/rccg-remit/state/remit-runs.json. Never writes to the app or the portal.
"""
import datetime, html, json, os, sys, urllib.request

APP = os.environ.get("KP_APP_URL", "https://rccg-kingdom-parish-app.pages.dev").rstrip("/")
KEY_FILE = "/workspace/.secrets/kp-automation-key"
REMIT_STATE = os.environ.get("CLERK_REMIT_STATE", "/workspace/rccg-remit/state/remit-runs.json")
MONTHCLOSE_STATE = os.environ.get("CLERK_MONTHCLOSE_STATE", "/workspace/state/monthclose.json")
SUNDAY_SOURCES = ("sunday_collection", None, "")
MON = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


# ---------------------------------------------------------------- reading the app
def _key():
    k = os.environ.get("KP_AUTOMATION_KEY", "").strip()
    if not k:
        try:
            k = open(KEY_FILE).read().strip()
        except Exception:
            k = ""
    return k


def app_get(path):
    h = {"User-Agent": "kp-box-monthinfo/1", "Accept": "application/json"}
    k = _key()
    if k:
        h["X-Automation-Key"] = k
    req = urllib.request.Request(f"{APP}/api/{path}", headers=h)
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)


def _d(s):
    return datetime.date.fromisoformat(str(s)[:10])


def nice(d):
    d = _d(d) if not isinstance(d, datetime.date) else d
    return f"{d.day} {MON[d.month - 1]}"


def month_label(ym):
    y, m = map(int, ym.split("-"))
    return datetime.date(y, m, 1).strftime("%B %Y")


# ---------------------------------------------------------------- the remittance period (same rule as the app)
def cutoff_day(settings, year, month):
    """Cut-off day number for year/month (1-12) from remCutoffDatesByYear (or the legacy remCutoffDates), or None."""
    by = (settings or {}).get("remCutoffDatesByYear")
    days = by.get(str(year)) if isinstance(by, dict) else None
    if not (isinstance(days, list) and len(days) == 12):
        leg = (settings or {}).get("remCutoffDates")
        days = leg.get("dates") if isinstance(leg, dict) and str(leg.get("year")) == str(year) else None
    try:
        d = int(days[month - 1]) if days else None
        return d if d and d > 0 else None
    except Exception:
        return None


def period_for_month(settings, ym):
    """(start, end) of the remittance period whose cut-off is in month ym, or None when no cut-off is set."""
    y, m = map(int, ym.split("-"))
    c = cutoff_day(settings, y, m)
    if not c:
        return None
    end = datetime.date(y, m, c)
    py, pm = (y - 1, 12) if m == 1 else (y, m - 1)
    pc = cutoff_day(settings, py, pm)
    start = datetime.date(py, pm, pc) + datetime.timedelta(days=1) if pc else datetime.date(y, m, 1)
    return start, end


def period_for_day(settings, day):
    """The period that contains `day` (its month's, or the next month's once past this month's cut-off)."""
    p = period_for_month(settings, f"{day:%Y-%m}")
    if p and day <= p[1]:
        return p
    nxt = (day.replace(day=1) + datetime.timedelta(days=32)).replace(day=1)
    return period_for_month(settings, f"{nxt:%Y-%m}")


def sundays(start, end):
    d = start + datetime.timedelta(days=(6 - start.weekday()) % 7)
    out = []
    while d <= end:
        out.append(d)
        d += datetime.timedelta(days=7)
    return out


def facts(month=None, today=None, prefer_open=False):
    """Everything /month and the reminders need, or {'error': ...}. prefer_open (/month with no month given): for up to
    14 days after a cut-off, show that period until its RRR is generated rather than the new, still empty one."""
    today = today or datetime.date.today()
    try:
        settings = app_get("settings")
    except Exception as e:
        return {"error": f"couldn't read the app ({type(e).__name__})"}
    p = period_for_month(settings, month) if month else period_for_day(settings, today)
    if not p:
        return {"error": "no cut-off date is set in the app for that month"}
    try:
        runs = json.load(open(REMIT_STATE))
    except Exception:
        runs = {}
    if prefer_open and not month:
        # keep showing the period that just ended while its month-end is still going (or about to start); a period
        # with no month-end record 2+ days after its cut-off was done outside the automation, so move on
        prev = period_for_month(settings, f"{p[0] - datetime.timedelta(days=1):%Y-%m}")
        pe = ((runs or {}).get(f"{prev[0]}..{prev[1]}") or {}) if prev else {}
        if prev and prev[1] < today and (today - prev[1]).days <= 14 and \
                ((pe and pe.get("status") != "done") or (not pe and (today - prev[1]).days <= 1)):
            p = prev
    start, end = p
    try:
        income = app_get("income") or []
        weeks = app_get(f"attendance?from={start}&to={end}") or []
        further = (app_get(f"attendance-further?end={end}") or {}).get("current") or {}
    except Exception as e:
        return {"error": f"couldn't read the app ({type(e).__name__})"}
    have = {str(r.get("date"))[:10] for r in income if isinstance(r, dict) and r.get("source") in SUNDAY_SOURCES}
    att = {str(w.get("weekEnd"))[:10]: w.get("status") or "draft" for w in weeks if isinstance(w, dict)}
    entry = (runs or {}).get(f"{start}..{end}") or {}
    return {"month": f"{end:%Y-%m}", "start": start, "end": end, "today": today,
            "sundays": [{"date": s, "collection": s.isoformat() in have, "attendance": att.get(s.isoformat())} for s in sundays(start, end)],
            "report": bool(further.get("furtherSubmittedAt")), "entry": entry if isinstance(entry, dict) else {}}


def missing_collections(f, before=None):
    """Sundays of the period, earlier than `before` (default today), with no collection saved."""
    before = before or f["today"]
    return [s["date"] for s in f.get("sundays", []) if s["date"] < before and not s["collection"]]


# ---------------------------------------------------------------- /month text
def month_end_line(f):
    e, end, today = f["entry"], f["end"], f["today"]
    st = e.get("status")
    cut = next((s for s in f["sundays"] if s["date"] == end), None)
    if not st:
        if cut and cut["collection"]:
            if (today - end).days <= 1:
                return "starting (the cut-off collection was just saved)"
            return "no automatic run recorded for this month (it was done outside the automation)"
        miss = missing_collections(f, before=end + datetime.timedelta(days=1)) if today > end else missing_collections(f)
        if today > end:
            return f"⚠️ not started: waiting for {', '.join(nice(d) for d in miss) or nice(end)}"
        return f"starts when the {nice(end)} collection is saved"
    rrr = (e.get("rrr") or {}).get("code")
    try:  # monthclose-20260930: payment confirmed on Remita (who tapped "I've paid")
        pay = (json.load(open(MONTHCLOSE_STATE)).get(f["month"]) or {}).get("paid")
    except Exception:
        pay = None
    paid = (" · paid ✅" + (f" ({str(pay['by']).title()})" if pay.get("by") else "")) if pay else " · payment not confirmed yet"
    return {
        "filling": "in progress (filing on the portal)", "saved": "in progress", "submitted": "filed on the portal; sending the check",
        "awaiting-reply": f"filed ✅ · check email sent {nice(str(e.get('lastCheckSentAt') or '')[:10]) if e.get('lastCheckSentAt') else ''} · waiting for Generate RRR",
        "refreshing": "refreshing the check (a Refresh button was pressed)", "generating": "generating the RRR",
        "done": (f"RRR {rrr} generated ✅" if rrr else "done ✅") + paid,
        "failed": f"⛔ stopped at {(e.get('failure') or {}).get('step', '?')}: {(e.get('failure') or {}).get('message', '')}",
        "held": "⏸ on hold: " + ", ".join(c.get("label", c.get("key", "?")) for c in (e.get("hold") or {}).get("categories", [])) + " has no portal line (Automations → Remittance lines)",
    }.get(st, st)


def attendance_line(f):
    a = f["entry"].get("attendance")
    if not isinstance(a, dict):
        return "filed with the month-end run" if f["today"] <= f["end"] or not f["entry"] and (f["today"] - f["end"]).days <= 1 \
            else ("no record on the box" if not f["entry"] else "filed with the month-end run")
    return {0: "filed on the portal ✅", 12: "already on the portal ✅", 16: "filed, but the portal differs (see the check email)",
            10: "portal not open yet", 15: "not filed: something was missing in the app", 17: "not filed yet"}.get(a.get("exit"), f"problem (code {a.get('exit')})")


def next_step(f):
    today, end = f["today"], f["end"]
    miss = missing_collections(f)
    att_missing = [s["date"] for s in f["sundays"] if s["date"] < today and s["attendance"] not in ("submitted", "locked")]
    st = f["entry"].get("status")
    if st == "awaiting-reply":
        return "David or Bro. Divine: check the email and press Generate RRR (or Refresh)."
    if st in ("done",):
        return "Nothing. The RRR is ready to pay."
    if st == "held":
        return "David: choose the missing portal line in Automations → Settings → Remittance lines, then Save."
    if st == "failed":
        return "David: see the message about the stopped run."
    if st:
        return "Nothing; the box is working on it."
    cut = next((s for s in f["sundays"] if s["date"] == end), None)
    if today > end and cut and cut["collection"]:
        return "Nothing: the box is starting the month-end." if (today - end).days <= 1 else "Nothing for this month."
    if miss:
        return "Bro. Divine: record the collection for " + ", ".join(nice(d) for d in miss) + "."
    if att_missing:
        return "Bro. Divine: submit the attendance for " + ", ".join(nice(d) for d in att_missing) + "."
    if today < end:
        return f"Nothing yet. The cut-off Sunday is {end:%a} {nice(end)}."
    return f"Bro. Divine: submit the Monthly report and save the {nice(end)} collection." if not f["report"] else f"Bro. Divine: save the {nice(end)} collection."


def month_text(f):
    if f.get("error"):
        return f"📅 Couldn't get the month's status: {html.escape(f['error'])}."
    today = f["today"]
    rows = []
    for s in f["sundays"]:
        future = s["date"] > today
        c = "–" if future and not s["collection"] else ("✅" if s["collection"] else "❌")
        a = "–" if future and not s["attendance"] else ("✅" if s["attendance"] in ("submitted", "locked") else "❌")
        rows.append(f"{nice(s['date']):<8} {c:^10} {a:^10}")
    return ("📅 <b>" + html.escape(month_label(f["month"])) + " remittance</b>\n"
            f"Period: {nice(f['start'])} – {nice(f['end'])} (cut-off {f['end']:%a} {nice(f['end'])})\n\n"
            "<pre>Sunday   Collection Attendance\n" + html.escape("\n".join(rows)) + "</pre>\n"
            f"Monthly report: {'✅ submitted' if f['report'] else 'not yet'}\n\n"
            f"<b>Month-end:</b> {html.escape(month_end_line(f))}\n"
            f"<b>Attendance filing:</b> {html.escape(attendance_line(f))}\n"
            f"<b>Next:</b> {html.escape(next_step(f))}")


CACHE = os.environ.get("MONTHINFO_CACHE", "/workspace/tools/.monthinfo-cache.json")


def cached_facts(today, month=None, max_age_min=30):
    """facts() at most every 30 minutes per month (the reminders run every 5); a saved collection shows up within that time."""
    ck = f"{today.isoformat()}|{month or ''}"
    now = datetime.datetime.now().timestamp()
    try:
        c = json.load(open(CACHE))
        c = c if isinstance(c, dict) and isinstance(c.get("entries"), dict) else {"entries": {}}
    except Exception:
        c = {"entries": {}}
    e = c["entries"].get(ck)
    if e and now - e["at"] < max_age_min * 60:
        try:
            f = e["facts"]
            for k in ("start", "end", "today"):
                f[k] = _d(f[k])
            for s in f["sundays"]:
                s["date"] = _d(s["date"])
            return f
        except Exception:
            pass
    f = facts(month=month, today=today)
    if not f.get("error"):
        c["entries"] = {k: v for k, v in c["entries"].items() if k.startswith(today.isoformat())}
        c["entries"][ck] = {"at": now, "facts": f}
        try:
            json.dump(c, open(CACHE, "w"), default=str)
        except Exception:
            pass
    return f


def att_filed(month):
    """/status's attendance line for a month filed by a month-end run (att-watch.py is gone), or None."""
    try:
        runs = json.load(open(REMIT_STATE))
    except Exception:
        return None
    for e in (runs or {}).values():
        a = (e or {}).get("attendance") if isinstance(e, dict) else None
        if isinstance(e, dict) and e.get("month") == month and isinstance(a, dict):
            return {0: "filed on the portal", 12: "filed on the portal", 16: "filed on the portal, but it differs from the app (see the check email)"}.get(a.get("exit"))
    return None


# ---------------------------------------------------------------- Sunday records reminders (records-20260928)
LADDER_STATE = os.environ.get("MONTHINFO_LADDER_STATE", "/workspace/tools/.monthinfo-ladder.json")


def _card(title, sub, lines, foot):
    try:
        sys.path.insert(0, "/workspace/tools")
        from common import card
        return card("wait", title, sub, lines, foot=foot)
    except Exception:
        return (f"⏳ <b>{html.escape(title)}</b>\n{html.escape(sub)}\n\n" + "\n".join(html.escape(x) for x in lines)
                + f"\n\n{html.escape(foot)}")


def records_lines(f, upto, today):
    """What is still needed, one line per Sunday up to `upto` (collection first: it needs that week's attendance), plus the
    Monthly report from the cut-off week on (the last collection can't be saved without it). [] when everything is in."""
    lines = []
    for s in f.get("sundays", []):
        if s["date"] > upto or s["collection"]:
            continue
        ok = s["attendance"] in ("submitted", "locked")
        lines.append(f"• Sun {nice(s['date'])}: " + ("collection (attendance ✅)" if ok else "attendance, then collection"))
    end = f["end"]
    if not f.get("report") and today >= end - datetime.timedelta(days=6):
        lines.append(f"• Monthly report: not submitted (needed before the {nice(end)} collection)")
    return lines


def records_msg(f, kind, today):
    """The reminder text, or None when nothing is missing. kind: weekly | second | cutoff | after."""
    end = f["end"]
    upto = end if kind == "after" else (today if kind == "cutoff" else today - datetime.timedelta(days=1))
    lines = records_lines(f, upto, today)
    if not lines:
        return None
    ml = month_label(f["month"])
    sub = f"Kingdom Parish · {ml} (cut-off Sun {nice(end)})"
    if kind == "cutoff":
        title = f"Today ({nice(end)}) is the last Sunday of the {ml} remittance"
    elif kind == "after":
        n = (today - end).days
        title, sub = f"{ml} remittance is waiting", f"Kingdom Parish · cut-off was Sun {nice(end)} ({n} day{'s' if n != 1 else ''} ago)"
    else:
        title = "Sunday records not complete" + (" (2nd reminder)" if kind == "second" else "")
    text = _card(title, sub, lines, f"The month-end filing starts by itself once the {nice(end)} collection is saved.")
    return f"Good morning Bro. Divine,\n\n{text}\n\nGod bless." if kind in ("weekly", "second") else text


def _last_saved(f):
    cut = next((s for s in f["sundays"] if s["date"] == f["end"]), None)
    return bool(cut and cut["collection"])


def ended_period(today, f, days):
    """The period whose cut-off was 1..days days ago, while its last collection isn't saved and its month-end hasn't
    started; else None. `f` is today's period."""
    prev_end = f["start"] - datetime.timedelta(days=1)
    if not (0 < (today - prev_end).days <= days):
        return None
    g = cached_facts(today, month=f"{prev_end:%Y-%m}")
    if g.get("error") or g["end"] != prev_end or g["entry"] or _last_saved(g):
        return None
    return g


def monday_msg(att_text, f):
    """Bro. Divine's weekly message (reminders.py): the Sunday records still missing, or None when everything is in.
    att_text (the old attendance-only reminder) is used only when the app can't be read."""
    if not f or f.get("error"):
        return att_text
    today = f["today"]
    g = ended_period(today, f, 7)  # the week after a cut-off: the period that just ended, if it is still waiting
    if g:
        try:  # the daily follow-up (ladder) already sends this to Bro. Divine and you: don't send it twice
            sys.path.insert(0, "/workspace/tools")
            import clerkcfg as C
            if C.get("automations.collection_reminders.enabled", True) and int(C.num("automations.collection_reminders.after_days", 5)) >= 1:
                return None
        except Exception:
            return None
    return records_msg(g or f, "after" if g else "weekly", today)


def _hm(s, default):
    try:
        h, m = str(s).split(":")
        return int(h), int(m)
    except Exception:
        return default


def _slot_done(slot, today, mark=False):
    try:
        st = json.load(open(LADDER_STATE))
    except Exception:
        st = {}
    if mark:
        st[slot] = today.isoformat()
        try:
            json.dump(st, open(LADDER_STATE, "w"))
        except Exception:
            pass
    return st.get(slot) == today.isoformat()


def ladder(now, send, once, cfg, f=None, dry=False):
    """The follow-up reminders due now. send(who_default, text, mtype); once(flag, key) -> True the first time.
    cfg = clerkcfg (for settings and who gets what). Returns the list of reminders sent. The app is read at most once per
    slot a day (from the reminder time; the cut-off Sunday evening), so the box doesn't poll the app all day."""
    if not cfg.get("automations.collection_reminders.enabled", True):
        return []
    today, hm = now.date(), (now.hour, now.minute)
    t = _hm(cfg.get("automations.collection_reminders.time", "10:00"), (10, 0))
    day2 = cfg.get("automations.collection_reminders.second_day", "thu")
    wd2 = DAYS.index(day2) if day2 in DAYS else 3
    evening = _hm(cfg.get("automations.collection_reminders.cutoff_evening", "20:00"), (20, 0))
    try:
        after_days = max(0, int(cfg.num("automations.collection_reminders.after_days", 5)))
    except Exception:
        after_days = 5
    eve = today.weekday() == 6 and hm >= evening
    if not (eve or hm >= t):
        return []
    slot = "evening" if eve else "day"
    if not dry and f is None and _slot_done(slot, today):
        return []
    f = f or cached_facts(today)
    if f.get("error"):
        return []
    sent = []

    def go(flag, key, who, text):
        if text and (dry or once(flag, key)):
            if not dry:
                send(who, text, "collection_reminder")
            sent.append((flag, who, text))

    if eve:
        # the cut-off Sunday evening: the last collection of the period isn't saved yet
        if today == f["end"] and not _last_saved(f) and not f["entry"]:
            go("collcut", today.isoformat(), cfg.who("collection_reminder", "divine,david"), records_msg(f, "cutoff", today))
    else:
        # every day after the cut-off (for after_days days) while the period that ended is still waiting
        g = ended_period(today, f, after_days) if after_days else None
        if g:
            go("collafter", today.isoformat(), cfg.who("collection_reminder", "divine,david"), records_msg(g, "after", today))
        # Monday, only when the weekly message (reminders.py) is switched off
        if not g and today.weekday() == 0 and not cfg.get("automations.weekly_attendance_reminder.enabled", True):
            go("coll1", today.isoformat(), cfg.who("collection_reminder", "divine", exclude=("david",)), records_msg(f, "weekly", today))
        # the 2nd reminder
        if not g and today.weekday() == wd2:
            go("coll2", today.isoformat(), cfg.who("collection_reminder", "divine", exclude=("david",)), records_msg(f, "second", today))
    if not dry and send is not None:
        _slot_done(slot, today, mark=True)
    return sent


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["month"]:
        print(month_text(facts(month=a[1] if len(a) > 1 else None, prefer_open=True)))
    elif a[:1] == ["ladder"]:
        sys.path.insert(0, "/workspace/tools")
        import clerkcfg as C
        for flag, who, text in ladder(datetime.datetime.now(), None, None, C, dry=True):
            print(f"== {flag} -> {who}\n{text}\n")
        print("(dry run: nothing was sent)")
    else:
        print(__doc__)
        sys.exit(2)
# reminders-20260929
# monthclose-20260930
# records-20260928
