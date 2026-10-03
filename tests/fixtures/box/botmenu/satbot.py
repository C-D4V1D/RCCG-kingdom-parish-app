"""Synthetic stand-in for the box's tools/satbot.py (box-botmenu test): only the anchor lines (compiled, not run)."""
import json


def out(reply=None, html_=False, **kw):
    print(json.dumps({"reply": reply, "html": html_, **kw}, ensure_ascii=False))


def esc(s):
    return str(s)


def help_text(P):
    return "help"


def link(chat, code, P=None):
    return out("Welcome.\n\n" + help_text(P), True,
               ok=True)


if __name__ == "__main__":
    import sys
    a = sys.argv[1:]
    cmd, chat, P = (a[:1] or [""])[0], "1", None
    if cmd == "link":
        link(chat, "x")
    elif cmd == "status":
        status(chat)
    else:
        out(help_text(P) if P else "You're not linked to a parish yet.", True)
