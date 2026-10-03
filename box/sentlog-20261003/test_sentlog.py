#!/usr/bin/env python3
"""sentlog-20261003 offline test: mocked SMTP and Telegram (urlopen); sends nothing, writes only to a temp folder."""
import ast, contextlib, io, json, os, smtplib, sys, tempfile, time, types, urllib.request, urllib.error

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
TOOLS, TGD = os.path.join(ROOT, "tools"), os.path.join(ROOT, "telegram")
tmp = tempfile.mkdtemp(prefix="sentlogtest-")
LOGD = os.environ["SENTLOG_DIR"] = os.path.join(tmp, "logs")
os.environ["TELEGRAM_BOT_TOKEN"] = "1234567:FAKE_TOKEN_for_the_offline_test_only_xx"
os.environ["CLERK_JOB"] = "test_sentlog"
fails = []
def ok(c, name):
    print(("PASS " if c else "FAIL ") + name)
    if not c: fails.append(name)
def lines():
    try: return [l.rstrip("\n").split("\t") for l in open(os.path.join(LOGD, "sent.log"))]
    except FileNotFoundError: return []
def reset():
    for f in os.listdir(LOGD) if os.path.isdir(LOGD) else []: os.remove(os.path.join(LOGD, f))

sys.path.insert(0, TOOLS); sys.path.insert(0, TGD)
import sentlog
ok(sentlog.DIR == LOGD, "sentlog: SENTLOG_DIR honoured")

# rotation + masking + one line, 7 fields
os.makedirs(LOGD, exist_ok=True)
p = os.path.join(LOGD, "sent.log"); open(p, "w").write("old line\n")
t = time.mktime((2026, 8, 15, 12, 0, 0, 0, 0, -1)); os.utime(p, (t, t))
sentlog.log("telegram", "david", "key 1234567:FAKE_TOKEN_for_the_offline_test_only_xx", "failed", "bad\tline\nbreak")
L = lines()
ok(os.path.exists(os.path.join(LOGD, "sent-2026-08.log")) and len(L) == 1, "sentlog: last month's file rotated to sent-2026-08.log")
ok(len(L[0]) == 7 and "FAKE_TOKEN" not in "\t".join(L[0]) and L[0][6] == "bad line break", "sentlog: 7 fields, token masked, no tabs/newlines")
reset()

# ---- mailer (fake routing, mocked SMTP) ----
fake = types.ModuleType("clerkcfg")
fake.filter_emails = lambda mtype, to, cc, add_missing=True: None
fake.button_emails = lambda: set()
SMTP = {"fail": False, "sent": 0}
class FakeSMTP:
    def __init__(self, *a, **k):
        if SMTP["fail"]: raise TimeoutError("timed out")
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def login(self, u, p): pass
    def send_message(self, m): SMTP["sent"] += 1
smtplib.SMTP_SSL = FakeSMTP
src = open(os.path.join(TOOLS, "mailer.py")).read()
pwf = os.path.join(tmp, "pw"); open(pwf, "w").write("not-a-real-password")
src = src.replace('PWF = "/workspace/.secrets/gmail-app-password"', f'PWF = {pwf!r}')
def mailer(*argv):
    sys.modules["clerkcfg"] = fake; sys.argv = ["mailer.py", *argv]
    with contextlib.redirect_stdout(io.StringIO()): exec(compile(src, "mailer.py", "exec"), {"__name__": "__main__"})
mailer("send", "--to", "a@example.org", "--subject", "Test subject", "--text", "SECRET BODY TEXT")
L = lines()
ok(len(L) == 1 and L[0][1:] == ["email", "test_sentlog", "a@example.org", "Test subject", "ok", ""], "mailer: ok line (time, email, job, to, subject, ok)")
ok("SECRET BODY" not in open(os.path.join(LOGD, "sent.log")).read() and "not-a-real-password" not in open(os.path.join(LOGD, "sent.log")).read(), "mailer: no body, no password in the log")
SMTP["fail"] = True
try: mailer("send", "--to", "a@example.org", "--subject", "Fail subject", "--text", "x"); raised = False
except TimeoutError: raised = True
L = lines()
ok(raised and L[-1][4:6] == ["Fail subject", "failed"] and "timed out" in L[-1][6], "mailer: SMTP error logged as failed and still raised (behaviour unchanged)")
reset()

# ---- Telegram: tg.call and send_msg.py (mocked urlopen) ----
CALLS = []
class Resp(io.BytesIO): pass
def fake_urlopen(req, timeout=None):
    url = req.full_url if hasattr(req, "full_url") else req
    assert url.startswith("https://api.telegram.org/"), url
    CALLS.append(url.rsplit("/", 1)[-1])
    if "fail" in (req.data or b"").decode("utf-8", "replace"):
        return Resp(json.dumps({"ok": False, "description": "Bad Request: chat not found"}).encode())
    return Resp(json.dumps({"ok": True, "result": {"message_id": 7}}).encode())
urllib.request.urlopen = fake_urlopen
import tg
tg.call("sendMessage", chat_id=111, text="SECRET TG TEXT")
tg.call("sendMessage", chat_id=111, text="please fail")
tg.call("getMe")
L = lines()
ok(len(L) == 2 and L[0][1] == "telegram" and L[0][3] == "111" and L[0][5] == "ok", "tg.call: send logged ok; getMe not logged")
ok(L[1][5] == "failed" and "chat not found" in L[1][6], "tg.call: failed send logged with the error")
ok("SECRET TG TEXT" not in open(os.path.join(LOGD, "sent.log")).read(), "tg.call: no message text in the log")
reset()
contacts = json.load(open(os.path.join(TGD, "contacts.json")))
who = "david" if "david" in contacts else next(iter(contacts))
sys.argv = ["send_msg.py", who, "hello", "--only", who, "--key", "test:sentlog", "--guard", os.path.join(tmp, "guard.json")]
with contextlib.redirect_stdout(io.StringIO()) as out:
    exec(compile(open(os.path.join(TGD, "send_msg.py")).read(), "send_msg.py", "exec"), {"__name__": "__main__", "__file__": os.path.join(TGD, "send_msg.py")})
L = lines()
ok(any(l[3] == who and l[4] == "test:sentlog" and l[5] == "ok" for l in L) or (L == [] and "skipped" in out.getvalue()), f"send_msg.py: line with who ({who}) and the key as label (or skipped by Automations)")
reset()

# ---- poller helpers (functions taken from poller.py, mocked _api) ----
psrc = open(os.path.join(TGD, "srcdoc", "poller.py")).read()
fns = [n for n in ast.parse(psrc).body if isinstance(n, ast.FunctionDef) and n.name in ("_slog", "api", "_api")]
g = {"sys": sys, "json": json, "urllib": urllib, "TOKEN": "x", "PEOPLE": {111: "David"}}
exec(compile(ast.Module(body=fns, type_ignores=[]), "poller.py", "exec"), g)
g["api"]("sendMessage", chat_id=111, text="SECRET BOT TEXT"); g["api"]("answerCallbackQuery", callback_query_id="1")
L = lines()
ok(len(L) == 1 and L[0][3] == "David" and L[0][4] == "bot sendMessage" and L[0][5] == "ok", "poller.api: bot send logged with the person's name; callbacks not logged")
print("ALL PASS" if not fails else f"{len(fails)} FAILED"); sys.exit(1 if fails else 0)
