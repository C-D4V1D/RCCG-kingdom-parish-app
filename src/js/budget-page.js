/**
 * Monthly Budget page — mounts onto the existing finance App.
 */
import * as Engine from './budget-engine.js';

if (typeof window !== 'undefined') window.BudgetEngine = Engine;

const BUDGET_ROLES = ['it_admin', 'pastor', 'accountant', 'admin_officer', 'signatory'];
const N = n => '₦' + Math.round(Number(n || 0)).toLocaleString('en-NG');
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function prettyMonth(key) {
  const [y, m] = String(key || '').split('-').map(Number);
  if (!y || !m) return key || '';
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
function currentKey() { return Engine.monthKey(new Date()); }
function installAccess() {
  const rules = window.App && App._ACCESS_RULES;
  if (rules && rules.pages) rules.pages.budget = { roles: BUDGET_ROLES };
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&','<':'<','>':'>','"':'"',"'":'&#39;'}[c]));
}

const ui = {
  tab: 'this',
  monthThis: currentKey(),
  monthNext: Engine.nextMonthKey(currentKey()),
  planThis: null, planNext: null, actuals: null, afford: null,
  busy: false, affordIdea: '', affordAmt: '',
};

function monthInput(id, value) {
  return `<input type="month" id="${id}" value="${esc(value)}" class="form-input" style="width:auto;padding:8px 10px;min-height:44px" onchange="BudgetPage.onMonth('${id}',this.value)">`;
}
function remStrip(plan) {
  const amt = plan?.remittanceStrip?.amount ?? plan?.expectedRemittance ?? 0;
  return `<div class="budget-cogs"><div><strong>Already spoken for</strong><div class="muted">RCCG remittance — not a parish expense. Budget is built on what is left after this.</div></div><div class="budget-cogs-amt">${N(amt)}</div></div>`;
}
function statusPill(label) {
  const map = { enough: ['Enough','ok'], tight: ['Tight','warn'], short: ['Short','bad'] };
  const [t,k] = map[label] || ['—','warn'];
  return `<span class="budget-pill ${k}">${t}</span>`;
}
function paceChip(pace) {
  if (pace === 'over') return `<span class="budget-pill bad">Over</span>`;
  if (pace === 'watch') return `<span class="budget-pill warn">Watch</span>`;
  return `<span class="budget-pill ok">On track</span>`;
}
function bar(pct, tone) {
  const w = Math.max(0, Math.min(100, Math.round((pct || 0) * 100)));
  return `<div class="budget-bar"><i class="${tone || ''}" style="width:${w}%"></i></div>`;
}
async function api(path, method='GET', body=null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== null) opts.body = JSON.stringify(body);
  const res = await fetch('/api/' + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || ('HTTP ' + res.status));
  return data;
}
async function loadPlan(monthKey) {
  const s = await api('settings');
  return (s.monthlyBudgets || {})[monthKey] || null;
}
async function savePlan(plan) {
  const s = await api('settings');
  const all = { ...(s.monthlyBudgets || {}) };
  all[plan.monthKey] = plan;
  await api('settings', 'POST', { monthlyBudgets: all });
}
async function monthExpenses(monthKey) {
  const expenses = await api('expenses');
  const list = Array.isArray(expenses) ? expenses : (expenses.results || expenses.expenses || []);
  return list.filter(e => {
    const st = String(e.status || '');
    if (st && st !== 'approved' && st !== 'pending_approval' && st !== 'pending') return false;
    return Engine.monthKey(e.date || e.createdAt) === monthKey;
  });
}
function heroCards(plan) {
  return `<div class="budget-hero"><div class="budget-hero-card"><div class="lbl">Parish income after remittance</div><div class="num">${N(plan.expectedParishIncome)}</div></div><div class="budget-hero-card accent"><div class="lbl">Recommended budget</div><div class="num">${N(plan.recommendedBudget)}</div></div><div class="budget-hero-card"><div class="lbl">Status</div><div class="num" style="font-size:22px">${statusPill(plan.statusLabel)}</div></div></div>`;
}
function lineList(plan, actuals) {
  const rows = (actuals?.lines || plan.lines || []).map(l => {
    const budgeted = l.budgeted ?? l.amount;
    const spent = l.spent;
    const showLive = spent != null;
    const tone = l.pace === 'over' ? 'bad' : l.pace === 'watch' ? 'warn' : '';
    return `<div class="budget-line" ${showLive ? `onclick="BudgetPage.toggleLine('${esc(l.key)}')"` : ''}><div class="budget-line-top"><div><strong>${esc(l.label)}</strong><div class="muted">${esc(l.cadence || 'usual')}${l.why ? ' · ' + esc(l.why) : ''}</div></div><div class="budget-line-amt">${showLive ? `${N(spent)} <span class="muted">of</span> ${N(budgeted)}` : N(budgeted)} ${showLive ? paceChip(l.pace) : ''}</div></div>${showLive ? bar(l.pct, tone) : ''}${showLive ? `<div class="muted" style="margin-top:4px">${l.left >= 0 ? N(l.left) + ' left' : N(Math.abs(l.left)) + ' over'}</div>` : ''}<div class="budget-line-exp" id="bline-${esc(l.key)}" hidden></div></div>`;
  }).join('');
  return `<div class="budget-lines">${rows || '<div class="muted">No lines yet.</div>'}</div>`;
}
function thisMonthView() {
  const plan = ui.planThis;
  if (!plan) {
    return `<div class="card budget-empty"><h3>No plan for ${prettyMonth(ui.monthThis)} yet</h3><p>Open <strong>Next month</strong>, generate a plan, and accept it.</p><button class="btn btn-primary" style="min-height:44px" onclick="BudgetPage.setTab('next')">Plan next month</button></div>`;
  }
  const a = ui.actuals;
  const used = a?.spentTotal || 0;
  const left = (plan.recommendedBudget || 0) - used;
  const pct = plan.recommendedBudget ? used / plan.recommendedBudget : 0;
  const safe = Engine.safeToSpend(plan, used, 0);
  return `${heroCards(plan)}${remStrip(plan)}<div class="card" style="margin-bottom:12px"><div class="budget-score"><div><span class="muted">Budget</span><strong>${N(plan.recommendedBudget)}</strong></div><div><span class="muted">Used</span><strong>${N(used)}</strong></div><div><span class="muted">Left</span><strong>${N(left)}</strong></div></div>${bar(pct, left < 0 ? 'bad' : pct > 0.85 ? 'warn' : '')}</div>${lineList(plan, a)}<div class="card budget-afford"><h3>Can we afford something new?</h3><p class="muted">Safe extra this month: <strong>${N(safe.safeExtra)}</strong></p><div class="budget-afford-row"><input class="form-input" placeholder="e.g. extra chairs" id="budgetIdea" value="${esc(ui.affordIdea)}" style="min-height:44px"><input class="form-input" type="number" min="0" placeholder="Amount ₦" id="budgetAmt" value="${esc(ui.affordAmt)}" style="min-height:44px;max-width:140px"><button class="btn btn-primary" style="min-height:44px" onclick="BudgetPage.askAfford()">Ask AI</button></div>${ui.afford ? `<div class="budget-answer ${ui.afford.verdict}"><strong>${ui.afford.verdict === 'yes' ? 'Yes' : ui.afford.verdict === 'stretch' ? 'Only if you are careful' : 'Not this month'}</strong><p>${esc(ui.afford.explanation || '')}</p><p>Safe amount: <strong>${N(ui.afford.safeAmount)}</strong></p></div>` : ''}</div>`;
}
function nextMonthView() {
  const plan = ui.planNext;
  return `<div class="card" style="margin-bottom:12px"><p class="muted" style="margin:0 0 10px">AI reads past collections and bills, treats remittance as already spoken for, and suggests one exact budget for ${prettyMonth(ui.monthNext)}.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" style="min-height:44px" onclick="BudgetPage.generate()" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Working…' : 'Generate with AI'}</button>${plan ? `<button class="btn" style="min-height:44px" onclick="BudgetPage.accept()">Accept plan</button>` : ''}</div></div>${plan ? heroCards(plan) + remStrip(plan) + `<div class="card" style="margin-bottom:12px"><p>${esc(plan.summary || '')}</p>${(plan.ignored || []).length ? `<div class="muted">Ignored: ${plan.ignored.map(esc).join(' · ')}</div>` : ''}<div class="muted" style="margin-top:8px">${plan.status === 'accepted' ? 'Accepted' : 'Draft'} · budget ${N(plan.recommendedBudget)}</div></div>${lineList(plan, null)}` : `<div class="card budget-empty"><p>No draft for ${prettyMonth(ui.monthNext)} yet. Tap Generate with AI.</p></div>`}`;
}
function frame(inner) {
  return `<div class="page-header"><div class="page-title">Monthly Budget</div><div class="page-sub">Parish operating money after remittance · Advisor only</div></div><div class="budget-tabs"><button class="${ui.tab === 'this' ? 'on' : ''}" onclick="BudgetPage.setTab('this')">This month</button><button class="${ui.tab === 'next' ? 'on' : ''}" onclick="BudgetPage.setTab('next')">Next month</button>${monthInput(ui.tab === 'this' ? 'budgetMonthThis' : 'budgetMonthNext', ui.tab === 'this' ? ui.monthThis : ui.monthNext)}</div>${inner}`;
}
async function paint() {
  const el = document.getElementById('pageContent');
  if (!el) return;
  const title = document.getElementById('topBarTitle');
  if (title) title.textContent = 'Budget';
  el.innerHTML = frame(ui.tab === 'this' ? thisMonthView() : nextMonthView());
}
async function refresh() {
  if (ui.tab === 'this') {
    ui.planThis = await loadPlan(ui.monthThis);
    ui.actuals = ui.planThis ? Engine.matchActuals(ui.planThis, await monthExpenses(ui.monthThis), new Date()) : null;
  } else {
    ui.planNext = await loadPlan(ui.monthNext);
  }
  await paint();
}
async function packHistory() {
  const [incomeRaw, expensesRaw] = await Promise.all([api('income'), api('expenses')]);
  const income = Array.isArray(incomeRaw) ? incomeRaw : (incomeRaw.results || incomeRaw.income || []);
  const expenses = Array.isArray(expensesRaw) ? expensesRaw : (expensesRaw.results || expensesRaw.expenses || []);
  const months = [];
  let key = currentKey();
  for (let i = 0; i < 6; i++) {
    months.unshift(key);
    const [y, m] = key.split('-').map(Number);
    key = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
  }
  const packMonths = [];
  for (const mk of months) {
    const inc = income.filter(r => Engine.monthKey(r.date || r.sundayDate || r.createdAt) === mk);
    const exp = expenses.filter(r => Engine.monthKey(r.date || r.createdAt) === mk);
    const gross = inc.reduce((s, r) => s + Number(r.total || r.amount || 0), 0);
    let remittance = 0, childrenDept = 0, parishIncome = gross;
    try {
      if (typeof App._calcRemittances === 'function' && inc.length) {
        const merged = {};
        inc.forEach(r => Object.keys(r).forEach(k => { if (typeof r[k] === 'number') merged[k] = (merged[k] || 0) + r[k]; }));
        const rem = await App._calcRemittances(merged);
        childrenDept = Number(rem.childrenDept || 0);
        const peel = Engine.parishIncomeFromRemittance(rem, gross, childrenDept);
        remittance = peel.remittance; parishIncome = peel.parishIncome;
      }
    } catch (_) {}
    const { byCategory, total } = Engine.sumExpensesByCategory(exp);
    packMonths.push({ monthKey: mk, grossIncome: Math.round(gross), remittance, parishIncome, childrenDept, expenseTotal: total, expensesByCategory: byCategory, notes: exp.map(e => e.notes || e.description || e.narration).filter(Boolean).slice(0, 8) });
  }
  const latest = packMonths[packMonths.length - 1] || {};
  return { monthKey: ui.monthNext, months: packMonths, expectedGrossIncome: latest.grossIncome || 0, expectedRemittance: latest.remittance || 0, expectedParishIncome: latest.parishIncome || 0, expenseCategories: App._EXPENSE_CATS || [] };
}

