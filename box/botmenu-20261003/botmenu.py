#!/usr/bin/env python3
"""The Telegram bot's menus, help and who may use which command (botmenu-20261003).

Everything comes from the app: Automations -> People (who is linked, Kingdom or a satellite parish, pays the RRR,
full status, can upload) and Automations -> Telegram bot (`automations.telegram_bot`: which audience sees each command).
Audiences: everyone (every linked person, satellite pastors too), kingdom (Kingdom Parish people only), payers (people
who pay the RRR, in their own parish), admin (full status), off. statement / balance / refresh / system are always
Kingdom-only ('everyone' means 'kingdom' for them).

Each linked person gets their own (/) menu (Telegram setMyCommands with a chat scope); everybody else sees a small
default menu (month, help). Menus are only sent to Telegram when they change (hash in /workspace/state/botmenu.json).

  botmenu.py show              print each linked person's commands (nothing is sent)
  botmenu.py apply [--force]   send the menus to Telegram if they changed (--force: send them anyway)
  botmenu.py reset             undo: remove the per-person menus and put back the old single menu
  botmenu.py selftest          render the screens with made-up data (nothing is read from the app, nothing is sent)

Never raises into the bot: every helper falls back to the bot's old behaviour when the config is missing or broken.
"""
import datetime, hashlib, html, json, os, re, sys, threading

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
TOOLS = os.path.dirname(os.path.abspath(__file__))
if TOOLS not in sys.path:
    sys.path.insert(0, TOOLS)
import clerkcfg as C  # noqa: E402

STATE = os.path.join(ROOT, "state", "botmenu.json")
UNKNOWN_STATE = os.path.join(ROOT, "state", "botmenu-unknown.json")
KINGDOM = "602757"
KINGDOM_ONLY = ("statement", "balance", "refresh", "system")
AUDIENCES = ("everyone", "kingdom", "payers", "admin", "off")
DEFAULT_MENU = {"month": "everyone", "upload": "everyone", "paid": "payers", "statement": "kingdom", "balance": "kingdom",
                "refresh": "admin", "system": "admin", "help": "everyone"}
# (command, icon, menu text, help text): the order of the menu and of /help
COMMANDS = [
    ("month", "📅", "This month: Sunday records, remittance, next step",
     "this month: Sunday records, remittance, attendance, source documents and the next step (/month 2026-09 for another month)"),
    ("upload", "📎", "How to upload a source document", "how to upload a source document"),
    ("paid", "✅", "I've paid the RRR: check Remita", "you paid the RRR: I check Remita and tell everyone (/paid 2026-09 for another month)"),
    ("statement", "📄", "Monthly financial statement", "the monthly financial statement (/statement 2026-09 for another month)"),
    ("balance", "🏦", "Real bank balance now", "the real bank balance from the RCCG portal, checked now"),
    ("refresh", "🔄", "Re-check attendance against the portal",
     "re-check a month's attendance against the portal; re-files only if it differs (/refresh 2026-09)"),
    ("system", "🩺", "Behind the scenes: box health",
     "behind the scenes: source documents of every parish, attendance runs, statement, memos, bank check, box health"),
    ("help", "❓", "What I can do for you", "this message"),
]
NOT_AVAILABLE = "This isn't available for you. Use /help to see your commands."
SLOTS_NOTE = "Tap the button below to check the upload slots on the portal (about a minute)."
SLOTS_BUTTON = "🔎 Check upload slots on the portal"
# The single menu the bot had before this update (menu-refine-20260928 + bankbalance-20260929); `reset` puts it back.
OLD_MENU = [{"command": "status", "description": "Remittance, attendance, deadlines and statement status"},
            {"command": "month", "description": "This month's remittance and attendance (or a previous month)"},
            {"command": "statement", "description": "The latest financial statement (or a previous one)"},
            {"command": "balance", "description": "Check the real bank balance from the RCCG portal now"},
            {"command": "refresh", "description": "Re-check attendance and re-file if it differs"},
            {"command": "help", "description": "Show the commands and how to upload"}]

# Set by poller.py: the bot's built-in people ({chat id: name}) and admin chat, used only when there is no config.
DEFAULT_PEOPLE = {}
DEFAULT_ADMIN = None


def esc(s):
    return html.escape(str(s), quote=False)


def rjson(p, d=None):
    try:
        return json.load(open(p))
    except Exception:
        return d


