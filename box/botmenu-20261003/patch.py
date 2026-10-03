#!/usr/bin/env python3
r"""botmenu-20261003: the Telegram bot's menus, screens and wording.

  python3 patch.py --check   only check that every change applies (changes nothing)
  python3 patch.py           apply (all or nothing; safe to run twice: files that already have the marker are skipped)

New file tools/botmenu.py (installed by install.sh). Changes (each anchor must match exactly once; every patched file
must compile, or nothing is written). New definitions are added after the old ones and replace them (the old code stays
in the file, unused, like the earlier menu-refine change did):
  tools/clerkcfg.py          bot_settings(): automations.telegram_bot over the defaults; parish_name()
  tools/monthinfo.py         the one /month screen (header, Sunday records, REMITTANCE, ATTENDANCE FILING, SOURCE
                             DOCUMENTS, Next step); same icons and date style; names from Automations -> People
                             (who_for), never hard-coded; facts() also adds up the period's collections (one app read)
  tools/clerkinfo.py         slots_lines() (source-document slots, one style); att_lines() wording
  tools/satinfo.py           a satellite parish's names / wording for the same screen (no email or Automations jargon)
  tools/satbot.py            help per person, the month screen (+ slots button), /status = /month, `slots`
  telegram/srcdoc/poller.py  per-person menus (setMyCommands per chat, re-sent only when they change), audiences for
                             typed commands and buttons, /month screen, /upload, /system, /statement 2026-09, one
                             polite reply a day to people the bot doesn't know
"""
import os, py_compile, shutil, sys, tempfile

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "botmenu-20261003"

# ------------------------------------------------------------------------------------------------ tools/clerkcfg.py
CLERKCFG_NEW = r'''

# ---------------- Telegram bot menus (botmenu-20261003) ----------------
BOT_DEFAULTS = {"menu": {"month": "everyone", "upload": "everyone", "paid": "payers", "statement": "kingdom",
                         "balance": "kingdom", "refresh": "admin", "system": "admin", "help": "everyone"},
                "previous_months": 6, "month_portal_check": "button", "reply_unknown": True,
                "unknown_contact": "the parish IT administrator"}
BOT_AUDIENCES = ("everyone", "kingdom", "payers", "admin", "off")


def bot_settings():
    """automations.telegram_bot from the app merged over BOT_DEFAULTS (each value checked); the defaults when there is
    no config, it is the unsaved default, or anything is invalid."""
    out = json.loads(json.dumps(BOT_DEFAULTS))
    try:
        s = get("automations.telegram_bot", None)
        if not isinstance(s, dict):
            return out
        m = s.get("menu")
        if isinstance(m, dict):
            for k in out["menu"]:
                if m.get(k) in BOT_AUDIENCES:
                    out["menu"][k] = m[k]
        n = s.get("previous_months")
        if isinstance(n, (int, float)) and not isinstance(n, bool):
            out["previous_months"] = max(3, min(12, int(n)))
        if s.get("month_portal_check") in ("button", "always", "off"):
            out["month_portal_check"] = s["month_portal_check"]
        if isinstance(s.get("reply_unknown"), bool):
            out["reply_unknown"] = s["reply_unknown"]
        c = s.get("unknown_contact")
        if isinstance(c, str) and c.strip():
            out["unknown_contact"] = " ".join(c.split())[:120]
    except Exception:
        pass
    return out


def parish_name(code, default=None):
    """A parish's name from Automations -> Parishes ("KINGDOM PARISH" is shown as "Kingdom Parish")."""
    code = str(code)
    try:
        p = next((p for p in (config() or {}).get("parishes") or [] if isinstance(p, dict) and str(p.get("code")) == code), None)
        n = str((p or {}).get("name") or "").strip()
    except Exception:
        n = ""
    n = n or default or ("Kingdom Parish" if code == "602757" else f"Parish {code}")
    if n.isupper():
        n = " ".join(w.lower() if i and w.lower() in ("of", "and") else w.capitalize() for i, w in enumerate(n.split()))
    return n


def sections(default):
'''

# ------------------------------------------------------------------------------------------------ tools/monthinfo.py
MONTHINFO_FACTS_TOTAL = r'''    have = {str(r.get("date"))[:10] for r in income if isinstance(r, dict) and r.get("source") in SUNDAY_SOURCES}
    total = 0.0  # botmenu-20261003: the period's Sunday collections, from the same read of the app
    for r in income:
        try:
            if isinstance(r, dict) and r.get("source") in SUNDAY_SOURCES and start <= _d(r.get("date")) <= end:
                total += float(r.get("totalCollection") or 0)
        except Exception:
            pass
'''

