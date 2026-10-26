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
test('review viewer cannot read private forgiveness reasons through audit',async()=>{
const {request,confirm,call}=await setup();const f=await(await request(1000)).json();await confirm(f.id);
const r=await call('audit','viewer'); console.log('VIEWER AUDIT',r.status,await r.clone().text());
assert.ok(!JSON.stringify(await r.json()).includes('Example approved loss'));
});
