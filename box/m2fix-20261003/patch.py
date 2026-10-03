#!/usr/bin/env python3
"""m2fix-20261003: a month-end email retry checks Gmail Sent first (audit 2026-10-03, M2).

  python3 patch.py --check   only check that every change applies (changes nothing)
  python3 patch.py           apply (safe to run twice: files that already have the marker are skipped)

Changes (text replacements, each must match exactly once):
  tools/mailer.py    `sent` gains --payload and --minutes: the payload's subject and its recipients after the same
                     Automations routing `send` applies (CLERK_MSG_TYPE / CLERK_PERSONAL), searched in Gmail Sent
                     within the last N minutes (by the time Gmail received it). FOUND only when the subject is the same
                     AND one of those recipients is on the sent copy. `sent <text> [--days]` works as before.
  tools/monthend.py  mail(): before the retry, `mailer.py sent --payload <p> --minutes <since try 1>`; FOUND -> the first
                     try did go out (e.g. SMTP timed out after Gmail accepted it): no resend, counted as sent.
                     If Sent can't be checked, the retry goes ahead as before.
"""
import os, sys

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "m2fix-20261003"

CHANGES = {
"tools/mailer.py": [
('''def sent(a):
    import email
    from email.header import decode_header, make_header
    since = (datetime.date.today() - datetime.timedelta(days=a.days)).strftime("%d-%b-%Y")
    n = 0
    with imaplib.IMAP4_SSL("imap.gmail.com", timeout=60) as i:
        i.login(USER, pw()); i.select('"[Gmail]/Sent Mail"', readonly=True)
        q = a.text.replace('"', '')
        typ, d = i.search(None, "SINCE", since, "TEXT", f'"{q}"')
        for mid in (d[0].split() if d and d[0] else [])[-30:]:
            t, m = i.fetch(mid, "(RFC822)"); msg = email.message_from_bytes(m[0][1])
            subj = str(make_header(decode_header(msg.get("Subject") or "")))
''',
'''def sent_target(payload):
    """m2fix-20261003: (subject, routed recipients) of a payload.json, routed exactly as send() would route it now."""
    p = json.load(open(payload))
    lst = lambda v: [x.strip() for x in (v if isinstance(v, list) else str(v or "").split(",")) if x.strip()]
    text, html = p.get("body") or p.get("text") or "", p.get("htmlBody") or p.get("html")
    personal = os.environ.get("CLERK_PERSONAL") == "1" or bool(p.get("personal"))
    to, cc, why = resolve(lst(p.get("to")), lst(p.get("cc")), os.environ.get("CLERK_MSG_TYPE"), personal, (html or "") + "\\n" + (text or ""))
    rcpt = to + cc if why in (None, "skip") else lst(p.get("to")) + lst(p.get("cc"))
    return p.get("subject") or "", {x.strip().lower() for x in rcpt}
def sent(a):
    import email
    from email.header import decode_header, make_header
    from email.utils import getaddresses
    want = None  # m2fix-20261003: --payload = same subject AND a routed recipient, within --minutes
    if a.payload:
        a.text, want = sent_target(a.payload)
    cut = time.time() - a.minutes * 60 if a.minutes else None
    since = (datetime.date.fromtimestamp(cut) if cut else datetime.date.today() - datetime.timedelta(days=a.days)).strftime("%d-%b-%Y")
    n = 0
    with imaplib.IMAP4_SSL("imap.gmail.com", timeout=60) as i:
        i.login(USER, pw()); i.select('"[Gmail]/Sent Mail"', readonly=True)
        q = a.text.replace('"', '')
        typ, d = i.search(None, "SINCE", since, "TEXT", f'"{q}"')
        for mid in (d[0].split() if d and d[0] else [])[-30:]:
            t, m = i.fetch(mid, "(INTERNALDATE RFC822)"); msg = email.message_from_bytes(m[0][1])
            subj = str(make_header(decode_header(msg.get("Subject") or "")))
            if cut is not None:
                it = imaplib.Internaldate2tuple(m[0][0] if isinstance(m[0], tuple) else m[0])
                if it is None or time.mktime(it) < cut: continue
            if want is not None:
                got = {x.strip().lower() for _, x in getaddresses(msg.get_all("To", []) + msg.get_all("Cc", [])) if x}
                if subj.strip() == a.text.strip() and got & want: n += 1
                continue
'''),
('''import argparse, imaplib, json, mimetypes, os, re, smtplib, sys, datetime
''',
'''import argparse, imaplib, json, mimetypes, os, re, smtplib, sys, datetime, time
'''),
('''c = sp.add_parser("sent"); c.add_argument("text"); c.add_argument("--days", type=int, default=60)
''',
'''c = sp.add_parser("sent"); c.add_argument("text", nargs="?", default=""); c.add_argument("--days", type=int, default=60)
c.add_argument("--payload"); c.add_argument("--minutes", type=int)  # m2fix-20261003
'''),
],
"tools/monthend.py": [
('''    env = dict({"CLERK_MSG_TYPE": mtype} if mtype else {}, **({"CLERK_PERSONAL": "1"} if personal else {})) or None
    for attempt in (1, 2):
        rc, out, err = py(os.path.join(TOOLS, "mailer.py"), "send", "--payload", payload, env=env, timeout=180)
''',
'''    env = dict({"CLERK_MSG_TYPE": mtype} if mtype else {}, **({"CLERK_PERSONAL": "1"} if personal else {})) or None
    t0 = time.time()
    for attempt in (1, 2):
        if attempt == 2:  # m2fix-20261003: did try 1 go out anyway (e.g. SMTP timed out after Gmail took it)?
            mins = str(int((time.time() - t0) // 60) + 2)
            rc, out, err = py(os.path.join(TOOLS, "mailer.py"), "sent", "--payload", payload, "--minutes", mins, env=env, timeout=120)
            if rc == 0 and out.strip().startswith("FOUND"):
                log(f"email {os.path.basename(os.path.dirname(payload))}: already in Gmail Sent, not sent again")
                return True
            if rc or not out.strip().startswith("NONE"):
                log(f"email {os.path.basename(os.path.dirname(payload))}: Gmail Sent not checked ({(err or out).strip()[-100:]}); retrying")
        rc, out, err = py(os.path.join(TOOLS, "mailer.py"), "send", "--payload", payload, env=env, timeout=180)
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
