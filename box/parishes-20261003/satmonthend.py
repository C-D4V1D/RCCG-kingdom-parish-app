#!/usr/bin/env python3
"""Satellite parish month-end on the Clerk box (parishes-20261003).

monthend.py hands every signal marked `satellite` (a satellite parish's cut-off Sunday saved, or one of its pastor's
Telegram buttons) to this script, in its own process:

  satmonthend.py <event.json>

It runs Kingdom's own month-end (monthend.py: portal pre-check, the app figures, the portal-line check and hold,
filing once, attendance, read-back) for that parish, in the parish's own working folder
/workspace/rccg-sat/<code>/{remit,att}: fresh copies of the rccg-remit and rccg-attendance scripts with Kingdom's
code and names swapped for the parish's, so their files, state and portal filings never touch Kingdom's. The app is
read through the same URLs with X-Sat-Parish (sat-fetch.cjs). Only the messages differ: the check, the RRR and the
"I've paid" button go to the parish's own people (Automations → Parishes) and the copies chosen there, on Telegram
(Generate RRR / Refresh are bot buttons: mend|<code>|<month>|<action>) and by email.
"""
import datetime, json, os, re, shutil, sys

TOOLS = os.environ.get("CLERK_TOOLS", "/workspace/tools")
sys.path.insert(0, TOOLS)
import monthend as M  # noqa: E402
import satinfo as S  # noqa: E402

C = M.C
SRC_REMIT = os.environ.get("SAT_SRC_REMIT", os.path.join(M.ROOT, "rccg-remit"))
SRC_ATT = os.environ.get("SAT_SRC_ATT", os.path.join(M.ROOT, "rccg-attendance"))
SAT_ROOT = os.environ.get("SAT_ROOT", os.path.join(M.ROOT, "rccg-sat"))
SAT_FETCH = os.path.join(TOOLS, "sat-fetch.cjs")
KINGDOM = "602757"
# The RCCG portal's own names (api-fill.js); a parish not listed uses its app name in capitals.
PORTAL_NAMES = {"659840": "SANCTUARY OF FAVOUR PARISH", "597445": "GOOD SHEPHERD PARISH", "761516": "GOD IS ABLE"}
PASS_TYPES = ("remittance_check", "rrr_generated")


class Parish(S.Parish):
    def __init__(self, code):
        super().__init__(code)
        self.portal = PORTAL_NAMES.get(self.code) or self.name.upper()


# ---------------------------------------------------------------- the parish's working folder
def localize(text, P):
    """Kingdom's scripts, made to act for the parish: its code, its portal name, its display name."""
    for a, b in (("api.PARISH.kingdom", f"'{P.code}'"),
                 ("'KINGDOM PARISH'", f"'{P.portal}'"), ('"KINGDOM PARISH"', f'"{P.portal}"'),
                 ("'Kingdom Parish'", f"'{P.name}'"), ('"Kingdom Parish"', f'"{P.name}"'),
                 ("'602757'", f"'{P.code}'"), ('"602757"', f'"{P.code}"')):
        text = text.replace(a, b)
    return text


def prepare(P):
    """Fresh copies of the scripts (every run, so a Kingdom fix reaches the parishes too); runs/ and state/ stay."""
    for src, dst in ((SRC_REMIT, P.remit), (SRC_ATT, P.att)):
        os.makedirs(os.path.join(dst, "runs"), exist_ok=True)
        os.makedirs(os.path.join(dst, "state"), exist_ok=True)
        for f in os.listdir(src):
            s = os.path.join(src, f)
            if os.path.isfile(s) and f.endswith((".js", ".py", ".cjs", ".mjs")):
                t = open(s, encoding="utf-8").read()
                open(os.path.join(dst, f), "w", encoding="utf-8").write(localize(t, P))
    for f in ("api-fill.js", os.path.join("..", "att", "att-fill.js")):
        t = open(os.path.join(P.remit, f), encoding="utf-8").read()
        if "api.PARISH.kingdom" in t or f"'{P.code}'" not in t:
            raise RuntimeError(f"{os.path.basename(f)} could not be set up for parish {P.code}")
    os.environ["SAT_PARISH"] = P.code
    opt = f"--require {SAT_FETCH}"
    if opt not in os.environ.get("NODE_OPTIONS", ""):
        os.environ["NODE_OPTIONS"] = (os.environ.get("NODE_OPTIONS", "") + " " + opt).strip()


