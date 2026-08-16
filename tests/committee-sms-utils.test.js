import test from 'node:test';
import assert from 'node:assert/strict';
import {
  smsCharInfo,
  toGsm7Safe,
  normalizeNgPhone,
  isLikelyValidPhone,
  normalizePersonName,
  applyCommitteePlaceholders,
  firstNameOf,
  findUnknownPlaceholders,
  COMMITTEE_SMS_PRESETS,
} from '../src/js/committee-sms-utils.js';

// ── smsCharInfo ───────────────────────────────────────────────────────────
test('smsCharInfo: empty message costs nothing', () => {
  assert.deepEqual(smsCharInfo(''), { chars: 0, pages: 0, encoding: 'GSM-7' });
});

test('smsCharInfo: GSM-7 page boundaries are 160 then 153', () => {
  assert.deepEqual(smsCharInfo('a'.repeat(160)), { chars: 160, pages: 1, encoding: 'GSM-7' });
  assert.deepEqual(smsCharInfo('a'.repeat(161)), { chars: 161, pages: 2, encoding: 'GSM-7' });
  assert.deepEqual(smsCharInfo('a'.repeat(306)), { chars: 306, pages: 2, encoding: 'GSM-7' });
  assert.deepEqual(smsCharInfo('a'.repeat(307)), { chars: 307, pages: 3, encoding: 'GSM-7' });
});

test('smsCharInfo: extension-table characters bill as two', () => {
  assert.equal(smsCharInfo('€').chars, 2);
  assert.equal(smsCharInfo('[]').chars, 4);
  assert.equal(smsCharInfo('[]').encoding, 'GSM-7');
});

test('smsCharInfo: one emoji flips the whole message to Unicode pricing', () => {
  const info = smsCharInfo('Good morning. 🙏');
  assert.equal(info.encoding, 'Unicode');
  assert.equal(info.pages, 1);
  assert.equal(smsCharInfo('a'.repeat(70) + '🙏').pages, 2);
});

// ── toGsm7Safe ────────────────────────────────────────────────────────────
test('toGsm7Safe: strips emoji and closes the gap they leave', () => {
  assert.equal(toGsm7Safe('Good morning. 🙏 Just a reminder'), 'Good morning. Just a reminder');
  assert.equal(toGsm7Safe('God bless! 🙏'), 'God bless!');
});

test('toGsm7Safe: maps smart punctuation to ASCII', () => {
  assert.equal(toGsm7Safe('today’s meeting'), "today's meeting");
  assert.equal(toGsm7Safe('“welfare”'), '"welfare"');
  assert.equal(toGsm7Safe('9am – 11am'), '9am - 11am');
  assert.equal(toGsm7Safe('and so on…'), 'and so on...');
  assert.equal(toGsm7Safe('₦5,000'), 'N5,000');
});

test('toGsm7Safe: keeps paragraph breaks intact', () => {
  const out = toGsm7Safe('Dear Member,\n\nGood morning. 😊\n\nGod bless!');
  assert.equal(out, 'Dear Member,\n\nGood morning.\n\nGod bless!');
});

test('toGsm7Safe: output is always billable as GSM-7', () => {
  const pasted = 'Dear Committee Member,\n\nGood morning. 🙏 Just a reminder that our KPSC meeting is today, immediately after Sunday service.\n\nWe have important matters to discuss regarding the development and welfare of the church, and your input and commitment are essential.\n\nThere will also be some refreshments. 😊 See you after service. God bless! 🙏';
  assert.equal(smsCharInfo(pasted).encoding, 'Unicode');
  assert.equal(smsCharInfo(pasted).pages, 5);
  const cleaned = toGsm7Safe(pasted);
  assert.equal(smsCharInfo(cleaned).encoding, 'GSM-7');
  assert.equal(smsCharInfo(cleaned).pages, 3); // 5 Unicode pages → 3 GSM-7 pages
  assert.ok(!cleaned.includes('🙏'));
  assert.ok(cleaned.includes('Good morning. Just a reminder'));
  assert.ok(cleaned.endsWith('God bless!'));
});

