#!/usr/bin/env python3
"""Synthetic stand-in for the box's clerkcfg.py: the config, people and routing helpers (real bodies, trimmed)."""
import datetime, json, os, re

CFG = os.environ.get("CLERK_CFG", "/workspace/config.json")


_cache = {"mtime": None, "data": None}


def _raw():
    try:
        m = os.path.getmtime(CFG)
    except OSError:
        return None
    if _cache["mtime"] != m:
        try:
            _cache["data"] = json.load(open(CFG))
        except Exception:
            _cache["data"] = None
        _cache["mtime"] = m
    return _cache["data"]


def config():
    """The saved config, or None (no file, unreadable, or still the unsaved default)."""
    d = _raw()
    if not isinstance(d, dict) or d.get("is_default") or not isinstance(d.get("config"), dict):
        return None
    return d["config"]


def get(path, default=None):
    c = config()
    if c is None:
        return default
    for k in path.split("."):
        if not isinstance(c, dict) or k not in c:
            return default
        c = c[k]
    return default if c is None else c


def num(path, default):
    v = get(path, default)
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else default


def enabled(auto):
    return get(f"automations.{auto}.enabled", True) is not False


def all_people():  # parishes-20261003: everyone, satellite parishes' people included (chat ids linked by the bot merged in)
    c = config()
    ps = [dict(p) for p in (c or {}).get("people", []) if isinstance(p, dict) and p.get("key")]
    try:
        links = json.load(open(os.path.join(os.environ.get("CLERK_ROOT", "/workspace"), "state", "satlinks.json")))
    except Exception:
        links = {}
    for p in ps:
        cid = str((links if isinstance(links, dict) else {}).get(p["key"]) or "")
        if is_sat(p) and not p.get("telegram_chat_id") and re.fullmatch(r"-?\d+", cid):
            p["telegram_chat_id"] = cid
    return ps


def is_sat(p):  # parishes-20261003
    return str(p.get("parish") or "602757") != "602757"


def people():
    c = config()
    return [p for p in all_people() if not is_sat(p)]  # parishes-20261003: Kingdom Parish's people only


def _routing(mtype):
    c = config()
    if c is None or not mtype:
        return None
    r = (c.get("routing") or {}).get(mtype)
    return r if isinstance(r, dict) else None


def tg_allowed(mtype, who):
    """May `who` get this Telegram message? True whenever the config doesn't say otherwise."""
    if config() is None:
        return True
    keys = {p["key"] for p in all_people()}  # parishes-20261003
    if keys and who not in keys:
        return False                                  # person was removed in the app
    r = _routing(mtype)
    if r is None:
        return True                                   # message type the app doesn't manage
    return bool((r.get(who) or {}).get("telegram"))


def who(mtype, default, exclude=()):
    """Comma list of people who get this message on Telegram (and have a chat id). Falls back to `default`."""
    r = _routing(mtype)
    if r is None:
        return default
    ids = {p["key"]: p.get("telegram_chat_id") for p in people()}
    return ",".join(k for k, v in r.items() if (v or {}).get("telegram") and ids.get(k) and k not in exclude)


def one(mtype, key):
    """`key` if that person gets this message on Telegram, else ''."""
    return key if tg_allowed(mtype, key) else ""
