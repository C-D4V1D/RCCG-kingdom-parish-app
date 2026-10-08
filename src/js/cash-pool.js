// One cash-pool calculation shared by the app and its read-only automation endpoint.
const childrenRate = rates => typeof rates?.childrenOffering?.local === 'number' && Number.isFinite(rates.childrenOffering.local) && rates.childrenOffering.local >= 0 ? rates.childrenOffering.local : 0.65;
function getIncomeCashWithAccountant(r, rates){
  const teacher = (!r.source || r.source === 'sunday_collection') ? Math.max(0, Number(r.childrenOffering || 0) * childrenRate(rates)) : 0;
  return Math.max(0, Number(r.totalCollection || 0) - Number(r.bankTransferAmount || 0) - Number(r.directPettyCash || 0) - teacher);
}
function isDepositEffective(t){return !['pending','flagged','deleted'].includes(t.verificationStatus || '');}
function isLoggedExpense(e){return !!e && ['approved','pending','pending_approval'].includes(e.status);}
function splitRemittancePaid(r){
  if(r.bankAmount != null || r.cashAmount != null) return {bank:r.bankAmount || 0,cash:r.cashAmount || 0};
  return r.paymentMethod === 'cash' ? {bank:0,cash:r.amount || 0} : {bank:r.amount || 0,cash:0};
}
const sumLoanMoves=(moves,dir)=>moves.filter(m=>m.dir===dir).reduce((s,m)=>s+(m.amount||0),0);

export function accountantLoanCashMovements(loans){
  const moves = [];
  for(const l of (Array.isArray(loans) ? loans : [])){
    if(!l || (l.status !== 'active' && l.status !== 'settled')) continue;
    const lent = l.direction === 'lent';
    if((l.channel || 'cash') === 'cash'){
      moves.push({ date: l.date, amount: l.amount||0, dir: lent ? 'out' : 'in', label: lent ? `Loan to ${l.person}` : `Loan from ${l.person}` });
    }
    for(const r of (l.repayments || [])){
      if(r.status === 'confirmed' && (r.channel || 'cash') === 'cash'){
        moves.push({ date: r.date, amount: r.amount||0, dir: lent ? 'in' : 'out', label: lent ? `Repayment from ${l.person}` : `Repayment to ${l.person}` });
      }
    }
  }
  return moves;
}
export function computeAccountantCashPool(income, cashTx, expenses, pettyHistory, satelliteFunds, remittances, remRates, asOfDate, loanMoves){
  const recDate = r => String(r?.date || r?.dateNeeded || r?.createdAt || '').slice(0,10);
  const onOrBefore = r => !asOfDate || (function(){ const d=recDate(r); return !d || d <= asOfDate; })();
  const paidOnOrBefore = r => !asOfDate || (function(){ const d=String(r?.paidDate || r?.createdAt || '').slice(0,10); return !d || d <= asOfDate; })();

  const inc   = (income||[]).filter(onOrBefore);
  const cashF = (cashTx||[]).filter(onOrBefore);
  const expF  = (expenses||[]).filter(onOrBefore);
  const pettyF= (pettyHistory||[]).filter(onOrBefore);
  const satF  = (satelliteFunds||[]).filter(onOrBefore);
  const remF  = (remittances||[]).filter(r => r.status === 'paid' && paidOnOrBefore(r));

  // --- money INTO the accountant's cash ---
  const cashFromCollections = inc.reduce((s,r) => s + getIncomeCashWithAccountant(r, remRates), 0);
  const bankToAccountant    = cashF.filter(t=>t.type==='withdrawal' && t.destination==='accountant_cash').reduce((s,t)=>s+(t.amount||0),0);
  const satelliteCashIn     = satF.filter(s=>s.direction==='in' && s.channel==='cash').reduce((s,r)=>s+(r.amount||0),0);
  const moves = (loanMoves || []).filter(m => !asOfDate || !m.date || String(m.date).slice(0,10) <= asOfDate);
  const loanCashIn = sumLoanMoves(moves, 'in');
  const totalIn = cashFromCollections + bankToAccountant + satelliteCashIn + loanCashIn;

  // --- money OUT of the accountant's cash ---
  const cashDeposited  = cashF.filter(t=>t.type==='cash_deposit'&&isDepositEffective(t)&&t.destination!=='satellite_passthrough').reduce((s,t)=>s+(t.amount||0),0);
  const cashExpenses   = expF.filter(isLoggedExpense).reduce((s,e)=>{
    if(e.paymentMethod==='cash') return s+(e.amount||0);
    if(e.paymentMethod==='split') return s+(e.cashAmount||0);
    return s;
  },0);
  const pettyCashTopups= pettyF.filter(h=>h.type==='refill'&&(h.status==='approved'||h.status==='settled')&&(h.paymentMethod==='cash_accountant'||(h.paymentMethod==='split'&&(h.cashAmount||0)>0)))
    .reduce((s,h)=>s+(h.paymentMethod==='split'?(h.cashAmount||0):(h.amount||0)),0);
  const remittancesCash= remF.reduce((s,r)=>s+splitRemittancePaid(r).cash, 0);
  const poolPayoutsCash= satF.filter(s=>s.direction==='out' && s.channel==='cash_accountant').reduce((s,r)=>s+(r.amount||0),0);
  const loanCashOut = sumLoanMoves(moves, 'out');
  const totalOut = cashDeposited + cashExpenses + pettyCashTopups + remittancesCash + poolPayoutsCash + loanCashOut;

  return {
    cashFromCollections, bankToAccountant, satelliteCashIn, loanCashIn, totalIn,
    cashDeposited, cashExpenses, pettyCashTopups, remittancesCash, poolPayoutsCash, loanCashOut, totalOut,
    balance: totalIn - totalOut
  };
}

