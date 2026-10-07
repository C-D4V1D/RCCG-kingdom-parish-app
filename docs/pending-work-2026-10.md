# Pending work, agreed with the owner on 7 Oct 2026

Plain-English list of everything agreed and not yet finished, so no session has to rely on memory.
No real figures, names with contact details, addresses or keys belong here (this repo is public).

## Status at a glance

| Item | State |
|---|---|
| WhatsApp wording, Saturday week, Nigerian time, dry runs (clerk-box PR 1) | Done and live on the box |
| WhatsApp retry of failed sends, outbox (clerk-box PR 2) | Merged 7 Oct |
| Box update check blocked by "dirty tree" | Fixed on the box (see "Box operations") |
| Monthly attendance report wording (app PR 397, clerk-box PR 3) | Done, merged 7 Oct |
| WhatsApp cash amounts match the app (clerk-box PR 4) | Done, merged 7 Oct. Box subtracts the children's teacher share using the app's rate from settings. The rule now lives in two places |
| WhatsApp small fixes (clerk-box PR 5) and reminder ladder (PR 6) | Done, merged 7 Oct |
| Deposit post shows the app's real total Cash with Accountant | Not started. The app has no endpoint for it, so it needs a new read-only figure from the app |
| Whole box on Nigerian time, remaining smaller items (loose name matching, state growth, rebuild-every-10-min efficiency) | Not started |
| Loans: server, balance maths, dashboard rework, loan screens (app PRs 399, 400, 401) | Done and merged 7 Oct. Needs a real two-login trial by the owner |
| Loans: optional receipt upload with the advisory AI check | Not started |
| Loans: loan lines in the detailed cash ledger views (Cash Pool modal, Sunday cash cycles, Bank page) | Not started. The balance is correct; only those breakdown lists omit cash loan movements |
| Loans: reminders for due dates, per-role notifications | Later, not version 1 |

## 1. Wording: "Monthly report" becomes "Monthly attendance report"

Messages and screens only. Never change the internal text `monthly report not submitted` that
`att-fill.js` produces: `clerkinfo.py` (line 86) matches it.

- App: `src/js/app.js` (the card hint near line 18525, Automations examples near 19905 and 20831). Default: rename the
  app's own card too so people see one name. Rebuild with `npm run build`.
- Box (clerk-box repo): `tools/monthinfo.py` (several lines), `tools/reminders.py:64`, `telegram/tg_msgs.py:231`,
  `rccg-attendance/att_section.py:72`.
- WhatsApp posts already say "Monthly attendance report" (clerk-box PR 1).

## 2. WhatsApp: still to do

Reviewed `tools/kpwa.py` and `tools/kpwa-send.py`. Fixed: deposit post no fixed zero line, collection reminder says
attendance first and the report first on the cut-off Sunday, Saturday week number (week ends on the next Sunday;
spent = last Sunday through that Saturday), PDF only claimed when attached, Nigerian time forced, dry run writes
nothing. In PR 2: outbox and retry, no head-of-line blocking, 240 s send timeout, atomic bank balance file.

Still open:
1. **Cash amounts.** The app's Sunday cash is `total - bank transfer - direct petty cash - children teacher share`.
   `kpwa.py` leaves out the children teacher share, so "Cash:" and "still with" are overstated when there is a
   children's offering. Fix by having the app provide the figure (see 3) and the box reading it, never recomputing.
2. **Deposit post** should show the app's real total Cash with Accountant (today it only says that Sunday's cash
   is deposited). Same app figure as above. If the app cannot be read, leave the line out.
3. **Reminder noise.** "Sunday collection not yet recorded" posts every morning for every missed Sunday. Follow the
   same ladder Telegram uses (weekly, second reminder, cut-off evening, daily after cut-off for the set days).
4. Smaller: the 10-minute safety net rebuilds every post each time (check sent keys first; remove the unused
   `facts(day)` call in `sunday_collection_post`), negative amounts print as `₦-1,000`, `called()` matches names by loose
   substring, the usage text for `stmt-evt` is wrong (it is FROM TO URL PDF), state files grow forever.
5. The box clock is on UK time. WhatsApp scripts force Nigerian time themselves. From 25 Oct UK time drops an hour
   behind Nigeria, so the Telegram runners will be an hour late unless the whole box is set to Nigerian time. Ask the
   owner; it is one command on the box or a small patch.

