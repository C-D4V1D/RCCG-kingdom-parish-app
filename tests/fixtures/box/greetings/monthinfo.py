#!/usr/bin/env python3
"""Synthetic stand-in for the box's monthinfo.py (after botmenu-20261003): only the Sunday-records reminder code the greetings
change touches. The function bodies are the real ones; the app reading is replaced by a stub."""
import datetime, html, json, os, sys

LADDER_STATE = os.environ.get("MONTHINFO_LADDER_STATE", "/tmp/monthinfo-ladder.json")


APP = "https://app.invalid"
CACHE = "/tmp/monthinfo-cache.json"
REMIT_STATE = "/tmp/remit-runs.json"
MONTHCLOSE_STATE = "/tmp/monthclose.json"
AUDIENCE = "kingdom"
PARISH_NAME = None


def _key():
    return ""


def app_get(path):
    raise OSError("no app in the fixture")


def _join(names):
    names = [n for n in dict.fromkeys(names) if n]
    return ", ".join(names)


def who_for(role):
    return "someone"


def next_step(f):
    return "Nothing."


def cached_facts(today, month=None, max_age_min=30):
    return {"error": "no app in the fixture"}


MON = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()


DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _d(s):
    return datetime.date.fromisoformat(str(s)[:10])


def nice(d):
    d = _d(d) if not isinstance(d, datetime.date) else d
    return f"{d.day} {MON[d.month - 1]}"


def month_label(ym):
    y, m = map(int, ym.split("-"))
    return datetime.date(y, m, 1).strftime("%B %Y")


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
    """the weekly message (reminders.py): the Sunday records still missing, or None when everything is in.
    att_text (the old attendance-only reminder) is used only when the app can't be read."""
    if not f or f.get("error"):
        return att_text
    today = f["today"]
    g = ended_period(today, f, 7)  # the week after a cut-off: the period that just ended, if it is still waiting
    if g:
        try:  # the daily follow-up (ladder) already sends this to the accountant and the admin: don't send it twice
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
            go("collcut", today.isoformat(), cfg.who("collection_reminder", "pa,pb"), records_msg(f, "cutoff", today))
    else:
        # every day after the cut-off (for after_days days) while the period that ended is still waiting
        g = ended_period(today, f, after_days) if after_days else None
        if g:
            go("collafter", today.isoformat(), cfg.who("collection_reminder", "pa,pb"), records_msg(g, "after", today))
        # Monday, only when the weekly message (reminders.py) is switched off
        if not g and today.weekday() == 0 and not cfg.get("automations.weekly_attendance_reminder.enabled", True):
            go("coll1", today.isoformat(), cfg.who("collection_reminder", "pa", exclude=("pb",)), records_msg(f, "weekly", today))
        # the 2nd reminder
        if not g and today.weekday() == wd2:
            go("coll2", today.isoformat(), cfg.who("collection_reminder", "pa", exclude=("pb",)), records_msg(f, "second", today))
    if not dry and send is not None:
        _slot_done(slot, today, mark=True)
    return sent


def facts(month=None, today=None, prefer_open=False):
    return {"error": "no app in the fixture"}

