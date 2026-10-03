"""Synthetic stand-in for the box's tools/clerkinfo.py (box-botmenu test): the anchor line and the helpers the
new slots_lines() / att_lines() use. The portal is faked."""
import datetime, json, os, re
ATT = "/nonexistent/rccg-attendance"
MON = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()


def _load(p, d):
    try: return json.load(open(p))
    except Exception: return d


def srcdoc_slots(parishes):
    return [("Admin", "Sep", "2026", p, "EMPTY" if p != "602757" else "uploaded", "2026-10-10") for p in parishes]


def _months():
    return []


def _nice(d):
    try: x = datetime.date.fromisoformat(d); return f"{x.day} {MON[x.month-1]}"
    except Exception: return d


def att_plan(m):
    return None


def dates_in_window(w): return []


def att_lines():
    return []


def memo_line():
    return "Last memo check: none recorded"