def wjson(p, o):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = f"{p}.tmp{os.getpid()}-{threading.get_ident()}"  # the installer and the bot may write at the same moment
    json.dump(o, open(tmp, "w"), indent=1, ensure_ascii=False)
    os.replace(tmp, p)


def settings():
    """automations.telegram_bot merged over the defaults (clerkcfg.bot_settings); the defaults if anything fails."""
    try:
        return C.bot_settings()
    except Exception:
        return {"menu": dict(DEFAULT_MENU), "previous_months": 6, "month_portal_check": "button", "reply_unknown": True,
                "unknown_contact": "the parish IT administrator"}


def parish_name(code):
    try:
        return C.parish_name(code)
    except Exception:
        return "Kingdom Parish" if str(code) == KINGDOM else f"Parish {code}"


def _called(p):
    c = str(p.get("called") or "").strip()
    if c:
        return c
    m = re.match(r"^.*\((.+)\)\s*$", str(p.get("name") or ""))
    if m:
        return m.group(1).strip()
    return (str(p.get("name") or "").split() or [str(p.get("key") or "").title()])[0]


# ---------------------------------------------------------------- who is who
def _kingdom_payers():
    try:
        import monthclose as MC  # its payers(): pays_rrr in Automations -> People (one source of truth with /paid)
        return set(MC.payers())
    except Exception:
        return {p.get("key") for p in C.people() if p.get("pays_rrr")}


def linked():
    """{chat id: person} for everyone the bot knows: people in Automations -> People with a Telegram chat id (satellite
    pastors linked by invite included). Without a config: the bot's built-in people, all Kingdom."""
    out = {}
    if C.config() is not None:
        ps = C.all_people()
        payers = None
        for p in ps:
            cid = str(p.get("telegram_chat_id") or "").strip()
            if not re.fullmatch(r"-?\d+", cid) or int(cid) in out:
                continue
            sat = C.is_sat(p)
            parish = str(p.get("parish") or KINGDOM) if sat else KINGDOM
            if sat:
                mates = [q for q in ps if str(q.get("parish") or "") == parish]
                flagged = [q["key"] for q in mates if q.get("pays_rrr")]  # satclose: everyone in the parish if nobody is
                payer = p["key"] in (flagged or [q["key"] for q in mates])
            else:
                payers = _kingdom_payers() if payers is None else payers
                payer = p["key"] in payers
            out[int(cid)] = {"chat": int(cid), "key": p["key"], "called": _called(p), "parish": parish, "sat": sat,
                             "admin": (not sat) and bool(p.get("full_status")), "payer": payer,
                             "uploader": bool(p.get("can_upload"))}
    if not out:
        for cid, name in (DEFAULT_PEOPLE or {}).items():
            out[int(cid)] = {"chat": int(cid), "key": None, "called": str(name), "parish": KINGDOM, "sat": False,
                             "admin": DEFAULT_ADMIN is not None and int(cid) == int(DEFAULT_ADMIN),
                             "payer": DEFAULT_ADMIN is not None and int(cid) == int(DEFAULT_ADMIN), "uploader": True}
    return out


def person(chat):
    try:
        return linked().get(int(chat))
    except Exception:
        return None


def known(chat):
    return person(chat) is not None


def _ok(p, cmd, s):
    if not p:
        return False
    a = (s.get("menu") or {}).get(cmd, DEFAULT_MENU.get(cmd, "off"))
    ok = {"everyone": True, "kingdom": not p["sat"], "payers": p["payer"], "admin": p["admin"]}.get(a, False)
    if cmd in KINGDOM_ONLY:
        ok = ok and not p["sat"]  # these show Kingdom Parish's own records
    if cmd == "upload":
        ok = ok and p["uploader"]  # Automations -> People -> can upload
    return bool(ok)


def allowed(chat, cmd):
    """May this chat use the command (typed or from the menu)? /help always answers a linked person."""
    p = person(chat)
    if cmd == "help":
        return p is not None
    return _ok(p, cmd, settings())


def commands_for(p, s=None):
    """The person's menu: [(command, icon, menu text, help text)] in menu order."""
    s = s or settings()
    out = []
    for c in COMMANDS:
        if c[0] == "help":
            if (s.get("menu") or {}).get("help", "everyone") != "off":
                out.append(c)
        elif _ok(p, c[0], s):
            out.append(c)
    return out


