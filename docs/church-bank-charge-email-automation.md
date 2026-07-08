# Automatic Bank Charge Recording from Church Bank Alert Emails

This guide sets up automatic recording of the church's Access Bank charge/fee
alerts (Account Maintenance, VAT, Stamp Duty, SMS Alert Charge, Commission on
Turnover, Cheque Book Issuance, etc.) into the main **Bank Charges** ledger —
no manual data entry required.

This is the same automation already running for the KPSC committee's bank
account (see `docs/email-bank-charge-automation.md`), pointed instead at the
main church account and its own settings, log, and ledger. The two never
touch each other's data.

**How it works:**
1. Make.com watches the accountant's Gmail inbox directly for Access Bank
   alert emails (no forwarding needed — it connects straight to the
   accountant's own Gmail account)
2. Make sends the email content to the portal API
3. The portal uses DeepSeek AI to classify the email and extract fields
   (falling back to OpenAI automatically if DeepSeek is unavailable or fails)
4. If the alert is from the church's own bank account and is a bank-imposed
   charge, it's automatically recorded as a **Bank Charges** expense — under
   the correct charge type (SMS alert fees, account maintenance, etc.), with
   `status: approved`, no review step. Alerts from any other account, and
   alerts that aren't charges, are ignored.
5. Every alert — charge or not — also has its "Available Balance" captured
   for reconciliation (see below), even when the alert itself isn't a charge.

**Time to set up:** ~15 minutes
**Cost:** Free (Make.com free plan, Cloudflare free tier)

---

## Prerequisites

- The portal must be deployed on Cloudflare Pages (already the case)
- `EMAIL_INGEST_SECRET` must be set in Cloudflare Pages environment variables.
  **If you already set this up for the KPSC automation, it's the same
  variable — skip to Step 2.** Otherwise:
  1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → your project → **Settings** → **Environment variables**
  2. Add variable `EMAIL_INGEST_SECRET`, value = any random string (e.g. generate one with `openssl rand -base64 24`), **Encrypt**, set for **Production**
- DeepSeek API key configured in the portal (Settings → AI Provider Keys,
  currently under the KPSC module — it's a portal-wide key, shared by this
  automation automatically). OpenAI key too, if possible, as an automatic
  backup.
- Access to the accountant's Gmail account (you'll connect it directly to
  Make — no separate forwarding address needed)
- The masked account number of the church's Access Bank account exactly as
  it appears in the alert emails (e.g. `147******487`)

---

## Step 1: Confirm the Webhook Secret

If `EMAIL_INGEST_SECRET` is already set in Cloudflare (e.g. from the KPSC
automation), there is nothing to do here — this new endpoint reuses the same
secret. Otherwise, set it as described in Prerequisites above.

---

## Step 2: Set the Church Bank Account Number (~2 min)

1. Open the portal → **Admin** → **Settings**
2. Find the **🤖 Bank Charge Email Automation** card
3. Check the DeepSeek/OpenAI key status badges. If DeepSeek shows ✗, add the
   key under KPSC → Settings → AI Provider Keys first (it's shared, so this
   only needs doing once across the whole portal).
4. In **Church Bank Account Number(s)**, enter the masked account number
   exactly as it appears in the alert emails, e.g. `147******487`. Separate
   multiple numbers with commas if there's more than one.

   **This is the safety filter that prevents charges from a *different*
   Access Bank account from ever being recorded.** Any alert whose account
   number doesn't match what you enter here is skipped automatically.
5. Click **Save Automation Settings**

---

## Step 3: Create a Make.com Account + Gmail Trigger (~5 min)