## 3. Dashboard rework and Loans (design approved)

Mockup (private artifact, owner has the link): "Dashboard Balance Mockup". Exact styles are copied from
`src/js/app.js` (Dashboard flow cards around lines 5110-5220, `renderDashBudgetBreakdown`, `renderPortalBalanceBlock`).

### Total Church Balance = money physically on hand
`Bank + Cash with Accountant + Petty Cash`. Satellite balances are no longer inside this total (today "Owed by
satellites" is added in, which overstates it). No loans row in this card.

### New card between Remittance Due and the Available Fund: "Satellites & Loans"
Joined by a "±" circle. Rows (each only when not zero, except the two loan rows which always show):
- **Owed by satellite pool**: our own money used to top up the satellite pool; the pool owes it back. One short line:
  "Our money used to top up the satellite pool. The pool owes it back." (If we ever hold the pool's money instead:
  label "Held for satellite pool", line "Money in our accounts that belongs to the satellite pool", and it is deducted.)
- **Loans owed to us (N)** and **Loans we owe (N)**, N = number of people, hidden when zero.
- Pending loans show "1 more loan awaiting acknowledgement. Not counted until a second person confirms it."

### Available Fund After All Deductions
`Total on hand - RCCG remittance due + owed by satellite pool + loans owed to us - loans we owe`.
Lending or borrowing only moves money between "in hand" and "owed", so the Available Fund does not change.
"Of the Available Fund" split (money in hand vs owed to us) shows only when something is owed to us.

### Budget block: how money owed to us is absorbed (owner's rule)
In this order: savings (held back) -> known bills saved -> available for new spending -> set aside for budget.
So lending first eats savings and known bills and may not touch new spending. Keep the app's existing shortage
waterfall for any shortfall that exists before anything is owed. Under "Available for new spending" the lines go:
1. "Could rise to ... by <date> if Sundays come in as usual." (first, as today)
2. the money-owed note, e.g. "... owed to us is taken from known bills saved. New spending is not affected."
3. the red warning, only when underfunded.
The "could rise" figure drops only by the part of money owed that spills past savings and known bills.

### Loans feature
- Name: Loans (lent out, borrowed). Fields: person, direction, amount, date, purpose, optional due date, cash or bank,
  optional receipt or photo. Repayments (partial allowed) until settled. No interest. Reminders later, not version 1.
- Who records: it_admin, accountant, admin_officer, pastor. A different person from that list must acknowledge.
  The recorder cannot acknowledge their own entry. Same for repayments.
- Pending (awaiting acknowledgement) loans do not move any balance. Rejected = cancelled with a reason.
- An uploaded bank receipt gets the same AI check as cash deposits (`POST /api/verify-deposit` pattern), shown only
  as a hint to the person acknowledging. A human acknowledgement is always required.
- Money moves like satellite funds (`satellite_funds`): create cash or bank entries so Bank Balance and Cash with
  Accountant stay right and bank reconciliation still matches. Loan money is never income: it must not reach
  remittance, statements or the WhatsApp collection posts.
- New tables `loans`, `loan_repayments`, added through the inline migrations array in `functions/api/[[route]].js`.
  New permissions in `ACCESS_RULES`. Notifications need a target-role tag (the bell is shared today).
- Entry point: tap the loan rows on the dashboard card; no new bottom tab. Audit log for every action.
- Tests: loans never change income or remittance; pending loans change nothing; acknowledging moves exactly once;
  Available Fund unchanged by lending; absorption order.

## 4. Box operations (no real addresses or keys here)

- The box pulls the `main` branch of the private clerk-box repo every 5 minutes (user timer `clerk-pull.timer`; the
  description still says 15). Merged changes arrive within minutes. It skips with "dirty tree" if git sees
  modified tracked files.
- Cause found 7 Oct: the repo tracks files the box rewrites constantly (heartbeat, scheduler state, check log,
  sync stamps, month-info caches). Fixed on the box with `git update-index --skip-worktree` on those paths.
  If an update is ever skipped again, ask the owner for the read-only check `git -C /workspace status --short`.
- Do not stop tracking those files in the repo without a plan: a pull would delete them from the box.
- Reaching the box without a terminal is not possible for Claude. The owner uses Oracle Cloud Shell and has the
  key there. Oracle Run Command does not work without an IAM dynamic group policy (not set up).
- Never run retired installers; see `box/INSTALL-ORDER.md`.
