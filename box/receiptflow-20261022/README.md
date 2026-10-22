# Receipt flow (Telegram receipt -> app), 22 Oct 2026

Status: app route TESTED on fake data; this box module TESTED offline only. NOT tested on the real box or real Telegram.

Rule (David): a payment is recorded only with a receipt. The extra bank charge is recorded as an expense.

## Wiring for the operator
1. When the payer taps "I've paid" on the remittance message: do not record anything. Send `receiptflow.ASK` and remember (rrr, bill, month, parish, period) for that chat.
2. When a photo/image document arrives in that chat: download the bytes, then
   `receiptflow.handle_receipt(ctx, {"bytes","mime","name"}, {"call": lambda p: receiptflow.call_app(APP_URL, WATCHDOG_TOKEN, p), "send": tg_send, "alert": alerter.alert})`
   (`alert` is the same `Alerter` used by satalign: email to Instinct, no URLs).
3. `bill` is the RRR total payable the box already knows (Oct: 79189.41). The app saves the payment at the bill and the charge (receipt debit minus bill).
4. The route refuses (and saves nothing) on wrong RRR, receipt below bill, future date, no reference, unreadable image. Those go to Instinct by email.

Exact call: `POST {app}/api/internal/remittance-receipt`, header `x-watchdog-token`, a custom User-Agent (Cloudflare blocks the Python default),
JSON `{action:"record"|"preview", rrr, billAmount, part:"a", label, periodFrom, periodTo, by, authorizedBy, receipt:{imageBase64,mimeType,name}}`.
A repeat for the same receipt reference returns `already:true` and changes nothing.
