#!/usr/bin/env python3
"""greetings-20261003: greet each person of a reminder by their own name (from Automations -> People).

The reminder builders (monthinfo.py) now start a greeting message with the neutral line "Good morning,". Just before a
message goes to a person, the senders (reminders.py for Kingdom Parish, satinfo.py for the satellite parishes) call
personalise(text, person_key), which turns that first line into "Good morning <name>,". Nothing here sends anything.

The name is the person's `called` in Automations -> People ("Bro. Ade", "Pastor Demo"). Without it: the name in
brackets ("Full Name (Sis. Demo)"), else the first word of the name (a title such as "Pastor" or "Bro." stays with the
next word). Somebody who isn't in People (or has no name) gets plain "Good morning,". The app is read through
clerkcfg.py only (no config, or any error, gives the plain greeting). No names are kept in the code.

  python3 greet.py selftest        offline check with made-up people (reads and sends nothing real)
  python3 greet.py show            how each person in the config would be greeted
"""
import html, os, re, sys

NEUTRAL = "Good morning,"
TITLES = {"bro", "bro.", "sis", "sis.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "dr", "dr.", "pastor", "pst", "pst.", "deacon",
          "deaconess", "elder", "evangelist", "apostle", "prophet", "rev", "rev.", "minister"}


def _cfg():
    for d in (os.path.dirname(os.path.abspath(__file__)), os.path.join(os.environ.get("CLERK_ROOT", "/workspace"), "tools")):
        if os.path.exists(os.path.join(d, "clerkcfg.py")):
            if d not in sys.path:
                sys.path.insert(0, d)
            break
    import clerkcfg
    return clerkcfg


def name_of(p):
    """How a person (one entry of Automations -> People) is greeted; '' when there is no usable name."""
    c = " ".join(str((p or {}).get("called") or "").split())
    if not c:
        full = " ".join(str((p or {}).get("name") or "").split())
        m = re.match(r"^.*\(([^()]+)\)$", full)
        if m:
            c = m.group(1).strip()
        else:
            w = full.split(" ") if full else []
            c = " ".join(w[:2]) if len(w) > 1 and w[0].lower() in TITLES else (w[0] if w else "")
    return c[:40]


def called(key):
    """The greeting name for a person key, '' when they are not in Automations -> People or have no name."""
    key = str(key or "").strip()
    if not key:
        return ""
    try:
        p = next((p for p in _cfg().all_people() if p.get("key") == key), None)
    except Exception:
        return ""
    return name_of(p) if p else ""


def greets(text):
    """True when the text starts with the neutral greeting line (so it should be sent to one person at a time)."""
    return isinstance(text, str) and text.startswith(NEUTRAL)


def personalise(text, key):
    """The text with its first line "Good morning," turned into "Good morning <name>," (HTML-safe). The text unchanged when
    it has no such line or the person's name isn't known."""
    if not greets(text):
        return text
    n = called(key)
    return f"Good morning {html.escape(n, quote=False)},{text[len(NEUTRAL):]}" if n else text


def people_keys(who):
    """A recipient list (comma text or a list of keys) as unique keys, in order."""
    if isinstance(who, str):
        who = who.split(",")
    return list(dict.fromkeys(str(k).strip() for k in (who or []) if str(k or "").strip()))


# ----------------------------------------------------------------------------------------------------------- checks
def selftest():
    import json, tempfile
    d = tempfile.mkdtemp(prefix="greet-selftest-")
    cfg = os.path.join(d, "config.json")
    json.dump({"config_version": 1, "is_default": False, "config": {"people": [
        {"key": "p1", "name": "Test One", "called": "Bro. One"},
        {"key": "p2", "name": "Test Two (Sis. Two)"},
        {"key": "p3", "name": "Pastor Three Surname"},
        {"key": "p4", "name": "Four Surname"},
        {"key": "p5", "name": "", "called": ""},
        {"key": "p6", "name": "Test <Six> & Co", "called": "Mr. A&B"},
    ]}}, open(cfg, "w"))
    os.environ["CLERK_CFG"] = cfg
    os.environ["CLERK_ROOT"] = d
    for m in ("clerkcfg",):
        sys.modules.pop(m, None)
    t = NEUTRAL + "\n\nbody\n\nGod bless."
    want = {"p1": "Good morning Bro. One,", "p2": "Good morning Sis. Two,", "p3": "Good morning Pastor Three,",
            "p4": "Good morning Four,", "p5": NEUTRAL, "p6": "Good morning Mr. A&amp;B,", "nobody": NEUTRAL, "": NEUTRAL}
    for k, w in want.items():
        got = personalise(t, k).split("\n")[0]
        assert got == w, f"{k!r}: {got!r} != {w!r}"
    assert personalise(t, "p1").endswith("\n\nbody\n\nGod bless."), "the rest of the message changed"
    other = "Today is the last Sunday\n\nbody"
    assert personalise(other, "p1") == other and not greets(other)
    assert people_keys("a, b,,a") == ["a", "b"] and people_keys(["x", None, "x"]) == ["x"]
    print("greet selftest OK: 8 greetings, other texts untouched, unknown people get the plain greeting")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["selftest"]:
        selftest()
    elif a[:1] == ["show"]:
        for p in _cfg().all_people():
            print(f"{p.get('key')}: {personalise(NEUTRAL, p.get('key')) if name_of(p) else '(no name: plain Good morning,)'}")
    else:
        print(__doc__)
        sys.exit(2)
