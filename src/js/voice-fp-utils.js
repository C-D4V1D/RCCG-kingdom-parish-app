// voice-fp-utils.js — pure helpers for VF-3/VF-4 voice fingerprinting.
// No DOM or browser dependencies; importable in Node test runners.

/** GROUPS mirrors the main kpsc.js constant. */
const GROUPS = [
  { key: 'men' },
  { key: 'women' },
  { key: 'youth' },
  { key: 'ministers' },
];

/**
 * Build a standard WAV (PCM 16-bit mono) ArrayBuffer from an Int16Array.
 * Accepts pre-quantised int16 samples so callers that already hold int16
 * data (e.g. from the Deepgram worklet pipeline) do not need to convert
 * back to Float32 before encoding.
 *
 * @param {Int16Array} int16       - raw 16-bit PCM samples
 * @param {number}     sampleRate  - samples per second (e.g. 16000)
 * @returns {ArrayBuffer}          - complete WAV file contents
 */
export function pcm16ToWav(int16, sampleRate) {
  const dataLen = int16.length * 2;
  const buf     = new ArrayBuffer(44 + dataLen);
  const view    = new DataView(buf);
  // RIFF header
  'RIFF'.split('').forEach((c, i) => view.setUint8(i,      c.charCodeAt(0)));
  view.setUint32(4,  36 + dataLen, true);
  'WAVE'.split('').forEach((c, i) => view.setUint8(8  + i, c.charCodeAt(0)));
  // fmt  chunk
  'fmt '.split('').forEach((c, i) => view.setUint8(12 + i, c.charCodeAt(0)));
  view.setUint32(16, 16,              true); // chunk size
  view.setUint16(20,  1,              true); // PCM
  view.setUint16(22,  1,              true); // mono
  view.setUint32(24, sampleRate,      true);
  view.setUint32(28, sampleRate * 2,  true); // byte rate
  view.setUint16(32,  2,              true); // block align
  view.setUint16(34, 16,              true); // bits per sample
  // data chunk
  'data'.split('').forEach((c, i) => view.setUint8(36 + i, c.charCodeAt(0)));
  view.setUint32(40, dataLen, true);
  new Int16Array(buf, 44).set(int16);
  return buf;
}

/**
 * Pure helper for VF-4 B3 integration.
 * Given a /api/voice-identify response and the current S.members roster,
 * returns { groupKey, idx } of the matched member, or null if no match.
 * Exported for unit testing without DOM dependencies.
 *
 * @param {{ match: boolean, memberName?: string }} identifyResponse
 * @param {Array<{ group: string, name: string }>} members
 * @returns {{ groupKey: string, idx: number } | null}
 */
export function shouldAutoTickFromIdentify(identifyResponse, members) {
  if (!identifyResponse || !identifyResponse.match || !identifyResponse.memberName) return null;
  const name = identifyResponse.memberName;
  for (const g of GROUPS) {
    const groupMembers = members.filter(m => m.group === g.key);
    for (let i = 0; i < groupMembers.length; i++) {
      if (groupMembers[i].name === name) return { groupKey: g.key, idx: i };
    }
  }
  return null;
}
