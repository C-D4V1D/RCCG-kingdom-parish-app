#!/usr/bin/env python3
"""checkpeople-20261003: the Kingdom remittance check (email + Telegram) goes to whoever Automations routes
remittance_check to, each person their own copy once, with buttons only for people with buttons on AND a signed link.

  python3 patch.py --check   only check that every change applies (changes nothing)
  python3 patch.py           apply (safe to run twice: files that already have the marker are skipped)

Changes (text replacements, each must match exactly once; needs c2fix-20261003 installed first):
  tools/clerkcfg.py               new check_people(channel, default): Kingdom people with remittance_check switched on
                                  for "email" / "telegram" in Automations (people order, each once); `default` (David,
                                  Bro. Divine, the pastor) without settings.
  rccg-remit/make-check-email.py  one email per person from check_people("email") (anyone in Kingdom Parish with an
                                  address, not only David / Bro. Divine / the pastor); "who can confirm" wording from the
                                  people with buttons (same words as before for David + Bro. Divine).
  telegram/tg_msgs.py             check messages for check_people("telegram"); buttons only for buttons-on people with a
                                  signed link, everyone else the information-only text.
  tools/monthend.py               send_checks() sends exactly the people make-check-email.py wrote (check-summary.json
                                  "recipients"; the old three when it is missing), once each per round.
"""
import os, sys

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "checkpeople-20261003"