const BudgetPage = {
  setTab(tab) { ui.tab = tab; refresh(); },
  onMonth(id, value) { if (id === 'budgetMonthThis') ui.monthThis = value; else ui.monthNext = value; refresh(); },
  async generate() {
    ui.busy = true; await paint();
    try {
      const pack = await packHistory();
      const res = await fetch('/api/budget', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate', monthKey: ui.monthNext, pack }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || data.message || 'Generate failed');
      const plan = Engine.coercePlan(data.plan || data, pack);
      plan.monthKey = ui.monthNext; plan.status = 'draft'; plan.createdAt = new Date().toISOString();
      await savePlan(plan); ui.planNext = plan;
      if (App.showAlert) App.showAlert('Draft budget ready. Review and accept.', 'success');
    } catch (e) {
      if (App.showAlert) App.showAlert(e.message || String(e), 'danger');
    }
    ui.busy = false; await paint();
  },
  async accept() {
    if (!ui.planNext) return;
    ui.planNext.status = 'accepted'; ui.planNext.acceptedAt = new Date().toISOString();
    await savePlan(ui.planNext);
    if (App.showAlert) App.showAlert('Plan accepted.', 'success');
    await paint();
  },
  async askAfford() {
    const idea = document.getElementById('budgetIdea')?.value || '';
    const amount = Number(document.getElementById('budgetAmt')?.value || 0);
    ui.affordIdea = idea; ui.affordAmt = amount || '';
    if (!ui.planThis) return;
    const spent = ui.actuals?.spentTotal || 0;
    const math = Engine.safeToSpend(ui.planThis, spent, amount);
    let explanation = '';
    try {
      const res = await fetch('/api/budget', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'afford', monthKey: ui.monthThis, idea, amount, plan: ui.planThis, spentOperating: spent, math }) });
      const data = await res.json();
      explanation = data.explanation || '';
    } catch (_) {
      explanation = math.verdict === 'yes' ? 'Yes — that still leaves room inside this month’s operating budget.' : 'That would eat into the usual monthly lines.';
    }
    ui.afford = { verdict: math.verdict, safeAmount: math.safeExtra, explanation };
    await paint();
  },
  async toggleLine(key) {
    const box = document.getElementById('bline-' + key);
    if (!box) return;
    if (!box.hidden && box.innerHTML) { box.hidden = true; return; }
    const ex = await monthExpenses(ui.monthThis);
    box.innerHTML = ex.filter(e => (e.category || '') === key).map(e => `<div class="budget-exp-row"><span>${esc(e.date || '')} · ${esc(e.notes || e.description || '')}</span><strong>${N(e.amount)}</strong></div>`).join('') || '<div class="muted">No expenses in this line yet.</div>';
    box.hidden = false;
  },
  async render() { installAccess(); await refresh(); },
};
window.BudgetPage = BudgetPage;

