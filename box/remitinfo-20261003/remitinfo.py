#!/usr/bin/env python3
"""The RRR, the amount remitted and the paid status of a parish's month, for /month (remitinfo-20261003).

Sources, best first; each value says where it came from:
  portal  the RCCG finance portal's invoices for the month (read-only: rccg-remit/api-fill.js invoices). RRR, the amount to
          remit, the amount with the Remita fee, and PAID / not paid. This is also the only record of an RRR made outside
          the automation (by hand or by the Clerk AI).
  app     the parish app's Remittances (Part A, status paid, same period end): amount and the date it was recorded.
  box     the box's own month-end files (rccg-remit/runs/rrr-YYYY-MM.json) and Remita checks (state/monthclose.json).
The portal is asked only after the cut-off Sunday, and its answer is kept in state/remitinfo-cache.json: a PAID month for
30 days, anything else for 30 minutes, a failed read for 10 minutes. So /month stays fast and the portal is rarely asked.
Read-only everywhere; never sends anything. With REMITINFO_OFFLINE=1 nothing is read from the portal or the app.

  remitinfo.py show CODE YYYY-MM    print what /month would show for that parish and month (reads the portal and the app)
  remitinfo.py selftest [--render]  offline test with made-up invoices and records (and, with --render, the patched
                                    /month screen); nothing read, nothing sent
"""
import datetime, json, os, subprocess, sys, time

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
REMIT = os.path.join(ROOT, "rccg-remit")
CACHE = os.environ.get("REMITINFO_CACHE", os.path.join(ROOT, "state", "remitinfo-cache.json"))
NODE = os.environ.get("MONTHEND_NODE", "node")
KINGDOM = "602757"
TTL = {"paid": 30 * 86400, "other": 30 * 60, "error": 10 * 60}


def _offline():
    return os.environ.get("REMITINFO_OFFLINE") == "1"


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
        c = {k: v for k, v in c.items() if isinstance(v, dict) and now - v.get("at", 0) < TTL["paid"]}
        c[key] = val
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        tmp = f"{CACHE}.{os.getpid()}.tmp"
        json.dump(c, open(tmp, "w"), indent=1)
        os.replace(tmp, CACHE)
    except Exception:
        pass


def parse_invoices(d):
    """api-fill.js `invoices` output -> {"rrr", "to_remit", "with_fee", "paid", "status"} or {} (no RRR yet)."""
    for v in (d or {}).get("invoices") or []:
        for deb in v.get("debits") or []:
            if deb.get("RRR"):
                st = str(deb.get("paymentStatus") or v.get("paymentStatus") or "").upper()
                return {"rrr": str(deb["RRR"]), "to_remit": v.get("amount"), "with_fee": deb.get("amountWithFee"),
                        "status": st, "paid": st == "PAID"}
    return {}


def portal(code, month, run=None):
    """The portal's RRR for the parish and month ({} when there is none), or None when the portal couldn't be read."""
    key = f"{code}|{month}"
    e = _rcache().get(key)
    if isinstance(e, dict):
        kind = "error" if e.get("error") else ("paid" if (e.get("info") or {}).get("paid") else "other")
        if time.time() - e.get("at", 0) < TTL[kind]:
            return None if e.get("error") else e.get("info") or {}
    if _offline() and run is None:
        return None
    try:
        if run is None:
            r = subprocess.run([NODE, os.path.join(REMIT, "api-fill.js"), "invoices", "--month", month, "--parish", str(code)],
                               cwd=REMIT, capture_output=True, text=True, timeout=90)
            out = r.stdout
        else:
            out = run(code, month)
        d = json.loads(out)
        if not d.get("ok"):
            raise RuntimeError(str(d.get("error"))[:120])
        info = parse_invoices(d)
        _wcache(key, {"at": time.time(), "info": info})
        return info
    except Exception as ex:
        _wcache(key, {"at": time.time(), "error": f"{type(ex).__name__}: {ex}"[:160]})
        return None


def app_paid(rows, end):
    """The app's Part A remittance marked paid for the period ending `end` (a date or 'YYYY-MM-DD'), or None."""
    end = str(end)[:10]
    best = None
    for r in rows or []:
        if not isinstance(r, dict) or r.get("status") != "paid" or str(r.get("periodTo") or "")[:10] != end:
            continue
        if str(r.get("part") or "").lower() in ("a", ""):
            best = r if best is None or str(r.get("part") or "") == "a" else best
    if not best:
        return None
    return {"amount": best.get("amount"), "on": str(best.get("paidDate") or "")[:10] or None}


def combine(p, app, box_rrr, box_paid):
    """One answer from the three sources (portal first, then the app, then the box). Each value carries its source."""
    out = {}
    if p and p.get("rrr"):
        out.update(rrr=p["rrr"], rrr_src="portal", paid=p.get("paid"), paid_src="portal",
                   to_remit=p.get("to_remit"), with_fee=p.get("with_fee"), amount_src="portal")
    elif box_rrr and box_rrr.get("code"):
        out.update(rrr=box_rrr["code"], rrr_src="box", to_remit=None, with_fee=box_rrr.get("amount"), amount_src="box")
    if out.get("paid") is None:
        if app:
            out.update(paid=True, paid_src="app")
        elif box_paid:
            out.update(paid=True, paid_src="box")
        elif out.get("rrr"):
            out.update(paid=False, paid_src=out["rrr_src"])
    if app:
        out["app_on"] = app.get("on")
        if not out.get("with_fee") and not out.get("to_remit"):
            out.update(with_fee=app.get("amount"), amount_src="app")
    if box_paid and isinstance(box_paid, dict) and box_paid.get("by"):
        out["paid_by"] = box_paid["by"]
    return out


