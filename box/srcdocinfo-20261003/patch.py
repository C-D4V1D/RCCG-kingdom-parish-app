#!/usr/bin/env python3
r"""srcdocinfo-20261003: /month gets a SOURCE DOCUMENTS section and attendance filing from the RCCG portal.

  python3 patch.py --check   only check that every change applies (changes nothing)
  python3 patch.py           apply (all or nothing; safe to run twice: files that already have the marker are skipped)

New files (installed by install.sh): tools/srcdocinfo.py (sources, cache, wording data) and tools/portal-month.cjs
(read-only portal reads: GETs plus the sign-in). Each anchor must match exactly once (whitespace-insensitive) and every
patched file must compile, or nothing is written.

  tools/monthinfo.py        after ATTENDANCE FILING: SOURCE DOCUMENTS (Admin, Finance: uploaded on <day> / not uploaded
                            yet, upload open until <day> / needs the financial report / ...; each with its source).
                            attendance_line(): the portal's stored attendance when the box has no record of its own.
                            next_step(): adds an outstanding upload after the cut-off ("Upload the Finance source
                            document"), with "/upload" only for a viewer who can upload for that parish.
  tools/satinfo.py          month_text(..., viewer=): passes who is looking; `satinfo.py month CODE [YYYY-MM] [--viewer ID]`.
  tools/satbot.py           a pastor's /month passes their chat as the viewer.
  tools/monthpick.py        the parish picker passes the viewer to satinfo.py.
  telegram/srcdoc/poller.py Kingdom's /month and the picker pass the viewer.
"""
import os, py_compile, re, shutil, sys, tempfile

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "srcdocinfo-20261003"

MI_SEC_OLD = r'''    L += ["", "<b>ATTENDANCE FILING</b>", f"• {E(attendance_line(f))}"]
    if srcdoc:
        L += ["", "<b>SOURCE DOCUMENTS</b>"] + list(srcdoc)'''
MI_SEC_NEW = r'''    L += ["", "<b>ATTENDANCE FILING</b>", f"• {E(attendance_line(f))}"]
    sd = srcdoc_lines(f)  # srcdocinfo-20261003: this parish's month, portal first (the old tap-to-check note is dropped)
    if sd is not None:
        extra = [x for x in (srcdoc or []) if "upload slots" not in str(x)]
        L += ["", "<b>SOURCE DOCUMENTS</b>"] + [E(x) for x in sd] + (["Upload slots open on the portal now:"] + list(extra) if extra else [])
    elif srcdoc:
        L += ["", "<b>SOURCE DOCUMENTS</b>"] + list(srcdoc)'''
MI_DEFS_OLD = r'''def month_text(f, parish=None, srcdoc=None):'''
MI_DEFS_NEW = r'''# ---------------------------------------------------------------- srcdocinfo-20261003: SOURCE DOCUMENTS, attendance from the portal
try:
    import srcdocinfo as SDI
except Exception:
    SDI = None
_attendance_line_box, _next_step_before_srcdoc = attendance_line, next_step
SRCDOC_SOURCES = {"portal": "RCCG portal", "bot": "Telegram bot's records"}


def _code(f):
    return str(f.get("code") or "602757")


def srcdoc_facts(f):
    """{admin, finance, attendance} for the parish and month, worked out once; None = no section."""
    if not isinstance(f, dict) or not all(k in f for k in ("month", "end", "today")):
        return None
    if "srcdocs" in f:
        return f["srcdocs"]
    out = None
    try:
        if SDI is not None:
            on = _cfg().parishes("source_docs", None)  # Automations -> Parishes -> Source documents
            if not (isinstance(on, dict) and _code(f) not in on):
                mode = _cfg().bot_settings().get("month_portal_check", "button")  # "off" = never read the portal
                bot = SDI.bot_records(_code(f), f["month"])
                p = None if mode == "off" else SDI.portal(_code(f), f["month"], bot=bot)
                out = SDI.combine(p, bot, f["today"] > f["end"])
    except Exception:
        out = None
    f["srcdocs"] = out
    return out


def srcdoc_lines(f):
    s = srcdoc_facts(f)
    if not s:
        return None
    L = []
    for sec, lab in SDI.SECTIONS:
        x = s.get(sec) or {}
        st = x.get("state")
        if st == "uploaded":
            t = "✅ uploaded" + (f" {day(x['on'])}" if x.get("on") else "")
        elif st == "missing":
            t = "⚠️ not uploaded yet" + (f" (upload open until {day(x['closes'])})" if x.get("closes") else " (upload open)")
        elif st == "needs_report":
            t = "⏳ the portal needs the month's financial report first"
        elif st == "closed":
            t = "❌ not uploaded; the portal isn't taking uploads now"
        elif st == "not_open":
            t = "⏳ the portal's upload isn't open yet"
        elif st == "refused":
            t = f"❌ the bot's upload was refused: {x.get('why')}"
        else:
            t = "❔ couldn't check the portal, and the bot has no upload recorded"
        L.append(f"• {lab}: {t} ({SRCDOC_SOURCES.get(x.get('src'), x.get('src'))})")
    return L


def attendance_line(f):
    a = f["entry"].get("attendance") if isinstance(f.get("entry"), dict) else None
    s = None if isinstance(a, dict) else (srcdoc_facts(f) or {}).get("attendance")
    if s:
        if s.get("rows"):
            w = s.get("weeks") or 0
            return (f"✅ filed on the portal: {w} week{'s' if w != 1 else ''}"
                    + (f", last saved {day(s['on'])}" if s.get("on") else "") + " (RCCG portal)")
        if f["today"] > f["end"]:
            return "⚠️ not filed on the portal yet (RCCG portal)"
    return _attendance_line_box(f)


def _viewer_uploads(f):
    """Can the person looking upload this parish's documents with the bot (Automations -> People and -> Telegram bot)?"""
    v = f.get("viewer")
    if v in (None, ""):
        return False
    try:
        import botmenu as BM
        p = BM.person(v)
        return bool(p and BM.allowed(v, "upload") and (p.get("admin") or str(p.get("parish")) == _code(f)))
    except Exception:
        return False


def next_step(f):
    t = _next_step_before_srcdoc(f)
    try:
        s = srcdoc_facts(f) or {}
        todo = [(sec, lab) for sec, lab in SDI.SECTIONS if (s.get(sec) or {}).get("todo")] if SDI else []
        if not todo:
            return t
        doc = f"Upload the {' and '.join(lab for _, lab in todo)} source document{'s' if len(todo) > 1 else ''}"
        closes = next((s[sec]["closes"] for sec, _ in todo if s[sec].get("closes")), None)
        doc += (f" (the portal closes {day(closes)})" if closes else "") + (" with /upload." if _viewer_uploads(f) else ".")
        if t.startswith("Nothing. The RRR is paid"):
            return "The RRR is paid ✅. " + doc
        if t.startswith("Nothing"):
            return doc
        return f"{t} Then: {doc[0].lower()}{doc[1:]}"
    except Exception:
        return t


def month_text(f, parish=None, srcdoc=None):'''

