#!/usr/bin/env python3
r"""month-parishes-20261003: /month can show another parish's month, for the people allowed in the app.

  python3 patch.py --check   only check that every change applies (changes nothing)
  python3 patch.py           apply (all or nothing; safe to run twice: files that already have the marker are skipped)

New file tools/monthpick.py (installed by install.sh): who may pick a parish (Automations -> People -> "Can view other
parishes' month", people[].month_all_parishes) and the parish buttons (Automations -> Parishes). One file is patched;
the anchor must match exactly once (whitespace-insensitive) and the file must compile, or nothing is written.

  telegram/srcdoc/poller.py   a block before main(): later definitions of handle_message and handle_callback that
                              wrap the botmenu-20261003 ones. "Which month?" gets an "Other parishes »" row for an
                              allowed person; the "mpar|..." buttons pick a parish, then This month / Previous months.
                              Every press asks monthpick.allowed() again (the setting as it is now in the app). Anything
                              else goes to the earlier definitions unchanged. Without monthpick.py the bot is as before.
"""
import os, py_compile, re, shutil, sys, tempfile

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "month-parishes-20261003"

PO_OLD = r'''def main():
    os.makedirs(WORK, exist_ok=True)'''
PO_NEW = r'''# ---------------- month-parishes-20261003: /month for another parish (Automations -> People and -> Parishes) ----------------
# The definitions below wrap the ones above. Who may pick a parish is asked again on every button press (monthpick.allowed).
try:
    import monthpick as MP
except Exception as _e:
    MP = None
    log("monthpick import failed, /month shows Kingdom Parish only:", repr(_e)[:300])


def _mp(fn, *a, default=None):
    if MP is None:
        return default
    try:
        return getattr(MP, fn)(*a)
    except Exception:
        log("monthpick", fn, traceback.format_exc()[-400:]); return default


def _mp_parishes(chat):
    """[(code, name)] this person may pick right now; [] means /month as before (Kingdom Parish only)."""
    if MP is None or not _known(chat) or not _can(chat, "month") or _is_sat(chat):
        return []
    return _mp("allowed", chat, default=[]) or []


def _send_parish_month(chat, code, m):
    try:
        if code == "602757":
            _send_month_report(chat, m); return  # Kingdom Parish: the usual screen
        send(chat, f"Reading {_mp('name', code, default=code)} in the parish app (this can take a minute)...")
        _send_long(chat, MP.sat_month_text(code, m))
    except Exception:
        log("parish month error", code, traceback.format_exc()[-600:]); send(chat, "Sorry, I couldn't read that parish's month right now.")


_handle_message_before_monthpick = handle_message


def handle_message(st, msg):
    chat = msg.get("chat", {}); cid = (msg.get("from") or {}).get("id")
    if chat.get("type") == "private" and cid and not (msg.get("photo") or msg.get("document")):
        w, arg, _m = _words(msg)
        if w == "/month" and not arg and _mp_parishes(cid):
            _go(_bm, "retry_chat", cid, api)
            send(cid, "Which month?", kb_month_start() + [[{"text": MP.OTHER, "callback_data": "mpar|list|"}]]); return
    return _handle_message_before_monthpick(st, msg)


_handle_callback_before_monthpick = handle_callback


def handle_callback(st, cq):
    chat = cq["from"]["id"]; data = cq.get("data") or ""
    if not (data.startswith("mpar|") or data == "month|back|"):
        return _handle_callback_before_monthpick(st, cq)
    ps = dict(_mp_parishes(chat))
    if data == "month|back|" and not ps:
        return _handle_callback_before_monthpick(st, cq)  # "« Back" for everyone else: as before
    _, act, code, ym = (data.split("|") + ["", "", ""])[:4]
    if not ps or (code and code not in ps):
        api("answerCallbackQuery", callback_query_id=cq["id"], text="This isn't available for you."); return
    api("answerCallbackQuery", callback_query_id=cq["id"])
    drop_kb(chat, (cq.get("message") or {}).get("message_id"))
    if act == "list":
        send(chat, "Which parish?", MP.kb_parishes(chat))
    elif act == "pick" and code:
        send(chat, f"{ps[code]}: which month?", MP.kb_parish_month(code))
    elif act == "prev" and code:
        import monthinfo as MI
        send(chat, f"{ps[code]}: choose a month:", MP.kb_parish_prev(code, _recent_months(int(_bset("previous_months", 6))), MI.month_label))
    elif act == "go" and code and (not ym or re.fullmatch(r"\d{4}-\d{2}", ym)):
        _go(_send_parish_month, chat, code, ym or None)
    else:
        send(chat, "Which month?", kb_month_start() + [[{"text": MP.OTHER, "callback_data": "mpar|list|"}]])


def main():
    os.makedirs(WORK, exist_ok=True)'''

CHANGES = {"telegram/srcdoc/poller.py": [(PO_OLD, PO_NEW)]}


def _find(s, anchor):
    """Where the anchor is in the file, ignoring differences in spaces and line breaks: a list of (start, end)."""
    rx = r"\s+".join(re.escape(w) for w in anchor.split())
    return [(m.start(), m.end()) for m in re.finditer(rx, s)]


def main():
    check = "--check" in sys.argv
    tmp = tempfile.mkdtemp(prefix="month-parishes-patch-")
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