def _selftest():
    import tempfile
    global CACHE
    old = CACHE
    CACHE = os.path.join(tempfile.mkdtemp(prefix="remitinfo-test-"), "cache.json")
    try:
        inv = {"ok": True, "invoices": [{"amount": 1000.5, "paymentStatus": "PAID",
                                         "debits": [{"RRR": "111122223333", "amountWithFee": 1300.5, "paymentStatus": "PAID"}]}]}
        calls = []

        def run(code, month):
            calls.append((code, month)); return json.dumps(inv)
        p = portal("100002", "2026-09", run=run)
        assert p == {"rrr": "111122223333", "to_remit": 1000.5, "with_fee": 1300.5, "status": "PAID", "paid": True}, p
        assert portal("100002", "2026-09", run=run) == p and len(calls) == 1, "a PAID month must come from the cache"
        assert portal("100003", "2026-09", run=lambda c, m: "not json") is None, "a failed read must give None"
        assert portal("100003", "2026-09", run=run) is None and len(calls) == 1, "a failed read is not retried for 10 minutes"
        assert parse_invoices({"ok": True, "invoices": []}) == {}
        unpaid = parse_invoices({"invoices": [{"amount": 5, "debits": [{"RRR": "9", "amountWithFee": 6, "paymentStatus": "PAYMENT INITIATED"}]}]})
        assert unpaid["paid"] is False
        rows = [{"status": "paid", "periodTo": "2026-09-20", "part": "b", "amount": 10, "paidDate": "2026-09-27"},
                {"status": "paid", "periodTo": "2026-09-20", "part": "a", "amount": 1300.4, "paidDate": "2026-09-23"},
                {"status": "paid", "periodTo": "2026-08-23", "part": "a", "amount": 7}]
        a = app_paid(rows, datetime.date(2026, 9, 20))
        assert a == {"amount": 1300.4, "on": "2026-09-23"}, a
        assert app_paid(rows, "2026-10-25") is None
        c = combine(p, a, None, None)
        assert c["rrr_src"] == "portal" and c["paid"] is True and c["paid_src"] == "portal" and c["app_on"] == "2026-09-23"
        c = combine(None, a, None, None)
        assert c.get("rrr") is None and c["paid"] is True and c["paid_src"] == "app" and c["amount_src"] == "app"
        c = combine(None, None, {"code": "5", "amount": 9}, {"by": "k1"})
        assert c["rrr_src"] == "box" and c["paid_src"] == "box" and c["paid_by"] == "k1"
        c = combine(unpaid, a, None, None)
        assert c["paid"] is False and c["paid_src"] == "portal", "the portal wins over the app"
        assert combine(None, None, None, None) == {}
    finally:
        CACHE = old
    print("selftest OK (made-up invoices and records; nothing read, nothing sent)")


def _selftest_render():
    """The patched monthinfo.py's REMITTANCE lines with made-up facts (REMITINFO_OFFLINE: nothing read, nothing sent)."""
    os.environ["REMITINFO_OFFLINE"] = "1"
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    import monthinfo as MI
    d = datetime.date
    base = {"month": "2026-09", "start": d(2026, 8, 24), "end": d(2026, 9, 20), "today": d(2026, 10, 3), "report": True,
            "total": 1000.0, "entry": {}, "sundays": [{"date": d(2026, 9, 20), "collection": True, "attendance": "submitted"}]}
    cases = [
        ({"rrr": "111122223333", "rrr_src": "portal", "paid": True, "paid_src": "portal", "to_remit": 500.0, "with_fee": 800.0,
          "amount_src": "portal", "app_on": "2026-09-23"},
         ["• RRR: 111122223333 (RCCG portal)", "• Amount remitted: ₦800.00 incl. the Remita fee (RCCG portal)",
          "• Paid: ✅ paid (RCCG portal) · recorded in the parish app on Wed 23 Sep",
          "• Month-end: ✅ RRR generated (outside the automation)", "Nothing. The RRR is paid ✅."]),
        ({"rrr": "111122223333", "rrr_src": "portal", "paid": False, "paid_src": "portal", "to_remit": 500.0, "with_fee": 800.0,
          "amount_src": "portal"},
         ["• Amount to remit: ₦500.00 (₦800.00 with the Remita fee) (RCCG portal)", "• Paid: ⏳ not paid yet (RCCG portal)",
          "pay the RRR"]),
        ({"paid": True, "paid_src": "app", "with_fee": 700.0, "amount_src": "app", "app_on": "2026-09-23"},
         ["• Amount remitted: ₦700.00 (parish app)", "• Paid: ✅ recorded as paid in the parish app on Wed 23 Sep"]),
        ({}, ["• Month-end: no box run recorded (done outside the automation)"]),
    ]
    for remit, want in cases:
        f = json.loads(json.dumps(base, default=str))
        for k in ("start", "end", "today"):
            f[k] = MI._d(f[k])
        f["sundays"][0]["date"] = MI._d(f["sundays"][0]["date"])
        f["remit"] = remit
        t = MI.month_text(f)
        for w in want:
            assert w in t, f"missing {w!r} in:\n{t}"
    print(f"screens OK ({len(cases)} made-up months rendered; nothing read, nothing sent)")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["selftest"]:
        _selftest()
        if "--render" in a:
            _selftest_render()
    elif a[:1] == ["show"] and len(a) >= 3:
        print(json.dumps(portal(a[1], a[2]), indent=1))
    else:
        print(__doc__)
        sys.exit(2)
