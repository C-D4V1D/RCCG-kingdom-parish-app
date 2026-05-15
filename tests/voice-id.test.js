import test from 'node:test';
import assert from 'node:assert/strict';

// ── voice-fp-utils: pcm16ToWav + shouldAutoTickFromIdentify ───────
import { pcm16ToWav, shouldAutoTickFromIdentify } from '../src/js/voice-fp-utils.js';

// ── pcm16ToWav — 4 tests ──────────────────────────────────────────

test('pcm16ToWav: WAV header is exactly 44 bytes', () => {
  const samples = new Int16Array(160); // 10 ms at 16 kHz
  const buf = pcm16ToWav(samples, 16000);
  // Total buffer = 44-byte header + (samples * 2) bytes of data
  assert.equal(buf.byteLength, 44 + samples.length * 2);
});

test('pcm16ToWav: RIFF chunk magic is correct', () => {
  const samples = new Int16Array(16);
  const buf = pcm16ToWav(samples, 16000);
  const view = new DataView(buf);
  const riff = String.fromCharCode(
    view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)
  );
  assert.equal(riff, 'RIFF');
  const wave = String.fromCharCode(
    view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)
  );
  assert.equal(wave, 'WAVE');
});

test('pcm16ToWav: sample rate field is written correctly', () => {
  const samples = new Int16Array(32);
  const sampleRate = 16000;
  const buf = pcm16ToWav(samples, sampleRate);
  const view = new DataView(buf);
  // sampleRate is at byte offset 24, little-endian uint32
  const storedRate = view.getUint32(24, true);
  assert.equal(storedRate, sampleRate);
});

test('pcm16ToWav: round-trip — sample count in header matches input length', () => {
  const sampleCount = 240; // 15 ms at 16 kHz
  const samples = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) samples[i] = i % 32767;

  const buf  = pcm16ToWav(samples, 16000);
  const view = new DataView(buf);

  // data chunk size is at offset 40, little-endian uint32
  const dataBytes = view.getUint32(40, true);
  // bytes / 2 (bytes per int16 sample) = sample count
  assert.equal(dataBytes / 2, sampleCount);
});

// ── shouldAutoTickFromIdentify — 2 tests ──────────────────────────

const testMembers = [
  { group: 'men',    name: 'Brother Ade' },
  { group: 'women',  name: 'Sister Bisi' },
  { group: 'youth',  name: 'Youth Chidi' },
  { group: 'ministers', name: 'Pastor Dayo' },
];

test('shouldAutoTickFromIdentify: match → returns correct groupKey and idx', () => {
  const response = { match: true, memberName: 'Sister Bisi', score: 0.82, threshold: 0.65 };
  const result = shouldAutoTickFromIdentify(response, testMembers);
  assert.ok(result !== null, 'should return a non-null result');
  assert.equal(result.groupKey, 'women');
  assert.equal(result.idx, 0); // first (only) woman in group
});

test('shouldAutoTickFromIdentify: no-match response → returns null', () => {
  const response = { match: false, score: 0.41, threshold: 0.65 };
  const result = shouldAutoTickFromIdentify(response, testMembers);
  assert.equal(result, null);
});

test('shouldAutoTickFromIdentify: match with unknown name → returns null', () => {
  const response = { match: true, memberName: 'Unknown Person', score: 0.9, threshold: 0.65 };
  const result = shouldAutoTickFromIdentify(response, testMembers);
  assert.equal(result, null);
});
