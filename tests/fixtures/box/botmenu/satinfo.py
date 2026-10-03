"""Synthetic stand-in for the box's tools/satinfo.py (box-botmenu test): only the anchor lines (compiled, not run)."""
import html
import monthinfo as MI  # noqa: E402

_ORIG = {k: getattr(MI, k) for k in ("app_get", "CACHE", "LADDER_STATE", "REMIT_STATE", "MONTHCLOSE_STATE", "records_msg", "next_step")}


def called(key):
    return key


def use(P):
    def records_msg(f, kind, today):
        return None

    def next_step(f):
        return ""
    MI.records_msg, MI.next_step = records_msg, next_step


def month_text(P, month=None):
    use(P)
    try:
        return f"<b>{html.escape(P.name)}</b>\n" + MI.month_text(MI.facts(month=month, prefer_open=True))
    finally:
        use(None)