# ---------------------------------------------------------------- messages to the parish (and the copies)
def recipients(P, mtype):
    """The parish's people switched on for this message on Telegram (on unless switched off), then the copies."""
    out = [k for k in P.keys() if S.routed(k, mtype)]
    return out + [k for k in P.copies() if k not in out]


def emails(P, keys):
    return [a for a in dict.fromkeys(M.address(k) for k in keys) if a]


def send(P, keys, text, key, buttons=None, button_for=()):
    """One Telegram message per person (buttons only for `button_for`) through send_msg.py, once per key."""
    keys = [k for k in dict.fromkeys(keys) if k]
    if not keys:
        return
    msgs = {k: ({"text": text, "buttons": buttons} if buttons and k in button_for else {"text": text}) for k in keys}
    f = M.wjson(os.path.join(P.dir, "out", f"tg-{re.sub(r'[^A-Za-z0-9_.-]', '_', key)}.json"),
                {"kind": "satellite", "key_hint": key, "messages": msgs})
    M.tg_bundle(f, key)


def plain(html_text):
    return re.sub(r"<[^>]+>", "", html_text)


# ---------------------------------------------------------------- overrides of the Kingdom-only steps
def install(P):
    orig_node, orig_py, orig_label = M.node, M.py, M.month_label
    M.person = S.person   # the parish's people are not in clerkcfg.people() (Kingdom's); emails and names come from here
    M.REMIT, M.ATT, M.MD, M.PARISH = P.remit, P.att, os.path.join(P.dir, "monthend"), P.code
    M.STATE = os.path.join(P.remit, "state", "remit-runs.json")
    M.RUNLOG = os.path.join(P.remit, "state", "run-log.txt")
    M.TGSENT = os.path.join(P.remit, "state", "tg-sent.json")
    M.node = lambda script, *a, cwd=None, retry=True, timeout=900: orig_node(script, *a, cwd=cwd or M.REMIT, retry=retry, timeout=timeout)
    M.py = lambda script, *a, cwd=None, env=None, timeout=300: orig_py(script, *a, cwd=cwd or M.REMIT, env=env, timeout=timeout)
    M.month_label = lambda month: f"{P.name} {orig_label(month)}"
    orig_wake = M.wake_ai
    M.wake_ai = lambda key, step, message, details=None: orig_wake(f"{P.code}:{key}", f"{P.name}: {step}", message,
                                                                   {**(details or {}), "parish": P.code, "satellite": True})

    def stop(ctx, step, message, wake=False, report_state="not created"):
        key, month = ctx["key"], ctx["month"]
        ml = M.month_label(month)
        woke = ""
        if wake:
            r = M.wake_ai(f"{key}:{step}", step, message, {"month": month, "periodKey": key, "event": ctx.get("event_file")})
            woke = " The Clerk AI has been asked to look at it." if r in ("ok", "already asked") else " (The Clerk AI could not be reached.)"
        body = (f"The automatic {ml} remittance run (period {key.replace('..', ' to ')}) stopped.\n\n"
                f"Step: {step}\nWhat happened: {message}\nPortal report: {report_state}.\n\n"
                + ("Nothing needs doing from you yet; the Area office is on it." if wake else
                   "The Area office will look at this; the box will not try again by itself.") + woke + "\n\nChurch Clerk (Clerk box)")
        keys = ["david"] + P.keys()
        M.mail_plain(emails(P, keys), f"{ml} remittance: automatic run stopped", body)
        send(P, keys, f"⛔ <b>{M.esc(ml)} remittance stopped</b> at step {M.esc(step)}: {M.esc(message)}.{M.esc(woke)}",
             f"mendfail:{P.code}:{key}:{step}")
        M.log(f"FAIL {step} {message}", key)
        M.entry_set(key, status="failed", failure={"step": step, "message": message, "at": M.now().isoformat(timespec="seconds")})
        M.set_status(state="failed", summary=f"{ml}: stopped at {step}: {message}"[:200])
        raise M.Stop(message)

    def hold(ctx, missing):
        key, month = ctx["key"], ctx["month"]
        ml = M.month_label(month)
        M.entry_set(key, status="held", hold={"reason": "unmapped", "categories": missing, "at": M.now().isoformat(timespec="seconds")})
        M.set_status(state="held", hold={"month": month, "reason": "unmapped", "categories": missing})
        what = ", ".join(f"{m['label']} ({M.naira(m['amount'])})" for m in missing)
        gk = f"hold:{P.code}:{key}:" + ",".join(m["key"] for m in missing)
        text = (f"⏸ <b>{M.esc(ml)} remittance on hold</b>\n{M.esc(what)} has no RCCG portal line, so nothing was filed yet.\n"
                "The Area office chooses the line in the app; the box then files it within 5 minutes.")
        send(P, ["david"] + P.keys(), text, gk)
        M.mail_plain(emails(P, ["david"] + P.keys()), f"{ml} remittance on hold", plain(text) + "\n\nChurch Clerk")
        M.log(f"HELD unmapped: {what}", key)

    def edit_notice(ctx, ev, e):
        ml = M.month_label(ctx["month"])
        send(P, recipients(P, "remittance_check"),
             f"ℹ️ The cut-off Sunday collection for {M.esc(ml)} was edited in the app after the check went out. "
             "The portal report has not been changed. To re-read the figures, press 🔄 Refresh under the check message.",
             f"mendedit:{P.code}:{ctx['key']}:{ev.get('savedAt')}")

    M.stop, M.hold, M.edit_notice, M.check_round = stop, hold, edit_notice, lambda ctx, notes, refresh: check_round(P, ctx, notes, refresh)


