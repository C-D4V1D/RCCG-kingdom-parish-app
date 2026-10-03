#!/usr/bin/env python3
r"""greetings-20261003: each person gets the Sunday-records reminder greeted by their own name (Automations -> People).

  python3 patch.py --check   only check that every change applies (changes nothing)
  python3 patch.py           apply (all or nothing; safe to run twice: files that already have the marker are skipped)

New file tools/greet.py (installed by install.sh). Until now the greeting was typed into the code ("Good morning Bro.
Divine," for Kingdom Parish) or, for a satellite parish, was the first listed person's name for EVERY recipient (other
people of the parish, the copies, the Area office). Now the messages are built with the neutral first line
"Good morning," and each recipient's own name is put in just before sending. Each anchor must match exactly once
(whitespace-insensitive) and every patched file must compile, or nothing is written.

  tools/monthinfo.py   records_msg(): the greeting line is the neutral "Good morning," (this is also what the Monday
                       message uses). The wording of the messages is otherwise unchanged.
  tools/reminders.py   tg(): a message that starts with the neutral greeting goes to each person on its own, greeted
                       by their name (other messages: one call to all, as before). The two other Bro.-Divine-only
                       messages (source documents, Monday attendance) use the neutral greeting too.
  tools/satinfo.py     remind() send(): the same for a parish's Telegram messages (people, late-alert and copies
                       people) and for the emails to people without Telegram. Telegram keeps its per-person duplicate
                       guard and key, so nothing already sent is sent again.
"""
import os, py_compile, re, shutil, sys, tempfile

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "greetings-20261003"

# ------------------------------------------------------------------------------------------------ tools/monthinfo.py
MI_OLD = r'''    return f"Good morning Bro. Divine,\n\n{text}\n\nGod bless." if kind in ("weekly", "second") else text'''
MI_NEW = r'''    # greetings-20261003: the neutral first line; the sender puts each recipient's own name in (greet.personalise)
    return f"Good morning,\n\n{text}\n\nGod bless." if kind in ("weekly", "second") else text'''

# ------------------------------------------------------------------------------------------------ tools/reminders.py
RM_TG_OLD = r'''def tg(who, text, mtype=None):
    if who: subprocess.run(["python3", TG, who, text], capture_output=True, timeout=120, env=dict(os.environ, CLERK_MSG_TYPE=mtype) if mtype else None)
'''
RM_TG_NEW = r'''try:  # greetings-20261003: each person's own name in the greeting (greet.py)
    import greet as G
except Exception:
    G = None
def tg(who, text, mtype=None):
    if not who: return
    env = dict(os.environ, CLERK_MSG_TYPE=mtype) if mtype else None
    try: each = G is not None and G.greets(text)
    except Exception: each = False
    if not each:  # no greeting line in the text: one call to everyone, as before
        subprocess.run(["python3", TG, who, text], capture_output=True, timeout=120, env=env)
        return
    for k in G.people_keys(who):  # greetings-20261003: one message per person, "Good morning <their name>,"
        try:
            try: t = G.personalise(text, k)
            except Exception: t = text
            subprocess.run(["python3", TG, k, t], capture_output=True, timeout=120, env=env)
        except Exception:
            pass  # one person's failed send must not stop the next person's
'''
RM_SRC_OLD = r'''    return ("Good morning Bro. Divine,\n\n" + card("wait", "Kingdom Parish source documents", closes(k),'''
RM_SRC_NEW = r'''    return ("Good morning,\n\n" + card("wait", "Kingdom Parish source documents", closes(k),  # greetings-20261003: name added when sent'''
RM_ATT_OLD = r'''    return ("Good morning Bro. Divine,\n\n" + card("wait", "Attendance not yet in the app", "Kingdom Parish",'''
RM_ATT_NEW = r'''    return ("Good morning,\n\n" + card("wait", "Attendance not yet in the app", "Kingdom Parish",  # greetings-20261003: name added when sent'''

# ------------------------------------------------------------------------------------------------ tools/satinfo.py
SI_HELPER_OLD = r'''
# ---------------------------------------------------------------- the parish's app, through monthinfo.py
'''
SI_HELPER_NEW = r'''
# ---------------------------------------------------------------- greetings-20261003: each person's own name
try:
    import greet as G  # noqa: E402
except Exception:
    G = None


def hello(text, key):
    """The text greeted with this person's own name (Automations -> People); the text itself when that isn't possible."""
    try:
        return G.personalise(text, key) if G is not None else text
    except Exception:
        return text


# ---------------------------------------------------------------- the parish's app, through monthinfo.py
'''
SI_SEND_OLD = r'''        tg(keys + [k for k in extra if k not in keys], text, tag, guard)
        no_tg = [k for k in keys if not person(k).get("telegram_chat_id") and routed(k, mtype, "email")]
        email([person(k).get("email") for k in no_tg], f"{P.name}: Sunday records reminder", text)
'''
SI_SEND_NEW = r'''        everyone = keys + [k for k in extra if k not in keys]
        try:
            each = G is not None and G.greets(text)
        except Exception:
            each = False
        if each:  # greetings-20261003: one message per person, each greeted by their own name (same guard and key)
            for k in dict.fromkeys(everyone):
                tg([k], hello(text, k), tag, guard)
        else:
            tg(everyone, text, tag, guard)
        no_tg = [k for k in keys if not person(k).get("telegram_chat_id") and routed(k, mtype, "email")]
        if each:  # greetings-20261003: an email each, to each address once
            done = set()
            for k in dict.fromkeys(no_tg):
                a = str(person(k).get("email") or "").strip()
                if a and a.lower() not in done:
                    done.add(a.lower())
                    email([a], f"{P.name}: Sunday records reminder", hello(text, k))
        else:
            email([person(k).get("email") for k in no_tg], f"{P.name}: Sunday records reminder", text)
'''

CHANGES = {
    "tools/monthinfo.py": [(MI_OLD, MI_NEW)],
    "tools/reminders.py": [(RM_TG_OLD, RM_TG_NEW), (RM_SRC_OLD, RM_SRC_NEW), (RM_ATT_OLD, RM_ATT_NEW)],
    "tools/satinfo.py": [(SI_HELPER_OLD, SI_HELPER_NEW), (SI_SEND_OLD, SI_SEND_NEW)],
}


def _find(s, anchor):
    """Where the anchor is in the file, ignoring differences in spaces and line breaks: a list of (start, end)."""
    rx = r"\s+".join(re.escape(w) for w in anchor.split())
    return [(m.start(), m.end()) for m in re.finditer(rx, s)]


def main():
    check = "--check" in sys.argv
    tmp = tempfile.mkdtemp(prefix="greetings-patch-")
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
            # the match runs from the anchor's first word to its last, so the file keeps its own indentation before it
            # and its own line break after it: the new text is put in without its outer whitespace
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
