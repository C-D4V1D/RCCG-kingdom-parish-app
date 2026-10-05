#!/usr/bin/env python3
import datetime, os, subprocess, sys
sys.path.insert(0, "/workspace/tools"); import clerkinfo as ci
from common import card, MON3, BUL
import clerkcfg as C  # automations-20260928
try:  # reminders-20260929: Sunday collection reminders (monthinfo.py)
    import monthinfo as MI
except Exception:
    MI = None
T = "/workspace/tools"; TG = "/workspace/telegram/send_msg.py"
PARISHES = C.parishes("source_docs", {"602757": "Kingdom Parish", "659840": "Sanctuary of Favour Parish", "597445": "Good Shepherd Parish", "761516": "God Is Able"})
try:  # greetings-20261003: each person's own name in the greeting (greet.py)
    import greet as G
except Exception:
    G = None
def tg(who, text, mtype=None):
    if not who: return
    env = dict(os.environ, CLERK_MSG_TYPE=mtype) if mtype else None
    try: each = G is not None and G.greets(text)
    except Exception: each = False
    if not each:  # no greeting line in the text: one call to everyone, as before
        subprocess.run(["python3", TG, who, text], capture_output=True, timeout=120, env=env)
        return
    for k in G.people_keys(who):  # greetings-20261003: one message per person, "Good morning <their name>,"
        try:
            try: t = G.personalise(text, k)
            except Exception: t = text
            subprocess.run(["python3", TG, k, t], capture_output=True, timeout=120, env=env)
        except Exception:
            pass  # one person's failed send must not stop the next person's
def once(flag, key):
    f = f"{T}/.remind-{flag}"
    if os.path.exists(f) and open(f).read().strip() == key: return False
    open(f, "w").write(key); return True
def srcdoc_due(today):
    due = []
    for lab, mo, yr, p, state, end in ci.srcdoc_slots(list(PARISHES)):
        if state != "EMPTY" or not end: continue
        try: left = (datetime.date.fromisoformat(end[:10]) - today).days
        except Exception: continue
        if left in [int(x) for x in C.get("automations.source_doc_reminders.days_before_close", [3, 1])]: due.append((left, end[:10], p, f"{lab} ({mo} {yr})"))
    if due:
        for lab, mo, yr, p, state, end in ci.srcdoc_slots(list(PARISHES)):
            if state == "EMPTY" and not end: due.append((due[0][0], due[0][1], p, f"{lab} ({mo} {yr}, no closing date shown)"))
    return sorted(due)
def closes(due):
    left = f"{due[0][0]} day" + ("" if due[0][0] == 1 else "s")
    try: d = datetime.date.fromisoformat(due[0][1]); return f"Portal closes {d:%a} {d.day} {MON3[d.month - 1]} ({left} left)"
    except Exception: return f"Portal closes {due[0][1]} ({left} left)"
def david_msg(due):
    if not due: return None
    return card("wait", "Source-doc reminder", closes(due), ["Still empty:"] + [f"{BUL}{PARISHES[p]}: {s}" for _, _, p, s in due],
                foot="Send the page(s) to the bot and choose Admin, Finance or Both.")
def divine_srcdoc_msg(due):
    k = [d for d in due if d[2] == "602757"]
    if not k: return None
    return ("Good morning,\n\n" + card("wait", "Kingdom Parish source documents", closes(k),  # greetings-20261003: name added when sent
            ["Still empty on the portal:"] + [f"{BUL}{s}" for _, _, _, s in k],
            foot="Send the page(s) to the bot and choose Admin, Finance or Both.") + "\n\nGod bless.")
def divine_att_msg():
    lines = []
    for m in ci._months():
        past, report = ci.att_missing_past(m)
        if past: lines.append(BUL + ", ".join(ci._nice(x) for x in past) + (", plus the Monthly report" if report else ""))
    if not lines: return None
    return ("Good morning,\n\n" + card("wait", "Attendance not yet in the app", "Kingdom Parish",  # greetings-20261003: name added when sent
            ["Sundays not yet submitted in the parish app:"] + lines,
            foot="Once all weeks and the Monthly report are in, it is filed on the portal automatically.") + "\n\nGod bless.")
if __name__ == "__main__":
    now = datetime.datetime.now(); today = now.date()
    if "--test" in sys.argv:
        print("== source-doc slots now:")
        for row in ci.srcdoc_slots(list(PARISHES)): print(" ", row)
        due = srcdoc_due(today)
        print("== David's source-doc reminder today would be:\n", david_msg(due))
        print("== Bro. Divine's source-doc reminder today would be:\n", divine_srcdoc_msg(due))
        print("== Bro. Divine's Monday attendance reminder would be:\n", divine_att_msg())
        sys.exit()
    if C.enabled("source_doc_reminders") and C.at_or_after(now, C.get("automations.source_doc_reminders.after_time", "10:00")) and once("srcdoc", today.isoformat()):
        due = srcdoc_due(today)
        t = david_msg(due)
        if t: tg(C.who("source_doc_reminder", "david", exclude=("divine",)), t, "source_doc_reminder")
        t = divine_srcdoc_msg(due)
        if t: tg(C.one("source_doc_reminder", "divine"), t, "source_doc_reminder")
    if MI is not None:  # reminders-20260929: 2nd collection reminder, cut-off Sunday evening, Monday after the cut-off
        try: MI.ladder(now, tg, once, C)
        except Exception: pass
    if C.enabled("weekly_attendance_reminder") and now.weekday() == C.weekday(C.get("automations.weekly_attendance_reminder.day", "mon"), 0) and C.at_or_after(now, C.get("automations.weekly_attendance_reminder.after_time", "09:00")) and once("divine", today.isoformat()):
        t = divine_att_msg()
        if MI is not None:  # reminders-20260929: missing Sunday collections go in the same Monday message
            try: t = MI.monday_msg(t, MI.facts())
            except Exception: pass
        if t: tg(C.one("weekly_attendance_reminder", "divine"), t, "weekly_attendance_reminder")
# tgstyle-20260927
# automations-20260928
# reminders-20260929
# greetings-20261003
