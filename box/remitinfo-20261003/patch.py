#!/usr/bin/env python3
r"""remitinfo-20261003: /month shows the RRR, the amount remitted and the paid status whenever they are known.

  python3 patch.py --check   only check that every change applies (changes nothing)
  python3 patch.py           apply (all or nothing; safe to run twice: files that already have the marker are skipped)

Before, the REMITTANCE section only knew an RRR the box itself had made (rccg-remit/runs/rrr-YYYY-MM.json) and a payment
the box had confirmed on Remita (state/monthclose.json). A month done outside the automation (by hand or by the Clerk AI)
showed neither, and a satellite parish's RRR file was never looked for in the right place. New file tools/remitinfo.py
(installed by install.sh) reads the RCCG portal's invoices (read-only, cached), the app's Remittances and the box's
files, best first, and every line says where it came from. Each anchor must match exactly once (whitespace-insensitive)
and every patched file must compile, or nothing is written.

  tools/monthinfo.py   month_text(): the RRR / amount / paid lines come from remit_lines(); rrr_info() and _paid() (used
                       by the Month-end line and Next step) also use the portal and the app, the box's files last.
                       The Month-end line no longer repeats the RRR (it has its own line).
  tools/satinfo.py     month_text(): tells monthinfo which parish it is (its code), so the portal is asked for that parish.
"""
import os, py_compile, re, shutil, sys, tempfile

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "remitinfo-20261003"

MI_OUT_OLD = r'''        rrr = rrr_info(f).get("code")
        if rrr:
            return f"✅ RRR {rrr} generated"'''
MI_OUT_NEW = r'''        rrr = rrr_info(f).get("code")
        if rrr:  # remitinfo-20261003: the RRR has its own line now
            return "✅ RRR generated (outside the automation)"'''
MI_DONE_OLD = r'''        "done": f"✅ RRR {rrr} generated" if rrr else "✅ done",'''
MI_DONE_NEW = r'''        "done": "✅ RRR generated" if rrr else "✅ done",  # remitinfo-20261003'''
MI_LINES_OLD = r"""    r = rrr_info(f)
    if r.get("code"):
        pay = _paid(f)
        L.append("• Paid: " + (("✅ confirmed on Remita" + (f" ({E(_person_called(pay['by']))})" if pay.get("by") else ""))
                               if pay else "⏳ not confirmed on Remita yet"))
        if r.get("amount"):
            L.append(f"• Amount {'remitted' if pay else 'to remit'}: {naira(r['amount'])}")"""