def check_round(P, ctx, notes, refresh):
    """Compare (build-run.py + make-check-email.py in the parish folder), then one check message to the parish."""
    key, month = ctx["key"], ctx["month"]
    ml = M.month_label(month)
    args = ["--breakdown", f"runs/app-{month}-breakdown.json", "--portal", f"runs/portal-preview-{month}.json",
            "--out", f"runs/run-{month}.json"]
    if refresh:
        args += ["--refresh-by", refresh[0], "--refresh-at", refresh[1]]
    for n in notes:
        args += ["--note", n]
    rc, out, err = M.py("build-run.py", *args)
    if rc:
        M.stop(ctx, "4b compare", f"build-run.py exit {rc}: {(err or out).strip()[-150:]}", wake=True, report_state="submitted")
    r = len([d for d in os.listdir(os.path.join(P.remit, "runs")) if d.startswith(f"out-{month}-r")]) + 1 if refresh else 0
    outdir = os.path.join(P.remit, "runs", f"out-{month}" + (f"-r{r}" if refresh else ""))
    cargs = ["--in", f"runs/run-{month}.json", "--out-dir", os.path.relpath(outdir, P.remit)]
    att = M.att_file(month)
    if att:
        cargs += ["--attendance", att]
    rc, out, err = M.py("make-check-email.py", *cargs)
    if rc:
        M.stop(ctx, "4b compare", f"make-check-email.py refused: {(err or out).strip()[-200:]}", report_state="submitted")
    S = M.rjson(os.path.join(outdir, "check-summary.json"), {}) or {}
    ok = S.get("allAligned") and S.get("totalOk", True) and S.get("portalLinesAddUp", True)
    per = f"{datetime.date.fromisoformat(ctx['periodStart']):%-d %b} – {datetime.date.fromisoformat(ctx['periodEnd']):%-d %b %Y}"
    L = [f"{'✅' if ok else '⚠️'} <b>{M.esc(('Updated – ' if refresh else '') + P.name)} remittance check</b>",
         f"{M.esc(M.month_label(month).replace(P.name + ' ', ''))} · {per}", "",
         f"App total: {M.naira(S.get('appComparable'))}", f"Portal total: {M.naira(S.get('portalTotal'))}"]
    if ok:
        L.append(f"✅ <b>Aligned</b> ({S.get('lines', '')} lines; differences under ₦1 count as aligned)")
    else:
        bad = S.get("mismatchLines") or []
        L.append(f"❌ <b>Not aligned</b>: {len(bad)} line(s) differ" + ("" if S.get("totalOk", True) else ", total differs"))
        for x in bad[:5]:
            L.append(f"• {M.esc(x.get('item'))}: portal {M.naira(x.get('portal')) if x.get('portal') is not None else '—'} / "
                     f"app {M.naira(x.get('app')) if x.get('app') is not None else '—'}")
        if len(bad) > 5:
            L.append(f"• … and {len(bad) - 5} more")
    L += ["", f"Amount to remit: <b>{M.naira(S.get('portalTotal'))}</b>", f"Remita fee {M.naira(S.get('remitaFee', 0))} is added at payment."]
    a = ((M.entry_get(key) or {}).get("attendance") or {})
    if a:
        L.append("Attendance: " + {0: "filed on the portal ✅", 12: "filed on the portal ✅",
                                    16: "filed, but the portal differs from the app ⚠️"}.get(a.get("exit"), "not filed yet ⏳"))
    L += [M.esc(n) for n in notes]
    L += ["", "<b>Next step:</b> press ✅ Generate RRR only if the figures are right" + ("" if ok else " and the differences are accepted") + "."]
    text = "\n".join(L)
    approvers = P.keys("approves_rrr") + ["david"]
    buttons = [[{"text": "✅ Generate RRR", "callback_data": f"mend|{P.code}|{month}|generate_rrr"},
                {"text": "🔄 Refresh", "callback_data": f"mend|{P.code}|{month}|refresh"}]]
    who = recipients(P, "remittance_check")
    send(P, who, text, f"satcheck:{P.code}:{key}:r{r}", buttons=buttons, button_for=approvers)
    M.mail_plain(emails(P, who), f"{P.name} remittance check: {M.month_label(month).replace(P.name + ' ', '')}",
                 plain(text) + "\n\nThe buttons are in the Telegram message. Church Clerk")
    M.entry_set(key, checkSentTo=who, lastCheckSentAt=M.now().isoformat(timespec="seconds"), runJson=f"runs/run-{month}.json",
                status="awaiting-reply")
    M.set_status(state="ok", summary=f"{ml}: check sent; waiting for Generate RRR")
    M.log("REFRESH SENT r%d" % r if refresh else "END awaiting-reply", key)