test('toGsm7Safe: already-clean text is returned unchanged', () => {
  const clean = 'Dear Committee Member,\n\nGod bless!';
  assert.equal(toGsm7Safe(clean), clean);
});

test('toGsm7Safe: handles null/undefined', () => {
  assert.equal(toGsm7Safe(null), '');
  assert.equal(toGsm7Safe(undefined), '');
});

// ── normalizeNgPhone ──────────────────────────────────────────────────────
test('normalizeNgPhone: local Nigerian formats become 234…', () => {
  assert.equal(normalizeNgPhone('08031234567'), '2348031234567');
  assert.equal(normalizeNgPhone('8031234567'), '2348031234567');
  assert.equal(normalizeNgPhone('0803 123 4567'), '2348031234567');
  assert.equal(normalizeNgPhone('+234 803 123 4567'), '2348031234567');
  assert.equal(normalizeNgPhone('234-803-123-4567'), '2348031234567');
});

test('normalizeNgPhone: repairs a country code typed in front of the leading 0', () => {
  assert.equal(normalizeNgPhone('23408031234567'), '2348031234567');
  assert.equal(normalizeNgPhone('+234 0803 123 4567'), '2348031234567');
});

test('normalizeNgPhone: leading international zeros are dropped, not re-prefixed', () => {
  assert.equal(normalizeNgPhone('002348031234567'), '2348031234567');
});

test('normalizeNgPhone: non-Nigerian international numbers are left alone', () => {
  assert.equal(normalizeNgPhone('447700900123'), '447700900123');
  assert.equal(normalizeNgPhone('+1 415 555 0123'), '14155550123');
});

test('normalizeNgPhone: empty and junk input yields empty string', () => {
  assert.equal(normalizeNgPhone(''), '');
  assert.equal(normalizeNgPhone(null), '');
  assert.equal(normalizeNgPhone('n/a'), '');
  assert.equal(normalizeNgPhone('0000'), '');
});

test('normalizeNgPhone is idempotent', () => {
  const once = normalizeNgPhone('08031234567');
  assert.equal(normalizeNgPhone(once), once);
});

// ── isLikelyValidPhone ────────────────────────────────────────────────────
test('isLikelyValidPhone: NG numbers must be 234 plus ten digits', () => {
  assert.equal(isLikelyValidPhone('2348031234567'), true);
  assert.equal(isLikelyValidPhone('234803123456'), false);
  assert.equal(isLikelyValidPhone('23480312345678'), false);
  assert.equal(isLikelyValidPhone(''), false);
  assert.equal(isLikelyValidPhone('447700900123'), true);
  assert.equal(isLikelyValidPhone('12345'), false);
});

// ── normalizePersonName ───────────────────────────────────────────────────
test('normalizePersonName: honorifics and punctuation are ignored', () => {
  assert.equal(normalizePersonName('Bro. John Okeke'), normalizePersonName('John Okeke'));
  assert.equal(normalizePersonName('Deaconess Grace Eze'), normalizePersonName('Grace  Eze'));
  assert.equal(normalizePersonName('PST. Samuel  Ade'), normalizePersonName('samuel ade'));
});

test('normalizePersonName: name order does not matter', () => {
  assert.equal(normalizePersonName('Okeke John'), normalizePersonName('John Okeke'));
});

test('normalizePersonName: different people still differ', () => {
  assert.notEqual(normalizePersonName('John Okeke'), normalizePersonName('John Okafor'));
  assert.notEqual(normalizePersonName('John Okeke'), normalizePersonName('John'));
});

test('normalizePersonName: a title-only name yields no key', () => {
  assert.equal(normalizePersonName('Pastor'), '');
  assert.equal(normalizePersonName('   '), '');
  assert.equal(normalizePersonName(null), '');
});

// ── applyCommitteePlaceholders ────────────────────────────────────────────
test('applyCommitteePlaceholders: fills every supported token', () => {
  const out = applyCommitteePlaceholders(
    'Dear {{firstName}} ({{name}}), as {{position}} of the {{group}} group.',
    { name: 'John Okeke', position: 'Secretary', group: 'men' },
  );
  assert.equal(out, 'Dear John (John Okeke), as Secretary of the Men group.');
});