# ---------------------------------------------------------------- texts
def help_text(chat):
    p = person(chat)
    if not p:
        return NOT_AVAILABLE
    s = settings()
    L = [f"❓ <b>{esc(parish_name(p['parish']))} · Clerk bot</b>", f"Hello {esc(p['called'])}. Your commands:", ""]
    for cmd, icon, _, txt in COMMANDS:
        if cmd == "help" or _ok(p, cmd, s):
            L.append(f"/{cmd} {icon} {esc(txt)}")
    if _ok(p, "upload", s):
        L += ["", "Send photos or PDFs any time to upload a source document — /upload for the steps."]
    return "\n".join(L)


def upload_text(chat):
    p = person(chat) or {"parish": KINGDOM, "chat": None}
    choose = DEFAULT_ADMIN is not None and p.get("chat") is not None and int(p["chat"]) == int(DEFAULT_ADMIN)
    where = "that parish's slot" if choose else f"{parish_name(p['parish'])}'s slot"
    return ("📎 <b>Upload a source document</b>\n"
            "1. Send the page(s) here as photos or files (JPG, PNG or PDF; an album is fine).\n"
            "2. Choose Admin, Finance, or Both (the same image goes to both).\n"
            "3. Choose the month" + (", then the parish" if choose else "") + ".\n"
            f"4. Check the preview and tap Upload. It goes to {esc(where)} on the RCCG portal.\n\n"
            "Uploads are final: the portal has no replace or delete. /cancel stops an upload.")


def slots_kb():
    return [[{"text": SLOTS_BUTTON, "callback_data": "slots|check|"}]]


def unknown_reply(chat):
    """The one polite reply for someone the bot doesn't know, at most once per chat per day; None otherwise."""
    try:
        s = settings()
        if not s.get("reply_unknown", True):
            return None
        today = datetime.date.today().isoformat()
        st = rjson(UNKNOWN_STATE, {}) or {}
        if st.get(str(chat)) == today:
            return None
        st = {k: v for k, v in st.items() if v == today}
        st[str(chat)] = today
        wjson(UNKNOWN_STATE, st)
        who = str(s.get("unknown_contact") or "the parish IT administrator").strip()[:120]
        return ("Hello! This is the parish's Clerk bot. It only works for people who have been set up for it. "
                f"If you should have access, please contact {who}.")
    except Exception:
        return None


# ---------------------------------------------------------------- the (/) menus in Telegram
def _cmds(cs):
    return [{"command": c, "description": f"{icon} {text}"} for c, icon, text, _ in cs]


def plan():
    """{"default": [...], "chats": {chat id: [...]}}: what every menu should be."""
    s = settings()
    default = [c for c in COMMANDS if c[0] in ("month", "help") and (s.get("menu") or {}).get(c[0], "everyone") != "off"]
    return {"default": _cmds(default),
            "chats": {str(cid): _cmds(commands_for(p, s)) for cid, p in sorted(linked().items())}}


def signature():
    """Cheap: changes when the config (any new config_version) or the satellite links change."""
    out = []
    for f in (C.CFG, os.path.join(ROOT, "state", "satlinks.json")):
        try:
            out.append(os.path.getmtime(f))
        except OSError:
            out.append(None)
    return tuple(out)


def _scope(chat):
    return {"type": "chat", "chat_id": int(chat)}


def _gone(r):
    d = str((r or {}).get("description") or "").lower()
    return "chat not found" in d or "bot was blocked" in d or "user is deactivated" in d


