#!/usr/bin/env python3
"""Clerk box month-end runner (monthend-20261001).

Acts on the month-end signals the app drops in the clerk-watchdog mailbox (clerkcfg.py copies them to
/workspace/state/monthend/inbox and starts this script). It is the script version of the Clerk AI's
/workspace/rccg-remit/WEBHOOK-RUN.md and REPLY-RUN.md, using the same scripts, files and state:

  handler "clerk_ai"  (Automations -> Month-end run by: Clerk AI; the default)
      PRACTICE ONLY. The Clerk AI does the real run. After it has finished, the box works out what it would have
      filed (app figures + mapping, offline dry run: no portal login, no email) and tells David whether it matches.
  handler "box"
      The real run: verify, compute, file the remittance, file the attendance, read back, compare, send the three
      check emails (+ Telegram), and later act on the Generate RRR / Refresh / Refresh attendance buttons.

The Clerk AI is woken only when a script fails twice (one automatic retry), the result is unclear, or a signal is
unknown. A category with money but no portal line holds the month (David and Bro. Divine are told; David picks the
line in the app; the box carries on by itself within 5 minutes). It never pays, never generates an RRR without an
accepted button, never POSTs a report twice and never writes to the app.

  monthend.py run [--resume]     process the inbox (and with --resume, months held for a missing line)
"""
import datetime, fcntl, glob, html, json, os, re, shutil, subprocess, sys, time, urllib.error, urllib.request
from zoneinfo import ZoneInfo

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
REMIT, ATT, TGD, TOOLS = (os.path.join(ROOT, d) for d in ("rccg-remit", "rccg-attendance", "telegram", "tools"))
MD = os.path.join(ROOT, "state", "monthend")
STATE = os.path.join(REMIT, "state", "remit-runs.json")
RUNLOG = os.path.join(REMIT, "state", "run-log.txt")
TGSENT = os.path.join(REMIT, "state", "tg-sent.json")
NODE = os.environ.get("MONTHEND_NODE", "node")
PY = sys.executable or "python3"
APPJS_URL = os.environ.get("MONTHEND_APPJS_URL", "https://raw.githubusercontent.com/C-D4V1D/RCCG-kingdom-parish-app/main/src/js/app.js")
RETRY_WAIT = int(os.environ.get("MONTHEND_RETRY_WAIT", "60"))
PRACTICE_MAX_WAIT_H = 6
PARISH = "602757"
UK = ZoneInfo("Europe/London")
AI_RUNBOOK = os.path.join(TOOLS, "MONTHEND-AI.md")
SECRET_FILES = ("/home/box/agent-data/box-secrets.json", "/home/box/sand-data/box-secrets.json")
SCRIPT_FAIL = (3, 4, 5, 11)  # sign-in / key / API trouble: worth one retry

sys.path.insert(0, TOOLS)
try:
    import clerkcfg as C
except Exception:
    C = None


class Stop(Exception):
    """The run stopped at a step; everything the people need to know has been sent."""


# ---------------------------------------------------------------- small helpers
def now():
    return datetime.datetime.now(UK)


def ukfmt(t=None):
    return (t or now()).strftime("%-d %b %Y, %H:%M")


def month_label(month):
    y, m = map(int, month.split("-"))
    return datetime.date(y, m, 1).strftime("%B %Y")


def naira(x):
    try:
        return f"₦{float(x):,.2f}".replace(".00", "")
    except Exception:
        return str(x)


def esc(s):
    return html.escape(str(s), quote=False)


def log(text, key=None):
    os.makedirs(MD, exist_ok=True)
    line = f"{now():%Y-%m-%d %H:%M} {text}"
    with open(os.path.join(MD, "log.txt"), "a") as f:
        f.write(line + "\n")
    if key is not None:
        os.makedirs(os.path.dirname(RUNLOG), exist_ok=True)
        with open(RUNLOG, "a") as f:
            f.write(f"{now():%Y-%m-%d %H:%M} {key} {text}\n")


def rjson(p, default=None):
    try:
        return json.load(open(p))
    except Exception:
        return default


def wjson(p, o):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(o, open(p + ".tmp", "w"), indent=1, ensure_ascii=False)
    os.replace(p + ".tmp", p)
    return p


def run(cmd, cwd=None, timeout=900, env=None):
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout,
                           env=dict(os.environ, **env) if env else None)
        return p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired:
        return 124, "", f"timed out after {timeout}s"
    except Exception as e:
        return 127, "", f"{type(e).__name__}: {e}"


def parse(out):
    """The JSON object a script printed (api-fill/att-fill print exactly one)."""
    out = (out or "").strip()
    for s in (out, out[out.find("{"):] if "{" in out else ""):
        try:
            return json.loads(s)
        except Exception:
            pass
    return {}


def short(j, err=""):
    return str((j or {}).get("error") or (err or "").strip().splitlines()[-1:] or "no output")[:200]


def node(script, *args, cwd=REMIT, retry=True, timeout=900):
    """Run a node script; one automatic retry (after a pause) when it failed in a way worth retrying."""
    rc, out, err = run([NODE, script, *args], cwd=cwd, timeout=timeout)
    if retry and (rc in SCRIPT_FAIL or rc not in (0, 2, 10, 12, 13, 14, 15, 16, 17)):
        log(f"{script} {' '.join(args[:2])} exit {rc}: {short(parse(out), err)}; retrying once")
        time.sleep(RETRY_WAIT)
        rc, out, err = run([NODE, script, *args], cwd=cwd, timeout=timeout)
    return rc, parse(out), err


def py(script, *args, cwd=REMIT, env=None, timeout=300):
    return run([PY, script, *args], cwd=cwd, env=env, timeout=timeout)


# ---------------------------------------------------------------- people, Telegram, email, the Clerk AI
def person(key):
    for p in (C.people() if C else []) or []:
        if p.get("key") == key:
            return p
    return {}


def address(key, entry=None):
    a = person(key).get("email")
    if a:
        return a
    ce = ((entry or {}).get("checkEmails") or {}).get(key) or {}
    return (ce.get("to") or [None])[0] if isinstance(ce.get("to"), list) else ce.get("to")


def tg(who, text, key):
    rc, out, err = py(os.path.join(TGD, "send_msg.py"), who, text, "--guard", TGSENT, "--key", key, "--log", RUNLOG,
                      timeout=180)
    if rc:
        log(f"telegram {key} not sent: {(err or out).strip()[:150]}")


def tg_bundle(bundle, key, only=None):
    args = ["--bundle", bundle, "--guard", TGSENT, "--key", key, "--log", RUNLOG] + (["--only", only] if only else [])
    rc, out, err = py(os.path.join(TGD, "send_msg.py"), *args, timeout=180)
    if rc:
        log(f"telegram {key} not sent: {(err or out).strip()[:150]}")


