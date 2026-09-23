/**
 * Parish monthly budget helpers.
 * Remittance is treated as cost-of-collections (COGS), never as an operating expense.
 * Children's department cash and satellite pass-through are not parish spendable income.
 */

export function monthKey(date) {
  const d = date instanceof Date ? date : new Date(String(date).slice(0, 10) + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function nextMonthKey(fromKey) {
  const [y, m] = String(fromKey || monthKey(new Date())).split('-').map(Number);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export function monthElapsedPct(now, key) {
  const [y, m] = String(key).split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  const t = now instanceof Date ? now : new Date();
  if (t <= start) return 0;
  if (t >= end) return 1;
  return (t - start) / (end - start);
}

const ONCE_NOTE_RE = /\b(one[-\s]?off|emergency|urgent|roof|harvest|medical|burial|funeral|crusade special)\b/i;

export function classifyCadence(monthlyAmounts, notes = []) {
  const present = monthlyAmounts.filter(v => (v || 0) > 0);
  const noteHit = notes.some(n => ONCE_NOTE_RE.test(String(n || '')));
  if (present.length <= 1) return noteHit ? 'once' : (present.length === 1 ? 'once' : 'occasional');
  if (present.length >= Math.max(4, Math.ceil(monthlyAmounts.length * 0.66))) return 'usual';
  if (present.length === 2 && monthlyAmounts.length >= 11) return 'annual';
  if (noteHit && present.length <= 2) return 'once';
  return 'occasional';
}

export function parishIncomeFromRemittance(remCalc, grossIncome, childrenDept = 0) {
  const remDue = Number(remCalc?.totalNatl || 0)
    + Number(remCalc?.totalArea || 0)
    + Number(remCalc?.totalPastor || 0)
    + Number(remCalc?.totalMinisters || 0)
    + Number(remCalc?.totalSeed || 0)
    + Number(remCalc?.provinceRebate || 0)
    + Number(remCalc?.crmAddon || 0)
    + Number(remCalc?.coastline || 0)
    + Number(remCalc?.insuranceGen || 0)
    + Number(remCalc?.insuranceMin || 0);
  const parish = Number(grossIncome || 0) - remDue - Number(childrenDept || 0);
  return {
    remittance: Math.max(0, Math.round(remDue)),
    parishIncome: Math.round(parish),
  };
}

export function sumExpensesByCategory(expenses) {
  const by = {};
  let total = 0;
  for (const e of expenses || []) {
    const amt = Number(e.amount || 0);
    if (!amt) continue;
    const key = e.category || 'other';
    by[key] = (by[key] || 0) + amt;
    total += amt;
  }
  return { byCategory: by, total: Math.round(total) };
}

export function matchActuals(plan, expenses, now = new Date()) {
  const { byCategory, total } = sumExpensesByCategory(expenses);
  const elapsed = monthElapsedPct(now, plan.monthKey);
  const lines = (plan.lines || []).map(line => {
    const spent = Math.round(byCategory[line.expenseCategory || line.key] || 0);
    const budgeted = Math.round(Number(line.amount || 0));
    const left = budgeted - spent;
    const pct = budgeted > 0 ? spent / budgeted : (spent > 0 ? 2 : 0);
    let pace = 'on_track';
    if (pct >= 1) pace = 'over';
    else if (elapsed > 0.08 && pct > elapsed + 0.15) pace = 'watch';
    return { ...line, budgeted, spent, left, pct, pace };
  });
  const recommended = Math.round(Number(plan.recommendedBudget || 0));
  return {
    lines,
    spentTotal: total,
    budgetedTotal: recommended,
    leftTotal: recommended - total,
    elapsed,
  };
}

export function safeToSpend(plan, spentOperating, extraAmount = 0) {
  const budget = Math.round(Number(plan.recommendedBudget || 0));
  const spent = Math.round(Number(spentOperating || 0));
  const extra = Math.max(0, Math.round(Number(extraAmount || 0)));
  const leftover = budget - spent;
  const afterExtra = leftover - extra;
  const short = plan.statusLabel === 'short';
  let verdict = 'yes';
  if (short || leftover <= 0) verdict = extra > 0 ? 'no' : 'no';
  else if (afterExtra < 0) verdict = 'no';
  else if (afterExtra < leftover * 0.15 && extra > leftover * 0.5) verdict = 'stretch';
  const safeExtra = short ? 0 : Math.max(0, leftover);
  return {
    leftoverAfterBudget: leftover,
    leftoverAfterExtra: afterExtra,
    safeExtra,
    verdict: extra === 0 ? (safeExtra > 0 ? 'yes' : 'no') : verdict,
  };
}

export function coercePlan(raw, pack) {
  const lines = Array.isArray(raw?.lines) ? raw.lines.map(l => ({
    key: String(l.key || l.expenseCategory || 'other'),
    label: String(l.label || l.key || 'Item'),
    amount: Math.max(0, Math.round(Number(l.amount || 0))),
    cadence: ['usual', 'occasional', 'annual', 'once'].includes(l.cadence) ? l.cadence : 'usual',
    why: String(l.why || ''),
    expenseCategory: String(l.expenseCategory || l.key || 'other'),
  })).filter(l => l.amount > 0) : [];
  const cushion = Math.max(0, Math.round(Number(raw?.cushion || 0)));
  const lineSum = lines.reduce((s, l) => s + l.amount, 0) + cushion;
  const parish = Math.round(Number(pack?.expectedParishIncome ?? raw?.expectedParishIncome ?? 0));
  const remittance = Math.round(Number(pack?.expectedRemittance ?? raw?.expectedRemittance ?? 0));
  const recommendedBudget = lineSum;
  let statusLabel = raw?.statusLabel;
  if (!['enough', 'tight', 'short'].includes(statusLabel)) {
    if (parish <= 0) statusLabel = 'short';
    else if (recommendedBudget > parish * 0.95) statusLabel = recommendedBudget > parish ? 'short' : 'tight';
    else statusLabel = 'enough';
  }
  return {
    monthKey: String(raw?.monthKey || pack?.monthKey || ''),
    status: raw?.status === 'accepted' ? 'accepted' : 'draft',
    expectedGrossIncome: Math.round(Number(pack?.expectedGrossIncome ?? raw?.expectedGrossIncome ?? 0)),
    expectedRemittance: remittance,
    expectedParishIncome: parish,
    recommendedBudget,
    cushion,
    statusLabel,
    summary: String(raw?.summary || ''),
    ignored: Array.isArray(raw?.ignored) ? raw.ignored.map(String) : [],
    remittanceStrip: {
      label: 'Already spoken for (RCCG remittance)',
      amount: remittance,
    },
    lines,
  };
}

const api = {
  monthKey, nextMonthKey, monthElapsedPct, classifyCadence,
  parishIncomeFromRemittance, sumExpensesByCategory, matchActuals,
  safeToSpend, coercePlan,
};

if (typeof window !== 'undefined') window.BudgetEngine = api;

export default api;
