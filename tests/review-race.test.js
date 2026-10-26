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
test('review concurrent correction/repayment leaves debt active',async()=>{
const {DB,call,request,confirm,list,loanId}=await setup('bank');
const f=await(await request(6000)).json();await confirm(f.id);
const c=await(await call(`loan-forgiveness/${f.id}/correct`,'accountant',{reason:'Correct error'})).json();
const r=await(await call(`loans/${loanId}/repay`,'pastor',{amount:4000,channel:'bank'})).json();
const original=DB.prepare;let armed=true;
DB.prepare=sql=>{const st=original(sql);if(sql.startsWith('SELECT (SELECT COALESCE(SUM(amount),0) FROM loan_forgiveness')&&armed){const first=st.first;st.first=async(...args)=>{const result=await first(...args);armed=false;assert.equal((await call(`loan-forgiveness-corrections/${c.id}/confirm`,'pastor',{})).status,200);return result;};}return st;};
assert.equal((await call(`loan-repayments/${r.id}/acknowledge`,'admin_officer',{})).status,200);
const l=await list();console.log('CONCURRENT RESULT',l.status,l.outstanding,l.repaid,l.forgiven);assert.equal(l.status,'active');assert.equal(l.outstanding,6000);
});