SI_DEF_OLD = r'''def month_text(P, month=None, srcdoc=None):'''
SI_DEF_NEW = r'''def month_text(P, month=None, srcdoc=None, viewer=None):  # srcdocinfo-20261003: viewer = the chat looking'''
SI_F_OLD = r'''            f["code"] = P.code  # remitinfo-20261003: the portal is asked for this parish's RRR'''
SI_F_NEW = r'''            f["code"] = P.code  # remitinfo-20261003: the portal is asked for this parish's RRR
            f["viewer"] = viewer  # srcdocinfo-20261003'''
SI_CLI_OLD = r'''        print(month_text(Parish(a[1]), a[2] if len(a) > 2 else None))'''
SI_CLI_NEW = r'''        _v = a[a.index("--viewer") + 1] if "--viewer" in a and a.index("--viewer") + 1 < len(a) else None  # srcdocinfo-20261003
        _m = next((x for x in a[2:] if re.fullmatch(r"\d{4}-\d{2}", x)), None)
        print(month_text(Parish(a[1]), _m, viewer=_v))'''
SB_OLD = r'''    return out(S.month_text(P, m, srcdoc=src), True, kb=kb)'''
SB_NEW = r'''    return out(S.month_text(P, m, srcdoc=src, viewer=chat), True, kb=kb)  # srcdocinfo-20261003'''
MP_OLD = r'''def sat_month_text(code, month=None):'''
MP_NEW = r'''def sat_month_text(code, month=None, viewer=None):  # srcdocinfo-20261003: viewer = the chat looking'''
MP_RUN_OLD = r'''    r = subprocess.run([PY, os.path.join(TOOLS, "satinfo.py"), "month", str(code)] + ([month] if month else []),'''
MP_RUN_NEW = r'''    r = subprocess.run([PY, os.path.join(TOOLS, "satinfo.py"), "month", str(code)] + ([month] if month else [])
                       + (["--viewer", str(viewer)] if viewer is not None else []),'''
MP_FAKE_OLD = r'''        sat_month_text = staticmethod(lambda code, m=None: f"MONTH {code} {m}")'''
MP_FAKE_NEW = r'''        sat_month_text = staticmethod(lambda code, m=None, viewer=None: f"MONTH {code} {m}")'''
PO_K_OLD = r'''        _send_long(chat, MI.month_text(MI.facts(month=m, prefer_open=True), srcdoc=src), kb)'''
PO_K_NEW = r'''        f = MI.facts(month=m, prefer_open=True)
        if isinstance(f, dict) and not f.get("error"):
            f["viewer"] = chat  # srcdocinfo-20261003: /upload is mentioned only to people who can upload
        _send_long(chat, MI.month_text(f, srcdoc=src), kb)'''
PO_P_OLD = r'''        _send_long(chat, MP.sat_month_text(code, m))'''
PO_P_NEW = r'''        _send_long(chat, MP.sat_month_text(code, m, chat))  # srcdocinfo-20261003'''

CHANGES = {
    "tools/monthinfo.py": [(MI_SEC_OLD, MI_SEC_NEW), (MI_DEFS_OLD, MI_DEFS_NEW)],
    "tools/satinfo.py": [(SI_DEF_OLD, SI_DEF_NEW), (SI_F_OLD, SI_F_NEW), (SI_CLI_OLD, SI_CLI_NEW)],
    "tools/satbot.py": [(SB_OLD, SB_NEW)],
    "tools/monthpick.py": [(MP_OLD, MP_NEW), (MP_RUN_OLD, MP_RUN_NEW), (MP_FAKE_OLD, MP_FAKE_NEW)],
    "telegram/srcdoc/poller.py": [(PO_K_OLD, PO_K_NEW), (PO_P_OLD, PO_P_NEW)],
}


def _find(s, anchor):
    """Where the anchor is in the file, ignoring differences in spaces and line breaks: a list of (start, end)."""
    rx = r"\s+".join(re.escape(w) for w in anchor.split())
    return [(m.start(), m.end()) for m in re.finditer(rx, s)]


def main():
    check = "--check" in sys.argv
    tmp = tempfile.mkdtemp(prefix="srcdocinfo-patch-")
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
