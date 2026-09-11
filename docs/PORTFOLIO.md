# Portfolio & CV Evidence Pack

**Project:** RCCG Kingdom Parish, Aguleri — Church Finance, Governance & Partnership Platform
**Period:** April 2026 – present
**Role:** Sole analyst, product owner, solution designer and delivery lead

This document turns the project into CV-ready material. Everything here follows one rule:

> **A duty describes what you were assigned to do. A result describes what changed because
> you did it.** Strong verb + what you did + scale/context + measurable outcome.

---

## How to use this document

Bullets are tagged:

- ✅ **Verified** — the number comes straight out of this repository and can be defended in an
  interview by opening the repo. Use as written.
- ⚠️ **Confirm first** — the shape of the claim is right but the number is a placeholder in
  `[square brackets]`. Fill it in from your own records before you use it. **Do not send a CV
  with a bracket still in it.**

Honest-math reminders that apply to every bullet below:

- Use `~` for estimates — "saving ~₦85K/month" reads as credible, not fabricated.
- Give percentages a baseline where you can — "cut X by 30% (from 10 days to 7)".
- Where you genuinely don't know, quantify the **input** instead: "analysed 5 months of
  collection data across 14 Sunday cycles". Scale of effort is a legitimate substitute.
- Never claim sole credit for a team outcome. Here you largely *were* the team — say
  "sole analyst" rather than "led a team", which is both true and more impressive.

---

## 1. The headline (CV project entry)

Pick the version that matches the job you are applying for.

**Business analyst framing**

> **Business Analyst / Product Owner (self-directed project)** — RCCG Kingdom Parish, Aguleri · Apr 2026 – Present
> Sole analyst and product owner for a three-application platform that replaced the parish's
> manual finance, governance and fundraising processes. Elicited and validated requirements
> across 6 finance roles and a 12-member governance committee, redesigned 5 core business
> processes end to end, and delivered 264 changes to production against a 481-test regression
> suite, replacing a hand-calculated denominational remittance with a reproducible,
> itemised and auditable one.

**Operations / finance framing**

> **Operations & Finance Analyst (self-directed project)** — RCCG Kingdom Parish, Aguleri · Apr 2026 – Present
> Designed and delivered the accounting, remittance and cash-control system for a parish
> handling monthly collections across 11 income categories, 15 expense categories, a petty
> cash imprest, a bank account and a custodial fund held for 3 satellite parishes.
> Automated a 26-line denominational remittance calculation that was previously done by hand.

**Product / delivery framing**

> **Product Owner & Delivery Lead (self-directed project)** — RCCG Kingdom Parish, Aguleri · Apr 2026 – Present
> Owned discovery through delivery for 3 products on a shared platform — an internal finance
> portal, a mobile governance PWA and a public fundraising site — shipping 290 pull requests
> across 5 months with CI-gated releases and separated production/preview data environments.

---

## 2. Business Analyst

✅ **Verified**

- Elicited, documented and validated requirements for a 3-application platform serving
  **12 distinct user roles** across two separate access domains (a 6-role parish finance
  team and a 6-role governance committee), producing a role-permission model with **20
  discrete permission keys** enforced at the API layer, not just in the UI.
- Translated an undocumented denominational remittance policy into an executable rule set:
  **10 percentage-split collection types, 5 thanksgiving distribution lines, 4 additional
  levies and 6 prorated fixed quotas**, plus a province rebate calculated on an
  already-split figure — the single largest source of pre-project calculation error.
- Specified a **configuration-over-code** requirement after analysing the denomination's
  history of introducing new collection types mid-year: administrators now add a new
  collection type with its own national/local split from the admin panel, and it
  propagates automatically to the income form, summaries, remittance calculation, remittance
  report and monthly statements — removing developer involvement from a recurring change request.
