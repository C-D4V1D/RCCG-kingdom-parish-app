# RCCG Kingdom Parish, Aguleri — Church Finance, Governance & Partnership Platform

A production system that runs the money, the meetings and the fundraising of a local
church in Anambra State, Nigeria — built and operated end to end by one person acting as
analyst, product owner, engineer and administrator.

It is three products on one codebase and one database:

| Product | Who uses it | What it does |
|---|---|---|
| **Finance & Accounting Portal** (`/`) | Parish admin team — 6 roles | Records every naira in and out, computes and tracks RCCG headquarters remittances, runs petty cash and bank reconciliation, produces signed monthly statements |
| **KPSC Committee Portal** (`/kpsc/`) | 12-member stewardship committee | AI meeting secretary, governance and byelaw control, partnership fundraising, project pipeline, automated SMS engagement |
| **God's Kingdom Partnership** (`/partnership/`) | The congregation and diaspora members | Public pledge landing page, live impact figures, transparency and progress reporting |

Live on Cloudflare Pages. Installable as a PWA on any phone. No framework and no build
server — hosting, serverless functions, database and CI all sit on free tiers, so the only
recurring cost is the AI, SMS and voice-service usage the parish actually consumes.

---

## Table of contents

- [Why it exists](#why-it-exists)
- [The organisation it serves](#the-organisation-it-serves)
- [Screenshots](#screenshots)
  - [Finance & Accounting Portal](#finance--accounting-portal)
  - [KPSC Committee Portal](#kpsc-committee-portal)
  - [Public partnership site](#public-partnership-site)
- [Feature reference](#feature-reference)
- [RCCG remittance rules encoded in the system](#rccg-remittance-rules-encoded-in-the-system)
- [Roles and permissions](#roles-and-permissions)
- [Architecture](#architecture)
- [Automation and AI](#automation-and-ai)
- [Data model](#data-model)
- [Engineering practice](#engineering-practice)
- [Project scale](#project-scale)
- [Running it locally](#running-it-locally)
- [Repository layout](#repository-layout)
- [Authorship and method](#authorship-and-method)

---

## Why it exists

The parish ran on paper and memory. Sunday collections were counted into a notebook,
remittances to RCCG headquarters were calculated by hand against a sheet of percentages
and fixed levies, petty cash was reconciled from receipts in an envelope, and the
committee's decisions lived in a secretary's notes that nobody could find six months
later. Three recurring failures came out of that:

1. **Remittance error and dispute.** RCCG's split rules run to more than a dozen
   percentage lines plus fixed monthly quotas and a province rebate that is itself a
   percentage of an already-split figure. Hand calculation produced under- and
   over-payments, and no audit trail to settle them.
2. **Cash with no owner.** Money moved between the ushers, the accountant, the bank and
   the admin officer's petty cash with no single place that said how much was where.
3. **Fundraising that leaked.** Partnership pledges were made verbally, tracked on cards,
   and quietly lapsed — with nobody able to say who was behind, by how much, or for how long.

The platform closes all three. Every figure on every screen is derived from a recorded
transaction, every movement of cash has a named party and a timestamp, and the
committee's governance — quorum, thresholds, byelaw amendments — is enforced by the
software rather than remembered by a person.

---

## The organisation it serves

**RCCG Kingdom Parish, Aguleri** is a parish of the Redeemed Christian Church of God in
Anambra State, Nigeria. It sits inside RCCG's hierarchy (Parish → Area/Zone → Province →
National HQ), remits a defined share of its income upward every month, and also acts as a
**collection point for three satellite parishes** whose province contributions pass
through its bank account.

**KPSC — the Kingdom Parish Stewardship Committee** is the twelve-member lay body that
governs the parish's development and welfare fund: 3 men, 3 women, 3 youths, 2 ministers
and the Parish Pastor. It holds the partnership fund, approves projects above defined
thresholds, administers welfare cases under a written policy, and publishes financial
summaries to the congregation twice yearly.

**God's Kingdom Partnership** is the committee's recurring-giving programme: members at
home and in the diaspora pledge a sustainable monthly amount, receive a physical
partnership card signed by the KPSC Treasurer, and are prayed for weekly. The programme
exists to end the parish's dependence on ad-hoc emergency levies by making development
and welfare funding predictable.

The three parts of the platform map exactly onto those three constituencies.

---

## Screenshots

> Every screenshot below is the real application, captured from a local instance
> running the production code against **synthetic demonstration data**. No real
> member, partner, financial or bank data appears anywhere in this repository.

### Finance & Accounting Portal

**Portal homepage and PIN sign-in** — role-selected sign-in with a plain-English
explanation of what the portal is for, so a new admin team member can orient themselves
before they have an account.

![Portal homepage](docs/screenshots/01-portal-homepage.png)

**Dashboard** — one screen that answers "where does the parish stand today". Opening
balance, income and expenses for the period, a split of every naira collected into
RCCG's share / parish retained / children's department, total church balance broken out
by bank, cash-with-accountant, petty cash and custodial satellite funds, remittance due
with a countdown, and a blended-rate forecast of the month's expected income and retained
share. The period toggle switches the whole app between RCCG's remittance period and the
calendar month.

![Finance dashboard](docs/screenshots/02-finance-dashboard.png)

**Transactions ledger** — every income, expense, remittance, petty cash and bank movement
in one filterable, sortable, paginated list, with CSV and PDF export and role-specific
saved views.

![Transactions ledger](docs/screenshots/03-transactions-ledger.png)

**Income recording** — Sunday collections by RCCG type, other income, deposit tracking per
record, cash-with-accountant ageing, and the separately ring-fenced satellite/zone
pass-through pool that must never be counted as parish income.

![Income recording](docs/screenshots/04-income-recording.png)

**Remittance calculator** — the heart of the system. Every percentage line, additional levy,
fixed quota and the province rebate computed from the period's actual collections, split
into Part A (RCCG authorities) and Part B (thanksgiving, pastoral and local distribution),
with payment history, local church share, and a printable/shareable remittance report.

![Remittance calculator](docs/screenshots/05-remittance-calculator.png)

**Expenses** — categorised spending with subcategory suggestions, quick-log chips for
frequent items, receipt capture, split payment across bank/cash/petty, and a live
spendable-balance guard that blocks spending the parish cannot cover.

![Expenses](docs/screenshots/06-expenses.png)

**Bank** — balances, deposits, withdrawals, bank charges, automated charge capture from
bank alert emails, and a monthly reconciliation view that ties the ledger to the statement.

![Bank](docs/screenshots/07-bank-reconciliation.png)

**Petty cash / imprest** — a float with a named holder, request → verification → approval →
settlement workflow, top-up targeting, and a sustainability indicator that says whether
the float can be refilled next period.

![Petty cash](docs/screenshots/08-petty-cash.png)

**Reports centre** — monthly financial statements, remittance reports and period exports,
with Pastor sign-off and shareable read-only web links.

![Reports centre](docs/screenshots/09-reports-centre.png)

**Audit log** — timestamped record of system actions with the acting user.

![Audit log](docs/screenshots/10-audit-log.png)

**IT Admin panel** — users and roles, church settings, monthly quota configuration,
collection-type management, remittance rate overrides, a role-permission editor, and
backup/restore.

![IT admin panel](docs/screenshots/11-it-admin-panel.png)

### KPSC Committee Portal

Mobile-first, installable as a PWA, with its own authentication and role model entirely
separate from the finance portal.

| Committee sign-in | Home |
|---|---|
| ![KPSC login](docs/screenshots/20-kpsc-login.png) | ![KPSC home](docs/screenshots/21-kpsc-home.png) |

**Meeting room** — the AI Secretary pipeline: Draft → Recording → Ended → Processed.
Attendance is taken against the roster by constituency for quorum, audio streams live to
transcription with speaker diarization, and handwritten notes can be uploaded and read by OCR.

![KPSC meeting room](docs/screenshots/43-kpsc-meeting-room.png)

| Meeting archive | Action items |
|---|---|
| ![Meeting archive](docs/screenshots/22-kpsc-meeting-archive.png) | ![Action items](docs/screenshots/25-kpsc-action-items.png) |

| Agenda builder | Project pipeline |
|---|---|
| ![Agenda builder](docs/screenshots/26-kpsc-agenda-builder.png) | ![Projects](docs/screenshots/24-kpsc-projects.png) |

| Committee finance ledger | Partner register |
|---|---|
| ![KPSC finance](docs/screenshots/27-kpsc-finance.png) | ![Partners](docs/screenshots/28-kpsc-partners.png) |

**Partner progress report** — the analytics screen behind the fundraising programme:
expected monthly income by partnership type, pledge distribution, payment health, and a
per-partner twelve-month payment grid with months-behind and outstanding balance.

![Partner progress](docs/screenshots/29-kpsc-partner-progress.png)

**SMS logs and scheduler health** — the messaging module diagnoses its own automation
rather than assuming it works: whether today is a send day, whether the send window is
open, whether the scheduler has checked in at all, and whether delivery reports are being
received — each with the exact configuration step that fixes it. (The red panels below are
that diagnostic working: the demo instance has no scheduler attached, and the portal says
so.) Alongside it, wallet balance, cost per page, spend to date, and delivery outcomes.

| SMS logs & scheduler health | Reminder workflow |
|---|---|
| ![SMS logs](docs/screenshots/30-kpsc-sms-logs.png) | ![Reminders](docs/screenshots/31-kpsc-reminders.png) |

| Committee roster | Committee SMS composer |
|---|---|
| ![Roster](docs/screenshots/32-kpsc-committee-roster.png) | ![Committee SMS](docs/screenshots/33-kpsc-committee-sms.png) |

### Public partnership site

A public landing page with live figures drawn from the committee ledger — active partners,
contributed year to date, welfare cases supported, the project pipeline with funding
progress, the partners wall (names only, by consent), the governance statement, bank
details, and a pledge form that hands off to WhatsApp.

![Partnership landing page](docs/screenshots/40-partnership-landing.png)

![Partnership progress report](docs/screenshots/41-partnership-progress.png)

---

## Feature reference

### Finance & accounting

- **PIN authentication** (4–6 digits, SHA-256 hashed) with role-based access control,
  self-service PIN change, and a signatory name-selection step where two people share a role.
- **Dashboard** with dual period modes (RCCG remittance period / calendar month), opening
  and closing balances, income-split card, total church balance by location of funds,
  remittance due with countdown, available-fund-after-all-deductions with a health state,
  weekly net retained, monthly trend, and a data-driven forecast with worst/likely/best
  spread derived from historical standard deviation.
- **Unified transactions ledger** across five modules with filter, sort, search,
  pagination, CSV/PDF export, saved views per role, and tap-to-detail on mobile.
- **Income recording** — eleven built-in RCCG Sunday collection types plus other income
  (midweek offerings, donations, building fund, bank transfers, harvest pledges), usher
  attribution, per-record bank transfer tracking, deposit confirmation with teller
  reference, and same-day merge so a collection counted in two sittings never becomes two records.
- **Admin-defined collection types** — when RCCG introduces a new collection, the IT Admin
  adds it with its own national/local split from the admin panel with no code change. It
  appears immediately on the income form, in summaries, in the remittance calculation and
  report, and in statements. Types with money already recorded against them can be
  deactivated but never deleted, so historical figures stay intact.
- **Remittance engine** — all percentage-based lines, additional RCCG levies (CRM add-on,
  coastline, insurance funds on general and ministers' tithe), fixed monthly quotas with
  proration and a per-period "not due" override, the province rebate computed on already-split
  local tithes, and a Part A / Part B payment split with cut-off date management, partial
  payment, area payment tracking, prior-period reconciliation write-off, and rate/quota
  snapshotting so a historical remittance is never retroactively changed by a settings edit.
- **Expenses** — fifteen categories with subcategory suggestions, quick-log chips,
  receipt image capture, split payment across bank/cash/petty cash, spendable-balance
  guard, and drill-through from the dashboard breakdown into the filtered ledger.
- **Bank module** — balance tracking, deposits (single and bulk), withdrawals with a
  direct-expense path, bank charges, balance snapshots captured from alert emails, and
  monthly reconciliation against the ledger.
- **Petty cash / imprest** — float configuration with maximum, request → accountant
  verification → signatory approval → settlement with change returned, advances,
  top-up to a target balance, petty-cash-to-bank deposit, and a sustainability indicator.
- **Satellite / zone pass-through pool** — custodial money received from and remitted on
  behalf of three satellite parishes, held in its own table, mirrored into the bank
  balance for accuracy, and excluded from every income, expense and remittance total.
- **Monthly financial statement** — opening and closing balances, income and expense
  detail, Pastor sign-off workflow, A4 print layout, direct PDF download and a shareable
  read-only web link with rich link previews.
- **Audit log** and an in-app **notification centre** with unread badge.
- **IT Admin panel** — user management, church settings, quota configuration (drag to
  reorder), collection types, remittance rate overrides, a role-permission editor, float
  override, production-launch data reset, and backup/restore.

### KPSC committee governance

- **Separate authentication** — KPSC accounts, roles, sessions and forced first-login PIN
  change, independent of the finance portal's users.
- **AI Meeting Secretary** — a four-stage meeting pipeline (draft → recording → ended →
  processed) producing summaries, formal minutes, a resolutions register, action items,
  suggested projects and plain-English minutes for the wider congregation.
- **Live meeting capture** — continuous microphone streaming to realtime transcription over
  WebRTC, speaker diarization mapped onto named committee members, MediaRecorder chunking
  every five seconds so the browser never holds a whole recording in memory, chunk upload
  to object storage, and reconnect/retry on both paths.
- **Voice fingerprinting** — committee members enrol a voice sample; a dedicated
  ECAPA-TDNN embedding service returns a 192-dimension speaker vector and the edge worker
  matches speakers by cosine similarity, so transcript lines carry real names.
- **Governance enforcement that AI cannot override** — quorum checks by constituency,
  major-project spend thresholds, welfare and privacy language checks, unfinished-meeting
  and missing-transcript flags, and transcript prompt-injection detection. Model output is
  treated as draft only: the backend sanitises it, falls back to deterministic extraction
  when fields are missing or malformed, and always re-applies the mandatory policy checks.
- **Byelaw and policy management** — versioned policy documents with approval and effective
  dates, an amendment workflow with preview, proofread and apply steps, a full amendment
  log, and public byelaw and welfare-policy pages.
- **Agenda builder** — captured notes (typed, pasted, dictated or OCR'd), AI-assisted
  agenda assembly, reusable agenda templates, and a WhatsApp notification composer.
- **Action item tracking** with assignee, due date, priority, overdue detection, meeting
  and project linkage, export, and automated deadline reminders.
- **Project pipeline** — proposed / active / completed with estimated cost, raised amount,
  target date, promotion from meeting resolutions, and publication to the public site.
- **Committee finance ledger** — income and expense entries by category, partner linkage,
  cash handover tracking between holders, minimum-balance setting, an "available for
  projects" figure, AI-assisted bank statement reconciliation, and multi-month shareable
  finance reports.
- **Public minutes** — a share token that publishes an approved meeting's plain-English
  minutes to a read-only page.

### Partnership fundraising and engagement

- **Partner register** — partnership types, monthly pledge, start date, status, reminder
  preference, consent flag for public listing, DND and opt-out handling, and soft delete.
- **Payment tracking** — month-by-month payment grid per partner, expected versus actual,
  partial payments, physical-card recording, and cash collection with handover to the treasurer.
- **Partner progress analytics** — expected monthly income by type, pledge distribution,
  payment health bands, months behind, outstanding balance, and partners not yet started
  excluded from a month's expected income.
- **SMS engagement over Termii** — welcome messages, payment thank-yous, Happy New Month,
  payment reminders on a configurable day/frequency/mode, partner anniversaries,
  pre-meeting notices, action-item deadline nudges, and scheduled blasts.
- **SMS craftsmanship** — GSM-7 page counting with live cost estimate, one-click
  emoji → GSM-7 conversion, template library with `{{variable}}` substitution, quiet-hours
  send window, separate sender IDs for partners and members, delivery-status webhook
  reconciliation, retry, wallet balance monitoring with low-balance warnings, and per-month
  delivery analytics.
- **Public pledge capture** — landing page pledge form, feedback inbox, and an in-portal
  inbox for both.

---

## RCCG remittance rules encoded in the system

These are the denominational rules the calculator implements. They are configurable —
every rate and quota below is an editable default, and historical remittances keep a
snapshot of the rates in force when they were paid.

### Tithes

| Line | National HQ | Local |
|---|---|---|
| Members' Tithe | 58% | 42% |
| Ministers' Tithe | 62% | 38% |

**Province Rebate** — 20% of the combined *local retained* tithes (the 42% and the 38%),
deducted from the parish's own share. It applies to tithes only.

### Thanksgiving

| Destination | Share |
|---|---|
| National HQ | 75% |
| Area / Zonal Pastor | 5% |
| Parish Pastor | 10% |
| Ministers | 9% |
| Pastors' Seed | 1% |

### Offerings

| Collection | National HQ | Local |
|---|---|---|
| Sunday Love Offering (SLO) | 30% | 70% |
| CRM (Weekly Activities) | 60% | 40% |
| Gospel Fund (Workers' Offering) | 25% | 75% |
| Sunday School | 100% | — |
| First Fruit | 100% | — |
| Teen/Children's Offering | 35% | 65% (Children's Dept) |
| Weekend Offering | 100% | — |
| Holy Communion Offering | 100% | — |

### Additional levies and fixed quotas

Percentage levies: CRM add-on (25% of CRM), Coastline Worship Centre (1% of ministers'
tithe), Insurance Fund on general tithe (1.25%) and on ministers' tithe (1.25%).

Six fixed monthly quotas, prorated across the Sundays in a remittance period and
individually markable as not due for a given period: Convention Volunteer, CSR Support
(Zonal HQ), RCCG Camp Clearing, RMF, Run Edu Fund (Zonal HQ) and Zonal Mummy Stipend —
plus any further quota the IT Admin adds.

Payment is split into **Part A — RCCG Authorities** and **Part B — Thanksgiving, Pastoral
& Local Distribution**, each separately payable, partially payable, and trackable.

Any collection type added later by an administrator carries its own national/local split
and never attracts the province rebate, which is tithe-only by rule.

---

## Roles and permissions

### Finance portal

| Role | Access |
|---|---|
| **IT Administrator** | Full system access including admin panel, user management and every financial module |
| **Parish Pastor** | Full view, report sign-off, remittance cut-off editing, final approvals |
| **Church Accountant** | Record income, calculate and submit remittances, manage the ledger, approve petty cash, generate reports |
| **Admin Officer** | Log expenses, submit petty cash requests, view income and petty cash |
| **Bank Signatory** | View income and remittances, approve petty cash, authorise bank transactions |
| **Read-Only Viewer** | View-only access across dashboard, transactions, income, remittances, expenses and petty cash |

### KPSC portal

| Role | Access |
|---|---|
| **Acting Chairman** | Full committee access including finance, settings and governance |
| **General Secretary** | Meetings, minutes, agenda, action items, partners, members, settings |
| **Financial Secretary** | Committee finance ledger, partners, payments, reminders |
| **Treasurer** | Committee finance ledger, cash handovers, partner payments |
| **Committee Viewer** | Read-only committee access |
| **IT Administrator** | Account management and system configuration |

Both portals ship with sensible role defaults **and** a permission editor, so the parish can
re-cut who sees what without a developer. Permission checks are enforced on the server, not
only in the UI.

---

## Architecture

```
Browser (PWA, vanilla JS, no framework)
   │
   ├── /            Finance portal SPA        → src/js/app.js
   ├── /kpsc/       Committee portal SPA      → src/js/kpsc.js
   ├── /partnership/ Public landing + progress
   └── service workers, offline shell, install prompts, update banner
   │
   ▼
Cloudflare Pages Functions  →  functions/api/[[route]].js
   │   single edge worker, ~92 route families, server-side permission checks
   │
   ├── Cloudflare D1 (SQLite)     — 40 tables, production and preview databases
   ├── Cloudflare R2              — meeting audio chunks
   ├── OpenAI                     — realtime transcription, OCR, drafting
   ├── DeepSeek                   — classification, extraction, minutes (primary, with OpenAI fallback)
   ├── Deepgram                   — speaker diarization
   ├── Voice fingerprint service  — FastAPI + SpeechBrain ECAPA-TDNN on Google Cloud Run
   ├── Termii                     — SMS delivery and status webhooks
   └── Make.com                   — bank alert email ingestion
   │
   ▼
GitHub Actions
   ├── CI — full test suite with coverage on every push and pull request
   └── Cron — polls nine internal job endpoints every 30 minutes
```

Design decisions worth calling out:

- **No framework.** The entire front end is vanilla JavaScript and CSS. It loads fast on a
  mid-range Android phone over Nigerian mobile data, which is what the users actually have.
- **One edge worker.** A single Pages Function handles all API routes, so there is no
  cold-start fan-out and no service mesh to operate.
- **Idempotent, self-healing scheduled jobs.** GitHub's cron is throttled and unreliable, so
  every job decides for itself whether it is due, records its own run, and catches up on a
  later tick. A `run-all` endpoint exists so an external scheduler that knows about only
  some jobs cannot silently skip the rest — a failure mode that had already cost two months
  of payment reminders before it was designed out.
- **Schema migrations that survive a live database.** `/api/init` is safe to run repeatedly:
  it creates missing tables and applies additive column migrations, catching and ignoring
  duplicates, so the production database is never dropped or rebuilt.
- **AI is advisory, never authoritative.** Every model output is sanitised, validated and
  backed by deterministic fallback, and governance checks are re-applied after the model runs.

---

## Automation and AI

| Automation | What it replaces |
|---|---|
| **Remittance calculation** | Hand-computing a dozen percentage lines, levies and prorated quotas every month |
| **AI deposit verification** | Manually checking that a cash-deposit photo matches the amount banked; a failed verification never auto-approves |
| **Receipt OCR** | Typing expense receipts in by hand |
| **Bank charge email ingestion** | Manually finding and logging every maintenance fee, VAT, stamp duty and SMS alert charge |
| **Bank balance snapshots** | Reading the balance off alert emails for reconciliation |
| **Meeting transcription + diarization** | A secretary trying to write minutes while participating |
| **Minutes, resolutions and action extraction** | Hours of post-meeting write-up |
| **Handwritten note OCR** | Re-typing the secretary's paper notes |
| **Statement parsing and reconciliation** | Line-by-line matching of a bank statement to the ledger |
| **Happy New Month / reminder / anniversary / pre-meeting / deadline SMS** | Someone remembering to message eighteen partners and twelve committee members, on time, every month |
| **Follow-up nudge drafts and pre-meeting briefs** | Chasing action items by memory |

Nine scheduled jobs run on a thirty-minute poll: monthly SMS, payment reminders,
anniversaries, pre-meeting notices, action-item deadlines, scheduled blasts, next-month
draft fallback, follow-up nudges and pre-meeting briefs.

---

## Data model

Forty tables in Cloudflare D1. The main groups:

- **Finance** — `income`, `expenses`, `remittances`, `petty_cash`, `petty_config`,
  `cash_transactions`, `satellite_funds`, `bank_balance_snapshots`, `statements`,
  `shared_reports`
- **Committee** — `kpsc_accounts`, `kpsc_sessions`, `kpsc_members`, `kpsc_finance_entries`,
  `kpsc_cash_handovers`, `kpsc_projects`, `kpsc_action_items`, `kpsc_reconciliation_runs`
- **Meetings and governance** — `ai_secretary_meetings`, `kpsc_agenda_notes`,
  `kpsc_agenda_templates`, `kpsc_whatsapp_drafts`, `kpsc_followups`,
  `kpsc_policy_versions`, `kpsc_byelaw_amendment_log`
- **Partnership** — `kpsc_partners`, `kpsc_partner_payments`, `kpsc_partnership_pledges`,
  `kpsc_partnership_feedback`, `kpsc_finance_report_tokens`
- **Messaging** — `kpsc_reminders` (the SMS log), `kpsc_sms_templates`,
  `kpsc_scheduled_sms`, `kpsc_cron_runs`
- **System** — `users`, `settings`, `audit_log`, `notifications`, `email_ingest_log`,
  `church_bank_ingest_log`

Custodial satellite money lives in its own table precisely so it can never be summed into
parish income or expense by accident.

---

## Engineering practice

- **481 automated tests** across 25 suites, run with the Node built-in test runner on every
  push and pull request, with coverage.
- Tests target the parts where a mistake costs money: remittance maths, quota proration and
  period overrides, children's-department share, cash-flow links, satellite pool balances,
  petty cash top-up targets, partner payment logic, progress statistics, SMS page counting
  and scheduling, cron catch-up, access rules, custom income types and their recovery on an
  un-migrated database, and build-output determinism.
- **Production and preview databases are separate.** `main` deploys against the live
  parish database; every other branch deploys against a development database, so a preview
  build can never touch real money.
- **Pull-request driven.** 290 pull requests, 264 merged, with code review — human, Copilot
  and Claude — on the way in.
- **Deterministic build.** `npm run build` minifies with pinned tool versions and a test
  re-minifies and compares, so the committed `dist/` can never silently drift from source.
- **Failure post-mortems written into the code.** The cron workflow, the income-merge
  logic and the satellite fund table all carry comments explaining the incident that
  produced the current design — including the ~2,000 consecutive green scheduler runs that
  were doing nothing at all.

---

## Project scale

| | |
|---|---|
| Development period | April 2026 – present |
| Commits | ~700 |
| Pull requests | 290 (264 merged) |
| Tracked lines | ~69,000 |
| API route families | 92 |
| Database tables | 40 |
| Automated tests | 481 |
| Applications | 2 PWAs + 1 public site |
| Roles modelled | 12 across two portals |
| Scheduled jobs | 9 |
| External services integrated | 7 |

---

## Running it locally

```bash
npm ci          # install pinned dev dependencies
npm test        # run the full suite
npm run build   # re-minify src/ into dist/
```

Deployment is Cloudflare Pages against this repository. `wrangler.toml` binds the
production D1 database for `main` and a separate preview database for every other branch.

Required environment variables in Cloudflare Pages for the full feature set:

| Variable | Used for |
|---|---|
| `CRON_SECRET` | Authorises the internal scheduled-job endpoints (must match the GitHub repository secret) |
| `OPENAI_API_KEY` | Realtime transcription session tokens, OCR, drafting |
| `EMAIL_INGEST_SECRET` | Authorises bank-alert email ingestion |
| `VOICE_FP_TOKEN` | Bearer token for the voice fingerprint service |

DeepSeek, Deepgram and Termii credentials are configured in-app under KPSC → Settings.
The system degrades gracefully: with no AI keys configured, meeting processing falls back
to deterministic extraction and the governance checks still run.

---

## Repository layout

```
rccg-kingdom-parish-app/
├── index.html                     # Finance portal shell: homepage, login, app chrome
├── statement.html                 # Monthly financial statement (print + share)
├── report.html                    # RCCG remittance report (print + share)
├── manifest.json  sw.js           # PWA manifest and service worker
├── _headers  _redirects           # Cloudflare Pages caching and SPA routing
├── wrangler.toml                  # Pages + D1 bindings (production / preview)
├── src/
│   ├── css/                       # styles.css (finance), kpsc.css (committee)
│   └── js/
│       ├── app.js                 # Finance portal SPA
│       ├── kpsc.js                # Committee portal SPA
│       ├── remittance.js          # RCCG remittance calculation module
│       ├── partner-payment-utils.js  partner-progress-stats.js
│       ├── committee-sms-utils.js    receipt-ocr-utils.js
│       ├── voice-attendance.js       voice-fp-utils.js
│       └── kpsc-public-minutes.js
├── dist/                          # Minified assets actually served (committed)
├── functions/
│   ├── api/[[route]].js           # The entire REST API (edge worker)
│   ├── partnership/index.js       # Public partnership page renderer
│   └── report.html.js             # Shared report renderer with rich previews
├── kpsc/                          # Committee PWA shell, byelaw, welfare policy, minutes
├── partnership/                   # Public landing page and progress report
├── services/voice-fp/             # FastAPI + SpeechBrain ECAPA speaker embedding service
├── tests/                         # 25 suites, 481 tests
├── scripts/                       # Build and icon generation
├── docs/                          # Automation guides, specs, screenshots
└── .github/workflows/             # CI and the scheduled-job cron
```

---

## Authorship and method

The business requirements, operating model, financial rules, risk and governance policy,
data model and product design are original work. The problem definition came from the
parish itself, and the decisions that shape this system — how cash custody should be
proven, which money is custodial and must never be counted as income, what the software
must refuse to let a user do, where an AI model is allowed to have an opinion and where it
is not — were made by a person, not a model.

Implementation was carried out with AI pair-programming assistance: **Claude Code**,
**GitHub Copilot** and **OpenAI Codex**, each contributing commits and reviews that are
visible in the history. Every change was reviewed and integrated by the author across
**290 pull requests (264 merged)**, gated by a **481-test regression suite** that encodes
the financial rules, with production and preview environments backed by separate databases.

The tooling is stated plainly because it is part of how the work was done and because the
history shows it either way. What it does not change: a model can write a function, but it
cannot decide that the province rebate applies to already-split tithes, that a failed
deposit verification must never auto-approve, or that funds held for three satellite
parishes belong in their own table. Those are the decisions this project is actually made of.

---

## Licence and data

Private project, built for and operated by RCCG Kingdom Parish, Aguleri. No real member,
partner, financial or bank data is committed to this repository; all figures in the
screenshots above are synthetic demonstration data generated for documentation.
