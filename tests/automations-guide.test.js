import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Every message type on the Automations page has a Message guide entry (what, when, example), and no stale ones.
test('message guide covers every message type', () => {
  const src = readFileSync(new URL('../src/js/app.js', import.meta.url), 'utf8');
  const types = [...src.match(/const AUTOMATION_MESSAGE_TYPES = \[([\s\S]*?)\];/)[1].matchAll(/key:'(\w+)'/g)].map(m => m[1]);
  const guide = src.match(/const AUTOMATION_MESSAGE_GUIDE = \{([\s\S]*?)\n\};/)[1];
  const keys = [...guide.matchAll(/^  (\w+): \{$/gm)].map(m => m[1]);
  assert.deepEqual([...keys].sort(), [...types].sort());
  for (const k of keys) {
    const block = guide.split(`  ${k}: {`)[1].split('\n  },')[0];
    for (const f of ['what', 'when', 'sample']) assert.match(block, new RegExp(`${f}: '`), `${k}.${f}`);
  }
});