MONTHINFO_SCREEN = r'''

# ---------------------------------------------------------------- botmenu-20261003: the one /month screen (both bots)
# The definitions below replace month_end_line, attendance_line, next_step and month_text above. People are never named
# in the code: who_for() reads Automations -> People. satinfo.use() sets a satellite parish's own who_for, AUDIENCE
# ("satellite": no email / Automations wording) and PARISH_NAME.
AUDIENCE = "kingdom"
PARISH_NAME = None
ROLE_WORDS = {"records": "the Accountant", "check": "the finance team", "payers": "the RRR payer",
              "admin": "the IT administrator"}


def _cfg():
    here = os.path.dirname(os.path.abspath(__file__))
    if here not in sys.path:
        sys.path.insert(0, here)
    import clerkcfg
    return clerkcfg


def day(d):
    """The one date style: 'Sun 27 Sep'."""
    try:
        d = _d(d) if not isinstance(d, datetime.date) else d
        return f"{d:%a} {d.day} {MON[d.month - 1]}"
    except Exception:
        return str(d)


def naira(x):
    try:
        return f"₦{float(x):,.2f}"
    except Exception:
        return str(x)


def _join(names):
    names = [n for n in dict.fromkeys(names) if n]
    if not names:
        return ""
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " or " + names[-1]


def _cap(s):
    return s[:1].upper() + s[1:]


def _called(p):
    import re
    c = str(p.get("called") or "").strip()
    if c:
        return c
    m = re.match(r"^.*\((.+)\)\s*$", str(p.get("name") or ""))
    return m.group(1).strip() if m else (str(p.get("name") or "").split() or [str(p.get("key") or "").title()])[0]


def who_for(role):
    """Who does a step, from Automations -> People: records (the accountant), check (people with the Generate RRR
    button who get the remittance check), payers (pay the RRR), admin (full status). A role word when nobody is set."""
    try:
        C = _cfg()
        ps = C.people() or []
        if role == "records":
            sel = [p for p in ps if p.get("app_role") == "accountant"]
        elif role == "check":
            keys = set(C.check_people("email")) | set(C.check_people("telegram"))
            sel = [p for p in ps if p.get("buttons") and p.get("key") in keys]
        elif role == "payers":
            try:
                import monthclose
                keys = set(monthclose.payers())
            except Exception:
                keys = {p.get("key") for p in ps if p.get("pays_rrr")}
            sel = [p for p in ps if p.get("key") in keys]
        elif role == "admin":
            sel = [p for p in ps if p.get("full_status")]
        else:
            sel = []
        names = _join(_called(p) for p in sel)
    except Exception:
        names = ""
    return names or ROLE_WORDS.get(role, "someone")


def _person_called(key):
    try:
        p = next((p for p in _cfg().all_people() if p.get("key") == key), None)
        return _called(p) if p else str(key).title()
    except Exception:
        return str(key).title()


def _kingdom_name():
    try:
        return _cfg().parish_name("602757")
    except Exception:
        return "Kingdom Parish"


def _paid(f):
    try:
        return (json.load(open(MONTHCLOSE_STATE)).get(f["month"]) or {}).get("paid")
    except Exception:
        return None


def rrr_info(f):
    """The month's RRR {"code", "amount"} from the month-end record or the saved RRR file (Clerk AI months too), or {}."""
    r = f["entry"].get("rrr") if isinstance(f["entry"].get("rrr"), dict) else {}
    code, amount = r.get("code"), None
    try:
        p = os.path.join(os.path.dirname(os.path.dirname(REMIT_STATE)), r.get("file") or f"runs/rrr-{f['month']}.json")
        d = json.load(open(p))
        inv = (d.get("invoices") or [{}])[0] or {}
        deb = (inv.get("debits") or [{}])[0] or {}
        code = code or deb.get("RRR")
        amount = deb.get("amountWithFee") or inv.get("amount")
    except Exception:
        pass
    return {"code": code, "amount": amount} if code else {}


def month_end_line(f):
    e, end, today = f["entry"], f["end"], f["today"]
    st = e.get("status")
    cut = next((s for s in f["sundays"] if s["date"] == end), None)
    if not st:
        rrr = rrr_info(f).get("code")
        if rrr:
            return f"✅ RRR {rrr} generated"
        if cut and cut["collection"]:
            if (today - end).days <= 1:
                return "⏳ starting (the cut-off collection was just saved)"
            return "no box run recorded (done outside the automation)"
        if today > end:
            miss = missing_collections(f, before=end + datetime.timedelta(days=1))
            return f"⚠️ not started: waiting for the {', '.join(day(d) for d in miss) or day(end)} collection"
        return f"⏳ starts when the {day(end)} collection is saved"
    rrr = rrr_info(f).get("code")
    sent = e.get("lastCheckSentAt")
    held = ", ".join(c.get("label", c.get("key", "?")) for c in (e.get("hold") or {}).get("categories", []))
    fail = e.get("failure") or {}
    return {
        "filling": "⏳ filing on the portal", "saved": "⏳ filing on the portal",
        "submitted": "⏳ filed on the portal; sending the check",
        "awaiting-reply": "✅ filed" + (f" · check sent {day(str(sent)[:10])}" if sent else "") + " · ⏳ waiting for Generate RRR",
        "refreshing": "⏳ refreshing the check (Refresh was pressed)", "generating": "⏳ generating the RRR",
        "done": f"✅ RRR {rrr} generated" if rrr else "✅ done",
        "failed": f"❌ stopped at {fail.get('step', '?')}: {fail.get('message', '')}",
        "held": f"⚠️ on hold: {held or 'a category'} has no portal line"
                + (" yet; the Area office is sorting it out" if AUDIENCE == "satellite" else " (Automations → Remittance lines)"),
    }.get(st, st)


def attendance_line(f):
    a = f["entry"].get("attendance")
    if not isinstance(a, dict):
        if f["entry"]:
            return "⏳ filed with the month-end run"
        if f["today"] <= f["end"] or (f["today"] - f["end"]).days <= 1:
            return "⏳ filed with the month-end run, after the cut-off collection is saved"
        return "no record on the box (the month-end was done outside the automation)"
    return {0: "✅ filed on the portal", 12: "✅ already on the portal",
            16: "⚠️ filed, but the portal differs from the app (see the check message)",
            10: "⏳ the portal isn't open for it yet", 15: "❌ not filed: something was missing in the app",
            17: "⏳ not filed yet"}.get(a.get("exit"), f"❌ problem (code {a.get('exit')})")


def next_step(f):
    today, end = f["today"], f["end"]
    sat = AUDIENCE == "satellite"
    miss = missing_collections(f)
    att_missing = [s["date"] for s in f["sundays"] if s["date"] < today and s["attendance"] not in ("submitted", "locked")]
    st = f["entry"].get("status")
    if st == "awaiting-reply":
        return _cap(f"{who_for('check')}: check the "
                    + ("Telegram message" if sat else "remittance check message (email or Telegram)")
                    + " and press Generate RRR (or Refresh).")
    if st == "done" or (not st and rrr_info(f).get("code")):
        if _paid(f):
            return "Nothing. The RRR is paid ✅."
        return _cap(f"{who_for('payers')}: pay the RRR, then tap ✅ I've paid under the RRR message (or send /paid).")
    if st == "held":
        return ("Nothing for you: the Area office is adding a missing portal line." if sat else
                _cap(f"{who_for('admin')}: choose the missing portal line in Automations → Settings → Remittance lines, then Save."))
    if st == "failed":
        return ("Nothing for you: the Area office has been told the run stopped." if sat else
                _cap(f"{who_for('admin')}: see the message about the stopped run."))
    if st:
        return "Nothing: ⏳ the Clerk box is working on it."
    cut = next((s for s in f["sundays"] if s["date"] == end), None)
    if today > end and cut and cut["collection"]:
        return "Nothing: ⏳ the Clerk box is starting the month-end." if (today - end).days <= 1 else "Nothing for this month."
    rec = who_for("records")
    if miss:
        return _cap(f"{rec}: record the collection for {', '.join(day(d) for d in miss)}.")
    if att_missing:
        return _cap(f"{rec}: submit the attendance for {', '.join(day(d) for d in att_missing)}.")
    if today < end:
        return f"Nothing yet. The cut-off Sunday is {day(end)}."
    return _cap(f"{rec}: submit the Monthly report and save the {day(end)} collection." if not f["report"]
                else f"{rec}: save the {day(end)} collection.")


def month_text(f, parish=None, srcdoc=None):
    """The /month screen of both bots. srcdoc: ready-made HTML lines for SOURCE DOCUMENTS (None: no section)."""
    E = lambda s: html.escape(str(s), quote=False)
    name = parish or PARISH_NAME or _kingdom_name()
    if f.get("error"):
        return f"📅 <b>{E(name)}</b>\nI couldn't read the month: {E(f['error'])}."
    today = f["today"]
    rows = []
    for s in f["sundays"]:
        later = s["date"] >= today
        c = "✅" if s["collection"] else ("⏳" if later else "❌")
        a = "✅" if s["attendance"] in ("submitted", "locked") else ("⏳" if later else "❌")
        rows.append(f"{nice(s['date']):<8} {c:^10} {a:^10}")
    rep = "✅ submitted" if f["report"] else (
        "⚠️ not submitted yet" if today >= f["end"] - datetime.timedelta(days=6) else "⏳ due before the cut-off collection")
    L = [f"📅 <b>{E(name)} · {E(month_label(f['month']))}</b>",
         f"Period: {day(f['start'])} – {day(f['end'])} (cut-off Sunday)", "",
         "<b>SUNDAY RECORDS</b>",
         "<pre>Sunday   Collection Attendance\n" + E("\n".join(rows)) + "</pre>",
         f"Monthly report: {rep}", "", "<b>REMITTANCE</b>"]
    total = f["total"] if "total" in f else collection_total(f)
    if total is not None:
        L.append(f"• Total collection: {naira(total)}")
    L.append(f"• Month-end: {E(month_end_line(f))}")
    r = rrr_info(f)
    if r.get("code"):
        pay = _paid(f)
        L.append("• Paid: " + (("✅ confirmed on Remita" + (f" ({E(_person_called(pay['by']))})" if pay.get("by") else ""))
                               if pay else "⏳ not confirmed on Remita yet"))
        if r.get("amount"):
            L.append(f"• Amount {'remitted' if pay else 'to remit'}: {naira(r['amount'])}")
    L += ["", "<b>ATTENDANCE FILING</b>", f"• {E(attendance_line(f))}"]
    if srcdoc:
        L += ["", "<b>SOURCE DOCUMENTS</b>"] + list(srcdoc)
    L += ["", f"<b>Next step:</b> {E(next_step(f))}"]
    return "\n".join(L)


CACHE = os.environ.get("MONTHINFO_CACHE", "/workspace/tools/.monthinfo-cache.json")
'''

