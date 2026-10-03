#!/usr/bin/env python3
"""c2fix-20261003: personal emails go only to their own person; action buttons only for people with buttons on.

  python3 patch.py --check   only check that every change applies (changes nothing)
  python3 patch.py           apply (safe to run twice: files that already have the marker are skipped)

Changes (text replacements, each must match exactly once):
  tools/clerkcfg.py  filter_emails(..., add_missing=True): add_missing=False only drops switched-off people, never adds;
                     new button_emails(): addresses of the people with buttons on in the app.
  tools/mailer.py    resolve(): routing as before for group emails; a personal email (payload "personal": true or
                     CLERK_PERSONAL=1) is only filtered, and skipped (not sent) when its person is switched off;
                     an email with /remit-action buttons is refused (exit 3) unless every recipient has buttons on.
  telegram/send_msg.py         Telegram link buttons only for people with buttons on in Automations.
  rccg-remit/make-check-email.py  each person's address and buttons from Automations; buttons on but no signed link
                     from the app -> that person gets the no-button version.
  tools/monthend.py  mail(..., personal=False); the three check emails and the webhook-test email are personal;
                     a check email not addressed to exactly one person stops the run; a refused email is not retried.
"""
import os, sys

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "c2fix-20261003"

CHANGES = {
"tools/clerkcfg.py": [
('''def filter_emails(mtype, to, cc):
    """Apply email routing. Addresses of people in the app follow their switch; other addresses are kept;
    people switched on but missing are added to `to`. Returns (to, cc) or None when routing doesn't apply."""
''',
'''def filter_emails(mtype, to, cc, add_missing=True):
    """Apply email routing. Addresses of people in the app follow their switch; other addresses are kept;
    people switched on but missing are added to `to`. Returns (to, cc) or None when routing doesn't apply.
    add_missing=False (c2fix-20261003): a personal email (one person's own copy, e.g. with their buttons) is only
    filtered: a switched-off person is dropped, nobody is ever added."""
'''),
('''    to2, cc2 = keep(to), keep(cc)
    have = {a.strip().lower() for a in to2 + cc2}
''',
'''    to2, cc2 = keep(to), keep(cc)
    if not add_missing:  # c2fix-20261003
        return to2, cc2
    have = {a.strip().lower() for a in to2 + cc2}
'''),
('''# ---------------- parishes / upload bot ----------------
''',
'''def button_emails():  # c2fix-20261003
    """Lower-case email addresses of the people allowed action buttons (buttons on in the app). None without a config."""
    if config() is None:
        return None
    return {str(p.get("email")).strip().lower() for p in all_people() if p.get("buttons") and str(p.get("email") or "").strip()}


# ---------------- parishes / upload bot ----------------
'''),
],
"tools/mailer.py": [
('''import argparse, imaplib, json, mimetypes, os, smtplib, sys, datetime
''',
'''import argparse, imaplib, json, mimetypes, os, re, smtplib, sys, datetime
'''),
('''def send(a):
    if a.payload:
''',
'''ACTION_LINK = re.compile(r"/remit-action\\?t=", re.I)  # c2fix-20261003: the signed Generate RRR / Refresh buttons
def resolve(to, cc, mtype, personal, content):
    """c2fix-20261003. Final (to, cc, why); why None = send, "skip" = personal email whose person is switched off,
    anything else = refused. Routing (Automations) decides who gets each message type: a group email gets the people
    switched on added (once each); a personal email is only filtered, never widened. Button links go only to people
    with buttons on in the app."""
    try:
        sys.path.insert(0, "/workspace/tools"); import clerkcfg as C
    except Exception:
        C = None
    try:
        r = C.filter_emails(mtype, to, cc, add_missing=not personal) if C else None
    except Exception:
        r = None
    if r is not None:
        to, cc = r
        if personal and not to and not cc:
            return [], [], "skip"
        if not to: to, cc = (cc or [USER]), []  # everyone switched off: the copy only lands in Sent
    if ACTION_LINK.search(content or ""):
        try:
            allowed = C.button_emails() if C else None
        except Exception:
            allowed = None
        if not allowed:
            return to, cc, "refused: the email has action buttons but the people allowed buttons could not be read"
        bad = [x for x in to + cc if x.strip().lower() not in allowed]
        if bad:
            return to, cc, f"refused: action buttons are only for people with buttons on in the app ({len(bad)} other recipient(s))"
    return to, cc, None
def send(a):
    personal = os.environ.get("CLERK_PERSONAL") == "1"  # c2fix-20261003
    if a.payload:
'''),
('''        text, html = p.get("body") or p.get("text") or "", p.get("htmlBody") or p.get("html")
''',
'''        text, html = p.get("body") or p.get("text") or "", p.get("htmlBody") or p.get("html")
        personal = personal or bool(p.get("personal"))
'''),
('''    try:  # automations-20260928: email routing from the Automations settings (only when the caller names the message type)
        sys.path.insert(0, "/workspace/tools"); import clerkcfg as _C
        _r = _C.filter_emails(os.environ.get("CLERK_MSG_TYPE"), lst(to), lst(cc))
    except Exception:
        _r = None
    if _r is not None:
        to, cc = _r
        if not to: to, cc = (cc or [USER]), []  # everyone switched off: the copy only lands in Sent
''',
'''    # automations-20260928: email routing from the Automations settings (only when the caller names the message type)
    to, cc, why = resolve(lst(to), lst(cc), os.environ.get("CLERK_MSG_TYPE"), personal, (html or "") + "\\n" + (text or ""))
    if why == "skip":
        print(json.dumps({"ok": True, "skipped": "switched off in Automations", "subject": subj})); return
    if why:
        print(json.dumps({"ok": False, "error": why, "subject": subj})); sys.exit(3)
'''),
],
"tools/monthend.py": [
('''def mail(payload, mtype=None):
    """Send one payload.json with the box mailer; one retry. Returns True when sent."""
    env = {"CLERK_MSG_TYPE": mtype} if mtype else None
''',
'''def mail(payload, mtype=None, personal=False):
    """Send one payload.json with the box mailer; one retry. Returns True when sent.
    personal=True (c2fix-20261003): one person's own copy (e.g. with their buttons); routing may drop that person
    but never adds anyone else."""
    env = dict({"CLERK_MSG_TYPE": mtype} if mtype else {}, **({"CLERK_PERSONAL": "1"} if personal else {})) or None
'''),
('''        log(f"email {os.path.basename(os.path.dirname(payload))} not sent (try {attempt}): {(err or out).strip()[-150:]}")
''',
'''        log(f"email {os.path.basename(os.path.dirname(payload))} not sent (try {attempt}): {(err or out).strip()[-150:]}")
        if rc == 3:  # c2fix-20261003: refused by the mailer; retrying cannot help
            return False
'''),
('''        if not mail(pf, "remittance_check"):
''',
'''        if len([a for a in to if a]) != 1:  # c2fix-20261003: each check email is one person's own copy
            stop(ctx, "5 email", f"the check email for {who} is not addressed to exactly one person", wake=True,
                 report_state="submitted")
        if not mail(pf, "remittance_check", personal=True):
'''),
('''    if rc or not mail(os.path.join(outdir, "david", "payload.json")):
''',
'''    if rc or not mail(os.path.join(outdir, "david", "payload.json"), personal=True):  # c2fix-20261003
'''),
],
"telegram/send_msg.py": [
('''for who, _, kb in plan:
    if kb and who not in ('david', 'divine') and any('url' in b for row in kb for b in row): sys.exit(f'refused: link buttons only for david/divine, not {who}')  # monthclose-20260930
''',
'''_BTN = None
try:  # c2fix-20261003: link buttons only for people with buttons on in Automations (the old rule only without saved settings)
    if _C is not None and _C.config() is not None:
        _BTN = {p['key'] for p in _C.all_people() if p.get('buttons')}
except Exception:
    _BTN = None
if _BTN is None: _BTN = {'david', 'divine'}
for who, _, kb in plan:
    if kb and who not in _BTN and any('url' in b for row in kb for b in row): sys.exit(f'refused: link buttons only for people with buttons on in Automations, not {who}')  # monthclose-20260930
'''),
],
"rccg-remit/make-check-email.py": [
('''ACTIONS = [('generate_rrr', 'Generate RRR', '#1e6b3a'), ('refresh', 'Refresh', '#1f3f7a')]       # required for every button recipient
''',
'''try:  # c2fix-20261003: each person's address and buttons come from Automations (people: email, buttons)
    sys.path.insert(0, '/workspace/tools'); import clerkcfg as _C
    if _C.config() is not None:
        for _p in _C.people():
            if _p.get('key') in RECIPIENTS:
                _a, _n, _b = RECIPIENTS[_p['key']]
                RECIPIENTS[_p['key']] = (str(_p.get('email') or _a).strip(), _n, bool(_p.get('buttons')))
except Exception:
    pass
ACTIONS = [('generate_rrr', 'Generate RRR', '#1e6b3a'), ('refresh', 'Refresh', '#1f3f7a')]       # required for every button recipient
'''),
('''    LINKS_UNTIL = exp_label(_lexp)
    for w in WHOS:
''',
'''    LINKS_UNTIL = exp_label(_lexp)
    for w in WHOS:  # c2fix-20261003: buttons on in Automations but the app signed no links for this person: no buttons
        if RECIPIENTS[w][2] and not LINKS.get(w):
            RECIPIENTS[w] = (RECIPIENTS[w][0], RECIPIENTS[w][1], False)
    for w in WHOS:
'''),
('''    if who == 'pastor':
        return ("For information only''',
'''    if who == 'pastor' or not RECIPIENTS[who][2]:  # c2fix-20261003: anyone without buttons
        return ("For information only'''),
],
}


def main():
    check = "--check" in sys.argv
    plan = {}
    for rel, reps in CHANGES.items():
        path = os.path.join(ROOT, rel)
        s = open(path, encoding="utf-8").read()
        if MARK in s:
            print(f"   {rel}: already patched"); continue
        for old, new in reps:
            n = s.count(old)
            if n != 1:
                sys.exit(f"STOP: {rel}: a block to change was found {n} times (expected 1): {old.strip().splitlines()[0][:80]}")
            s = s.replace(old, new)
        plan[path] = s
        print(f"   {rel}: {len(reps)} change(s) {'would apply' if check else 'ready'}")
    if check:
        return
    for path, s in plan.items():
        tmp = path + ".tmp-" + MARK
        open(tmp, "w", encoding="utf-8").write(s)
        os.chmod(tmp, os.stat(path).st_mode)
        os.replace(tmp, path)
        print(f"   patched {os.path.relpath(path, ROOT)}")


if __name__ == "__main__":
    main()
