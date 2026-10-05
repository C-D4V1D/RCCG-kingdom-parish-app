#!/usr/bin/env python3
r"""followticks-20261003: two box jobs follow their Automations settings instead of a built-in rule.

  python3 patch.py --check   only check that every change applies (changes nothing)
  python3 patch.py           apply (all or nothing; safe to run twice: files that already have the marker are skipped)

  tools/clerkcfg.py           new memo_days() (Automations -> Memo forwarding -> Days to check, as weekday numbers;
                              Mon-Sat when not set) and weekly_records_who() (who gets the weekly Sunday-records message);
                              apply() also writes "memo_days" into the scheduler's sched_config.json.
  tools/reminders.py          the weekly Sunday-records message goes to weekly_records_who() instead of the built-in
                              person. Until the app has saved the ticks for this message (the app adds
                              automations.weekly_attendance_reminder.follow_ticks = true on Save), it is exactly as before:
                              only the built-in person, if ticked. After that: everyone ticked for
                              "Sunday records: weekly message" (Telegram) who has a chat id.
  telegram/srcdoc/boxsched.py the scheduler's Clerk AI back-up for the memo check only runs on the memo days
                              (sched_config.json "memo_days"; Mon-Sat when missing, i.e. as before). The Sunday check
                              with the Sunday note is unchanged.
Each anchor must match exactly once (whitespace-insensitive) and every file must compile, or nothing is written.
"""
import os, py_compile, re, shutil, sys, tempfile

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "followticks-20261003"

CC_APPLY_OLD = r'''sc.update({"memo": enabled("memo"), "memo_time": plus(get("automations.memo.check_time", "08:45"), 6),'''
CC_APPLY_NEW = r'''sc.update({"memo": enabled("memo"), "memo_time": plus(get("automations.memo.check_time", "08:45"), 6),
                   "memo_days": memo_days(),  # followticks-20261003: the AI back-up follows "Days to check"'''
CC_DEFS_OLD = r'''def parish_name(code, default=None):'''
CC_DEFS_NEW = r'''def memo_days():  # followticks-20261003
    """Weekday numbers (Mon = 0) from Automations -> Memo forwarding -> Days to check; Mon-Sat when not set (the same rule as the box's own memo check)."""
    d = get("automations.memo.days", None)
    return sorted({DAYS.index(x) for x in d if x in DAYS}) if isinstance(d, list) else list(range(6))


def weekly_records_who(legacy="divine"):  # followticks-20261003
    """Who gets the weekly Sunday-records message on Telegram (comma list). Once the app has saved the ticks for it
    (automations.weekly_attendance_reminder.follow_ticks), the Kingdom people ticked for it; before that, as the box
    always did: only `legacy`, if ticked (and `legacy` when there is no saved config)."""
    if get("automations.weekly_attendance_reminder.follow_ticks", False) is True:
        return who("weekly_attendance_reminder", legacy)
    return one("weekly_attendance_reminder", legacy)


def parish_name(code, default=None):'''
RE_OLD = r'''        if t: tg(C.one("weekly_attendance_reminder", "divine"), t, "weekly_attendance_reminder")'''
RE_NEW = r'''        if t: tg(C.weekly_records_who("divine"), t, "weekly_attendance_reminder")  # followticks-20261003: the app's ticks'''
BS_OLD = r'''want_memo = (wd <= 5 and c["memo"] and at_or_after(t, c["memo_time"]))'''
BS_NEW = r'''want_memo = (wd <= 5 and wd in (range(6) if c.get("memo_days") is None else c["memo_days"]) and c["memo"] and at_or_after(t, c["memo_time"]))  # followticks-20261003'''

CHANGES = {
    "tools/clerkcfg.py": [(CC_APPLY_OLD, CC_APPLY_NEW), (CC_DEFS_OLD, CC_DEFS_NEW)],
    "tools/reminders.py": [(RE_OLD, RE_NEW)],
    "telegram/srcdoc/boxsched.py": [(BS_OLD, BS_NEW)],
}


def _find(s, anchor):
    """Where the anchor is in the file, ignoring differences in spaces and line breaks: a list of (start, end)."""
    rx = r"\s+".join(re.escape(w) for w in anchor.split())
    return [(m.start(), m.end()) for m in re.finditer(rx, s)]


def main():
    check = "--check" in sys.argv
    tmp = tempfile.mkdtemp(prefix="followticks-patch-")
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