# ------------------------------------------------------------------------------------------------ tools/clerkinfo.py
CLERKINFO_NEW = r'''

# ---------------- botmenu-20261003: the same icons and dates in both bots (att_lines below replaces the one above)
def _esc(s):
    import html
    return html.escape(str(s), quote=False)


def slots_lines(parishes, names=None):
    """HTML lines for SOURCE DOCUMENTS: per section the open portal month and its closing date, then each parish's slot
    (the parish name only when there is more than one). Slow: it asks the portal."""
    names = names or {}
    out, cur = [], None
    for lab, mo, yr, p, state, end in srcdoc_slots(parishes):
        if p is None:
            out.append(f"{_esc(lab)}: ⚠️ {_esc(state)}"); continue
        if lab != cur:
            cur = lab
            out.append(f"{_esc(lab)} · {_esc(mo)} {_esc(yr)}" + (f" (closes {_esc(_nice(str(end)[:10]))})" if end else ""))
        word = {"uploaded": "✅ uploaded", "EMPTY": "❌ not uploaded yet"}.get(state, "⚠️ " + str(state))
        out.append("• " + (f"{_esc(names.get(p, p))}: " if len(parishes) > 1 else "") + _esc(word))
    return out


def att_lines():
    """Attendance per calendar month (admin's /system). Attendance is filed with the month-end run."""
    runs = _load(f"{ATT}/state/att-runs.json", {}); L = []
    for m in _months():
        y, mm = m.split("-"); lab = f"{MON[int(mm)-1]} {y}"
        if m in runs: L.append(f"{lab}: ✅ filed on the portal"); continue
        try:
            import monthinfo as _MI; _a = _MI.att_filed(m)
            if _a: L.append(f"{lab}: {'⚠️' if 'differs' in _a else '✅'} {_a}"); continue
        except Exception: pass
        d = att_plan(m)
        if not d: L.append(f"{lab}: ⚠️ couldn't check"); continue
        r = (d.get("app") or {}).get("readiness") or {}; p = d.get("portal") or {}
        if p.get("filed"): L.append(f"{lab}: ✅ filed on the portal"); continue
        if r.get("ready"): L.append(f"{lab}: ⏳ everything is in the app; it is filed with the month-end run"); continue
        nr = r.get("notReady") or []
        miss = [_nice(x) for x in re.findall(r"\((\d{4}-\d{2}-\d{2})\) is missing", "; ".join(map(str, nr)))]
        extra = [str(x) for x in nr if "missing" not in str(x)]
        ws = dates_in_window(p.get("window"))
        L.append(f"{lab}: ⏳ not ready. Sundays not yet in the app: {', '.join(miss) or 'none'}"
                 + (f". Also: {'; '.join(extra)}" if extra else "") + (f". Portal closes {_nice(ws[-1])}" if ws else ""))
    return L


def memo_line():
'''

