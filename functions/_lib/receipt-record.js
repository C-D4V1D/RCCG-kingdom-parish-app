// Scripted recording of a Remita payment from its receipt (used by POST /api/internal/remittance-receipt).
// Pure rules, no I/O. Money is kept in kobo-exact numbers.
const r2 = n => Math.round((Number(n) || 0) * 100 + 1e-7) / 100;

/** What a receipt means for one Remita bill. billAmount is the RRR total payable (always known to the box). */
export function planReceipt({ billAmount, receiptAmount }) {
  const bill = r2(billAmount), R = r2(receiptAmount);
  if (!(bill > 0)) return { status: 'needsPerson', reason: 'No Remita bill amount was given.' };
  if (!(R > 0)) return { status: 'needsPerson', reason: 'The receipt amount could not be read.' };
  const diff = r2(R - bill);
  if (Math.abs(diff) < 0.005) return { status: 'ok', bill, charge: 0 };
  if (diff < 0) return { status: 'needsPerson', reason: `The receipt (${R}) is less than the bill (${bill}).` };
  return { status: 'ok', bill, charge: diff };
}

/** Checks the fields read off the receipt against what the caller says it should be. Returns '' when fine, else the reason. */
export function checkRead(read, { rrr, today }) {
  if (!read || typeof read !== 'object') return 'The receipt could not be read.';
  const got = String(read.rrr || '').replace(/\D/g, '');
  if (!got) return 'The receipt shows no RRR, so it cannot be tied to this payment.';
  if (got !== String(rrr || '').replace(/\D/g, '')) return `The receipt is for RRR ${got}, not ${rrr}.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(read.date || ''))) return 'The receipt date could not be read.';
  if (read.date > today) return 'The receipt date is in the future.';
  if (!String(read.reference || '').trim()) return 'The receipt shows no transaction reference.';
  return '';
}
