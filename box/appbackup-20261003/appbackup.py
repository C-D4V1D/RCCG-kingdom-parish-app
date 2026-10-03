#!/usr/bin/env python3
"""appbackup-20261003: a weekly full backup of the parish app, saved on the box and so copied to Google Drive.

  python3 appbackup.py tick     run by supervisor.sh every cycle: makes the backup only when one is due
  python3 appbackup.py now      make a backup straight away (the installer runs this once)
  python3 appbackup.py status   print the last result

The backup is the app's own "Download full backup" (GET /api/admin/backup, read with the box's read-only automation
key): every table of Kingdom's database and of each satellite parish, without PINs or sign-in secrets. It is saved,
gzipped, as /workspace/app-backups/rccg-full-backup-YYYY-MM-DD.json.gz. drive-sync.sh mirrors /workspace to
Google Drive (Clerk Box/workspace/app-backups) within about 10 minutes; a file the box later prunes is moved to
"Clerk Box/_replaced" on Drive rather than deleted. Restore it in the app: IT Admin > Backup & Restore >
Restore from backup file. Nothing here ever writes to the app.
"""
import datetime, gzip, json, os, sys, urllib.request

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
APP = os.environ.get("KP_APP_URL", "https://rccg-kingdom-parish-app.pages.dev").rstrip("/")
KEY_FILE = os.path.join(ROOT, ".secrets", "kp-automation-key")
OUT_DIR = os.path.join(ROOT, "app-backups")
STATE = os.path.join(ROOT, "state", "appbackup.json")
LOG = os.path.join(ROOT, "tools", "appbackup.log")
EVERY = datetime.timedelta(days=7)
RETRY_AFTER = datetime.timedelta(hours=6)     # after a failed try
KEEP = 12                                     # weekly files kept on the box (older ones stay in Drive's _replaced)
QUIET = (datetime.time(7, 0), datetime.time(9, 30))   # statement and memo runs: no backup then


def now():
    t = os.environ.get("CLERK_NOW", "")   # tests only
    return datetime.datetime.fromisoformat(t) if t else datetime.datetime.now().astimezone()


def log(msg):
    try:
        os.makedirs(os.path.dirname(LOG), exist_ok=True)
        with open(LOG, "a") as f:
            f.write(f"{now():%Y-%m-%d %H:%M} {msg}\n")
    except Exception:
        pass


def load_state():
    try:
        with open(STATE) as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(st):
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    tmp = STATE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(st, f, indent=1)
    os.replace(tmp, STATE)


def key():
    k = os.environ.get("KP_AUTOMATION_KEY", "").strip()
    if not k:
        try:
            k = open(KEY_FILE).read().strip()
        except Exception:
            k = ""
    return k


def when(s):
    try:
        return datetime.datetime.fromisoformat(s)
    except Exception:
        return None


def due(st, t):
    ok, tried = when(st.get("last_ok", "")), when(st.get("last_try", ""))
    if ok and t - ok < EVERY:
        return False
    if tried and (not ok or tried > ok) and t - tried < RETRY_AFTER:
        return False
    return not (QUIET[0] <= t.time() <= QUIET[1])


def backup(st, t):
    st["last_try"] = t.isoformat(timespec="seconds")
    try:
        k = key()
        if not k:
            raise RuntimeError("no automation key in .secrets/kp-automation-key")
        req = urllib.request.Request(f"{APP}/api/admin/backup", headers={
            "User-Agent": "kp-box-appbackup/1", "Accept": "application/json", "X-Automation-Key": k})
        with urllib.request.urlopen(req, timeout=300) as r:
            raw = r.read()
        data = json.loads(raw)
        if data.get("format") != "rccg-full-backup" or not isinstance(data.get("databases"), dict) or "main" not in data["databases"]:
            raise RuntimeError("the app's answer is not a full backup")
        records = sum(len(rows) for d in data["databases"].values() for rows in (d.get("tables") or {}).values())
        os.makedirs(OUT_DIR, exist_ok=True)
        name = f"rccg-full-backup-{t:%Y-%m-%d}.json.gz"
        path = os.path.join(OUT_DIR, name)
        tmp = path + ".tmp"   # drive-sync skips *.tmp, so Drive never gets half a file
        with gzip.open(tmp, "wb") as f:
            f.write(raw)
        os.replace(tmp, path)
        files = sorted(n for n in os.listdir(OUT_DIR) if n.startswith("rccg-full-backup-") and n.endswith(".json.gz"))
        for old in files[:-KEEP]:
            os.remove(os.path.join(OUT_DIR, old))
        st.update(last_ok=st["last_try"], last_file=name, last_bytes=os.path.getsize(path), last_records=records, last_error="")
        log(f"saved {name}: {records} records, {st['last_bytes']} bytes")
        return True
    except Exception as e:
        st["last_error"] = str(e)[:300]
        log(f"backup failed: {st['last_error']}")
        return False
    finally:
        save_state(st)


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "tick"
    st, t = load_state(), now()
    if cmd == "status":
        print(json.dumps(st, indent=1) if st else "no backup made yet")
        return 0
    if cmd == "now":
        ok = backup(st, t)
        print(f"OK: saved {st.get('last_file')} ({st.get('last_records')} records)" if ok else f"FAILED: {st.get('last_error')}")
        return 0 if ok else 1
    if cmd == "tick":
        if due(st, t):
            backup(st, t)
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