# ------------------------------------------------------------------------------------------------ tools/satinfo.py
SATINFO_ORIG_OLD = r'''_ORIG = {k: getattr(MI, k) for k in ("app_get", "CACHE", "LADDER_STATE", "REMIT_STATE", "MONTHCLOSE_STATE", "records_msg", "next_step")}
'''
SATINFO_ORIG_NEW = r'''_ORIG = {k: getattr(MI, k) for k in ("app_get", "CACHE", "LADDER_STATE", "REMIT_STATE", "MONTHCLOSE_STATE", "records_msg", "next_step",
                                    "who_for", "AUDIENCE", "PARISH_NAME")}  # botmenu-20261003
'''
SATINFO_USE_OLD = r'''    MI.records_msg, MI.next_step = records_msg, next_step
'''
SATINFO_USE_NEW = r'''    MI.records_msg = records_msg
    # botmenu-20261003: next_step takes names from MI.who_for and wording from MI.AUDIENCE (the next_step above is unused)
    MI.AUDIENCE, MI.PARISH_NAME = "satellite", P.name

    def who_for(role):
        if role == "admin":
            return "the Area office"
        keys = P.keys("pays_rrr") if role == "payers" else P.keys()[:1]
        return MI._join([called(k) for k in keys]) or "Pastor"
    MI.who_for = who_for
'''
SATINFO_MONTH_OLD = r'''def month_text(P, month=None):
    use(P)
    try:
        return f"<b>{html.escape(P.name)}</b>\n" + MI.month_text(MI.facts(month=month, prefer_open=True))
    finally:
        use(None)
'''
SATINFO_MONTH_NEW = r'''def month_text(P, month=None, srcdoc=None):  # botmenu-20261003: the same screen as Kingdom's, with the parish's name
    use(P)
    try:
        return MI.month_text(MI.facts(month=month, prefer_open=True), parish=P.name, srcdoc=srcdoc)
    finally:
        use(None)
'''

# ------------------------------------------------------------------------------------------------ tools/satbot.py
SATBOT_NEW = r'''

# ---------------------------------------------------------------- botmenu-20261003: the same screens as Kingdom's bot
# (help_text, month and status below replace the ones above)
_help_text_before_botmenu = help_text


def help_text(P, chat=None):
    """Only the commands this person can use (Automations -> Telegram bot)."""
    if chat is not None:
        try:
            import botmenu as BM
            return BM.help_text(chat)
        except Exception:
            pass
    return _help_text_before_botmenu(P)


def slot_lines(P):
    try:
        import clerkinfo as ci
        return ci.slots_lines([P.code], {P.code: P.name})
    except Exception:
        return ["⚠️ couldn't check the portal right now"]


def month(chat, m=None):
    """The parish's month screen; for this month also the source documents, as Automations -> Telegram bot says."""
    P, _ = S.parish_for_chat(chat)
    if not P:
        return out("You're not linked to a parish yet.")
    src, kb = None, None
    if not m:
        try:
            mode = C.bot_settings().get("month_portal_check", "button")
        except Exception:
            mode = "off"
        if mode == "always":
            src = slot_lines(P)
        elif mode == "button":
            try:
                import botmenu as BM
                src, kb = [esc(BM.SLOTS_NOTE)], BM.slots_kb()
            except Exception:
                pass
    return out(S.month_text(P, m, srcdoc=src), True, kb=kb)


def status(chat):
    """/status is the month screen."""
    return month(chat)


def slots(chat):
    """The "Check upload slots" button: the parish's source-document slots on the portal."""
    P, _ = S.parish_for_chat(chat)
    if not P:
        return out("You're not linked to a parish yet.")
    return out("🔎 <b>SOURCE DOCUMENTS</b> · " + esc(P.name) + "\n" + "\n".join(slot_lines(P)), True)


if __name__ == "__main__":
'''