def apply_menus(call, force=False, only=None):
    """Send the menus to Telegram when they changed. call(method, **params) -> Telegram's JSON reply.
    Returns (ok, summary). A chat Telegram doesn't know yet (never opened the bot) is skipped and retried when that person
    first writes to the bot (retry_chat). Never raises."""
    try:
        p = plan()
        h = hashlib.sha256(json.dumps(p, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        st = rjson(STATE, {}) or {}
        if only is None and not force and st.get("hash") == h:
            return True, "unchanged"
        errs, missing, done = [], [], 0
        chats = p["chats"] if only is None else {k: v for k, v in p["chats"].items() if k == str(only)}
        if only is None:
            r = call("setMyCommands", commands=p["default"]) or {}
            if not r.get("ok"):
                errs.append(f"default: {r.get('description')}")
        for chat, cmds in chats.items():
            r = (call("setMyCommands", commands=cmds, scope=_scope(chat)) if cmds
                 else call("deleteMyCommands", scope=_scope(chat))) or {}
            if r.get("ok"):
                done += 1
            elif _gone(r):
                missing.append(chat)
            else:
                errs.append(f"{chat}: {r.get('description')}")
        old = [c for c in st.get("chats", []) if c not in p["chats"]] if only is None else []
        for chat in old:  # people no longer linked: back to the default menu
            r = call("deleteMyCommands", scope=_scope(chat)) or {}
            if not r.get("ok") and not _gone(r):
                errs.append(f"{chat}: {r.get('description')}")
        if only is None:
            st = {"hash": None if errs else h, "chats": sorted(set(p["chats"]) | (set(old) if errs else set())),
                  "missing": missing, "at": datetime.datetime.now().isoformat(timespec="seconds")}
            if errs:
                st["error"] = "; ".join(errs)[:300]
        else:
            st["missing"] = [c for c in st.get("missing", []) if c != str(only)] + missing
        wjson(STATE, st)
        return not errs, (f"menus for {done} people" + (f", {len(missing)} not reachable yet" if missing else "")
                          + (f"; errors: {'; '.join(errs)[:200]}" if errs else ""))
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"[:200]


def retry_chat(chat, call):
    """A linked person wrote to the bot: if their menu couldn't be set before (Telegram didn't know the chat), set it now."""
    try:
        if str(chat) in ((rjson(STATE, {}) or {}).get("missing") or []):
            return apply_menus(call, only=chat)
    except Exception:
        pass
    return None


def reset(call):
    """Undo: remove every per-person menu this update set and put back the old single menu."""
    st = rjson(STATE, {}) or {}
    n = 0
    for chat in set(st.get("chats", [])) | set(st.get("missing", [])):
        if (call("deleteMyCommands", scope=_scope(chat)) or {}).get("ok"):
            n += 1
    ok = bool((call("setMyCommands", commands=OLD_MENU) or {}).get("ok"))
    try:
        os.remove(STATE)
    except OSError:
        pass
    return ok, f"removed {n} personal menus; old menu {'restored' if ok else 'NOT restored'}"


# ---------------------------------------------------------------- CLI
def _tg_call():
    sys.path.insert(0, os.path.join(ROOT, "telegram"))
    import tg
    return tg.call


def _show():
    s = settings()
    L = linked()
    print(f"settings: {json.dumps(s, ensure_ascii=False)}")
    if not L:
        print("nobody is linked to the bot yet")
    for cid, p in sorted(L.items(), key=lambda kv: (kv[1]["sat"], kv[1]["parish"], str(kv[1]["key"]))):
        who = p["key"] or p["called"]
        tags = [t for t, on in (("admin", p["admin"]), ("payer", p["payer"]), ("uploads", p["uploader"])) if on]
        print(f"{who} ({parish_name(p['parish'])}{'; ' + ', '.join(tags) if tags else ''}): "
              + " ".join("/" + c[0] for c in commands_for(p, s)))


def _selftest():
    """Render the month screen, help and upload texts with made-up data; fails loudly if anything breaks."""
    import monthinfo as MI
    today = datetime.date.today()
    end = today - datetime.timedelta(days=(today.weekday() + 1) % 7)
    start = end - datetime.timedelta(days=27)
    f = {"month": f"{end:%Y-%m}", "start": start, "end": end, "today": today, "report": True, "total": 1234.5,
         "sundays": [{"date": d, "collection": True, "attendance": "submitted"} for d in MI.sundays(start, end)],
         "entry": {"status": "awaiting-reply", "lastCheckSentAt": today.isoformat(), "attendance": {"exit": 0}}}
    n = 0
    for st in ("awaiting-reply", "done", "held", "failed", "generating", None):
        f["entry"]["status"] = st
        t = MI.month_text(f, srcdoc=[esc(SLOTS_NOTE)])
        assert "Next step" in t and "REMITTANCE" in t, t
        n += 1
    for cid in linked():
        assert help_text(cid) and upload_text(cid)
        n += 1
    plan()
    print(f"selftest OK ({n} screens rendered, nothing sent)")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["show"]:
        _show()
    elif a[:1] == ["apply"]:
        ok, msg = apply_menus(_tg_call(), force="--force" in a)
        print(("menus: " if ok else "menus NOT updated: ") + msg)
        sys.exit(0 if ok else 1)
    elif a[:1] == ["reset"]:
        ok, msg = reset(_tg_call())
        print(msg)
        sys.exit(0 if ok else 1)
    elif a[:1] == ["selftest"]:
        _selftest()
    else:
        print(__doc__)
        sys.exit(2)
