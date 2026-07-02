# Automatic Bank Charge Recording from Email Alerts

This guide walks you through setting up automatic recording of FirstBank
charge/fee alerts (Account Maintenance, VAT, Stamp Duty, SMS Alert Charge,
Cheque Book Issuance, etc.) into the KPSC Finance ledger -- no manual data
entry required.

**How it works:**
1. Gmail forwards all FirstBank alert emails to a Zapier address
2. Zapier sends the email content to the KPSC portal API
3. The portal uses DeepSeek AI to classify the email and extract fields
   (falling back to OpenAI automatically if DeepSeek is unavailable or fails)
4. If the alert is from the KPSC bank account and is a charge, it's
   automatically recorded as an expense. Alerts from any other bank account,
   and alerts that aren't charges, are ignored.

**Time to set up:** ~15 minutes  
**Cost:** Free (Zapier free tier, Cloudflare free tier)

---

## Prerequisites

- Your KPSC portal must be deployed on Cloudflare Pages
- DeepSeek API key must already be configured in the portal
  (Settings > AI Provider Keys -- the same key used for bank statement parsing)
- OpenAI API key configured too, if possible (Settings > AI Provider Keys --
  the same key used for OCR/transcription). This is optional but recommended:
  it's used automatically as a backup only if DeepSeek is unavailable or a
  call to it fails, so a single provider outage doesn't drop a charge.
- Access to the Gmail account that receives FirstBank alerts
- Know the masked account number of your KPSC committee's FirstBank account
  exactly as it appears in the alert emails (e.g. `204XXXX358`) -- you'll enter
  this in Step 2 so alerts from any *other* FirstBank account you may also
  receive are correctly ignored instead of being recorded by mistake.

---

## Step 1: Set the Webhook Secret (~2 min)

The portal needs a secret token to verify that incoming requests are legitimate
(from your Zapier, not from a random person on the internet).

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

## Step 3: Create Your Zapier Account + Email Trigger (~5 min)