def tg_build(kind, *args):
    """tg_msgs.py builds the message files (sends nothing). False when it refused (e.g. an expired link)."""
    rc, out, err = py(os.path.join(TGD, "tg_msgs.py"), kind, *args, timeout=120)
    if rc:
        log(f"tg-fail build {kind}: {(err or out).strip()[:150]}")
    return rc == 0


def mail_sent(subject):
    rc, out, _ = py(os.path.join(TOOLS, "mailer.py"), "sent", subject, "--days", "3", timeout=120)
    return rc == 0 and out.strip().startswith("FOUND")


def mail(payload, mtype=None):
    """Send one payload.json with the box mailer; one retry. Returns True when sent."""
    env = {"CLERK_MSG_TYPE": mtype} if mtype else None
    for attempt in (1, 2):
        rc, out, err = py(os.path.join(TOOLS, "mailer.py"), "send", "--payload", payload, env=env, timeout=180)
        if rc == 0 and '"ok": true' in out:
            return True
        log(f"email {os.path.basename(os.path.dirname(payload))} not sent (try {attempt}): {(err or out).strip()[-150:]}")
        if attempt == 1:
            time.sleep(min(RETRY_WAIT, 30))
    return False


def mail_plain(to, subject, body, mtype=None):
    to = [a for a in to if a]
    if not to:
        return False
    p = os.path.join(MD, "out", f"mail-{now():%Y%m%d-%H%M%S-%f}.json")
    wjson(p, {"to": to, "subject": subject, "body": body})
    return mail(p, mtype)


def secret(name):
    if os.environ.get(name):
        return os.environ[name]
    for f in SECRET_FILES:
        d = rjson(f, {})
        if isinstance(d, dict) and d.get(name):
            return d[name]
    return None


def wake_ai(key, step, message, details=None):
    """Ask the Clerk AI to take over (only for failures after a retry, unclear results, unknown signals)."""
    guard = os.path.join(MD, "wakes.json")
    g = rjson(guard, {})
    if key in g:
        return "already asked"
    body = {"event": "monthend_needs_ai", "key": key, "runbook": AI_RUNBOOK, "source": "kp-box monthend.py",
            "sent_at": now().isoformat(timespec="seconds"),
            "details": {"step": step, "message": message, "state": STATE, "log": os.path.join(MD, "log.txt"), **(details or {})}}
    test_file = os.environ.get("MONTHEND_TEST_WAKE_FILE")
    if test_file:
        with open(test_file, "a") as f:
            f.write(json.dumps(body) + "\n")
        result = "ok"
    else:
        url, k = secret("SCHED_WEBHOOK_URL"), secret("SCHED_WEBHOOK_KEY")
        if not url or not k:
            result = "webhook not configured"
        else:
            hname = secret("SCHED_WEBHOOK_KEY_HEADER") or "Authorization"
            h = {"Content-Type": "application/json", "User-Agent": "kp-box-monthend/1",
                 hname: f"Bearer {k}" if hname.lower() == "authorization" else k}
            try:
                req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=h, method="POST")
                with urllib.request.urlopen(req, timeout=20) as r:
                    result = "ok" if r.status < 300 else f"HTTP {r.status}"
            except urllib.error.HTTPError as e:
                result = f"HTTP {e.code}"
            except Exception as e:
                result = type(e).__name__
    g[key] = {"at": now().isoformat(timespec="seconds"), "step": step, "result": result}
    wjson(guard, g)
    log(f"AI-WAKE {key} step={step} result={result}")
    return result


# ---------------------------------------------------------------- state (shared with the Clerk AI's runbooks)
def state_update(fn):
    """Locked read-modify-write of state/remit-runs.json (same file and lock as remit-action-claim.py)."""
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    with open(STATE, "a+") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        f.seek(0)
        raw = f.read()
        s = json.loads(raw) if raw.strip() else {}
        r = fn(s)
        tmp = STATE + ".tmp"
        json.dump(s, open(tmp, "w"), indent=1, ensure_ascii=False)
        os.replace(tmp, STATE)
        return r


def entry_set(key, **kw):
    def f(s):
        e = s.setdefault(key, {})
        e.update(kw)
        e["updatedAt"] = now().isoformat(timespec="seconds")
        return dict(e)
    return state_update(f)


def entry_get(key):
    return (rjson(STATE, {}) or {}).get(key)


def set_status(**kw):
    p = os.path.join(MD, "status.json")
    s = rjson(p, {}) or {}
    s.update(kw)
    s["at"] = now().isoformat(timespec="seconds")
    wjson(p, s)


# ---------------------------------------------------------------- failure (WEBHOOK-RUN.md §F)
def stop(ctx, step, message, wake=False, report_state="not created"):
    """Stop the run: email David and Bro. Divine, Telegram David, log, mark the entry failed; wake the AI if asked."""
    key, month = ctx["key"], ctx["month"]
    ml = month_label(month)
    woke = ""
    if wake:
        r = wake_ai(f"{key}:{step}", step, message, {"month": month, "periodKey": key, "event": ctx.get("event_file")})
        woke = " The Clerk AI has been asked to look at it." if r in ("ok", "already asked") else " (The Clerk AI could not be reached.)"
    body = (f"The automatic Kingdom Parish remittance run for {ml} (period {key.replace('..', ' to ')}) stopped.\n\n"
            f"Step: {step}\nWhat happened: {message}\nPortal report: {report_state}.\n\n"
            + ("Nothing needs doing from you yet." if wake else "Please look at this; the box will not try again by itself.")
            + woke + "\n\nChurch Clerk (Clerk box)")
    entry = entry_get(key) or {}
    if not mail_plain([address("david", entry), address("divine", entry)],
                      f"Kingdom Parish remittance: automatic run stopped ({ml})", body):
        log("failure email could not be sent", key)
    tg("david", f"⛔ <b>{esc(ml)} remittance stopped</b> at step {esc(step)}: {esc(message)}.{esc(woke)}", f"mendfail:{key}:{step}")
    log(f"FAIL {step} {message}", key)
    entry_set(key, status="failed", failure={"step": step, "message": message, "at": now().isoformat(timespec="seconds")})
    set_status(state="failed", summary=f"{ml}: stopped at {step}: {message}"[:200])
    raise Stop(message)


# ---------------------------------------------------------------- mapping (the app's Remittance lines)
def mapping():
    """remit_match.py's lists as the box will use them (with the app's Remittance lines applied by its patch)."""
    code = ("import json,sys; sys.path.insert(0, sys.argv[1]); import remit_match as m; print(json.dumps({'weekly': "
            "m.APP_KEY_TO_WEEKLY_LINE, 'unmapped': m.UNMAPPED_APP_KEYS, 'not_remitted': sorted(getattr(m, "
            "'NOT_REMITTED_APP_KEYS', []))}))")
    rc, out, err = run([PY, "-c", code, REMIT], timeout=60)
    if rc:
        raise RuntimeError(f"remit_match.py: {err.strip()[-150:]}")
    return json.loads(out)


