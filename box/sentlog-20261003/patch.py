#!/usr/bin/env python3
"""sentlog-20261003: every outgoing email and Telegram send appends one line to /workspace/logs/sent.log.

  python3 patch.py --check   only check that every change applies (changes nothing)
  python3 patch.py           apply (safe to run twice: files that already have the marker are skipped)

New file tools/sentlog.py (installed by install.sh). Changes (text replacements, each must match exactly once):
  tools/mailer.py           send: ok / failed (SMTP error, refused) / skipped (switched off in Automations)
  tools/monthend.py         the m2fix "already in Gmail Sent, not sent again" case is logged as skipped (needs m2fix)
  telegram/tg.py            call(): every send* method; send_msg.py sets tg.LABEL (the guard key) and tg.NAMES (who)
  telegram/send_msg.py      label = --key; documents logged too
  telegram/send_doc.py      each document send
  telegram/srcdoc/poller.py the upload bot's own sends (api send*, send_doc, send_file); needs a poller restart
Logged: time, channel, job, recipient(s), subject or short label, status, error. Never the body, never a secret.
"""
import os, sys

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "sentlog-20261003"

CHANGES = {
"tools/mailer.py": [
('''def send(a):
    personal = ''',
'''def _slog(to, cc, subj, status, err=""):  # sentlog-20261003: one line in /workspace/logs/sent.log, never the body
    try:
        sys.path.insert(0, "/workspace/tools"); import sentlog
        sentlog.log("email", list(to or []) + list(cc or []), subj, status, err)
    except Exception:
        pass
def send(a):
    personal = '''),
('''        print(json.dumps({"ok": True, "skipped": "switched off in Automations", "subject": subj})); return
''',
'''        _slog(to, cc, subj, "skipped", "switched off in Automations")
        print(json.dumps({"ok": True, "skipped": "switched off in Automations", "subject": subj})); return
'''),
('''        print(json.dumps({"ok": False, "error": why, "subject": subj})); sys.exit(3)
''',
'''        _slog(to, cc, subj, "failed", why)
        print(json.dumps({"ok": False, "error": why, "subject": subj})); sys.exit(3)
'''),
('''    for path in (a.attach or []):
        ct = (mimetypes.guess_type(path)[0] or "application/octet-stream").split("/")
        m.add_attachment(open(path, "rb").read(), maintype=ct[0], subtype=ct[1], filename=os.path.basename(path))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60) as s:
        s.login(USER, pw()); s.send_message(m)
''',
'''    try:
        for path in (a.attach or []):
            ct = (mimetypes.guess_type(path)[0] or "application/octet-stream").split("/")
            m.add_attachment(open(path, "rb").read(), maintype=ct[0], subtype=ct[1], filename=os.path.basename(path))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60) as s:
            s.login(USER, pw()); s.send_message(m)
    except BaseException as e:
        _slog(lst(to), lst(cc), subj, "failed", f"{type(e).__name__}: {e}"); raise
    _slog(lst(to), lst(cc), subj, "ok")
'''),
],
"tools/monthend.py": [
('''                log(f"email {os.path.basename(os.path.dirname(payload))}: already in Gmail Sent, not sent again")
''',
'''                log(f"email {os.path.basename(os.path.dirname(payload))}: already in Gmail Sent, not sent again")
                try:  # sentlog-20261003
                    import sentlog
                    _p = rjson(payload, {}) or {}
                    sentlog.log("email", _p.get("to"), _p.get("subject"), "skipped", "already in Gmail Sent; retry not sent")
                except Exception:
                    pass
'''),
],
"telegram/tg.py": [
('''def call(method, **params):
    data = json.dumps(params).encode() if params else None
    req = urllib.request.Request(f"https://api.telegram.org/bot{token()}/{method}", data=data, headers={"Content-Type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=20))
    except urllib.error.HTTPError as e:
        return json.load(e)
''',
'''LABEL = None; NAMES = {}  # sentlog-20261003: callers may set the log label (e.g. the guard key) and {chat id: who}
def _slog(chat, label, r=None, err=None):
    """sentlog-20261003: one line in /workspace/logs/sent.log (recipient, label, ok/failed); never the text."""
    try:
        sys.path.insert(0, "/workspace/tools"); import sentlog
        ok = bool(r and r.get("ok"))
        sentlog.log("telegram", NAMES.get(str(chat), chat), label, "ok" if ok else "failed",
                    "" if ok else (err or (r or {}).get("description") or "unknown error"))
    except Exception:
        pass
def call(method, **params):
    data = json.dumps(params).encode() if params else None
    req = urllib.request.Request(f"https://api.telegram.org/bot{token()}/{method}", data=data, headers={"Content-Type": "application/json"})
    logit = method.startswith("send") and method != "sendChatAction"
    try:
        try:
            r = json.load(urllib.request.urlopen(req, timeout=20))
        except urllib.error.HTTPError as e:
            r = json.load(e)
    except Exception as e:
        if logit: _slog(params.get("chat_id"), LABEL or method, err=f"{type(e).__name__}: {e}")
        raise
    if logit: _slog(params.get("chat_id"), LABEL or method, r)
    return r
'''),
],
"telegram/send_msg.py": [
('''def rd(t): return open(t[1:]).read() if t.startswith('@') else t.replace('\\\\n', '\\n')
''',
'''tg.LABEL = a.key or ('document' if a.doc else 'message')  # sentlog-20261003
tg.NAMES = {str((v or {}).get('chat_id')): k for k, v in contacts.items() if isinstance(v, dict)}
def rd(t): return open(t[1:]).read() if t.startswith('@') else t.replace('\\\\n', '\\n')
'''),
('''    try: return json.load(urllib.request.urlopen(req, timeout=90))
    except urllib.error.HTTPError as e: return json.load(e)
''',
'''    _lb = f"{tg.LABEL} {os.path.basename(a.doc)}"  # sentlog-20261003
    try: r = json.load(urllib.request.urlopen(req, timeout=90))
    except urllib.error.HTTPError as e: r = json.load(e)
    except Exception as e: tg._slog(chat_id, _lb, err=f'{type(e).__name__}: {e}'); raise
    tg._slog(chat_id, _lb, r); return r
'''),
],
"telegram/send_doc.py": [
('''    try: r = json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e: r = json.load(e)
''',
'''    try: r = json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e: r = json.load(e)
    except Exception as e: tg._slog(n, "document " + fname, err=f"{type(e).__name__}: {e}"); raise  # sentlog-20261003
    tg._slog(n, "document " + fname, r)
'''),
],
"telegram/srcdoc/poller.py": [
('''def api(method, _to=30, **params):
    req = ''',
'''def _slog(chat, label, r=None, err=None):  # sentlog-20261003: the bot's sends in /workspace/logs/sent.log, never the text
    try:
        if "/workspace/tools" not in sys.path: sys.path.insert(0, "/workspace/tools")
        import sentlog
        try: who = PEOPLE.get(int(chat)) or chat
        except Exception: who = chat
        ok = bool(r and r.get("ok"))
        sentlog.log("telegram", who, label, "ok" if ok else "failed", "" if ok else (err or (r or {}).get("description") or "unknown error"))
    except Exception:
        pass


def api(method, _to=30, **params):
    if not method.startswith("send") or method == "sendChatAction":
        return _api(method, _to, **params)
    try: r = _api(method, _to, **params)
    except Exception as e: _slog(params.get("chat_id"), "bot " + method, None, f"{type(e).__name__}: {e}"); raise
    _slog(params.get("chat_id"), "bot " + method, r); return r


def _api(method, _to=30, **params):
    req = '''),
('''    try: r = json.load(urllib.request.urlopen(req, timeout=120))
    except urllib.error.HTTPError as e: r = json.load(e)
    if not r.get("ok"): log("sendDocument failed", chat, r.get("description"))
''',
'''    try: r = json.load(urllib.request.urlopen(req, timeout=120))
    except urllib.error.HTTPError as e: r = json.load(e)
    except Exception as e: _slog(chat, "bot document " + os.path.basename(path), None, f"{type(e).__name__}: {e}"); raise
    _slog(chat, "bot document " + os.path.basename(path), r)
    if not r.get("ok"): log("sendDocument failed", chat, r.get("description"))
'''),
('''    try: r = json.load(urllib.request.urlopen(req, timeout=120))
    except urllib.error.HTTPError as e: r = json.load(e)
    if not r.get("ok"): log("send_file failed", chat, r.get("description"))
''',
'''    try: r = json.load(urllib.request.urlopen(req, timeout=120))
    except urllib.error.HTTPError as e: r = json.load(e)
    except Exception as e: _slog(chat, "bot file " + os.path.basename(path), None, f"{type(e).__name__}: {e}"); raise
    _slog(chat, "bot file " + os.path.basename(path), r)
    if not r.get("ok"): log("send_file failed", chat, r.get("description"))
'''),
],
}


def main():
    check = "--check" in sys.argv
    bad = 0
    for rel, subs in CHANGES.items():
        p = os.path.join(ROOT, rel)
        try:
            s = open(p).read()
        except OSError as e:
            print(f"MISSING {rel}: {e}"); bad += 1; continue
        if MARK in s:
            print(f"already done: {rel}"); continue
        for old, new in subs:
            n = s.count(old)
            if n != 1:
                print(f"DOES NOT FIT {rel}: a change matched {n} times (expected 1): {old.strip().splitlines()[0][:80]}")
                bad += 1; break
            s = s.replace(old, new)
        else:
            s = s.rstrip("\n") + f"\n# {MARK}\n"
            if not check:
                open(p, "w").write(s)
            print(("fits: " if check else "patched: ") + rel)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