# ---------------------------------------------------------------- the pastor's buttons
def claim(P, ev):
    """First valid press wins while the check is waiting. Returns (ctx, entry) or None after telling the presser why."""
    month, action, person = ev.get("month"), ev.get("action"), ev.get("person")
    allowed = set(P.keys("approves_rrr")) | {"david"}
    runs = {k: e for k, e in (M.rjson(M.STATE, {}) or {}).items() if isinstance(e, dict) and e.get("month") == month}
    key = max(runs) if runs else None
    ml = M.month_label(month) if re.match(r"^\d{4}-\d{2}$", str(month or "")) else "?"
    why = None
    if person not in allowed:
        why = "only the parish's approver (or the Area office) can press this"
    elif not key:
        why = f"there is no {ml} run"
    elif runs[key].get("status") != "awaiting-reply":
        why = f"the {ml} run is not waiting for a button (status {runs[key].get('status')})"
    if why:
        send(P, [person] if person else ["david"], f"ℹ️ {M.esc(action or 'button')} for {M.esc(ml)} was not acted on: {M.esc(why)}.",
             f"satignored:{P.code}:{month}:{action}:{ev.get('clickedAt')}")
        return None

    def f(s):
        e = s[key]
        if e.get("status") != "awaiting-reply":
            return None
        e.update(status="generating" if action == "generate_rrr" else "refreshing",
                 lastAction={"person": person, "action": action, "at": ev.get("clickedAt")})
        return dict(e)
    e = M.state_update(f)
    if e is None:
        return None
    ctx = {"key": key, "month": month, "periodStart": key.split("..")[0], "periodEnd": key.split("..")[-1],
           "event_file": ev.get("_file")}
    who = M.person(person).get("called") or M.person(person).get("name") or person
    send(P, recipients(P, "remittance_check"),
         f"👆 <b>{M.esc(who)}</b> confirmed <b>{'Generate RRR' if action == 'generate_rrr' else 'Refresh'}</b> for the "
         f"{M.esc(ml)} remittance. Church Clerk is doing it now; any other press is not acted on.",
         f"sataction:{P.code}:{key}:{action}:{ev.get('clickedAt')}")
    return ctx, e


