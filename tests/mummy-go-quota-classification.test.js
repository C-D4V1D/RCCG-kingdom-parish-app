import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/js/app.js',import.meta.url),'utf8');
const fn=source.match(/function isMummyQuotaLabel\(label\)\{[\s\S]*?\n\}/)[0];
const classify=vm.runInNewContext('('+fn+')');
test('Mummy GO project is not a local pastoral stipend',()=>{
 for(const name of ['Mummy GO Project','MUMMY G.O. PROJECT','Mummy G O Project']) assert.equal(classify(name),false);
});
test('existing Zonal Mummy Stipend remains local and unrelated quotas stay authority lines',()=>{
 assert.equal(classify('Zonal Mummy Stipend'),true);
 assert.equal(classify('Regional Contribution'),false);
 assert.equal(classify('Open Heavens'),false);
});
