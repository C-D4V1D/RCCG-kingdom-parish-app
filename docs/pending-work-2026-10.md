# Pending work and decisions, kept up to date with the owner (last refreshed 9 Oct 2026)

Plain-English list of what is done, what is open and what was decided, so no session has to rely on memory.
No real figures, names with contact details, addresses or keys belong here (this repo is public).

## Status at a glance

| Item | State |
|---|---|
| Message wording "Monthly attendance report" (app PR 397, box PR 3) | Done |
| WhatsApp: wording fixes, Saturday week, dry runs, retry outbox (box PRs 1, 2) | Done |
| WhatsApp cash amounts match the app, children's teacher share (box PR 4) | Done. Later replaced by one shared "Cash with Accountant" figure from the app (box #9, app #406) |
| WhatsApp daily reminder (collection, deposit) | Daily on purpose: it pushes for the deposit. The owner changes frequency in the Automations setting |
| Deposit / loan posts to WhatsApp, formatting, emoji titles (box #9 to #13, app #406 to #412) | Done by another session, merged 8 Oct. Sending is gated by a go-live file on the box |
| Box update check blocked by "dirty tree" | Fixed on the box (see "Box operations") |
| Whole box on Nigerian time (box PR 14, merged 9 Oct) | Done. No change until the UK clock change on 25 Oct. Three JavaScript helpers still use UK time on purpose (see below) |
| Loans: server, balance maths, dashboard rework, loan screens (app PRs 399, 400, 401) | Done |
| Dashboard matches the approved mockup (app PR 403) | Done |
| Loans round 2: petty cash option, IT admin reversal, names only for four roles, role-targeted notifications, loan lines in cash breakdown pages (app PR 404) | Done |
| Monthly statement and report: loans memo (app PR 413) | Done |
| Dark mode (Auto / Light / Dark switch in the menu) | Built and tested on branch `claude/dark-mode`; being checked on screenshots before it is merged |
| Loans: confirmation without a second person (bank match, holder rule, AI-checked receipt photo) | Done (app PR 416 and the receipt PR) |
| Budget tab: its own "available for new spending" figure | Not started (see below) |
| Owner's two-login trial of Loans | Still to do |

## Open items

2. **Budget tab.** The dashboard applies the owner's rule for money owed to us (savings, then known bills saved, then
   new spending, then set-aside). The Budget tab computes "available for new spending" on its own and does not apply
   it yet. Needs one decision on how to show it there, then the same helper.
3. **Owner's two-login trial of Loans.** Record a small test loan with one login, acknowledge it with a different one,
   repay it, and check the figures. Anything odd goes back as a screenshot.
4. **Confirm names in WhatsApp loan posts.** The other session's loan notices put the borrower's name in the group.
   The owner decided earlier that names are seen only by IT admin, accountant, admin officer and pastor. If the
   group is wider than that, change the posts to say "a member".
