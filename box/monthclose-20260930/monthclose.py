#!/usr/bin/env python3
"""Month-close: RRR payment check and the checklist (monthclose-20260930).

After an RRR is generated (by the box or the Clerk AI), this script:
  - checks remita.net (read-only, remita-check.cjs) whether the RRR is paid: at once when a payer taps "I've paid" under
    the RRR Telegram message (or sends /paid to the bot), then at the check times (default 10:00, 14:00, 18:00) daily;
  - when Remita shows it paid, tells everyone once: PAID + the month-close checklist (who paid, if someone tapped);
  - 2 days (setting) before the portal closes, if something is still open, sends the checklist as a warning;
  - when everything is done, sends "month-close COMPLETE" once.
Checklist: remittance filed, paid, attendance filed, source docs (Admin + Finance), recorded in the app, CSR (later).

  monthclose.py tick                         every supervisor cycle (cheap unless something is due)
  monthclose.py paid --chat <telegram id> [--month YYYY-MM]    from the bot ("I've paid" button or /paid)
  monthclose.py status [YYYY-MM]             print the checklist (nothing is sent)
  monthclose.py baseline                     (install) mark months that already have an RRR as done

Read-only everywhere: Remita, the portal (source-doc slots, once a day while a month is open), the app (automation
key, GET). Never pays, never files anything. Settings: Automations → Month-close checklist & payment.
"""
import datetime, glob, html, json, os, re, subprocess, sys

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
TOOLS = os.path.join(ROOT, "tools")
REMIT = os.path.join(ROOT, "rccg-remit")
STATE = os.path.join(ROOT, "state", "monthclose.json")
REMIT_STATE = os.path.join(REMIT, "state", "remit-runs.json")
TGSENT = os.path.join(REMIT, "state", "tg-sent.json")
LOG = os.path.join(ROOT, "state", "monthclose.log")
NODE = os.environ.get("MONTHEND_NODE", "node")
PY = sys.executable or "python3"
REMITA = os.path.join(TOOLS, "remita-check.cjs")
MON = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
DEFAULT_PAYERS = ("david", "fabian")
# Same defaults as the app (Automations → People) until the People settings are saved with titles.
DEFAULT_PEOPLE = {"david": {"title": "Finance Officer", "called": "Bro. David"}, "divine": {"title": "Accountant", "called": "Bro. Divine"},
                  "fabian": {"title": "Admin Officer", "called": "Bro. Fabian"}, "pastor": {"title": "Pastor in Charge", "called": "Pastor"}}

sys.path.insert(0, TOOLS)
try:
    import clerkcfg as C
except Exception:
    C = None


def now():
    t = os.environ.get("MONTHCLOSE_NOW")  # tests only
    return datetime.datetime.fromisoformat(t) if t else datetime.datetime.now()


def ml(m):
    y, mm = map(int, m.split("-"))
    return datetime.date(y, mm, 1).strftime("%B %Y")


def esc(s):
    return html.escape(str(s), quote=False)


def naira(x):
    try:
        return f"₦{float(x):,.2f}"
    except Exception:
        return str(x)


def log(text):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, "a") as f:
        f.write(f"{now():%Y-%m-%d %H:%M} {text}\n")


def rjson(p, d=None):
    try:
        return json.load(open(p))
    except Exception:
        return d


def wjson(p, o):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(o, open(p + ".tmp", "w"), indent=1, ensure_ascii=False, default=str)
    os.replace(p + ".tmp", p)


def setting(path, default):
    return C.get("automations.month_close." + path, default) if C else default


# ---------------------------------------------------------------- people (titles from Automations → People)
def people():
    return (C.people() if C else []) or []


def person(key):
    return next((p for p in people() if p.get("key") == key), {"key": key})


def who_label(key):
    """'Bro. Fabian (Admin Officer)': what the person is called + their title, from the app's People settings."""
    p = {**DEFAULT_PEOPLE.get(key, {}), **{k: v for k, v in person(key).items() if v not in (None, "")}}
    called = (p.get("called") or "").strip() or re.sub(r"^.*\((.+)\)\s*$", r"\1", p.get("name") or "").strip() or key.title()
    title = (p.get("title") or "").strip()
    return f"{called} ({title})" if title else called


def payers():
    ps = people()
    if any("pays_rrr" in p for p in ps):
        return [p["key"] for p in ps if p.get("pays_rrr")]
    return list(DEFAULT_PAYERS)


def key_for_chat(chat):
    for p in people():
        if str(p.get("telegram_chat_id") or "") == str(chat):
            return p["key"]
    return {"8910112376": "david"}.get(str(chat))  # before any People are saved


def accountant():
    p = next((p for p in people() if p.get("app_role") == "accountant"), None)
    return who_label(p["key"]) if p else "the Accountant"


