#!/workspace/venv-scribe/bin/python
import datetime as dt
def cfg():
    return {}
def statement_analysis(s, today, catchup):
    ps = all_periods(s, (today.year - 1, today.year, today.year + 1))
    due = [p for p in ps if p["cutoff"] + dt.timedelta(days=1) <= today <= p["cutoff"] + dt.timedelta(days=catchup)]
    nxt = min((p for p in ps if p["cutoff"] + dt.timedelta(days=1) > today), key=lambda p: p["cutoff"], default=None)
    return due, nxt
def all_periods(s, years):
    return s
# tgstyle-2026092
