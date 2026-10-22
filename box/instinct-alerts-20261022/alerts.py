"""Clerk-box errors go to Instinct by email; only critical ones also ping David. No secrets here.

report_error(component, error, kind, facts, deps) -> dict(cls, how, ping)
  kind  : "money" | "filing" | "data_loss" | "box_down" | "other"
  facts : {"recovered": bool        - box/job is back and working (box_down)
           "fix_certain": bool      - the fix is known and minor
           "earlier_attempt": "not_landed" | "landed" | "unknown"   (filing: verified, not guessed)
           "refiled_ok": bool}      - the quiet re-file went through
  deps  : {"mail": f(to, subject, body)->bool, "topic": f(text)->bool, "ping": f(text)->bool, "now": f()->datetime (optional)}

Critical (David is pinged AND Instinct is emailed):
  money      anything about money, RRR or payment
  filing     a filing error whose earlier attempt is not VERIFIED as not landed, or that landed, or whose re-file failed
  data_loss  anything that lost or may have lost data
  uncertain  any error where the fix is uncertain or major, and every unknown kind
Quiet (Instinct is emailed, David is not):
  box_down   box was down and was brought back (recovered=True and fix_certain)
  filing     earlier attempt verified not landed AND the re-file went through (no duplicate submit)
  other      a known, minor, fixed error (fix_certain=True)
"""
import datetime, hashlib, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from satalign import Alerter, ALERT_TO       # same drop-in folder on the box (tools/)
except ImportError:                                # pragma: no cover - fallback so this file also stands alone
    Alerter, ALERT_TO = object, "cdavid@mail.instinct.com"

CRITICAL = ("money", "filing_unverified", "data_loss", "uncertain")
TTL_HOURS = 6


def classify(kind, facts=None):
    f = facts or {}
    if kind == "money":
        return "money"
    if kind == "data_loss":
        return "data_loss"
    if kind == "filing":
        if f.get("earlier_attempt") == "not_landed" and f.get("refiled_ok"):
            return "quiet_filing"
        return "filing_unverified"                 # landed, unknown, not verified, or the re-file failed
    if kind == "box_down":
        return "quiet_box_down" if f.get("recovered") and f.get("fix_certain", True) else "uncertain"
    if kind == "other" and f.get("fix_certain") and f.get("recovered", True):
        return "quiet_other"
    return "uncertain"


def is_critical(cls):
    return cls in CRITICAL


def _norm(err):
    return re.sub(r"\d{1,2}:\d{2}(:\d{2})?|\d{4}-\d{2}-\d{2}|0x[0-9a-f]+|\b\d{5,}\b", "#", str(err))[:300]


class ErrorRouter:
    def __init__(self, state_path, deps, to=None):
        self.path, self.d, self.to = state_path, deps, to or ALERT_TO

    def _now(self):
        return (self.d.get("now") or datetime.datetime.now)()

    def _load(self):
        try:
            return json.load(open(self.path))
        except (OSError, ValueError):
            return {}

    def _save(self, s):
        tmp = self.path + ".tmp"
        json.dump(s, open(tmp, "w"))
        os.replace(tmp, self.path)

    def report(self, component, error, kind="other", facts=None):
        cls = classify(kind, facts)
        now = self._now()
        fp = hashlib.sha1(f"{component}|{kind}|{cls}|{_norm(error)}".encode()).hexdigest()[:16]
        s = self._load()
        last = s.get(fp)
        fresh = bool(last) and now - datetime.datetime.fromisoformat(last["at"]) < datetime.timedelta(hours=TTL_HOURS)
        if fresh and last.get("how"):
            return {"cls": cls, "how": "duplicate", "ping": False}
        subject = f"[Instinct-alert] clerk-box {component}"
        body = json.dumps({"component": component, "time": now.isoformat(timespec="seconds"), "kind": kind, "class": cls,
                           "critical": is_critical(cls), "error": str(error), "facts": facts or {}},
                          ensure_ascii=False, sort_keys=True, indent=1)
        how = "email" if self.d["mail"](self.to, subject, body) else ("topic" if self.d["topic"](subject + "\n" + body) else None)
        ping = False
        if is_critical(cls) and not (fresh and last.get("pinged")):
            ping = bool(self.d["ping"](f"⚠️ Clerk box: {component} needs attention ({cls.replace('_', ' ')}). Instinct has the details."))
        if how or ping:                                   # a total failure is not recorded, so the next error retries
            s[fp] = {"at": (last["at"] if fresh else now.isoformat(timespec="seconds")), "how": how, "class": cls,
                     "component": component, "pinged": ping or bool(fresh and last.get("pinged"))}
            self._save(s)
        return {"cls": cls, "how": how or "failed", "ping": ping}
