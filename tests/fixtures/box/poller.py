"""Test fixture: the parts of the Clerk box's /workspace/telegram/srcdoc/poller.py that the collection-reminders update changes."""
import json, os, re, threading, traceback
HELP = ("<b>Commands</b>\n"
        "/status - deadlines, empty upload slots, attendance and statement\n"
        "/statement - the latest financial statement (link + PDF)\n"
        "/help - this message")
SENT = []
def send(chat, text, kb=None, html=False): SENT.append((chat, text))
def log(*a): pass


def cmd_statement(chat):
    send(chat, "statement")

def cmd_refresh(chat, arg):
    runs = json.load(open("/workspace/rccg-attendance/state/att-runs.json")) if os.path.exists("/workspace/rccg-attendance/state/att-runs.json") else {}
    m = arg if re.fullmatch(r"\d{4}-\d{2}", arg or "") else (sorted(runs)[-1] if runs else None)
    if not m or m not in runs:
        send(chat, "There is no attendance month filed by the bot to refresh"); return
    send(chat, f"refresh {m}")

def handle_message(cid, t):
    cmd = t.split("@")[0]
    if cmd == "/statement":
        threading.Thread(target=cmd_statement, args=(cid,), daemon=True).start(); return
    if cmd.split()[0] == "/refresh":
        threading.Thread(target=cmd_refresh, args=(cid, (t.split() + [""])[1]), daemon=True).start(); return
    send(cid, HELP, html=True)