# ------------------------------------------------------------------------------------------------ telegram/srcdoc/poller.py
POLLER_NEW = r'''

# ---------------- botmenu-20261003: per-person menus and commands, one /month screen, /upload, /system ----------------
# Who may use what comes from the app (Automations -> People and -> Telegram bot) through tools/botmenu.py. The
# definitions below replace the earlier ones of the same name. Without botmenu.py the bot keeps its old behaviour.
try:
    import botmenu as BM
    BM.DEFAULT_PEOPLE, BM.DEFAULT_ADMIN = dict(PEOPLE), DAVID
except Exception as _e:
    BM = None
    log("botmenu import failed, old menus:", repr(_e)[:300])
NOT_AVAILABLE = "This isn't available for you. Use /help to see your commands."
_MENU = {"sig": None, "busy": False, "next": 0.0}
SYS_NAMES = {"memo": "Memo check", "statement": "Monthly statement", "attendance": "Attendance filing",
             "source_doc_reminders": "Source-doc reminders", "upload_bot": "Telegram bot", "drive_sync": "Drive copy",
             "month_end": "Month-end"}


def _bm(fn, *a, default=None):
    if BM is None:
        return default
    try:
        return getattr(BM, fn)(*a)
    except Exception:
        log("botmenu", fn, traceback.format_exc()[-400:]); return default


def _known(chat):
    return bool(_bm("known", chat, default=chat in PEOPLE)) if BM else chat in PEOPLE


def _can(chat, cmd):
    return bool(_bm("allowed", chat, cmd, default=chat in PEOPLE)) if BM else chat in PEOPLE


def _is_sat(chat):
    return chat in SATP or bool((_bm("person", chat) or {}).get("sat"))


def _is_admin(chat):
    return chat == DAVID or bool((_bm("person", chat) or {}).get("admin"))


def _name(chat):
    return PEOPLE.get(chat) or (_bm("person", chat) or {}).get("called") or str(chat)


def _bset(key, default):
    try:
        return C.bot_settings().get(key, default)
    except Exception:
        return default


def _help(chat):
    t = _bm("help_text", chat)
    if t:
        return t
    if chat in SATP:
        return (_satbot("help", "--chat", chat) or {}).get("reply") or HELP
    return HELP


def _send_long(chat, text, kb=None):
    """Telegram allows 4096 characters: split at blank lines; the buttons go under the last part."""
    parts, cur = [], ""
    for block in text.split("\n\n"):
        if cur and len(cur) + len(block) + 2 > 3900:
            parts.append(cur); cur = block
        else:
            cur = cur + "\n\n" + block if cur else block
    parts.append(cur)
    for i, p in enumerate(parts):
        send(chat, p, kb if i == len(parts) - 1 else None, html=True)


def _menus_tick():
    """Every poll: two file stats. When the config or the satellite links changed, the menus are worked out again in the
    background; Telegram is only called when they really changed (botmenu.json keeps a hash). Failures retry hourly."""
    if BM is None or _MENU["busy"]:
        return
    try:
        sig = BM.signature()
    except Exception:
        return
    if sig == _MENU["sig"] and time.time() < _MENU["next"]:
        return
    _MENU.update(sig=sig, busy=True, next=float("inf"))

    def run():
        try:
            ok, msg = BM.apply_menus(api)
            if msg != "unchanged":
                log("menus:", msg)
            if not ok:
                _MENU["next"] = time.time() + 3600
        except Exception:
            log("menus error", traceback.format_exc()[-400:]); _MENU["next"] = time.time() + 3600
        finally:
            _MENU["busy"] = False
    threading.Thread(target=run, daemon=True).start()


def kb_recent_months():
    import monthinfo as MI
    months = _recent_months(int(_bset("previous_months", 6)))
    rows = [[{"text": MI.month_label(ym), "callback_data": f"month|go|{ym}"} for ym in months[i:i + 2]]
            for i in range(0, len(months), 2)]
    rows.append([{"text": "« Back", "callback_data": "month|back|"}])
    return rows


def _slot_lines(chat):
    codes = [p for p, _ in PARISHES] if _is_admin(chat) else ["602757"]
    try:
        return _ci().slots_lines(codes, {c: PNAME[c].title() for c in codes if c in PNAME})
    except Exception:
        log("slots error", traceback.format_exc()[-400:]); return ["⚠️ couldn't check the portal right now"]


def _send_month_report(chat, m):
    """The one month screen. This month also shows the source documents: a button (default), always, or off."""
    try:
        if _is_sat(chat):
            send(chat, "Reading the parish app...")
            _sat_reply(chat, ["month", "--chat", chat] + (["--month", m] if m else [])); return
        import monthinfo as MI
        mode = "off" if m or BM is None else _bset("month_portal_check", "button")
        send(chat, "Reading the parish app" + (" and checking the portal (about a minute)..." if mode == "always" else "..."))
        src, kb = None, None
        if mode == "always":
            src = _slot_lines(chat)
        elif mode == "button":
            src, kb = [html.escape(BM.SLOTS_NOTE, quote=False)], BM.slots_kb()
        _send_long(chat, MI.month_text(MI.facts(month=m, prefer_open=True), srcdoc=src), kb)
    except Exception:
        log("month cmd error", traceback.format_exc()[-600:]); send(chat, "Sorry, I couldn't read the month's status right now.")


def cmd_slots(chat):
    try:
        send(chat, "Checking the upload slots on the portal. This takes about a minute...")
        if _is_sat(chat):
            _sat_reply(chat, ["slots", "--chat", chat]); return
        send(chat, "\U0001f50e <b>SOURCE DOCUMENTS</b>\n" + "\n".join(_slot_lines(chat)), html=True)
    except Exception:
        log("slots cmd error", traceback.format_exc()[-600:]); send(chat, "Sorry, I couldn't check the portal right now.")


def _last_balance_check():
    try:
        import monthinfo as MI
        d = json.load(open(os.path.join(C.BALANCE_DIR, "last-check.json")))
        return f"last scheduled check {MI.day(d['date'])}, {d['slot']} (send /balance to check now)"
    except Exception:
        return "no scheduled check recorded yet (send /balance to check now)"


def cmd_system(chat):
    """Behind the scenes (admin): box health, every parish's source documents, attendance runs, statement, memos, bank."""
    try:
        ci = _ci(); H = lambda s: html.escape(str(s), quote=False)
        send(chat, "Checking the box, the portal and the parish app. This takes about a minute...")
        t = datetime.now()
        L = ["\U0001fa7a <b>Behind the scenes</b>", f"{t:%a} {t.day} {t:%b}, {t:%H:%M}", "", "<b>BOX HEALTH</b>"]
        try:
            h = C.health()
            for k, r in (h.get("runners") or {}).items():
                icon = {"ok": "✅", "warn": "⚠️", "error": "❌"}.get(r.get("status"), "⚠️")
                L.append(f"• {icon} {H(SYS_NAMES.get(k, k))}: {H(r.get('summary') or '')}")
            L.append(f"• Problems logged in the last 7 days: {H(h.get('errors_7d', '?'))}")
        except Exception:
            L.append("• ⚠️ couldn't read the box health")
        codes = [p for p, _ in PARISHES]
        try:
            slots = ci.slots_lines(codes, {c: PNAME[c].title() for c in codes})
        except Exception:
            slots = ["⚠️ couldn't check the portal right now"]
        L += ["", "<b>SOURCE DOCUMENTS</b> (every parish)"] + slots
        L += ["", "<b>ATTENDANCE RUNS</b> (calendar months)"] + [f"• {H(x)}" for x in (ci.att_lines() or ["nothing to report"])]
        L += ["", "<b>MONTHLY STATEMENT</b>"] + [f"• {H(x)}" for x in ci.stmt_lines()]
        L += ["", "<b>MEMOS</b>", f"• {H(ci.memo_line())}"]
        L += ["", "<b>BANK BALANCE</b>", f"• {H(_last_balance_check())}"]
        _send_long(chat, "\n".join(L))
    except Exception:
        log("system error", traceback.format_exc()[-600:]); send(chat, "Sorry, I couldn't build the overview right now. Please try again later.")


def cmd_statement(chat, arg=""):
    """Buttons (Latest / Previous), or /statement 2026-09 for that month's statement."""
    m = arg if re.fullmatch(r"\d{4}-\d{2}", arg or "") else None
    if not m:
        send(chat, "Which statement?", kb_statement_start()); return
    try:
        import monthinfo as MI
        i = next((i for i, s in enumerate(_ci().sent_statements()) if str(s[3])[:7] == m), None)
        if i is None:
            send(chat, f"No statement has been sent for {MI.month_label(m)} yet."); return
        _send_statement(chat, i)
    except Exception:
        log("statement cmd error", traceback.format_exc()[-600:]); send(chat, "Sorry, I couldn't fetch the statement right now.")


def cmd_refresh(chat, arg):
    try:
        runs = json.load(open("/workspace/rccg-attendance/state/att-runs.json")) if os.path.exists("/workspace/rccg-attendance/state/att-runs.json") else {}
        _filed = set(runs) | {f[11:18] for f in (os.listdir("/workspace/rccg-attendance/runs") if os.path.isdir("/workspace/rccg-attendance/runs") else []) if re.fullmatch(r"att-submit-\d{4}-\d{2}\.json", f)}
        m = arg if re.fullmatch(r"\d{4}-\d{2}", arg or "") else (sorted(_filed)[-1] if _filed else None)
        if not m or m not in _filed:
            send(chat, (f"Nothing to refresh for {arg}: that month's attendance isn't on the portal yet."
                        if arg else "Nothing to refresh yet: no month's attendance is on the portal.")
                 + " Attendance is filed with the month-end run."); return
        send(chat, f"Comparing the parish app with the portal for {m}. This takes about a minute...")
        r = _attref(["check", m])
        if r.get("state") == "differs":
            send(chat, f"⚠️ {m}: the portal DIFFERS from the app.\n{r.get('msg', '')}\nTap Confirm to re-file the month once. This can't be undone.",
                 [[{"text": f"Confirm refresh {m}", "callback_data": f"attref|go|{m}"}, {"text": "Cancel", "callback_data": "attref|no|"}]])
        else:
            send(chat, f"{m}: {r.get('msg')}")
    except Exception:
        log("refresh check error", traceback.format_exc()[-600:]); send(chat, "Sorry, the refresh check failed. Nothing was changed.")


def cmd_refresh_go(chat, m):
    try:
        who = _name(chat)
        send(chat, f"Refreshing {m}: re-reading the app, re-filing once, then reading the portal back. This takes a few minutes...")
        r = _attref(["apply", m, "--who", who], timeout=1500)
        send(chat, f"{m}: {r.get('msg')}")
        for pid in [x for x in PEOPLE if x not in SATP]:
            if pid != chat: send(pid, f"FYI: {who} ran an attendance refresh for {m}. Result: {r.get('msg')}")
    except Exception:
        log("refresh apply error", traceback.format_exc()[-600:])
        send(chat, f"The refresh stopped with an error. It will NOT retry. Please tell {_bset('unknown_contact', 'the parish IT administrator')}.")


def _words(msg):
    words = (msg.get("text") or "").strip().split()
    w = words[0].lower().split("@")[0] if words else ""
    arg = words[1] if len(words) > 1 else ""
    return w, arg, (arg if re.fullmatch(r"\d{4}-\d{2}", arg) else None)


def _go(fn, *a):
    threading.Thread(target=fn, args=a, daemon=True).start()


def _sat_msg(st, cid, msg):
    """A satellite parish's people: /start inv_<code> links them; then the same commands as Kingdom's people, for their
    own parish, as Automations -> Telegram bot allows. True when handled here."""
    w, arg, m = _words(msg)
    if w == "/start" and arg.startswith("inv_"):
        r = _sat_reply(cid, ["link", "--chat", cid, "--code", arg[4:]], timeout=60)
        if r.get("ok") and r.get("parish"):
            PEOPLE[cid] = r.get("name") or "Pastor"; SATP[cid] = r["parish"]
        return True
    if not _is_sat(cid):
        return False
    if msg.get("photo") or msg.get("document") or w in ("/cancel", "cancel", "stop", "/done", "done"):
        return False  # the upload flow (fixed to their own parish); handle_message checks who may upload
    if w in ("/month", "/status", "/paid") and arg and not m:
        send(cid, f"Please type the month like {w} 2026-09."); return True
    need = {"/month": "month", "/status": "month", "/paid": "paid", "/upload": "upload", "/statement": "statement",
            "/balance": "balance", "/refresh": "refresh", "/system": "system"}.get(w)
    if need and not _can(cid, need):
        send(cid, NOT_AVAILABLE)
    elif w == "/month" and not m:
        send(cid, "Which month?", kb_month_start())
    elif w in ("/month", "/status"):
        _go(_send_month_report, cid, m)
    elif w == "/paid":
        _go(_sat_reply, cid, ["paid", "--chat", cid] + (["--month", m] if m else []))
    elif w == "/upload":
        send(cid, _bm("upload_text", cid) or _help(cid), html=True)
    else:
        send(cid, _help(cid), html=True)
    return True


_handle_callback_before_botmenu = handle_callback


def handle_callback(st, cq):
    """month / statement / refresh / source-document buttons follow the same audiences; everything else as before."""
    chat = cq["from"]["id"]; data = cq.get("data") or ""
    kind = data.split("|", 1)[0]
    need = {"month": "month", "slots": "month", "statement": "statement", "attref": "refresh"}.get(kind)
    if not need:
        return _handle_callback_before_botmenu(st, cq)
    if not _known(chat):
        api("answerCallbackQuery", callback_query_id=cq["id"]); return
    if not _can(chat, need):
        api("answerCallbackQuery", callback_query_id=cq["id"], text="This isn't available for you."); return
    api("answerCallbackQuery", callback_query_id=cq["id"])
    _, act, val = (data.split("|") + ["", ""])[:3]
    drop_kb(chat, (cq.get("message") or {}).get("message_id"))
    if kind == "slots":
        _go(cmd_slots, chat)
    elif kind == "attref":
        if act == "go" and re.fullmatch(r"\d{4}-\d{2}", val):
            _go(cmd_refresh_go, chat, val)
        else:
            send(chat, "Refresh cancelled. Nothing was changed.")
    elif kind == "month":
        if act == "this":
            _go(_send_month_report, chat, None)
        elif act == "prev":
            send(chat, "Choose a month:", kb_recent_months())
        elif act == "go" and re.fullmatch(r"\d{4}-\d{2}", val):
            _go(_send_month_report, chat, val)
        else:
            send(chat, "Which month?", kb_month_start())
    else:
        if act == "this":
            _go(_send_statement, chat, 0)
        elif act == "prev":
            kb = _statement_prev_kb()
            if kb: send(chat, "Choose a statement:", kb)
            else: send(chat, "No earlier statements on record.")
        elif act == "go" and val.isdigit():
            _go(_send_statement, chat, int(val))
        else:
            send(chat, "Which statement?", kb_statement_start())


def handle_message(st, msg):
    chat = msg.get("chat", {}); frm = msg.get("from", {}); cid = frm.get("id")
    if chat.get("type") != "private" or not cid:
        log("ignored message from", cid, chat.get("type")); return
    if _sat_msg(st, cid, msg):
        return
    if not _known(cid):
        log("ignored message from", cid, "private")
        t = _bm("unknown_reply", cid)
        if t: send(cid, t)
        return
    _go(_bm, "retry_chat", cid, api)  # a menu Telegram couldn't set before (the chat was unknown to it then)
    w, arg, m = _words(msg)
    low = (msg.get("text") or "").strip().lower()
    if msg.get("photo") or msg.get("document"):
        if _can(cid, "upload") and cid in PEOPLE and (cid in SATP or not _is_sat(cid)):
            handle_file(st, cid, msg)
        else:
            send(cid, NOT_AVAILABLE)
        return
    if w in ("/start", "/help", "help"):
        send(cid, _help(cid), html=True); return
    if w in ("/month", "/status", "/paid", "/statement", "/refresh") and arg and not m:
        send(cid, f"Please type the month like {w} 2026-09."); return
    need = {"/month": "month", "/status": "month", "/upload": "upload", "/paid": "paid", "/statement": "statement",
            "/balance": "balance", "/refresh": "refresh", "/system": "system"}.get(w)
    if need and not _can(cid, need):
        send(cid, NOT_AVAILABLE); return
    if w == "/month" and not m:
        send(cid, "Which month?", kb_month_start())
    elif w in ("/month", "/status"):
        _go(_send_month_report, cid, m)
    elif w == "/upload":
        send(cid, _bm("upload_text", cid) or HELP, html=True)
    elif w == "/paid":
        _go(cmd_paid, cid, m or "")
    elif w == "/statement":
        _go(cmd_statement, cid, m or "")
    elif w == "/balance":
        _go(cmd_balance, cid)
    elif w == "/refresh":
        _go(cmd_refresh, cid, m or "")
    elif w == "/system":
        _go(cmd_system, cid)
    elif low in ("cancel", "/cancel", "stop"):
        cancel(st, cid)
    elif low in ("done", "/done"):
        b = st["chats"].get(str(cid), {}).get("batch")
        if b and b["stage"] == "collect" and b["files"]: send_prompt(st, cid)
        else: send(cid, "No pages yet. Send a photo or a PDF first.")
    else:
        send(cid, _help(cid), html=True)


def main():
'''

