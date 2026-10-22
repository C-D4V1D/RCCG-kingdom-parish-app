"""Fix alignment, box side (no secrets in this file; the token comes from the caller).

Talks to the app's POST /api/internal/satellite-align (preview / apply / undo) and turns the answers into Telegram text.
Everything that touches the outside world is passed in (`deps`), so the logic is tested offline with fakes.

  preview_message(name, month, r)  -> (html, buttons)   what it will add, what it cannot fix, Apply / Cancel
  run(action, ctx, deps, change_id) -> str              fix_preview / fix_apply / fix_undo, returns what was sent
  Alerter(...).alert(code, name, month, items)          one email to Instinct per parish+month+set of lines (once)

ctx  = {"code", "name", "month", "lines": [{"item","portal","app"}], "person"}
deps = {"call": f(action, **payload)->dict, "send": f(html, buttons=None), "refresh": f()->{"app","portal","bad"},
        "alert": f(code, name, month, items)}
"""
import hashlib, html, json, os, urllib.request

ALERT_TO = "cdavid@mail.instinct.com"


def naira(v):
    try:
        return "₦{:,.2f}".format(float(v))
    except (TypeError, ValueError):
        return "—"


def esc(s):
    return html.escape(str(s if s is not None else ""))


def call_app(base, token, action, parish, month, lines=None, by="box", change_id=None, opener=urllib.request.urlopen):
    body = {"action": action, "parish": parish, "month": month, "lines": lines or [], "by": by}
    if change_id:
        body["changeId"] = change_id
    req = urllib.request.Request(base.rstrip("/") + "/api/internal/satellite-align", data=json.dumps(body).encode(),
                                 headers={"content-type": "application/json", "x-watchdog-token": token}, method="POST")
    with opener(req, timeout=40) as r:
        return json.loads(r.read().decode())


def _lines(items, fmt):
    return [("• " + fmt(x)) for x in items]


def set_hash(lines, changes):
    """Fingerprint of exactly what was previewed: the check's lines and the changes the app proposed for them."""
    norm = lambda xs: sorted(json.dumps(x, sort_keys=True, ensure_ascii=False) for x in (xs or []))
    return hashlib.sha1(json.dumps([norm(lines), norm(changes)]).encode()).hexdigest()[:10]


def preview_message(name, month, r, code, lines=None):
    ch, hu = r.get("changes") or [], r.get("needsPerson") or []
    L = [f"🛠 <b>Fix alignment: {esc(name)}</b> ({esc(month)})", ""]
    if ch:
        L.append("It will add these to the parish's quotas, at the portal's amount:")
        L += _lines(ch, lambda c: f"{esc(c['label'])}: {naira(c['amount'])}")
        L.append("The portal and payments are not touched. You can undo it.")
    else:
        L.append("Nothing here can be fixed by the script.")
    # Items the script cannot fix are never listed to the presser: they go to Instinct only (Alerter).
    buttons = None
    if ch:
        h = set_hash(lines, ch)
        buttons = [[{"text": "✅ Apply", "callback_data": f"mend|{code}|{month}|fix_apply|{h}"},
                    {"text": "✖ Cancel", "callback_data": f"mend|{code}|{month}|fix_cancel"}]]
    return "\n".join(L), buttons


def _after(name, month, before, after, head):
    L = [head, "", f"{esc(name)} ({esc(month)})", "",
         f"App total: {naira(before.get('app'))} → <b>{naira(after.get('app'))}</b>",
         f"Portal total: {naira(after.get('portal'))}",
         f"Lines that differ: {len(before.get('bad') or [])} → <b>{len(after.get('bad') or [])}</b>"]
    return "\n".join(L)


def run(action, ctx, deps, change_id=None, bound=None):
    """`bound` = the set hash carried by the Apply button; `change_id` = the id carried by the Undo button."""
    code, name, month = ctx["code"], ctx["name"], ctx["month"]
    call, send = deps["call"], deps["send"]
    if action == "fix_cancel":
        send("Cancelled. Nothing was changed.")
        return "cancelled"
    if action == "fix_preview":
        r = call("preview", parish=code, month=month, lines=ctx["lines"], by=ctx["person"])
        text, buttons = preview_message(name, month, r, code, ctx["lines"])
        send(text, buttons)
        if r.get("needsPerson"):
            deps["alert"](code, name, month, r["needsPerson"])
            send("I am handling the rest.")
        return text
    if action == "fix_apply":
        # Apply only the exact set that was previewed. Re-ask the app now; if the lines or its proposal changed, refuse and re-preview.
        now = call("preview", parish=code, month=month, lines=ctx["lines"], by=ctx["person"])
        if not bound or set_hash(ctx["lines"], now.get("changes")) != bound:
            send("The figures changed since the preview, so nothing was applied. Here is the new preview.")
            return run("fix_preview", ctx, deps)
        before = deps["refresh"]()          # measured before
        r = call("apply", parish=code, month=month, lines=ctx["lines"], by=ctx["person"])
        if not r.get("applied"):
            send("Nothing was changed.")
            if r.get("needsPerson"):
                deps["alert"](code, name, month, r["needsPerson"])
            return "not applied"
        after = deps["refresh"]()           # measured after: re-read app figures and the portal
        text = _after(name, month, before, after, "✅ <b>Fix alignment done</b>")
        send(text, [[{"text": "↩ Undo", "callback_data": f"mend|{code}|{month}|fix_undo|{r['changeId']}"}]])
        if r.get("needsPerson"):
            deps["alert"](code, name, month, r["needsPerson"])
        return text
    if action == "fix_undo":
        before = deps["refresh"]()
        r = call("undo", parish=code, month=month, by=ctx["person"], change_id=change_id)
        if not r.get("ok"):
            send("Could not undo: the amounts were edited since. Nothing was changed.")
            return "undo refused"
        after = deps["refresh"]()
        text = _after(name, month, before, after, "↩ <b>Fix alignment undone</b>")
        send(text)
        return text
    raise ValueError(action)


class Alerter:
    """Email to Instinct once per parish, month and set of lines. Fallback: the ops Telegram topic (never David's DM).
    `mail(to, subject, body) -> bool`, `topic(text) -> bool`. State: a JSON file of sent fingerprints."""

    def __init__(self, state_path, mail, topic, to=ALERT_TO):
        self.path, self.mail, self.topic, self.to = state_path, mail, topic, to

    @staticmethod
    def fingerprint(code, month, items):
        rows = sorted(json.dumps(x, sort_keys=True, ensure_ascii=False) for x in items)
        return hashlib.sha1("|".join([str(code), str(month)] + rows).encode()).hexdigest()[:16]

    def _seen(self):
        try:
            return json.load(open(self.path))
        except (OSError, ValueError):
            return {}

    def alert(self, code, name, month, items):
        if not items:
            return "empty"
        fp = self.fingerprint(code, month, items)
        seen = self._seen()
        if fp in seen:
            return "duplicate"
        subject = f"[Instinct-alert] satellite alignment {name} {month}"
        body = "\n".join([f"parish={code} ({name}) month={month}", "Lines the Fix alignment script cannot fix (one JSON per line):"]
                         + [json.dumps(x, ensure_ascii=False, sort_keys=True) for x in items])
        how = "email" if self.mail(self.to, subject, body) else None
        if not how and self.topic(subject + "\n" + body):
            how = "topic"
        if not how:
            return "failed"               # nothing recorded, so the next press tries again
        seen[fp] = {"how": how, "parish": code, "month": month}
        tmp = self.path + ".tmp"
        json.dump(seen, open(tmp, "w"))
        os.replace(tmp, self.path)
        return how
