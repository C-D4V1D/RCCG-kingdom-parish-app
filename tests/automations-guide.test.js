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

test('WhatsApp samples are read-only and cover approved finance posts and existing messages',()=>{
 const s=readFileSync(new URL('../src/js/app.js',import.meta.url),'utf8');
 const samples=s.slice(s.indexOf('const AUTOMATION_WHATSAPP_SAMPLES'),s.indexOf('function automationsWhatsappSectionHtml'));
 for(const text of ['Cash not yet deposited','NET ${kind}','Cash deposit recorded','🤝 LOAN GIVEN','✅ LOAN REPAYMENT RECEIVED','📥 LOAN RECEIVED BY CHURCH','📤 LOAN REPAYMENT PAID','Church bank account','Petty cash','Sunday collection recorded','Sunday attendance recorded','New memo','Monthly financial statement','Saturday spending note','Remittance checklist'])assert.ok(samples.includes(text),text);
 assert.match(samples,/Read-only examples, not live transactions/);
 assert.doesNotMatch(samples,/onclick=|authFetch|at-field|<input|<textarea/);
 assert.ok(s.includes('${automationsWhatsappSamplesHtml(config)}'));
});

test('WhatsApp samples use single-star bold and cover each existing unpaid RRR follow-up',()=>{
 const s=readFileSync(new URL('../src/js/app.js',import.meta.url),'utf8');
 const samples=s.slice(s.indexOf('const AUTOMATION_WHATSAPP_SAMPLES'),s.indexOf('function automationsWhatsappSectionHtml'));
 assert.doesNotMatch(samples,/\*\*/);
 for(const key of ['followup','tomorrow','today','closed','unknown'])assert.ok(samples.includes("'checklist-"+key+"'"));
 assert.ok(samples.includes('📋 Kingdom Parish · October remittance\\n\\n*Today, Sun 18 Oct, is remittance day.*'));
});

test('WhatsApp sample groups have plain labels and previews render supported bold',()=>{
 const s=readFileSync(new URL('../src/js/app.js',import.meta.url),'utf8');
 for(const title of ['Daily / Reminders','Collections & Attendance','Bank','Deposits','Loans','Memos & Statements','Other'])assert.ok(s.includes("['"+title+"',"));
 assert.ok(s.includes("label:title.replace(/^[^A-Z]+/, '')"));
 assert.ok(s.includes('automationsWhatsappPreview(automationsHelpText(g.sample,config))'));
});
