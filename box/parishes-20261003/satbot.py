#!/usr/bin/env python3
"""The Telegram bot for the satellite parishes' people (parishes-20261003). poller.py runs it and sends the reply.

  satbot.py link   --chat ID --code INVITE        /start inv_<invite>: link this chat to the person with that invite
  satbot.py button --chat ID --data DATA          mend|<parish>|<month>|generate_rrr|refresh  or  paid|<month>|<parish>
  satbot.py month  --chat ID [--month YYYY-MM]    the parish's /month
  satbot.py status --chat ID                      the parish's /status (month + source-doc slots)
  satbot.py paid   --chat ID [--month YYYY-MM]    /paid: check Remita for the parish's RRR
  satbot.py help   --chat ID

Prints one JSON line: {"reply": text, "html": bool, ...}. Only ever acts for the person's own parish.
"""
import datetime, html, json, os, re, subprocess, sys

TOOLS = os.environ.get("CLERK_TOOLS", "/workspace/tools")
sys.path.insert(0, TOOLS)
import satinfo as S  # noqa: E402

C = S.C
MONTHEND_INBOX = os.path.join(C.MONTHEND_DIR, "inbox")
PY = sys.executable or "python3"


def out(reply=None, html_=False, **kw):
    print(json.dumps({"reply": reply, "html": html_, **kw}, ensure_ascii=False))


def esc(s):
    return html.escape(str(s), quote=False)


def help_text(P):
    return (f"📂 <b>{esc(P.name)}: Clerk bot</b>\n\n"
            "<b>Upload a source document</b>\n"
            "1. Send the page(s) as photos or files (JPG, PNG or PDF; an album is fine).\n"
            "2. Choose Admin, Finance, or Both.\n"
            f"3. Check the preview and tap Upload. It goes to {esc(P.name)}'s slot on the RCCG portal.\n"
            "Uploads are final: the portal has no replace or delete.\n\n"
            "<b>Commands</b>\n"
            "/month - this month's remittance: Sunday records, month-end (/month 2026-09 for another)\n"
            "/status - the month and your parish's source-document slots\n"
            "/paid - you paid the RRR: I check Remita and tell everyone\n"
            "/cancel - cancel the current upload\n"
            "/help - this message")


def link(chat, code):
    code = str(code or "").strip()
    if not re.fullmatch(r"[a-z0-9]{6,32}", code):
        return out("That invite link isn't valid. Please ask the Area office for a new one.")
    p = next((p for p in C.all_people() if C.is_sat(p) and str(p.get("tg_invite") or "") == code), None)
    if not p:
        return out("That invite link isn't valid any more. Please ask the Area office for a new one.")
    links = S.rjson(S.SATLINKS, {}) or {}
    taken = next((k for k, v in links.items() if str(v) == str(chat) and k != p["key"]), None)
    if taken:
        return out("This Telegram account is already linked to someone else. Please ask the Area office.")
    links[p["key"]] = int(chat)
    S.wjson(S.SATLINKS, links)
    P = S.Parish(p["parish"])
    S.tg(["david"], f"🔗 {esc(p.get('name') or p['key'])} ({esc(P.name)}) linked their Telegram to the Clerk bot.",
         f"satlink:{p['key']}:{chat}", os.path.join(P.state, "tg-sent.json"))
    name = S.called(p["key"])
    return out(f"Welcome, {esc(name)}. You're linked to the Clerk bot for <b>{esc(P.name)}</b>.\n\n" + help_text(P), True,
               ok=True, parish=P.code, name=(str(p.get("name") or name).split() or [name])[0], key=p["key"])


def button(chat, data):
    P, key = S.parish_for_chat(chat)
    parts = data.split("|")
    if parts[0] == "paid" and len(parts) == 3:
        month, code = parts[1], parts[2]
        if not P or P.code != code:
            return out("This button is for another parish.")
        r = subprocess.run([PY, os.path.join(TOOLS, "satclose.py"), "paid", "--parish", code, "--chat", str(chat), "--month", month],
                           capture_output=True, text=True, timeout=400)
        return out(None, rc=r.returncode)
    if parts[0] == "mend" and len(parts) == 4:
        _, code, month, action = parts
        allowed = P and P.code == code
        if not allowed and C.bot_admin(8910112376) == int(chat):
            allowed, key = True, next((p["key"] for p in C.people() if str(p.get("telegram_chat_id")) == str(chat)), "david")
        if not allowed:
            return out("This button is for another parish.")
        if action not in ("generate_rrr", "refresh") or not re.fullmatch(r"\d{4}-\d{2}", month):
            return out("This button has expired.")
        now = datetime.datetime.now()
        eid = f"sat-{code}-{month}-{action}-{now:%Y%m%d%H%M%S%f}"
        ev = {"id": eid, "event": "sat_action", "satellite": True, "handler": "box", "parish": code, "month": month,
              "action": action, "person": key, "clickedAt": now.isoformat(timespec="seconds")}
        os.makedirs(MONTHEND_INBOX, exist_ok=True)
        p = os.path.join(MONTHEND_INBOX, eid + ".json")
        json.dump(ev, open(p + ".tmp", "w")); os.replace(p + ".tmp", p)
        C.start_monthend()
        return out("👍 Received. Church Clerk is on it; you'll get a message in a few minutes.")
    return out("This button has expired.")


def month(chat, m=None):
    P, _ = S.parish_for_chat(chat)
    if not P:
        return out("You're not linked to a parish yet.")
    return out(S.month_text(P, m), True)


def status(chat):
    P, _ = S.parish_for_chat(chat)
    if not P:
        return out("You're not linked to a parish yet.")
    L = [S.month_text(P), "", "<b>SOURCE DOCUMENTS</b>"]
    try:
        import clerkinfo as ci
        cur = None
        for lab, mo, yr, p, state, end in ci.srcdoc_slots([P.code]):
            if p is None:
                L.append(f"{esc(lab)}: {esc(state)}"); continue
            if p != P.code:
                continue
            if lab != cur:
                cur = lab
                L.append(f"{esc(lab)} · {esc(mo)} {esc(yr)}" + (f" (closes {esc(end[:10])})" if end else ""))
            L.append("• " + {"uploaded": "✅ uploaded", "EMPTY": "⚠️ empty"}.get(state, esc(state)))
    except Exception:
        L.append("couldn't check the portal right now")
    return out("\n".join(L), True)


def paid_cmd(chat, m=None):
    P, _ = S.parish_for_chat(chat)
    if not P:
        return out("You're not linked to a parish yet.")
    args = [PY, os.path.join(TOOLS, "satclose.py"), "paid", "--parish", P.code, "--chat", str(chat)] + (["--month", m] if m else [])
    r = subprocess.run(args, capture_output=True, text=True, timeout=400)
    return out(None, rc=r.returncode)


if __name__ == "__main__":
    a = sys.argv[1:]
    opt = lambda n: a[a.index(n) + 1] if n in a and a.index(n) + 1 < len(a) else None
    cmd, chat = (a[:1] or [""])[0], opt("--chat")
    if not chat:
        print(__doc__); sys.exit(2)
    if cmd == "link":
        link(chat, opt("--code"))
    elif cmd == "button":
        button(chat, opt("--data") or "")
    elif cmd == "month":
        month(chat, opt("--month"))
    elif cmd == "status":
        status(chat)
    elif cmd == "paid":
        paid_cmd(chat, opt("--month"))
    else:
        P, _ = S.parish_for_chat(chat)
        out(help_text(P) if P else "You're not linked to a parish yet.", True)
# parishes-20261003
