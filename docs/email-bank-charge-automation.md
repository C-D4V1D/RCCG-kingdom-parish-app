# Automatic Bank Charge Recording from Email Alerts

This guide walks you through setting up automatic recording of FirstBank
charge/fee alerts (Account Maintenance, VAT, Stamp Duty, SMS Alert Charge,
Cheque Book Issuance, etc.) into the KPSC Finance ledger -- no manual data
entry required.

**How it works:**
1. Make.com watches your Gmail inbox directly for FirstBank alert emails
   (no forwarding needed -- it connects straight to your own Gmail account)
2. Make sends the email content to the KPSC portal API
3. The portal uses DeepSeek AI to classify the email and extract fields
   (falling back to OpenAI automatically if DeepSeek is unavailable or fails)
4. If the alert is from the KPSC bank account and is a charge, it's
   automatically recorded as an expense. Alerts from any other bank account,
   and alerts that aren't charges, are ignored.

**Time to set up:** ~15 minutes
**Cost:** Free (Make.com free plan, Cloudflare free tier)

> **Note on tool choice:** an earlier version of this guide used Zapier, but
> Zapier gates the "Webhooks by Zapier" action (the piece that lets it call
> our portal) behind its paid Professional plan ($19.99+/month) -- it's not
> available on the free plan at all. Make.com's free plan does not have this
> restriction, and its credit-based pricing comfortably covers the handful of
> alerts a month this feature needs, so it's the recommended free path.

---

## Prerequisites

- Your KPSC portal must be deployed on Cloudflare Pages
- DeepSeek API key must already be configured in the portal
  (Settings > AI Provider Keys -- the same key used for bank statement parsing)
- OpenAI API key configured too, if possible (Settings > AI Provider Keys --
  the same key used for OCR/transcription). This is optional but recommended:
  it's used automatically as a backup only if DeepSeek is unavailable or a
  call to it fails, so a single provider outage doesn't drop a charge.
- Access to the Gmail account that receives FirstBank alerts (you'll connect
  it directly to Make -- no separate forwarding address needed)
- Know the masked account number of your KPSC committee's FirstBank account
  exactly as it appears in the alert emails (e.g. `204XXXX358`) -- you'll enter
  this in Step 2 so alerts from any *other* FirstBank account you may also
  receive are correctly ignored instead of being recorded by mistake.

---

## Step 1: Set the Webhook Secret (~2 min)

The portal needs a secret token to verify that incoming requests are legitimate
(from your Make.com scenario, not from a random person on the internet).

**Generate a secret** -- use this one (or generate your own random string):

```
kpsc-email-ingest-2026-xR7mQ9pL4wN2
```

> To generate your own, run in any terminal:
> `openssl rand -base64 24` or `python3 -c "import secrets; print(secrets.token_urlsafe(24))"`

**Add it to Cloudflare:**

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click **Workers & Pages** in the sidebar
3. Click your project (e.g., `rccg-kingdom-parish-app`)
4. Go to **Settings** > **Environment variables**
5. Click **Add variable**
6. Name: `EMAIL_INGEST_SECRET`
7. Value: paste your secret from above
8. Select **Encrypt** (recommended)
9. Make sure it's set for **Production** (and optionally Preview)
10. Click **Save**

---

## Step 2: Confirm AI Keys + Set Your KPSC Bank Account Number (~2 min)

1. Open your KPSC portal in a browser
2. Go to **Settings** > **AI Provider Keys**
3. Verify the **DeepSeek API Key** field is filled in (it should be, since
   bank-statement parsing already uses it). If empty, paste your DeepSeek key
   there.
4. If you have an **OpenAI API Key** configured too (used elsewhere for OCR
   and transcription), leave it as-is -- it will automatically be used as a
   backup if DeepSeek ever fails or is unreachable. Not required, but
   recommended.
5. In the same section, find **"KPSC Bank Account Number(s) -- Bank Charge
   Email Automation"**. Enter the masked account number exactly as it shows
   in your FirstBank alert emails, e.g. `204XXXX358`. If you have more than
   one KPSC-related account, separate multiple numbers with commas.

   **This is the safety filter that prevents charges from a *different*
   FirstBank account (e.g. a personal account) from ever being recorded.**
   Any alert whose account number doesn't match what you enter here is
   skipped automatically, no matter what else the email says.
6. Click **Save API Keys & Policy**

---

## Step 3: Create Your Make.com Account + Gmail Trigger (~5 min)

