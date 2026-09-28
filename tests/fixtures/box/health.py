#!/usr/bin/env python3
import os, subprocess, sys, datetime
sys.path.insert(0, "/workspace/tools"); from common import *
T = "/workspace/tools"
import clerkcfg as C  # automations-20260928
LOGS = ["/workspace/rccg-memos/runner-log.txt", "/workspace/rccg-attendance/runner-log.txt", "/workspace/fin-statement/runner-log.txt", f"{T}/supervisor.log", f"{T}/drive-sync.log"]
PROCS = [("Upload bot + scheduler", "srcdoc/poller.py"), ("Memo runner", "memo-runner.sh"), ("Statement runner", "stmt-runner.py"), ("Attendance watch", "att-watch.py"), ("Drive sync", "drive-sync.sh")]
def trim():
    for p in LOGS:
        if os.path.exists(p) and os.path.getsize(p) > C.num("automations.health_note.log_trim_mb", 1) * 1_000_000:
            lines = open(p, errors="replace").readlines()[-int(C.num("automations.health_note.log_trim_lines", 2000)):]; open(p, "w").writelines(lines)
def alive(pat): return subprocess.run(["pgrep", "-f", pat], capture_output=True).returncode == 0
def tail(p):
    try: return open(p, errors="replace").read().strip().splitlines()[-1]
    except Exception: return "none"
def recent(p, word, days=7):
    cut = (now() - datetime.timedelta(days=days)).strftime("%F")
    try: return sum(1 for l in open(p, errors="replace") if l[:10] >= cut and word in l)
    except Exception: return 0
def when(s):
    try:
        w = datetime.datetime.fromisoformat(s.strip()[:16].replace(" ", "T")); return f"{w:%a} {w.day} {MON3[w.month - 1]}, {w:%H:%M}"
    except Exception: return s
def memo_last():
    parts = [x.strip() for x in tail("/workspace/rccg-memos/check-log.txt").split("|")]
    return DOT.join([when(parts[0])] + [x for x in parts[1:] if x and x != "-"])
def note():
    ups = [(n, alive(p)) for n, p in PROCS]
    r = recent(f"{T}/supervisor.log", "restart"); e = recent(f"{T}/drive-sync.log", "ERROR")
    bad = bool(r or e or not all(a for _, a in ups)); t = now()
    body = [f"{ICON['ok'] if a else ICON['fail']} {n}" + ("" if a else " (DOWN)") for n, a in ups]
    body += ["", f"Last memo check: {memo_last()}", f"Last Drive sync: {when(tail(f'{T}/.last-sync'))}",
             f"This week: {r} automatic restart(s), {e} sync error(s)"]
    return card("warn" if bad else "health", "Weekly system check", f"{t:%a} {t.day} {MON3[t.month - 1]}", body,
                step="tell Claude" if bad else None, foot=None if bad else "All good. No action needed.")
def send(text): run(["python3", TG, C.who("weekly_health", "david"), text], env=dict(os.environ, CLERK_MSG_TYPE="weekly_health"))
if __name__ == "__main__":
    if "--test" in sys.argv: t = note(); print(t); send(t); sys.exit()
    if once_per_day(f"{T}/.health-trim-day"): trim()
    t = now()
    if C.enabled("health_note") and t.weekday() == C.weekday(C.get("automations.health_note.day", "sat"), 5) and C.at_or_after(t, C.get("automations.health_note.after_time", "18:00")):
        wk = t.strftime("%G-W%V"); f = f"{T}/.health-week"
        if not (os.path.exists(f) and open(f).read().strip() == wk):
            open(f, "w").write(wk); send(note())
# tgstyle-20260927
# automations-20260928
