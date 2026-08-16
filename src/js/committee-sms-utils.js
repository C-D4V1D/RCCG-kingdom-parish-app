/**
 * Pure helpers for the KPSC Committee SMS composer.
 *
 * Phone normalisation, roster↔partner name matching, GSM-7 sanitising and
 * placeholder substitution all have to behave identically in three places:
 * the browser (cost preview + recipient list), the Pages Function (the actual
 * Termii send) and the unit tests. This file is the canonical source —
 * `src/js/kpsc.js` and `functions/api/[[route]].js` inline the same logic
 * because each ships as its own standalone bundle (same arrangement as
 * partner-payment-utils.js and receipt-ocr-utils.js).
 *
 * No DOM access, no network — safe to import in Node.js for unit tests.
 */

// GSM-7 default alphabet. Characters outside it (plus the extension table
// below) force a message onto the 70-char Unicode segmentation.
export const GSM7_CHARS = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
);
// Extension-table characters — legal in GSM-7 but billed as two characters.
export const GSM7_EXT = new Set('{}[]~^\\|€');

/**
 * Characters people routinely paste from Word/WhatsApp that are NOT GSM-7 but
 * have an obvious plain-text equivalent. Anything not listed here and not in
 * the GSM-7 tables (emoji, other scripts) is dropped by toGsm7Safe().
 */
const GSM7_REPLACEMENTS = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'",
  '“': '"', '”': '"', '„': '"', '‟': '"',
  '«': '"', '»': '"', '′': "'", '″': '"',
  '–': '-', '—': '-', '―': '-', '−': '-', '•': '-',
  '…': '...', '·': '.', '⁄': '/', '×': 'x',
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '​': '',
  '₦': 'N', '™': 'TM', '®': '(R)', '©': '(C)',
  'Œ': 'OE', 'œ': 'oe', '←': '<-', '→': '->',
};

/**
 * Character count, page (segment) count and encoding for an SMS body.
 * GSM-7: 160 chars on a single page, 153 per page once concatenated.
 * Unicode: 70 single, 67 per concatenated page.
 */
export function smsCharInfo(text) {
  const s = String(text || '');
  let charCount = 0;
  let isGsm7 = true;
  for (const ch of s) {
    if (GSM7_CHARS.has(ch)) { charCount++; }
    else if (GSM7_EXT.has(ch)) { charCount += 2; }
    else { isGsm7 = false; break; }
  }
  if (!isGsm7) {
    const len = [...s].length;
    const pageSize = len <= 70 ? 70 : 67;
    return { chars: len, pages: len === 0 ? 0 : Math.ceil(len / pageSize), encoding: 'Unicode' };
  }
  const pageSize = charCount <= 160 ? 160 : 153;
  return { chars: charCount, pages: charCount === 0 ? 0 : Math.ceil(charCount / pageSize), encoding: 'GSM-7' };
}

/**
 * Rewrite a message so every character is GSM-7 representable — smart quotes,
 * dashes and ellipses become their ASCII equivalents; emoji and anything else
 * unmappable is removed. Cuts a typical pasted announcement from 5 Unicode
 * pages to 2 GSM-7 pages.
 *
 * Newlines are preserved (paragraph breaks matter in these announcements);
 * only horizontal whitespace left behind by dropped characters is collapsed.
 */
export function toGsm7Safe(text) {
  let out = '';
  for (const ch of String(text || '')) {
    if (GSM7_CHARS.has(ch) || GSM7_EXT.has(ch)) { out += ch; continue; }
    const replacement = GSM7_REPLACEMENTS[ch];
    out += replacement === undefined ? ' ' : replacement;
  }
  return out
    .replace(/[^\S\n\r]+/g, ' ')      // collapse runs of spaces/tabs, keep newlines
    .replace(/ +([,.!?;:])/g, '$1')   // "bless ! " → "bless!"
    .replace(/[^\S\n\r]+$/gm, '')     // trailing spaces on each line
    .replace(/^[^\S\n\r]+/gm, '')     // leading spaces on each line
    .trim();
}

/**
 * Normalise a phone number to the digits-only international form Termii
 * expects, defaulting to Nigeria (+234) — matching how partner phones are
 * already stored by the Partners module.
 *
 *   "08031234567"    → "2348031234567"
 *   "8031234567"     → "2348031234567"
 *   "+234 803 123 4567" → "2348031234567"
 *   "23408031234567" → "2348031234567"  (country code typed before the 0)
 *   "447700900123"   → "447700900123"   (already international, left alone)
 */
export function normalizeNgPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!d) return '';
  if (d.startsWith('2340')) d = '234' + d.slice(3).replace(/^0+/, '');
  if (d.startsWith('234')) return d;
  if (d.length === 10) return '234' + d;
  return d;
}

