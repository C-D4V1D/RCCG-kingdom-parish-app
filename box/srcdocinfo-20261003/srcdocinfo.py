#!/usr/bin/env python3
"""Source documents and attendance filing of a parish's month, for /month (srcdocinfo-20261003).

Sources, best first; each line says where it came from:
  portal  the RCCG portal (read-only: tools/portal-month.cjs, GETs only): Admin and Finance source documents uploaded or not
          (with the upload time), whether the upload is open (and until when), whether the month's financial report exists
          (Finance needs it), and the month's stored attendance rows.
  bot     the Telegram upload bot's own records ("upload result" lines in telegram/srcdoc/poller.log).
The portal answer is kept in state/srcdocinfo-cache.json: when both documents are uploaded and attendance is filed, for 30
days; otherwise for 30 minutes; a failed read for 10 minutes. A new upload by the bot makes the next /month read again.
Automations -> Telegram bot -> "Check portal upload slots on the Month screen" = Never: the portal is not read (bot records
only). A parish with "Source documents" off in Automations -> Parishes gets no section. Never sends anything.
With SRCDOCINFO_OFFLINE=1 nothing is read from the portal.

  srcdocinfo.py show CODE YYYY-MM   print the portal's answer (read-only) and the bot's records
  srcdocinfo.py selftest [--render] offline test with made-up answers and records (and, with --render, the patched
                                    /month screen); nothing read, nothing sent
"""
import datetime, json, os, re, subprocess, sys, time

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
TOOLS = os.path.join(ROOT, "tools")
CACHE = os.environ.get("SRCDOCINFO_CACHE", os.path.join(ROOT, "state", "srcdocinfo-cache.json"))
BOTLOG = os.environ.get("SRCDOCINFO_BOTLOG", os.path.join(ROOT, "telegram", "srcdoc", "poller.log"))
NODE = os.environ.get("MONTHEND_NODE", "node")
HELPER = os.path.join(TOOLS, "portal-month.cjs")
TTL = {"complete": 30 * 86400, "other": 30 * 60, "error": 10 * 60}
MON = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
SECTIONS = (("admin", "Admin"), ("finance", "Finance"))


def _offline():
    return os.environ.get("SRCDOCINFO_OFFLINE") == "1"


def _rcache():
    try:
        c = json.load(open(CACHE))
        return c if isinstance(c, dict) else {}
    except Exception:
        return {}


def _wcache(key, val):
    try:
        c = _rcache()
        now = time.time()
        c = {k: v for k, v in c.items() if isinstance(v, dict) and now - v.get("at", 0) < TTL["complete"]}
        c[key] = val
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        tmp = f"{CACHE}.{os.getpid()}.tmp"
        json.dump(c, open(tmp, "w"), indent=1)
        os.replace(tmp, CACHE)
    except Exception:
        pass


def bot_records(code, month, log=None):
    """{"admin"|"finance": {"at": "YYYY-MM-DD HH:MM:SS", "who": name} | {"refused": reason}} from the upload bot's log."""
    y, m = month.split("-")
    mon = MON[int(m) - 1]
    out = {}
    try:
        lines = open(log or BOTLOG, encoding="utf-8", errors="replace").read().splitlines()
    except Exception:
        return out
    rx = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) upload result (\S+) (admin|finance) (\d+) (\w{3}) (\d{4}) (\{.*\})\s*$")
    for line in lines:
        mm = rx.match(line)
        if not mm or mm.group(4) != str(code) or mm.group(5) != mon or mm.group(6) != y:
            continue
        try:
            r = json.loads(mm.group(7))
        except Exception:
            continue
        sec = mm.group(3)
        if r.get("uploaded"):
            out[sec] = {"at": mm.group(1), "who": mm.group(2)}
        elif r.get("refused") and not (out.get(sec) or {}).get("at"):
            out[sec] = {"refused": str(r.get("error") or "refused")[:80]}
    return out


def _complete(d):
    return bool(d and (d.get("admin") or {}).get("uploaded") and (d.get("finance") or {}).get("uploaded")
                and ((d.get("attendance") or {}).get("rows") or 0) > 0)


