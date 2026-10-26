# Noncash debt forgiveness

Loans keep their original cash movements and repayment history. A separate
`loan_forgiveness` register records requests, confirmations, rejections and
cancellations. Pending requests do not change balances. The IT admin,
accountant, admin officer and pastor can request or confirm. The requester
cannot confirm their own request. Both lent and borrowed debts support partial
or full forgiveness. Borrowed debt requires the requester to describe the
lender's release in the reason; confirmation is a separate human decision.

Confirmation reduces the receivable for lent debt or liability for borrowed
debt on the confirmation date. It creates no income, expense, bank, petty or
cash movement. Reports show the amounts separately as noncash write-offs.

Repayments and forgiveness cannot be pending together. Loan or repayment
reversal is blocked once a forgiveness request is pending or confirmed, to
avoid undoing settled accounting history. Reject or cancel pending forgiveness
before correcting the loan. Confirmed forgiveness is never deleted or edited. A linked correction request
restores its exact amount only after a different human confirms. Corrections have
their own reasons, actors and dates; pending/rejected/cancelled corrections change
nothing. Each forgiveness can have only one pending or confirmed correction.
Existing Reverse becomes usable again after all write-offs on that loan are
corrected and no forgiveness request remains pending.

Fully forgiven loans keep the underlying acknowledged loan status so original
cash movements remain in every historical cash calculation. The Loans screen
places them in Finished based on forgiven and outstanding amounts. Partial
forgiveness stays active, with repayments capped by the remaining amount.

The register is created both by normal init and lazily when a restored signed-in
session first reads or changes Loans. Lazy creation fails loudly on schema errors.

Tests use fake in-memory SQLite data only. No production records are changed by
tests. Release verification should read the live UI without requesting or
confirming forgiveness on any real loan.
