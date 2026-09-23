/**
 * Parish monthly budget helpers.
 * Remittance is treated as cost-of-collections (COGS), never as an operating expense.
 * Children's department cash and satellite pass-through are not parish spendable income.
 */

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  const str = String(value || '').trim();
  if (/^\d{4}-\d{2}$/.test(str)) return new Date(`${str}-01T12:00:00`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(`${str}T12:00:00`);
  return new Date(value || Date.now());
}

function toMonthParts(value) {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return null;
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function amountOf(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function roundNaira(value) {
  return Math.round(amountOf(value));
}

function addMonths(key, offset) {
  const parts = toMonthParts(key);
  if (!parts) return '';
  const date = new Date(parts.year, parts.month - 1 + offset, 1);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function extractNotes(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return [
    entry.notes,
    entry.note,
    entry.description,
    entry.subCategory,
    entry.label,
    entry.source,
  ].filter(Boolean).join(' ').trim();
}

const ONCE_NOTE_RE = /\b(one[-\s]?off|emergency|urgent|roof|harvest|medical|burial|funeral|crusade special)\b/i;

function isRemittanceExpenseLike(expense) {
  if (!expense || typeof expense !== 'object') return false;
  if (expense.remittanceId || expense.remittanceRef) return true;
  const text = extractNotes(expense);
  return /\b(remittance|hq share|headquarters|thanksgiving share|quota|seed offering|province remittance)\b/i.test(text);
}

function totalRemittanceDue(remCalc) {
  if (typeof remCalc === 'number') return roundNaira(remCalc);
  if (!remCalc || typeof remCalc !== 'object') return 0;
  if (Number.isFinite(remCalc.totalDue)) return roundNaira(remCalc.totalDue);
  if (Number.isFinite(remCalc.amount)) return roundNaira(remCalc.amount);
  return roundNaira(
    amountOf(remCalc.totalNatl)
    + amountOf(remCalc.totalArea)
    + amountOf(remCalc.totalPastor)
    + amountOf(remCalc.totalMinisters)
    + amountOf(remCalc.totalSeed)
    + amountOf(remCalc.provinceRebate)
    + amountOf(remCalc.crmAddon)
    + amountOf(remCalc.coastline)
    + amountOf(remCalc.insuranceGen)
    + amountOf(remCalc.insuranceMin)
    + amountOf(remCalc.quotas)
  );
}

function ownIncomeAmount(record) {
  if (!record || typeof record !== 'object') return 0;
  const source = String(record.source || '').trim();
  if (!source || source === 'sunday_collection') {
    const total = amountOf(record.totalCollection);
    if (total > 0) return Math.max(0, total - amountOf(record.childrenOffering));
  }
  if (source.includes('satellite')) return 0;
  return amountOf(record.amount);
}

function elapsedPctForMonth(now, key) {
  const parts = toMonthParts(key);
  if (!parts) return 0;
  const date = now instanceof Date ? new Date(now.getTime()) : toDate(now);
  const monthStart = new Date(parts.year, parts.month - 1, 1);
  const nextMonth = new Date(parts.year, parts.month, 1);
  if (date <= monthStart) return 0;
  if (date >= nextMonth) return 100;
  const daysInMonth = new Date(parts.year, parts.month, 0).getDate();
  return Math.max(0, Math.min(100, (date.getDate() / Math.max(1, daysInMonth)) * 100));
}

function normalizeSeriesItem(entry) {
  if (typeof entry === 'number') return { amount: amountOf(entry), notes: '' };
  return { amount: amountOf(entry?.amount), notes: extractNotes(entry).toLowerCase() };
}

export function monthKey(date) {
  const parts = toMonthParts(date);
  if (!parts) return '';
  return `${parts.year}-${pad2(parts.month)}`;
}

export function nextMonthKey(fromKey) {
  return addMonths(fromKey || monthKey(new Date()), 1);
}

export function monthElapsedPct(now, key) {
  return elapsedPctForMonth(now || new Date(), key) / 100;
}

export function classifyCadence(series = []) {
  const normalized = Array.isArray(series) ? series.map(normalizeSeriesItem) : [];
  const active = normalized.filter(item => item.amount > 0);
  const hasOnceNote = active.some(item => ONCE_NOTE_RE.test(item.notes));
  if (!active.length) return 'occasional';
  if (hasOnceNote && active.length <= 2) return 'once';
  if (normalized.length >= 11 && active.length <= 2) return active.length === 1 ? 'annual' : 'occasional';
  if (active.length >= Math.max(4, Math.ceil(normalized.length * 0.66))) return 'usual';
  if (active.length === 1) return 'once';
  return 'occasional';
}

export function parishIncomeFromRemittance(remCalc, grossIncome, childrenDept = 0) {
  const remittance = totalRemittanceDue(remCalc);
  const parishIncome = roundNaira(amountOf(grossIncome) - remittance - amountOf(childrenDept));
  return {
    remittance,
    parishIncome,
  };
}

export function sumExpensesByCategory(expenses = []) {
  const byCategory = {};
  let total = 0;
  for (const expense of expenses) {
    if (isRemittanceExpenseLike(expense)) continue;
    const amount = roundNaira(expense?.amount);
    if (!amount) continue;
    const key = String(expense?.category || 'other').trim() || 'other';
    byCategory[key] = (byCategory[key] || 0) + amount;
    total += amount;
  }
  return { byCategory, total: roundNaira(total) };
}

export function packHistory({ incomeRecords = [], expenses = [], remittanceCalcsByMonth = {}, months = 6 } = {}) {
  const keys = new Set(Object.keys(remittanceCalcsByMonth || {}).filter(key => /^\d{4}-\d{2}$/.test(key)));
  for (const record of incomeRecords) {
    const key = monthKey(record?.date || record?.createdAt || '');
    if (key) keys.add(key);
  }
  for (const expense of expenses) {
    const key = monthKey(expense?.date || expense?.createdAt || '');
    if (key) keys.add(key);
  }
  const latest = [...keys].sort().slice(-1)[0] || monthKey(new Date());
  const monthCount = Math.max(1, Number(months || 6));
  const orderedKeys = [];
  for (let index = monthCount - 1; index >= 0; index--) orderedKeys.push(addMonths(latest, -index));
  const byMonth = {};
  for (const key of orderedKeys) {
    const monthIncome = incomeRecords.filter(record => monthKey(record?.date || record?.createdAt || key) === key);
    const monthExpenses = expenses.filter(expense => monthKey(expense?.date || expense?.createdAt || key) === key);
    const grossIncome = roundNaira(monthIncome.reduce((sum, record) => sum + ownIncomeAmount(record), 0));
    const remittanceDue = totalRemittanceDue(remittanceCalcsByMonth?.[key]);
    const parishIncomeAfterRemittance = Math.max(0, grossIncome - remittanceDue);
    const { byCategory: expensesByCategory } = sumExpensesByCategory(monthExpenses);
    const notes = [
      ...monthIncome.map(extractNotes),
      ...monthExpenses.map(extractNotes),
    ].map(text => text.trim()).filter(Boolean).slice(0, 6);
    byMonth[key] = {
      monthKey: key,
      grossIncome,
      remittanceDue,
      parishIncomeAfterRemittance,
      expensesByCategory,
      notes,
    };
  }
  return {
    months: orderedKeys.map(key => byMonth[key]),
    byMonth,
  };
}

export function matchActuals(plan, expenses = [], now = new Date()) {
  const { byCategory, total } = sumExpensesByCategory(expenses);
  const elapsedPct = elapsedPctForMonth(now, plan?.monthKey || monthKey(now));
  const lines = (plan?.lines || []).map(line => {
    const budgeted = roundNaira(line?.amount);
    const spent = roundNaira(byCategory[String(line?.expenseCategory || line?.key || 'other')] || 0);
    const leftover = budgeted - spent;
    const pct = budgeted > 0 ? Math.round((spent / budgeted) * 100) : (spent > 0 ? 100 : 0);
    let pace = 'on_track';
    if (spent > budgeted) pace = 'over';
    else if (pct > elapsedPct + 15) pace = 'hot';
    else if (pct > elapsedPct + 5) pace = 'watch';
    return { ...line, budgeted, spent, leftover, pct, pace };
  });
  const budgetedTotal = roundNaira((plan?.lines || []).reduce((sum, line) => sum + amountOf(line?.amount), 0) + amountOf(plan?.cushion));
  const leftTotal = budgetedTotal - total;
  return {
    lines,
    spentTotal: total,
    budgetedTotal,
    leftTotal,
    elapsed: Math.round(elapsedPct) / 100,
    elapsedPct: Math.round(elapsedPct),
    totals: {
      spent: total,
      budgeted: budgetedTotal,
      leftover: leftTotal,
      pct: budgetedTotal > 0 ? Math.round((total / budgetedTotal) * 100) : 0,
    },
  };
}

export function safeToSpend(plan, spentOperating, extraAmount = 0) {
  const budget = roundNaira(plan?.recommendedBudget);
  const spent = roundNaira(spentOperating);
  const extra = Math.max(0, roundNaira(extraAmount));
  const leftoverAfterBudget = budget - spent;
  const safeExtra = plan?.statusLabel === 'short' ? 0 : Math.max(0, leftoverAfterBudget);
  const leftoverAfterExtra = leftoverAfterBudget - extra;
  let verdict = 'no';
  if (plan?.statusLabel === 'short') verdict = 'no';
  else if (leftoverAfterExtra < 0) verdict = 'no';
  else if (plan?.statusLabel === 'tight') verdict = 'stretch';
  else verdict = 'yes';
  return {
    leftoverAfterBudget,
    leftoverAfterExtra,
    safeExtra,
    verdict,
  };
}

export function coercePlan(raw, pack) {
  const lines = Array.isArray(raw?.lines)
    ? raw.lines.map(line => ({
        key: String(line?.key || line?.expenseCategory || 'other'),
        label: String(line?.label || line?.key || 'Item'),
        amount: Math.max(0, roundNaira(line?.amount)),
        cadence: ['usual', 'occasional', 'annual', 'once'].includes(line?.cadence) ? line.cadence : 'usual',
        why: String(line?.why || ''),
        expenseCategory: String(line?.expenseCategory || line?.key || 'other'),
      })).filter(line => line.amount > 0)
    : [];
  const cushion = Math.max(0, roundNaira(raw?.cushion));
  const recommendedBudget = lines.reduce((sum, line) => sum + line.amount, 0) + cushion;
  const expectedGrossIncome = roundNaira(pack?.expectedGrossIncome ?? raw?.expectedGrossIncome ?? 0);
  const expectedRemittance = roundNaira(pack?.expectedRemittance ?? raw?.expectedRemittance ?? 0);
  const expectedParishIncome = roundNaira(pack?.expectedParishIncome ?? raw?.expectedParishIncome ?? 0);
  let statusLabel = String(raw?.statusLabel || '').trim();
  if (!['enough', 'tight', 'short'].includes(statusLabel)) {
    if (expectedParishIncome <= 0 || recommendedBudget > expectedParishIncome) statusLabel = 'short';
    else if (recommendedBudget > expectedParishIncome * 0.9) statusLabel = 'tight';
    else statusLabel = 'enough';
  }
  return {
    monthKey: String(raw?.monthKey || pack?.monthKey || ''),
    status: raw?.status === 'accepted' ? 'accepted' : 'draft',
    createdAt: raw?.createdAt || '',
    acceptedAt: raw?.acceptedAt || '',
    acceptedBy: raw?.acceptedBy || '',
    expectedGrossIncome,
    expectedRemittance,
    expectedParishIncome,
    recommendedBudget,
    statusLabel,
    summary: String(raw?.summary || ''),
    ignored: Array.isArray(raw?.ignored) ? raw.ignored.map(item => String(item)) : [],
    remittanceStrip: {
      label: 'Already spoken for (RCCG remittance)',
      amount: expectedRemittance,
    },
    lines,
    cushion,
    model: String(raw?.model || ''),
    historyMonthsUsed: Math.max(1, roundNaira(raw?.historyMonthsUsed || pack?.historyMonthsUsed || 6)),
    affordLog: Array.isArray(raw?.affordLog) ? raw.affordLog.slice(-10) : [],
  };
}

const api = {
  monthKey,
  nextMonthKey,
  monthElapsedPct,
  classifyCadence,
  parishIncomeFromRemittance,
  sumExpensesByCategory,
  packHistory,
  matchActuals,
  safeToSpend,
  coercePlan,
};

if (typeof window !== 'undefined') window.BudgetEngine = api;

export default api;
