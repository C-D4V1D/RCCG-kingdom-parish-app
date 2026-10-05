#!/usr/bin/env python3
r"""followticks-20261003 offline test. Nothing is read from the app, nothing is sent, no live file is written.

  python3 selftest.py test [--root /workspace]   the patched clerkcfg.py / boxsched.py from --root against made-up settings
  python3 selftest.py show [--root /workspace]   who gets the weekly Sunday-records message and the memo days, from the
                                                 box's own copy of the app settings (read only)
"""
import importlib.util, json, os, shutil, sys, tempfile

ROOT = sys.argv[sys.argv.index("--root") + 1] if "--root" in sys.argv else "/workspace"


def load(name, path, env):
    os.environ.update(env)
    spec = importlib.util.spec_from_file_location(f"{name}_{abs(hash((path, json.dumps(env))))}", path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def people():
    return [{"key": "admin1", "name": "Admin One", "telegram_chat_id": "1001", "email": None},
            {"key": "divine", "name": "Records Clerk", "telegram_chat_id": "1002", "email": None},
            {"key": "other", "name": "Other Person", "telegram_chat_id": None, "email": None}]


def cfg(routing, follow=None, days=None):
    war = {"enabled": True, "day": "mon", "after_time": "09:00"}
    if follow is not None:
        war["follow_ticks"] = follow
    memo = {"enabled": True, "check_time": "08:45"}
    if days is not None:
        memo["days"] = days
    return {"config_version": 1, "is_default": False,
            "config": {"people": people(), "parishes": [], "routing": {"weekly_attendance_reminder": routing},
                       "automations": {"weekly_attendance_reminder": war, "memo": memo}}}


def test():
    tmp = tempfile.mkdtemp(prefix="followticks-test-")
    fails = []
    try:
        os.makedirs(os.path.join(tmp, "state"))
        on = {"telegram": True, "email": False}; off = {"telegram": False, "email": False}
        cases = [
            ("no saved settings: the built-in person, as before", None, "divine", list(range(6))),
            ("ticks not saved by the new app yet: the built-in person only (admin's tick ignored, as today)",
             cfg({"admin1": on, "divine": on, "other": off}), "divine", list(range(6))),
            ("not saved yet, built-in person unticked: nobody, as today", cfg({"admin1": on, "divine": off}), "", list(range(6))),
            ("saved by the new app: everyone ticked with a chat id", cfg({"admin1": on, "divine": on, "other": on}, True), "admin1,divine", list(range(6))),
            ("saved by the new app, only the built-in person ticked", cfg({"admin1": off, "divine": on}, True, ["mon", "wed", "sun"]), "divine", [0, 2, 6]),
            ("saved, nobody ticked, no memo days: nobody, no days (as the memo check)", cfg({"admin1": off, "divine": off}, True, ["bad"]), "", []),
        ]
        for i, (what, c, want_who, want_days) in enumerate(cases):
            path = os.path.join(tmp, f"config{i}.json")
            if c is not None:
                json.dump(c, open(path, "w"))
            C = load("clerkcfg", os.path.join(ROOT, "tools", "clerkcfg.py"), {"CLERK_CFG": path, "CLERK_ROOT": tmp})
            got_who, got_days = C.weekly_records_who("divine"), C.memo_days()
            ok = got_who == want_who and got_days == want_days
            print(("ok   " if ok else "FAIL ") + f"{what}: weekly message to {got_who!r}, memo days {got_days}")
            if not ok:
                fails.append(what)
            if c is not None:  # apply() writes memo_days into a scratch sched_config.json (no restart: settings unchanged)
                C.SCHED_CONFIG = os.path.join(tmp, f"sched{i}.json")
                C.apply(C.config())
                sc = json.load(open(C.SCHED_CONFIG))
                if sc.get("memo_days") != want_days or sc.get("attendance") is not False:
                    fails.append(what + " (sched_config)"); print("FAIL sched_config", sc)
        # the scheduler: a scratch copy reads memo_days from its own sched_config.json; missing = Mon-Sat
        d = os.path.join(tmp, "srcdoc"); os.makedirs(d)
        shutil.copy(os.path.join(ROOT, "telegram", "srcdoc", "boxsched.py"), d)
        src = open(os.path.join(d, "boxsched.py"), encoding="utf-8").read()
        if 'wd in (range(6) if c.get("memo_days") is None else c["memo_days"])' not in src:
            fails.append("boxsched: memo days check missing")
        B = load("boxsched", os.path.join(d, "boxsched.py"), {})
        for sc, want in (({}, None), ({"memo_days": [0, 2]}, [0, 2]), ({"memo_days": []}, [])):
            json.dump(sc, open(os.path.join(d, "sched_config.json"), "w"))
            got = B.cfg().get("memo_days")
            print(("ok   " if got == want else "FAIL ") + f"scheduler reads memo_days {got} (sched_config {sc})")
            if got != want:
                fails.append("boxsched cfg")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if fails:
        print("SELFTEST FAILED:", "; ".join(fails)); sys.exit(1)
    print("SELFTEST OK")


def show():
    C = load("clerkcfg", os.path.join(ROOT, "tools", "clerkcfg.py"), {})
    w = C.weekly_records_who("divine")
    follow = C.get("automations.weekly_attendance_reminder.follow_ticks", False) is True
    print(f"Weekly Sunday-records message goes to: {w or 'nobody'} "
          f"({'the ticks saved in the app' if follow else 'built-in person until the app saves the ticks'})")
    names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    print("Memo days (Clerk AI back-up follows them too):", ", ".join(names[i] for i in C.memo_days()))


if __name__ == "__main__":
    {"test": test, "show": show}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: (print(__doc__), sys.exit(2)))()
