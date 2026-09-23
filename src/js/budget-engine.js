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

function cleanWords(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeCadence(value) {
  return ['usual', 'occasional', 'annual', 'once'].includes(value) ? value : 'usual';
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
  if (date >= nextMonth) return 1;
  const daysInMonth = new Date(parts.year, parts.month, 0).getDate();
  return Math.max(0, Math.min(1, date.getDate() / Math.max(1, daysInMonth)));
}

function normalizeSeriesItem(entry) {
  if (typeof entry === 'number') return { amount: amountOf(entry), notes: '' };
  return { amount: amountOf(entry?.amount), notes: extractNotes(entry).toLowerCase() };
}

function percentile(sortedValues, p) {
  const nums = (Array.isArray(sortedValues) ? sortedValues : [])
    .map(amountOf)
    .filter(value => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!nums.length) return 0;
  const rank = (nums.length - 1) * Math.max(0, Math.min(1, p));
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return nums[lower];
  const frac = rank - lower;
  return nums[lower] + (nums[upper] - nums[lower]) * frac;
}

function monthOfSeriesItem(item) {
  return monthKey(item?.date || item?.createdAt || '');
}

export function robustMonthlySeries(months = [], pick) {
  const selector = typeof pick === 'function' ? pick : () => 0;
  const values = (Array.isArray(months) ? months : []).map((month, index) => {
    const value = amountOf(selector(month, index));
    return {
      key: String(month?.monthKey || ''),
      value: Number.isFinite(value) ? value : 0,
    };
  });
  const positives = values.filter(item => item.value > 0).map(item => item.value);
  const n = positives.length;
  if (!n) {
    return { typical: 0, median: 0, outliers: [], activeMonths: 0, spread: 0, confidence: 'none', months: values };
  }
  const sorted = [...positives].sort((a, b) => a - b);
  const median = percentile(sorted, 0.5);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = Math.max(0, q3 - q1);
  const outlierKeys = new Set();
  if (n >= 3 && iqr > 0) {
    const fence = q3 + (1.5 * iqr);
    for (const item of values) {
      if (item.value > 0 && item.value > fence) outlierKeys.add(item.key);
    }
  }
  const inliers = values.filter(item => item.value > 0 && !outlierKeys.has(item.key)).map(item => item.value);
  const base = inliers.length ? inliers : positives;
  const typical = roundNaira(base.reduce((sum, value) => sum + value, 0) / base.length);
  const spread = median > 0 ? iqr / median : 0;
  const confidence = n >= 4 ? 'high' : n >= 2 ? 'medium' : 'low';
  return {
    typical,
    median: roundNaira(median),
    outliers: values.filter(item => outlierKeys.has(item.key)).map(item => item.key),
    activeMonths: n,
    spread: Math.round(spread * 100) / 100,
    confidence,
    months: values,
  };
}

export function suggestCategoryAmount(months = [], categoryKey) {
  const key = String(categoryKey || 'other').trim() || 'other';
  const list = Array.isArray(months) ? months : [];
  const stats = robustMonthlySeries(list, month => month?.expensesByCategory?.[key] || 0);
  const cadence = classifyCadence(list.map(month => ({
    amount: amountOf(month?.expensesByCategory?.[key] || 0),
    notes: Array.isArray(month?.notes) ? month.notes.join(' ') : '',
  })));
  if (!stats.activeMonths || !stats.typical) {
    return { amount: 0, cadence, typical: 0, outliers: stats.outliers, confidence: stats.confidence };
  }
  const span = list.length || 1;
  let amount;
  if (cadence === 'once') {
    amount = 0;
  } else if (cadence === 'annual') {
    amount = Math.round(stats.typical / 12);
  } else if (cadence === 'occasional') {
    const frequency = stats.activeMonths / span;
    amount = Math.round(stats.typical * Math.max(0.25, Math.min(1, frequency)));
  } else {
    amount = stats.typical;
  }
  return { amount, cadence, typical: stats.typical, outliers: stats.outliers, confidence: stats.confidence };
}

export function budgetStatus(expectedParishIncome, recommendedBudget) {
  const expected = Math.max(0, roundNaira(expectedParishIncome));
  const recommended = Math.max(0, roundNaira(recommendedBudget));
  if (expected <= 0 || recommended > expected) return 'short';
  if (recommended > expected * 0.9) return 'tight';
  return 'enough';
}

export function computeAffordVerdict(expectedIncome, committedSpend, extraAmount = 0) {
  const income = Math.max(0, roundNaira(expectedIncome));
  const committed = Math.max(0, roundNaira(committedSpend));
  const extra = Math.max(0, roundNaira(extraAmount));
  const headroom = income - committed;
  const headroomAfterExtra = headroom - extra;
  const statusLabel = budgetStatus(income, committed);
  let verdict = 'no';
  if (statusLabel === 'short') verdict = 'no';
  else if (headroomAfterExtra < 0) verdict = 'no';
  else if (statusLabel === 'tight') verdict = 'stretch';
  else verdict = 'yes';
  return { income, committed, extra, headroom, headroomAfterExtra, statusLabel, verdict };
}

export function estimateTypicalBudget(categoryHints = [], expectedParishIncome = 0) {
  const expected = Math.max(0, roundNaira(expectedParishIncome));
  const lines = (Array.isArray(categoryHints) ? categoryHints : [])
    .map(hint => ({
      key: String(hint?.key || hint?.expenseCategory || 'other'),
      amount: Math.max(0, roundNaira(hint?.avgAmount ?? hint?.averageAmount ?? 0)),
      cadence: normalizeCadence(hint?.cadence),
    }))
    .filter(line => line.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);
  if (!lines.length) return 0;
  const cushion = Math.max(5000, Math.round(expected * 0.08));
  const fit = applyAffordability(lines, cushion, expected);
  return fit.lines.reduce((sum, line) => sum + line.amount, 0) + fit.cushion;
}

export function rollingAfford({
  monthKeys = [],
  plans = {},
  categoryHints = [],
  expectedParishIncome = 0,
  extraAmount = 0,
} = {}) {
  const keys = (Array.isArray(monthKeys) ? monthKeys : []).filter(Boolean).map(String);
  const perMonth = keys.map(key => {
    const plan = plans && typeof plans === 'object' ? plans[key] : null;
    const hasPlan = !!plan && Number.isFinite(Number(plan.recommendedBudget));
    const committed = hasPlan
      ? roundNaira(plan.recommendedBudget)
      : estimateTypicalBudget(categoryHints, expectedParishIncome);
    return {
      monthKey: key,
      income: roundNaira(expectedParishIncome),
      committed,
      hasPlan,
    };
  });
  const expectedIncome3mo = perMonth.reduce((sum, m) => sum + m.income, 0);
  const committedSpend3mo = perMonth.reduce((sum, m) => sum + m.committed, 0);
  const verdict = computeAffordVerdict(expectedIncome3mo, committedSpend3mo, extraAmount);
  return {
    monthKeys: keys,
    perMonth,
    expectedIncome3mo,
    committedSpend3mo,
    headroom: verdict.headroom,
    headroomAfterExtra: verdict.headroomAfterExtra,
    extraAmount: verdict.extra,
    statusLabel: verdict.statusLabel,
    verdict: verdict.verdict,
  };
}

export function applyAffordability(lines = [], cushion = 0, expectedParishIncome = 0) {
  const expected = Math.max(0, roundNaira(expectedParishIncome));
  const cap = expected > 0 ? Math.round(expected * 0.9) : 0;
  let nextCushion = Math.max(0, roundNaira(cushion));
  let capped = false;
  if (cap > 0 && nextCushion > Math.round(cap * 0.25)) {
    nextCushion = Math.round(cap * 0.25);
    capped = true;
  }
  const adjusted = (Array.isArray(lines) ? lines : [])
    .map(line => ({ ...line, amount: Math.max(0, roundNaira(line?.amount)) }));
  const totalLines = () => adjusted.reduce((total, line) => total + line.amount, 0);
  if (cap > 0 && totalLines() + nextCushion > cap) {
    capped = true;
    for (const line of adjusted) {
      if (line.cadence === 'usual') continue;
      const excess = (totalLines() + nextCushion) - cap;
      if (excess <= 0) break;
      const cut = Math.min(excess, line.amount - Math.round(line.amount * 0.75));
      if (cut > 0) line.amount -= cut;
    }
    if (totalLines() + nextCushion > cap) {
      const available = Math.max(0, cap - nextCushion);
      const total = totalLines();
      if (total > 0) {
        let allocated = 0;
        adjusted.forEach((line, index) => {
          if (index === adjusted.length - 1) {
            line.amount = Math.max(0, available - allocated);
          } else {
            line.amount = Math.max(0, Math.floor((line.amount / total) * available));
            allocated += line.amount;
          }
        });
      }
    }
  }
  return {
    lines: adjusted.filter(line => line.amount > 0),
    cushion: nextCushion,
    capped,
    cap,
  };
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
  return elapsedPctForMonth(now || new Date(), key);
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

export function noteFingerprint(text) {
  const cleaned = cleanWords(text);
  if (!cleaned) return 'general';
  if (/\b(diesel|ago|generator fuel|gen fuel)\b/.test(cleaned)) return 'diesel';
  if (/\b(nepa|electric|electricity|token|disco|ikeja|ekedc|aedc|light bill)\b/.test(cleaned)) return 'nepa';
  return cleaned;
}

export function prettyNoteLabel(text) {
  const cleaned = cleanWords(text);
  if (!cleaned) return 'General';
  const titled = cleaned
    .split(' ')
    .slice(0, 6)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return titled || 'General';
}

export function groupExpensesByNote(expenses = []) {
  const grouped = new Map();
  for (const expense of (Array.isArray(expenses) ? expenses : [])) {
    if (isRemittanceExpenseLike(expense)) continue;
    const amount = roundNaira(expense?.amount);
    if (!amount) continue;
    const rawNote = extractNotes(expense);
    const fingerprint = noteFingerprint(rawNote);
    if (!grouped.has(fingerprint)) {
      grouped.set(fingerprint, {
        fingerprint,
        label: prettyNoteLabel(rawNote),
        amount: 0,
        series: [],
      });
    }
    const bucket = grouped.get(fingerprint);
    if (bucket.label === 'General' && rawNote) bucket.label = prettyNoteLabel(rawNote);
    bucket.amount += amount;
    bucket.series.push({ amount, notes: rawNote });
  }
  return [...grouped.values()]
    .map(item => ({
      fingerprint: item.fingerprint,
      label: item.label,
      amount: roundNaira(item.amount),
      cadence: classifyCadence(item.series),
    }))
    .sort((a, b) => (b.amount - a.amount) || a.label.localeCompare(b.label));
}

function splitBudgetAcrossSubs(totalBudget, weights) {
  const total = Math.max(0, roundNaira(totalBudget));
  if (!weights.length) return [];
  const positiveWeights = weights.map(weight => Math.max(0, amountOf(weight)));
  const denom = positiveWeights.reduce((sum, value) => sum + value, 0);
  if (!denom) {
    const equal = Math.floor(total / weights.length);
    let leftover = total - (equal * weights.length);
    return weights.map(() => {
      const plus = leftover > 0 ? 1 : 0;
      if (leftover > 0) leftover -= 1;
      return equal + plus;
    });
  }
  const draft = positiveWeights.map(weight => (total * weight) / denom);
  const base = draft.map(Math.floor);
  let remainder = total - base.reduce((sum, value) => sum + value, 0);
  const order = draft
    .map((value, index) => ({ index, frac: value - base[index] }))
    .sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < order.length && remainder > 0; i++, remainder--) {
    base[order[i].index] += 1;
  }
  return base;
}

export function suggestSubsForCategory(category, expenses = [], categoryBudget = 0) {
  const categoryKey = String(category?.expenseCategory || category?.key || category || 'other').trim() || 'other';
  const categoryExpenses = (Array.isArray(expenses) ? expenses : [])
    .filter(expense => String(expense?.category || 'other').trim() === categoryKey);
  const grouped = groupExpensesByNote(categoryExpenses);
  if (grouped.length <= 1) return [];
  const top = grouped.length > 4
    ? [
        ...grouped.slice(0, 3),
        {
          fingerprint: 'other_notes',
          label: 'Other Notes',
          amount: grouped.slice(3).reduce((sum, item) => sum + amountOf(item.amount), 0),
          cadence: 'occasional',
        },
      ]
    : grouped.slice(0, 4);
  const split = splitBudgetAcrossSubs(categoryBudget, top.map(item => item.amount));
  return top.map((item, index) => ({
    fingerprint: item.fingerprint,
    label: item.label,
    amount: roundNaira(split[index] ?? 0),
    cadence: normalizeCadence(item.cadence),
  }));
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
      expensesByNote: groupExpensesByNote(monthExpenses),
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
  const elapsed = elapsedPctForMonth(now, plan?.monthKey || monthKey(now));
  const lines = (plan?.lines || []).map(line => {
    const budgeted = roundNaira(line?.amount);
    const categoryKey = String(line?.expenseCategory || line?.key || 'other');
    const spent = roundNaira(byCategory[categoryKey] || 0);
    const leftover = budgeted - spent;
    const pctRatio = budgeted > 0 ? (spent / budgeted) : (spent > 0 ? 1 : 0);
    const pct = Math.round(pctRatio * 100);
    let pace = 'on_track';
    if (spent > budgeted) pace = 'over';
    else if (pctRatio > elapsed + 0.15) pace = 'hot';
    else if (pctRatio > elapsed + 0.05) pace = 'watch';
    const lineExpenses = (Array.isArray(expenses) ? expenses : [])
      .filter(expense => String(expense?.category || 'other') === categoryKey);
    const baseSubs = Array.isArray(line?.subs) && line.subs.length
      ? line.subs.map(sub => ({
          fingerprint: noteFingerprint(sub?.fingerprint || sub?.label || ''),
          label: String(sub?.label || prettyNoteLabel(sub?.fingerprint || 'General')),
          amount: Math.max(0, roundNaira(sub?.amount)),
          cadence: normalizeCadence(sub?.cadence),
        })).filter(sub => sub.amount > 0)
      : suggestSubsForCategory(line, lineExpenses, budgeted);
    const spentByFingerprint = Object.fromEntries(
      groupExpensesByNote(lineExpenses).map(item => [item.fingerprint, item.amount])
    );
    const subs = baseSubs.map(sub => {
      const budgetedSub = Math.max(0, roundNaira(sub.amount));
      const spentSub = roundNaira(spentByFingerprint[sub.fingerprint] || 0);
      return {
        fingerprint: sub.fingerprint,
        label: sub.label,
        cadence: sub.cadence,
        budgeted: budgetedSub,
        spent: spentSub,
        leftover: budgetedSub - spentSub,
      };
    });
    return { ...line, budgeted, spent, leftover, pct, pace, subs };
  });
  const budgetedTotal = roundNaira((plan?.lines || []).reduce((sum, line) => sum + amountOf(line?.amount), 0) + amountOf(plan?.cushion));
  const leftTotal = budgetedTotal - total;
  return {
    lines,
    spentTotal: total,
    budgetedTotal,
    leftTotal,
    elapsed,
    elapsedPct: Math.round(elapsed * 100),
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
        cadence: normalizeCadence(line?.cadence),
        why: String(line?.why || ''),
        expenseCategory: String(line?.expenseCategory || line?.key || 'other'),
        subs: Array.isArray(line?.subs)
          ? line.subs.map(sub => ({
              fingerprint: noteFingerprint(sub?.fingerprint || sub?.label || ''),
              label: String(sub?.label || prettyNoteLabel(sub?.fingerprint || 'General')),
              amount: Math.max(0, roundNaira(sub?.amount)),
              cadence: normalizeCadence(sub?.cadence),
            })).filter(sub => sub.amount > 0)
          : [],
      })).filter(line => line.amount > 0)
    : [];
  for (const line of lines) {
    if (!line.subs.length) {
      line.subs = suggestSubsForCategory(line, pack?.allExpenses || [], line.amount);
    }
  }
  const cushion = Math.max(0, roundNaira(raw?.cushion));
  const recommendedBudget = lines.reduce((sum, line) => sum + line.amount, 0) + cushion;
  const expectedGrossIncome = roundNaira(pack?.expectedGrossIncome ?? raw?.expectedGrossIncome ?? 0);
  const expectedRemittance = roundNaira(pack?.expectedRemittance ?? raw?.expectedRemittance ?? 0);
  const expectedParishIncome = roundNaira(pack?.expectedParishIncome ?? raw?.expectedParishIncome ?? 0);
  let statusLabel = String(raw?.statusLabel || '').trim();
  if (!['enough', 'tight', 'short'].includes(statusLabel)) {
    statusLabel = budgetStatus(expectedParishIncome, recommendedBudget);
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
  noteFingerprint,
  prettyNoteLabel,
  groupExpensesByNote,
  suggestSubsForCategory,
  matchActuals,
  safeToSpend,
  coercePlan,
  robustMonthlySeries,
  suggestCategoryAmount,
  applyAffordability,
  budgetStatus,
  computeAffordVerdict,
  estimateTypicalBudget,
  rollingAfford,
};

if (typeof window !== 'undefined') window.BudgetEngine = api;

export default api;