# ---------------------------------------------------------------- sending
def run(cmd, env=None, timeout=300):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=dict(os.environ, **env) if env else None)
        return r.returncode, r.stdout, r.stderr
    except Exception as e:
        return 127, "", str(e)


def tg(who, text, key):
    if not who:
        return
    rc, out, err = run([PY, os.path.join(ROOT, "telegram", "send_msg.py"), who, text, "--guard", TGSENT, "--key", key], timeout=180)
    if rc:
        log(f"telegram {key} failed: {(err or out)[-150:]}")


def everyone_tg():
    default = ",".join(p["key"] for p in people()) or "david,divine,fabian,pastor"
    return C.who("month_close", default) if C else default


def email_all(subject, text):
    to = [p.get("email") for p in people() if p.get("email")]
    if not to:
        return
    pf = os.path.join(ROOT, "state", "monthclose-out", f"mail-{now():%Y%m%d-%H%M%S-%f}.json")
    body_html = "<div style='font-family:Arial,sans-serif;font-size:15px;line-height:1.5'>" + text.replace("\n", "<br>") + "</div>"
    plain = re.sub(r"<[^>]+>", "", text)
    wjson(pf, {"to": to, "subject": subject, "body": plain + "\n\nChurch Clerk", "htmlBody": body_html + "<p>Church Clerk</p>"})
    rc, out, err = run([PY, os.path.join(TOOLS, "mailer.py"), "send", "--payload", pf], env={"CLERK_MSG_TYPE": "month_close"}, timeout=180)
    if rc:
        log(f"email '{subject}' failed: {(err or out)[-150:]}")


def announce(m, kind, title, text):
    """One message to everyone (Telegram + email), once per month and kind."""
    tg(everyone_tg(), text, f"monthclose:{m}:{kind}")
    email_all(f"Kingdom Parish: {title}", text)
    log(f"{m} SENT {kind}")


# ---------------------------------------------------------------- facts
def months_with_rrr():
    """{month: {"rrr", "amount", "entry"}} for Kingdom months with an RRR (box or Clerk AI), newest first."""
    runs = rjson(REMIT_STATE, {}) or {}
    out = {}
    for f in sorted(glob.glob(os.path.join(REMIT, "runs", "rrr-????-??.json")), reverse=True):
        m = os.path.basename(f)[4:11]
        d = rjson(f, {}) or {}
        inv = (d.get("invoices") or [{}])[0] or {}
        deb = (inv.get("debits") or [{}])[0] or {}
        if deb.get("RRR"):
            entry = next((e for e in runs.values() if isinstance(e, dict) and e.get("month") == m), {})
            out[m] = {"rrr": deb["RRR"], "amount": deb.get("amountWithFee") or inv.get("amount"), "entry": entry,
                      "generated": d.get("readAt"), "portal_status": deb.get("paymentStatus") or inv.get("paymentStatus")}
    return out


def app_recorded(m, info):
    """Has the Accountant recorded this payment in the app (Remittances, status paid, same period end)?"""
    end = None
    for k, e in (rjson(REMIT_STATE, {}) or {}).items():
        if isinstance(e, dict) and e.get("month") == m and ".." in k:
            end = k.split("..")[1]
    try:
        sys.path.insert(0, TOOLS)
        import monthinfo as MI
        rems = MI.app_get("remittances") or []
        if not end:
            s = MI.app_get("settings")
            p = MI.period_for_month(s, m)
            end = p[1].isoformat() if p else None
        return any(r.get("status") == "paid" and str(r.get("periodTo") or "")[:10] == end for r in rems if isinstance(r, dict)) if end else None
    except Exception:
        return None


def srcdoc(m, st):
    """Kingdom Parish source-doc slots for the portal month m and the portal's closing date, read at most once a day."""
    today = now().date().isoformat()
    c = st.setdefault("_srcdoc", {})
    if c.get("day") == today and m in c.get("months", {}):
        return c["months"][m]
    res = {"admin": None, "finance": None, "closes": None}
    try:
        import clerkinfo as ci
        y, mm = m.split("-")
        for lab, mo, yr, p, state, end in ci.srcdoc_slots(["602757"]):
            if p != "602757" or not mo or str(yr) != y or str(mo)[:3].lower() != MON[int(mm) - 1].lower():
                continue
            res[str(lab).lower()] = state
            if end:
                res["closes"] = min(filter(None, [res["closes"], end[:10]]))
    except Exception as e:
        log(f"{m} source-doc check failed: {e}")
    c.update(day=today, months={**(c.get("months") if c.get("day") == today else {}), m: res})
    return res