test('applyCommitteePlaceholders: firstName is not eaten by the name rule', () => {
  assert.equal(
    applyCommitteePlaceholders('{{firstName}} / {{name}}', { name: 'Grace Eze' }),
    'Grace / Grace Eze',
  );
});

test('applyCommitteePlaceholders: tokens are case and space tolerant', () => {
  assert.equal(
    applyCommitteePlaceholders('Hi {{ Name }} and {{FIRSTNAME}}', { name: 'Grace Eze' }),
    'Hi Grace Eze and Grace',
  );
});

test('applyCommitteePlaceholders: firstName skips the honorific', () => {
  assert.equal(applyCommitteePlaceholders('Dear {{firstName}},', { name: 'Bro. John Okeke' }), 'Dear John,');
  assert.equal(applyCommitteePlaceholders('Dear {{firstName}},', { name: 'Deaconess Grace Eze' }), 'Dear Grace,');
  assert.equal(applyCommitteePlaceholders('Dear {{firstName}},', { name: 'Pastor' }), 'Dear Pastor,');
  assert.equal(applyCommitteePlaceholders('Dear {{firstName}},', { name: '' }), 'Dear ,');
});

test('applyCommitteePlaceholders: name keeps the honorific as entered', () => {
  assert.equal(applyCommitteePlaceholders('Dear {{name}},', { name: 'Bro. John Okeke' }), 'Dear Bro. John Okeke,');
});

test('applyCommitteePlaceholders: missing fields substitute to empty, not undefined', () => {
  const out = applyCommitteePlaceholders('[{{position}}][{{group}}]', { name: 'Grace Eze' });
  assert.equal(out, '[][]');
});

test('applyCommitteePlaceholders: a message with no tokens is untouched', () => {
  const body = COMMITTEE_SMS_PRESETS[0].body;
  assert.equal(applyCommitteePlaceholders(body, { name: 'Grace Eze' }), body);
});

// ── firstNameOf ───────────────────────────────────────────────────────────
test('firstNameOf: returns the first non-honorific token', () => {
  assert.equal(firstNameOf('John Okeke'), 'John');
  assert.equal(firstNameOf('Bro. John Okeke'), 'John');
  assert.equal(firstNameOf('PST Samuel Ade'), 'Samuel');
  assert.equal(firstNameOf('  Grace   Eze '), 'Grace');
  assert.equal(firstNameOf('Pastor'), 'Pastor');
  assert.equal(firstNameOf(''), '');
  assert.equal(firstNameOf(null), '');
});

// ── findUnknownPlaceholders ───────────────────────────────────────────────
test('findUnknownPlaceholders: supported tokens are not flagged', () => {
  assert.deepEqual(findUnknownPlaceholders('Hi {{name}} {{ firstName }} {{position}} {{group}}'), []);
  assert.deepEqual(findUnknownPlaceholders('no tokens here'), []);
});

test('findUnknownPlaceholders: unsupported tokens are reported once each', () => {
  assert.deepEqual(
    findUnknownPlaceholders('Meeting at {{venue}} on {{date}}, venue again {{venue}}'),
    ['{{venue}}', '{{date}}'],
  );
});

// ── presets ───────────────────────────────────────────────────────────────
test('every preset is plain GSM-7 and fits two SMS pages', () => {
  for (const preset of COMMITTEE_SMS_PRESETS) {
    const info = smsCharInfo(preset.body);
    assert.equal(info.encoding, 'GSM-7', `${preset.key} must be GSM-7`);
    assert.ok(info.pages <= 2, `${preset.key} is ${info.pages} pages`);
    assert.deepEqual(findUnknownPlaceholders(preset.body), [], `${preset.key} has an unfillable placeholder`);
  }
});

test('the default preset is the Sunday meeting reminder and is exactly two pages', () => {
  const preset = COMMITTEE_SMS_PRESETS[0];
  assert.equal(preset.key, 'meeting_today');
  assert.equal(smsCharInfo(preset.body).pages, 2);
});
