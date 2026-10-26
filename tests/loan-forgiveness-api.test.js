import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, __loanTesting } from '../functions/api/[[route]].js';
import { createSqliteD1 } from './sqlite-d1.mjs';
import { FINANCE_AUTH_HEADER, financeToken } from './finance-auth-helper.mjs';
async function setup(channel='cash', direction='lent') {
  const DB=createSqliteD1();
  const headers={admin:FINANCE_AUTH_HEADER};
  const call=async(path,who='admin',body,method=body?'POST':'GET')=>onRequest({request:new Request('https://x/api/'+path,{method,headers:{...headers[who],'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env:{DB},waitUntil(){}});
  assert.equal((await call('init')).status,200);
  for(const role of ['accountant','pastor','admin_officer','viewer']){
    const u=await(await call('users','admin',{name:'Example '+role,role,pin:'1234'})).json();
    headers[role]={Authorization:'Bearer '+await financeToken({uid:u.id,role})};
  }
  const loan=await(await call('loans','admin_officer',{person:'Example borrower',amount:10000,date:'2026-01-01',channel,direction})).json();
  if(loan.status==='pending') assert.equal((await call(`loans/${loan.id}/acknowledge`,'pastor',{})).status,200);
  const loanId=loan.id;
  const list=async(who='admin')=>(await(await call('loans',who)).json())[0];
  const request=async(amount=10000,who='accountant')=>call(`loans/${loanId}/forgive`,who,{amount,reason:'Example approved loss'});
  const confirm=async(id,who='pastor')=>call(`loan-forgiveness/${id}/confirm`,who,{});
  return {DB,call,list,request,confirm,loanId};
}
for(const channel of ['cash','bank','petty']) test(`forgiveness ${channel}: pending does nothing, distinct human confirms, no duplicate money movement`,async()=>{
  const {DB,list,request,confirm}=await setup(channel);
  const counts=async()=>Promise.all(['cash_transactions','petty_ledger','expenses','income'].map(async table=>{
    try{return (await DB.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n;}catch{return null;}
  }));
  const before=await counts();
  const r=await request();assert.equal(r.status,200);const f=await r.json();
  assert.equal((await list()).outstanding,10000);
  assert.equal((await list()).forgiven,0);
  assert.equal((await confirm(f.id,'accountant')).status,403);
  assert.equal((await confirm(f.id,'viewer')).status,403);
  await __loanTesting.autoConfirmBankLoans(DB);
  assert.equal((await list()).forgiveness[0].status,'pending');
  assert.equal((await confirm(f.id)).status,200);
  const l=await list();assert.equal(l.outstanding,0);assert.equal(l.repaid,0);assert.equal(l.forgiven,10000);
  assert.equal(l.repayments.length,0);assert.equal(l.forgiveness[0].confirmedByName,'Example pastor');
  assert.deepEqual(await counts(),before);
  assert.equal((await confirm(f.id)).status,409);
  assert.equal((await request()).status,409);
});
test('reject and cancel require reason; own cancel only; no balance effect; new request allowed',async()=>{
  const {call,list,request}=await setup();
  let f=await(await request(2000)).json();
  assert.equal((await request(1000)).status,409);
  assert.equal((await call(`loan-forgiveness/${f.id}/reject`,'pastor',{})).status,400);
  assert.equal((await call(`loan-forgiveness/${f.id}/cancel`,'pastor',{reason:'no'})).status,403);
  assert.equal((await call(`loan-forgiveness/${f.id}/reject`,'pastor',{reason:'Not agreed'})).status,200);
  f=await(await request(2000)).json();
  assert.equal((await call(`loan-forgiveness/${f.id}/cancel`,'accountant',{reason:'Withdrawn'})).status,200);
  assert.equal((await list()).outstanding,10000);assert.equal((await list()).forgiveness.length,2);
});
test('invalid amounts, missing reason and unauthorized roles rejected',async()=>{
  const {call,request,loanId}=await setup();
  for(const n of [0,-1,NaN,10001,0.001]) assert.ok((await request(n)).status>=400);
  assert.equal((await request(100,'viewer')).status,403);
  assert.equal((await call(`loans/${loanId}/forgive`,'accountant',{amount:1})).status,400);
});
test('partial forgiveness changes outstanding only; subsequent repayment bounded by remaining debt',async()=>{
  const {request,confirm,list,call,loanId}=await setup();
  const f=await(await request(3000)).json(); assert.equal((await confirm(f.id)).status,200);
  assert.equal((await list()).outstanding,7000);
  assert.equal((await call(`loans/${loanId}/repay`,'pastor',{amount:7001,channel:'bank'})).status,400);
  const r=await(await call(`loans/${loanId}/repay`,'pastor',{amount:7000,channel:'bank'})).json();
  assert.equal((await call(`loan-repayments/${r.id}/acknowledge`,'admin_officer',{})).status,200);
  const l=await list();assert.equal(l.outstanding,0);assert.equal(l.repaid,7000);assert.equal(l.forgiven,3000);
});
test('pending forgiveness blocks repayment/reversal, pending repayment blocks forgiveness',async()=>{
  const {request,call,loanId}=await setup();
  const r=await(await call(`loans/${loanId}/repay`,'pastor',{amount:1000,channel:'bank'})).json();
  assert.equal((await request(1000)).status,409);
  await call(`loan-repayments/${r.id}/reject`,'admin_officer',{reason:'Example cancellation'});
  const f=await(await request(1000)).json();assert.ok(f.id);
  assert.equal((await call(`loans/${loanId}/repay`,'pastor',{amount:1000})).status,409);
  assert.equal((await call(`loans/${loanId}/reverse`,'admin',{reason:'Example'})).status,409);
});
test('sanitized view does not disclose requester, confirmer, reason or names',async()=>{
  const {request,confirm,list}=await setup();const f=await(await request(1000)).json();await confirm(f.id);
  const l=await list('viewer');assert.equal(l.forgiven,1000);assert.equal(l.forgiveness[0].amount,1000);
  assert.equal(l.forgiveness[0].reason,undefined);assert.equal(l.forgiveness[0].requestedByName,undefined);
});
test('confirmation rechecks available balance atomically',async()=>{
  const {DB,request,confirm,list,loanId}=await setup();const f=await(await request(9000)).json();
  await DB.prepare(`INSERT INTO loan_repayments(id,loan_id,amount,status) VALUES ('example-r',?,2000,'confirmed')`).bind(loanId).run();
  assert.equal((await confirm(f.id)).status,409);assert.equal((await list()).forgiven,0);
});
test('borrowed debt release is separate from income and cash; partial then full supported',async()=>{
  const {DB,request,confirm,list}=await setup('bank','borrowed');
  const first=await(await request(2000)).json();assert.equal((await confirm(first.id)).status,200);
  assert.equal((await list()).outstanding,8000);
  const second=await(await request(8000)).json();assert.equal((await confirm(second.id)).status,200);
  const l=await list();assert.equal(l.forgiven,10000);assert.equal(l.outstanding,0);assert.equal(l.repaid,0);
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM income').first()).n,0);
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM cash_transactions').first()).n,1);
});
test('existing signed-in session heals absent forgiveness schema on read and request',async()=>{
  const {DB,call,request}=await setup();
  // A new D1 binding wrapper simulates a new deployment/isolate against the existing database.
  await DB.prepare('DROP TABLE loan_forgiveness').run();
  const fresh={...DB};
  const r=await onRequest({request:new Request('https://x/api/loans',{headers:FINANCE_AUTH_HEADER}),env:{DB:fresh},waitUntil(){}});
  assert.equal(r.status,200);assert.ok(Array.isArray(await r.json()));
  assert.equal((await request(1000)).status,200);
});
for(const direction of ['lent','borrowed']) test(`linked correction ${direction}: two humans, fixed amount, immutable source, restored balance without cash, Reverse usable again`,async()=>{
  const {DB,call,request,confirm,list,loanId}=await setup('bank',direction);
  const f=await(await request(6000)).json();await confirm(f.id);
  const counts=async()=> (await DB.prepare('SELECT COUNT(*) n FROM cash_transactions').first()).n;
  const before=await counts();
  const correct=async(who='accountant',body={reason:'Original write-off entered in error',amount:1})=>call(`loan-forgiveness/${f.id}/correct`,who,body);
  assert.equal((await correct('viewer')).status,403);assert.equal((await correct('accountant',{})).status,400);
  const r=await correct();assert.equal(r.status,200);const c=await r.json();
  assert.equal((await correct()).status,409);assert.equal((await list()).outstanding,4000);
  const decide=who=>call(`loan-forgiveness-corrections/${c.id}/confirm`,who,{});
  assert.equal((await decide('accountant')).status,403);assert.equal((await decide('viewer')).status,403);
  assert.equal((await call(`loans/${loanId}/reverse`,'admin',{reason:'Example'})).status,409);
  assert.equal((await decide('pastor')).status,200);assert.equal((await decide('pastor')).status,409);
  const l=await list();assert.equal(l.forgiven,0);assert.equal(l.outstanding,10000);
  assert.equal(l.forgiveness[0].status,'confirmed');assert.equal(l.forgivenessCorrections[0].amount,6000);
  assert.equal(l.forgivenessCorrections[0].forgivenessId,f.id);assert.equal(await counts(),before);
  assert.equal((await correct()).status,409);
  const pub=await list('viewer');assert.equal(pub.forgivenessCorrections[0].requestedByName,undefined);
  assert.equal((await call(`loans/${loanId}/reverse`,'admin',{reason:'Example correction completed'})).status,200);
});
test('correction rejection/cancellation preserve original writeoff; new correction possible',async()=>{
  const {call,request,confirm,list}=await setup();const f=await(await request(5000)).json();await confirm(f.id);
  const make=async()=> (await(await call(`loan-forgiveness/${f.id}/correct`,'accountant',{reason:'Example error'})).json());
  let c=await make();assert.equal((await call(`loan-forgiveness-corrections/${c.id}/reject`,'pastor',{reason:'Not agreed'})).status,200);
  c=await make();assert.equal((await call(`loan-forgiveness-corrections/${c.id}/cancel`,'pastor',{reason:'No'})).status,403);
  assert.equal((await call(`loan-forgiveness-corrections/${c.id}/cancel`,'accountant',{reason:'Withdrawn'})).status,200);
  assert.equal((await list()).outstanding,5000);assert.equal((await list()).forgivenessCorrections.length,2);
});