def portal(code, month, bot=None, run=None):
    """The portal's answer (see portal-month.cjs) or None when it couldn't be read (or reading is off)."""
    key = f"{code}|{month}"
    e = _rcache().get(key)
    if isinstance(e, dict):
        kind = "error" if e.get("error") else ("complete" if _complete(e.get("data")) else "other")
        newer = any((r.get("at") or "") > datetime.datetime.fromtimestamp(e.get("at", 0)).strftime("%Y-%m-%d %H:%M:%S")
                    for r in (bot or {}).values())
        if time.time() - e.get("at", 0) < TTL[kind] and not newer:
            return None if e.get("error") else e.get("data")
    if _offline() and run is None:
        return None
    try:
        if run is None:
            r = subprocess.run([NODE, HELPER, str(code), month], capture_output=True, text=True, timeout=120)
            out = r.stdout
        else:
            out = run(code, month)
        d = json.loads([l for l in out.strip().splitlines() if l.startswith("{")][-1])
        if not d.get("ok"):
            raise RuntimeError(str(d.get("error"))[:120])
        _wcache(key, {"at": time.time(), "data": d})
        return d
    except Exception as ex:
        _wcache(key, {"at": time.time(), "error": f"{type(ex).__name__}: {ex}"[:160]})
        return None


def local_day(ts):
    """'2026-09-27T16:20:03.965Z' or '2026-09-27 17:20:04' (box time) -> a date in the box's time zone, or None."""
    if not ts:
        return None
    try:
        s = str(ts)
        if s.endswith("Z") or "+" in s[10:]:
            return datetime.datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone().date()
        return datetime.date.fromisoformat(s[:10])
    except Exception:
        return None


def combine(p, bot, ended):
    """{"admin"|"finance": {"state", "on", "src", "closes", "todo"}, "attendance": {...} | None}.
    state: uploaded | missing (upload open) | needs_report | closed | not_open | unknown. todo: an upload is outstanding."""
    out = {}
    for sec, _ in SECTIONS:
        q = (p or {}).get(sec) if p else None
        b = (bot or {}).get(sec) or {}
        if q is not None:
            if q.get("uploaded"):
                st = {"state": "uploaded", "on": local_day(q.get("at")) or local_day(b.get("at")), "src": "portal"}
            elif sec == "finance" and q.get("report") is False:
                st = {"state": "needs_report", "src": "portal"}
            elif q.get("open"):
                st = {"state": "missing", "src": "portal", "closes": q.get("closes"), "todo": ended}
            else:
                st = {"state": "closed" if ended else "not_open", "src": "portal"}
        elif b.get("at"):
            st = {"state": "uploaded", "on": local_day(b["at"]), "src": "bot"}
        elif b.get("refused"):
            st = {"state": "refused", "src": "bot", "why": b["refused"]}
        else:
            st = {"state": "unknown", "src": "bot"}
        out[sec] = st
    a = (p or {}).get("attendance") if p else None
    out["attendance"] = None if a is None else {"rows": a.get("rows") or 0, "weeks": a.get("weeks") or 0,
                                                "on": local_day(a.get("stored_at")), "src": "portal"}
    return out