def checklist(m, info, rec, sd):
    """[(done: True/False/None, text)] and whether everything is done."""
    e = info["entry"]
    a = (e.get("attendance") or {}) if isinstance(e, dict) else {}
    items = [(True, f"Remittance filed on the portal · RRR {info['rrr']}")]
    paid = rec.get("paid")
    items.append((bool(paid), "Paid" + (f" ({who_label(paid['by'])})" if paid and paid.get("by") else " (payer not recorded)" if paid else " (not yet on Remita)")))
    att_ok = a.get("exit") in (0, 12)
    items.append((att_ok if a else None, "Attendance filed" if att_ok else ("Attendance: the portal differs from the app" if a.get("exit") == 16 else "Attendance not filed yet")))
    if setting("items.source_docs", True):
        for sec in ("finance", "admin"):
            s = sd.get(sec)
            items.append((s == "uploaded" if s else None, f"Source docs, {sec.title()}: " + ({"uploaded": "uploaded", "EMPTY": "NOT uploaded yet"}.get(s, "couldn't check") if s else "couldn't check")))
    if setting("items.app_record", True):
        r = app_recorded(m, info)
        items.append((r, "Payment recorded in the app" if r else f"Payment not yet recorded in the app ({accountant()})"))
    if setting("items.csr", False):
        items.append((None, "CSR report (not set up yet)"))
    done = all(x is True for x, _ in items if not _.startswith("CSR"))
    return items, done


def render(items):
    return "\n".join(("✅ " if d is True else "⚠️ " if d is False else "⏳ ") + esc(t) for d, t in items)


# ---------------------------------------------------------------- Remita
def remita(rrr):
    if os.environ.get("MONTHCLOSE_TEST_REMITA"):
        return json.loads(os.environ["MONTHCLOSE_TEST_REMITA"])
    rc, out, err = run([NODE, REMITA, rrr], timeout=150)
    try:
        return json.loads(out.strip().splitlines()[-1])
    except Exception:
        return {"paid": None, "message": (err or out or "no answer")[-120:]}


def mark_paid(m, info, rec, via):
    presses = rec.get("presses") or []
    by = presses[-1]["who"] if presses else None
    rec["paid"] = {"at": now().isoformat(timespec="seconds"), "by": by, "via": via}
    sd = srcdoc(m, _STATE) if setting("items.source_docs", True) else {}
    items, done = checklist(m, info, rec, sd)
    who = f"Paid by {who_label(by)}" if by else "Paid (nobody tapped \"I've paid\", so the payer isn't recorded)"
    closes = sd.get("closes")
    text = (f"✅ <b>{esc(ml(m))} remittance PAID</b>\nRRR {esc(info['rrr'])} · {esc(naira(info['amount']))}\n{esc(who)} "
            f"(confirmed on Remita, {now():%a %-d %b %H:%M})\n\n<b>Month-close checklist</b>"
            + (f" (portal closes {esc(closes)})" if closes else "") + "\n" + render(items))
    if setting("items.app_record", True) and not any(d and t.startswith("Payment recorded") for d, t in items):
        text += f"\n\n{esc(accountant())}: please record the payment in the app (Remittances)."
    announce(m, "paid", f"{ml(m)} remittance paid", text)
    if done:
        rec["complete_sent"] = True  # the checklist above already shows everything done


def check_payment(m, info, rec, reason):
    r = remita(info["rrr"])
    rec.setdefault("checks", []).append({"at": now().isoformat(timespec="seconds"), "why": reason, "paid": r.get("paid"), "msg": r.get("message")})
    rec["checks"] = rec["checks"][-30:]
    log(f"{m} REMITA {reason} rrr={info['rrr']} paid={r.get('paid')} {r.get('message', '')[:80]}")
    if r.get("paid") is True and not rec.get("paid"):
        mark_paid(m, info, rec, "remita")
    return r


# ---------------------------------------------------------------- commands
_STATE = {}


def load():
    global _STATE
    _STATE = rjson(STATE, {}) or {}
    return _STATE


def save():
    wjson(STATE, _STATE)


