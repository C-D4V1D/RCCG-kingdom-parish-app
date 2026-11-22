import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ARREARS_BUCKETS, arrearsBucketKey, buildArrearsBuckets } from '../src/js/partner-progress-stats.js';
const source = fs.readFileSync(new URL('../src/js/kpsc.js', import.meta.url), 'utf8');
function fn(name) {
 const start=source.indexOf(`function ${name}(`);
 assert.notEqual(start,-1);
 // Each selected top-level function ends at a closing brace on its own line.
 return source.slice(start,source.indexOf('\n}',start)+2);
}
const defs=source.slice(source.indexOf('const ARREARS_BUCKETS = ['),source.indexOf('const ARREARS_FILTER_KEYS ='));
const ctx=vm.createContext({S:{progressFilter:'all'},Number,Math,Set,Map,
 esc:s=>String(s),fmtNaira:n=>'₦'+n.toLocaleString('en-NG'),monthName:()=> 'November'});
vm.runInContext(defs+'\nconst ARREARS_FILTER_KEYS = ARREARS_BUCKETS.map(b=>b.key);\n'+['wholePercentages','arrearsBucketKey','buildArrearsBuckets','progressScopeEndMonth','progressHealthRows','_filterProgressPartners','renderPaymentHealthSection','setProgressArrearsFilter'].map(fn).join('\n')+'\nthis.api={ARREARS_BUCKETS,arrearsBucketKey,buildArrearsBuckets,renderPaymentHealthSection,_filterProgressPartners,setProgressArrearsFilter};',ctx);
const plain=x=>JSON.parse(JSON.stringify(x));
test('six exact boundaries and all high-month values use 5+',()=>{
 assert.deepEqual([0,1,2,3,4,5,6,11,12,99].map(arrearsBucketKey),['up-to-date','behind-1','behind-2','behind-3','behind-4','behind-5plus','behind-5plus','behind-5plus','behind-5plus','behind-5plus']);
 assert.equal(ARREARS_BUCKETS.length,6);
});
test('canonical and actual inlined source agree on buckets, money and percentages',()=>{
 const entries=Array.from({length:49},(_,i)=>({monthsBehind:i%12,outstanding:(i%12)*137}));
 assert.deepEqual(plain(ctx.api.ARREARS_BUCKETS).map(({key,label,min,max})=>({key,label,min,max})),plain(ARREARS_BUCKETS));
 const expected=buildArrearsBuckets(entries), actual=plain(ctx.api.buildArrearsBuckets(entries));
 for(const k of ['total','totalOutstanding','upToDate','upToDatePct'])assert.equal(actual[k],expected[k]);
 assert.deepEqual(actual.buckets.map(({key,label,count,pct,outstanding})=>({key,label,count,pct,outstanding})),expected.buckets);
 assert.equal(expected.buckets.reduce((n,b)=>n+b.pct,0),100);
 assert.equal(expected.totalOutstanding,entries.reduce((n,e)=>n+e.outstanding,0));
});
test('splitting old 3+ conserves count and money; zero bands remain present',()=>{
 const entries=[0,1,2,3,3,4,5,8,12].map(n=>({monthsBehind:n,outstanding:n*1000}));
 const h=buildArrearsBuckets(entries), tail=h.buckets.slice(3);
 assert.equal(tail.reduce((s,b)=>s+b.count,0),6);
 assert.equal(tail.reduce((s,b)=>s+b.outstanding,0),35000);
 assert.equal(h.buckets.reduce((s,b)=>s+b.count,0),entries.length);
 assert.equal(buildArrearsBuckets([]).buckets.length,6);
});
test('actual renderer keeps six row buttons and six proportional segments, amounts in original span',()=>{
 const h=ctx.api.buildArrearsBuckets([0,1,2,3,4,5].map(n=>({monthsBehind:n,outstanding:n*1000})));
 const html=ctx.api.renderPaymentHealthSection(h,11,2026,11);
 assert.equal((html.match(/data-filter=/g)||[]).length,6);
 assert.equal((html.match(/class="k-health-seg /g)||[]).length,6);
 for(const b of h.buckets){assert.ok(html.includes(`width:${b.pct}%`));assert.ok(html.includes(`data-filter="${b.key}"`));}
 assert.match(html,/<span class="k-health-figs">\s*<strong>1<\/strong> · 17%\s*<span class="k-health-owed">₦3,000 owed<\/span>\s*<\/span>/);
});
test('each real UI band filter returns its own members and toggles back to all',()=>{
 const partners=[0,1,2,3,4,5,8].map((n,i)=>({id:String(i),fullName:'Partner '+i,monthlyPledge:1000,n}));
 ctx.isBeforePartnerStart=()=>false;
 ctx.partnerArrears=p=>({monthsBehind:p.n,outstanding:p.n*1000,monthsInScope:11});
 ctx._rerenderProgressRows=()=>{};ctx.document={getElementById:()=>null};
 for(const bucket of ARREARS_BUCKETS){
 ctx.S.progressFilter='all';ctx.api.setProgressArrearsFilter(bucket.key);
 assert.deepEqual(plain(ctx.api._filterProgressPartners(partners,11,2026,2026,11)).map(p=>p.id),partners.filter(p=>arrearsBucketKey(p.n)===bucket.key).map(p=>p.id));
 ctx.api.setProgressArrearsFilter(bucket.key);assert.equal(ctx.S.progressFilter,'all');
 }
});