/** True when a normalised number looks dialable (NG numbers are 234 + 10 digits). */
export function isLikelyValidPhone(normalized) {
  const d = String(normalized || '');
  if (!d) return false;
  if (d.startsWith('234')) return d.length === 13;
  return d.length >= 10 && d.length <= 15;
}

// Honorifics that appear in front of names on the roster but not in the
// partner register (or vice versa) and would otherwise block a match.
const NAME_TITLE_WORDS = new Set([
  'bro', 'bros', 'brother', 'sis', 'sister', 'mr', 'mrs', 'miss', 'ms', 'mister',
  'dr', 'doc', 'pst', 'pastor', 'rev', 'reverend', 'elder', 'eld', 'dcn', 'deacon',
  'deaconess', 'dns', 'chief', 'engr', 'engineer', 'barr', 'barrister', 'prof',
  'professor', 'evang', 'evangelist', 'min', 'minister', 'bishop', 'sir', 'lady',
  'hon', 'mama', 'papa', 'daddy', 'mummy',
]);

/**
 * Reduce a person's name to a comparison key: lowercase, punctuation and
 * honorifics stripped, tokens sorted so "Okeke John" and "John Okeke" match.
 * Returns '' when nothing meaningful is left.
 */
export function normalizePersonName(raw) {
  const tokens = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => !NAME_TITLE_WORDS.has(t));
  if (!tokens.length) return '';
  return tokens.sort().join(' ');
}

/**
 * The name to greet somebody by — the first token that is not an honorific, so
 * "Bro. John Okeke" greets as "John" rather than "Bro.".
 */
export function firstNameOf(fullName) {
  const tokens = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const bare = token.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (bare && !NAME_TITLE_WORDS.has(bare)) return token.replace(/[.,;:]+$/, '');
  }
  return (tokens[0] || '').replace(/[.,;:]+$/, '');
}

/** Placeholders the composer understands, lowercased. */
export const COMMITTEE_SMS_PLACEHOLDERS = ['name', 'firstname', 'position', 'group'];

const GROUP_LABELS = { men: 'Men', women: 'Women', youth: 'Youth', ministers: 'Ministers' };

/**
 * Substitute the per-recipient placeholders in a message body.
 * `{{firstName}}` is handled before `{{name}}` so the two never collide.
 */
export function applyCommitteePlaceholders(template, recipient) {
  const name = String(recipient?.name || '').trim();
  const first = firstNameOf(name);
  const position = String(recipient?.position || '').trim();
  const groupKey = String(recipient?.group || '').trim().toLowerCase();
  return String(template || '')
    .replace(/\{\{\s*firstname\s*\}\}/gi, first)
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*position\s*\}\}/gi, position)
    .replace(/\{\{\s*group\s*\}\}/gi, GROUP_LABELS[groupKey] || groupKey);
}

/**
 * Placeholders in the message that the composer cannot fill. Sending one of
 * these would put a literal "{{venue}}" in front of the whole committee, so
 * the composer blocks on it instead.
 */
export function findUnknownPlaceholders(text) {
  const found = String(text || '').match(/\{\{[^{}]*\}\}/g) || [];
  const unknown = found.filter(token => {
    const inner = token.slice(2, -2).trim().toLowerCase();
    return !COMMITTEE_SMS_PLACEHOLDERS.includes(inner);
  });
  return [...new Set(unknown)];
}

/**
 * Default committee message presets. Every one of these is plain GSM-7 and
 * fits inside two SMS pages (≤ 306 chars) so a full roster blast stays cheap.
 */
export const COMMITTEE_SMS_PRESETS = [
  {
    key: 'meeting_today',
    label: '🔔 Meeting Today',
    body: 'Dear Committee Member,\n\nGood morning. Just a reminder that our KPSC meeting is today, immediately after Sunday service.\n\nWe have important matters to discuss on the development and welfare of the church, and your input is essential.\n\nThere will also be some refreshments. See you after service. God bless!',
  },
  {
    key: 'meeting_tomorrow',
    label: '📅 Meeting Tomorrow',
    body: 'Dear Committee Member,\n\nGreetings. Just a reminder that our KPSC meeting is tomorrow, immediately after Sunday service.\n\nWe have important matters to discuss on the development and welfare of the church, and your input is essential.\n\nPlease come prepared. God bless!',
  },
  {
    key: 'starting_soon',
    label: '⏰ Starting Shortly',
    body: 'Dear Committee Member,\n\nOur KPSC meeting is starting shortly. Please join us now - your presence and input are needed.\n\nGod bless!',
  },
  {
    key: 'thank_you',
    label: '🙏 Thank You',
    body: "Dear Committee Member,\n\nThank you for attending today's KPSC meeting and for your valuable contributions.\n\nThe resolutions reached will be circulated shortly. May God bless and reward your service to His house.",
  },
];