def do_rrr(P, ctx, ev):
    key, month = ctx["key"], ctx["month"]
    ml = M.month_label(month)
    attempt = os.path.join(P.remit, "runs", f"rrr-attempt-{month}.json")
    rc, out, err = M.run([M.NODE, "api-fill.js", "rrr", "--month", month, "--yes"], cwd=P.remit)
    j = M.parse(out)
    if rc in M.SCRIPT_FAIL and not os.path.exists(attempt):
        M.time.sleep(M.RETRY_WAIT)
        rc, out, err = M.run([M.NODE, "api-fill.js", "rrr", "--month", month, "--yes"], cwd=P.remit)
        j = M.parse(out)
    if rc:
        M.stop(ctx, "RRR", f"api-fill.js rrr exit {rc}: {M.short(j, err)} (never retried: check View Invoices)", wake=True,
               report_state="submitted")
    inv = (j.get("invoices") or [{}])[0]
    deb = (inv.get("debits") or [{}])[0]
    code = deb.get("RRR")
    rrr = {"code": code, "amountWithFee": deb.get("amountWithFee"), "amount": inv.get("amount"),
           "transactionFee": inv.get("transactionFee"), "invoiceNumber": inv.get("invoiceNumber"), "method": "api",
           "at": M.now().isoformat(timespec="seconds"), "file": f"runs/rrr-{month}.json", "confirmedBy": ev.get("person")}
    M.entry_set(key, rrr=rrr, status="done")
    text = "\n".join([f"⏳ <b>{M.esc(P.name)} remittance RRR</b>", M.esc(M.month_label(month).replace(P.name + " ", "")), "",
                      f"RRR: <code>{M.esc(code)}</code>", "Status: Not paid yet", "",
                      f"Amount to remit: {M.naira(inv.get('amount'))}", f"Remita fee: {M.naira(inv.get('transactionFee'))}",
                      f"Total payable: <b>{M.naira(deb.get('amountWithFee'))}</b>", "",
                      "Pay through Remita with the RRR (long-press it to copy). Tap ✅ I've paid once you have."])
    who = recipients(P, "rrr_generated")
    payers = P.keys("pays_rrr")
    send(P, who, text, f"satrrr:{P.code}:{month}", buttons=[[{"text": "✅ I've paid", "callback_data": f"paid|{month}|{P.code}"}]],
         button_for=payers)
    M.mail_plain(emails(P, who), f"{P.name} remittance RRR {code}: {M.month_label(month).replace(P.name + ' ', '')}",
                 plain(text) + "\n\nChurch Clerk")
    M.set_status(state="ok", summary=f"{ml}: RRR {code} generated")
    M.log(f"RRR {code}", key)


def action(P, ev):
    got = claim(P, ev)
    if not got:
        return
    ctx, e = got
    if ev.get("action") == "generate_rrr":
        return do_rrr(P, ctx, ev)
    who = M.person(ev.get("person")).get("called") or ev.get("person")
    M.do_refresh(ctx, {"person": ev.get("person"), "personName": who, "clickedAtUk": M.ukfmt()})


def handle(ev):
    code = str(ev.get("parish") or "")
    if not re.match(r"^\d{4,8}$", code) or code == KINGDOM:
        M.log(f"satellite signal without a satellite parish: {json.dumps(ev)[:160]}")
        return
    P = Parish(code)
    if P.cfg.get("active") is False:
        M.log(f"parish {code} is paused; signal {ev.get('event')} ignored")
        return
    if (P.cfg.get("handler") or "box") != "box":
        M.wake_ai(f"sat:{code}:{ev.get('id') or ev.get('clickedAt')}", "satellite month-end",
                  f"{P.name}: {ev.get('event')} (Month-end run by: Clerk AI)", {"event": ev.get("_file"), "parish": code})
        return
    prepare(P)
    install(P)
    kind = ev.get("event")
    try:
        if kind == "cutoff_collection_saved":
            M.live_cutoff(ev)
        elif kind == "sat_action":
            action(P, ev)
        else:
            M.log(f"unknown satellite signal {kind}")
    except M.Stop:
        pass


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    ev = M.rjson(sys.argv[1])
    if not isinstance(ev, dict):
        sys.exit("not a signal file")
    ev.setdefault("_file", sys.argv[1])
    handle(ev)


if __name__ == "__main__":
    main()
# parishes-20261003
