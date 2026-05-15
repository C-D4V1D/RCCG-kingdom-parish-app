/**
 * Pure helper — maps the raw OCR receipt response → form-field values.
 * No DOM access; safe to import in Node.js for unit tests.
 */
export function mapReceiptOcrToFormFields(ocr) {
  // date: accept YYYY-MM-DD only
  let date = null;
  if (typeof ocr?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ocr.date.trim())) {
    date = ocr.date.trim();
  }

  // amount: parse numbers permissively (strip commas, reject negative)
  let amount = null;
  if (ocr?.amount !== null && ocr?.amount !== undefined) {
    const raw = String(ocr.amount).replace(/,/g, '').trim();
    const n = parseFloat(raw);
    if (!isNaN(n) && n >= 0) amount = n;
  }

  // reference: prefer receipt reference, fall back to vendor
  let ref = null;
  if (typeof ocr?.reference === 'string' && ocr.reference.trim()) ref = ocr.reference.trim();
  else if (typeof ocr?.vendor === 'string' && ocr.vendor.trim()) ref = ocr.vendor.trim();

  // note: "vendor — itemsSummary"
  const parts = [
    typeof ocr?.vendor === 'string' && ocr.vendor.trim() ? ocr.vendor.trim() : null,
    typeof ocr?.itemsSummary === 'string' && ocr.itemsSummary.trim() ? ocr.itemsSummary.trim() : null,
  ].filter(Boolean);
  const note = parts.join(' — ') || null;

  return { date, amount, ref, note };
}