- Wrote the acceptance criteria that became **481 automated regression tests across 25
  suites**, deliberately concentrated on the money-critical rules (remittance maths, quota
  proration, children's-department share, cash-flow links, custodial fund balances).
- Ran requirements through **290 pull requests (264 merged)** with written change
  rationale, giving a complete traceable history from stated need to deployed change.

⚠️ **Confirm first**

- Gathered and prioritised requirements from **[N]** stakeholders across **[N]** functions
  (Parish Pastor, accountant, admin officer, bank signatories, committee officers),
  reducing rework by **[N]%** measured as the share of changes reverted after release.
- Reduced month-end reporting effort from **[N hours]** to **[N minutes]** by replacing
  manual statement preparation with a generated, sign-off-tracked monthly statement.

---

## 3. Systems Analyst

✅ **Verified**

- Designed the system architecture end to end: a browser PWA front end, a **single edge
  worker exposing 92 API route families**, a **40-table relational schema**, object storage
  for meeting audio, and **7 integrated external services** (OpenAI, DeepSeek, Deepgram, a
  self-hosted speaker-embedding service, Termii SMS, Make.com email ingestion, GitHub Actions).
- Specified a **zero-downtime schema migration strategy** — an idempotent initialisation
  endpoint that creates missing tables and applies additive column migrations against the
  live database, so the parish's production data has never been dropped or rebuilt through
  **~700 commits** of schema evolution.
- Isolated custodial money (funds received from and remitted on behalf of 3 satellite
  parishes) into **its own table and its own reconciliation path**, after analysis showed it
  would otherwise be summed into parish income and inflate both reported income and the
  remittance owed to headquarters.
- Root-caused a silent scheduler failure in which a workflow reported success on
  **~2,000 consecutive runs while performing no work** — every step swallowed its own error
  and a missing configuration variable turned each call into a no-op. Redesigned it with a
  preflight configuration check, per-endpoint time ceilings, hard failure on any
  non-200 response, and self-catching-up idempotent jobs.
- Specified **AI-as-advisory** as an architectural constraint: model output is sanitised,
  validated against a schema, backed by deterministic fallback extraction, and mandatory
  governance checks are re-applied *after* the model runs, so no model response — or
  prompt injection inside a meeting transcript — can suppress a compliance flag.

⚠️ **Confirm first**

- Integrated **[N]** legacy/manual processes into one system of record, eliminating
  **[N]** parallel spreadsheets and notebooks.

---

## 4. Product Manager / Product Owner

✅ **Verified**

- Owned three products on one platform with distinct audiences and success measures: an
  **internal finance portal** (accuracy and control), a **mobile-first governance PWA**
  (adoption by volunteer committee members), and a **public fundraising site**
  (conversion of pledges).
- Maintained a continuously prioritised delivery flow of **290 pull requests over 5 months
  (~58/month)**, sequenced so that money-critical capability (income, remittance, cash
  control) shipped before convenience capability (analytics, messaging, AI assistance).
- Made the platform-choice call that defined the product's reach: **no front-end framework**,
  vanilla JavaScript and CSS served from an edge CDN, because the real users are volunteers
  on mid-range Android phones and Nigerian mobile data — trading developer convenience for
  load time on the devices that actually exist.
- Shipped both internal applications as **installable PWAs** with offline shells, install
  prompts and an in-app update banner, removing app-store distribution from the adoption path.
- Introduced **role-configurable permissions** so the parish can re-cut access without a
  release, converting a recurring support request into self-service.

⚠️ **Confirm first**

- Grew active adoption to **[N]** weekly users across **[N]** roles within **[N]** weeks of
  launch, with **[N]%** of Sunday collections recorded in-system on the day.
- Reduced time-to-record a Sunday collection from **[N minutes]** to **[N minutes]**.

---

## 5. Process Improvement / Business Process Analyst

✅ **Verified**

- Redesigned the **cash custody chain** end to end. Money now has a named owner at every
  step — usher → accountant → bank → petty cash holder — with deposit confirmation, teller
  reference, ageing of undeposited cash, and a "cash with accountant" figure visible on the
  dashboard. Before, cash position was reconstructed from memory and receipts.
- Rebuilt the **petty cash imprest process** into a four-stage controlled workflow
  (request → accountant verification → signatory approval → settlement with change
  returned), with float maximum, top-up-to-target, petty-cash-to-bank deposit and a
  sustainability indicator that states whether the float can be refilled next period.
- Designed the **remittance payment process** as a two-part split (Part A: RCCG
  authorities; Part B: thanksgiving, pastoral and local distribution) after analysis showed
  the two halves are approved, funded and paid by different parties on different dates —
  each is now separately payable, partially payable and independently tracked.
- Removed a duplicate-record failure mode by designing **same-day collection merge**: a
  Sunday collection counted in two sittings (e.g. the Holy Communion offering counted later)
  folds into the existing record rather than creating a second one that would split
  cash-with-accountant, deposit tracking and remittance figures across two rows.
- Eliminated manual data entry for bank charges by designing an **email-to-ledger
  automation**: bank alert emails are classified and field-extracted by AI and posted
  directly to the Bank Charges ledger, with every alert's available balance captured for
  reconciliation even when it isn't a charge.
- Introduced **rate and quota snapshotting** so that editing a percentage today cannot
  retroactively change what a remittance paid six months ago was calculated from — closing
  an audit exposure that manual records had no defence against.

⚠️ **Confirm first**

- Cut monthly remittance preparation from **[N hours]** of manual calculation to
  **[under N minutes]**, removing **[N]** recalculation/dispute cycles per year.
- Reduced expense-logging effort by **~[N]%** through receipt OCR and quick-log chips for
  the **[N]** most frequent subcategories.
- Eliminated **~[N] hours/month** of manual reconciliation, worth **~₦[N] annually** at
  volunteer replacement cost.

---

## 6. Operations Analyst

✅ **Verified**

- Built the operational control surface the parish runs on: a dashboard that resolves
  **total church balance into its four real locations** (bank, cash with accountant, petty
  cash, custodial satellite funds) and states available funds *after* every known
  obligation, with a health indicator rather than a raw number.
- Designed **9 scheduled operational jobs** (monthly messaging, payment reminders,
  anniversaries, pre-meeting notices, action-item deadlines, scheduled blasts, draft
  fallback, follow-up nudges, pre-meeting briefs) as **idempotent, self-scheduling and
  self-catching-up**, because the underlying scheduler is throttled and unreliable — each
  job decides for itself whether it is due and recovers missed windows on a later tick.
- Instrumented the operation: a **cron run log** records every job invocation with
  send-day status, window status, and sent/failed/skipped counts, so an operator can see
  whether an automation actually fired rather than assuming it did.
- Built **SMS delivery assurance** — delivery-status webhook reconciliation, retry, a
  backfill for historically stuck statuses, wallet-balance monitoring with low-balance
  warnings, and per-month delivery analytics (sent / delivered / DND / failed).
- Designed **exception-first operational screens**: overdue action items surface as a badge
  on the tab, partners behind on payments are grouped by months-behind, and the petty cash
  page leads with pending approvals.

⚠️ **Confirm first**

- Maintained **[N]%** SMS delivery rate across **[N]** messages/month to **[N]** partners
  and **12** committee members.
- Reduced missed partnership payments by **[N]%** (from **[N]** to **[N]** per month) after
  introducing scheduled reminders on a fixed monthly date.

---

## 7. Financial Analyst

✅ **Verified**

- Implemented the parish's full income-split model: **11 built-in collection types**, each
  with its own national/local ratio, plus admin-definable types, rolled up into a live view
  of what goes to headquarters, what the parish retains, and what is ring-fenced for the
  children's department.
- Implemented the **province rebate** correctly as 20% of the *already-split local retained*
  tithes — a second-order calculation on a first-order split, and the line most often got
  wrong by hand.
- Built **prorated fixed-quota logic**: monthly quotas apportioned across the Sundays that
  actually fall inside a remittance period, with a per-period "not due" override for months
  a quota is waived.
- Built a **forecasting model** for monthly income and retained share using a multi-month
  blended retention rate and a standard-deviation-derived worst/likely/best spread, working
  from the first month of data rather than requiring a year of history.
- Produced the **monthly financial statement** as a generated artefact — opening and closing
  balances, income and expense detail, Pastor sign-off workflow, A4 print layout, direct PDF
  download and a shareable read-only link.
- Built **bank reconciliation** tying ledger movements to bank balance, including
  balance snapshots captured automatically from bank alerts, and a prior-period
  reconciliation path for writing off remittance shortfalls with an audit trail.
- Separated **custodial from proprietary funds** so money held for 3 satellite parishes is
  reflected in the bank balance but excluded from every income, expense and remittance total.

⚠️ **Confirm first**

- Analysed **[N]** months of collection data covering **~₦[N]m** of parish income across
  **[N]** Sunday cycles to build the retention and forecast model.
- Identified and recovered **₦[N]** in under-remitted/over-remitted amounts during
  reconciliation of historical periods.
- Improved remittance accuracy from **[N]%** to **100%** against headquarters' own figures
  across **[N]** consecutive months.

---

## 8. Data Analyst / BI

✅ **Verified**

- Designed the **40-table data model** underpinning every figure in the platform, including
  the deliberate separation of custodial funds, the JSON-map storage pattern that lets a new
  collection type be added without a schema change, and soft-delete on records that
  financial history depends on.
- Built the **Partner Progress analytics** view: expected monthly income by partnership
  type, pledge-tier distribution with share-of-expected-income, payment-health banding
  (up to date / 1 month behind / 2 months / 3+), per-partner 12-month payment grids, and
  outstanding balance — with partners who have not yet started correctly excluded from a
  month's expected income.
- Built **dashboard analytics**: income/expense trend, expense breakdown with drill-through
  from a chart segment into the filtered transaction ledger, weekly net-retained analysis
  with outlier trimming over a rolling 14-week window, and the forecast spread above.
- Built **SMS analytics** with cost modelling — GSM-7 page counting per message, live
  cost estimation before send, and monthly delivery-outcome breakdown.
- Made every headline figure **traceable to source**: dashboard cards expand into their
  components and drill into the underlying transactions, so no number on screen is unexplainable.

⚠️ **Confirm first**

- Analysed **[N]** partner payment records to identify the **[N]%** of partners generating
  **[N]%** of recurring income, redirecting follow-up effort accordingly.
- Segmented **[N]** partners by pledge tier and location (home vs diaspora), informing the
  pledge tiers offered on the public page.

---

## 9. Market / Growth Analyst

✅ **Verified**

- Designed the **public fundraising proposition** end to end: a landing page built around a
  clear three-step commitment flow (decide amount → pay → get card signed) that mirrors the
  existing physical partnership card, so the digital journey reinforces rather than replaces
  an artefact members already trust.
- Structured **pledge tiers** as three anchored options plus a custom amount, with the
  middle tier visually preferred — a standard choice-architecture pattern applied to a
  giving context.
- Built **trust and transparency into the conversion path**, because the barrier to
  recurring giving here is credibility, not intent: live impact figures from the committee
  ledger, the project pipeline with funding progress, a named 12-steward governance
  statement, dedicated account details, and published byelaw and welfare policies.
- Designed **consent-first social proof**: a partners wall showing names and locations only
  where the partner explicitly opted in (unchecked by default), with anonymous partners
  counted but not named, and pledge amounts never displayed.
- Designed a **lapsed-partner re-engagement section** ("Still with us?") addressing the
  specific emotional barrier to returning after a missed commitment, rather than a generic
  donate prompt.
- Removed friction at the point of conversion by handing the completed pledge off to
  **WhatsApp**, the channel the congregation already uses, instead of requiring an account.
- Built the **retention analytics** that make the programme manageable: payment health,
  months behind, and automated reminder, welcome, thank-you, anniversary and Happy New
  Month messaging.

⚠️ **Confirm first**

- Grew the partner base from **[N]** to **[N]** partners across **[N]** locations including
  **[N]** diaspora countries, raising **₦[N]** year to date.
- Lifted recurring-payment compliance from **[N]%** to **[N]%** within **[N]** months of
  introducing automated reminders.
- Converted **[N]** public pledge submissions, of which **[N]%** became paying partners.

---

## 10. Project & Delivery Management

✅ **Verified**

- Delivered continuously for **5 months** to a live production system with real money in it,
  releasing **264 merged changes** without a data-loss incident.
- Ran a **branch-per-change workflow with CI gating** — the full test suite and coverage run
  on every push and every pull request, and **production and preview environments are backed
  by separate databases**, so no preview deployment can reach live parish data.
- Managed a **code review loop with three reviewers** (human, GitHub Copilot and Claude),
  incorporating review findings as first-class work rather than optional cleanup.
- Sequenced delivery around the parish's real calendar — remittance cut-offs, monthly
  statement sign-off, meeting dates — rather than around technical convenience.

⚠️ **Confirm first**

- Delivered **[N]** releases with **[N]** production incidents, mean time to restore
  **[N minutes]**.

---

## 11. Governance, Risk & Compliance

✅ **Verified**

- Encoded the committee's **byelaw** into enforced controls: quorum checks by constituency
  (men / women / youth / ministers / pastor), major-project spend thresholds that flag for
  full ratification, welfare and privacy language checks, and unfinished-meeting and
  missing-transcript flags.
- Built **versioned policy management** — byelaw and welfare policy documents with version
  numbers, approver, effective date, a preview/proofread/apply amendment workflow, and a
  full amendment log tying every change back to the meeting that resolved it.
- Designed the system so **AI cannot weaken governance**: mandatory policy checks are
  re-applied after model processing, and transcript **prompt-injection attempts are detected
  and flagged** rather than obeyed.
- Implemented **segregation of duties** in the finance workflows — the person who requests
  petty cash cannot approve it, the accountant who submits a remittance is not the signatory
  who authorises it, and the Pastor signs off the monthly statement.
- Built a **timestamped audit log** with the acting user on every recorded action, and
  **soft-delete** on records financial history depends on, so nothing that affects a past
  figure can be silently erased.
- Applied **data-protection-by-default** on the public site: public listing of a partner's
  name is opt-in and unchecked by default, pledge amounts are never published, and anonymous
  partners are counted without being named.
- Failed AI verification of a cash deposit **never auto-approves** — a deliberate fail-closed
  control on the one path where a model error would move money.

---

## 12. Vendor, Cost & Capacity Management

✅ **Verified**

- Selected and integrated **7 external services** against explicit criteria, including a
  documented **provider migration**: replaced a retired commercial speaker-recognition
  service by deploying a self-hosted ECAPA-TDNN embedding service, sizing it at a warm
  instance to eliminate a ~10-second cold-start mid-meeting for a documented **~$15/month**
  baseline.
- Designed **provider failover** rather than provider lock-in: a primary AI provider with
  automatic fallback to a second on failure, and graceful degradation to deterministic
  processing when no provider is configured at all.
- Built **consumption cost control into the product**: SMS page counting with live cost
  estimation before send, one-click emoji→GSM-7 conversion (an emoji forces a message onto a
  more expensive encoding and can double its cost), quiet-hours send windows, and wallet
  balance monitoring with low-balance warnings.
- Kept the platform on **free/near-free infrastructure tiers** — edge hosting, serverless
  functions, managed SQLite and CI all on free plans — so ongoing cost is essentially only
  the AI and SMS the parish actually consumes.

⚠️ **Confirm first**

- Held total running cost to **~$[N]/month** against a commercial church-management
  alternative quoted at **$[N]/month**, a **[N]%** saving.

---

## 13. Quality Assurance & Test Analysis

✅ **Verified**

- Built and maintain a **481-test regression suite across 25 files**, run with coverage on
  every push and pull request.
- Applied **risk-based test design**: coverage is concentrated where a defect costs money or
  credibility — remittance calculation, quota proration and period overrides,
  children's-department share, cash-flow links, custodial pool balances, petty cash top-up
  targets, partner payment logic, progress statistics, SMS page counting and scheduling,
  cron catch-up behaviour, access rules, and custom income types **including their recovery
  on a database that has not yet run the migration**.
- Wrote **regression tests from production incidents** — the scheduler failure, the
  silent AI redraft failure, and pool payouts made from petty cash each have tests that
  would now catch them.
- Added a **build-determinism test** that re-minifies source and compares against the
  committed bundle, so deployed assets can never silently drift from source.

---

## 14. Change Management, Training & Communication

✅ **Verified**

- Designed the product for **non-technical volunteer users**: plain-English labels
  throughout, inline info tips, an expandable "How is this calculated?" explainer on the
  balance figures, a homepage team guide with an expandable FAQ, and mobile tap-to-detail
  views instead of dense desktop tables.
- Wrote **operational runbooks** for the automations — bank-charge email ingestion for both
  the parish and committee accounts, and the voice-service deployment — at a level a
  non-developer administrator can follow, including setup time and cost.
- Built **self-service administration** so the parish is not dependent on a developer:
  user and role management, permission editing, rate and quota configuration, collection-type
  management, float override, and backup/restore.
- Made the system **explain itself under failure**: error states name the likely cause and
  the person to ask ("ask the IT Administrator to run the database setup"), rather than
  surfacing a stack trace.

⚠️ **Confirm first**

- Trained **[N]** users across **[N]** roles; **[N]%** were recording transactions
  unaided within **[N]** weeks.

---

## 15. Cover letter paragraphs

**For a business analyst role**

> Over the past five months I designed and delivered a three-application platform that
> replaced the manual finance, governance and fundraising processes of a Nigerian church
> parish. The work was analysis-first: I elicited requirements from twelve distinct roles
> across two governance domains, reverse-engineered an undocumented denominational
> remittance policy into an executable rule set of more than twenty calculation lines, and
> turned the acceptance criteria into a 481-test regression suite that gates every release.
> The outcome is a system where every figure on screen traces back to a recorded
> transaction, and where a month-end calculation that used to be done by hand — and disputed
> — is now produced in seconds with a full audit trail.

**For an operations / process improvement role**

> I am drawn to work where the problem is a broken process rather than a missing feature.
> In my most recent project I mapped and rebuilt five core processes for a church parish:
> the cash custody chain from usher to bank, a four-stage petty cash imprest with
> segregation of duties, a two-part remittance payment split that matched how the money was
> actually approved and funded, automated ledger capture from bank alert emails, and a
> scheduled engagement programme for recurring donors. I also root-caused an automation that
> had reported success on roughly two thousand consecutive runs while doing nothing at all,
> and redesigned it so that a silent failure is now impossible.

**For a data / financial analyst role**

> My most recent project required me to model a financial domain from scratch: an income
> split across eleven collection categories each with its own headquarters/local ratio, a
> second-order rebate calculated on an already-split figure, fixed levies prorated across
> the Sundays falling inside a non-calendar accounting period, and a custodial fund held on
> behalf of three other entities that had to be visible in the bank balance but excluded
> from every income and remittance total. On top of that model I built forecasting from a
> blended multi-month retention rate with a standard-deviation-derived confidence spread,
> and a donor analytics view covering expected income by tier, payment health banding and
> per-donor twelve-month payment history.

---

## 16. Interview stories (STAR)

**1. The scheduler that was green and doing nothing**
*Situation:* Automated donor reminders and monthly messages stopped reaching recipients.
*Task:* Find out why, when every scheduled run reported success.
*Action:* Traced it to a configuration value that had gone missing, which turned each call
into an empty request — and to error-suppression on every step, which reported those
failures as green. Roughly two thousand consecutive runs had passed while doing nothing;
two months of payment reminders and one monthly send were lost. Redesigned with a preflight
configuration check that fails the job outright, a real default so the target can never be
empty, per-job time ceilings so one hung job cannot starve the rest, hard failure on any
non-success response, and idempotent jobs that catch up on a later run.
*Result:* A broken scheduler now shows as a visible failure within one cycle, and missed
windows self-recover instead of being lost.

**2. The remittance rule nobody had written down**
*Situation:* The parish's monthly payment to its denomination was calculated by hand from
percentages held partly on a sheet and partly in people's heads, and disputes followed.
*Task:* Produce a single defensible calculation.
*Action:* Reconstructed the full rule set — percentage splits per collection type,
thanksgiving distribution across five destinations, four additional levies, seven fixed
quotas prorated across the Sundays in the period, and a rebate calculated on an
already-split figure — then made every rate configurable and snapshotted the rates in force
onto each payment so history could not be rewritten by a later edit.
*Result:* The calculation is reproducible, itemised, printable, and auditable to source.

**3. Money that was not ours**
*Situation:* The parish collects and forwards province contributions on behalf of three
satellite parishes through its own bank account.
*Task:* Reflect that money accurately without distorting the parish's own figures.
*Action:* Analysed the consequence of the naive approach — custodial money would inflate
reported income and therefore inflate the remittance owed on it. Designed a separate
custodial pool with its own table and reconciliation path, mirrored into the bank balance
for accuracy but excluded from every income, expense and remittance total.
*Result:* The bank balance stays correct and the parish never remits a percentage of money
that was never its own.

**4. Making AI safe to trust in a governance setting**
*Situation:* Committee minutes, resolutions and compliance flags were to be produced with
AI assistance.
*Task:* Get the time saving without letting a model decide a governance question.
*Action:* Constrained the model to an advisory role — output sanitised and schema-validated,
deterministic fallback extraction when fields are missing or malformed, and mandatory
governance checks (quorum, spend thresholds, welfare and privacy language) re-applied after
the model runs. Added detection for prompt-injection attempts inside the transcript itself.
*Result:* A model response — or a participant trying to manipulate one — cannot suppress a
compliance flag.

**5. Designing for the phone people actually own**
*Situation:* The governance committee are volunteers using mid-range Android phones on
mobile data.
*Task:* Achieve adoption without an app store or a training budget.
*Action:* Chose no front-end framework and served everything from an edge CDN, shipped both
internal apps as installable PWAs with offline shells and in-app update prompts, made the
committee portal mobile-first with bottom-tab navigation, and wrote every label in plain
English with inline explainers.
*Result:* Install is a link, updates are automatic, and the interface assumes no financial
or technical training.

---

## 17. Metrics bank

Facts you can state without qualification, drawn from this repository:

| Metric | Value |
|---|---|
| Development period | Apr 2026 – present (5+ months, continuous) |
| Commits | ~700 |
| Pull requests | 290 raised, 264 merged |
| Tracked lines of code | ~69,000 |
| Applications delivered | 3 (2 internal PWAs + 1 public site) |
| User roles modelled | 12 across 2 access domains |
| Permission keys | 20, enforced server-side |
| API route families | 92 |
| Database tables | 40 |
| Automated tests | 481 across 25 suites |
| Scheduled automation jobs | 9 |
| External services integrated | 7 |
| Income categories modelled | 11 built-in + admin-definable |
| Expense categories | 15 |
| Remittance calculation lines | 26 (10 percentage splits, 5 thanksgiving lines, 4 levies, 6 quotas, 1 rebate) |
| Committee size governed | 12 (3 men, 3 women, 3 youth, 2 ministers, 1 pastor) |
| Satellite parishes handled as custodian | 3 |
| Reviewers in the change process | 3 (human + 2 automated) |

Numbers to source from your own records before use: partner counts, naira amounts raised or
saved, hours saved per process, adoption and delivery rates, incident counts, welfare cases
supported, and anything about periods before the system existed.

---

## 18. Skills evidenced

**Analysis:** requirements elicitation and validation · business process mapping and
redesign · gap analysis · rules engineering from undocumented policy · data modelling ·
acceptance criteria authoring · root cause analysis · cost modelling · forecasting ·
segmentation and cohort analysis

**Product & delivery:** product ownership across three audiences · backlog prioritisation ·
release sequencing against a business calendar · PWA and mobile-first product strategy ·
configuration-over-code design · stakeholder communication for non-technical users

**Finance & controls:** multi-category income allocation · levy and quota proration ·
custodial vs proprietary fund separation · bank reconciliation · imprest/petty cash control ·
segregation of duties · audit trail design · month-end statement production and sign-off

**Governance & risk:** policy versioning and amendment workflow · quorum and threshold
enforcement · fail-closed control design · AI safety constraints and prompt-injection
handling · consent-based data publication

**Technical:** JavaScript · SQL / SQLite · Python (FastAPI) · Cloudflare Pages, Functions,
D1 and R2 · Google Cloud Run · REST API design · serverless and edge architecture ·
PWA and service workers · Git and GitHub · CI/CD with GitHub Actions · automated testing ·
LLM and speech API integration (OpenAI, DeepSeek, Deepgram) · speaker embedding models ·
SMS gateway integration · email-to-API automation

---

## 19. Before you send it

1. Replace every `[bracket]` with a real number, or delete the bullet.
2. Keep roughly **70% of bullets carrying a metric or scale** and 30% carrying weight
   through the verb and complexity — do not force a number onto every line.
3. Pick **6–8 bullets** for the CV entry, matched to the job advert's language. Keep the
   rest for the cover letter and interview.
4. Lead each CV bullet with the strongest verb available: *designed, rebuilt, root-caused,
   eliminated, encoded, automated, reduced, recovered* — not *responsible for* or
   *involved in*.
5. Link the repository and this document. A hiring manager who opens it can verify every
   ✅ number in about two minutes, and that verifiability is itself the strongest signal
   on the page.
</content>
