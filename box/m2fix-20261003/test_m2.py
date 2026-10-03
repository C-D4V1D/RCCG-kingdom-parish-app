#!/usr/bin/env python3
"""m2fix-20261003 offline test: mocked SMTP/IMAP and a fake clerkcfg; sends nothing, logs in nowhere."""
import contextlib, imaplib, io, json, os, smtplib, sys, tempfile, time, types
from email.message import EmailMessage

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
TOOLS = os.path.join(ROOT, "tools")
tmp = tempfile.mkdtemp(prefix="m2test-")
os.environ["SENTLOG_DIR"] = os.path.join(tmp, "logs")  # sentlog-20261003 (if installed) writes here, not the real log
fails = []
def ok(cond, name):
    print(("PASS " if cond else "FAIL ") + name)
    if not cond: fails.append(name)

def no_smtp(*a, **k): raise AssertionError("SMTP must not be used in this test")
smtplib.SMTP_SSL = no_smtp

# fake Automations routing: a group email adds divine; a personal email is only filtered
fake = types.ModuleType("clerkcfg")
def filter_emails(mtype, to, cc, add_missing=True):
    if not mtype: return None
    return (to + (["divine@example.org"] if add_missing and "divine@example.org" not in to else [])), cc
fake.filter_emails = filter_emails
fake.button_emails = lambda: {"david@example.org", "divine@example.org"}

SENT = []  # (internal epoch, To, Subject)
class FakeIMAP:
    def __init__(self, *a, **k): pass
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def login(self, u, p): pass
    def select(self, box, readonly=False): assert readonly; return "OK", [b"1"]
    def search(self, *crit): return "OK", [" ".join(str(i + 1) for i in range(len(SENT))).encode()]
    def fetch(self, mid, what):
        ts, to, subj = SENT[int(mid) - 1]
        m = EmailMessage(); m["From"] = "x@example.org"; m["To"] = to; m["Subject"] = subj; m.set_content("body")
        return "OK", [(b"%s (INTERNALDATE %s RFC822 {1}" % (mid, imaplib.Time2Internaldate(ts).encode()), m.as_bytes()), b")"]
imaplib.IMAP4_SSL = FakeIMAP

src = open(os.path.join(TOOLS, "mailer.py")).read()
pwf = os.path.join(tmp, "pw"); open(pwf, "w").write("not-a-real-password")
src = src.replace('PWF = "/workspace/.secrets/gmail-app-password"', f'PWF = {pwf!r}')
def mailer(*argv, env=None):
    sys.modules["clerkcfg"] = fake
    old = dict(os.environ); os.environ.update(env or {})
    sys.argv = ["mailer.py", *argv]; out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out): exec(compile(src, "mailer.py", "exec"), {"__name__": "__main__"})
    finally:
        os.environ.clear(); os.environ.update(old)
    return out.getvalue().strip()

pl = os.path.join(tmp, "payload.json")
json.dump({"to": ["pastor@example.org"], "subject": "September 2026 remittance filed", "body": "hi"}, open(pl, "w"))
now = time.time()
SENT[:] = [(now - 60, "pastor@example.org, divine@example.org", "September 2026 remittance filed")]
ok(mailer("sent", "--payload", pl, "--minutes", "5", env={"CLERK_MSG_TYPE": "remittance_filed"}).startswith("FOUND"), "mailer: same subject + recipient in window -> FOUND")
SENT[:] = [(now - 60, "someone@example.org", "September 2026 remittance filed")]
ok(mailer("sent", "--payload", pl, "--minutes", "5") == "NONE", "mailer: other recipient -> NONE")
SENT[:] = [(now - 60, "pastor@example.org", "September 2026 remittance filed (copy)")]
ok(mailer("sent", "--payload", pl, "--minutes", "5") == "NONE", "mailer: other subject -> NONE")
SENT[:] = [(now - 3600, "pastor@example.org", "September 2026 remittance filed")]
ok(mailer("sent", "--payload", pl, "--minutes", "5") == "NONE", "mailer: outside the time window -> NONE")
SENT[:] = [(now - 60, "divine@example.org", "September 2026 remittance filed")]
ok(mailer("sent", "--payload", pl, "--minutes", "5", env={"CLERK_MSG_TYPE": "remittance_filed"}).startswith("FOUND"), "mailer: recipient added by Automations routing counts")
ok(mailer("sent", "--payload", pl, "--minutes", "5") == "NONE", "mailer: without the message type routing adds nobody")
SENT[:] = [(now - 86400, "a@example.org", "Old subject")]
ok(mailer("sent", "Old subject", "--days", "3").startswith("FOUND"), "mailer: legacy 'sent <text> --days' unchanged")

# monthend.mail(): the retry checks Sent first
sys.path.insert(0, TOOLS); sys.modules.pop("clerkcfg", None)
import monthend as M
M.time.sleep = lambda s: None; M.log = lambda *a, **k: None
def scenario(send_rcs, sent_reply):
    calls = []; it = iter(send_rcs)
    def py(script, *args, **k):
        calls.append(args[0])
        if args[0] == "sent": return sent_reply
        rc = next(it); return rc, ('{"ok": true}' if rc == 0 else ""), ("" if rc == 0 else "smtp timeout")
    M.py = py
    return M.mail(pl, "remittance_filed"), calls
r, c = scenario([1], (0, "FOUND 1\n", "")); ok(r is True and c == ["send", "sent"], "monthend: try 1 failed but in Sent -> no resend, counted sent")
r, c = scenario([1, 0], (0, "NONE\n", "")); ok(r is True and c == ["send", "sent", "send"], "monthend: not in Sent -> retried")
r, c = scenario([1, 0], (1, "", "imap down")); ok(r is True and c == ["send", "sent", "send"], "monthend: Sent unreadable -> retried as before")
r, c = scenario([0], (0, "FOUND 1", "")); ok(r is True and c == ["send"], "monthend: first try ok -> no Sent check")
r, c = scenario([3], (0, "NONE", "")); ok(r is False and c == ["send"], "monthend: refused (exit 3) -> no retry, no check")
r, c = scenario([1, 1], (0, "NONE", "")); ok(r is False and c == ["send", "sent", "send"], "monthend: both tries fail -> False")
print("ALL PASS" if not fails else f"{len(fails)} FAILED"); sys.exit(1 if fails else 0)
