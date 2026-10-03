"""Synthetic stand-in for the box's tools/clerkcfg.py (box-botmenu test): the anchor line and the helpers
botmenu.py reads. No real people; the test writes its own config.json."""
import json, os, re

CFG = os.environ.get("CLERK_CFG", "/workspace/config.json")


def config():
    try:
        d = json.load(open(CFG))
    except Exception:
        return None
    return None if not isinstance(d, dict) or d.get("is_default") else d.get("config")


def get(path, default=None):
    c = config()
    if c is None:
        return default
    for k in path.split("."):
        if not isinstance(c, dict) or k not in c:
            return default
        c = c[k]
    return default if c is None else c


def all_people():
    ps = [dict(p) for p in (config() or {}).get("people", []) if isinstance(p, dict) and p.get("key")]
    try:
        links = json.load(open(os.path.join(os.environ.get("CLERK_ROOT", "/workspace"), "state", "satlinks.json")))
    except Exception:
        links = {}
    for p in ps:
        cid = str(links.get(p["key"]) or "")
        if is_sat(p) and not p.get("telegram_chat_id") and re.fullmatch(r"-?\d+", cid):
            p["telegram_chat_id"] = cid
    return ps


def is_sat(p):
    return str(p.get("parish") or "602757") != "602757"


def people():
    return [p for p in all_people() if not is_sat(p)]


def check_people(channel, default=()):
    return [p["key"] for p in people() if p.get("buttons")]


def bot_admin(default):
    return default


def sections(default):
    return dict(default)