5. **Confirm WhatsApp go-live.** Sending only runs when the go-live file exists on the box. Check the box diagnostics.
6. **UK-time JavaScript helpers.** `compute-remit.js`, `att-fill.js` and `make-statement.js` in the box repo set
   `TZ=Europe/London` on purpose (remittance, attendance and statement date maths; one comment says "matches David's
   browser"). They were left alone because a one-hour change could move money-related dates. Decide separately.
7. **Smaller WhatsApp clean-ups.** Loose name matching in `called()`, state files that grow forever, the 10-minute
   safety net rebuilding every post each time.
8. **Optional.** A second Oracle instance named `clerk-box` exists and rejects the box key. Do not delete it until it
   is confirmed empty and nothing points at it.

## Decisions made (do not re-ask)

- **Where loan money comes from or goes into:** Cash with the Accountant, Petty Cash, or the bank.
- **Who can see the loans list (names, amounts):** IT admin, accountant, admin officer, pastor. Every other role gets
  amounts and status only; names are replaced by "Person N" on the server, so dashboard totals still work.
- **Corrections after acknowledgement:** IT admin only can reverse a loan or a confirmed repayment, with a reason. The
  bank or petty entry is removed, the entry stays visible as "reversed", everything is audit-logged. A loan with
  confirmed repayments needs those reversed first.
- **Dark mode:** follows the phone by default, with a Light / Dark / Auto switch in the menu, remembered on that
  device. Printed pages and shared statements stay light.
- **WhatsApp reminders:** the missed-collection reminder stays daily (no weekly ladder).
- **Nigerian time:** the whole box runs on Nigerian time (WAT, UTC+1, no daylight saving).

## Loans: who confirms (owner rulings, 9 Oct)

- **Bank match:** a bank loan or repayment confirms itself when exactly one unrecorded bank line matches (amount,
  direction, date within 7 days) and nothing else could match it. Money out of the bank needs no second person.
- **Holder rule:** the accountant recording a repayment on a cash loan we lent, or the admin officer on a petty cash
  loan we lent, confirms it at once.
- **Receipt photo:** an optional photo that the AI reads and matches (real receipt, amount, date, not used before)
  confirms any entry with no second person. Doubtful, unreadable or reused receipts go to a second person with a note.
  Photos are stored apart from the loans list and fetched on demand by the four loan roles.
- Everything else still needs a different person. IT admin reversal releases a bank line again.

## Loans: how it works (design as built)

### Dashboard
- **Total Church Balance** = money physically on hand: Bank + Cash with Accountant + Petty Cash.
- **Satellites & Loans** card between Remittance Due and the Available Fund, joined by a "±" circle. Headline figure =
  money owed to us minus money we owe. Rows: "Owed by satellite pool" (our own money used to top up the pool; or "Held
  for satellite pool" when we hold the pool's money), "Loans owed to us (N)", "Loans we owe (N)" (N = people, hidden
  when zero), and a note when entries wait for a second person. Tapping the loan rows opens the Loans pop-up.
- **Available Fund After All Deductions** = Total on hand − RCCG remittance due + owed by the satellite pool + loans
  owed to us − loans we owe. Lending or borrowing never changes it. When money is owed to us, a split bar shows
  "Money in hand" and "Owed to us, not back yet".
- **Budget block:** money owed to us is absorbed in this order: savings (held back), known bills saved, available for
  new spending, set-aside for next budget. Sentences under "Available for new spending": "Could rise to ..." first,
  then the money-owed note, then the red warning.
- A third explanation slide, "How Available Fund is Calculated", sits in the "How is Actual Balance calculated?" panel.

### Rules
- Record: IT admin, accountant, admin officer, pastor. A **different** person from that list acknowledges (server
  enforced, same for repayments). Pending, rejected and reversed entries move nothing. Rejecting needs a reason.
- Bank loans mirror into the bank ledger with the same pass-through marker satellite funds use. Petty cash loans go
  through the petty ledger (lending = approved disbursement; money in = refill paid by "loan"). Cash-with-accountant
  loans have no mirror and are counted by `loanCashMovements` / `accountantLoanCashMovements`.
- Loans are never income, never remittable and never part of statement totals. The statement and report carry a memo
  (no names).
- Cash breakdown pages, the Sunday cash cycle and the Record Cash Deposit form count loan cash so the accountant is
  never told to deposit cash that was lent out.
- Notifications about loans reach only the four roles (new `roles` column); IT admin sees everything.
- Tables `loans`, `loan_repayments` (inline migrations in `functions/api/[[route]].js`). No interest. Due-date
  reminders are later, not version 1.

## Box operations (no real addresses or keys here)

- The box pulls the `main` branch of the private clerk-box repo every 5 minutes (user timer `clerk-pull.timer`; the
  description still says 15). Merged changes arrive within minutes. It skips with "dirty tree" if git sees modified
  tracked files.
- Cause found 7 Oct: the repo tracks files the box rewrites constantly (heartbeat, scheduler state, check log, sync
  stamps, month-info caches). Fixed on the box with `git update-index --skip-worktree` on those paths. If an update is
  ever skipped again, ask the owner for the read-only check `git -C /workspace status --short`. Do not stop tracking
  those files in the repo without a plan: a pull would delete them from the box.
- Reaching the box without a terminal is not possible for Claude. The owner uses Oracle Cloud Shell and has the key
  there. Oracle Run Command does not work without an IAM dynamic group policy (not set up). The box writes copies of
  its scripts and status to Drive every 10 minutes, which is how a change is confirmed.
- The supervisor unit may show "auto-restart": its own guard makes any second copy exit, so this is expected.
- Never run retired installers; see `box/INSTALL-ORDER.md`.
