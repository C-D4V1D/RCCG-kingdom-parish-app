#!/usr/bin/env python3
"""Synthetic stand-in for the box's reminders.py (a trimmed copy: the sending function and the two Kingdom messages that
carried a greeting; the rest of the file is not touched by the greetings change)."""
import datetime, os, subprocess, sys
import clerkinfo as ci
from common import card, MON3, BUL
import clerkcfg as C
try:
    import monthinfo as MI
except Exception:
    MI = None
T = os.environ.get("CLERK_REMIND_DIR", "/tmp"); TG = os.environ.get("CLERK_TG", "/workspace/telegram/send_msg.py")


def tg(who, text, mtype=None):
    if who: subprocess.run(["python3", TG, who, text], capture_output=True, timeout=120, env=dict(os.environ, CLERK_MSG_TYPE=mtype) if mtype else None)


def once(flag, key):
    f = f"{T}/.remind-{flag}"
    if os.path.exists(f) and open(f).read().strip() == key: return False
    open(f, "w").write(key); return True


def closes(due):
    left = f"{due[0][0]} day" + ("" if due[0][0] == 1 else "s")
    try: d = datetime.date.fromisoformat(due[0][1]); return f"Portal closes {d:%a} {d.day} {MON3[d.month - 1]} ({left} left)"
    except Exception: return f"Portal closes {due[0][1]} ({left} left)"


def divine_srcdoc_msg(due):
    k = [d for d in due if d[2] == "602757"]
    if not k: return None
    return ("Good morning Bro. Divine,\n\n" + card("wait", "Kingdom Parish source documents", closes(k),
            ["Still empty on the portal:"] + [f"{BUL}{s}" for _, _, _, s in k],
            foot="Send the page(s) to the bot and choose Admin, Finance or Both.") + "\n\nGod bless.")


def divine_att_msg():
    lines = []
    for m in ci._months():
        past, report = ci.att_missing_past(m)
        if past: lines.append(BUL + ", ".join(ci._nice(x) for x in past) + (", plus the Monthly report" if report else ""))
    if not lines: return None
    return ("Good morning Bro. Divine,\n\n" + card("wait", "Attendance not yet in the app", "Kingdom Parish",
            ["Sundays not yet submitted in the parish app:"] + lines,
            foot="Once all weeks and the Monthly report are in, it is filed on the portal automatically.") + "\n\nGod bless.")
