#!/usr/bin/env python3
"""sentlog-20261003: one line per outgoing email / Telegram send in /workspace/logs/sent.log.

  ISO time <TAB> channel (email|telegram) <TAB> job <TAB> recipient(s) <TAB> subject or short label <TAB> ok|failed|skipped <TAB> error

No message bodies, no secrets (anything that looks like a bot token is masked). The file is rotated monthly: the first
write in a new month renames last month's file to sent-YYYY-MM.log. Never raises: a log problem never blocks a send.
  python3 sentlog.py tail [N]     show the last N lines (default 20)
"""
import datetime, fcntl, os, re, sys

DIR = os.environ.get("SENTLOG_DIR", "/workspace/logs")
HELPERS = {"mailer.py", "send_msg.py", "send_doc.py", "tg.py", "tgcard.py", "sentlog.py"}
_TOKEN = re.compile(r"\d{6,}:[A-Za-z0-9_-]{25,}")


def _clean(v, n):
    s = re.sub(r"\s+", " ", str(v if v is not None else "")).strip()
    return _TOKEN.sub("[masked]", s)[:n]


def _script(argv):
    for x in argv[:4]:
        b = os.path.basename(x)
        if re.search(r"\.(py|sh|cjs|js|mjs)$", b):
            return b
    return os.path.basename(argv[0]) if argv else "?"


def job():
    """CLERK_JOB, else the script that started this helper (e.g. monthend.py running mailer.py), else this script."""
    if os.environ.get("CLERK_JOB"):
        return os.environ["CLERK_JOB"]
    me = _script(sys.argv) if sys.argv and sys.argv[0] else "?"
    if me in HELPERS or me in ("?", "-c", "python3"):
        try:
            pa = open(f"/proc/{os.getppid()}/cmdline", "rb").read().split(b"\0")
            p = _script([x.decode("utf-8", "replace") for x in pa if x])
            if p and p not in HELPERS and not p.startswith(("bash", "sh", "python")):
                return p if me in ("?", "-c", "python3") else f"{p}>{me}"
        except Exception:
            pass
    return me


def log(channel, recipient, label, status, error="", jobname=None):
    try:
        if isinstance(recipient, (list, tuple, set)):
            recipient = ",".join(str(x) for x in recipient if x)
        os.makedirs(DIR, exist_ok=True)
        now = datetime.datetime.now().astimezone()
        line = "\t".join([now.isoformat(timespec="seconds"), _clean(channel, 10), _clean(jobname or job(), 60),
                          _clean(recipient, 200), _clean(label, 120), _clean(status, 20), _clean(error, 200)]) + "\n"
        path = os.path.join(DIR, "sent.log")
        with open(os.path.join(DIR, "sent.lck"), "a") as lk:
            fcntl.flock(lk, fcntl.LOCK_EX)
            try:
                m = datetime.datetime.fromtimestamp(os.path.getmtime(path))
                if (m.year, m.month) != (now.year, now.month):
                    old = os.path.join(DIR, f"sent-{m:%Y-%m}.log")
                    if os.path.exists(old):  # never overwrite an older month: append to it
                        with open(old, "a") as o, open(path) as c:
                            o.write(c.read())
                        os.remove(path)
                    else:
                        os.rename(path, old)
            except FileNotFoundError:
                pass
            with open(path, "a") as f:
                f.write(line)
    except Exception:
        pass


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "tail":
        n = int(sys.argv[2]) if len(sys.argv) > 2 else 20
        try:
            print("".join(open(os.path.join(DIR, "sent.log")).readlines()[-n:]), end="")
        except FileNotFoundError:
            print("(no sends logged yet this month)")
    else:
        print(__doc__)
# sentlog-20261003