def categories(B):
    """{app category key: label} from the breakdown's income lines."""
    cats = {}
    for l in (B.get("lineItems") or {}).get("partA") or []:
        if str(l.get("section", "")).startswith("A-income") and l.get("key"):
            cats.setdefault(l["key"], re.sub(r"\s*\(.*$", "", str(l.get("label") or l["key"])).strip())
    return cats


def unmapped_money(B, M):
    """Categories with money in the period that have no portal line and are not marked 'Not remitted'."""
    weekly = {k for k, _ in M["weekly"]}
    skip = set(M.get("not_remitted") or [])
    cats, names, total = categories(B), dict(M.get("unmapped") or {}), {}
    for w in B.get("weeks") or []:
        for k, v in (w.get("sundayCollectionTotalByCategory") or {}).items():
            if v and k not in weekly and k not in skip:
                total[k] = round(total.get(k, 0) + float(v), 2)
    return [{"key": k, "label": cats.get(k) or names.get(k) or k, "amount": v} for k, v in sorted(total.items())]


def portal_lines(month):
    d = rjson(os.path.join(REMIT, "runs", f"portal-items-{month}.json"), {}) or {}
    items = (d.get("data") or {}).get("paymentItems") or []
    return sorted({str(p.get("paymentItem") or p.get("itemName")) for p in items if p.get("paymentItem") or p.get("itemName")})