1. Go to [make.com](https://www.make.com) and sign up for a free account
2. Click **Create a new scenario**
3. Click the **+** to add your first module and search for **"Gmail"**
4. Select the **"Watch Emails"** trigger
5. Click **Add** next to the connection field to connect your Gmail account
   (the one that receives FirstBank alerts) -- this opens a Google sign-in
   popup, sign in and grant access
6. Configure the trigger:

   | Field | Value |
   |-------|-------|
   | **Folder** | `INBOX` |
   | **Criteria** | `From` contains `FirstAlert@firstbanknigeria.com` (or use Gmail search syntax: `from:FirstAlert@firstbanknigeria.com`) |
   | **Mark as read** | Your preference (either is fine) |
   | **Maximum number of results** | `5` (plenty for this volume) |

7. Click **OK** to save the module

---

## Step 4: Add the HTTP Action (~3 min)

Still in the same scenario:

1. Click the **+** on the right of the Gmail module to add the next module
2. Search for **"HTTP"** and select the **"Make a request"** action
3. Configure the request:

   | Field | Value |
   |-------|-------|
   | **URL** | `https://rccg-kingdom-parish-app.pages.dev/api/internal/ingest-bank-charge-email` |
   | **Method** | `POST` |
   | **Headers** | Key: `Authorization`, Value: `Bearer YOUR_EMAIL_INGEST_SECRET` |
   | **Body type** | `Raw` |
   | **Content type** | `JSON (application/json)` |

   Replace `YOUR_EMAIL_INGEST_SECRET` with the secret from Step 1.

   > **Which URL -- with or without `/kpsc`?** Always use the site root, never
   > `/kpsc/...`. `/kpsc` is just the URL path for the KPSC portal's web page
   > (the frontend you view in a browser); it has nothing to do with where the
   > API lives. Every API route -- including this new one -- is served at
   > `/api/...` directly off the site root regardless of which page you
   > normally browse to. So the correct webhook URL is always
   > `https://rccg-kingdom-parish-app.pages.dev/api/internal/ingest-bank-charge-email`.

4. In the **Request content** box, build the JSON body using the field picker
   (click inside the box, then click the Gmail module's output fields from the
   panel on the right to insert them):

   ```json
   {
     "subject": "{{1.subject}}",
     "from": "{{1.from.address}}",
     "bodyText": "{{1.text}}",
     "messageId": "{{1.id}}"
   }
   ```

   The exact field names in the picker may read slightly differently
   (e.g. "Subject", "From > Email", "Content" / "Text", "Message ID") --
   match by meaning: subject line, sender email address, plain-text body,
   and a unique email identifier.

5. Click **OK** to save the module

---

## Step 5: Turn On the Scenario (~1 min)

1. Click **Save** (bottom-left)
2. Set the schedule: click the clock icon on the Gmail module and choose
   **every 15 minutes** (the minimum interval on the free plan -- still fully
   automatic, just checks every 15 minutes rather than instantly)
3. Toggle the scenario **ON** (top-left switch)

---

## Step 6: Test It (~2 min)

1. In Make, click **Run once** to trigger the scenario immediately against
   whatever matching emails are currently in your inbox (or forward/re-send
   yourself one of your existing FirstBank charge emails first, then Run once)
2. Check the run history (click on the scenario, then the execution log) to
   confirm the Gmail module found the email and the HTTP module got a
   successful response
3. Open the KPSC portal > **Finance** page
4. You should see a new expense entry with:
   - Category: **Bank Charges**
   - The correct amount, date, and narration
   - Recorded by: **AI Email Ingest**

---

## What Gets Recorded vs. Skipped

**Recorded as "Bank Charges" expenses:**
- Account Maintenance Charge
- VAT on Account Maintenance Charge
- Stamp Duty Charge
- SMS Alert Charge / VAT
- Cheque Book Issuance Charge / VAT
- Commission on Turnover (COT)
- Card Maintenance Fee
- ATM Maintenance Charge
- Any other bank-imposed fee

**Skipped (not recorded):**
- Regular transfers (sending money to someone)
- Deposits / credit alerts
- Withdrawals you initiated
- Any non-charge transaction

The AI makes this determination automatically. If it's unsure, it errs on the
side of skipping (you can always enter those manually).

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Nothing appears on Finance page | Check Make's scenario execution history for the HTTP module's response. If it shows an error, check the error message. |
| HTTP module shows 401 error | The `EMAIL_INGEST_SECRET` in the Make HTTP module's header doesn't match the one in Cloudflare. Double-check both values. |
| HTTP module shows 503 error | Either `EMAIL_INGEST_SECRET` isn't set in Cloudflare env vars, or the DeepSeek key isn't configured in portal Settings. |
| HTTP module shows 502 error | Both DeepSeek and OpenAI (if configured) failed. This is usually temporary -- re-run the scenario. |
| Duplicate entries | The system has built-in duplicate detection (by email Message-ID and by date+amount+narration). If you see duplicates, they likely have slightly different narration text. |
| Charge was skipped ("not_a_charge") | The AI classified it as a non-charge. You can check the `email_ingest_log` table for details. Enter it manually on the Finance page. |
| Charge was skipped ("wrong_account") | The extracted account number didn't match what you entered in Settings. Double-check the masked account number is typed exactly as it appears in the alert emails. |
| Amount seems flagged | Charges over 5,000 NGN get a `review_amount` sub-category flag so they stand out on the finance page for manual verification. |

---

## Limits & Costs

- **Make.com free tier**: 1,000 operations/month, max 2 active scenarios,
  15-minute minimum polling interval. Each bank alert email uses about
  2 operations (1 Gmail trigger + 1 HTTP request). Typical usage is
  4-10 alerts/month -- well within limits.
- **DeepSeek API**: Each classification uses ~500 tokens (~$0.001 or less).
  Negligible cost.
- **Cloudflare free tier**: Each email = 1 Pages Function invocation + 1 small
  D1 database read/write. Well within free limits.

---

## Future Upgrade: Cloudflare Email Routing

If the portal ever moves to a custom domain (e.g., `kpscparish.org`) hosted on
Cloudflare, you can replace Make.com entirely with **Cloudflare Email Routing**:

- Free, built-in to Cloudflare
- Instant delivery (no polling delay)
- No third-party account to maintain
- Route `finance@kpscparish.org` directly to a Cloudflare Worker

This requires a domain with DNS managed by Cloudflare (not available with
`.pages.dev` alone).