1. Go to [zapier.com](https://zapier.com) and sign up for a free account
2. Click **Create** > **New Zap** (or the **+** button)
3. For the **Trigger**, search for **"Email by Zapier"**
4. Select it and click **Continue**
5. Zapier will show you a **unique email address** like:
   ```
   abc123@zapiermail.com
   ```
6. **Copy this address** -- you'll need it for Gmail forwarding (Step 5)
7. Click **Continue** and then **Test trigger** (it may say no emails yet -- that's fine)

---

## Step 4: Add the Webhook Action (~3 min)

Still in the same Zap:

1. Click the **+** to add an **Action**
2. Search for **"Webhooks by Zapier"**
3. Choose **POST** as the action event, click **Continue**
4. Configure the action:

   | Field | Value |
   |-------|-------|
   | **URL** | `https://rccg-kingdom-parish-app.pages.dev/api/internal/ingest-bank-charge-email` |
   | **Payload Type** | `json` |
   | **Data** | See field mapping below |
   | **Headers** | `Authorization` = `Bearer YOUR_EMAIL_INGEST_SECRET` |

   Replace `YOUR_EMAIL_INGEST_SECRET` with the secret from Step 1.

   > **Which URL -- with or without `/kpsc`?** Always use the site root, never
   > `/kpsc/...`. `/kpsc` is just the URL path for the KPSC portal's web page
   > (the frontend you view in a browser); it has nothing to do with where the
   > API lives. Every API route -- including this new one -- is served at
   > `/api/...` directly off the site root regardless of which page you
   > normally browse to. So the correct webhook URL is always
   > `https://rccg-kingdom-parish-app.pages.dev/api/internal/ingest-bank-charge-email`.

5. **Data field mapping** (click "+" to add each key-value pair):

   | Key | Value (select from Zapier dropdown) |
   |-----|------|
   | `subject` | **Subject** (from the Email trigger) |
   | `from` | **From Email** (from the Email trigger) |
   | `bodyText` | **Body Plain** (from the Email trigger) |
   | `messageId` | **Message ID** (from the Email trigger, if available) |

6. Click **Continue**, then **Test** (it may fail since no real email has been
   sent yet -- that's OK)
7. **Turn the Zap ON** (toggle in the top-right)

---

## Step 5: Set Up Gmail Forwarding (~4 min)

### 5a: Add the Zapier address as a forwarding destination

1. Open Gmail (the account that receives FirstBank alerts)
2. Click the **gear icon** (top-right) > **See all settings**
3. Go to the **Forwarding and POP/IMAP** tab
4. Click **Add a forwarding address**
5. Paste the Zapier email address from Step 3
6. Click **Next** > **Proceed** > **OK**
7. Gmail sends a **confirmation code** to the Zapier address
8. Go back to Zapier > click **Zap History** (left sidebar) > find the
   confirmation email > copy the confirmation code
9. Back in Gmail, enter the code and click **Verify**

### 5b: Create a filter to auto-forward FirstBank alerts

1. In Gmail Settings, go to **Filters and Blocked Addresses**
2. Click **Create a new filter**
3. In the **From** field, type: `FirstAlert@firstbanknigeria.com`
4. Click **Create filter**
5. Check **Forward it to** and select your Zapier address
6. (Optional) Check **Skip the Inbox (Archive it)** if you don't want these
   cluttering your inbox
7. (Optional) Check **Also apply filter to matching conversations** to
   process existing alerts
8. Click **Create filter**

---

## Step 6: Test It (~1 min)

1. Forward one of your existing FirstBank charge emails to the Zapier address
   manually (just open the email and click Forward, paste the Zapier address)
2. Wait 1-2 minutes
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
| Nothing appears on Finance page | Check Zapier > Zap History for the task status. If it shows an error response, check the error message. |
| Zapier shows 401 error | The `EMAIL_INGEST_SECRET` in Zapier doesn't match the one in Cloudflare. Double-check both values. |
| Zapier shows 503 error | Either `EMAIL_INGEST_SECRET` isn't set in Cloudflare env vars, or the DeepSeek key isn't configured in portal Settings. |
| Zapier shows 502 error | Both DeepSeek and OpenAI (if configured) failed. This is usually temporary -- Zapier will auto-retry up to 3 times. |
| Duplicate entries | The system has built-in duplicate detection (by email Message-ID and by date+amount+narration). If you see duplicates, they likely have slightly different narration text. |
| Charge was skipped ("not_a_charge") | The AI classified it as a non-charge. You can check the `email_ingest_log` table for details. Enter it manually on the Finance page. |
| Charge was skipped ("wrong_account") | The extracted account number didn't match what you entered in Settings. Double-check the masked account number is typed exactly as it appears in the alert emails. |
| Amount seems flagged | Charges over 5,000 NGN get a `review_amount` sub-category flag so they stand out on the finance page for manual verification. |

---

## Limits & Costs

- **Zapier free tier**: 100 tasks/month. Each bank alert email = 1 task.
  Typical usage is 4-10 alerts/month -- well within limits.
- **DeepSeek API**: Each classification uses ~500 tokens (~$0.001 or less).
  Negligible cost.
- **Cloudflare free tier**: Each email = 1 Pages Function invocation + 1 small
  D1 database read/write. Well within free limits.

---

## Future Upgrade: Cloudflare Email Routing

If the portal ever moves to a custom domain (e.g., `kpscparish.org`) hosted on
Cloudflare, you can replace Zapier entirely with **Cloudflare Email Routing**:

- Free, built-in to Cloudflare
- Instant delivery (no polling delay)
- No third-party account to maintain
- Route `finance@kpscparish.org` directly to a Cloudflare Worker

This requires a domain with DNS managed by Cloudflare (not available with
`.pages.dev` alone).