CHANGES = {
"tools/clerkcfg.py": [
('''def button_emails():  # c2fix-20261003
''',
'''def check_people(channel, default=("david", "divine", "pastor")):  # checkpeople-20261003
    """Kingdom people who get their own remittance check on `channel` ("email" or "telegram"): remittance_check routing
    in Automations, in the app's people order, each once. `default` without a config or without that routing."""
    r = _routing("remittance_check")
    if r is None:
        return list(default)
    out = []
    for p in people():
        if p["key"] not in out and (r.get(p["key"]) or {}).get(channel):
            out.append(p["key"])
    return out


def button_emails():  # c2fix-20261003
'''),
],
"rccg-remit/make-check-email.py": [
('''      [--recipient all|david|divine|pastor]
''',
'''      [--recipient all|<person key>]
'''),
('''  pastor/  (henryofunne2@gmail.com)      no buttons, only a note that David or Bro. Divine confirm
''',
'''  pastor/  (henryofunne2@gmail.com)      no buttons, only a note that David or Bro. Divine confirm
  (checkpeople-20261003: that is the default; with Automations settings it is everyone switched on for the
  remittance check by email, one folder each; buttons only for people with buttons on and a signed link)
'''),
('''ap.add_argument('--recipient', choices=['all', 'david', 'divine', 'pastor'], default='all')
''',
'''ap.add_argument('--recipient', default='all', help='all (everyone the Automations settings route the check to) or one person key')
'''),
('''                RECIPIENTS[_p['key']] = (str(_p.get('email') or _a).strip(), _n, bool(_p.get('buttons')))
except Exception:
    pass
''',
'''                RECIPIENTS[_p['key']] = (str(_p.get('email') or _a).strip(), _n, bool(_p.get('buttons')))
            elif _p.get('key'):  # checkpeople-20261003: anyone else in Kingdom Parish: their own address and buttons flag
                RECIPIENTS[_p['key']] = (str(_p.get('email') or '').strip(),
                                         str(_p.get('called') or _p.get('name') or _p['key']).strip(), bool(_p.get('buttons')))
except Exception:
    _C = None
'''),
('''WHOS = ['david', 'divine', 'pastor'] if args.recipient == 'all' else [args.recipient]
''',
'''_ALL = ['david', 'divine', 'pastor']  # checkpeople-20261003: everyone routed remittance_check by email, each once
try:
    if _C is not None: _ALL = _C.check_people('email', _ALL)
except Exception:
    pass
_ALL = [w for i, w in enumerate(_ALL) if w in RECIPIENTS and RECIPIENTS[w][0] and w not in _ALL[:i]]
if args.recipient != 'all' and args.recipient not in RECIPIENTS:
    sys.exit(f'--recipient {args.recipient}: not a Kingdom Parish person in Automations')
WHOS = _ALL if args.recipient == 'all' else [args.recipient]
'''),
('''                check_link((LINKS.get(w) or {}).get(a), w, a, RUN_MONTH, False)
''',
'''                check_link((LINKS.get(w) or {}).get(a), w, a, RUN_MONTH, False)
# checkpeople-20261003: who can confirm = people with buttons on (and a signed link, when links were loaded)
CONF = [k for k, v in RECIPIENTS.items() if v[2] and (not LINKS or LINKS.get(k))]
def _or(xs): return xs[0] if len(xs) == 1 else ', '.join(xs[:-1]) + ' or ' + xs[-1]
if not CONF or set(CONF) == {'david', 'divine'}:
    CONF_LONG, CONF_SHORT = 'David or the accountant (Bro. Divine Faith)', 'David or Bro. Divine'
else:
    CONF_LONG = CONF_SHORT = _or([RECIPIENTS[k][1] for k in CONF])
'''),
('''                    'pastor': 'David or Bro. Divine will confirm the next step (see below).'}
''',
'''                    'pastor': f'{CONF_SHORT} will confirm the next step (see below).'}
'''),
('''                     'pastor': 'David or Bro. Divine will confirm the next step (details below)'}
''',
'''                     'pastor': f'{html.escape(CONF_SHORT, quote=False)} will confirm the next step (details below)'}
'''),
('''        return ("For information only: David or the accountant (Bro. Divine Faith) will confirm Generate RRR or Refresh with "
''',
'''        return (f"For information only: {CONF_LONG} will confirm Generate RRR or Refresh with "
'''),
('''    return (first + " Only David or the accountant (Bro. Divine Faith) can confirm; the first confirmation is acted on and the "
''',
'''    return (first + f" Only {CONF_LONG} can confirm; the first confirmation is acted on and the "
'''),
('''            + ". The pastor gets this check for information only." + until)
''',
'''            + (". The pastor gets this check for information only." if 'pastor' in _ALL and not RECIPIENTS['pastor'][2] else ".") + until)
'''),
],
"telegram/tg_msgs.py": [
('''    for who, other in (('david', 'Bro. Divine'), ('divine', 'David')):
        msgs[who] = {'text': '\\n'.join(lines + ['', f"<b>Next step:</b> {step}",
                                                f"Your buttons are personal. The first confirmation (you or {other}) is the one acted on.",
                                                'Full details in your email.']), 'buttons': buttons(L, who, ym, False)}
    msgs['pastor'] = {'text': '\\n'.join(lines + ['', 'For information only: David or Bro. Divine will confirm. No action needed.',
                                                 'Full details in your email.'])}
''',
'''    # checkpeople-20261003: everyone routed remittance_check on Telegram in Automations gets their own message, once;
    # buttons only for people with buttons on AND a signed link (without settings: David + Bro. Divine, the pastor info)
    TGN, WHOS, BTN = {'david': 'David', 'divine': 'Bro. Divine'}, ['david', 'divine', 'pastor'], {'david', 'divine'}
    try:
        sys.path.insert(0, '/workspace/tools'); import clerkcfg as _C
        if _C.config() is not None:
            WHOS = _C.check_people('telegram', WHOS)
            BTN = {p['key'] for p in _C.people() if p.get('buttons')}
            for p in _C.people(): TGN.setdefault(p['key'], str(p.get('called') or p.get('name') or p['key']))
    except Exception:
        pass
    WHOS = list(dict.fromkeys(WHOS))
    CONF = [k for k in TGN if k in BTN and (L.get('links') or {}).get(k)]
    def _or(xs): return xs[0] if len(xs) == 1 else ', '.join(xs[:-1]) + ' or ' + xs[-1]
    for who in WHOS:
        if who in CONF:
            first = _or(['you'] + [TGN[k] for k in CONF if k != who])
            msgs[who] = {'text': '\\n'.join(lines + ['', f"<b>Next step:</b> {step}",
                                                    f"Your buttons are personal. The first confirmation ({E(first)}) is the one acted on.",
                                                    'Full details in your email.']), 'buttons': buttons(L, who, ym, False)}
        else:
            msgs[who] = {'text': '\\n'.join(lines + ['', f"For information only: {E(_or([TGN[k] for k in CONF]) if CONF else 'David or Bro. Divine')} will confirm. No action needed.",
                                                    'Full details in your email.'])}
'''),
],
"tools/monthend.py": [
('''    for who in ("david", "divine", "pastor"):
        pf = os.path.join(outdir, who, "payload.json")
''',
'''    S = rjson(os.path.join(outdir, "check-summary.json"), {}) or {}  # checkpeople-20261003: whoever make-check-email wrote
    whos = list(dict.fromkeys(S["recipients"])) if isinstance(S.get("recipients"), list) else ["david", "divine", "pastor"]
    btn = {r.get("who"): bool(r.get("buttons")) for r in (rjson(os.path.join(outdir, "recipients.json"), []) or []) if isinstance(r, dict)}
    for who in whos:
        pf = os.path.join(outdir, who, "payload.json")
'''),
('''        sent[who] = done[who] = {"to": to, "subject": subject, "sentAt": now().isoformat(timespec="seconds"), "method": "smtp"}
''',
'''        sent[who] = done[who] = {"to": to, "subject": subject, "sentAt": now().isoformat(timespec="seconds"), "method": "smtp",
                                 "buttons": btn.get(who, who in ("david", "divine"))}
'''),
('''        if who in ("david", "divine"):
            body += " If the figures should be re-read, press Refresh in your check email."
''',
'''        if rec.get("buttons", who in ("david", "divine")):  # checkpeople-20261003
            body += " If the figures should be re-read, press Refresh in your check email."
'''),
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
