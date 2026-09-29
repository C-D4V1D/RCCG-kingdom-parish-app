#!/usr/bin/env python3
"""Satellite parishes' month-close on the Clerk box (parishes-20261003): Kingdom's monthclose.py, per parish.

After a parish's RRR is generated (satmonthend.py), this checks Remita (read-only) at the check times and when a payer
taps "I've paid", then tells the parish's people and the copies: PAID + the checklist, the warning before the portal
closes, and "month-close COMPLETE". Same settings as Kingdom (Automations → Month-close checklist & payment), except the
"recorded in the app" item, which a parish doesn't have.

  satclose.py tick                                   every supervisor cycle, every active parish
  satclose.py paid --parish CODE --chat ID [--month YYYY-MM]   the "I've paid" button (from satbot.py)
  satclose.py status CODE [YYYY-MM]                  print the checklist (nothing is sent)
"""
import datetime, os, sys

TOOLS = os.environ.get("CLERK_TOOLS", "/workspace/tools")
sys.path.insert(0, TOOLS)
import monthclose as MC  # noqa: E402
import satinfo as S  # noqa: E402

_ORIG = {k: getattr(MC, k) for k in ("REMIT", "STATE", "REMIT_STATE", "TGSENT", "people", "payers", "everyone_tg", "announce",
                                      "ml", "srcdoc", "setting", "email_all")}


def use(P):
    """Point monthclose.py at one parish (its folder, state, people, payers and name)."""
    for k, v in _ORIG.items():
        setattr(MC, k, v)
    MC.REMIT = P.remit
    MC.STATE = os.path.join(MC.ROOT, "state", f"monthclose-{P.code}.json")
    MC.REMIT_STATE = os.path.join(P.remit, "state", "remit-runs.json")
    MC.TGSENT = os.path.join(P.remit, "state", "tg-sent.json")
    keys = set(P.keys()) | set(P.copies())
    MC.people = lambda: [p for p in S.C.all_people() if p.get("key") in keys]
    MC.payers = lambda: P.keys("pays_rrr")
    MC.everyone_tg = lambda: ",".join(dict.fromkeys([k for k in P.keys() if S.routed(k, "month_close")] + P.copies()))
    MC.ml = lambda m: f"{P.name} {_ORIG['ml'](m)}"
    MC.setting = lambda path, default: False if path == "items.app_record" else _ORIG["setting"](path, default)

    def email_all(subject, text):
        to = [S.person(k).get("email") for k in P.keys() if S.routed(k, "month_close", "email")] + \
             [S.person(k).get("email") for k in P.copies()]
        S.email(to, subject, text)
    MC.email_all = email_all

    def announce(m, kind, title, text):
        MC.tg(MC.everyone_tg(), text, f"monthclose:{P.code}:{m}:{kind}")
        email_all(f"{P.name}: {title.replace(P.name + ' ', '')}", text)
        MC.log(f"{P.code} {m} SENT {kind}")
    MC.announce = announce

    def srcdoc(m, st):
        """The parish's source-doc slots for month m and the portal's closing date, read at most once a day."""
        today = MC.now().date().isoformat()
        c = st.setdefault("_srcdoc", {})
        if c.get("day") == today and m in c.get("months", {}):
            return c["months"][m]
        res = {"admin": None, "finance": None, "closes": None}
        try:
            import clerkinfo as ci
            y, mm = m.split("-")
            for lab, mo, yr, p, state, end in ci.srcdoc_slots([P.code]):
                if p != P.code or not mo or str(yr) != y or str(mo)[:3].lower() != MC.MON[int(mm) - 1].lower():
                    continue
                res[str(lab).lower()] = state
                if end:
                    res["closes"] = min(filter(None, [res["closes"], end[:10]]))
        except Exception as e:
            MC.log(f"{P.code} {m} source-doc check failed: {e}")
        c.update(day=today, months={**(c.get("months") if c.get("day") == today else {}), m: res})
        return res
    MC.srcdoc = srcdoc


def tick():
    for P in S.parishes():
        if not P.people or not os.path.isdir(os.path.join(P.remit, "runs")):
            continue
        try:
            use(P)
            MC.tick()
        except Exception as e:
            print(f"{datetime.datetime.now():%F %H:%M} satclose {P.code}: {type(e).__name__}: {e}"[:300])


def paid(code, chat, month=None):
    P = S.Parish(code)
    use(P)
    return MC.cmd_paid(chat, month)


if __name__ == "__main__":
    a = sys.argv[1:]
    opt = lambda n: a[a.index(n) + 1] if n in a and a.index(n) + 1 < len(a) else None
    if a[:1] == ["tick"]:
        tick()
    elif a[:1] == ["paid"] and opt("--parish") and opt("--chat"):
        sys.exit(paid(opt("--parish"), opt("--chat"), opt("--month")))
    elif a[:1] == ["status"] and len(a) > 1:
        use(S.Parish(a[1]))
        MC.status(a[2] if len(a) > 2 else None)
    else:
        print(__doc__)
        sys.exit(2)
# parishes-20261003