1. Go to [make.com](https://www.make.com) and sign up for a free account
2. Click **Create a new scenario**
3. Click the **+** to add your first module and search for **"Gmail"**
4. Select the **"Watch Emails"** trigger
5. Click **Add** next to the connection field to connect the accountant's
   Gmail account — this opens a Google sign-in popup; sign in with the
   accountant's Gmail credentials and grant access
6. Configure the trigger:

   | Field | Value |
   |-------|-------|
   | **Folder** | `INBOX` |
   | **Criteria** | Filter by sender — set **From** to match the Access Bank alert address (e.g. `no_reply@accessbankplc...`) |
   | **Limit** | `5` (plenty for this volume) |

7. Click **OK** to save the module

---

## Step 4: Add the HTTP Action (~3 min)

Still in the same scenario:

1. Click the **+** on the right of the Gmail module to add the next module
2. Search for **"HTTP"** and select the **"Make a request"** action
3. Configure the request:

   | Field | Value |
   |-------|-------|
   | **URL** | `https://rccg-kingdom-parish-app.pages.dev/api/internal/ingest-church-bank-charge-email` |
   | **Method** | `POST` |
   | **Headers** | Key: `Authorization`, Value: `Bearer YOUR_EMAIL_INGEST_SECRET` |
   | **Body type** | `Raw` |
   | **Content type** | `JSON (application/json)` |

   Replace `YOUR_EMAIL_INGEST_SECRET` with the secret from Step 1.

   > Note the route is `ingest-church-bank-charge-email` — different from the
   > KPSC automation's `ingest-bank-charge-email` — so the two never
   > interfere with each other even though they share the same secret.

4. In the **Request content** box, build the JSON body using the field
   picker (click inside the box, then click the Gmail module's output fields
   from the panel on the right):

   ```json
   {
     "subject": "{{1.Subject}}",
     "from": "{{1.From}}",
     "bodyText": "{{1.Text}}",
     "messageId": "{{1.ID}}"
   }
   ```

   Field names may read slightly differently depending on Make's Gmail
   connector version — match by meaning: subject line, sender email address,
   the full email body text, and a unique email identifier. Prefer a full
   "Text"/"HTML" body field over any short "Snippet" so the AI can see the
   full narration, amount, and Available Balance.

5. Click **OK** to save the module

---

## Step 5: Turn On the Scenario (~1 min)

1. Click **Save** (bottom-left)
2. Set the schedule: click the clock icon on the Gmail module and choose
   **every 15 minutes** (the minimum interval on the free plan)
3. Toggle the scenario **ON** (top-left switch)

---

## Step 6: Test It (~2 min)

1. In Make, click **Run once**
2. Check the run history to confirm the Gmail module found the email and the
   HTTP module got a successful response
3. Open the portal → **Bank** → **Bank Charges** tab
4. You should see a new entry with the correct charge type, amount, and date,
   marked with a **🤖 AI Email** badge, plus a **Bank Charge Email
   Automation** activity card showing what was processed
5. Open the **Reconciliation** tab — if the alert included an Available
   Balance, the **Statement Entry Check** will already show a result with no
   typing required

---

## What Gets Recorded vs. Skipped

**Recorded as Bank Charges expenses (auto-mapped to the matching type):**
Account Maintenance Charge, VAT on Account Maintenance, Stamp Duty Charge,
SMS Alert Charge (+ VAT), Commission on Turnover (COT), POS terminal charges,
Cheque Book Issuance Charge (+ VAT), Card/ATM Maintenance Fee, and any other
bank-imposed fee.

**Skipped (not recorded as an expense) — but still used for reconciliation:**
Regular transfers, deposits, withdrawals, Sunday collection or other income
alerts. These are never turned into expense *or* income entries — only their
Available Balance is captured, so nothing you or the accountant enters
manually can ever be duplicated by this automation.

The AI makes this determination automatically. If it's unsure, it errs on
the side of skipping (enter those manually as usual).

---

## How the Reconciliation Auto-Check Works

Every alert email that shows an "Available Balance" — charge or not — has
that balance and its date silently recorded. The **Bank → Reconciliation**
tab then automatically compares the portal's own computed bank balance *as
of that same date* (not "as of today", which would false-alarm on later
legitimate transactions the bank hasn't alerted on yet) against what the
bank itself reported. If they match, you'll see "Reconciled" the moment you
open the tab — no typing needed. If they don't, you'll see the size of the
gap and a one-time notification, so a real discrepancy never goes unnoticed
without you having to remember to check.

This is a detection-only safety net — it flags a mismatch for you to look
into, it never tries to auto-guess and insert whatever might be missing.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Nothing appears on the Bank Charges tab | Check Make's scenario execution history for the HTTP module's response. |
| HTTP module shows 401 error | The `EMAIL_INGEST_SECRET` in the Make HTTP module's header doesn't match Cloudflare's. |
| HTTP module shows 503 error | Either `EMAIL_INGEST_SECRET` isn't set in Cloudflare, or no DeepSeek key is configured in Settings. |
| HTTP module shows 502 error | Both DeepSeek and OpenAI (if configured) failed — usually temporary, re-run the scenario. |
| Duplicate entries | Built-in duplicate detection by email Message-ID and by date+amount+narration. |
| Charge was skipped ("not a charge") | The AI classified it as a non-charge. Check the automation activity card on the Bank Charges tab for details, or enter it manually. |
| Charge was skipped ("wrong account") | The extracted account number didn't match Settings — double check the masked number is typed exactly as it appears in the alert emails. |
| Large amount | Charges over ₦5,000 get a note flagging them for visibility — they're still recorded automatically, just worth a glance. |

---

## Limits & Costs

- **Make.com free tier**: 1,000 operations/month, max 2 active scenarios,
  15-minute minimum polling interval. Each alert uses ~2 operations. If the
  KPSC automation is also running, together they're still well within free
  limits for typical volumes.
- **DeepSeek API**: ~500 tokens per classification (~$0.001 or less).
- **Cloudflare free tier**: 1 Pages Function invocation + 1 small D1 read/write per email.
