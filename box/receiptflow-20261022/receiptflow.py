"""Telegram receipt -> app, fully scripted (no secrets here; the token comes from the caller).

After the payer taps "I've paid" the bot asks for the receipt photo. When the photo arrives:
  handle_receipt(ctx, photo, deps) calls the app's POST /api/internal/remittance-receipt (action record). The app reads the receipt,
  checks the RRR, date and reference, saves the payment at the Remita bill and the bank charge (receipt debit minus bill) as an expense.
  Nothing is saved unless every check passes. If it cannot, the payer is told "Instinct is looking at it" and the exact reason goes to
  Instinct by email (never to David, never as a Telegram error post).

ctx   = {"rrr", "bill", "month", "parish", "periodFrom", "periodTo", "label", "person", "authorizedBy", "breakdown"(optional str)}
photo = {"bytes", "mime", "name"}
deps  = {"call": f(payload)->dict, "send": f(text), "alert": f(component, month, reason_lines)->str}
"""
import base64, json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, "..", "satalign-20261022"))
from satalign import USER_AGENT, naira, esc  # noqa: E402

ASK = "📎 Please send the payment receipt (a photo or screenshot of the bank confirmation) here. The payment is recorded only after the receipt."


def call_app(base, token, payload, opener=urllib.request.urlopen):
    req = urllib.request.Request(base.rstrip("/") + "/api/internal/remittance-receipt", data=json.dumps(payload).encode(),
                                 headers={"content-type": "application/json", "x-watchdog-token": token, "user-agent": USER_AGENT}, method="POST")
    with opener(req, timeout=90) as r:
        return json.loads(r.read().decode())


def build_payload(ctx, photo, action="record"):
    return {"action": action, "rrr": ctx["rrr"], "billAmount": ctx["bill"], "part": "a", "label": ctx.get("label", "Part A"),
            "periodFrom": ctx["periodFrom"], "periodTo": ctx["periodTo"], "by": ctx.get("person", "box"),
            "authorizedBy": ctx.get("authorizedBy", ""), "breakdownSnapshot": ctx.get("breakdown", ""),
            "receipt": {"imageBase64": base64.b64encode(photo["bytes"]).decode(), "mimeType": photo.get("mime") or "image/jpeg", "name": photo.get("name", "")}}


def handle_receipt(ctx, photo, deps):
    if not photo or not photo.get("bytes"):
        deps["send"]("I could not open that file. Please send the receipt as a photo or screenshot.")
        return "no file"
    if not str(photo.get("mime") or "image/jpeg").startswith("image/"):
        deps["send"]("Please send the receipt as a photo or screenshot (PDF cannot be read automatically).")
        return "not image"
    try:
        r = deps["call"](build_payload(ctx, photo))
    except Exception as e:            # network, timeout, HTTP error: nothing is known to be saved, so say so and tell Instinct
        deps["send"]("I could not record the payment just now. Instinct is looking at it, nothing was saved.")
        deps["alert"]("receipt-flow", ctx["month"], [f"parish={ctx.get('parish')} rrr={ctx['rrr']}", f"app call failed: {type(e).__name__}: {e}"])
        return "error"
    if not r.get("ok"):
        deps["send"]("I could not record the payment from this receipt. Instinct is looking at it, nothing was saved.")
        deps["alert"]("receipt-flow", ctx["month"], [f"parish={ctx.get('parish')} rrr={ctx['rrr']}", f"reason: {r.get('needsPerson') or r.get('error') or 'unknown'}"])
        return "needs person"
    bits = [f"✅ <b>Payment recorded</b>", f"RRR {esc(ctx['rrr'])} · {naira(r.get('bill'))} paid {esc(r.get('date'))}", f"Reference: {esc(r.get('reference'))}"]
    if r.get("charge"):
        bits.append(f"Bank charge {naira(r['charge'])} recorded as an expense (receipt {naira(r.get('receiptDebit'))} minus bill {naira(r.get('bill'))}).")
    if r.get("already"):
        bits = ["ℹ️ This payment was already recorded. Nothing changed."]
    deps["send"]("\n".join(bits))
    return "recorded" if not r.get("already") else "already"