# ---------------------------------------------------------------- COMPUTE (WEBHOOK-RUN.md §2)
def fetch_appjs(dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    last = None
    for attempt in (1, 2):
        try:
            req = urllib.request.Request(APPJS_URL, headers={"User-Agent": "kp-box-monthend/1"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if len(data) < 10000:
                raise RuntimeError(f"only {len(data)} bytes")
            open(dest + ".tmp", "wb").write(data)
            os.replace(dest + ".tmp", dest)
            return True
        except Exception as e:
            last = e
            if attempt == 1:
                time.sleep(min(RETRY_WAIT, 30))
    return f"{type(last).__name__}: {last}"[:150]


def compute(ctx, out, appjs, fail):
    """App figures from merged main. `fail(step, message, wake)` handles a problem."""
    month = ctx["month"]
    got = fetch_appjs(appjs)
    if got is not True:
        if not os.path.exists(appjs):
            return fail("2 compute", f"could not download the app code from GitHub ({got})", True)
        log(f"app code download failed ({got}); using the copy from the last run", ctx["key"])
    rc, j, err = node("compute-remit.js", "--month", month, "--app-js", appjs, "--out", out)
    if rc == 3:
        return fail("2 compute", "the app's automation key was refused (compute-remit.js exit 3)", True)
    if rc:
        return fail("2 compute", f"compute-remit.js exit {rc}: {short(j, err)}", True)
    B = rjson(out)
    if not isinstance(B, dict):
        return fail("2 compute", "compute-remit.js wrote no breakdown", True)
    per = B.get("period") or {}
    if per.get("from") != ctx["periodStart"] or per.get("to") != ctx["periodEnd"]:
        return fail("2 compute", f"the app's period is {per.get('from')} to {per.get('to')}, the signal said "
                                 f"{ctx['periodStart']} to {ctx['periodEnd']}", False)
    W = B.get("weeks") or []
    if not W or W[-1].get("sunday") != ctx["periodEnd"]:
        return fail("1b verify", f"no Sunday collection found for the cut-off Sunday {ctx['periodEnd']}", False)
    if len(W) > 5:
        return fail("2 compute", f"{len(W)} Sundays in the period but the portal has 5 week tabs", False)
    return B


# ---------------------------------------------------------------- the three check emails (WEBHOOK-RUN.md §5)
def send_checks(ctx, outdir, round_key):
    """David, Bro. Divine, the pastor: one email each, never twice (a guard file per round). Returns {who: record}."""
    sent, guard = {}, os.path.join(outdir, ".sent.json")
    done = rjson(guard, {}) or {}
    for who in ("david", "divine", "pastor"):
        pf = os.path.join(outdir, who, "payload.json")
        p = rjson(pf)
        if not p:
            stop(ctx, "5 email", f"make-check-email.py wrote no email for {who}", wake=True, report_state="submitted")
        subject = p.get("subject") or ""
        to = p.get("to") if isinstance(p.get("to"), list) else [p.get("to")]
        if who in done:
            log(f"EMAIL {who} already sent this round", ctx["key"])
            sent[who] = done[who]
            continue
        if not mail(pf, "remittance_check"):
            stop(ctx, "5 email", f"the check email to {who} could not be sent", wake=True, report_state="submitted")
        log(f"EMAIL SENT {who} smtp", ctx["key"])
        sent[who] = done[who] = {"to": to, "subject": subject, "sentAt": now().isoformat(timespec="seconds"), "method": "smtp"}
        wjson(guard, done)
        entry_set(ctx["key"], checkEmails={**((entry_get(ctx["key"]) or {}).get("checkEmails") or {}), who: sent[who]})
    return sent


def att_file(month):
    f = os.path.join(ATT, "runs", f"att-result-{month}.json")
    d = rjson(f)
    return f if isinstance(d, dict) and d.get("app") is not None else None  # WEBHOOK-RUN.md §3-ATT: "app present"


# ---------------------------------------------------------------- LIVE: cut-off collection saved (§0–§5)
def ctx_from(ev):
    pe, ps = str(ev.get("periodEnd") or ""), str(ev.get("periodStart") or "")
    return {"month": pe[:7], "key": f"{ps}..{pe}", "periodStart": ps, "periodEnd": pe, "event_file": ev.get("_file")}


def live_cutoff(ev, resumed=False):
    ctx = ctx_from(ev)
    key, month = ctx["key"], ctx["month"]
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", ctx["periodEnd"]) or not re.match(r"^\d{4}-\d{2}-\d{2}$", ctx["periodStart"]):
        log(f"cut-off signal without a period: {json.dumps(ev)[:200]}")
        tg("david", "⛔ The box got a cut-off signal without a period, so it did nothing. Please check the app.", f"mendbad:{ev.get('id')}")
        return
    ml = month_label(month)
    if not resumed:
        log(f"START {ev.get('event')} {ev.get('action')} {ev.get('recordId')} {ev.get('savedAt')}", key)
    if ev.get("month") and ev.get("month") != month:
        entry_set(key, month=month, status="filling")
        stop(ctx, "0 triage", f"the signal says month {ev.get('month')} but the period ends in {month}")

    links_file = os.path.join(REMIT, "runs", f"links-{month}.json")
    if ev.get("links") and not os.path.exists(links_file):
        wjson(links_file, {"parish": ev.get("parish"), "month": month, "links": ev.get("links"), "linksExpireAt": ev.get("linksExpireAt")})

    # §1d: one run per period
    evrec = {"action": ev.get("action"), "recordId": ev.get("recordId"), "savedAt": ev.get("savedAt"), "receivedAt": ev.get("received_at")}

    def claim(s):
        e = s.get(key)
        if e is None:
            s[key] = {"month": month, "status": "filling", "events": [evrec], "handler": "box", "boxEvent": ev,
                      "portalReport": None, "rrr": None, "failure": None, "apiRepairs": [],
                      "startedAt": now().isoformat(timespec="seconds"), "updatedAt": now().isoformat(timespec="seconds")}
            return "new", s[key]
        seen = any(x.get("recordId") == evrec["recordId"] and x.get("savedAt") == evrec["savedAt"] for x in e.get("events") or [])
        if not resumed:
            e.setdefault("events", []).append(evrec)
        if e.get("status") == "held":
            e.update(status="filling", boxEvent=ev, updatedAt=now().isoformat(timespec="seconds"))
            return "resume", e
        return ("seen" if seen else "again"), e

    how, e = state_update(claim)
    st = e.get("status")
    if how in ("seen", "again"):
        if st in ("submitted", "awaiting-reply", "refreshing", "generating", "done"):
            if how == "again" and ev.get("action") == "updated" and e.get("checkEmails") and not e.get("rrr"):
                edit_notice(ctx, ev, e)
            else:
                log(f"duplicate signal ignored (status {st})", key)
            return
        if st == "failed":
            log("new signal for a failed period; not retried automatically", key)
            tg("david", f"ℹ️ A new cut-off signal arrived for {esc(ml)}, whose automatic run had stopped. The box is not "
                        "retrying by itself.", f"mendfailed-again:{key}:{ev.get('savedAt')}")
            return
        if st in ("filling", "saved"):
            stop(ctx, "1d state", f"an earlier run for this period was interrupted (status {st})", wake=True,
                 report_state="unknown (check the portal)")
    set_status(state="running", summary=f"{ml}: filing on the portal…")

    def fail(step, message, wake):
        stop(ctx, step, message, wake=wake)

    # §1e portal pre-check (read-only)
    rc, j, err = node("api-fill.js", "precheck", "--month", month)
    set_status(portal_lines=portal_lines(month))
    skip_submit = False
    if rc == 0 and j.get("existingReport") and j.get("createdByFlow"):
        skip_submit = True
    elif rc == 12:
        r = j.get("existingReport") or {}
        stop(ctx, "1e pre-check", f"a KINGDOM PARISH report already exists for {ml} that this flow did not create "
                                  f"(total input {naira(r.get('totalAmount'))}, {r.get('paymentStatus')}); no report was "
                                  "created or changed", report_state="exists (not made by this flow)")
    elif rc == 10:
        stop(ctx, "1e pre-check", "remittance is not open on the portal for this month yet")
    elif rc:
        stop(ctx, "1e pre-check", f"api-fill.js precheck exit {rc}: {short(j, err)}", wake=True)

    # §2 compute + the mapping check
    bfile = os.path.join(REMIT, "runs", f"app-{month}-breakdown.json")
    B = compute(ctx, bfile, os.path.join(REMIT, "main-src", "app.js"), fail)
    set_status(categories=categories(B))
    try:
        M = mapping()
    except Exception as ex:
        stop(ctx, "2 mapping", str(ex), wake=True)
    missing = unmapped_money(B, M)
    if missing and not skip_submit:
        return hold(ctx, missing)
    if ((rjson(os.path.join(MD, "status.json"), {}) or {}).get("hold") or {}).get("month") == month:
        set_status(hold=None)
        log("hold cleared: every category has a portal line now", key)

    # §3 submit (POSTs once)
    if not skip_submit:
        rc, j, err = node("api-fill.js", "submit", "--month", month, "--breakdown", f"runs/app-{month}-breakdown.json")
        if rc == 0 and j.get("posted"):
            entry_set(key, status="submitted", portalReport={"createdByFlow": True, "createdAt": now().isoformat(timespec="seconds"),
                      "submitted": True, "method": "api", "payload": f"runs/api-payload-{month}.json", "totalInput": j.get("totalInput")})
            log(f"SUBMITTED total input {j.get('totalInput')}", key)
        elif rc == 0:
            entry_set(key, status="submitted")
        elif rc == 14:
            rc2, j2, _ = node("api-fill.js", "precheck", "--month", month, retry=False)
            if rc2 == 0 and j2.get("existingReport") and j2.get("createdByFlow"):
                entry_set(key, status="submitted", portalReport={"createdByFlow": True, "createdAt": now().isoformat(timespec="seconds"),
                          "submitted": True, "method": "api", "note": "POST unclear, report found on read-back"})
            else:
                stop(ctx, "3 submit", f"the portal's answer to the filing was unclear ({short(j, err)}) and no report is "
                                      "visible", wake=True, report_state="unclear (check the portal)")
        elif rc in (10, 12):
            stop(ctx, "3 submit", f"api-fill.js submit exit {rc}: {short(j, err)}")
        elif rc == 13:
            stop(ctx, "3 submit", f"the mapping was refused: {short(j, err)}")
        else:
            stop(ctx, "3 submit", f"api-fill.js submit exit {rc}: {short(j, err)}", wake=True)
    else:
        entry_set(key, status="submitted")
        log("report already filed by this flow; not posting again", key)

    # §3-ATT attendance (never stops the remittance run)
    notes = [f"The attendance filing step failed ({x}); it will be done separately." for x in [attendance_cutoff(ctx)] if x]

    # §4 read back + compare
    rc, j, err = node("api-fill.js", "preview", "--month", month)
    if rc:
        stop(ctx, "4a read-back", f"api-fill.js preview exit {rc}: {short(j, err)}", wake=True, report_state="submitted")
    svp = j.get("storedVsPayload") or {}
    if svp and svp.get("matches") is False:
        diffs = ", ".join(f"{d.get('item')} week {d.get('week')}" for d in (svp.get("diffs") or [])[:6])
        notes.append(f"The portal stored different weekly figures from the ones sent: {diffs}.")
    return check_round(ctx, notes, refresh=None)


def check_round(ctx, notes, refresh):
    """build-run + make-check-email + three emails + Telegram; status awaiting-reply. refresh = None or (person, whenUk)."""
    key, month = ctx["key"], ctx["month"]
    links = os.path.join(REMIT, "runs", f"links-{month}.json")
    if not (rjson(links, {}) or {}).get("links"):
        stop(ctx, "5 email", "no button links in the signal (REMIT_WEBHOOK_KEY not set in the app)", report_state="submitted")
    args = ["--breakdown", f"runs/app-{month}-breakdown.json", "--portal", f"runs/portal-preview-{month}.json",
            "--out", f"runs/run-{month}.json"]
    if refresh:
        args += ["--refresh-by", refresh[0], "--refresh-at", refresh[1]]
    for n in notes:
        args += ["--note", n]
    rc, out, err = py("build-run.py", *args)
    if rc:
        stop(ctx, "4b compare", f"build-run.py exit {rc}: {(err or out).strip()[-150:]}", wake=True, report_state="submitted")
    r = len(glob.glob(os.path.join(REMIT, "runs", f"out-{month}-r*"))) + 1 if refresh else 0
    outdir = os.path.join(REMIT, "runs", f"out-{month}" + (f"-r{r}" if refresh else ""))
    args = ["--in", f"runs/run-{month}.json", "--links", f"runs/links-{month}.json", "--out-dir", os.path.relpath(outdir, REMIT)]
    att = att_file(month)
    if att:
        args += ["--attendance", att]
    rc, out, err = py("make-check-email.py", *args)
    if rc:
        stop(ctx, "4b compare", f"make-check-email.py refused: {(err or out).strip()[-200:]}", report_state="submitted")
    summary = rjson(os.path.join(outdir, "check-summary.json"), {}) or {}
    sent = send_checks(ctx, outdir, f"r{r}")
    tgf = os.path.join(outdir, "tg.json")
    targs = ["--summary", os.path.join(outdir, "check-summary.json"), "--links", links, "--run",
             os.path.join(REMIT, "runs", f"run-{month}.json"), "--out", tgf] + (["--attendance", att] if att else [])
    if tg_build("check", *targs):
        tg_bundle(tgf, f"check:{key}:r{r}")
    entry_set(key, checkEmails=sent, lastCheckSentAt=now().isoformat(timespec="seconds"), runJson=f"runs/run-{month}.json",
              links=f"runs/links-{month}.json", linksExpireAt=(rjson(links, {}) or {}).get("linksExpireAt"), status="awaiting-reply")
    aligned = "all lines match" if summary.get("allAligned") else "some lines differ (see the email)"
    set_status(state="ok", summary=f"{month_label(month)}: check emails sent ({aligned}); waiting for a button"[:200])
    log(f"{'REFRESH SENT r' + str(r) if refresh else 'END awaiting-reply'}", key)


def attendance_cutoff(ctx):
    """§3-ATT. Returns a short problem text for the email, or None."""
    key, month = ctx["key"], ctx["month"]
    rc, j, err = node("att-fill.js", "submit", month, cwd=ATT)
    if rc == 12 and os.path.exists(os.path.join(ATT, "runs", f"att-submit-{month}.json")):
        rc, j, err = node("att-fill.js", "compare", month, cwd=ATT)
    posted = bool((j.get("action") or {}).get("posted") or j.get("posted"))
    matches = rc == 0
    entry_set(key, attendance={"exit": rc, "posted": posted, "matches": matches,
                               "result": os.path.join(ATT, "runs", f"att-result-{month}.json"), "at": now().isoformat(timespec="seconds")})
    log(f"ATT-SUBMIT exit={rc} posted={posted} matches={matches}", key)
    ml = month_label(month)
    why = short(j, err)
    if rc in (0, 12):
        return None
    if rc == 16:
        tg("david", f"⚠️ {esc(ml)} attendance was filed but the portal differs from the app: {esc(why)}. The check email shows it.", f"mendatt:{key}:16")
        return None
    if rc in (10, 13, 15, 17):
        tg("david", f"ℹ️ {esc(ml)} attendance not filed yet: {esc(why)}. Press Refresh attendance in your check email once it's ready.", f"mendatt:{key}:{rc}")
        return None
    wake_ai(f"{key}:attendance", "3-ATT attendance", f"att-fill.js submit exit {rc}: {why}", {"month": month, "periodKey": key})
    tg("david", f"⚠️ {esc(ml)} attendance filing failed twice ({esc(why)}). The Clerk AI has been asked to look at it; the "
                "remittance carries on.", f"mendatt:{key}:fail")
    return why


def edit_notice(ctx, ev, e):
    """§1d: the cut-off collection was edited after the check went out. One plain email each, no links."""
    ml = month_label(ctx["month"])
    try:
        saved = datetime.datetime.fromisoformat(str(ev.get("savedAt")).replace("Z", "+00:00")).astimezone(UK)
        when = ukfmt(saved)
    except Exception:
        when = str(ev.get("savedAt"))
    d = datetime.date.fromisoformat(ctx["periodEnd"]).strftime("%-d %b %Y")
    for who, rec in (e.get("checkEmails") or {}).items():
        body = (f"The cut-off Sunday collection for {d} was edited in the parish app at {when}. The portal report has not "
                "been changed.")
        if who in ("david", "divine"):
            body += " If the figures should be re-read, press Refresh in your check email."
        to = rec.get("to") if isinstance(rec.get("to"), list) else [rec.get("to")]
        mail_plain(to, "Re: " + (rec.get("subject") or f"Kingdom Parish remittance check: {ml}"), body + "\n\nChurch Clerk")
    log(f"EDIT NOTICE sent ({ev.get('savedAt')})", ctx["key"])


def hold(ctx, missing):
    """A category has money but no portal line: nothing is filed. David picks the line in the app; the box resumes."""
    key, month = ctx["key"], ctx["month"]
    ml = month_label(month)
    entry_set(key, status="held", hold={"reason": "unmapped", "categories": missing, "at": now().isoformat(timespec="seconds")})
    set_status(state="held", hold={"month": month, "reason": "unmapped", "categories": missing},
               summary=f"{ml}: on hold, a category has no portal line")
    what = ", ".join(f"{m['label']} ({naira(m['amount'])})" for m in missing)
    gk = f"hold:{key}:" + ",".join(m["key"] for m in missing)
    hg = os.path.join(MD, "holds.json")
    told = rjson(hg, {}) or {}
    if gk not in told:
        wjson(hg, {**told, gk: now().isoformat(timespec="seconds")})
        text = (f"The {ml} remittance is on hold: {what} has no RCCG portal line, so nothing was filed yet.\n\n"
                "David: in the app open Automations → Settings → Remittance (month-end), choose the portal line (or "
                "\"Not remitted\") and press Save. The box files the remittance within 5 minutes after that.")
        e = entry_get(key) or {}
        mail_plain([address("david", e), address("divine", e)], f"Kingdom Parish remittance on hold ({ml})", text + "\n\nChurch Clerk")
        tg("david,divine", f"⏸ <b>{esc(ml)} remittance on hold</b>\n{esc(what)} has no portal line, so nothing was filed yet.\n"
                           "David: Automations → Settings → Remittance (month-end): choose the line and Save. The box carries "
                           "on within 5 minutes.", gk)
    log(f"HELD unmapped: {what}", key)


# ---------------------------------------------------------------- LIVE: a button was confirmed (§A, REPLY-RUN.md)
def live_action(ev):
    st = now().strftime("%Y%m%d-%H%M%S")
    pf = wjson(os.path.join(REMIT, "runs", f"remit-action-{st}.json"), {k: v for k, v in ev.items() if not k.startswith("_")})
    rc, out, err = py("remit-action-claim.py", "--payload", pf)
    c = parse(out)
    res, reason = c.get("result"), c.get("reason") or ""
    wjson(pf.replace(".json", ".claim.json"), c)
    who, action, label = c.get("personName") or ev.get("person"), ev.get("action"), c.get("actionLabel") or ev.get("action")
    ml = month_label(c.get("month") or ev.get("month")) if re.match(r"^\d{4}-\d{2}$", str(c.get("month") or ev.get("month") or "")) else "?"
    log(f"ACTION {ev.get('person')} {action} -> {res} {reason}", c.get("key"))
    if res == "test":
        tg("david", f"✅ Test button worked: {esc(label)} confirmed by {esc(who)} at {esc(c.get('clickedAtUk'))}.", f"mendtest:{st}")
        return
    if res not in ("accepted", "ignored"):
        tg("david", f"⚠️ A button press could not be used ({esc(reason or 'invalid')}). Nothing was done.", f"mendinvalid:{st}")
        return
    if action == "refresh_attendance":
        return att_refresh(c)
    if res == "ignored":
        if reason in ("no-pending-run", "not-awaiting:failed"):
            tg("david", f"ℹ️ {esc(who)} pressed {esc(label)} for {esc(ml)} but there is no run waiting for it ({esc(reason)}). "
                        "Nothing was done.", f"mendignored:{st}")
        return
    ctx = {"key": c["key"], "month": c["month"], "event_file": pf}
    e = entry_get(c["key"]) or {}
    ctx.update(periodStart=c["key"].split("..")[0], periodEnd=c["key"].split("..")[-1])
    other = c.get("other")
    rec = (e.get("checkEmails") or {}).get(other) or {}
    to = [c.get("otherAddress") or address(other, e)]
    mail_plain(to, "Re: " + (rec.get("subject") or f"Kingdom Parish remittance check: {ml}"),
               f"{who} confirmed {label} for the {ml} remittance at {c.get('clickedAtUk')}. Church Clerk is doing it now. "
               "You don't need to press anything; any other press for this check is not acted on.\n\nChurch Clerk")
    log(f"NOTIFIED {other}", c["key"])
    tgf = pf.replace(".json", ".tg.json")
    if tg_build("action", "--claim", pf.replace(".json", ".claim.json"), "--out", tgf):
        tg_bundle(tgf, f"action:{c['key']}:{ev.get('person')}:{action}:{ev.get('clickedAt')}")
    if action == "generate_rrr":
        return do_rrr(ctx, c)
    return do_refresh(ctx, c)


def do_rrr(ctx, c):
    key, month = ctx["key"], ctx["month"]
    log(f"RRR START by {c.get('person')}", key)
    attempt = os.path.join(REMIT, "runs", f"rrr-attempt-{month}.json")
    rc, out, err = run([NODE, "api-fill.js", "rrr", "--month", month, "--yes"], cwd=REMIT)
    j = parse(out)
    if rc in SCRIPT_FAIL and not os.path.exists(attempt):
        time.sleep(RETRY_WAIT)
        rc, out, err = run([NODE, "api-fill.js", "rrr", "--month", month, "--yes"], cwd=REMIT)
        j = parse(out)
    if rc:
        stop(ctx, "RRR", f"api-fill.js rrr exit {rc}: {short(j, err)} (never retried: check View Invoices)", wake=True,
             report_state="submitted")
    inv = (j.get("invoices") or [{}])[0]
    deb = (inv.get("debits") or [{}])[0]
    code = deb.get("RRR")
    outdir = os.path.join(REMIT, "runs", f"out-{month}-rrr")
    rc, o, e = py("make-rrr-email.py", "--rrr", f"runs/rrr-{month}.json", "--preview", f"runs/portal-preview-{month}.json",
                  "--run", f"runs/run-{month}.json", "--confirmed", f"{c.get('personName')} at {c.get('clickedAtUk')} UK",
                  "--out-dir", os.path.relpath(outdir, REMIT))
    rrr = {"code": code, "amountWithFee": deb.get("amountWithFee"), "amount": inv.get("amount"), "transactionFee": inv.get("transactionFee"),
           "invoiceNumber": inv.get("invoiceNumber"), "method": "api", "at": now().isoformat(timespec="seconds"),
           "file": f"runs/rrr-{month}.json", "confirmedBy": c.get("person")}
    entry_set(key, rrr=rrr)
    if rc:
        stop(ctx, "RRR email", f"RRR {code} was generated but make-rrr-email.py refused: {(e or o).strip()[-150:]}", wake=True,
             report_state=f"RRR {code} generated")
    p = rjson(os.path.join(outdir, "payload.json"), {}) or {}
    if mail_sent(p.get("subject") or "-"):
        log("RRR email already in Sent; not sending again", key)
    elif not mail(os.path.join(outdir, "payload.json"), "rrr_generated"):
        stop(ctx, "RRR email", f"RRR {code} was generated but the RRR email could not be sent", wake=True,
             report_state=f"RRR {code} generated")
    if tg_build("rrr", "--summary", os.path.join(outdir, "rrr-summary.json"), "--out", os.path.join(outdir, "tg.json")):
        tg_bundle(os.path.join(outdir, "tg.json"), f"rrr:{PARISH}:{month}")
    entry_set(key, status="done")
    set_status(state="ok", summary=f"{month_label(month)}: RRR {code} generated and emailed")
    log(f"RRR {code}", key)


def do_refresh(ctx, c):
    key, month = ctx["key"], ctx["month"]
    B = compute(ctx, os.path.join(REMIT, "runs", f"app-{month}-breakdown.json"), os.path.join(REMIT, "main-src", "app.js"),
                lambda step, m, w: stop(ctx, "refresh " + step, m, wake=w, report_state="submitted"))
    rc, j, err = node("api-fill.js", "preview", "--month", month)
    if rc:
        stop(ctx, "refresh read-back", f"api-fill.js preview exit {rc}: {short(j, err)}", wake=True, report_state="submitted")
    notes = []
    missing = unmapped_money(B, mapping())
    if missing:
        notes.append("Money now appears in a category with no portal line: " + ", ".join(m["label"] for m in missing)
                     + ". The report on the portal was not changed.")
    check_round(ctx, notes, refresh=(c.get("personName") or c.get("person"), c.get("clickedAtUk") or ukfmt()))


def att_refresh(c):
    """§A-ATT: attendance only; never touches the remittance."""
    key, month, res, reason = c.get("key"), c.get("month"), c.get("result"), c.get("reason") or ""
    ml = month_label(month) if month else "?"
    if res == "ignored":
        if reason in ("no-run-for-month", "several-runs-for-month"):
            tg("david", f"ℹ️ Refresh attendance for {esc(ml)} was not acted on ({esc(reason)}).", f"mendatt-ign:{key}:{c.get('clickedAt')}")
        return
    who = c.get("personName") or c.get("person")
    outcome, email = "failed", False
    rc, j, err = node("att-fill.js", "compare", month, cwd=ATT)
    if rc == 0:
        outcome = "unchanged"
        tg("david", f"ℹ️ Refresh attendance for {esc(ml)} ({esc(who)}, {esc(c.get('clickedAtUk'))}): the portal already "
                    "matches the app; nothing was filed.", f"mendatt-same:{key}:{c.get('clickedAt')}")
    elif rc == 16:
        rc, j, err = node("att-fill.js", "refresh", month, cwd=ATT, retry=False)
        act = j.get("action") or {}
        if rc == 0 and act.get("unchanged"):
            outcome = "unchanged"
        elif rc in (0, 16):
            outcome, email = "done", True
            if rc == 16:
                tg("david", f"⚠️ {esc(ml)} attendance was re-filed but the portal still differs: {esc(short(j, err))}.", f"mendatt-diff:{key}:{c.get('clickedAt')}")
        else:
            outcome = "not-filed"
            tg("david", f"ℹ️ {esc(ml)} attendance not re-filed: {esc(short(j, err))}.", f"mendatt-nf:{key}:{c.get('clickedAt')}")
    elif rc == 17:
        rc, j, err = node("att-fill.js", "plan", month, cwd=ATT)
        ready = ((j.get("app") or {}).get("readiness") or {}).get("ready")
        if rc == 0 and ready and (j.get("portal") or {}).get("open"):
            rc, j, err = node("att-fill.js", "submit", month, cwd=ATT, retry=False)
            outcome, email = ("done", True) if rc in (0, 16) else ("failed", False)
        else:
            outcome = "not-filed"
            why = ", ".join(((j.get("app") or {}).get("readiness") or {}).get("notReady") or []) or short(j, err)
            tg("david", f"ℹ️ {esc(ml)} attendance can't be filed yet: {esc(why)}.", f"mendatt-nr:{key}:{c.get('clickedAt')}")
    if outcome == "failed":
        wake_ai(f"{key}:att-refresh:{c.get('clickedAt')}", "A-ATT refresh attendance", f"att-fill.js exit {rc}: {short(j, err)}",
                {"month": month, "periodKey": key})
        tg("david", f"⚠️ Refresh attendance for {esc(ml)} failed ({esc(short(j, err))}). The Clerk AI has been asked to look at it.",
           f"mendatt-fail:{key}:{c.get('clickedAt')}")
    if email:
        n = len(glob.glob(os.path.join(ATT, "runs", f"out-att-{month}-r*"))) + 1
        outdir = os.path.join(ATT, "runs", f"out-att-{month}-r{n}")
        rc2, o, e = py("make-att-email.py", "--result", f"runs/att-result-{month}.json", "--out-dir", os.path.relpath(outdir, ATT),
                       "--refresh-note", f"Refreshed at {ukfmt()} at {who}'s request (Refresh attendance button).", cwd=ATT)
        if rc2 == 0 and mail(os.path.join(outdir, "payload.json"), "attendance_filed"):
            log(f"EMAIL SENT att r{n}", key)
            links = os.path.join(REMIT, "runs", f"links-{month}.json")
            tgf = os.path.join(outdir, "tg.json")
            ok = tg_build("attendance", "--refresh", "--result", os.path.join(ATT, "runs", f"att-result-{month}.json"),
                          "--links", links, "--out", tgf) or \
                tg_build("attendance", "--refresh", "--result", os.path.join(ATT, "runs", f"att-result-{month}.json"), "--out", tgf)
            if ok:
                tg_bundle(tgf, f"att:{PARISH}:{month}:r{n}")
        else:
            log(f"attendance email not sent ({(e or o).strip()[-120:]})", key)
            tg("david", f"⚠️ {esc(ml)} attendance was re-filed but the updated attendance email could not be sent.", f"mendatt-mail:{key}:{n}")

    def f(s):
        e = s.get(key) or {}
        e["attendanceRefresh"] = {**(e.get("attendanceRefresh") or {}), "status": outcome, "finishedAt": now().isoformat(timespec="seconds")}
        e["attendance"] = {"exit": rc, "posted": email, "matches": rc == 0, "result": os.path.join(ATT, "runs", f"att-result-{month}.json"),
                           "at": now().isoformat(timespec="seconds")}
        if key in s:
            s[key] = e
    state_update(f)
    log(f"ATT-REFRESH exit={rc} {outcome} by {c.get('person')}", key)


def live_test(ev):
    """Settings → Remittance webhook → Send test (WEBHOOK-RUN.md §0)."""
    st = now().strftime("%Y%m%d-%H%M%S")
    if not ev.get("links"):
        tg("david", "✅ Test received by the Clerk box, but the app sent no button links (REMIT_WEBHOOK_KEY not set).", f"wtest:{st}")
        return
    tg("david", f"✅ Test received by the Clerk box ({esc(ev.get('requestedBy') or '')}, {esc(ev.get('sentAt') or '')}). "
                "A test email with buttons is on its way to you.", f"wtestnote:{st}")
    lf = wjson(os.path.join(REMIT, "runs", f"links-test-{st}.json"), {k: v for k, v in ev.items() if not k.startswith("_")})
    outdir = os.path.join(REMIT, "runs", f"out-webhook-test-{st}")
    rc, o, e = py("make-check-email.py", "--webhook-test", "--links", lf, "--out-dir", outdir)
    if rc or not mail(os.path.join(outdir, "david", "payload.json")):
        tg("david", f"⚠️ The test email could not be built or sent: {esc((e or o).strip()[-120:])}", f"wtestfail:{st}")
        return
    if tg_build("webhook-test", "--links", lf, "--out", os.path.join(outdir, "tg.json")):
        tg_bundle(os.path.join(outdir, "tg.json"), f"wtest:{st}", only="david")


# ---------------------------------------------------------------- PRACTICE (handler clerk_ai): no portal, no email
def practice_cutoff(ev):
    """Wait until the Clerk AI's run for the period has finished, then work out what the box would have filed."""
    ctx = ctx_from(ev)
    key, month = ctx["key"], ctx["month"]
    if not month:
        return "done"
    e = entry_get(key) or {}
    try:
        age_h = (now() - datetime.datetime.fromisoformat(str(ev.get("received_at")).replace("Z", "+00:00"))).total_seconds() / 3600
    except Exception:
        age_h = 99
    if e.get("status") not in ("awaiting-reply", "refreshing", "generating", "done", "failed") and age_h < PRACTICE_MAX_WAIT_H:
        return "wait"
    ml = month_label(month)
    pdir = os.path.join(MD, "practice", month)
    os.makedirs(pdir, exist_ok=True)
    problems = []

    def fail(step, message, wake):
        problems.append(f"{step}: {message}")
        return None

    B = compute(ctx, os.path.join(pdir, "app-breakdown.json"), os.path.join(pdir, "app.js"), fail)
    lines, verdict = [], None
    if B:
        set_status(categories=categories(B))
        missing = unmapped_money(B, mapping())
        if missing:
            problems.append("would hold: no portal line for " + ", ".join(f"{m['label']} ({naira(m['amount'])})" for m in missing))
        items = os.path.join(REMIT, "runs", f"portal-items-{month}.json")
        if os.path.exists(items):
            set_status(portal_lines=portal_lines(month))
        if not missing and os.path.exists(items):
            mine = os.path.join(pdir, "payload.json")
            rc, j, err = node("api-fill.js", "submit", "--month", month, "--breakdown", os.path.join(pdir, "app-breakdown.json"),
                              "--dry-run", "--items-file", items, "--payload-out", mine, retry=False)
            if rc:
                problems.append(f"dry run exit {rc}: {short(j, err)}")
            else:
                lines.append(f"Would file {j.get('lines')} lines, total input {naira(j.get('totalInput'))}.")
                theirs = rjson(os.path.join(REMIT, "runs", f"api-payload-{month}.json"))
                if theirs:
                    diff = payload_diff(rjson(mine), theirs)
                    verdict = not diff
                    lines.append("Same as what the Clerk AI filed ✅" if verdict else "Differs from what the Clerk AI filed ❌: " + "; ".join(diff[:6]))
                else:
                    lines.append("The Clerk AI's filing file was not found, so there is nothing to compare with.")
        elif not os.path.exists(items):
            problems.append("the portal item list from the Clerk AI's run was not found (the box does not sign in during practice)")
    if not ev.get("links"):
        problems.append("the signal had no button links")
    ok = not problems and verdict is not False
    text = (f"🧪 <b>Practice run, {esc(ml)}</b> (the Clerk AI did the real one; AI status: {esc(e.get('status') or 'not started')})\n"
            + "\n".join(esc(x) for x in lines + [f"⚠️ {p}" for p in problems])
            + ("\n\nThe box is ready to take this over." if ok and verdict else ""))
    tg("david", text, f"practice:{key}")
    wjson(os.path.join(pdir, "result.json"), {"at": now().isoformat(timespec="seconds"), "ok": ok, "matches": verdict,
                                              "lines": lines, "problems": problems, "aiStatus": e.get("status")})
    set_status(practice={"month": month, "ok": ok, "matches": verdict, "at": now().isoformat(timespec="seconds")},
               state="ok" if ok else "warn", summary=f"Practice {ml}: " + ("matched the Clerk AI" if verdict else
                                                                           "see Telegram" if not ok else "done"))
    log(f"PRACTICE ok={ok} matches={verdict} {'; '.join(problems)[:150]}", key)
    return "done"


def payload_diff(a, b):
    """Per week, per portal item, what differs between two api-fill.js POST bodies."""
    def weeks(p):
        d = json.loads(p["data"]) if isinstance(p.get("data"), str) else p.get("data") or {}
        return {n: {x["itemSlug"]: round(float(x["totalAmount"]), 2) for x in (d.get(f"week{n}") or {}).get("paymentItems") or []}
                for n in range(1, 6)}
    A, Bw = weeks(a or {}), weeks(b or {})
    out = []
    for n in range(1, 6):
        for slug in sorted(set(A[n]) | set(Bw[n])):
            if abs(A[n].get(slug, 0) - Bw[n].get(slug, 0)) >= 0.005:
                out.append(f"week {n} {slug}: box {A[n].get(slug, 0):g}, AI {Bw[n].get(slug, 0):g}")
    return out


# ---------------------------------------------------------------- dispatch
def handle(ev):
    kind, handler = ev.get("event"), ev.get("handler") or "clerk_ai"
    if handler != "box":
        if kind == "cutoff_collection_saved":
            return practice_cutoff(ev)
        return "done"  # button presses and tests are the Clerk AI's while it runs the month-end
    if kind == "cutoff_collection_saved":
        live_cutoff(ev)
    elif kind == "remit_action":
        live_action(ev)
    elif kind == "webhook_test":
        live_test(ev)
    else:
        log(f"unknown signal {kind}")
        wake_ai(f"unknown:{ev.get('id')}", "0 triage", f"unknown month-end signal '{kind}'", {"event": ev.get("_file")})
        tg("david", f"ℹ️ The box got a month-end signal it doesn't know ({esc(kind)}). The Clerk AI has been asked to look at it.",
           f"mendunknown:{ev.get('id')}")
    return "done"


def resume_held():
    for key, e in list((rjson(STATE, {}) or {}).items()):
        if isinstance(e, dict) and e.get("status") == "held" and isinstance(e.get("boxEvent"), dict):
            log("resuming a held month (the Remittance lines changed)", key)
            safe(lambda: live_cutoff(e["boxEvent"], resumed=True), e["boxEvent"])


def safe(fn, ev):
    try:
        return fn()
    except Stop:
        return "done"
    except Exception as ex:
        import traceback
        log(f"CRASH {type(ex).__name__}: {ex}; {traceback.format_exc().splitlines()[-3:]}"[:400])
        if (ev or {}).get("handler") == "box":
            ctx = ctx_from(ev) if ev.get("periodEnd") else None
            if ctx and ctx["month"]:
                try:
                    stop(ctx, "box runner", f"monthend.py crashed ({type(ex).__name__}: {ex})"[:200], wake=True,
                         report_state="unknown (check the portal)")
                except Stop:
                    pass
            else:
                wake_ai(f"crash:{ev.get('id')}", "box runner", f"monthend.py crashed on {ev.get('event')}: {ex}"[:200], {"event": ev.get("_file")})
                tg("david", f"⛔ The box month-end runner crashed on a {esc(ev.get('event'))} signal. The Clerk AI has been asked to look at it.",
                   f"mendcrash:{ev.get('id')}")
        return "done"


def main():
    if sys.argv[1:2] != ["run"]:
        print(__doc__)
        sys.exit(2)
    inbox, done = os.path.join(MD, "inbox"), os.path.join(MD, "done")
    os.makedirs(inbox, exist_ok=True)
    os.makedirs(done, exist_ok=True)
    lock = open(os.path.join(MD, "lock"), "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return  # already running; it picks up anything new before it finishes
    if "--resume" in sys.argv:
        resume_held()
    waiting = set()
    for _ in range(20):
        todo = [f for f in sorted(os.listdir(inbox)) if f.endswith(".json") and f not in waiting]
        if not todo:
            break
        for name in todo:
            p = os.path.join(inbox, name)
            ev = rjson(p)
            if not isinstance(ev, dict):
                os.replace(p, os.path.join(done, name))
                continue
            ev["_file"] = p
            r = safe(lambda: handle(ev), ev)
            if r == "wait":
                waiting.add(name)
                continue
            os.replace(p, os.path.join(done, name))


if __name__ == "__main__":
    main()
# monthend-20261001