def _selftest():
    import tempfile
    global CACHE
    old = CACHE
    d = tempfile.mkdtemp(prefix="srcdocinfo-test-")
    CACHE = os.path.join(d, "cache.json")
    try:
        log = os.path.join(d, "poller.log")
        open(log, "w").write(
            "2026-09-27 15:11:59 upload result Tester admin 100002 Sep 2026 {\"ok\": true, \"uploaded\": true}\n"
            "2026-09-28 14:35:08 upload result Tester finance 100002 Sep 2026 {\"ok\": false, \"uploaded\": null, \"refused\": true, \"error\": \"no financial report for this month\"}\n"
            "2026-09-28 14:35:09 upload result Tester admin 100003 Sep 2026 {\"ok\": true, \"uploaded\": true}\n"
            "2026-09-28 14:35:10 something else\n")
        b = bot_records("100002", "2026-09", log)
        assert b == {"admin": {"at": "2026-09-27 15:11:59", "who": "Tester"}, "finance": {"refused": "no financial report for this month"}}, b
        full = {"ok": True, "admin": {"uploaded": True, "at": "2026-09-27T16:20:03.965Z", "open": True, "closes": "2026-10-03"},
                "finance": {"uploaded": True, "at": "2026-09-27T16:20:07.984Z", "open": True, "report": True},
                "attendance": {"rows": 16, "weeks": 4, "stored_at": "2026-09-27T15:04:24.173Z"}}
        calls = []

        def run(code, month):
            calls.append(code); return json.dumps(full)
        assert portal("100001", "2026-09", run=run)["admin"]["uploaded"] and len(calls) == 1
        assert portal("100001", "2026-09", run=run) and len(calls) == 1, "a complete month must come from the cache"
        assert portal("100004", "2026-09", run=lambda c, m: "{\"ok\": false}") is None
        assert portal("100004", "2026-09", run=run) is None and len(calls) == 1, "a failed read is not retried for 10 minutes"
        part = json.loads(json.dumps(full)); part["finance"] = {"uploaded": False, "open": True, "report": True}
        _wcache("100005|2026-09", {"at": time.time() - 60, "data": part})
        fresh = {"finance": {"at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "who": "Tester"}}
        assert portal("100005", "2026-09", bot=fresh, run=run) == full and len(calls) == 2, "a new bot upload must read again"
        c = combine(full, {}, True)
        assert c["admin"]["state"] == "uploaded" and c["admin"]["on"] == local_day("2026-09-27T16:20:03.965Z")
        assert c["attendance"]["rows"] == 16
        c = combine(part, {}, True)
        assert c["finance"] == {"state": "missing", "src": "portal", "closes": None, "todo": True}, c
        nor = json.loads(json.dumps(part)); nor["finance"]["report"] = False
        assert combine(nor, {}, True)["finance"]["state"] == "needs_report"
        c = combine(None, b, True)
        assert c["admin"]["state"] == "uploaded" and c["admin"]["src"] == "bot" and c["finance"]["state"] == "refused"
        assert c["attendance"] is None
        assert combine(None, {}, False)["finance"]["state"] == "unknown"
    finally:
        CACHE = old
    print("selftest OK (made-up portal answers and bot records; nothing read, nothing sent)")


def _selftest_render():
    """The patched monthinfo.py's SOURCE DOCUMENTS, attendance and Next step with made-up facts (nothing read or sent)."""
    os.environ["SRCDOCINFO_OFFLINE"] = "1"
    os.environ["REMITINFO_OFFLINE"] = "1"
    sys.path.insert(0, TOOLS)
    import monthinfo as MI
    d = datetime.date
    base = {"month": "2026-09", "start": d(2026, 8, 24), "end": d(2026, 9, 20), "today": d(2026, 10, 1), "report": True,
            "total": 1000.0, "entry": {}, "sundays": [{"date": d(2026, 9, 20), "collection": True, "attendance": "submitted"}],
            "remit": {"rrr": "1", "rrr_src": "portal", "paid": True, "paid_src": "portal", "with_fee": 5.0, "amount_src": "portal"}}
    up = {"state": "uploaded", "on": d(2026, 9, 27), "src": "portal"}
    cases = [
        ({"admin": up, "finance": up, "attendance": {"rows": 16, "weeks": 4, "on": d(2026, 9, 29), "src": "portal"}},
         ["<b>SOURCE DOCUMENTS</b>", "• Admin: ✅ uploaded Sun 27 Sep (RCCG portal)", "• Finance: ✅ uploaded Sun 27 Sep (RCCG portal)",
          "• ✅ filed on the portal: 4 weeks, last saved Tue 29 Sep (RCCG portal)", "Next step:</b> Nothing. The RRR is paid ✅."]),
        ({"admin": up, "finance": {"state": "missing", "src": "portal", "closes": "2026-10-03", "todo": True},
          "attendance": {"rows": 0, "weeks": 0, "on": None, "src": "portal"}},
         ["• Finance: ⚠️ not uploaded yet (upload open until Sat 3 Oct) (RCCG portal)", "⚠️ not filed on the portal yet (RCCG portal)",
          "The RRR is paid ✅. Upload the Finance source document (the portal closes Sat 3 Oct)."]),
        ({"admin": {"state": "uploaded", "on": d(2026, 9, 27), "src": "bot"}, "finance": {"state": "refused", "src": "bot", "why": "no financial report for this month"},
          "attendance": None},
         ["• Admin: ✅ uploaded Sun 27 Sep (Telegram bot's records)", "• Finance: ❌ the bot's upload was refused: no financial report for this month (Telegram bot's records)",
          "no record on the box (the month-end was done outside the automation)"]),
        (None, ["Next step"]),
    ]
    order = ("<b>REMITTANCE</b>", "<b>ATTENDANCE FILING</b>", "<b>SOURCE DOCUMENTS</b>", "<b>Next step:</b>")
    for sd, want in cases:
        f = dict(base, srcdocs=sd, sundays=[dict(x) for x in base["sundays"]], entry={})
        t = MI.month_text(f, srcdoc=["Tap the button below to check the upload slots on the portal (about a minute)."])
        for w in want:
            assert w in t, f"missing {w!r} in:\n{t}"
        assert "check the upload slots" not in t or sd is None
        if sd:
            pos = [t.index(o) for o in order]
            assert pos == sorted(pos), "the order must be REMITTANCE, ATTENDANCE FILING, SOURCE DOCUMENTS, Next step"
    print(f"screens OK ({len(cases)} made-up months rendered; nothing read, nothing sent)")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["selftest"]:
        _selftest()
        if "--render" in a:
            _selftest_render()
    elif a[:1] == ["show"] and len(a) >= 3:
        b = bot_records(a[1], a[2])
        print(json.dumps({"portal": portal(a[1], a[2], bot=b), "bot": b}, indent=1, default=str))
    else:
        print(__doc__)
        sys.exit(2)
