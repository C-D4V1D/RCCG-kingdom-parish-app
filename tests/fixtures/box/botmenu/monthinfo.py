"""Synthetic stand-in for the box's tools/monthinfo.py (box-botmenu test): the anchor lines of facts() and the
helpers the new month screen uses. facts() here takes its data as arguments instead of reading the app."""
import datetime, html, json, os, sys

REMIT_STATE = os.environ.get("CLERK_REMIT_STATE", "/nonexistent/remit-runs.json")
MONTHCLOSE_STATE = os.environ.get("CLERK_MONTHCLOSE_STATE", "/nonexistent/monthclose.json")
SUNDAY_SOURCES = ("sunday_collection", None, "")
MON = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()


def _d(s):
    return datetime.date.fromisoformat(str(s)[:10])


def nice(d):
    d = _d(d) if not isinstance(d, datetime.date) else d
    return f"{d.day} {MON[d.month - 1]}"


def month_label(ym):
    y, m = map(int, ym.split("-"))
    return datetime.date(y, m, 1).strftime("%B %Y")


def sundays(start, end):
    d = start + datetime.timedelta(days=(6 - start.weekday()) % 7)
    out = []
    while d <= end:
        out.append(d)
        d += datetime.timedelta(days=7)
    return out


def facts(income, start, end, today, entry=None, report=False):
    further = {"furtherSubmittedAt": "x"} if report else {}
    have = {str(r.get("date"))[:10] for r in income if isinstance(r, dict) and r.get("source") in SUNDAY_SOURCES}
    return {"month": f"{end:%Y-%m}", "start": start, "end": end, "today": today,
            "sundays": [{"date": s, "collection": s.isoformat() in have, "attendance": "submitted"} for s in sundays(start, end)],
            "report": bool(further.get("furtherSubmittedAt")), "entry": entry if isinstance(entry, dict) else {}}


def missing_collections(f, before=None):
    before = before or f["today"]
    return [s["date"] for s in f.get("sundays", []) if s["date"] < before and not s["collection"]]


def collection_total(f):
    return None


def month_text(f):
    return "old screen"


CACHE = os.environ.get("MONTHINFO_CACHE", "/workspace/tools/.monthinfo-cache.json")