function injectNav() {
  const side = document.getElementById('sidebarNav');
  if (side && !side.querySelector('[data-page="budget"]')) {
    const item = document.createElement('div');
    item.className = 'nav-item'; item.dataset.page = 'budget';
    item.innerHTML = '<span class="nav-icon">💰</span>Budget';
    item.onclick = () => App.navigate('budget');
    const exp = side.querySelector('[data-page="expenses"]');
    if (exp && exp.parentNode) exp.parentNode.insertBefore(item, exp.nextSibling);
    else side.appendChild(item);
  }
  const bn = document.getElementById('bottomNav');
  if (bn && !bn.querySelector('[data-page="budget"]')) {
    const btn = document.createElement('button');
    btn.className = 'bn-item'; btn.dataset.page = 'budget';
    btn.innerHTML = '<span style="font-size:20px">💰</span>Budget';
    btn.onclick = () => App.navigate('budget');
    bn.querySelector('.bottom-nav-inner')?.appendChild(btn);
  }
}
function wrapNavigate() {
  if (!window.App || App.__budgetWrapped) return;
  installAccess();
  const orig = App.navigate.bind(App);
  App.navigate = async function(page, fromHistory) {
    installAccess();
    await orig(page, fromHistory);
    injectNav();
    document.querySelectorAll('[data-page="budget"]').forEach(el => el.classList.toggle('active', page === 'budget'));
    if (page === 'budget') await BudgetPage.render();
  };
  App.__budgetWrapped = true;
}
function boot() {
  if (!window.App) { setTimeout(boot, 50); return; }
  wrapNavigate(); injectNav();
  const side = document.getElementById('sidebarNav');
  if (side) new MutationObserver(() => injectNav()).observe(side, { childList: true, subtree: true });
  if (location.pathname.replace(/\//g, '') === 'budget') App.navigate('budget');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