def cmd_paid(chat, month=None):
    load()
    who = key_for_chat(chat)
    if not who or who not in payers():
        if who:
            tg(who, "Only the people who pay the RRR can confirm a payment (Automations → People → Pays the RRR).", f"monthclose:deny:{now():%Y%m%d%H%M%S}")
        return 3
    mo = months_with_rrr()
    m = month if month in mo else next((x for x in mo if not (_STATE.get(x) or {}).get("paid") and not (_STATE.get(x) or {}).get("baseline")), next(iter(mo), None))
    if not m:
        tg(who, "There is no unpaid RRR waiting." if not month else f"No RRR found for {esc(month)}.", f"monthclose:none:{now():%Y%m%d%H%M%S}")
        return 0
    info, rec = mo[m], _STATE.setdefault(m, {})
    if rec.get("paid"):
        tg(who, f"✅ {esc(ml(m))} is already confirmed paid ({esc(who_label(rec['paid']['by']) if rec['paid'].get('by') else 'payer not recorded')}).", f"monthclose:already:{m}:{who}:{now():%Y%m%d%H%M}")
        return 0
    rec.setdefault("presses", []).append({"who": who, "at": now().isoformat(timespec="seconds")})
    save()
    tg(who, f"Checking Remita for RRR {esc(info['rrr'])}… (about a minute)", f"monthclose:checking:{m}:{now():%Y%m%d%H%M%S}")
    r = check_payment(m, info, rec, f"pressed by {who}")
    save()
    if r.get("paid") is not True:
        times = ", ".join(setting("check_times", ["10:00", "14:00", "18:00"]))
        tg(who, f"⏳ Thanks, {esc(who_label(who))}. Remita doesn't show RRR {esc(info['rrr'])} as paid yet.\n"
                f"I'll check again at {esc(times)} each day and tell everyone as soon as it shows.",
           f"monthclose:notyet:{m}:{now():%Y%m%d%H%M%S}")
    return 0


def _hm(s):
    try:
        h, mi = map(int, str(s).split(":"))
        return h, mi
    except Exception:
        return None


def tick():
    if C and not C.get("automations.month_close.enabled", True):
        return
    load()
    t = now()
    today = t.date().isoformat()
    mo = months_with_rrr()
    for m, info in list(mo.items())[:3]:
        rec = _STATE.setdefault(m, {})
        if rec.get("complete_sent"):
            continue
        try:
            gen = datetime.datetime.fromisoformat(str(info.get("generated") or "")[:19])
            if (t - gen).days > 60:
                continue
        except Exception:
            pass
        # payment: at each check time, once a day
        if not rec.get("paid"):
            for slot in setting("check_times", ["10:00", "14:00", "18:00"]):
                hm = _hm(slot)
                key = f"{today} {slot}"
                if hm and (t.hour, t.minute) >= hm and key not in (rec.get("slots") or []):
                    rec.setdefault("slots", []).append(key)
                    rec["slots"] = rec["slots"][-40:]
                    check_payment(m, info, rec, f"scheduled {slot}")
                    save()
                    break
        # once a day after 10:00: the warning before the portal closes, and the completion message
        if t.hour >= 10 and rec.get("day_checked") != today:
            rec["day_checked"] = today
            sd = srcdoc(m, _STATE) if setting("items.source_docs", True) else {}
            items, done = checklist(m, info, rec, sd)
            closes = sd.get("closes")
            if done and rec.get("paid") and setting("complete_message", True):
                announce(m, "complete", f"{ml(m)} month-close complete", f"🎉 <b>{esc(ml(m))} month-close COMPLETE</b>\n" + render(items))
                rec["complete_sent"] = True
            elif closes and not rec.get("warned"):
                days = (datetime.date.fromisoformat(closes) - t.date()).days
                if 0 <= days <= int(setting("warn_days", 2)) and not done:
                    open_items = [x for d, x in items if d is not True and not x.startswith("CSR")]
                    announce(m, "warning", f"{ml(m)}: portal closes {closes}",
                             f"⏰ <b>{esc(ml(m))}: portal closes {esc(closes)}</b> ({days} day{'s' if days != 1 else ''})\n" + render(items)
                             + ("\n\nStill to do: " + esc("; ".join(open_items)) if open_items else ""))
                    rec["warned"] = True
            save()
    save()


def baseline():
    """At install: months that already have an RRR are treated as done, so nobody gets old news."""
    load()
    for m in months_with_rrr():
        if m not in _STATE:
            _STATE[m] = {"baseline": now().isoformat(timespec="seconds"), "complete_sent": True}
            print(f"{m}: already had its RRR before month-close was installed; not followed")
    save()


def status(month=None):
    load()
    mo = months_with_rrr()
    m = month or next(iter(mo), None)
    if not m or m not in mo:
        print("No RRR found" + (f" for {month}" if month else "") + ".")
        return
    items, done = checklist(m, mo[m], _STATE.get(m) or {}, srcdoc(m, _STATE) if setting("items.source_docs", True) else {})
    print(f"{ml(m)} month-close (RRR {mo[m]['rrr']})\n" + re.sub(r"<[^>]+>", "", render(items)) + ("\nAll done." if done else ""))


if __name__ == "__main__":
    a = sys.argv[1:]
    opt = lambda n: a[a.index(n) + 1] if n in a and a.index(n) + 1 < len(a) else None
    if a[:1] == ["tick"]:
        tick()
    elif a[:1] == ["paid"]:
        sys.exit(cmd_paid(opt("--chat"), opt("--month")))
    elif a[:1] == ["baseline"]:
        baseline()
    elif a[:1] == ["status"]:
        status(a[1] if len(a) > 1 else None)
    else:
        print(__doc__)
        sys.exit(2)
# monthclose-20260930