POLLER_TICK_OLD = r'''        try: C.balance_events_check()  # bankbalance-fastcheck-20261001: near-instant Refresh pickup
        except Exception: pass
'''
POLLER_TICK_NEW = POLLER_TICK_OLD + r'''        _menus_tick()  # botmenu-20261003: re-send the (/) menus when the people or settings changed
'''

CHANGES = {
    "tools/clerkcfg.py": [("\n\ndef sections(default):\n", CLERKCFG_NEW)],
    "tools/monthinfo.py": [
        ('''    have = {str(r.get("date"))[:10] for r in income if isinstance(r, dict) and r.get("source") in SUNDAY_SOURCES}\n''',
         MONTHINFO_FACTS_TOTAL),
        ('''            "report": bool(further.get("furtherSubmittedAt")), "entry": entry if isinstance(entry, dict) else {}}\n''',
         '''            "report": bool(further.get("furtherSubmittedAt")), "entry": entry if isinstance(entry, dict) else {},\n'''
         '''            "total": total}  # botmenu-20261003\n'''),
        ('''\n\nCACHE = os.environ.get("MONTHINFO_CACHE", "/workspace/tools/.monthinfo-cache.json")\n''', MONTHINFO_SCREEN),
    ],
    "tools/clerkinfo.py": [("\n\ndef memo_line():\n", CLERKINFO_NEW)],
    "tools/satinfo.py": [(SATINFO_ORIG_OLD, SATINFO_ORIG_NEW), (SATINFO_USE_OLD, SATINFO_USE_NEW),
                         (SATINFO_MONTH_OLD, SATINFO_MONTH_NEW)],
    "tools/satbot.py": [
        ('''+ help_text(P), True,''', '''+ help_text(P, chat), True,'''),
        ('''    elif cmd == "status":\n        status(chat)\n''',
         '''    elif cmd == "status":\n        status(chat)\n    elif cmd == "slots":  # botmenu-20261003\n        slots(chat)\n'''),
        ('''        out(help_text(P) if P else "You're not linked to a parish yet.", True)\n''',
         '''        out(help_text(P, chat) if P else "You're not linked to a parish yet.", True)\n'''),
        ('''\n\nif __name__ == "__main__":\n''', SATBOT_NEW),
    ],
    "telegram/srcdoc/poller.py": [("\n\ndef main():\n", POLLER_NEW), (POLLER_TICK_OLD, POLLER_TICK_NEW)],
}


