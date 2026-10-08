import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAccountantCashPool as pool, accountantLoanCashMovements as moves } from '../src/js/cash-pool.js';
const inc = amount => [{source:'sunday_collection',totalCollection:amount}];
test('September cash used for expense, petty refill and remittance is not still held',()=>{
 const p=pool(inc(20300),[],[{status:'approved',paymentMethod:'cash',amount:1000}],[{type:'refill',status:'settled',paymentMethod:'split',cashAmount:13826.3}],[],[{status:'paid',cashAmount:11188}],{});
 assert.equal(Math.round(p.balance*100),-571430);
});
test('October cash loan removes cash; pending and rejected loans do not',()=>{
 const loans=[{status:'active',channel:'cash',direction:'lent',amount:40000,repayments:[]},{status:'pending',channel:'cash',direction:'lent',amount:10000}];
 assert.equal(pool(inc(27200),[],[],[],[],[],{},null,moves(loans)).balance,-12800);
});
test('deposits, pending receipts, splits, teacher share and cash repayments',()=>{
 const p=pool([{source:'sunday_collection',totalCollection:10000,childrenOffering:1000,bankTransferAmount:1000}], [{type:'cash_deposit',amount:2000},{type:'cash_deposit',amount:9000,verificationStatus:'pending'},{type:'cash_deposit',amount:1000,destination:'satellite_passthrough'}], [{status:'pending_approval',paymentMethod:'split',cashAmount:500}],[],[],[],{childrenOffering:{local:0.65}},null,moves([{status:'active',direction:'lent',channel:'cash',amount:1000,repayments:[{status:'confirmed',channel:'cash',amount:300}]}]));
 assert.equal(p.balance,5150);
});
test('zero and negative pools stay distinguishable, partial deposit leaves balance',()=>{
 assert.equal(pool(inc(1000),[{type:'cash_deposit',amount:1000}],[],[],[],[],{}).balance,0);
 assert.equal(pool(inc(1000),[{type:'cash_deposit',amount:400}],[],[],[],[],{}).balance,600);
});
