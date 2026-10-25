"""RRR amount check that understands the portal's per-beneficiary rounding (no I/O, no secrets).

The portal splits some lines between two beneficiaries by fixed percentages and rounds EACH share half-up to the kobo.
When a share is exactly half a kobo (e.g. 8,575.00 x 1.82% = 156.065 and x 98.18% = 8,418.935) both shares round UP, so the
split adds to 1 kobo MORE than the invoice amount. Remita charges the sum of the split plus fee and VAT.

check_rrr(amount, fee, vat, total, split)  split = list of beneficiary amounts from the RRR
  -> (ok, note)   ok when  total == split_total + fee + vat  AND  split_total - amount is only rounding (at most half a kobo per split line)
"""
from decimal import Decimal, ROUND_HALF_UP

K = Decimal("0.01")


def d(v):
    return Decimal(str(v)).quantize(K, rounding=ROUND_HALF_UP)


def half_up_split(amount, pcts):
    """Split `amount` by percentages the way the portal does: each share rounded half-up to the kobo."""
    return [(d(Decimal(str(amount)) * Decimal(str(p)) / 100)) for p in pcts]


def check_rrr(amount, fee, vat, total, split):
    amount, fee, vat, total = d(amount), d(fee), d(vat), d(total)
    st = sum((d(x) for x in split), Decimal("0"))
    if total != st + fee + vat:
        return False, f"REFUSED: split {st} + fee {fee} + VAT {vat} != total payable {total}"
    diff = st - amount
    allowed = K * max(1, len(split) // 2)          # never more than one kobo per two split lines
    if abs(diff) > allowed:
        return False, f"REFUSED: split {st} differs from invoice amount {amount} by {diff}, more than portal rounding"
    note = f"portal rounding {diff:+}" if diff else ""
    return True, note
