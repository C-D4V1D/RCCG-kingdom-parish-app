import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normToken,
  buildAttendanceNameIndex,
  pickAutoTickTargets,
} from '../src/js/voice-attendance.js';

// ── helpers ──────────────────────────────────────────────────────────

/** Convenience: build an index from a flat member list (all in group 'men'). */
function idx(members) {
  return buildAttendanceNameIndex(members, [{ key: 'men' }]);
}

// ── normToken ─────────────────────────────────────────────────────────

test('normToken returns lowercase first word', () => {
  assert.equal(normToken('Tunde Smith'), 'tunde');
});

test('normToken strips diacritics so accented names normalise', () => {
  assert.equal(normToken('Túndé'), 'tunde');
  assert.equal(normToken('Ólárewájú'), 'olarewaju');
});

test('normToken returns empty string for names shorter than 3 chars after stripping', () => {
  assert.equal(normToken('Bo'), '');
  assert.equal(normToken('Al'), '');
});

test('normToken handles empty and whitespace-only strings', () => {
  assert.equal(normToken(''), '');
  assert.equal(normToken('   '), '');
});

// ── buildAttendanceNameIndex ──────────────────────────────────────────

test('buildAttendanceNameIndex maps each unique first-name token', () => {
  const members = [
    { group: 'men', name: 'Tunde Adeyemi' },
    { group: 'men', name: 'Sarah Okafor' },
  ];
  const index = idx(members);
  assert.equal(index.get('tunde')?.length, 1);
  assert.equal(index.get('sarah')?.length, 1);
  assert.equal(index.get('tunde')[0].groupKey, 'men');
  assert.equal(index.get('tunde')[0].idx, 0);
});

test('buildAttendanceNameIndex groups multiple members sharing a first-name token', () => {
  const members = [
    { group: 'men', name: 'Tunde Adeyemi' },
    { group: 'men', name: 'Tunde Okafor' },
  ];
  const index = idx(members);
  assert.equal(index.get('tunde')?.length, 2);
});

test('buildAttendanceNameIndex skips names shorter than 3 chars', () => {
  const members = [
    { group: 'men', name: 'Bo Smith' },
    { group: 'men', name: 'Sarah Okafor' },
  ];
  const index = idx(members);
  assert.equal(index.has('bo'), false);
  assert.equal(index.has('sarah'), true);
});

// ── pickAutoTickTargets — core matching ───────────────────────────────

test('single first-name token in transcript ticks the matching member', () => {
  const members = [{ group: 'men', name: 'Tunde Adeyemi' }];
  const nameIndex = idx(members);
  const result = pickAutoTickTargets("let's hear from Tunde", nameIndex, new Set());
  assert.deepEqual(result, [{ groupKey: 'men', idx: 0 }]);
});

test('ambiguous first name (two roster members) produces no tick', () => {
  const members = [
    { group: 'men', name: 'Tunde Adeyemi' },
    { group: 'men', name: 'Tunde Okafor' },
  ];
  const nameIndex = idx(members);
  const result = pickAutoTickTargets('Tunde will pray', nameIndex, new Set());
  assert.deepEqual(result, []);
});

test('name shorter than 3 chars in roster is never matched', () => {
  const members = [{ group: 'men', name: 'Bo Smith' }];
  const nameIndex = idx(members);
  // 'bo' is not in the index, so no tick even if spoken
  const result = pickAutoTickTargets('Bo will speak', nameIndex, new Set());
  assert.deepEqual(result, []);
});

test('diacritics in roster name match plain spoken form', () => {
  const members = [{ group: 'men', name: 'Túndé Adeyemi' }];
  const nameIndex = idx(members);
  const result = pickAutoTickTargets('Tunde opens in prayer', nameIndex, new Set());
  assert.deepEqual(result, [{ groupKey: 'men', idx: 0 }]);
});

test('repeated mention of the same name does not produce a second tick entry', () => {
  const members = [{ group: 'men', name: 'Tunde Adeyemi' }];
  const nameIndex = idx(members);
  const result = pickAutoTickTargets('Tunde and Tunde', nameIndex, new Set());
  assert.equal(result.length, 1);
});

test('already-ticked member is skipped on subsequent transcript lines', () => {
  const members = [{ group: 'men', name: 'Tunde Adeyemi' }];
  const nameIndex = idx(members);
  const ticked = new Set(['men_0']);
  const result = pickAutoTickTargets('Tunde again', nameIndex, ticked);
  assert.deepEqual(result, []);
});

test('multiple distinct members can be ticked from one transcript line', () => {
  const members = [
    { group: 'men', name: 'Tunde Adeyemi' },
    { group: 'men', name: 'Sarah Okafor' },
  ];
  const nameIndex = idx(members);
  const result = pickAutoTickTargets('Tunde and Sarah will lead', nameIndex, new Set());
  assert.equal(result.length, 2);
  assert.ok(result.some(r => r.groupKey === 'men' && r.idx === 0));
  assert.ok(result.some(r => r.groupKey === 'men' && r.idx === 1));
});

test('unknown words in transcript do not produce ticks', () => {
  const members = [{ group: 'men', name: 'Tunde Adeyemi' }];
  const nameIndex = idx(members);
  const result = pickAutoTickTargets('opening prayer today', nameIndex, new Set());
  assert.deepEqual(result, []);
});
