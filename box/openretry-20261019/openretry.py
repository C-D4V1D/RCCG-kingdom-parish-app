#!/usr/bin/env python3
"""openretry-20261019: start a month-end run that stopped only because the portal was not open yet.

Run from cron every 30 minutes (installed only with `install.sh --enable`; it does nothing unless
/workspace/state/openretry.enabled exists). It is silent while the portal is closed. It never submits anything itself:
when the portal opens it hands the saved cut-off signal to monthend.py's live_cutoff(), which fills the portal and then
stops at the same confirmations (check emails, buttons) as any run.

  1. Find a failed entry in remit-runs.json whose failure is "1e pre-check ... not open" (and a saved cutoff signal).
  2. Read the cut-off date from the app's own setting (monthinfo.period_for_month, GET only). Nothing is checked on
     the portal before that date.
  3. From that date on: api-fill.js precheck (read-only). exit 10 = not open: stay silent. Anything else
     (open, or API trouble): see below.
  4. Open: mark it done (once), tell David in one Telegram line "portal open, run started", run live_cutoff with the
     signal using the app's period (a new period key if the cut-off day moved, else the old entry is set to "held"
     so monthend's own resume path picks it up). A run that stops tells people by itself (stop()).
  5. Health: pings a Healthchecks URL after every clean pass; /fail on an exception. Missing pings alert David.
"""
import copy, datetime, fcntl, json, os, sys, time, urllib.request

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
TOOLS = os.path.join(ROOT, "tools")
sys.path.insert(0, TOOLS)
import monthend as M  # noqa: E402
import monthinfo as MI  # noqa: E402

ENABLED = os.path.join(ROOT, "state", "openretry.enabled")
STATEF = os.path.join(ROOT, "state", "openretry.json")
HCF = os.environ.get("OPENRETRY_HC_FILE", "/home/ubuntu/.config/clerkbox/openretry.hc")
QUIET_RC = (10,)


def ping(suffix=""):
    try:
        u = open(HCF).read().strip()
    except OSError:
        return
    if not u:
        return
    try:
        urllib.request.urlopen(urllib.request.Request(u + suffix, headers={"User-Agent": "openretry/1"}), timeout=10).read()
    except Exception:
        pass


def today():
    return datetime.datetime.now(M.UK).date()


def candidates():
    for key, e in (M.rjson(M.STATE, {}) or {}).items():
        f = (e or {}).get("failure") or {}
        if (e or {}).get("status") == "failed" and f.get("step") == "1e pre-check" and "not open" in str(f.get("message")) \
                and isinstance(e.get("boxEvent"), dict) and e["boxEvent"].get("event") == "cutoff_collection_saved":
            yield key, e


def run_once():
    if not os.path.exists(ENABLED):
        return "disabled"
    st = M.rjson(STATEF, {}) or {}
    done = st.setdefault("done", {})
    try:
        settings = MI.app_get("settings")
    except Exception as ex:
        raise RuntimeError(f"app settings unreadable: {ex}")
    for key, e in candidates():
        if key in done:
            continue
        ev = e["boxEvent"]
        month = str(ev.get("periodEnd") or "")[:7]
        per = MI.period_for_month(settings, month)
        if not per:
            continue
        start, end = per
        if today() < end:
            continue  # before the saved cut-off date: no portal checks at all
        rc, j, err = M.node("api-fill.js", "precheck", "--month", month, retry=False)
        if rc in QUIET_RC:
            M.log(f"openretry: portal still closed for {month}", key)
            continue
        if rc not in (0, 12):
            M.log(f"openretry: precheck exit {rc}, will try again: {M.short(j, err)}", key)
            continue
        newkey = f"{start}..{end}"
        done[key] = datetime.datetime.now().isoformat(timespec="seconds")
        M.wjson(STATEF, st)  # once: written before anything starts
        M.tg("david", f"▶️ The portal is open for {M.esc(M.month_label(month))}. The remittance run has started "
                      "(it will stop at your confirmations).", f"openretry:{newkey}")
        ev2 = copy.deepcopy(ev)
        ev2.update(periodStart=str(start), periodEnd=str(end), month=month, retryOf=key)
        ev2.pop("_file", None)
        if newkey == key:
            def hold(s):
                s[key].update(status="held", failure=None, boxEvent=ev2, updatedAt=datetime.datetime.now().isoformat(timespec="seconds"))
            M.state_update(hold)
            M.safe(lambda: M.live_cutoff(ev2, resumed=True), ev2)
        else:
            M.safe(lambda: M.live_cutoff(ev2), ev2)
        return "started"
    return "waiting"


def main():
    lock = open(os.path.join(M.MD, "lock"), "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return 0  # month-end runner busy; next pass
    try:
        r = run_once()
    except Exception as ex:
        M.log(f"openretry FAILED: {type(ex).__name__}: {ex}")
        ping("/fail")
        return 1
    ping()
    return 0


if __name__ == "__main__":
    sys.exit(main())