def main():
    check = "--check" in sys.argv
    tmp = tempfile.mkdtemp(prefix="botmenu-patch-")
    staged, skipped, errors = [], [], []
    for rel, reps in CHANGES.items():
        src = os.path.join(ROOT, rel)
        try:
            s = open(src, encoding="utf-8").read()
        except Exception as e:
            errors.append(f"{rel}: cannot read ({e})"); continue
        if MARK in s:
            skipped.append(rel); continue
        bad = False
        for old, new in reps:
            n = s.count(old)
            if n != 1:
                errors.append(f"{rel}: a block to change was found {n} times (expected 1): {old.strip().splitlines()[0][:80]}")
                bad = True; break
            s = s.replace(old, new)
        if bad:
            continue
        s = s.rstrip("\n") + f"\n# {MARK}\n"
        dst = os.path.join(tmp, rel.replace("/", "__"))
        open(dst, "w", encoding="utf-8").write(s)
        try:
            py_compile.compile(dst, cfile=dst + "c", doraise=True)
        except py_compile.PyCompileError as e:
            errors.append(f"{rel}: would not compile after the change ({str(e).splitlines()[-1][:200]})"); continue
        staged.append((src, dst, rel))
    if errors:
        print("NOT CHANGED. These changes did not fit this box's files:")
        for e in errors:
            print("  -", e)
        shutil.rmtree(tmp, ignore_errors=True); sys.exit(1)
    if check:
        print(f"CHECK OK: {len(staged)} file(s) would be changed" + (f", {len(skipped)} already done" if skipped else ""))
        shutil.rmtree(tmp, ignore_errors=True); return
    for src, dst, rel in staged:
        shutil.copymode(src, dst)
        if os.stat(src).st_dev == os.stat(dst).st_dev:
            os.replace(dst, src)
        else:
            shutil.copyfile(dst, src)
        print("patched", rel)
    for rel in skipped:
        print("already patched", rel)
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
