// voice-attendance.js — pure name-matching logic for voice-driven attendance marking.
// This module has no DOM or browser dependencies and can be imported in Node test runners.

/** GROUPS mirrors the main kpsc.js constant; kept in sync manually. */
const GROUPS = [
  { key: 'men' },
  { key: 'women' },
  { key: 'youth' },
  { key: 'ministers' },
];

/**
 * Normalise a name string into a single first-name token for matching.
 * Strips diacritics, keeps only lowercase a-z, returns the first word.
 * Returns '' if the result is shorter than 3 characters (too ambiguous to match).
 */
export function normToken(str) {
  const tok = String(str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')  // strip combining diacritics (Unicode range)
    .replace(/[^a-z\s]/g, ' ')
    .trim()
    .split(/\s+/)[0] || '';
  return tok.length >= 3 ? tok : '';
}

/**
 * Build Map<token, [{groupKey, idx, fullName}]> from a members array and a GROUPS array.
 * Multiple members sharing the same first-name token land in the same array so
 * pickAutoTickTargets can detect ambiguity and skip the auto-tick.
 *
 * @param {Array<{group: string, name: string}>} members
 * @param {Array<{key: string}>} [groups] — defaults to the standard GROUPS list
 * @returns {Map<string, Array<{groupKey: string, idx: number, fullName: string}>>}
 */
export function buildAttendanceNameIndex(members, groups = GROUPS) {
  const index = new Map();
  for (const g of groups) {
    const groupMembers = members.filter(m => m.group === g.key);
    groupMembers.forEach((mem, i) => {
      const token = normToken(mem.name);
      if (!token) return;
      if (!index.has(token)) index.set(token, []);
      index.get(token).push({ groupKey: g.key, idx: i, fullName: mem.name });
    });
  }
  return index;
}

/**
 * Pure decision function — returns an array of {groupKey, idx} pairs for
 * members that should be auto-ticked based on a single transcript line.
 *
 * Rules:
 *  - Skip tokens shorter than 3 characters.
 *  - Skip tokens that match more than one roster member (ambiguous).
 *  - Skip members whose key is already in alreadyTicked.
 *  - Each member can only appear once per call even if their name token appears twice.
 *
 * @param {string} text            — one transcript line (the `clean` variable)
 * @param {Map}    nameIndex       — from buildAttendanceNameIndex
 * @param {Set}    alreadyTicked   — Set<"${groupKey}_${idx}"> already voice-ticked
 * @returns {Array<{groupKey: string, idx: number}>}
 */
export function pickAutoTickTargets(text, nameIndex, alreadyTicked) {
  const results = [];
  const seenKeys = new Set();
  const words = String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .trim()
    .split(/\s+/);
  const unique = [...new Set(words.filter(w => w.length >= 3))];
  for (const word of unique) {
    const matches = nameIndex.get(word);
    if (!matches || matches.length === 0) continue;
    if (matches.length > 1) continue; // ambiguous — skip
    const { groupKey, idx } = matches[0];
    const key = `${groupKey}_${idx}`;
    if (alreadyTicked.has(key)) continue;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    results.push({ groupKey, idx });
  }
  return results;
}