MI_LINES_NEW = r"""    L += remit_lines(f, E)  # remitinfo-20261003: RRR, amount and paid, each with its source"""
MI_DEFS_OLD = r"""def month_text(f, parish=None, srcdoc=None):"""
MI_DEFS_NEW = r"""# ---------------------------------------------------------------- remitinfo-20261003: RRR, amount remitted, paid
# Best source first: the RCCG portal (tools/remitinfo.py, read-only, cached), the app's Remittances, the box's own files.
try:
    import remitinfo as RI
except Exception:
    RI = None
_rrr_info_box, _paid_box = rrr_info, _paid
REMIT_SOURCES = {"portal": "RCCG portal", "app": "parish app", "box": "Clerk box"}


def remit_facts(f):
    "{rrr, rrr_src, to_remit, with_fee, amount_src, paid, paid_src, app_on, paid_by} for the month, worked out once."
    if not isinstance(f, dict) or not all(k in f for k in ("month", "end", "today", "entry")):
        return {}
    if isinstance(f.get("remit"), dict):
        return f["remit"]
    out = {}
    try:
        box_rrr, box_paid = _rrr_info_box(f), _paid_box(f)
        if RI is None:
            if box_rrr.get("code"):
                out = {"rrr": box_rrr["code"], "rrr_src": "box", "with_fee": box_rrr.get("amount"), "amount_src": "box",
                       "paid": bool(box_paid), "paid_src": "box", "paid_by": (box_paid or {}).get("by")}
        else:
            p = app = None
            if f["today"] > f["end"]:  # no RRR can exist before the cut-off Sunday
                p = RI.portal(str(f.get("code") or "602757"), f["month"])
                if not RI._offline():
                    try:
                        app = RI.app_paid(app_get("remittances") or [], f["end"])
                    except Exception:
                        app = None
            out = RI.combine(p, app, box_rrr, box_paid)
    except Exception:
        out = {}
    f["remit"] = out
    return out


def rrr_info(f):
    r = remit_facts(f)
    if r.get("rrr"):
        return {"code": r["rrr"], "amount": r.get("with_fee") or r.get("to_remit")}
    return _rrr_info_box(f)


def _paid(f):
    r = remit_facts(f)
    if r.get("paid"):
        return _paid_box(f) or {"via": r.get("paid_src")}
    if r.get("paid") is False and r.get("paid_src") == "portal":
        return None
    return _paid_box(f)


def remit_lines(f, E=lambda s: html.escape(str(s), quote=False)):
    r = remit_facts(f)
    S = lambda k: REMIT_SOURCES.get(r.get(k), r.get(k) or "?")
    L = []
    if r.get("rrr"):
        L.append(f"• RRR: {E(r['rrr'])} ({S('rrr_src')})")
    paid, fee, base = r.get("paid"), r.get("with_fee"), r.get("to_remit")
    if fee or base:
        if paid:
            L.append(f"• Amount remitted: {naira(fee or base)}"
                     + (" incl. the Remita fee" if fee and base and fee != base else "") + f" ({S('amount_src')})")
        else:
            L.append(f"• Amount to remit: {naira(base or fee)}"
                     + (f" ({naira(fee)} with the Remita fee)" if fee and base and fee != base else "") + f" ({S('amount_src')})")
    if paid:
        by = f", {E(_person_called(r['paid_by']))} tapped I've paid" if r.get("paid_by") else ""
        if r.get("paid_src") == "app":
            t = "✅ recorded as paid in the parish app" + (f" on {day(r['app_on'])}" if r.get("app_on") else "")
        else:
            t = (f"✅ paid ({S('paid_src')}{by})"
                 + (f" · recorded in the parish app on {day(r['app_on'])}" if r.get("app_on") else ""))
        L.append("• Paid: " + t)
    elif r.get("rrr"):
        L.append("• Paid: " + ("⏳ not paid yet (RCCG portal)" if r.get("paid_src") == "portal" else "⏳ not confirmed on Remita yet"))
    return L


def month_text(f, parish=None, srcdoc=None):"""

SI_OLD = r"""        return MI.month_text(MI.facts(month=month, prefer_open=True), parish=P.name, srcdoc=srcdoc)"""
SI_NEW = r"""        f = MI.facts(month=month, prefer_open=True)
        if isinstance(f, dict) and not f.get("error"):
            f["code"] = P.code  # remitinfo-20261003: the portal is asked for this parish's RRR
        return MI.month_text(f, parish=P.name, srcdoc=srcdoc)"""

CHANGES = {
    "tools/monthinfo.py": [(MI_OUT_OLD, MI_OUT_NEW), (MI_DONE_OLD, MI_DONE_NEW), (MI_LINES_OLD, MI_LINES_NEW), (MI_DEFS_OLD, MI_DEFS_NEW)],
    "tools/satinfo.py": [(SI_OLD, SI_NEW)],
}


def _find(s, anchor):
    """Where the anchor is in the file, ignoring differences in spaces and line breaks: a list of (start, end)."""
    rx = r"\s+".join(re.escape(w) for w in anchor.split())
    return [(m.start(), m.end()) for m in re.finditer(rx, s)]


def main():
    check = "--check" in sys.argv
    tmp = tempfile.mkdtemp(prefix="remitinfo-patch-")
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
            hits = _find(s, old)
            if len(hits) != 1:
                errors.append(f"{rel}: a block to change was found {len(hits)} times (expected 1): {old.strip().splitlines()[0][:80]}")
                bad = True; break
            a, b = hits[0]
            s = s[:a] + new.strip() + s[b:]
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
