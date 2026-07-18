// ================================================================
// RCCG KINGDOM PARISH — FINANCE & ACCOUNTING APP
// Full SPA: Auth · Income · Remittances · Expenses · Petty Cash
//           Reports · Notifications · IT Admin Panel
// ================================================================

const App = (() => {

// ──────────────────────────────────────────
// 1. CONFIG
// ──────────────────────────────────────────
const ROLES = {
  it_admin:      { label:'IT Administrator',  color:'#534AB7', bg:'#EEEDFE' },
  pastor:        { label:'Parish Pastor',     color:'#0F6E56', bg:'#E1F5EE' },
  accountant:    { label:'Church Accountant', color:'#185FA5', bg:'#E6F1FB' },
  admin_officer: { label:'Admin Officer',     color:'#BA7517', bg:'#FAEEDA' },
  signatory:     { label:'Bank Signatory',    color:'#3B6D11', bg:'#EAF3DE' },
  viewer:        { label:'Read-Only Viewer',  color:'#555',    bg:'#f0f0f0'  }
};

const PERMISSIONS = {
  pastor:        ['dashboard','transactions','income_view','remittances','expenses_view','petty_view','reports','audit','signoff','rem_cutoff_edit'],
  accountant:    ['dashboard','transactions','income','income_view','remittances','expenses','bank','petty_view','reports','audit','rem_cutoff_edit','expense_delete_approved'],
  admin_officer: ['dashboard','transactions','expenses','petty_request','petty_view','income_view','petty_to_bank'],
  signatory:     ['dashboard','transactions','income_view','remittances_view','expenses_view','bank','petty_approve','signoff','petty_to_bank'],
  viewer:        ['dashboard','transactions','income_view','remittances_view','expenses_view','petty_view']
};

// All available permission keys with human-readable labels, grouped for the UI
const PERMISSION_DEFS = [
  { key:'dashboard',        label:'Dashboard',              group:'General'    },
  { key:'transactions',     label:'Transactions',           group:'General'    },
  { key:'income',           label:'Record Income',          group:'Finance'    },
  { key:'income_view',      label:'View Income Records',    group:'Finance'    },
  { key:'income_delete',    label:'Delete Income Records',  group:'Finance'    },
  { key:'petty_delete',     label:'Delete Petty Cash Records', group:'Petty Cash' },
  { key:'remittances',      label:'Manage Remittances',     group:'Finance'    },
  { key:'remittances_view', label:'View Remittances',       group:'Finance'    },
  { key:'rem_cutoff_edit',  label:'Edit Remittance Cut-Off Dates', group:'Finance' },
  { key:'expenses',               label:'Log Expenses',                group:'Finance' },
  { key:'expenses_view',          label:'View Expenses',               group:'Finance' },
  { key:'expense_delete_approved',label:'Delete Approved Expenses',    group:'Finance' },
  { key:'bank',             label:'Bank',                   group:'Finance'    },
  { key:'petty_request',    label:'Request Petty Cash',     group:'Petty Cash' },
  { key:'petty_approve',    label:'Approve Petty Cash',     group:'Petty Cash' },
  { key:'petty_to_bank',    label:'Deposit Petty Cash to Bank', group:'Petty Cash' },
  { key:'petty_view',       label:'View Petty Cash',        group:'Petty Cash' },
  { key:'reports',          label:'Generate Reports',       group:'Reports'    },
  { key:'audit',            label:'View Audit Log',         group:'Reports'    },
  { key:'signoff',          label:'Sign Off Remittances',   group:'Reports'    },
];

const NAV = [
  { id:'dashboard',    label:'Dashboard',     icon:'🏠', section:'Main',     minRole:['all'] },
  { id:'transactions', label:'Transactions',  icon:'🧾', section:'Main',     minRole:['all'] },
  { id:'income',       label:'Record Income', icon:'📥', section:'Finance',  minRole:['it_admin','accountant'] },
  { id:'remittances',  label:'Remittances',   icon:'📤', section:'Finance',  minRole:['it_admin','pastor','accountant','signatory'] },
  { id:'expenses',     label:'Expenses',      icon:'💸', section:'Finance',  minRole:['it_admin','accountant','admin_officer'] },
  { id:'bank',         label:'Bank',          icon:'🏦', section:'Finance',  minRole:['it_admin','accountant','signatory'] },
  { id:'petty_cash',   label:'Petty Cash',    icon:'💳', section:'Finance',  minRole:['it_admin','accountant','admin_officer','signatory'] },
  { id:'reports',      label:'Reports',       icon:'📊', section:'Reports',  minRole:['it_admin','pastor','accountant'] },
  { id:'audit',        label:'Audit Log',     icon:'📋', section:'Reports',  minRole:['it_admin','pastor','accountant'] },
  { id:'admin',        label:'IT Admin',      icon:'⚙️',  section:'System',   minRole:['it_admin'] }
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MAX_TRANSACTION_VIEW_NAME_LENGTH = 60;
// Tolerance for considering a remittance "fully paid" (within 1% of due amount to allow for rounding)
const PAYMENT_TOLERANCE_THRESHOLD = 0.99;

// A cash deposit only affects the balance (moves cash from accountant → bank)
// once AI verification has completed. Pending/flagged deposits stay "with accountant."
// Legacy deposits (no verification_status) are always effective.
function isDepositEffective(t){
  const vs = t.verificationStatus || '';
  return vs !== 'pending' && vs !== 'flagged' && vs !== 'deleted';
}

function depositVerificationBadge(t){
  const vs = t.verificationStatus || '';
  if(!vs) return '';
  if(vs==='verified') return `<span class="badge badge-success" style="font-size:10px" title="${t.aiNotes||''}">✅ AI Verified</span>`;
  if(vs==='flagged') return `<span class="badge badge-danger" style="font-size:10px" title="${t.aiNotes||''}">⚠️ Flagged${t.aiExtractedAmount?' — receipt: '+fmt(t.aiExtractedAmount):''}</span>`;
  if(vs==='pending') return '<span class="badge badge-warn" style="font-size:10px">⏳ Pending Verification</span>';
  if(vs==='auto_approved') return `<span class="badge badge-info" style="font-size:10px" title="${t.aiNotes||''}">ℹ️ Auto-Approved</span>`;
  if(vs==='manual_approved') return `<span class="badge badge-success" style="font-size:10px" title="${t.aiNotes||''}">✅ Manually Approved</span>`;
  return `<span class="badge" style="font-size:10px">${vs}</span>`;
}

function depositActionButtons(t){
  const vs = t.verificationStatus || '';
  if(vs !== 'pending' && vs !== 'flagged' && vs !== 'auto_approved') return '';
  const created = new Date(t.createdAt || t.date || 0).getTime();
  const age = Date.now() - created;
  const isStale = vs === 'flagged' || vs === 'auto_approved' || age > 5 * 60 * 1000;
  if(!isStale && vs === 'pending') return '<span style="font-size:10px;color:var(--text3)">Verifying…</span>';
  const btns = [];
  if(vs === 'flagged' && canAction('income_deposit')){
    btns.push(`<button class="btn btn-sm btn-amber" onclick="event.stopPropagation();App.correctDepositAmount('${t.id}',${t.aiExtractedAmount||0},${t.amount||0})" style="font-size:10px;padding:2px 8px;color:#fff">✏️ Correct</button>`);
  }
  if(canAction('income_deposit')){
    btns.push(`<button class="btn btn-sm" onclick="event.stopPropagation();App.retryDepositVerification('${t.id}')" style="font-size:10px;padding:2px 8px">🔄 Retry</button>`);
  }
  if(['it_admin'].includes(state.user?.role)){
    if(vs !== 'auto_approved') btns.push(`<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();App.manuallyApproveDeposit('${t.id}')" style="font-size:10px;padding:2px 8px">✅ Approve</button>`);
    btns.push(`<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();App.deleteDepositRecord('${t.id}')" style="font-size:10px;padding:2px 8px">🗑️ Delete</button>`);
  }
  return btns.join(' ');
}

async function correctDepositAmount(txId, aiAmount, currentAmount){
  const balance = await calcChurchBalance();
  const maxAmount = Math.round(balance.cashWithAccountant * 100) / 100;
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">✏️ Correct Deposit</div>
    <div class="alert alert-warn" style="margin:0 0 12px">
      <span class="alert-icon">⚠️</span>
      <span>AI detected a mismatch between the receipt and the recorded amount.</span>
    </div>
    <div style="background:var(--surface);border-radius:var(--r);padding:12px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
        <span style="color:var(--text2)">Amount on receipt (AI read):</span>
        <span style="font-weight:700">${fmt(aiAmount)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
        <span style="color:var(--text2)">Amount you recorded:</span>
        <span style="font-weight:700;color:var(--danger)">${fmt(currentAmount)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px">
        <span style="color:var(--text2)">Max depositable (cash available):</span>
        <span style="font-weight:700;color:var(--primary)">${fmt(maxAmount)}</span>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Correct Amount (₦) *</label>
      <input type="number" id="correct_dep_amount" class="form-input" value="${Math.min(aiAmount||currentAmount, maxAmount)}" max="${maxAmount}" />
      <div class="form-hint">Cannot exceed ${fmt(maxAmount)} (cash available with accountant).</div>
    </div>
    <div class="form-group">
      <label class="form-label">Re-upload Receipt Photo (optional)</label>
      <input type="file" id="correct_dep_photo" accept="image/*" class="form-input" style="padding:6px" />
      <div class="form-hint">Upload a different receipt if the original was wrong.</div>
    </div>
    <div class="form-group">
      <label class="form-label">Reason for Correction</label>
      <input type="text" id="correct_dep_reason" class="form-input" placeholder="e.g. Typo when recording, wrong receipt, etc." />
    </div>
    <div class="modal-footer" style="flex-wrap:wrap;gap:8px">
      <button class="btn btn-danger" onclick="App.deleteDepositRecord('${txId}',this)" style="font-size:12px">🗑 Delete Deposit</button>
      <div style="flex:1"></div>
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitDepositCorrection('${txId}',${maxAmount},this)">✅ Correct & Re-verify</button>
    </div>`);
}

async function submitDepositCorrection(txId, maxAmount, btn=null){
  const newAmount = parseFloat(document.getElementById('correct_dep_amount')?.value) || 0;
  const reason = (document.getElementById('correct_dep_reason')?.value || '').trim();
  const photoFile = document.getElementById('correct_dep_photo')?.files?.[0];
  if(!newAmount || newAmount <= 0){ showAlert('Please enter a valid amount.','danger'); return; }
  if(newAmount > maxAmount){ showAlert(`Amount (${fmt(newAmount)}) exceeds cash available with accountant (${fmt(maxAmount)}).`,'danger'); return; }
  const restore = setBtnLoading(btn, 'Correcting…');
  try {
    const updateData = { amount: newAmount, verificationStatus:'pending', aiNotes:`Corrected: ${reason||'Amount updated'} — re-verifying` };
    if(photoFile){
      const photoData = await compressPhoto(photoFile, 1200, 0.75);
      updateData.photoData = photoData;
    }
    await fetch('/api/cash-transactions/'+txId, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(updateData),
    });
    DB.addAudit('deposit_corrected',`Deposit ${txId} amount corrected to ${fmt(newAmount)}${photoFile?' + new photo uploaded':''}. Reason: ${reason||'—'}`,state.user?.name);
    closeModal();
    showAlert(`Amount corrected to ${fmt(newAmount)}. Re-verifying with AI…`,'info');
    retryDepositVerification(txId);
  } catch(e){
    if(restore) restore();
    showAlert(`Failed: ${e.message}`,'danger');
  }
}

async function deleteDepositRecord(txId, btn=null){
  if(!confirm('Delete this deposit record? This will return the cash to "Cash with Accountant."')) return;
  const restore = setBtnLoading(btn, 'Deleting…');
  try {
    await fetch('/api/cash-transactions/'+txId, {
      method:'DELETE', headers:{'Content-Type':'application/json'},
    });
    DB.addAudit('deposit_deleted',`Deposit ${txId} fully deleted by ${state.user?.name}. Cash returned to accountant.`,state.user?.name);
    closeModal();
    showAlert('Deposit record deleted. Cash returned to accountant.','success');
    if(state.page==='bank') renderBank(); else renderIncome();
  } catch(e){
    if(restore) restore();
    showAlert(`Failed: ${e.message}`,'danger');
  }
}

async function retryDepositVerification(txId){
  const btn = event?.target; if(btn) setBtnLoading(btn, 'Retrying…');
  showAlert('🔄 Retrying AI verification…','info');
  try {
    // Fetch the transaction to get the photo
    const allTx = await DB.getCashTransactions(true); // full=true to include photo
    const tx = allTx.find(t=>t.id===txId);
    if(!tx?.photoData){ showAlert('No photo found for this deposit. Cannot retry verification.','danger'); return; }
    const resp = await fetch('/api/verify-deposit', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ transactionId:txId, photoData:tx.photoData, recordedAmount:tx.amount, depositDate:tx.date||'' }),
    });
    const result = await resp.json();
    if(result?.status==='verified'){
      showAlert(`✅ Verified! ${fmt(tx.amount)} moved to bank.`,'success');
    } else if(result?.status==='flagged'){
      showAlert(`⚠️ Still flagged: receipt shows ${fmt(result.aiAmount||0)} but ${fmt(tx.amount)} was recorded.`,'danger');
    } else {
      showAlert(`Verification result: ${result?.status||'unknown'}. ${result?.reason||''}`,'info');
    }
    renderIncome();
  } catch(e){
    showAlert(`Retry failed: ${e.message}`,'danger');
  }
}

async function manuallyApproveDeposit(txId){
  if(!['it_admin'].includes(state.user?.role)){ showAlert('Only IT Admin can manually approve deposits.','danger'); return; }
  if(!confirm('Manually approve this deposit? Cash will be moved from accountant to bank.')) return;
  const btn = event?.target; if(btn) setBtnLoading(btn, 'Approving…');
  try {
    await fetch('/api/cash-transactions/'+txId, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ verificationStatus:'manual_approved', aiNotes:`Manually approved by ${state.user?.name||'IT Admin'} on ${new Date().toISOString().split('T')[0]}` }),
    });
    DB.addAudit('deposit_manual_approve',`Deposit ${txId} manually approved by ${state.user?.name}`,state.user?.name);
    showAlert('✅ Deposit manually approved. Cash moved to bank.','success');
    renderIncome();
  } catch(e){
    showAlert(`Failed: ${e.message}`,'danger');
  }
}
// Tolerance for TG split validation — percentages must sum within ±0.1% to allow for floating-point rounding
const TG_SUM_TOLERANCE = 0.001;

const INCOME_TYPES = [
  { key:'membersTithe',    label:"Members' Tithe",         natl:0.58, local:0.42 },
  { key:'ministersTithe',  label:"Ministers' Tithe",       natl:0.62, local:0.38 },
  { key:'thanksgiving',    label:'Thanksgiving (TG)',      special:'tg' },
  { key:'sundaySchool',    label:'Sunday School',          natl:1.00, local:0 },
  { key:'slo',             label:'Sunday Love Offering',   natl:0.30, local:0.70 },
  { key:'crm',             label:'CRM (Weekly Activities)',natl:0.60, local:0.40 },
  { key:'workersOffering', label:"Gospel Fund (Workers' Offering)", natl:0.25, local:0.75 },
  { key:'firstFruit',      label:'First Fruit',            natl:1.00, local:0 },
  { key:'childrenOffering',label:"Teen/Children's Offering",        natl:0.35, local:0.65 },
  { key:'weekendOffering', label:'Weekend Offering',               natl:1.00, local:0 },
  { key:'holyCommunionOffering', label:'Holy Communion Offering',  natl:1.00, local:0 }
];

const EXPENSE_CATS = [
  { key:'power',      label:'Power & Energy',          color:'#EF9F27', icon:'⚡' },
  { key:'facility',   label:'Facility & Cleaning',     color:'#1D9E75', icon:'🧹' },
  { key:'repairs',    label:'Repairs & Maintenance',   color:'#BA7517', icon:'🔧' },
  { key:'sound',      label:'Sound & Media',           color:'#534AB7', icon:'🎙️' },
  { key:'comms',      label:'Communication',           color:'#185FA5', icon:'📱' },
  { key:'office',     label:'Office & Stationery',     color:'#3B6D11', icon:'✏️' },
  { key:'bank',       label:'Bank Charges',            color:'#888',    icon:'🏦' },
  { key:'transport',  label:'Transportation',          color:'#0F6E56', icon:'🚗' },
  { key:'hospitality',label:'Hospitality & Guests',    color:'#BA7517', icon:'☕' },
  { key:'security',   label:'Security',                color:'#555',    icon:'🔒' },
  { key:'welfare',    label:'Church Welfare',          color:'#D85A30', icon:'❤️' },
  { key:'property',   label:'Property & Projects',     color:'#185FA5', icon:'🏗️' },
  { key:'events',     label:'Events & Departments',    color:'#534AB7', icon:'🎉' },
  { key:'reconciliation', label:'Cash Reconciliation', color:'#666', icon:'⚖️' },
  // Selecting this category auto-switches "Pay From" to Split (Parish + Pool) in
  // showExpenseForm — see applyCategoryFundSourceDefault — so an Admin Officer or
  // Accountant is guided straight into the correct joint/zonal flow without needing
  // to know the term "pool". KEY UNCHANGED ('rccg_proj') even though the label was
  // renamed from "RCCG Special Projects" — historical expense records reference the
  // category by key, not label. Kept last in the list deliberately.
  { key:'rccg_proj',  label:'RCCG Payments',           color:'#A32D2D', icon:'🧾' }
];

// Removed category keys that may still appear on historical expense records (e.g.
// 'zonal_area_joint', retired once the dedicated Satellite/Zone Pool "Pay From" flow
// covers the same need under 'rccg_proj') — fall back to a readable label instead of
// the raw key or breaking. Mirrors the OTHER_INCOME_SOURCES removed-key fallback
// pattern used throughout the Income module. Looked up via EXPENSE_CATS_ALL below,
// never rendered as a selectable option in any category dropdown.
const LEGACY_EXPENSE_CATS = {
  zonal_area_joint: { key:'zonal_area_joint', label:'Zonal / Area Joint Payment (legacy)', color:'#8B4513', icon:'🤝' }
};
const EXPENSE_CATS_ALL = [...EXPENSE_CATS, ...Object.values(LEGACY_EXPENSE_CATS)];

const EXPENSE_SUBCATS = {
  power:       ['Fuel for the church generator','Generator engine oil','Prepaid electricity meter recharge (NEPA/Disco bills)','Others...'],
  hospitality: ['Sunday refreshments (snacks and drinks for workers, ministers, or first-timers)','Hosting expenses (feeding & accommodating visiting senior pastors)','Drinking water for altar & workers','Others...'],
  facility:    ['Cleaning supplies','Waste disposal fees','Others...'],
  welfare:     ["Financial support for members' weddings","Financial support for members' burials","Assistance for severe medical emergencies (hospital bills for a worker)",'Approved special pastoral support','Urgent financial lifelines for the pastoral family or dedicated workers','Others...'],
  sound:       ['Microphone batteries','Sound cables, extension boxes, and connectors','Cable TV subscriptions','Repairs for speakers or amplifiers','Others...'],
  repairs:     ['Generator mechanical repairs and routine servicing','Minor electrical fixes','Plumbing repairs','Others...'],
  comms:       ['Airtime for making official church calls','Internet Data for church phones or computers','Bulk SMS for announcements or reminders to members','Others...'],
  office:      ['Stationery','Offering, Tithe, and Thanksgiving envelopes','Printing and photocopying','Others...'],
  bank:        ['POS terminal charges','SMS alert fees from the bank','Money transfer charges','Monthly account maintenance fees','Cheque book issuance charges','Other bank charges','Others...'],
  transport:   ['Transport and accommodation for the Pastor or Ministers attending Provincial, Regional, or National church programs','Transport fares for workers running official church errands','Transport stipends for guest ministers','Moving costs (paying to transport rented chairs or equipment for special programs)','Others...'],
  rccg_proj:   ['Programme or Event from Provincial / Regional / National','Project Levy from Provincial / Regional / National','Special / Emergency Request from RCCG Authorities',"Let's Go A-Fishing Contribution",'Others...'],
  property:    ['Annual land or building rent','Building construction and renovations','Buying major equipment','Others...'],
  events:      ['Flyers, banners, and posters for special programs','Church decorations for special events or festive seasons','Teaching materials and snacks for the Children\'s department','Purchasing Sunday School manuals for the parish','Others...'],
  security:    ['Monthly salary or allowance for the night security guard','Security supplies','Occasional tips or relations with local police or community vigilantes','Others...']
};

const DEFAULT_QUOTAS = { volunteer:2000, csr:3000, camp:5000, rmf:5000, edu:2000, mummy:8000, regional:0 };

const QUOTA_LABELS = {
  volunteer:'Convention Volunteer',
  csr:      'CSR Support (Zonal HQ)',
  camp:     'RCCG Camp Clearing',
  rmf:      'RMF',
  edu:      'Run Edu Fund (Zonal HQ)',
  mummy:    'Zonal Mummy Stipend',
  regional: 'Regional Contribution'
};

// Income source types used in the "Other Income" form.
// Money received from / remitted on behalf of satellite parishes (Province
// remittance contributions, joint area/zone payments) does NOT belong here —
// it is pass-through/custodial money, not this parish's own income. It is
// recorded separately via the Satellite / Zone Pass-Through Fund panel on the
// Remittances page (see renderRemittances / satellite_funds) and excluded from
// all income totals. 'satellite_remittance' and 'remittance_linked_credit' used
// to live in this list as an earlier, incorrect attempt at this — removed; any
// historical records still bearing those source values fall back to the raw
// key label wherever OTHER_INCOME_SOURCES.find(...)||{label:...} is used.
const OTHER_INCOME_SOURCES = [
  { key:'midweek_offering',   label:'Midweek / Programme Offering' },
  { key:'go_a_fishing_offering', label:'Go-a-Fishing Offering' },
  { key:'individual_donation',label:'Personal / Individual Donation' },
  { key:'seed',               label:'Seed Offering' },
  { key:'special_offering',   label:'Special Offering (e.g. Naming, Wedding)' },
  { key:'building_fund',      label:'Building / Project Fund Contribution' },
  { key:'external_transfer',  label:'External Bank Transfer Received' },
  { key:'other',              label:'Other (specify in notes)' }
];

// Purpose options for Satellite / Zone Pass-Through Fund In/Out entries (Remittances page).
const SATELLITE_FUND_PURPOSES = [
  { key:'province_remittance', label:'Province Remittance Contribution' },
  { key:'joint_area_zone',     label:'Joint Area / Zone Payment' },
  { key:'other',                label:'Other' },
];

// Reasons for a "Transfer to Parish" — reclassifies already-held satellite pool
// balance as the parish's own money. The reason changes REPORTING classification
// only (see summarizeSatelliteFunds) — the balance effect is identical for all three.
const SATELLITE_TRANSFER_REASONS = [
  { key:'gift',          label:'Gift / Surplus (satellite left it for HQ) — counted as parish income' },
  { key:'reimbursement', label:'Reimbursement (HQ fronted a payment, now repaid) — memo only' },
  { key:'correction',    label:"Correction (money was actually HQ's own, wrongly parked) — memo only" },
];

const DEFAULT_REMITTANCE_RATES = {
  membersTithe:    { natl:0.58, local:0.42 },
  ministersTithe:  { natl:0.62, local:0.38 },
  sundaySchool:    { natl:1.00, local:0.00 },
  slo:             { natl:0.30, local:0.70 },
  crm:             { natl:0.60, local:0.40 },
  workersOffering: { natl:0.25, local:0.75 },
  firstFruit:      { natl:1.00, local:0.00 },
  childrenOffering: { natl:0.35, local:0.65 },
  weekendOffering:  { natl:1.00, local:0.00 },
  holyCommunionOffering: { natl:1.00, local:0.00 },
  tgNational:0.75, tgArea:0.05, tgPastor:0.10, tgMinisters:0.09, tgSeed:0.01,
  provinceRebate:0.20,
  crmAddon:0.25, coastline:0.01, insuranceGenTithe:0.0125, insuranceMinTithe:0.0125
};
const PIN_REGEX = /^\d{4,6}$/;

// ──────────────────────────────────────────
// 2. DATA LAYER — Cloudflare D1 via /api/*
// ──────────────────────────────────────────
const _apiCache = new Map();   // endpoint -> { data, ts }  — short-lived read cache
const _inflight = new Map();   // path -> Promise            — de-dupes concurrent GETs
// Read-cache TTLs (ms). Settings/petty-config/users rarely change, so they live long.
// The heavy list endpoints (income, expenses, petty, remittances, cash-transactions)
// are re-fetched by nearly every page — Dashboard, Transactions, Income, Expenses, Bank
// and Remittances all pull the SAME full tables. A short TTL lets navigation between
// pages reuse data already downloaded instead of re-pulling whole tables over a slow
// parish mobile link, which is the main cause of long "Loading…" waits and the
// "Failed to fetch" blank screen (8 parallel downloads saturating the connection).
// Any write clears the WHOLE cache (see below), so these can never go stale behind
// your own edits.
const _CACHE_TTL = {
  settings: 300000, 'petty-config': 300000, users: 300000,
  income: 60000, expenses: 60000, petty: 60000, remittances: 60000, 'cash-transactions': 60000,
  'satellite-funds': 60000,
};
// Abort a request that stalls this long so it can be retried, rather than leaving the
// page stuck on "Loading…" forever when a mobile connection dies mid-flight. Generous
// enough that a legitimately slow download on a weak link still completes.
const _REQUEST_TIMEOUT_MS = 45000;

// One network attempt, wrapped in a timeout so a dead connection fails fast.
async function _apiFetchOnce(path, opts){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), _REQUEST_TIMEOUT_MS);
  try {
    return await fetch('/api/'+path, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Download progress + live speed ──────────────────────────────────────────
// Tracks bytes flowing through the streamed GET reader (see _readJson) so the
// loading skeletons can show a real percentage, the amount downloaded and the
// measured throughput. On slow parish links this turns the old opaque "Loading…"
// into visible progress. When the server sends no usable Content-Length (chunked
// / compressed responses), the percentage eases toward 95% by elapsed time and
// snaps to 100% on completion, while the byte counter and speed stay exact.
const NetLoad = {
  active: new Map(),                    // reqId -> { received, total }
  startTs: 0, lastTs: 0, lastBytes: 0, speed: 0 /* bytes/s */, ticker: 0,
  begin(id, total){
    const fresh = this.active.size === 0;
    this.active.set(id, { received: 0, total: total || 0 });
    if(fresh){
      this.startTs = performance.now();
      this.lastTs = this.startTs; this.lastBytes = 0;
      if(!this.ticker) this.ticker = setInterval(() => this._render(), 150);
    }
    this._render();
  },
  update(id, received){
    const e = this.active.get(id); if(!e) return;
    e.received = received;
    const now = performance.now();
    const dt = now - this.lastTs;
    if(dt >= 200){
      const bytes = this._received();
      const inst = (bytes - this.lastBytes) / (dt / 1000);
      this.speed = this.speed ? this.speed * 0.65 + inst * 0.35 : inst;
      this.lastTs = now; this.lastBytes = bytes;
    }
  },
  finish(id){
    this.active.delete(id);
    if(this.active.size === 0){
      if(this.ticker){ clearInterval(this.ticker); this.ticker = 0; }
      this._render(true);
      this.speed = 0;
    }
  },
  _received(){ let s = 0; for(const e of this.active.values()) s += e.received; return s; },
  _pct(done){
    if(done) return 100;
    if(this.active.size === 0) return 0;
    let recv = 0, tot = 0;
    for(const e of this.active.values()){ if(e.total > 0){ recv += e.received; tot += e.total; } }
    if(tot > 0 && recv <= tot * 1.05) return Math.min(99, Math.round(recv / tot * 100));
    // No reliable Content-Length (chunked/compressed) — ease toward 95% by time.
    const elapsed = performance.now() - this.startTs;
    return Math.min(95, Math.round((1 - Math.exp(-elapsed / this._expectedMs())) * 100));
  },
  _expectedMs(){
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const dl = c && typeof c.downlink === 'number' && c.downlink > 0 ? c.downlink : 1.5; // Mbps
    const ms = (300 * 1024 * 8) / (dl * 1e6) * 1000;   // ~300 KB payload over the link
    return Math.max(2500, Math.min(20000, ms));
  },
  _speedLabel(){
    if(this.speed > 0){
      const kbps = this.speed / 1024;
      return kbps >= 1024 ? (kbps / 1024).toFixed(2) + ' MB/s' : Math.max(1, Math.round(kbps)) + ' KB/s';
    }
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if(c && typeof c.downlink === 'number') return '~' + c.downlink + ' Mbps' + (c.effectiveType ? ' ' + c.effectiveType : '');
    return 'measuring…';
  },
  _render(done){
    const fill = document.getElementById('loadProgressFill');
    const pctEl = document.getElementById('loadProgressPct');
    const speedEl = document.getElementById('loadProgressSpeed');
    const bytesEl = document.getElementById('loadProgressBytes');
    if(!fill && !pctEl && !speedEl && !bytesEl) return;
    const p = this._pct(done);
    if(fill) fill.style.width = p + '%';
    if(pctEl) pctEl.textContent = (p === 0 && !done) ? 'Loading…' : p + '%';
    if(speedEl) speedEl.textContent = this._speedLabel();
    if(bytesEl){ const b = this._received(); bytesEl.textContent = b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b > 0 ? Math.round(b / 1024) + ' KB' : ''; }
  },
  // Populate idle labels into a freshly painted skeleton footer.
  sync(){ this._render(); },
};

// HTML for the loading footer shown inside skeletons: progress bar + live
// percentage, amount downloaded and measured network speed. NetLoad targets the
// ids below as bytes stream in.
function loadingFooter(hint = 'Loading…'){
  return `<div class="load-progress" id="loadProgress" role="status" aria-live="polite">
    <div class="load-progress-track"><div class="load-progress-fill" id="loadProgressFill" style="width:0%"></div></div>
    <div class="load-progress-meta">
      <span class="load-progress-pct" id="loadProgressPct">Loading…</span>
      <span class="load-progress-detail"><span id="loadProgressBytes"></span><span class="load-progress-speed" id="loadProgressSpeed"></span></span>
    </div>
    <div class="load-progress-hint">${hint} this can take a few seconds on slow networks.</div>
  </div>`;
}

let _netReqSeq = 0;
// Read a Response body as JSON while reporting download progress to NetLoad.
// Falls back to res.json() when streaming is unavailable or the body is still
// intact after an error.
async function _readJson(res){
  try {
    if(!res.body || typeof res.body.getReader !== 'function') return await res.json();
    const total = Number(res.headers.get('content-length')) || 0;
    const id = ++_netReqSeq;
    const reader = res.body.getReader();
    const chunks = []; let received = 0;
    NetLoad.begin(id, total);
    try {
      for(;;){
        const { done, value } = await reader.read();
        if(done) break;
        chunks.push(value); received += value.length;
        NetLoad.update(id, received);
      }
    } finally { NetLoad.finish(id); }
    const buf = new Uint8Array(received); let off = 0;
    for(const c of chunks){ buf.set(c, off); off += c.length; }
    const text = new TextDecoder('utf-8').decode(buf);
    return text ? JSON.parse(text) : null;
  } catch(e){
    if(res.bodyUsed) throw e;   // stream already consumed — can't retry res.json()
    return await res.json();
  }
}

async function apiFetch(path, method='GET', body=null){
  const endpoint = path.split('/')[0];
  if(method !== 'GET'){
    // Finance tables are interrelated — an expense touches petty cash and the bank,
    // a remittance touches cash, etc. Clear the whole cache on any write so the next
    // read of ANY page reflects the change immediately.
    _apiCache.clear();
  } else if(_CACHE_TTL[endpoint]){
    const cached = _apiCache.get(endpoint);
    if(cached && Date.now() - cached.ts < _CACHE_TTL[endpoint]) return cached.data;
    const pending = _inflight.get(path);
    if(pending) return pending;   // a concurrent caller is already loading this — reuse it
  }
  const opts = { method, headers:{'Content-Type':'application/json'} };
  if(body !== null) opts.body = JSON.stringify(body);

  // Retry GETs on transient failures. Mobile networks at the parish often drop
  // one of several parallel connections, surfacing here as a TypeError ("Failed
  // to fetch"), an aborted request (our timeout above), or a 5xx from the edge.
  // Two retries with 1s, 3s backoff recover most of these without bothering the
  // user. Mutations (POST/PUT/DELETE) are NEVER retried — a successful write whose
  // response was lost in transit would duplicate the record. The retry loop lives
  // inside the in-flight promise so de-duped callers share the whole sequence.
  const run = (async () => {
    for(let attempt = 0; ; attempt++){
      try {
        const res = await _apiFetchOnce(path, opts);
        if(!res.ok && method === 'GET' && res.status >= 500 && attempt < 2){
          await new Promise(r => setTimeout(r, 1000 * (2 * attempt + 1)));
          continue;
        }
        const data = await _readJson(res);
        if(!res.ok) throw new Error(data.error || `API error ${res.status}`);
        if(method === 'GET' && _CACHE_TTL[endpoint]) _apiCache.set(endpoint, { data, ts: Date.now() });
        return data;
      } catch(err){
        const retryable = (err instanceof TypeError) || (err && err.name === 'AbortError');
        if(retryable && method === 'GET' && attempt < 2){
          await new Promise(r => setTimeout(r, 1000 * (2 * attempt + 1)));
          continue;
        }
        throw err;
      }
    }
  })();

  if(method === 'GET' && _CACHE_TTL[endpoint]){
    _inflight.set(path, run);
    const cleanup = () => { if(_inflight.get(path) === run) _inflight.delete(path); };
    run.then(cleanup, cleanup);
  }
  return run;
}

const DB = {
  login(d)                     { return apiFetch('auth/login','POST',d); },
  getUsers()                   { return apiFetch('users'); },
  addUser(d)                   { return apiFetch('users','POST',d); },
  updateUser(id,d)             { return apiFetch(`users/${id}`,'PUT',d); },
  deleteUser(id)               { return apiFetch(`users/${id}`,'DELETE'); },
  changePin(d)                 { return apiFetch('change-pin','POST',d); },

  getIncome()                  { return apiFetch('income'); },
  addIncome(d)                 { return apiFetch('income','POST',d); },
  updateIncome(id,d)           { return apiFetch(`income/${id}`,'PUT',d); },
  deleteIncome(id)             { return apiFetch(`income/${id}`,'DELETE'); },

  getExpenses(full=false)      { return apiFetch('expenses'+(full?'?full=1':'')); },
  getExpenseReceipt(id)        { return apiFetch(`expense-receipt/${id}`); },
  addExpense(d)                { return apiFetch('expenses','POST',d); },
  updateExpense(id,d)          { return apiFetch(`expenses/${id}`,'PUT',d); },
  deleteExpense(id)            { return apiFetch(`expenses/${id}`,'DELETE'); },

  getPetty()                   { return apiFetch('petty'); },
  getPettyConfig()             { return apiFetch('petty-config'); },
  savePettyConfig(d)           { return apiFetch('petty-config','POST',d); },
  recalcPettyFloat()           { return apiFetch('petty-recalc','POST'); },
  addPettyEntry(d)             { return apiFetch('petty','POST',d); },
  updatePettyEntry(id,d)       { return apiFetch(`petty/${id}`,'PUT',d); },
  deletePettyEntry(id)         { return apiFetch(`petty/${id}`,'DELETE'); },

  getRemittances()             { return apiFetch('remittances'); },
  addRemittance(d)             { return apiFetch('remittances','POST',d); },
  updateRemittance(id,d)       { return apiFetch(`remittances/${id}`,'PUT',d); },
  deleteRemittance(id,force=false){ return apiFetch(`remittances/${id}`,'DELETE', force?{force:true}:null); },
  createSharedReport(d)          { return apiFetch('report-share','POST',d); },
  getSharedReport(token)         { return apiFetch(`report-share/${token}`); },

  // Satellite / Zone Pass-Through Fund — money received from and remitted on
  // behalf of satellite parishes. Excluded from income/expense totals; every
  // In/Out is mirrored into a bank movement server-side (see satellite-funds API).
  getSatelliteFunds()           { return apiFetch('satellite-funds'); },
  addSatelliteFund(d)           { return apiFetch('satellite-funds','POST',d); },
  deleteSatelliteFund(id)       { return apiFetch(`satellite-funds/${id}`,'DELETE'); },

  getCashTransactions(full=false){ return apiFetch('cash-transactions'+(full?'?full=1':'')); },
  getCashPhoto(id)             { return apiFetch(`cash-photo/${id}`); },
  addCashTransaction(d)        { return apiFetch('cash-transactions','POST',d); },
  updateCashTransaction(id,d)  { return apiFetch(`cash-transactions/${id}`,'PUT',d); },
  deleteCashTransaction(id)    { return apiFetch(`cash-transactions/${id}`,'DELETE'); },

  getAudit()                   { return apiFetch('audit'); },
  // addAudit is fire-and-forget — never blocks the UI
  addAudit(type,detail,by){
    apiFetch('audit','POST',{type,detail,by:by||'System'}).catch(()=>{});
  },

  getSettings()                { return apiFetch('settings'); },
  saveSettings(d)              { return apiFetch('settings','POST',d); },

  getChurchBankIngestLog()     { return apiFetch('church-bank-ingest-log'); },
  getBankBalanceSnapshot()     { return apiFetch('bank-balance-snapshot'); },

  getNotifications()           { return apiFetch('notifications'); },
  addNotification(title,body,type='info'){
    apiFetch('notifications','POST',{title,body,type}).catch(()=>{});
    updateNotifBadge();
  },
  markAllRead(){
    return apiFetch('notifications/read','POST').catch(()=>{});
  },
  importBackup(data)            { return apiFetch('admin/import','POST',data); },
  clearAllData()                { return apiFetch('admin/clear','POST'); },
  clearDataOnly()               { return apiFetch('admin/clear-data','POST'); },

  getAiSecretaryMeetings()       { return apiFetch('ai-secretary-meetings'); },
  addAiSecretaryMeeting(d)       { return apiFetch('ai-secretary-meetings','POST',d); },
  updateAiSecretaryMeeting(id,d) { return apiFetch(`ai-secretary-meetings/${id}`,'PUT',d); },
  processAiSecretaryMeeting(id)  { return apiFetch(`ai-secretary-meetings/${id}/process`,'POST'); },

  // One round-trip for the seven tables the Dashboard needs. See loadDashboardData.
  getDashboardData()           { return apiFetch('dashboard'); },
};

// ── Dashboard batch loader ──────────────────────────────────────────────────
// The Dashboard needs seven full tables. Fetching them as seven parallel GETs
// saturates a weak parish link, and a single dropped connection blanks the page.
// `/api/dashboard` returns all seven in ONE response. We seed the per-endpoint
// cache from the batch so navigating Dashboard → Transactions/Income/Bank next
// reuses the data with no extra fetch. Falls back to the individual endpoints if
// the batch route is unavailable (e.g. mid-deploy) or returns an unexpected
// shape, preserving the granular per-source error reporting.
const _DASH_CACHE_KEYS = ['income','expenses','petty','settings','remittances','petty-config','cash-transactions'];

function _assembleDashFromCache(){
  const fresh = key => { const c = _apiCache.get(key); return (c && Date.now() - c.ts < _CACHE_TTL[key]) ? c : null; };
  if(!_DASH_CACHE_KEYS.every(k => fresh(k))) return null;
  return {
    income:           fresh('income')?.data,
    expenses:         fresh('expenses')?.data,
    petty:            fresh('petty')?.data,
    settings:         fresh('settings')?.data,
    remittances:      fresh('remittances')?.data,
    pettyConfig:      fresh('petty-config')?.data,
    cashTransactions: fresh('cash-transactions')?.data,
  };
}

function _seedDashCache(batch){
  const now = Date.now();
  _apiCache.set('income',            { data: batch.income,            ts: now });
  _apiCache.set('expenses',          { data: batch.expenses,          ts: now });
  _apiCache.set('petty',             { data: batch.petty,             ts: now });
  _apiCache.set('settings',          { data: batch.settings,          ts: now });
  _apiCache.set('remittances',       { data: batch.remittances,       ts: now });
  _apiCache.set('petty-config',      { data: batch.pettyConfig,       ts: now });
  _apiCache.set('cash-transactions', { data: batch.cashTransactions,  ts: now });
}

async function _loadDashboardDataIndividually(){
  const sources = [
    ['Income records',     () => DB.getIncome()],
    ['Expense records',    () => DB.getExpenses()],
    ['Petty cash history', () => DB.getPetty()],
    ['Settings',           () => DB.getSettings()],
    ['Remittance history', () => DB.getRemittances()],
    ['Petty cash config',  () => DB.getPettyConfig()],
    ['Cash transactions',  () => DB.getCashTransactions()],
  ];
  const settled = await Promise.allSettled(sources.map(([, fn]) => fn()));
  const failed = settled
    .map((r, i) => r.status === 'rejected' ? { label: sources[i][0], err: r.reason } : null)
    .filter(Boolean);
  if(failed.length){
    const e = new Error('Failed to load: ' + failed.map(f => f.label).join(', '));
    e.failed = failed;
    throw e;
  }
  const [income, expenses, petty, settings, remittances, pettyConfig, cashTransactions] = settled.map(r => r.value);
  return { income, expenses, petty, settings, remittances, pettyConfig, cashTransactions };
}

async function loadDashboardData(){
  // Fast path: arriving at the Dashboard right after another page — everything
  // is already cached and fresh, so skip the network entirely.
  const cached = _assembleDashFromCache();
  if(cached) return cached;
  try {
    const batch = await DB.getDashboardData();
    // Guard against an old backend answering this route with a different shape.
    if(!batch || typeof batch !== 'object' || !Array.isArray(batch.income) || !Array.isArray(batch.expenses)){
      return await _loadDashboardDataIndividually();
    }
    _seedDashCache(batch);
    return batch;
  } catch(e){
    if(e && e.failed) throw e;   // individual fallback already ran and reported failures
    return await _loadDashboardDataIndividually();
  }
}

// ──────────────────────────────────────────
// 3. STATE
// ──────────────────────────────────────────
const state = {
  user: null,
  page: 'dashboard',
  month: new Date().getMonth(),
  year: new Date().getFullYear(),
  loginBusy: false,
  aiSecretaryActiveId: null,
  // App-wide period mode shared by Dashboard, Bank, Income, Expenses.
  // 'remittance' anchors at the RCCG cut-off period; 'calendar' uses the natural month.
  periodMode: 'remittance',
  // True once the user manually picks a month from the dropdown — disables the
  // smart-default that re-snaps state.month/year when the period mode changes.
  userPickedMonth: false,
  // Cached {year, month} for the END of the currently active remittance period.
  // Lets buildMonthSelector include the upcoming month as an option even before
  // the user toggles into remittance mode.
  upcomingPeriodAnchor: null,
  reportPeriodMode: 'remittance', // 'remittance' | 'calendar' — Reports page only
};

// ──────────────────────────────────────────
// 4. UTILITIES
// ──────────────────────────────────────────
function fmt(n){
  const v = Math.round((n||0) * 100) / 100;
  const hasDec = v % 1 !== 0;
  return '₦' + v.toLocaleString('en-NG', {minimumFractionDigits: hasDec ? 2 : 0, maximumFractionDigits: 2});
}
function fmtShort(n){
  if(!n) return '₦0';
  const abs = Math.abs(n);
  if(abs >= 1000000) return '₦' + (n/1000000).toFixed(1).replace(/\.0$/,'') + 'M';
  if(abs >= 1000) return '₦' + (n/1000).toFixed(abs >= 10000 ? 0 : 1).replace(/\.0$/,'') + 'k';
  return '₦' + Math.round(n);
}
function countSundaysInMonth(year, month){
  const today = new Date();
  // For past months count all Sundays; for the current month count only up to today
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const limit = isCurrentMonth ? today.getDate() : 31;
  let count = 0;
  const d = new Date(year, month, 1);
  while(d.getMonth() === month && d.getDate() <= limit){ if(d.getDay() === 0) count++; d.setDate(d.getDate()+1); }
  return count;
}
function countSundaysBetween(fromDate, toDate){
  const start = fromDate instanceof Date ? fromDate : new Date(fromDate);
  const end = toDate instanceof Date ? toDate : new Date(toDate);
  if(isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  if(start > end) return 0;
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const limit = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let count = 0;
  while(d <= limit){
    if(d.getDay() === 0) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}
function parseDisplayDate(value){
  if(!value) return null;
  if(value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if(typeof value === 'string'){
    const v = value.trim();
    if(!v) return null;
    const ymdMatch = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(ymdMatch) return new Date(Number(ymdMatch[1]), Number(ymdMatch[2]) - 1, Number(ymdMatch[3]));
    const sqliteMatch = v.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
    // SQLite datetime('now') is UTC. Parse as UTC, then format in Africa/Lagos for display.
    if(sqliteMatch) return new Date(Date.UTC(Number(sqliteMatch[1]), Number(sqliteMatch[2]) - 1, Number(sqliteMatch[3]), Number(sqliteMatch[4]), Number(sqliteMatch[5]), Number(sqliteMatch[6]||0)));
    const isoNoTz = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d{1,3})?)?$/);
    if(isoNoTz) return new Date(`${isoNoTz[1]}T${isoNoTz[2]}`);
  }
  const dt = new Date(value);
  return isNaN(dt.getTime()) ? null : dt;
}
function hasExplicitTime(value){
  if(value instanceof Date) return true;
  if(typeof value !== 'string') return false;
  return /(?:T|\s)\d{2}:\d{2}/.test(value.trim());
}
const NIGERIA_TIMEZONE = 'Africa/Lagos';
function fmtDate(d){
  // YYYY-MM-DD strings are calendar dates with no time/timezone — format them
  // in UTC so a browser east of Africa/Lagos doesn't roll the display back a day.
  if(typeof d === 'string'){
    const ymdMatch = d.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(ymdMatch){
      const dt = new Date(Date.UTC(Number(ymdMatch[1]), Number(ymdMatch[2])-1, Number(ymdMatch[3])));
      return dt.toLocaleDateString('en-NG',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
    }
  }
  const dt = parseDisplayDate(d);
  if(!dt) return '—';
  return dt.toLocaleDateString('en-NG',{day:'2-digit',month:'short',year:'numeric',timeZone:NIGERIA_TIMEZONE});
}
function fmtDateShort(d){
  if(typeof d === 'string'){
    const ymdMatch = d.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(ymdMatch){
      const dt = new Date(Date.UTC(Number(ymdMatch[1]), Number(ymdMatch[2])-1, Number(ymdMatch[3])));
      return dt.toLocaleDateString('en-NG',{day:'2-digit',month:'short',timeZone:'UTC'});
    }
  }
  const dt = parseDisplayDate(d);
  if(!dt) return '—';
  return dt.toLocaleDateString('en-NG',{day:'2-digit',month:'short',timeZone:NIGERIA_TIMEZONE});
}
function fmtTime(d){
  if(!d || !hasExplicitTime(d)) return '—';
  const dt = parseDisplayDate(d);
  if(!dt) return '—';
  return dt.toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:NIGERIA_TIMEZONE});
}
function ymdLocal(d){
  const dt = d instanceof Date ? d : new Date(d);
  if(isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,'0');
  const day = String(dt.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function uid(){ return Date.now().toString(36) }
function hasPermission(p){
  if(!state.user) return false;
  // IT Admins have unrestricted access to all features — no permission lookup needed
  if(state.user.role === 'it_admin') return true;
  const rp = state.rolePermissions?.[state.user.role];
  const perms = rp || PERMISSIONS[state.user.role] || [];
  return perms.includes('all') || perms.includes(p);
}
function requireAdmin(){
  if(state.user?.role !== 'it_admin'){ showAlert('Access denied. IT Administrators only.','danger'); return false; }
  return true;
}
function can(...ps){ return ps.some(p=>hasPermission(p)) }
function canCancelTopupRequest(request){
  return !!request && (state.user?.role==='it_admin' || state.user?.name===request.requestedBy);
}
const ACCESS_RULES = {
  pages: {
    dashboard:    { permissionsAny:['dashboard'] },
    transactions: { permissionsAny:['transactions'] },
    income:       { permissionsAny:['income','income_view'] },
    remittances:  { permissionsAny:['remittances','remittances_view'] },
    expenses:     { permissionsAny:['expenses','expenses_view'] },
    bank:         { permissionsAny:['bank'] },
    petty_cash:   { permissionsAny:['petty_request','petty_approve','petty_view'] },
    reports:      { permissionsAny:['reports'] },
    audit:        { permissionsAny:['audit'] },
    admin:        { roles:['it_admin'] }  // IT Admin only — never permission-gated
  },
  actions: {
    income_record: ['income'],
    income_deposit: ['income'],
    remittance_record_payment: ['remittances'],
    remittance_delete_pending: ['remittances'],
    // Funds In/Out: also lets the Admin Officer complete a zonal payment single-handed —
    // reuses the same permission that gates expense logging ('expenses'). Transferring
    // pool money into parish income is a separate, more sensitive action — see
    // satellite_fund_transfer below — and is deliberately NOT granted here.
    satellite_fund_record: ['remittances', 'expenses'],
    // Reclassifying held satellite money as parish income — Accountant/Pastor/IT only.
    satellite_fund_transfer: ['remittances'],
    satellite_fund_delete: ['remittances'],
    expense_log: ['expenses'],
    bank_withdrawal: ['income'],
    bank_charge: ['expenses'],
    petty_request: ['petty_request'],
    petty_topup_payment: ['income'],
    petty_approve_or_view: ['income','petty_approve'],
    // Depositing petty cash INTO the bank — the Admin Officer (custodian of the float)
    // and the Bank Signatory can both do this. Deliberately separate from
    // petty_approve_or_view, which governs approving/rejecting petty cash TOP-UP
    // requests — a different action with different intended holders.
    petty_to_bank: ['petty_to_bank'],
    income_delete: { roles:['it_admin'] },
    petty_delete:  { roles:['it_admin'] },
    expense_edit_pending: { roles:['admin_officer','it_admin'] },
    expense_delete_pending: { roles:['admin_officer','it_admin'] },
    expense_delete_approved: ['expense_delete_approved'],
    topup_cancel: ({ request }) => canCancelTopupRequest(request)
  }
};
function evaluateAccessRule(rule, ctx={}){
  if(!state.user || !rule) return false;
  if(Array.isArray(rule)) return can(...rule);
  if(typeof rule === 'function') return !!rule(ctx);
  if(rule.roles && !rule.roles.includes(state.user.role)) return false;
  if(rule.permissionsAny && !can(...rule.permissionsAny)) return false;
  if(rule.permissionsAll && !rule.permissionsAll.every(hasPermission)) return false;
  return true;
}
function canAction(action, ctx={}){
  return evaluateAccessRule(ACCESS_RULES.actions[action], ctx);
}
function canAccessPage(page){
  const rule = ACCESS_RULES.pages[page];
  return rule ? evaluateAccessRule(rule) : false;
}
function monthLabel(){ return MONTHS[state.month]+' '+state.year }
function defaultExpenseStatusForCurrentUser(){
  return 'approved';
}
function filterByMonth(arr){
  return (arr||[]).filter(r=>{
    const d = new Date(r.date||r.createdAt||r.ts||0);
    return d.getMonth()===state.month && d.getFullYear()===state.year;
  });
}

function filterByDateRange(arr, fromDate, toDate){
  return (arr||[]).filter(r=>{
    const raw = new Date(r.date||r.createdAt||'');
    if(isNaN(raw.getTime())) return false;
    const d = ymdLocal(raw);
    return d >= fromDate && d <= toDate;
  });
}

// Expense status helpers.
// Admin Officer expenses are saved with 'pending_approval'; other roles save with 'approved'.
// 'pending' is treated as a legacy alias of 'pending_approval'. Both pending statuses still
// represent payments already made (the bank/cash/petty float was debited the moment the
// expense was logged) — so for balance and period totals we treat them the same as approved.
function isLoggedExpense(e){
  if(!e) return false;
  return e.status === 'approved' || e.status === 'pending' || e.status === 'pending_approval';
}
function isPendingExpense(e){
  if(!e) return false;
  return e.status === 'pending' || e.status === 'pending_approval';
}

// A petty cash advance debits the float at approval time but the expense record is only
// created when the Admin Officer settles with a receipt (and then it carries a pettyRef).
// To compute period totals correctly we count the advance ONCE — at the float-debit moment —
// and exclude the duplicate settle-expense via its pettyRef.
function isApprovedOrSettledAdvance(h){
  return h && h.type === 'advance' && (h.status === 'approved' || h.status === 'settled');
}
// The date a petty cash advance actually moved money. Falls back to createdAt for older
// records that may pre-date the approvedAt field.
function pettyAdvanceImpactDate(h){
  return (h?.approvedAt || h?.createdAt || h?.date || '').slice(0,10);
}
function pettyAdvanceImpactAmount(h){
  if(!h) return 0;
  // Settled advances may have an actualAmount that differs from the originally approved
  // amount (under/overspend) — use the actual when present.
  return h.status === 'settled'
    ? (h.actualAmount != null ? h.actualAmount : (h.amount||0))
    : (h.amount||0);
}

function computeRemPeriodDates(settings, allRems, year, month){
  const cutoffConfig = getRemCutoffDates(settings, year);
  const cutoffYear   = cutoffConfig ? Number(cutoffConfig.year) : null;
  const cutoffDay    = (cutoffConfig && cutoffYear === year && Number.isInteger(cutoffConfig.dates[month]))
    ? cutoffConfig.dates[month] : null;
  if(cutoffDay){
    const to = ymdLocal(new Date(year, month, cutoffDay));
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear  = month === 0 ? year - 1 : year;
    const prevCfg   = getRemCutoffDates(settings, prevYear);
    const prevDay   = (prevCfg && Number.isInteger(prevCfg.dates[prevMonth]) && Number(prevCfg.year) === prevYear)
      ? prevCfg.dates[prevMonth] : null;
    let from;
    if(prevDay){
      const d = new Date(prevYear, prevMonth, prevDay);
      d.setDate(d.getDate() + 1);
      from = ymdLocal(d);
    } else {
      from = ymdLocal(new Date(year, month, 1));
    }
    return { from, to };
  }
  // Fallback: day after last paid remittance, or first of month
  const lastPaid = (allRems||[]).filter(r=>r.status==='paid')
    .sort((a,b)=>new Date(b.paidDate||b.createdAt||0)-new Date(a.paidDate||a.createdAt||0))[0];
  if(lastPaid){
    const d = new Date(lastPaid.paidDate||lastPaid.createdAt||0);
    if(!isNaN(d.getTime())){ d.setDate(d.getDate()+1); return { from: ymdLocal(d), to: ymdLocal(new Date()) }; }
  }
  return { from: ymdLocal(new Date(year, month, 1)), to: ymdLocal(new Date(year, month+1, 0)) };
}

/** Returns the calendar {year, month} that contains the END of the currently active
 *  remittance period (the one that's open for collections right now).
 *  E.g. May 28 with May cut-off=24 → {year:2026, month:5} (June, since the active
 *  period runs May 25 – June 24). May 20 with the same cut-off → {2026, 4} (May). */
function getCurrentRemPeriodAnchor(settings, allRems){
  const today = new Date();
  const tYear = today.getFullYear();
  const tMonth = today.getMonth();
  const tStr = ymdLocal(today);
  const { to: thisTo } = computeRemPeriodDates(settings, allRems, tYear, tMonth);
  if(thisTo >= tStr) return { year: tYear, month: tMonth };
  const nextMonth = tMonth === 11 ? 0 : tMonth + 1;
  const nextYear  = tMonth === 11 ? tYear + 1 : tYear;
  return { year: nextYear, month: nextMonth };
}

/** Smart default {year, month} for the given mode based on today's date. */
function getDefaultMonthForMode(mode, settings, allRems){
  if(mode === 'remittance') return getCurrentRemPeriodAnchor(settings, allRems);
  const today = new Date();
  return { year: today.getFullYear(), month: today.getMonth() };
}

/** Refresh state.upcomingPeriodAnchor and, unless the user has manually picked a
 *  month, snap state.month/year to the smart default for the current period mode. */
async function applySmartDefaultMonth(){
  const [settings, allRems] = await Promise.all([DB.getSettings(), DB.getRemittances()]);
  state.upcomingPeriodAnchor = getCurrentRemPeriodAnchor(settings, allRems);
  if(state.userPickedMonth) return;
  const { year, month } = getDefaultMonthForMode(state.periodMode, settings, allRems);
  state.year = year;
  state.month = month;
}

/** Returns the {from, to} date range for the current selection, based on
 *  state.periodMode + state.year/month. Used by Bank, Income, Expenses. */
async function getCurrentPeriodRange(){
  if(state.periodMode === 'remittance'){
    const [settings, allRems] = await Promise.all([DB.getSettings(), DB.getRemittances()]);
    return computeRemPeriodDates(settings, allRems, state.year, state.month);
  }
  return {
    from: ymdLocal(new Date(state.year, state.month, 1)),
    to: ymdLocal(new Date(state.year, state.month+1, 0))
  };
}

/** Filter records by the current period (calendar month or remittance period). */
function filterByCurrentPeriod(arr, from, to){
  if(state.periodMode === 'remittance') return filterByDateRange(arr, from, to);
  return filterByMonth(arr);
}

/** Return the quota list as an array of {label, amount} objects.
 *  Migrates legacy settings.quotas key-value map to the new settings.quotaList array format. */
function getQuotaList(s){
  if(Array.isArray(s?.quotaList)) return s.quotaList;
  // Migrate legacy object format
  const legacy=s?.quotas||DEFAULT_QUOTAS;
  return Object.entries(legacy)
    .filter(([k])=>k in QUOTA_LABELS)
    .map(([k,v])=>({ label:QUOTA_LABELS[k], amount:v||0 }));
}

function parseYmdDate(value){
  const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(match) return new Date(Number(match[1]), Number(match[2])-1, Number(match[3]));
  const d=new Date(value||'');
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isMummyQuotaLabel(label){
  return String(label||'').toLowerCase().includes('mummy');
}

function countSundaysInRange(fromValue, toValue){
  const from=parseYmdDate(fromValue);
  const to=parseYmdDate(toValue);
  if(!from || !to || from>to) return 0;
  let count=0;
  for(let d=new Date(from.getFullYear(), from.getMonth(), from.getDate()); d<=to; d.setDate(d.getDate()+1)){
    if(d.getDay()===0) count++;
  }
  return count;
}


function getWATNowParts(now=new Date()){
  const wat = new Date(now.getTime() + (60 * 60 * 1000)); // WAT = UTC+1
  return {
    year: wat.getUTCFullYear(),
    month: wat.getUTCMonth()+1,
    day: wat.getUTCDate(),
    hour: wat.getUTCHours(),
    minute: wat.getUTCMinutes()
  };
}

function countAccruedSundaysInRange(fromValue, toValue, now=new Date()){
  const from=parseYmdDate(fromValue);
  const to=parseYmdDate(toValue);
  if(!from || !to || from>to) return 0;
  const watNow=getWATNowParts(now);
  // Build a plain local-midnight Date from WAT parts so comparisons stay in the same coordinate space as the loop iterator
  const watTodayLocal=new Date(watNow.year, watNow.month-1, watNow.day);
  const isAfterSundayAccrualCutoff = (watNow.hour>11) || (watNow.hour===11 && watNow.minute>=30);
  let count=0;
  for(let d=new Date(from.getFullYear(), from.getMonth(), from.getDate()); d<=to; d.setDate(d.getDate()+1)){
    if(d.getDay()!==0) continue;
    if(d < watTodayLocal){ count++; continue; }
    if(d.getTime()===watTodayLocal.getTime() && isAfterSundayAccrualCutoff){ count++; }
  }
  return count;
}

function getQuotaLinesForPeriod(quotas, fromDate, toDate){
  const list=Array.isArray(quotas)?quotas:[];
  const from=parseYmdDate(fromDate);
  const toRaw=parseYmdDate(toDate);
  const now=new Date();
  const todayDate=new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to=(toRaw && toRaw>todayDate) ? todayDate : toRaw;
  if(from && to && from>to) return [];
  const canProrate=!!from && !!to && from<=to;
  const fullPeriodEnd=(toRaw && from && toRaw>=from) ? toRaw : to;
  const coveredSundays=canProrate ? countAccruedSundaysInRange(from, to, now) : 0;
  const periodSundays=canProrate ? countSundaysInRange(from, fullPeriodEnd) : 0;

  return list.map(q=>{
    const label=q?.label||'';
    const periodAmount=Number(q?.amount||0);
    if(!(periodAmount>0)) return null;
    if(!canProrate){
      return { label, amount:periodAmount, section:'quota', monthlyAmount:periodAmount, isProrated:false, basis:'Fixed remittance-period amount' };
    }
    if(periodSundays<=0) return null;
    const amount = periodAmount * (coveredSundays / periodSundays);
    const basis = `Proportion of ${coveredSundays} of ${periodSundays} Sundays in the rem. period.`;
    return { label, amount, section:'quota', monthlyAmount:periodAmount, isProrated:true, basis };
  }).filter(Boolean);
}



function isQuotaFullyAccrued(q){
  const full=Number(q?.monthlyAmount||0);
  const amt=Number(q?.amount||0);
  return full>0 && amt >= (full - 0.01);
}

function quotaTypeTextForReport(q){
  if(isQuotaFullyAccrued(q)) return 'Fixed';
  return q?.isProrated ? `Fixed • ${q.basis}` : 'Fixed';
}

function sumQuotaLines(lines){
  return (lines||[]).reduce((s,l)=>s+(l.amount||0),0);
}

/**
 * Correctly accumulates fixed quotas across multiple remittance periods.
 *
 * getQuotaLinesForPeriod() treats quota.amount as the total for ONE period and
 * prorates by the Sunday ratio within that period. Passing it a date range that
 * spans N remittance periods yields only 1× quota.amount instead of the correct
 * N× accumulated total. This function iterates each period individually and sums.
 *
 * @param {Array}  quotas         - quota list (from getQuotaList)
 * @param {Object} settings       - app settings (needed by computeRemPeriodDates)
 * @param {Array}  allRems        - all remittance records (needed by fallback period logic)
 * @param {string} firstIncDateStr - date of the earliest income record (YYYY-MM-DD)
 * @param {string} asOfDateStr    - upper bound date (YYYY-MM-DD); typically today or period end
 */
function accumQuotasAcrossPeriods(quotas, settings, allRems, firstIncDateStr, asOfDateStr){
  if(!firstIncDateStr || !asOfDateStr) return 0;
  const firstDate = parseYmdDate(firstIncDateStr);
  if(!firstDate) return 0;

  let total = 0;
  let scanYear = firstDate.getFullYear();
  let scanMonth = firstDate.getMonth();
  const LIMIT = 72; // safety cap — 6 years of monthly periods
  let prevPFrom = null;

  for(let i = 0; i < LIMIT; i++){
    const { from: pFrom, to: pTo } = computeRemPeriodDates(settings, allRems, scanYear, scanMonth);

    // Guard: if no cut-off dates are configured the fallback may return the same
    // period for every month, which would cause infinite accumulation.
    if(pFrom === prevPFrom) break;
    prevPFrom = pFrom;

    // Stop once the period begins after the as-of date.
    if(pFrom > asOfDateStr) break;

    // Only include periods that overlap the range [firstIncDateStr, asOfDateStr].
    // getQuotaLinesForPeriod handles "cap at today" for the current period internally.
    if(pTo >= firstIncDateStr){
      total += sumQuotaLines(getQuotaLinesForPeriod(quotas, pFrom, pTo));
    }

    if(scanMonth === 11){ scanYear++; scanMonth = 0; }
    else{ scanMonth++; }
  }

  return total;
}

/** Escape special HTML characters to prevent XSS when inserting user data into innerHTML */
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') }

/**
 * Set a button into a loading state (disabled + spinner).
 * Returns a restore function to re-enable it; the restore is also auto-called after 30 s
 * as a safety net in case an error path forgets to restore it.
 */
function setBtnLoading(btn, text='Loading…'){
  if(!btn) return ()=>{};
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="btn-spinner-sm"></span> ${text}`;
  const timer = setTimeout(()=>{ btn.disabled=false; btn.innerHTML=orig; }, 120000);
  return function restore(){ clearTimeout(timer); btn.disabled=false; btn.innerHTML=orig; };
}

// Remittance engine
async function getRemRates(){
  const s = await DB.getSettings();
  const r = s.remittanceRates || DEFAULT_REMITTANCE_RATES;
  return {
    rates: r,
    tgNational:       r.tgNational        ?? DEFAULT_REMITTANCE_RATES.tgNational,
    tgArea:           r.tgArea            ?? DEFAULT_REMITTANCE_RATES.tgArea,
    tgPastor:         r.tgPastor          ?? DEFAULT_REMITTANCE_RATES.tgPastor,
    tgMinisters:      r.tgMinisters       ?? DEFAULT_REMITTANCE_RATES.tgMinisters,
    tgSeed:           r.tgSeed            ?? DEFAULT_REMITTANCE_RATES.tgSeed,
    provinceRebate:   r.provinceRebate    ?? DEFAULT_REMITTANCE_RATES.provinceRebate,
    crmAddon:         r.crmAddon          ?? DEFAULT_REMITTANCE_RATES.crmAddon,
    coastline:        r.coastline         ?? DEFAULT_REMITTANCE_RATES.coastline,
    insuranceGenTithe:r.insuranceGenTithe ?? DEFAULT_REMITTANCE_RATES.insuranceGenTithe,
    insuranceMinTithe:r.insuranceMinTithe ?? DEFAULT_REMITTANCE_RATES.insuranceMinTithe
  };
}

function getChildrenOfferingLocalRate(remRates = DEFAULT_REMITTANCE_RATES){
  const localRate = remRates?.childrenOffering?.local;
  if(typeof localRate === 'number' && Number.isFinite(localRate) && localRate >= 0) return localRate;
  return DEFAULT_REMITTANCE_RATES.childrenOffering.local;
}

function getChildrenTeacherHeldCash(record, remRates = DEFAULT_REMITTANCE_RATES){
  const isSunday = !record?.source || record?.source==='sunday_collection';
  if(!isSunday) return 0;
  const childrenOffering = Number(record?.childrenOffering || 0);
  if(childrenOffering <= 0) return 0;
  return Math.max(0, childrenOffering * getChildrenOfferingLocalRate(remRates));
}

function getSundayCashWithAccountant(record, remRates = DEFAULT_REMITTANCE_RATES){
  const total = Number(record?.totalCollection || 0);
  const bankTransfer = Number(record?.bankTransferAmount || 0);
  const directPetty = Number(record?.directPettyCash || 0);
  const childrenTeacherHeld = getChildrenTeacherHeldCash(record, remRates);
  return Math.max(0, total - bankTransfer - directPetty - childrenTeacherHeld);
}

function getIncomeCashWithAccountant(record, remRates = DEFAULT_REMITTANCE_RATES){
  const isSunday = !record?.source || record?.source === 'sunday_collection';
  if(isSunday) return getSundayCashWithAccountant(record, remRates);
  const total = Number(record?.totalCollection || 0);
  const bankTransfer = Number(record?.bankTransferAmount || 0);
  const directPetty = Number(record?.directPettyCash || 0);
  return Math.max(0, total - bankTransfer - directPetty);
}

// Consolidate split cash_deposit records from the same bulk deposit action into single
// display items. Records are linked by groupId (new) or by matching reference+date+method
// created within 2 minutes of each other (legacy records before groupId was added).
function groupCashDeposits(deposits) {
  const byGroupId = new Map();
  const noGroupId = [];
  for (const t of deposits) {
    if (t.groupId) {
      if (!byGroupId.has(t.groupId)) byGroupId.set(t.groupId, []);
      byGroupId.get(t.groupId).push(t);
    } else {
      noGroupId.push(t);
    }
  }

  const byLegacyKey = new Map();
  for (const t of noGroupId) {
    // Include reference when present; photo-only deposits (no reference) are keyed
    // by date+method alone — the 2-minute window below prevents false grouping.
    const refPart = t.reference || '';
    const key = `${t.date}|${refPart}|${t.depositMethod}`;
    if (!byLegacyKey.has(key)) byLegacyKey.set(key, []);
    byLegacyKey.get(key).push(t);
  }

  function mergeDeposits(records) {
    if (records.length === 1) return records[0];
    const sorted = [...records].sort((a,b) => new Date(a.createdAt||0) - new Date(b.createdAt||0));
    const total = records.reduce((s,r) => s + (r.amount||0), 0);
    return { ...sorted[0], amount: total, _splitParts: sorted };
  }

  const result = [];
  for (const records of byGroupId.values()) result.push(mergeDeposits(records));
  for (const records of byLegacyKey.values()) {
    if (records.length > 1) {
      const times = records.map(r => new Date(r.createdAt||0).getTime()).sort((a,b)=>a-b);
      if (times[times.length-1] - times[0] <= 2 * 60 * 1000) {
        result.push(mergeDeposits(records));
        continue;
      }
    }
    result.push(...records);
  }
  return result;
}

// Global chronological FIFO reconciliation of the accountant's cash pool.
//
// The accountant holds a single fungible pile of cash. Each income record's
// "cash with accountant" is an inflow lot, deposits/expenses/petty top-ups are
// outflows. Per-record bookkeeping (incomeRef on deposits/expenses) is just a
// preference hint — what actually matters is that outflows consume from oldest
// non-empty lot first. This produces a per-income breakdown whose sums always
// reconcile with the global cashWithAccountant, regardless of how the user
// originally tagged individual records.
//
// Returns Map<incomeId, {cashHeld, deposited, expenseCovering, stillPending, isReconciled}>
// where the four numeric fields summed over all incomeIds (plus any
// bank-to-accountant inflow remainders) equal the global cash balance.
//
// allPetty is optional — pass it when available so petty top-ups paid from
// accountant's cash are reflected in per-record stillPending. Callers that
// omit it get a slightly conservative answer (over-reports stillPending).
function buildExpenseCoveringMap(allIncome, allCashTx, remRates, allExpenses, allPetty){
  const map = new Map();

  // 1. Inflow lots — income records that hold cash, plus bank-to-accountant withdrawals.
  const lots = [];
  const inflowEvents = [];
  for(const r of (allIncome||[])){
    const cashHeld = getIncomeCashWithAccountant(r, remRates);
    if(cashHeld<=0) continue;
    inflowEvents.push({ ts:new Date(r.date||r.createdAt).getTime(), incomeId:r.id, amount:cashHeld });
  }
  for(const t of (allCashTx||[])){
    if(t.type==='withdrawal' && t.destination==='accountant_cash' && (t.amount||0)>0){
      inflowEvents.push({ ts:new Date(t.date||t.createdAt).getTime(), incomeId:null, amount:t.amount });
    }
  }
  inflowEvents.sort((a,b)=>a.ts-b.ts);
  for(const ev of inflowEvents){
    lots.push({ incomeId:ev.incomeId, ts:ev.ts, original:ev.amount, remaining:ev.amount, deposited:0, expensed:0, expenseAllocations:[], depositAllocations:[], pettyAllocations:[] });
  }
  if(!lots.length) return map;

  // 2. Outflows — cash deposits, cash expenses, petty top-ups from accountant's cash.
  const outflows = [];
  for(const t of (allCashTx||[])){
    if(t.type==='cash_deposit' && (t.amount||0)>0){
      outflows.push({ ts:new Date(t.date||t.createdAt).getTime(), kind:'deposit', sourceId:t.id, incomeRef:t.incomeRef||'', amount:t.amount });
    }
  }
  for(const e of (allExpenses||[]).filter(isLoggedExpense)){
    const cashAmt = e.paymentMethod==='cash'?(e.amount||0):e.paymentMethod==='split'?(e.cashAmount||0):0;
    if(cashAmt<=0) continue;
    outflows.push({ ts:new Date(e.date||e.createdAt).getTime(), kind:'expense', sourceId:e.id, incomeRef:e.incomeRef||'', amount:cashAmt });
  }
  for(const h of (allPetty||[])){
    if(h.type!=='refill') continue;
    if(h.status!=='approved' && h.status!=='settled') continue;
    const cashAmt = h.paymentMethod==='cash_accountant'?(h.amount||0):h.paymentMethod==='split'?(h.cashAmount||0):0;
    if(cashAmt<=0) continue;
    outflows.push({ ts:new Date(h.date||h.createdAt).getTime(), kind:'petty', sourceId:h.id, incomeRef:'', amount:cashAmt });
  }
  outflows.sort((a,b)=>a.ts-b.ts);

  // 3. Consume lots — preferred lot first (if outflow carries a hint), then FIFO across all lots.
  function consume(amount, kind, preferredIncomeRef, sourceId){
    function applyToLot(lot, take){
      lot.remaining -= take;
      if(kind==='deposit'){ lot.deposited += take; lot.depositAllocations.push({id:sourceId, amount:take}); }
      else if(kind==='expense'){ lot.expensed += take; lot.expenseAllocations.push({id:sourceId, amount:take}); }
      else if(kind==='petty'){ lot.pettyAllocations.push({id:sourceId, amount:take}); }
    }
    if(preferredIncomeRef){
      for(const lot of lots){
        if(amount < 0.005) break;
        if(lot.incomeId !== preferredIncomeRef) continue;
        if(lot.remaining < 0.005) continue;
        const take = Math.min(lot.remaining, amount);
        applyToLot(lot, take);
        amount -= take;
      }
    }
    for(const lot of lots){
      if(amount < 0.005) break;
      if(lot.remaining < 0.005) continue;
      const take = Math.min(lot.remaining, amount);
      applyToLot(lot, take);
      amount -= take;
    }
    // Any leftover here means recorded outflows exceeded recorded inflows — a real
    // data discrepancy. Surfaced via the global cashWithAccountant going negative
    // (clamped at 0 in calcChurchBalance, but cashDeficit reports it).
  }
  for(const o of outflows) consume(o.amount, o.kind, o.incomeRef, o.sourceId);

  // 4. Aggregate per income record.
  for(const lot of lots){
    if(lot.incomeId == null) continue;  // untagged bank-to-accountant inflow lot
    const prior = map.get(lot.incomeId);
    const data = prior || { cashHeld:0, deposited:0, expenseCovering:0, stillPending:0, expenseAllocations:[], depositAllocations:[], pettyAllocations:[] };
    data.cashHeld += lot.original;
    data.deposited += lot.deposited;
    data.expenseCovering += lot.expensed;
    data.stillPending += lot.remaining;
    data.expenseAllocations.push(...lot.expenseAllocations);
    data.depositAllocations.push(...lot.depositAllocations);
    data.pettyAllocations.push(...lot.pettyAllocations);
    map.set(lot.incomeId, data);
  }
  for(const v of map.values()) v.isReconciled = v.stillPending <= 0.5;
  return map;
}

// Returns the ID of the most recent cash-holding income record whose date is on or
// before expenseDate. Used when saving a cash/split expense to link it directly to
// the cash pool it drew from. The linkage is a preference hint for the FIFO
// reconciler — it gives the expense first-dibs on that record's lot before
// falling back to oldest-non-empty across the whole pool.
//
// When allCashTx is provided, prefer records that still have undeposited cash so
// the hint doesn't push the expense into a lot that's already fully deposited
// (which would force FIFO to fall back anyway).
function findIncomeRefForCashExpense(expenseDate, allIncome, remRates, allCashTx){
  const candidates = (allIncome||[])
    .filter(r=>{
      const d = r.date||r.createdAt||'';
      if(d > expenseDate) return false;
      return getIncomeCashWithAccountant(r, remRates) > 0;
    })
    .sort((a,b)=>new Date(b.date||b.createdAt)-new Date(a.date||a.createdAt));
  if(allCashTx){
    for(const r of candidates){
      const cashHeld = getIncomeCashWithAccountant(r, remRates);
      const deposited = allCashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
      if(cashHeld - deposited > 0.5) return r.id;
    }
  }
  return candidates[0]?.id || '';
}

// One-time backfill: assigns incomeRef to any existing cash/split expenses that
// were recorded before the direct-link column existed. Safe to call on every
// startup — it short-circuits immediately when nothing needs updating.
async function backfillExpenseIncomeRefs(){
  try {
    const [allInc, allExp, remRatesData] = await Promise.all([DB.getIncome(), DB.getExpenses(), getRemRates()]);
    const remRates = remRatesData.rates || DEFAULT_REMITTANCE_RATES;
    const needsBackfill = allExp.filter(e=>
      isLoggedExpense(e) && !e.incomeRef &&
      (e.paymentMethod==='cash' || e.paymentMethod==='split')
    );
    if(!needsBackfill.length) return;
    const cashIncome = allInc
      .filter(r=>{
        return getIncomeCashWithAccountant(r, remRates) > 0;
      })
      .sort((a,b)=>new Date(a.date||a.createdAt)-new Date(b.date||b.createdAt));
    let count = 0;
    for(const e of needsBackfill){
      const expDate = e.date||e.createdAt||'';
      let match = null;
      for(let i=cashIncome.length-1; i>=0; i--){
        if((cashIncome[i].date||cashIncome[i].createdAt||'') <= expDate){ match=cashIncome[i]; break; }
      }
      if(match){ await DB.updateExpense(e.id, {incomeRef: match.id}); count++; }
    }
    if(count>0){
      DB.addAudit('backfill_expense_income_refs',`Backfilled incomeRef on ${count} expense record(s)`,'System');
      _apiCache.delete('expenses');
    }
  } catch(err){ console.error('backfillExpenseIncomeRefs:', err); }
}

function totalRemittanceDue(remCalc, quotas = 0){
  return (remCalc?.totalNatl || 0)
    + (remCalc?.totalArea || 0)
    + (remCalc?.totalPastor || 0)
    + (remCalc?.totalMinisters || 0)
    + (remCalc?.totalSeed || 0)
    + (remCalc?.provinceRebate || 0)
    + (remCalc?.crmAddon || 0)
    + (remCalc?.coastline || 0)
    + (remCalc?.insuranceGen || 0)
    + (remCalc?.insuranceMin || 0)
    + (quotas || 0);
}

// satelliteTransferredToParish: satellite_funds 'transfer_out' amount(s) reclassified
// into the parish's own money during this period (see calcChurchBalance's
// heldForSatellites). This money never touched income/expenses, so it is not present
// in totalIncome — it must be added here explicitly or this flow-reconstruction would
// under-count relative to calcChurchBalance's actual total. Pass 0 (default) for a
// caller whose own totalIncome already folds in the 'gift' portion — see
// buildMonthlyStatementData, which instead relies on the "Adjustments" line to absorb
// any residual (reimbursement/correction) drift.
function calcChurchBalanceFromOpening(openingBalance, totalIncome, childrenTeacherHold, totalExpenses, remittancesPaid, satelliteTransferredToParish = 0){
  return openingBalance + (totalIncome - childrenTeacherHold) - totalExpenses - remittancesPaid + satelliteTransferredToParish;
}

function calcOutstandingRemittancesFromFlow(openingOutstandingRems, currentPeriodRemDue, periodRemittancesPaid){
  return Math.max(0, openingOutstandingRems + currentPeriodRemDue - periodRemittancesPaid);
}

function calcCurrentPeriodOutstandingRemittance(currentPeriodRemDue, periodRemittancesPaid, totalOutstandingRems = Number.POSITIVE_INFINITY){
  return Math.min(
    Math.max(0, currentPeriodRemDue - periodRemittancesPaid),
    Number.isFinite(totalOutstandingRems) ? Math.max(0, totalOutstandingRems) : Number.POSITIVE_INFINITY
  );
}

// See calcChurchBalanceFromOpening for satelliteTransferredToParish.
function calcAvailableFundFromOpening(openingBalance, openingOutstandingRems, totalIncome, childrenTeacherHold, totalExpenses, currentPeriodRemDue, satelliteTransferredToParish = 0){
  return (openingBalance - openingOutstandingRems) + (totalIncome - childrenTeacherHold) - totalExpenses - currentPeriodRemDue + satelliteTransferredToParish;
}

/**
 * Effective settlement date for "as of X" historical filtering. A 'paid' record
 * settles on its paidDate (real cash left the bank that day). A 'written_off'
 * record retroactively resolves the ORIGINAL period's obligation — it should be
 * effective as of that period's close (periodTo), not the date the write-off was
 * clicked. Otherwise every past-period dashboard snapshot and every report whose
 * as-of date falls before "today" would still show the shortfall as outstanding,
 * even though it was already written off.
 */
function remittanceSettledDate(r){
  if(r?.status === 'written_off' && r?.periodTo) return String(r.periodTo).slice(0,10);
  return String(r?.paidDate || r?.createdAt || '').slice(0,10);
}

async function calcRemittances(income, preRates){
  const rr = preRates || await getRemRates();
  const res = { lines:[], totalNatl:0, totalArea:0, totalPastor:0, totalMinisters:0, totalSeed:0,
                localBefore:0, localTithe:0, provinceRebate:0, netLocal:0,
                crmAddon:0, coastline:0, insuranceGen:0, insuranceMin:0 };
  let rawCrm=0, rawMembersTithe=0, rawMinisTithe=0;
  INCOME_TYPES.forEach(t=>{
    const amt = income[t.key]||0;
    if(!amt) return;
    if(t.special==='tg'){
      const line = { key:t.key, label:t.label, isTg:true, total:amt, national: amt*rr.tgNational, area: amt*rr.tgArea,
        pastor: amt*rr.tgPastor, ministers: amt*rr.tgMinisters, seed: amt*(rr.tgSeed||0), local:0 };
      res.lines.push(line);
      res.totalNatl+=line.national; res.totalArea+=line.area;
      res.totalPastor+=line.pastor; res.totalMinisters+=line.ministers; res.totalSeed+=line.seed;
    } else {
      const rateEntry = (rr.rates[t.key]) || { natl: t.natl||0, local: t.local||0 };
      const local = amt*(rateEntry.local);
      const natl  = amt*(rateEntry.natl);
      res.lines.push({ key:t.key, label:t.label, total:amt, national:natl, local });
      res.totalNatl+=natl; res.localBefore+=local;
      if(t.key==='membersTithe'){ res.localTithe+=local; rawMembersTithe=amt; }
      if(t.key==='ministersTithe'){ res.localTithe+=local; rawMinisTithe=amt; }
      if(t.key==='crm') rawCrm=amt;
    }
  });
  // Province Rebate = 20% of local retained tithes (Members' Tithe + Ministers' Tithe)
  res.provinceRebate = res.localTithe * rr.provinceRebate;
  // Additional RCCG levies computed from raw collection totals
  res.crmAddon    = rawCrm          * (rr.crmAddon          || 0);
  res.coastline   = rawMinisTithe   * (rr.coastline          || 0);
  res.insuranceGen= rawMembersTithe * (rr.insuranceGenTithe  || 0);
  res.insuranceMin= rawMinisTithe   * (rr.insuranceMinTithe  || 0);
  res.netLocal = res.localBefore - res.provinceRebate - res.crmAddon - res.coastline - res.insuranceGen - res.insuranceMin;
  return res;
}

function showModal(html){ const o=document.createElement('div'); o.className='modal-overlay'; o.id='modalOverlay'; o.innerHTML=`<div class="modal">${html}</div>`; document.body.appendChild(o) }
function closeModal(){ const o=document.getElementById('modalOverlay'); if(o) o.remove() }
function showAlert(msg,type='success'){
  const a=document.createElement('div'); a.className=`alert alert-${type}`;
  const icon=document.createElement('span'); icon.className='alert-icon'; icon.textContent=type==='success'?'✓':type==='danger'?'✕':'⚠';
  const txt=document.createElement('span'); txt.textContent=msg;
  a.appendChild(icon); a.appendChild(txt);
  const duration = type==='danger' ? 6000 : 4000;
  const modal = document.querySelector('#modalOverlay .modal');
  if(modal){ modal.insertBefore(a,modal.firstChild); a.scrollIntoView({behavior:'smooth',block:'nearest'}); setTimeout(()=>a.remove(),duration); return; }
  const pc=document.getElementById('pageContent'); if(pc){ pc.insertBefore(a,pc.firstChild); setTimeout(()=>a.remove(),duration) }
}
async function updateNotifBadge(){ try{ const notifs=await DB.getNotifications(); const unread=notifs.filter(n=>!n.read).length; const el=document.getElementById('notifCount'); if(el){ el.textContent=unread; el.style.display=unread?'flex':'none' } }catch(e){ console.warn('Failed to update notification badge:', e) } }

// ──────────────────────────────────────────
// 5. AUTH
// ──────────────────────────────────────────
async function onRoleChange(){
  const role = document.getElementById('roleSelect').value;
  const wrap = document.getElementById('userSelectWrap');
  const sel = document.getElementById('userSelect');
  if(!role){ wrap.style.display='none'; return }
  // Only show name selector for roles known to have multiple users
  const multiRoles = ['signatory'];
  if(!multiRoles.includes(role)){ wrap.style.display='none'; return }
  try {
    const allUsers = await DB.getUsers();
    const users = allUsers.filter(u=>u.role===role);
    if(users.length>1){
      wrap.style.display='block';
      sel.innerHTML = users.map(u=>`<option value="${u.id}">${u.name}</option>`).join('');
    } else { wrap.style.display='none'; }
  } catch(e){
    wrap.style.display='none'; // fail silently — login() will handle the real auth
  }
}

async function login(btn=null){
  if(state.loginBusy) return;
  const role = document.getElementById('roleSelect').value;
  const pin = document.getElementById('pinInput').value.trim();
  const errEl = document.getElementById('loginError');
  if(!role||!pin){ errEl.textContent='Please select a role and enter your PIN.'; errEl.style.display='block'; return }
  const loginBtn = btn || document.querySelector('#loginScreen .hp-signin-btn');
  const roleEl = document.getElementById('roleSelect');
  const pinEl = document.getElementById('pinInput');
  const userEl = document.getElementById('userSelect');
  const setFormDisabled = (disabled)=>{
    [roleEl, pinEl, userEl].forEach(el=>{ if(el) el.disabled = !!disabled; });
  };
  state.loginBusy = true;
  setFormDisabled(true);
  const restore = setBtnLoading(loginBtn, 'Signing in…');
  try {
    // Ensure tables exist — silently ignore if this fails (may already be initialised)
    try { await apiFetch('init'); } catch(initErr) { console.warn('init skipped:', initErr.message); }
    const uid = role==='signatory' ? (document.getElementById('userSelect')?.value || '') : '';
    const user = await DB.login({ role, pin, userId: uid || undefined });
    errEl.style.display='none';
    state.user = user;
    try { localStorage.setItem('rccgSession', JSON.stringify(user)); } catch(e) {}
    DB.addAudit('login','User logged in',user.name);
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('appShell').style.display='flex';
    DB.getSettings().then(s=>{ state.rolePermissions = s.rolePermissions||null; initApp(); });
  } catch(e) {
    const msg = String(e?.message || '');
    if(msg.toLowerCase().includes('invalid credentials')){
      errEl.textContent='Incorrect PIN. Please try again.';
      document.getElementById('pinInput').value='';
    } else if(msg.toLowerCase().includes('please select your name')){
      errEl.textContent='Please select your name before signing in.';
    } else {
      errEl.textContent='Cannot connect to database: '+msg;
    }
    errEl.style.display='block';
    restore();
    setFormDisabled(false);
  } finally {
    state.loginBusy = false;
  }
}
function logout(){
  DB.addAudit('logout','User logged out', state.user?.name);
  try { localStorage.removeItem('rccgSession'); } catch(e) {}
  state.user=null; state.page='dashboard';
  history.replaceState(null,'','/');
  document.getElementById('appShell').style.display='none';
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('roleSelect').value='';
  document.getElementById('pinInput').value='';
  document.getElementById('userSelectWrap').style.display='none';
}

function showChangePinModal(){
  if(!state.user) return;
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">Change My PIN</div>
    <div class="form-group"><label class="form-label">Current PIN</label><input type="password" id="cp_current" class="form-input" maxlength="6" placeholder="Current PIN" inputmode="numeric" /></div>
    <div class="form-group"><label class="form-label">New PIN (4-6 digits)</label><input type="password" id="cp_new" class="form-input" maxlength="6" placeholder="New PIN" inputmode="numeric" /></div>
    <div class="form-group"><label class="form-label">Confirm New PIN</label><input type="password" id="cp_confirm" class="form-input" maxlength="6" placeholder="Confirm PIN" inputmode="numeric" /></div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.submitChangePin(this)">Update PIN</button></div>`);
}

async function submitChangePin(btn=null){
  if(!state.user) return;
  const currentPin = document.getElementById('cp_current')?.value?.trim() || '';
  const newPin = document.getElementById('cp_new')?.value?.trim() || '';
  const confirmPin = document.getElementById('cp_confirm')?.value?.trim() || '';
  if(!currentPin || !newPin || !confirmPin){ showAlert('Please fill all PIN fields.','danger'); return; }
  if(!PIN_REGEX.test(newPin)){ showAlert('New PIN must be 4-6 digits.','danger'); return; }
  if(newPin !== confirmPin){ showAlert('New PIN and confirmation do not match.','danger'); return; }
  const restore = setBtnLoading(btn, 'Updating…');
  try{
    if(!state.user?.id) throw new Error('Session error — please log out and back in.');
    const res = await DB.changePin({ userId: state.user.id, currentPin, newPin });
    // res is { success: true, id: '...' } on success — check either field
    if(!res?.success && !res?.id) throw new Error('PIN update returned unexpected response.');
    DB.addAudit('pin_changed','User changed own PIN',state.user?.name);
    closeModal();
    showAlert('PIN updated successfully! Use your new PIN next time you sign in.','success');
  }catch(e){
    restore();
    const msg = e.message || '';
    if(msg.toLowerCase().includes('current pin is incorrect') || msg.toLowerCase().includes('invalid credentials')){
      showAlert('Current PIN is incorrect. Please try again.','danger');
    } else {
      showAlert(msg || 'Failed to update PIN. Please try again.','danger');
    }
  }
}

// ──────────────────────────────────────────
// 6. NAVIGATION & ROUTER
// ──────────────────────────────────────────
const VALID_PAGES = ['dashboard','transactions','income','remittances','expenses','bank','petty_cash','reports','audit','admin'];

function pageFromPath(){
  const seg = window.location.pathname.replace(/^\//, '').replace(/\/$/, '');
  return VALID_PAGES.includes(seg) ? seg : 'dashboard';
}

function initApp(){
  buildMonthSelector();
  buildSidebar();
  buildBottomNav();
  updateSidebarUser();
  updateNotifBadge();
  navigate(pageFromPath(), true);
  // Fire-and-forget: link existing cash expenses to their income record.
  // Runs in the background; short-circuits once all records are already linked.
  backfillExpenseIncomeRefs();
  // Start version polling for auto-update detection
  startVersionPolling();
}

// ── Auto-update detection ─────────────────────────────────────────
let _loadedAppVersion = null;
function startVersionPolling(){
  // Initial load — record current version
  checkForNewVersion();
  // Poll every 60 seconds
  setInterval(checkForNewVersion, 60000);
}
async function checkForNewVersion(){
  try {
    const r = await fetch('/version.json?_=' + Date.now(), { cache: 'no-store' });
    if(!r.ok) return;
    const { v } = await r.json();
    if(!_loadedAppVersion){ _loadedAppVersion = v; return; }
    if(v !== _loadedAppVersion){
      showUpdateBanner();
    }
  } catch(e){ /* silently ignore — offline or version.json missing */ }
}
function showUpdateBanner(){
  if(document.getElementById('updateBanner')) return; // already showing
  const banner = document.createElement('div');
  banner.id = 'updateBanner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#0F6E56;color:#fff;padding:10px 16px;display:flex;align-items:center;justify-content:center;gap:12px;font-size:13px;font-weight:600;box-shadow:0 2px 12px rgba(0,0,0,0.2);animation:slideDown 0.3s ease-out';
  banner.innerHTML = `
    <span>🔄 A new version is available!</span>
    <button onclick="location.reload(true)" style="background:#fff;color:#0F6E56;border:none;padding:6px 16px;border-radius:20px;font-weight:700;font-size:12px;cursor:pointer">Refresh Now</button>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:rgba(255,255,255,0.7);font-size:18px;cursor:pointer;padding:0 4px">✕</button>
  `;
  document.body.prepend(banner);
  // Add slide-down animation
  if(!document.getElementById('updateBannerStyle')){
    const style = document.createElement('style');
    style.id = 'updateBannerStyle';
    style.textContent = '@keyframes slideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}';
    document.head.appendChild(style);
  }
}

// Handle browser back / forward
window.addEventListener('popstate', ()=>{
  if(!state.user) return;
  navigate(pageFromPath(), true);
});

// Handle hash changes for admin tab deep-linking
window.addEventListener('hashchange', ()=>{
  if(!state.user || state.page !== 'admin') return;
  const hashTab = (window.location.hash||'').replace(/^#admin-/,'').trim();
  if(hashTab && ['users','settings','quotas','rates','perms','backup'].includes(hashTab)){
    state.adminTab = hashTab;
    renderAdmin();
  }
});

function buildMonthSelector(){
  const sel = document.getElementById('globalMonth');
  if(!sel) return;
  sel.innerHTML = '';
  const today = new Date();
  // Upper bound for selectable months = the latest of:
  //   - today's calendar month,
  //   - the upcoming remittance period anchor (= next calendar month after a cut-off has passed),
  //   - the currently-selected month (in case the user navigated forward).
  let maxY = today.getFullYear(), maxM = today.getMonth();
  const anchor = state.upcomingPeriodAnchor;
  if(anchor && (anchor.year > maxY || (anchor.year === maxY && anchor.month > maxM))){
    maxY = anchor.year; maxM = anchor.month;
  }
  if(state.year > maxY || (state.year === maxY && state.month > maxM)){
    maxY = state.year; maxM = state.month;
  }
  for(let y=maxY; y>=maxY-2; y--){
    for(let m=11; m>=0; m--){
      if(y === maxY && m > maxM) continue;
      const opt = document.createElement('option');
      opt.value = `${y}-${m}`;
      opt.textContent = `${MONTHS[m]} ${y}`;
      if(y === state.year && m === state.month) opt.selected = true;
      sel.appendChild(opt);
    }
  }
}

function onMonthChange(){
  const [y,m] = document.getElementById('globalMonth').value.split('-').map(Number);
  state.year=y; state.month=m;
  // User has explicitly picked a month — disable the smart-default snap so the
  // selection sticks across page navigation and period-mode toggles.
  state.userPickedMonth = true;
  // Reset remittance period so it recalculates defaults for the new month
  state.remFromDate=null; state.remToDate=null;
  // Reset report period so it recalculates defaults for the new month
  state.reportFromDate=null; state.reportToDate=null;
  navigate(state.page);
}

async function buildSidebar(){
  let sections = {};
  NAV.forEach(item=>{
    if(!canAccessPage(item.id)) return;
    if(!sections[item.section]) sections[item.section]=[];
    sections[item.section].push(item);
  });
  const pendingCount = await getPettyCashPendingCount();
  const nav = document.getElementById('sidebarNav');
  let html='';
  Object.entries(sections).forEach(([sec,items])=>{
    html+=`<div class="nav-section">${sec}</div>`;
    items.forEach(item=>{
      const notifs = item.id==='petty_cash' ? pendingCount : 0;
      html+=`<div class="nav-item${state.page===item.id?' active':''}" onclick="App.navigate('${item.id}')" data-page="${item.id}">
        <span class="nav-icon">${item.icon}</span>${item.label}
        ${notifs>0?`<span class="nav-badge">${notifs}</span>`:''}
      </div>`;
    });
  });
  nav.innerHTML=html;
  // Append Change PIN action as the last item — available to all logged-in users
  nav.innerHTML += `<div class="nav-section">Account</div><div class="nav-item" onclick="App.showChangePinModal()"><span class="nav-icon">🔑</span>Change PIN</div>`;
}

function buildBottomNav(){
  const items = NAV.filter(n=>canAccessPage(n.id)).slice(0,5);
  const bn = document.getElementById('bottomNav');
  const inner = document.createElement('div');
  inner.className='bottom-nav-inner';
  inner.style.gridTemplateColumns=`repeat(${items.length},1fr)`;
  inner.innerHTML = items.map(item=>`
    <button class="bn-item${state.page===item.id?' active':''}" onclick="App.navigate('${item.id}')" data-page="${item.id}">
      <span style="font-size:20px">${item.icon}</span>${item.label.split(' ')[0]}
    </button>`).join('');
  bn.innerHTML='';
  bn.appendChild(inner);
}

function updateSidebarUser(){
  const u = state.user;
  if(!u) return;
  const r = ROLES[u.role];
  if(!r) return;
  const el = document.getElementById('sidebarUser');
  if(!el) return;
  el.innerHTML=`
    <strong>${u.name}</strong>
    <span style="display:inline-block;margin-top:4px;font-size:11px;padding:2px 8px;border-radius:10px;background:${r.bg};color:${r.color};font-weight:600">${r.label}</span>`;
}

async function navigate(page, fromHistory){
  if(!canAccessPage(page)){
    if(page!=='dashboard') showAlert('You do not have permission to access that page.','danger');
    page='dashboard';
  }
  state.page=page;
  // Update URL — push new entry unless this was triggered by the browser's own back/forward
  const newPath = '/' + (page === 'dashboard' ? '' : page);
  if(!fromHistory && window.location.pathname !== newPath){
    history.pushState({page}, '', newPath);
  }
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  document.querySelectorAll('.bn-item').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  const titles={dashboard:'Dashboard',transactions:'Transactions',income:'Record Income',remittances:'Remittances',
    expenses:'Expenses',bank:'Bank',petty_cash:'Petty Cash',reports:'Reports',audit:'Audit Log',admin:'IT Admin Panel'};
  document.getElementById('topBarTitle').textContent=titles[page]||page;
  // Paint the page skeleton immediately from synchronous state — no network — so a
  // slow connection sees the page's structure (and the loading progress bar) within
  // ~50ms instead of a bare "Loading…" string. Previously this was blocked behind the
  // chrome fetches below, so on a weak link the skeleton never showed until they
  // resolved.
  paintSkeleton(page, titles[page]||page);
  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
  // Close notifications
  document.getElementById('notifPanel').style.display='none';
  // Sidebar + notification badge are page chrome, not content — loading them must
  // never block the skeleton or the content fetch, so they run in the background.
  buildSidebar(); updateNotifBadge();
  // The smart default month decides which period the content is fetched for, so it
  // must settle before we render the real content (the skeleton is already visible).
  await applySmartDefaultMonth();
  buildMonthSelector();
  setTimeout(()=>{ renderPage(page).catch(e=>console.error(e)); },50);
}

// Paint the most specific skeleton available for a page, synchronously, so the
// user sees structure immediately. Pages with a bespoke loader fall back to the
// generic header + KPI skeleton.
function paintSkeleton(page, title){
  if(page === 'dashboard') return renderDashboardSkeleton();
  if(page === 'income')    return renderPageSkeleton({ pageTitle: 'Income Recording', pageSub: monthLabel(), kpiCount: 3, hint: 'Loading income…' });
  if(page === 'expenses')  return renderPageSkeleton({ pageTitle: 'Expenses', pageSub: monthLabel(), kpiCount: 3, hint: 'Loading expenses…' });
  if(page === 'bank')      return renderPageSkeleton({ pageTitle: 'Bank Account', pageSub: monthLabel(), kpiCount: 4, hint: 'Loading bank activity…' });
  return renderPageSkeleton({ pageTitle: title || 'Loading', pageSub: monthLabel(), kpiCount: 3, hasTabs: true, hint: 'Loading…' });
}

function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('visible');
}

async function toggleNotifications(){
  const panel=document.getElementById('notifPanel');
  const showing=panel.style.display==='block';
  panel.style.display=showing?'none':'block';
  if(!showing){
    const notifs=await DB.getNotifications();
    const list=document.getElementById('notifList');
    if(!notifs.length){ list.innerHTML='<div class="notif-empty">No notifications</div>'; }
    else{ list.innerHTML=notifs.slice(0,15).map(n=>`<div class="notif-item" style="opacity:${n.read?0.6:1}"><div class="notif-item-title">${esc(n.title)}</div><div class="notif-item-body">${esc(n.body)}</div><div class="notif-item-time">${fmtDate(n.ts)} ${fmtTime(n.ts)}</div></div>`).join('') }
    await DB.markAllRead();
    await updateNotifBadge();
  }
}

async function getPettyCashPendingCount(){
  const history=await DB.getPetty();
  return (history||[]).filter(h=>h.status==='pending_approval').length;
}

// ──────────────────────────────────────────
// 7. PAGE RENDERERS
// ──────────────────────────────────────────
async function renderPage(page){
  const pages={dashboard:renderDashboard,transactions:renderTransactions,income:renderIncome,remittances:renderRemittances,
    expenses:renderExpenses,bank:renderBank,petty_cash:renderPettyCash,reports:renderReports,
    audit:renderAudit,admin:renderAdmin};
  try{
    if(pages[page]) await pages[page]();
    else document.getElementById('pageContent').innerHTML='<div class="card"><p>Page not found.</p></div>';
  }catch(e){
    document.getElementById('pageContent').innerHTML=`<div class="card">
      <div class="alert alert-danger" style="margin-bottom:14px"><span class="alert-icon">✕</span><span>Error loading page: ${esc(e.message)}</span></div>
      <button class="btn btn-primary" onclick="App.navigate('${page}')">Retry</button>
    </div>`;
    console.error('renderPage error:',e);
  }
}

function txMethodLabel(method){
  const m = String(method||'').toLowerCase();
  if(m==='bank_transfer') return '🏦 Bank Transfer';
  if(m==='cash') return '💵 Cash';
  if(m==='petty_cash') return '💳 Petty Cash';
  if(m==='split' || m==='split_petty_bank' || m==='split_cash_bank') return '🔀 Split';
  if(m==='cash_accountant') return '💵 Cash (Accountant)';
  if(m==='collection_cash') return '💵 Collection Cash';
  if(m==='mobile_transfer') return '📱 Mobile Transfer';
  if(m==='bank_teller') return '🏦 Bank Teller';
  if(m==='pos_terminal') return '🏧 POS Terminal';
  return method ? String(method).replace(/_/g,' ') : '—';
}

function txStatusBadge(status){
  const s = String(status||'recorded').toLowerCase();
  if(s==='paid' || s==='approved' || s==='settled' || s==='deposited') return '<span class="badge badge-success">✅ Done</span>';
  if(s==='pending' || s==='pending_approval') return '<span class="badge badge-warn">⏳ Pending</span>';
  if(s==='rejected') return '<span class="badge badge-danger">❌ Rejected</span>';
  return `<span class="badge badge-gray">${esc(status||'Recorded')}</span>`;
}

function txStatusLabel(status){
  const s = String(status||'recorded').toLowerCase();
  if(s==='paid' || s==='approved' || s==='settled' || s==='deposited') return '✅ Done — this transaction has been completed and confirmed.';
  if(s==='pending' || s==='pending_approval') return '⏳ Pending — waiting for someone to review or approve it.';
  if(s==='rejected') return '❌ Rejected — this transaction was declined and will not be processed.';
  return 'Recorded — saved in the system.';
}

function txDirectionMeta(direction){
  if(direction==='credit') return { symbol:'+', label:'Money received (coming in)', cls:'td-green' };
  if(direction==='debit') return { symbol:'−', label:'Money paid out (going out)', cls:'td-red' };
  return { symbol:'↔', label:'Internal transfer (moving money between accounts)', cls:'' };
}

function txKindLabel(kind){
  const map = {
    income:'Sunday / Other Income',
    expense:'Expense',
    remittance:'RCCG Remittance',
    cash_deposit:'Cash Deposit to Bank',
    cash_withdrawal:'Bank Withdrawal',
    topup_request:'Petty Cash Top-Up Request',
    advance:'Petty Cash Advance',
    refill:'Petty Cash Refill',
    petty:'Petty Cash'
  };
  return map[kind] || String(kind||'').replace(/_/g,' ');
}

function txModuleLabel(module){
  const map = {
    income:'Income',
    expenses:'Expenses',
    remittances:'Remittances',
    cash:'Cash / Bank',
    petty_cash:'Petty Cash'
  };
  return map[module] || String(module||'').replace(/_/g,' ');
}

function txCurrentMonthDefaults(){
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
    to:   new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().split('T')[0]
  };
}

function applyTxFilters(all){
  const search = (state.txSearch||'').trim().toLowerCase();
  const typeFilter = state.txTypeFilter||'';
  const statusFilter = state.txStatusFilter||'';
  const methodFilter = state.txMethodFilter||'';
  const moduleFilter = state.txModuleFilter||'';
  const fromDate = state.txFromDate||'';
  const toDate = state.txToDate||'';
  const minAmount = parseFloat(state.txMinAmount);
  const maxAmount = parseFloat(state.txMaxAmount);
  const sortField = state.txSortField||'date';
  const sortDir = state.txSortDir||'desc';

  let filtered = all.filter(t=>{
    const tDate = (t.date||'').slice(0,10);
    if(typeFilter && t.kind!==typeFilter) return false;
    if(statusFilter && String(t.status||'').toLowerCase()!==statusFilter) return false;
    if(methodFilter && String(t.method||'').toLowerCase()!==methodFilter) return false;
    if(moduleFilter && t.module!==moduleFilter) return false;
    if(fromDate && tDate && tDate < fromDate) return false;
    if(toDate && tDate && tDate > toDate) return false;
    if(!Number.isNaN(minAmount) && minAmount>=0 && (t.amount||0) < minAmount) return false;
    if(!Number.isNaN(maxAmount) && maxAmount>=0 && (t.amount||0) > maxAmount) return false;
    if(search){
      const hay = `${t.kind} ${t.module} ${t.description} ${t.reference} ${t.actor} ${t.notes} ${t.status} ${t.method}`.toLowerCase();
      if(!hay.includes(search)) return false;
    }
    return true;
  });

  filtered.sort((a,b)=>{
    let av, bv;
    if(sortField==='amount'){ av=a.amount||0; bv=b.amount||0; }
    else if(sortField==='type'){ av=a.kind||''; bv=b.kind||''; }
    else if(sortField==='module'){ av=a.module||''; bv=b.module||''; }
    else if(sortField==='status'){ av=a.status||''; bv=b.status||''; }
    else { av=new Date(a.recordedAt||a.date||0).getTime(); bv=new Date(b.recordedAt||b.date||0).getTime(); }
    if(av===bv) return 0;
    if(typeof av==='string' || typeof bv==='string'){
      return sortDir==='asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    }
    return sortDir==='asc' ? av-bv : bv-av;
  });

  return filtered;
}

function txSavedViewsKey(){
  const role = state.user?.role;
  return Object.keys(ROLES).includes(role) ? `rccgTxViews_${role}` : null;
}

function getTxSavedViews(){
  const key = txSavedViewsKey();
  if(!key) return [];
  try{ return JSON.parse(localStorage.getItem(key)||'[]'); }
  catch(e){ return []; }
}

async function buildTransactionsLedger(){
  const [income, expenses, remittances, cashTx, petty, remRatesRaw] = await Promise.all([
    DB.getIncome(), DB.getExpenses(), DB.getRemittances(), DB.getCashTransactions(), DB.getPetty(), getRemRates()
  ]);
  const remRates = remRatesRaw.rates || DEFAULT_REMITTANCE_RATES;

  const tx = [];

  (income||[]).forEach(r=>{
    const sourceMeta = OTHER_INCOME_SOURCES.find(s=>s.key===r.source);
    const isSunday = !r.source || r.source==='sunday_collection';
    const cashHeld = isSunday
      ? getSundayCashWithAccountant(r, remRates)
      : getIncomeCashWithAccountant(r, remRates);
    tx.push({
      id:`income_${r.id}`,
      module:'income',
      kind:'income',
      date:r.date||r.createdAt||'',
      recordedAt:r.createdAt||r.date||'',
      amount:r.totalCollection||0,
      direction:'credit',
      method:r.paymentMethod || ((r.bankTransferAmount||0)>0&&cashHeld>0?'split':(r.bankTransferAmount||0)>0?'bank_transfer':'cash'),
      status:r.depositConfirmed ? 'deposited' : 'recorded',
      description:isSunday?'Sunday Collection Received':`Other Income — ${sourceMeta?.label || r.source || 'Other'}`,
      reference:r.tellerNo||'',
      actor:r.recordedBy||'',
      notes:r.notes||''
    });
  });

  (expenses||[]).forEach(e=>{
    tx.push({
      id:`expense_${e.id}`,
      module:'expenses',
      kind:'expense',
      date:e.date||e.createdAt||'',
      recordedAt:e.createdAt||e.date||'',
      amount:e.amount||0,
      direction:'debit',
      method:e.paymentMethod||'',
      status:e.status||'approved',
      description:`Expense — ${(EXPENSE_CATS_ALL.find(c=>c.key===e.category)?.label)||e.category||'Uncategorized'}${e.subCategory?` · ${e.subCategory}`:''}`,
      reference:e.receiptNo||'',
      actor:e.recordedBy||'',
      notes:e.description||''
    });
  });

  (remittances||[]).forEach(r=>{
    tx.push({
      id:`rem_${r.id}`,
      module:'remittances',
      kind:'remittance',
      date:r.paidDate||r.createdAt||'',
      recordedAt:r.createdAt||r.paidDate||'',
      amount:r.amount||0,
      direction:'debit',
      method:r.paymentMethod||'bank_transfer',
      status:r.status||'paid',
      description:r.label||'RCCG Remittance',
      reference:r.reference||'',
      actor:r.submittedBy||r.approvedBy||'',
      notes:r.notes||''
    });
  });

  (cashTx||[]).forEach(c=>{
    const isDeposit = c.type==='cash_deposit';
    tx.push({
      id:`cash_${c.id}`,
      module:'cash',
      kind:isDeposit?'cash_deposit':'cash_withdrawal',
      date:c.date||c.createdAt||'',
      recordedAt:c.createdAt||c.date||'',
      amount:c.amount||0,
      direction:'transfer',
      method:c.depositMethod||'',
      status:'recorded',
      description:isDeposit?'Cash Deposit to Bank':`Bank Withdrawal${c.destination==='accountant_cash'?' → Accountant Cash':''}`,
      reference:c.reference||'',
      actor:c.recordedBy||'',
      notes:c.description||''
    });
  });

  (petty||[]).forEach(p=>{
    tx.push({
      id:`petty_${p.id}`,
      module:'petty_cash',
      kind:p.type||'petty',
      date:p.createdAt||p.dateNeeded||'',
      recordedAt:p.createdAt||p.dateNeeded||'',
      amount:p.actualAmount||p.amount||0,
      direction:(p.type==='refill'||p.type==='topup_request'||p.type==='petty_to_bank')?'transfer':'debit',
      method:p.paymentMethod||'',
      status:p.status||'pending_approval',
      description:`Petty Cash — ${p.type==='topup_request'?'Top-Up Request':p.type==='advance'?'Advance':p.type==='refill'?'Refill':p.type==='petty_to_bank'?'Deposit to Bank':'Disbursement'}`,
      reference:p.reference||p.receiptNo||'',
      actor:p.requestedBy||p.approvedBy||'',
      notes:p.purpose||p.notes||''
    });
  });

  return tx.sort((a,b)=>new Date(b.recordedAt||b.date||0)-new Date(a.recordedAt||a.date||0));
}

async function renderTransactions(){
  // Apply current-month defaults on first visit to the page
  if(!state.txInitialized){
    const d = txCurrentMonthDefaults();
    state.txFromDate = d.from;
    state.txToDate   = d.to;
    state.txSortField = 'date';
    state.txSortDir   = 'desc';
    state.txPageSize  = 20;
    state.txPage      = 1;
    state.txInitialized = true;
  }

  const all = await buildTransactionsLedger();
  state._txAll = all; // cache for showTxDetail lookups

  const search = (state.txSearch||'').trim().toLowerCase();
  const typeFilter = state.txTypeFilter||'';
  const statusFilter = state.txStatusFilter||'';
  const methodFilter = state.txMethodFilter||'';
  const moduleFilter = state.txModuleFilter||'';
  const fromDate = state.txFromDate||'';
  const toDate = state.txToDate||'';
  const sortField = state.txSortField||'date';
  const sortDir = state.txSortDir||'desc';
  const pageSize = parseInt(state.txPageSize||'20',10) || 20;

  const filtered = applyTxFilters(all);

  const totals = filtered.reduce((acc,t)=>{
    if(t.direction==='credit') acc.credit += (t.amount||0);
    else if(t.direction==='debit') acc.debit += (t.amount||0);
    return acc;
  },{credit:0,debit:0});

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, state.txPage||1), totalPages);
  state.txPage = page;
  const start = (page-1)*pageSize;
  const rows = filtered.slice(start, start+pageSize);

  const typeOptions = [...new Set(all.map(t=>t.kind).filter(Boolean))].sort();
  const statusOptions = [...new Set(all.map(t=>String(t.status||'').toLowerCase()).filter(Boolean))].sort();
  const methodOptions = [...new Set(all.map(t=>String(t.method||'').toLowerCase()).filter(Boolean))].sort();
  const moduleOptions = [...new Set(all.map(t=>t.module).filter(Boolean))].sort();

  const savedViews = getTxSavedViews();

  // ── Desktop rows (hidden on mobile via CSS) ───────────────────────
  const desktopRows = rows.map(t=>{
    const d = txDirectionMeta(t.direction);
    return `
    <tr class="tx-desktop-row">
      <td style="white-space:nowrap">${fmtDate(t.date)}<div class="td-muted">${fmtTime(t.recordedAt||t.date)}</div></td>
      <td><span class="badge badge-gray">${esc(txKindLabel(t.kind))}</span></td>
      <td class="td-muted">${esc(txModuleLabel(t.module))}</td>
      <td><div style="font-size:13px;font-weight:500">${esc(t.description||'—')}</div>${t.notes?`<div class="td-muted" style="font-size:11px">${esc(t.notes)}</div>`:''}</td>
      <td class="td-right ${d.cls}" title="${d.label}" aria-label="${d.label}: ${fmt(t.amount||0)}">${d.symbol}${fmt(t.amount||0)}</td>
      <td class="td-muted">${esc(txMethodLabel(t.method))}</td>
      <td>${txStatusBadge(t.status)}</td>
      <td class="td-muted">${esc(t.reference||'—')}</td>
      <td class="td-muted">${esc(t.actor||'—')}</td>
    </tr>`;
  }).join('');

  // ── Mobile rows (hidden on desktop via CSS) ───────────────────────
  const mobileRows = rows.map(t=>{
    const d = txDirectionMeta(t.direction);
    return `
    <tr class="tx-mobile-row" onclick="App.showTxDetail('${esc(t.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.showTxDetail('${esc(t.id)}')}" tabindex="0" style="cursor:pointer" title="Tap to see full details" role="button" aria-label="${esc(t.description||'Transaction')} — ${d.symbol}${fmt(t.amount||0)}">${''/* mobile row */}
      <td>
        <div style="font-size:13px;font-weight:600;white-space:nowrap">${fmtDate(t.date)}</div>
        <div class="td-muted" style="font-size:11px">${fmtTime(t.recordedAt||t.date)}</div>
      </td>
      <td style="max-width:0;width:60%">
        <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.description||'—')}</div>
        <div class="td-muted" style="font-size:11px">${esc(txModuleLabel(t.module))}</div>
      </td>
      <td class="td-right ${d.cls}" style="white-space:nowrap">${d.symbol}${fmt(t.amount||0)}</td>
    </tr>`;
  }).join('');

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div>
        <div class="page-title">Money Records</div>
        <div class="page-sub">All income, expenses, remittances, petty cash and bank movements in one place</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${savedViews.length ? `
          <select id="txViewSelect" class="form-select" style="width:auto" onchange="if(this.value!=='') App.loadTxView(this.value)" aria-label="Load a saved filter view">
            <option value="">📋 My Saved Filters</option>
            ${savedViews.map((v,i)=>`<option value="${i}">${esc(v.name)}</option>`).join('')}
          </select>
          <button class="btn btn-sm btn-danger" title="Delete the selected saved filter" onclick="const s=document.getElementById('txViewSelect');if(s&&s.value!=='')App.deleteTxView(s.value)">🗑</button>
        ` : ''}
        <button class="btn btn-sm" title="Save the current filters so you can quickly reload them later" onclick="App.saveTxView()">💾 Save Filters</button>
        <button class="btn btn-sm" title="Download these results as a spreadsheet file" onclick="App.exportTxCSV(this)">📥 Spreadsheet</button>
        <button class="btn btn-sm" title="Open a print-friendly version you can save as PDF" onclick="App.exportTxPDF(this)">🖨 Print / PDF</button>
        <button class="btn btn-sm" title="Clear all filters and go back to this month's records" onclick="App.clearTxFilters()">✕ Reset Filters</button>
      </div>
    </div>

    <div class="kpi-grid" style="margin-bottom:12px">
      <div class="kpi" title="How many transactions match your current search and filters">
        <div class="kpi-label">Transactions Found</div>
        <div class="kpi-val">${filtered.length}</div>
        <div class="kpi-delta">${all.length} total on record</div>
      </div>
      <div class="kpi" title="Total money that came INTO the church (e.g. tithes, offerings, income)">
        <div class="kpi-label">Money Received</div>
        <div class="kpi-val" style="color:var(--success)">${fmt(totals.credit)}</div>
        <div class="kpi-delta up">Coming in</div>
      </div>
      <div class="kpi" title="Total money that went OUT of the church (e.g. expenses, remittances)">
        <div class="kpi-label">Money Paid Out</div>
        <div class="kpi-val" style="color:var(--danger)">${fmt(totals.debit)}</div>
        <div class="kpi-delta down">Going out</div>
      </div>
      <div class="kpi" title="Money Received minus Money Paid Out. A positive number means you received more than you spent in this period.">
        <div class="kpi-label">Difference (In − Out)</div>
        <div class="kpi-val" style="color:${(totals.credit-totals.debit)>=0?'var(--success)':'var(--danger)'}">${fmt(totals.credit-totals.debit)}</div>
        <div class="kpi-delta">Based on current filters</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Search &amp; Filter</span>
        <span class="td-muted" style="font-size:11px">Use these to narrow down the list</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;align-items:end">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" title="Type any word to search — e.g. a name, amount, or description">🔍 Search</label>
          <input class="form-input" value="${esc(state.txSearch||'')}" placeholder="e.g. Sunday, offering, tithe…" oninput="App.setTxFilter('search',this.value)" />
          <div class="form-hint">Search by description, reference, or name</div>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" title="Filter by what kind of transaction this is — e.g. income, expense, remittance">Transaction Type</label>
          <select class="form-select" onchange="App.setTxFilter('type',this.value)">
            <option value="">All Types</option>
            ${typeOptions.map(v=>`<option value="${esc(v)}" ${typeFilter===v?'selected':''}>${esc(txKindLabel(v))}</option>`).join('')}
          </select>
          <div class="form-hint">What kind of money movement is it?</div>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" title="Filter by which part of the app the transaction came from">Section / Area</label>
          <select class="form-select" onchange="App.setTxFilter('module',this.value)">
            <option value="">All Sections</option>
            ${moduleOptions.map(v=>`<option value="${esc(v)}" ${moduleFilter===v?'selected':''}>${esc(txModuleLabel(v))}</option>`).join('')}
          </select>
          <div class="form-hint">Which area of the app recorded it?</div>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" title="Filter by whether the transaction has been completed, is still waiting, or was rejected">Status</label>
          <select class="form-select" onchange="App.setTxFilter('status',this.value)">
            <option value="">All Statuses</option>
            ${statusOptions.map(v=>`<option value="${esc(v)}" ${statusFilter===v?'selected':''}>${esc(v.replace(/_/g,' '))}</option>`).join('')}
          </select>
          <div class="form-hint">Is it done, pending, or rejected?</div>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" title="Filter by how the money was paid — e.g. bank transfer, cash, petty cash">Payment Method</label>
          <select class="form-select" onchange="App.setTxFilter('method',this.value)">
            <option value="">All Methods</option>
            ${methodOptions.map(v=>`<option value="${esc(v)}" ${methodFilter===v?'selected':''}>${esc(txMethodLabel(v))}</option>`).join('')}
          </select>
          <div class="form-hint">How was the money paid or received?</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;align-items:end;margin-top:8px">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" title="Show only transactions on or after this date">From Date</label>
          <input type="date" class="form-input" value="${esc(fromDate)}" onchange="App.setTxFilter('fromDate',this.value)" />
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" title="Show only transactions on or before this date">To Date</label>
          <input type="date" class="form-input" value="${esc(toDate)}" onchange="App.setTxFilter('toDate',this.value)" />
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" title="Hide transactions below this amount">Smallest Amount (₦)</label>
          <input type="number" min="0" class="form-input" value="${state.txMinAmount??''}" placeholder="e.g. 1000" oninput="App.setTxFilter('minAmount',this.value)" />
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" title="Hide transactions above this amount">Largest Amount (₦)</label>
          <input type="number" min="0" class="form-input" value="${state.txMaxAmount??''}" placeholder="e.g. 500000" oninput="App.setTxFilter('maxAmount',this.value)" />
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" title="Choose which column to sort the list by">Sort By</label>
          <select class="form-select" onchange="App.setTxFilter('sortField',this.value)">
            <option value="date" ${sortField==='date'?'selected':''}>Date</option>
            <option value="amount" ${sortField==='amount'?'selected':''}>Amount</option>
            <option value="type" ${sortField==='type'?'selected':''}>Type</option>
            <option value="module" ${sortField==='module'?'selected':''}>Section</option>
            <option value="status" ${sortField==='status'?'selected':''}>Status</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" title="Newest first (Descending) or oldest first (Ascending)">Order</label>
          <select class="form-select" onchange="App.setTxFilter('sortDir',this.value)">
            <option value="desc" ${sortDir==='desc'?'selected':''}>Newest First</option>
            <option value="asc" ${sortDir==='asc'?'selected':''}>Oldest First</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Transaction List</span>
        <span class="td-muted tx-mobile-hint" style="font-size:11px">Tap any row to see full details</span>
      </div>

      ${rows.length ? `
        <div class="table-wrap">
          <table class="tx-desktop-table">
            <tr>
              <th title="When this transaction was recorded">Date &amp; Time</th>
              <th title="What kind of transaction this is">Type</th>
              <th title="Which section of the app recorded this">Section</th>
              <th title="What the transaction is about">Description</th>
              <th class="td-right" title="The amount of money involved. + means money came in, − means money went out">Amount</th>
              <th title="How the money was paid or received">Payment Method</th>
              <th title="Whether this has been completed, is waiting, or was rejected">Status</th>
              <th title="A receipt number, teller number, or other reference code">Reference No.</th>
              <th title="Who recorded or approved this transaction">Recorded By</th>
            </tr>
            ${desktopRows}
          </table>
          <table class="tx-mobile-table">
            <tr>
              <th>Date &amp; Time</th>
              <th>Description</th>
              <th class="td-right">Amount</th>
            </tr>
            ${mobileRows}
          </table>
        </div>
      ` : '<div class="empty-table">No transactions found for the current filters. Try widening your date range or clearing the filters.</div>'}

      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap">
        <div style="font-size:12px;color:var(--text3)">
          Showing ${filtered.length ? start+1 : 0}–${Math.min(start+pageSize, filtered.length)} of ${filtered.length} record${filtered.length!==1?'s':''}
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <label class="form-label" style="margin:0" title="How many rows to show per page">Rows per page</label>
          <select class="form-select" style="width:auto" onchange="App.setTxPageSize(this.value)">
            ${[10,20,50,100].map(n=>`<option value="${n}" ${pageSize===n?'selected':''}>${n}</option>`).join('')}
          </select>
          <button class="btn btn-sm" ${page<=1?'disabled':''} onclick="App.setTxPage(${page-1})">← Previous</button>
          <span style="font-size:12px;color:var(--text2)">Page ${filtered.length?page:0} of ${filtered.length?totalPages:0}</span>
          <button class="btn btn-sm" ${page>=totalPages?'disabled':''} onclick="App.setTxPage(${page+1})">Next →</button>
        </div>
      </div>
    </div>`;
}

function setTxFilter(key, value){
  if(key==='search') state.txSearch=value||'';
  else if(key==='type') state.txTypeFilter=value||'';
  else if(key==='status') state.txStatusFilter=value||'';
  else if(key==='method') state.txMethodFilter=value||'';
  else if(key==='module') state.txModuleFilter=value||'';
  else if(key==='fromDate') state.txFromDate=value||'';
  else if(key==='toDate') state.txToDate=value||'';
  else if(key==='minAmount') state.txMinAmount=value;
  else if(key==='maxAmount') state.txMaxAmount=value;
  else if(key==='sortField') state.txSortField=value||'date';
  else if(key==='sortDir') state.txSortDir=value||'desc';
  state.txPage=1;
  renderTransactions();
}

function setTxPage(page){
  state.txPage = Math.max(1, parseInt(page,10)||1);
  renderTransactions();
}

function setTxPageSize(size){
  state.txPageSize = Math.max(1, parseInt(size,10)||20);
  state.txPage = 1;
  renderTransactions();
}

function clearTxFilters(){
  const d = txCurrentMonthDefaults();
  state.txSearch='';
  state.txTypeFilter='';
  state.txStatusFilter='';
  state.txMethodFilter='';
  state.txModuleFilter='';
  state.txFromDate=d.from;
  state.txToDate=d.to;
  state.txMinAmount='';
  state.txMaxAmount='';
  state.txSortField='date';
  state.txSortDir='desc';
  state.txPage=1;
  renderTransactions();
}

function showTxDetail(id){
  const all = state._txAll || [];
  const t = all.find(x=>x.id===id);
  if(!t){ return; }
  const d = txDirectionMeta(t.direction);
  const dirLabel = t.direction==='credit'
    ? '➕ Money Received (came in)'
    : t.direction==='debit'
    ? '➖ Money Paid Out (went out)'
    : '↔ Internal Transfer';
  const rows = [
    ['Date &amp; Time',    `${fmtDate(t.date)} at ${fmtTime(t.recordedAt||t.date)}`],
    ['Type',               txKindLabel(t.kind)],
    ['Section',            txModuleLabel(t.module)],
    ['Description',        esc(t.description||'—')],
    ['Notes / Purpose',    esc(t.notes||'—')],
    ['Amount',             `<span class="${d.cls}" style="font-size:16px;font-weight:700">${d.symbol}${fmt(t.amount||0)}</span>`],
    ['Direction',          dirLabel],
    ['Payment Method',     esc(txMethodLabel(t.method)||'—')],
    ['Status',             txStatusBadge(t.status) + `<div class="form-hint" style="margin-top:4px">${txStatusLabel(t.status)}</div>`],
    ['Reference / Receipt No.', esc(t.reference||'—')],
    ['Recorded By',        esc(t.actor||'—')]
  ];
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">🧾 Transaction Details</div>
    <table style="width:100%;border-collapse:collapse">
      ${rows.map(([label,val])=>`
        <tr>
          <td style="padding:8px 0 8px 0;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.4px;width:38%;vertical-align:top">${label}</td>
          <td style="padding:8px 0 8px 8px;font-size:13px;color:var(--text);vertical-align:top">${val}</td>
        </tr>`).join('')}
    </table>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Close</button>
    </div>`);
}

async function exportTxCSV(btn=null){
  const restore = setBtnLoading(btn, 'Exporting…');
  try {
    const all = await buildTransactionsLedger();
    const filtered = applyTxFilters(all);
    const headers = ['Date','Time','Type','Module','Description','Amount (N)','Direction','Method','Status','Reference','By','Notes'];
    const dataRows = filtered.map(t=>[
      (t.date||'').slice(0,10),
      (t.date||'').slice(11,16),
      t.kind||'',
      t.module||'',
      t.description||'',
      t.amount||0,
      t.direction||'',
      t.method||'',
      t.status||'',
      t.reference||'',
      t.actor||'',
      t.notes||''
    ]);
    const csv = [headers, ...dataRows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
    restore();
  } catch(err) {
    restore();
    showAlert(`Failed to export: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

async function exportTxPDF(btn=null){
  const restore = setBtnLoading(btn, 'Preparing…');
  try {
    const all = await buildTransactionsLedger();
    const filtered = applyTxFilters(all);
    const settings = await DB.getSettings();
    const churchName = settings.churchName||'RCCG Kingdom Parish';
    const fromDate = state.txFromDate||'';
    const toDate = state.txToDate||'';
    const totals = filtered.reduce((acc,t)=>{
      if(t.direction==='credit') acc.credit+=(t.amount||0);
      else if(t.direction==='debit') acc.debit+=(t.amount||0);
      return acc;
    },{credit:0,debit:0});
    const net = totals.credit - totals.debit;

  const tableRows = filtered.map(t=>{
    const d = txDirectionMeta(t.direction);
    const amtCls = d.cls==='td-green'?'cr':d.cls==='td-red'?'dr':'';
    return `<tr>
      <td style="white-space:nowrap">${(t.date||'').slice(0,10)}</td>
      <td>${esc(String(t.kind||'').replace(/_/g,' '))}</td>
      <td>${esc(String(t.module||'').replace(/_/g,' '))}</td>
      <td>${esc(t.description||'—')}${t.notes?`<br><span style="color:#888;font-size:9px">${esc(t.notes)}</span>`:''}</td>
      <td class="td-r ${amtCls}">${d.symbol}&#x20A6;${Math.round(t.amount||0).toLocaleString('en-NG')}</td>
      <td>${esc(txMethodLabel(t.method))}</td>
      <td>${esc(String(t.status||'recorded'))}</td>
      <td>${esc(t.reference||'—')}</td>
      <td>${esc(t.actor||'—')}</td>
    </tr>`;
  }).join('');

  const html=`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>${esc(churchName)} — Transactions Ledger</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:11px;color:#333;padding:20px}
  .header{text-align:center;border-bottom:3px solid #0F6E56;padding-bottom:12px;margin-bottom:14px}
  .header h1{font-size:17px;color:#0F6E56;margin-bottom:3px}
  .header h2{font-size:13px;margin-bottom:4px}
  .header p{font-size:10px;color:#666;margin-bottom:2px}
  .kpi-row{display:flex;gap:16px;margin-bottom:12px;padding:8px 0;border-bottom:1px solid #ddd}
  .kpi{flex:1;text-align:center}.kpi-label{font-size:9px;color:#888;text-transform:uppercase}
  .kpi-val{font-size:13px;font-weight:700}
  table{width:100%;border-collapse:collapse}
  th{background:#0F6E56;color:#fff;padding:5px 7px;text-align:left;font-size:10px;font-weight:700}
  td{padding:4px 7px;border-bottom:1px solid #eee;font-size:10px;vertical-align:top}
  .td-r{text-align:right}.cr{color:#0F6E56;font-weight:600}.dr{color:#c0392b;font-weight:600}
  @media print{body{padding:8px}.no-print{display:none}}
</style></head><body>
<div class="header">
  <h1>${esc(churchName)}</h1>
  <h2>Transactions Ledger</h2>
  <p><strong>Period:</strong> ${fromDate?fmtDate(fromDate):'All'} — ${toDate?fmtDate(toDate):'Present'}</p>
  <p><strong>Prepared by:</strong> ${esc(state.user?.name||'—')} &nbsp;|&nbsp; <strong>Date:</strong> ${fmtDate(new Date().toISOString().split('T')[0])}</p>
  <p>${filtered.length} transaction(s) shown</p>
</div>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-label">Total</div><div class="kpi-val">${filtered.length}</div></div>
  <div class="kpi"><div class="kpi-label">Credits</div><div class="kpi-val cr">&#x20A6;${Math.round(totals.credit).toLocaleString('en-NG')}</div></div>
  <div class="kpi"><div class="kpi-label">Debits</div><div class="kpi-val dr">&#x20A6;${Math.round(totals.debit).toLocaleString('en-NG')}</div></div>
  <div class="kpi"><div class="kpi-label">Difference (In − Out)</div><div class="kpi-val" style="color:${net>=0?'#0F6E56':'#c0392b'}">&#x20A6;${Math.round(net).toLocaleString('en-NG')}</div></div>
</div>
<table>
  <tr><th>Date</th><th>Type</th><th>Module</th><th>Description / Notes</th><th class="td-r">Amount</th><th>Method</th><th>Status</th><th>Reference</th><th>By</th></tr>
  ${tableRows||'<tr><td colspan="9" style="text-align:center;color:#888;padding:12px">No transactions match the selected filters</td></tr>'}
</table>
<p class="no-print" style="margin-top:14px;font-size:10px;color:#888;text-align:center">Use Ctrl+P / Cmd+P to save as PDF.</p>
</body></html>`;

    const w = window.open('','_blank','width=960,height=720');
    if(!w){ restore(); showAlert('Pop-up blocked. Please allow pop-ups for this site.','warn'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(()=>w.print(), 400);
    restore();
  } catch(err) {
    restore();
    showAlert(`Failed to prepare PDF: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

function saveTxView(){
  const raw = (prompt('Enter a name for this saved view:','')||'').trim();
  const name = raw.slice(0, MAX_TRANSACTION_VIEW_NAME_LENGTH);
  if(raw.length > MAX_TRANSACTION_VIEW_NAME_LENGTH){
    showAlert(`Your view name was too long and has been shortened to ${MAX_TRANSACTION_VIEW_NAME_LENGTH} characters. The saved name is: "${name}"`,'warn');
  }
  if(!name) return;
  const key = txSavedViewsKey();
  if(!key){ showAlert('Cannot save views — role not recognised.','warn'); return; }
  const views = getTxSavedViews();
  const filters = {
    txSearch:state.txSearch||'', txTypeFilter:state.txTypeFilter||'',
    txStatusFilter:state.txStatusFilter||'', txMethodFilter:state.txMethodFilter||'',
    txModuleFilter:state.txModuleFilter||'', txFromDate:state.txFromDate||'',
    txToDate:state.txToDate||'', txMinAmount:state.txMinAmount||'',
    txMaxAmount:state.txMaxAmount||'', txSortField:state.txSortField||'date',
    txSortDir:state.txSortDir||'desc'
  };
  const existing = views.findIndex(v=>v.name===name);
  if(existing>=0) views[existing]={ name, filters };
  else views.push({ name, filters });
  localStorage.setItem(key, JSON.stringify(views));
  showAlert(`View "${name}" saved.`,'success');
  renderTransactions();
}

function loadTxView(idx){
  const views = getTxSavedViews();
  const i = parseInt(idx,10);
  if(Number.isNaN(i) || i<0 || i>=views.length) return;
  const f = views[i].filters || {};
  const { txSearch, txTypeFilter, txStatusFilter, txMethodFilter,
          txModuleFilter, txFromDate, txToDate, txMinAmount, txMaxAmount,
          txSortField, txSortDir } = f;
  Object.assign(state, { txSearch, txTypeFilter, txStatusFilter, txMethodFilter,
          txModuleFilter, txFromDate, txToDate, txMinAmount, txMaxAmount,
          txSortField, txSortDir });
  state.txPage = 1;
  renderTransactions();
}

function deleteTxView(idx){
  const key = txSavedViewsKey();
  if(!key) return;
  const views = getTxSavedViews();
  const i = parseInt(idx,10);
  if(Number.isNaN(i) || i<0 || i>=views.length) return;
  const name = views[i].name;
  if(!confirm(`Delete saved view "${name}"?`)) return;
  views.splice(i, 1);
  localStorage.setItem(key, JSON.stringify(views));
  renderTransactions();
}

// ── DASHBOARD ────────────────────────────
// A petty-history entry can move the float on more than one date — an advance hits
// on `approvedAt`, then the settlement adjustment (change returned or extra spent)
// hits later on `settledAt`. Return each impact as its own {date, delta} so the
// historical unwind can decide per-event whether it falls after the as-of date.
//
// IMPORTANT: dateNeeded is the "when the requester needs it" hint and can be set
// well before approval — using it as an impact date would carry future approvals
// back into a historical snapshot. Only use real impact timestamps here.
function pettyFloatEvents(h){
  if(!h) return [];
  if(h.type === 'refill' && (h.status === 'approved' || h.status === 'settled')){
    return [{ date: String(h.createdAt || h.date || '').slice(0,10), delta: +(h.amount || 0) }];
  }
  if(h.type === 'advance' && (h.status === 'approved' || h.status === 'settled')){
    const approvalDate = String(h.approvedAt || h.createdAt || '').slice(0,10);
    const events = [{ date: approvalDate, delta: -(h.amount || 0) }];
    if(h.status === 'settled'){
      const settleDate = String(h.settledAt || approvalDate).slice(0,10);
      if(h.changeReturned) events.push({ date: settleDate, delta: +h.changeReturned });
      if(h.extraSpent)    events.push({ date: settleDate, delta: -h.extraSpent });
    }
    return events;
  }
  if(h.type === 'disbursement' && h.status === 'approved'){
    return [{ date: String(h.date || h.createdAt || '').slice(0,10), delta: -(h.amount || 0) }];
  }
  if(h.type === 'petty_to_bank' && (h.status === 'approved' || h.status === 'settled')){
    return [{ date: String(h.date || h.createdAt || '').slice(0,10), delta: -(h.amount || 0) }];
  }
  return [];
}

function calcPettyFloatFromLedger(pettyHistory, expenses, asOfDate, recDate=()=> ''){
  const historyDelta = (pettyHistory || [])
    .flatMap(pettyFloatEvents)
    .filter(e => !asOfDate || !e.date || e.date <= asOfDate)
    .reduce((s,e) => s + (e.delta || 0), 0);
  const expenseDeductions = (expenses || [])
    .filter(e => (e.pettyAmount||0) > 0)
    .filter(e => !asOfDate || !recDate(e) || recDate(e) <= asOfDate)
    .reduce((s,e) => s + (e.pettyAmount||0), 0);
  return historyDelta - expenseDeductions;
}

/** Cash position. Pass `asOfDate` (YYYY-MM-DD) to get a historical snapshot —
 *  every input record is filtered by date ≤ asOfDate and the petty float is
 *  rebuilt from ledger events up to that date.
 *  Pass nothing (or null) for the live "as of now" balance. */
async function calcChurchBalance(asOfDate, prefetched){
  const pf = prefetched || {};
  const [allIncome,allExpenses,allRemittances,cashTx,pettyHistory,satelliteFunds] = await Promise.all([
    pf.income || DB.getIncome(), pf.expenses || DB.getExpenses(), pf.remittances || DB.getRemittances(),
    pf.cashTx || DB.getCashTransactions(), pf.pettyHistory || DB.getPetty(), pf.satelliteFunds || DB.getSatelliteFunds()
  ]);
  const remRates = pf.remRates || (await getRemRates()).rates || DEFAULT_REMITTANCE_RATES;

  const recDate = r => String(r?.date || r?.dateNeeded || r?.createdAt || '').slice(0,10);
  const onOrBefore = r => !asOfDate || (function(){ const d=recDate(r); return !d || d <= asOfDate; })();
  const paidOnOrBefore = r => !asOfDate || (function(){ const d=String(r?.paidDate || r?.createdAt || '').slice(0,10); return !d || d <= asOfDate; })();

  const income = allIncome.filter(onOrBefore);
  const expenses = allExpenses.filter(onOrBefore);
  const cashTxF = cashTx.filter(onOrBefore);
  const pettyF = pettyHistory.filter(onOrBefore);
  const satFundsF = (satelliteFunds||[]).filter(onOrBefore);
  const paidRemsList = allRemittances.filter(r => r.status === 'paid' && paidOnOrBefore(r));

  // --- BANK BALANCE ---
  const bankTransferIncome = income.reduce((s,r) => s + (r.bankTransferAmount||0), 0);
  // Every effective cash deposit, INCLUDING satellite pass-through "in" mirrors (tagged
  // destination==='satellite_passthrough' — see createSatelliteFund). The bank account
  // really did receive this money, so bankBalance must match the real bank statement.
  // (It is excluded from the ACCOUNTANT's cash line below via cashDepositedFromAccountant,
  // and excluded from the parish's own available total via heldForSatellites.)
  const cashDepositedToBank = cashTxF.filter(t=>t.type==='cash_deposit'&&isDepositEffective(t)).reduce((s,t) => s+(t.amount||0), 0);
  // Pending expenses are included: every logged expense is an actual payment already made.
  // "Pending" means awaiting admin approval, not awaiting payment. This matches how petty
  // cash already works — the float is reduced the moment an expense is logged.
  const bankExpenses = expenses.filter(isLoggedExpense).reduce((s,e)=>{
    if(e.paymentMethod==='bank_transfer') return s+(e.amount||0);
    if(e.paymentMethod==='split') return s+(e.bankAmount||0);
    return s;
  }, 0);
  const paidRems = paidRemsList.reduce((s,r) => s+(r.amount||0), 0);
  // Bank withdrawals — including satellite "out" mirrors. These already leave the bank
  // for real (money forwarded to Province/joint area-zone), so this is correct as-is.
  const bankWithdrawals = cashTxF.filter(t=>t.type==='withdrawal').reduce((s,t) => s+(t.amount||0), 0);
  // Petty top-ups via bank transfer leave the bank account. Only approved/settled
  // refills have actually moved money — pending_approval requests must not be
  // deducted from the bank balance (mirrors the pettyCashTopups filter below).
  const pettyBankTopups = pettyF.filter(h=>h.type==='refill'&&(h.status==='approved'||h.status==='settled')&&(h.paymentMethod==='bank_transfer'||(h.paymentMethod==='split'&&(h.bankAmount||0)>0)))
    .reduce((s,h)=>s+(h.paymentMethod==='split'?(h.bankAmount||0):(h.amount||0)),0);
  const pettyToBankDeposits = pettyF.filter(h=>h.type==='petty_to_bank'&&(h.status==='approved'||h.status==='settled'))
    .reduce((s,h)=>s+(h.amount||0),0);
  const bankBalance = bankTransferIncome + cashDepositedToBank - bankExpenses - paidRems - bankWithdrawals - pettyBankTopups + pettyToBankDeposits;

  // --- CASH WITH ACCOUNTANT ---
  const cashFromCollections = income.reduce((s,r) => {
    return s + getIncomeCashWithAccountant(r, remRates);
  }, 0);
  // Deposits that actually moved the ACCOUNTANT's held cash into the bank. Satellite
  // pass-through "in" money (destination==='satellite_passthrough') never touched the
  // accountant — it is mirrored as a cash_deposit purely so bankBalance matches the bank
  // statement, and must NOT be subtracted here, or it manufactures a phantom cash deficit
  // (the accountant would appear to have disbursed money they never received). This is
  // the P1 fix for the satellite pass-through fund feature — see cashDepositedToBank above.
  const cashDepositedFromAccountant = cashTxF.filter(t=>t.type==='cash_deposit'&&isDepositEffective(t)&&t.destination!=='satellite_passthrough').reduce((s,t) => s+(t.amount||0), 0);
  const bankToAccountant = cashTxF.filter(t=>t.type==='withdrawal' && t.destination==='accountant_cash').reduce((s,t) => s+(t.amount||0), 0);
  const cashExpenses = expenses.filter(isLoggedExpense).reduce((s,e)=>{
    if(e.paymentMethod==='cash') return s+(e.amount||0);
    if(e.paymentMethod==='split') return s+(e.cashAmount||0);
    return s;
  }, 0);
  // Petty top-ups via accountant's cash reduce the accountant's cash holding
  const pettyCashTopups = pettyF.filter(h=>h.type==='refill'&&(h.status==='approved'||h.status==='settled')&&(h.paymentMethod==='cash_accountant'||(h.paymentMethod==='split'&&(h.cashAmount||0)>0)))
    .reduce((s,h)=>s+(h.paymentMethod==='split'?(h.cashAmount||0):(h.amount||0)),0);
  // Satellite "in" receipts handed to the accountant as CASH (channel==='cash') rather
  // than deposited straight to the bank — see createSatelliteFund. These have no
  // cash_transactions mirror at all, so they never touch cashDepositedToBank/bankBalance;
  // this is the only place they enter the balance, on the accountant's cash line. When
  // that cash is later deposited to the bank via the normal accountant cash-deposit flow,
  // this term and cashDepositedFromAccountant cancel — see calcChurchBalance tests.
  const satelliteCashIn = satFundsF.filter(s=>s.direction==='in' && s.channel==='cash').reduce((s,r)=>s+(r.amount||0),0);
  // Satellite/Zone Pool "out" payouts funded straight from the ACCOUNTANT's own cash
  // on hand (channel==='cash_accountant') rather than the bank or Petty Cash — see
  // createSatelliteFund. No cash_transactions or petty_cash mirror exists for these
  // (bank_ref/petty_ref both stay ''), so this is the only place they enter the
  // balance: the accountant really did hand out real cash, so it must reduce the
  // accountant's cash line the same way a petty-funded payout reduces pettyFloat via
  // calcPettyFloatFromLedger, and a bank-funded payout reduces bankBalance via
  // bankWithdrawals. heldForSatellites (below) is unaffected by channel — funding
  // source is deliberately invisible to that formula.
  const satelliteCashAccountantOut = satFundsF.filter(s=>s.direction==='out' && s.channel==='cash_accountant').reduce((s,r)=>s+(r.amount||0),0);
  const cashWithAccountantRaw = cashFromCollections - cashDepositedFromAccountant + bankToAccountant - cashExpenses - pettyCashTopups + satelliteCashIn - satelliteCashAccountantOut;

  // --- PETTY CASH (with Admin Officer) ---
  // Rebuild the float from raw ledger movements each time so historical snapshots stay
  // accurate even if the stored petty_config.float has drifted.
  const pettyFloat = calcPettyFloatFromLedger(pettyHistory, allExpenses, asOfDate, recDate);

  // --- SATELLITE / ZONE PASS-THROUGH FUND — HELD ---
  // Authoritative from the satellite_funds TABLE (not derived from cash_transactions) —
  // satellite_funds is the single source of truth for this balance. This money IS
  // included inside bankBalance above (it really is sitting in the bank account) but
  // must be excluded from the parish's own available/total funds — it belongs to the
  // satellite parishes until remitted onward or explicitly transferred to the parish.
  const satelliteIn = satFundsF.filter(s=>s.direction==='in').reduce((s,r)=>s+(r.amount||0),0);
  const satelliteOut = satFundsF.filter(s=>s.direction==='out').reduce((s,r)=>s+(r.amount||0),0);
  const satelliteTransferOut = satFundsF.filter(s=>s.direction==='transfer_out').reduce((s,r)=>s+(r.amount||0),0);
  const heldForSatellites = satelliteIn - satelliteOut - satelliteTransferOut;

  return {
    cashWithAccountant: Math.max(0, cashWithAccountantRaw),
    // cashDeficit > 0 means cash outflows (approved + pending) exceed recorded cash inflows —
    // accountant has disbursed more cash than received; pending expenses awaiting approval contribute here
    cashDeficit: Math.max(0, -cashWithAccountantRaw),
    bankBalance,
    pettyFloat,
    heldForSatellites,
    // total EXCLUDES heldForSatellites: it sits inside bankBalance (real bank money) but
    // is not the parish's own to spend. A 'transfer_out' entry reduces heldForSatellites
    // and — with no other change — raises `total` by the same amount, which is the
    // correct and complete balance effect of reclassifying held money as parish money.
    total: cashWithAccountantRaw + bankBalance + pettyFloat - heldForSatellites
  };
}

// Skeleton-first paint. Renders the page header + period selector + skeleton
// cards using only synchronous state (user name, month, period mode) — no API
// needed — so the user sees dashboard structure within ~50ms instead of
// staring at a blank screen for 30+ seconds on slow networks. The full
// content swaps in below once all 8 fetches resolve.
function renderDashboardSkeleton(){
  const userName = (state.user?.name?.split(/\s+/).slice(0,2).join(' ')) || 'User';
  const monthName = MONTHS[state.month];
  const useRemPeriod = state.periodMode === 'remittance';
  const chip = `<div style="margin-top:8px;display:inline-block;height:22px;width:130px;background:rgba(0,0,0,0.06);border-radius:12px"></div>`;
  const skelLine = (w) => `<div style="height:18px;width:${w};background:rgba(0,0,0,0.06);border-radius:5px;margin:6px 0"></div>`;
  const skelCard = (showSub) => `<div class="card" style="margin-bottom:12px">
    ${skelLine('45%')}
    <div style="height:32px;width:55%;background:rgba(0,0,0,0.06);border-radius:6px;margin:8px 0"></div>
    ${showSub ? skelLine('70%') : ''}
  </div>`;
  document.getElementById('pageContent').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Welcome, ${userName} 👋</div>
        <div class="page-sub">${monthLabel()} Financial Overview</div>
      </div>
    </div>

    <section style="margin:0 0 18px">
      <div style="font-size:10.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:8px;text-align:center">Select Period Type</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div style="padding:12px 14px;border-radius:12px;border:1.5px solid ${useRemPeriod?'var(--primary)':'var(--border)'};background:${useRemPeriod?'rgba(15,110,86,0.10)':'var(--bg)'};text-align:left">
          <div style="font-size:13px;font-weight:700;color:${useRemPeriod?'var(--primary)':'var(--text2)'};line-height:1.25">${monthName} Remittance Period</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">the custom RCCG period</div>
          ${chip}
        </div>
        <div style="padding:12px 14px;border-radius:12px;border:1.5px solid ${!useRemPeriod?'var(--primary)':'var(--border)'};background:${!useRemPeriod?'rgba(15,110,86,0.10)':'var(--bg)'};text-align:left">
          <div style="font-size:13px;font-weight:700;color:${!useRemPeriod?'var(--primary)':'var(--text2)'};line-height:1.25">${monthName} Calendar Period</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">the normal month period</div>
          ${chip}
        </div>
      </div>
    </section>

    <div style="background:rgba(99,102,241,0.05);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:12px 18px;margin-bottom:14px;height:48px"></div>
    ${skelCard(true)}
    ${skelCard(true)}
    ${skelCard(true)}
    ${loadingFooter('Loading dashboard…')}
  `;
  NetLoad.sync();
}

// Generic skeleton for pages that follow the standard "header + KPI grid +
// tabs/content" layout (Income, Expenses, Bank). Paints synchronously from
// state alone so the user sees structure within ~50ms even on slow networks.
function renderPageSkeleton({ pageTitle, pageSub, kpiCount = 3, hasTabs = true, hint = 'Loading…' }){
  const skelLine = (w, h = 14) => `<div style="height:${h}px;width:${w};background:rgba(0,0,0,0.06);border-radius:5px;margin:6px 0"></div>`;
  const skelKpi = `<div class="kpi">
    <div class="kpi-icon" style="background:rgba(0,0,0,0.04)"></div>
    ${skelLine('70%', 14)}
    ${skelLine('55%', 26)}
    ${skelLine('80%', 12)}
  </div>`;
  document.getElementById('pageContent').innerHTML = `
    <div class="page-header">
      <div><div class="page-title">${pageTitle}</div><div class="page-sub">${pageSub}</div></div>
    </div>
    <div class="kpi-grid" style="margin-bottom:16px">${Array(kpiCount).fill(skelKpi).join('')}</div>
    ${hasTabs ? '<div class="card" style="margin-bottom:12px"><div style="height:32px;background:rgba(0,0,0,0.04);border-radius:8px"></div></div>' : ''}
    ${loadingFooter(hint)}
  `;
  NetLoad.sync();
}

// Shared graceful-error UI for pages whose fetches are wrapped in
// Promise.allSettled. Lists failed sources in plain English and gives the
// user a single prominent Retry button. extraButtons accepts raw HTML for
// pages that want to offer a secondary escape (e.g. dashboard offers
// "View Transactions").
function renderPageErrorState({ pageId, pageTitle, pageSub, failed, extraButtons = '' }){
  const labels = failed.map(f => f.label);
  failed.forEach(f => console.error(`${pageId} fetch failed (${f.label}):`, f.err));
  document.getElementById('pageContent').innerHTML = `
    <div class="page-header">
      <div><div class="page-title">${pageTitle}</div><div class="page-sub">${pageSub}</div></div>
    </div>
    <div class="card">
      <div class="alert alert-danger" style="margin-bottom:14px">
        <span class="alert-icon">⚠</span>
        <div>
          <div style="font-weight:600;margin-bottom:4px">Couldn't load ${labels.length === 1 ? 'one part of' : 'parts of'} this page</div>
          <div style="font-size:13px">${labels.length === 1 ? 'This part' : 'These parts'} didn't load: <strong>${labels.join(', ')}</strong>. Your network may be slow or unstable.</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="App.navigate('${pageId}')">Retry</button>
        ${extraButtons}
      </div>
    </div>
  `;
}

// Shown when one or more endpoints fail to load after retries. Lists exactly
// what failed (in plain language, not endpoint names) and gives the user a
// single, prominent Retry button — much better than the previous "Error
// loading page: Failed to fetch" blank screen.
function renderDashboardErrorState(failed){
  const userName = (state.user?.name?.split(/\s+/).slice(0,2).join(' ')) || 'User';
  renderPageErrorState({
    pageId: 'dashboard',
    pageTitle: `Welcome, ${userName} 👋`,
    pageSub: `${monthLabel()} Financial Overview`,
    failed,
    extraButtons: `<button class="btn" onclick="App.navigate('transactions')">View Transactions instead</button>`,
  });
}

async function renderDashboard(){
  // Phase 1 — paint the shell synchronously so the user sees structure now.
  renderDashboardSkeleton();

  // Phase 2 — one batched request for all seven dashboard tables (falls back to
  // the individual endpoints if the batch route is unavailable). apiFetch retries
  // transient failures (network drops, timeouts, 5xx) under the hood; a permanent
  // failure surfaces a clear error UI instead of blanking the dashboard. The batch
  // seeds the per-endpoint cache, so moving to Transactions/Income/Bank next
  // reuses this data with no extra fetch.
  let _dash;
  try {
    _dash = await loadDashboardData();
  } catch(e){
    renderDashboardErrorState(e.failed || [{ label: 'Dashboard data', err: e }]);
    return;
  }
  const allIncomeDash   = _dash.income;
  const allExpensesDash = _dash.expenses;
  const pettyHistDash   = _dash.petty;
  const settingsDash    = _dash.settings;
  const allRemsDash     = _dash.remittances;
  const pettyConfigDash = _dash.pettyConfig;
  const cashTxDash      = _dash.cashTransactions;
  // Derived from settings, which loadDashboardData has already cached — no fetch.
  // satellite-funds is not part of the dashboard batch payload; fetched in parallel
  // here so calcChurchBalance below never has to self-fetch it (cached 60s either way).
  const [remRatesDash, allSatFundsDash] = await Promise.all([getRemRates(), DB.getSatelliteFunds()]);
  const settings = settingsDash;
  const { from: dashPeriodFrom, to: dashPeriodTo } =
    computeRemPeriodDates(settings, allRemsDash, state.year, state.month);
  const useRemPeriod = state.periodMode === 'remittance';
  // As-of date: every "current state" KPI on the dashboard is anchored here, so selecting
  // a past period gives a true historical snapshot. For the current period the period end
  // is in the future, so we cap at today (no future records exist).
  const _nowForAsOf = new Date();
  const dashTodayStrForAsOf = ymdLocal(_nowForAsOf);
  const dashPeriodEnd = useRemPeriod ? dashPeriodTo : ymdLocal(new Date(state.year, state.month+1, 0));
  const dashAsOfDate = dashPeriodEnd < dashTodayStrForAsOf ? dashPeriodEnd : dashTodayStrForAsOf;
  const dashIsPastPeriod = dashPeriodEnd < dashTodayStrForAsOf;
  const dashAsOfLabel = fmtDate(dashAsOfDate);
  const _onOrBefore = r => {
    const d = String(r?.date || r?.dateNeeded || r?.createdAt || '').slice(0,10);
    return !d || d <= dashAsOfDate;
  };
  const _paidOnOrBefore = r => {
    const d = remittanceSettledDate(r);
    return !d || d <= dashAsOfDate;
  };
  const income   = useRemPeriod ? filterByDateRange(allIncomeDash,   dashPeriodFrom, dashPeriodTo) : filterByMonth(allIncomeDash);
  const expenses = useRemPeriod ? filterByDateRange(allExpensesDash, dashPeriodFrom, dashPeriodTo) : filterByMonth(allExpensesDash);
  const petty = { history: pettyHistDash, float: pettyConfigDash.float, max: pettyConfigDash.max };
  // For past periods, "all income/expenses" excludes records dated after the as-of date so
  // the all-time accumulators (remittance due, etc.) only see what existed on that day.
  const allIncome = dashIsPastPeriod ? allIncomeDash.filter(_onOrBefore) : allIncomeDash;
  const allExpenses = dashIsPastPeriod ? allExpensesDash.filter(_onOrBefore) : allExpensesDash;
  const allRemsForKpi = dashIsPastPeriod ? allRemsDash.filter(r => (r.status === 'paid' || r.status === 'written_off') ? _paidOnOrBefore(r) : _onOrBefore(r)) : allRemsDash;

  const totalIncome = income.reduce((s,r)=>s+(r.totalCollection||0),0);
  const totalExpenses = expenses.reduce((s,r)=>s+(r.amount||0),0);
  const remittances = await calcRemittancesFromRecords(income, remRatesDash);
  const dashQuotas = getQuotaList(settings);
  const now=new Date();
  const dashTodayStr=ymdLocal(now);
  const dashMonthStart=ymdLocal(new Date(state.year,state.month,1));
  const dashMonthEnd=(state.year===now.getFullYear() && state.month===now.getMonth())
    ? dashTodayStr
    : ymdLocal(new Date(state.year,state.month+1,0));
  // getQuotaLinesForPeriod caps at today internally — future Sundays in the
  // remittance period don't pre-accrue.
  const dashQuotaLines=getQuotaLinesForPeriod(
    dashQuotas,
    useRemPeriod ? dashPeriodFrom : dashMonthStart,
    useRemPeriod ? dashPeriodTo : dashMonthEnd
  );
  const dashRegionalAmt  = dashQuotaLines.find(q=>q.label.toLowerCase().includes('regional contribution'))?.amount||0;
  const dashMummyAmt     = dashQuotaLines.find(q=>isMummyQuotaLabel(q.label))?.amount||0;
  const dashNatlQuotasAmt = dashQuotaLines
    .filter(q=>!q.label.toLowerCase().includes('regional contribution') && !isMummyQuotaLabel(q.label))
    .reduce((s,q)=>s+(q.amount||0),0);
  const dashAllQuotasAmt = dashNatlQuotasAmt + dashRegionalAmt + dashMummyAmt;
  const netLocal = remittances.netLocal - dashAllQuotasAmt;
  // Other Income recorded under the "Local Church Use Only" category has no INCOME_TYPES
  // field populated, so it contributes zero to remittance but inflates totalIncome.
  // Pull it out explicitly so the split card doesn't quietly fold it into the HQ share.
  const otherUnremittedIncome = income
    .filter(r => r.source && r.source !== 'sunday_collection')
    .filter(r => INCOME_TYPES.reduce((s,t)=>s+(r[t.key]||0),0) === 0)
    .reduce((s,r) => s + (r.totalCollection||0), 0);
  const parishRetains      = Math.max(0, netLocal);
  const rccgAuthorityShare = Math.max(0, totalIncome - parishRetains - otherUnremittedIncome);
  const dashRemRates = remRatesDash?.rates || DEFAULT_REMITTANCE_RATES;
  const dashSundayRecs = income.filter(r => !r.source || r.source === 'sunday_collection');
  const dashChildrenTeacherTotal = dashSundayRecs.reduce((s, r) => s + getChildrenTeacherHeldCash(r, dashRemRates), 0);
  // All-time unsettled Children Teacher's cash. getSundayCashWithAccountant subtracts
  // this from churchBal.total silently (treating it as "not with the accountant"), which
  // skews the algebraic opening-balance derivation. We surface it as an explicit
  // deduction line in the Actual Balance breakdown so the opening balance can reflect
  // the TRUE prior-period closing balance instead of being adjusted to make the math
  // appear to work.
  const dashAllUnsettledChildrenTeacherCash = allIncome
    .filter(r => !r.source || r.source === 'sunday_collection')
    .reduce((s, r) => s + getChildrenTeacherHeldCash(r, dashRemRates), 0);
  // Check if the current month's remittance has already been paid or partially paid.
  // A remittance is considered "for this month" when its periodTo falls within the viewed year/month.
  const dashMonthPrefix = `${state.year}-${String(state.month+1).padStart(2,'0')}`;
  const dashMonthPaidRems = allRemsForKpi.filter(r=>r.status==='paid' && (r.periodTo||'').startsWith(dashMonthPrefix));
  const dashMonthPaidAmt = dashMonthPaidRems.reduce((s,r)=>s+(r.amount||0),0);
  // Current month due (used only for paid/partial status label).
  const dashCurrentMonthRemDue = totalRemittanceDue(remittances, dashAllQuotasAmt);
  // Use the due-at-payment snapshot (stored when the payment was submitted) as the reference
  // for "fully paid". For old records without a snapshot, fall back to amountPaid on past
  // periods (assume the recorded payment was a full settlement) or recalculated due otherwise.
  const dashMonthDueSnapshot = dashMonthPaidRems.reduce((max, r) => Math.max(max, r.dueAtTimeOfPayment || 0), 0);
  const dashKpiEffectiveDue = dashMonthDueSnapshot > 0 ? dashMonthDueSnapshot
    : (dashIsPastPeriod && dashMonthPaidRems.length > 0 ? dashMonthPaidAmt : dashCurrentMonthRemDue);
  // Part A/B awareness: both parts must be paid for "fully paid" status.
  // Legacy (no part) records are treated as covering everything.
  const _dashHasLegacy = dashMonthPaidRems.some(r => !r.part);
  const _dashHasPartA = dashMonthPaidRems.some(r => r.part === 'a');
  const _dashHasPartB = dashMonthPaidRems.some(r => r.part === 'b');
  const dashKpiIsPaid = _dashHasLegacy
    ? (dashMonthPaidAmt > 0 && dashMonthPaidAmt >= dashKpiEffectiveDue * PAYMENT_TOLERANCE_THRESHOLD)
    : (_dashHasPartA && _dashHasPartB);
  const dashKpiIsPartial = dashMonthPaidAmt > 0 && !dashKpiIsPaid;
  const dashDueLabel = getRemittanceDueLabel(settings, state.year, state.month,
    { isPaid: dashKpiIsPaid, isPartial: dashKpiIsPartial, paidAmount: dashMonthPaidAmt });
  // ── Outstanding remittance KPI ──────────────────────────────────────────────────────────────
  // Strategy: only recalculate income-based remittances for UNSETTLED periods (periods that
  // have no paid remittance record). For SETTLED periods, use the due_at_time_of_payment
  // snapshot stored when the payment was submitted — this is rate-change-proof because it
  // captures the rates in effect at the time, not today's rates.
  // Old records without a snapshot fall back to amountPaid (treating the recorded payment
  // as a full settlement, which is the correct assumption for any approved past payment).
  //
  // This prevents the classic bug: changing remittance percentages retroactively inflates the
  // "due" on already-paid periods and manufactures phantom prior-period debt.
  const dashFirstIncRec = allIncome.length > 0 ? allIncome[allIncome.length-1] : null;
  const dashFirstDateStr = (dashFirstIncRec ? (dashFirstIncRec.date||dashFirstIncRec.createdAt||'') : '').slice(0,10);
  // Sunday-prorate accumulated quotas so the all-time KPI uses the same basis as the
  // current-period split shown in the income card and on the Remittances page.
  // Anchor the upper bound at the as-of date — TODAY for current periods (so only
  // elapsed Sundays accrue), or the period cut-off for historical snapshots.
  const dashAccumQuotas = dashFirstIncRec
    ? accumQuotasAcrossPeriods(dashQuotas, settingsDash, allRemsForKpi, dashFirstDateStr, dashAsOfDate)
    : 0;
  // Identify settled periods (have at least one paid or written-off remittance with period dates).
  const _dashSettledPeriodKeys = [...new Set(
    allRemsForKpi
      .filter(r => (r.status === 'paid' || r.status === 'written_off') && r.periodFrom && r.periodTo)
      .map(r => `${r.periodFrom}|${r.periodTo}`)
  )].filter(key => {
    // A period is only "settled" when BOTH Part A and Part B are paid (or a legacy payment covers all)
    const [pFrom, pTo] = key.split('|');
    const ppRems = allRemsForKpi.filter(r => (r.status === 'paid' || r.status === 'written_off') && r.periodFrom === pFrom && r.periodTo === pTo);
    const hasLegacy = ppRems.some(r => !r.part);
    const hasPartA = ppRems.some(r => r.part === 'a');
    const hasPartB = ppRems.some(r => r.part === 'b');
    return hasLegacy || (hasPartA && hasPartB);
  });
  const _dashSettledPeriodRanges = _dashSettledPeriodKeys.map(k => {
    const [from, to] = k.split('|'); return { from, to };
  });
  // Genuine shortfall from settled periods: true_due − amount_paid − amount_written_off.
  // If no snapshot (old record): recalculate fresh so late-added Sunday collections or
  // quota changes surface as a reconcilable shortfall instead of silently vanishing.
  let dashSettledShortfall = 0;
  const dashShortfallPeriods = [];
  for(const key of _dashSettledPeriodKeys){
    const [pFrom, pTo] = key.split('|');
    const ppRems = allRemsForKpi.filter(r => (r.status === 'paid' || r.status === 'written_off') && r.periodFrom === pFrom && r.periodTo === pTo);
    const ppPaid = ppRems.filter(r => r.status === 'paid').reduce((s, r) => s + (r.amount || 0), 0);
    const ppWrittenOff = ppRems.filter(r => r.status === 'written_off').reduce((s, r) => s + (r.amount || 0), 0);
    const ppSnapshot = ppRems.filter(r => r.status === 'paid').reduce((max, r) => Math.max(max, r.dueAtTimeOfPayment || 0), 0);
    let ppTrueDue;
    if(ppSnapshot > 0){
      ppTrueDue = ppSnapshot;
    } else {
      // Fresh calc: surface late-added Sunday collections or quota changes so the
      // user can reconcile the shortfall (pay balance or write off with justification).
      const ppIncome = allIncome.filter(r => {
        const d = String(r?.date || r?.dateNeeded || r?.createdAt || '').slice(0,10);
        return d && d >= pFrom && d <= pTo;
      });
      const ppRemCalc = await calcRemittancesFromRecords(ppIncome, remRatesDash);
      const ppQuotaTotal = sumQuotaLines(getQuotaLinesForPeriod(dashQuotas, pFrom, pTo));
      ppTrueDue = totalRemittanceDue(ppRemCalc, ppQuotaTotal);
    }
    const shortfall = Math.max(0, ppTrueDue - ppPaid - ppWrittenOff);
    dashSettledShortfall += shortfall;
    if(shortfall >= 0.5){ // 50 kobo threshold — ignore floating-point noise
      dashShortfallPeriods.push({ from: pFrom, to: pTo, due: ppTrueDue, paid: ppPaid, writtenOff: ppWrittenOff, shortfall });
    }
  }
  state.reconcileShortfalls = dashShortfallPeriods;
  // Income from UNSETTLED periods only — rate changes don't affect settled periods.
  const dashUnsettledIncome = allIncome.filter(r => {
    const d = r.date || r.createdAt || '';
    return !d || !_dashSettledPeriodRanges.some(p => d >= p.from && d <= p.to);
  });
  const dashUnsettledRemCalc = await calcRemittancesFromRecords(dashUnsettledIncome, remRatesDash);
  const dashUnsettledIncomeRemDue = totalRemittanceDue(dashUnsettledRemCalc);
  // Quotas: subtract settled-period quotas — only unsettled-period quotas contribute to KPI.
  const dashSettledPeriodQuotas = _dashSettledPeriodRanges.reduce((sum, pp) =>
    sum + sumQuotaLines(getQuotaLinesForPeriod(dashQuotas, pp.from, pp.to)), 0);
  const dashUnsettledQuotas = dashAccumQuotas - dashSettledPeriodQuotas;
  // KPI = unsettled-period income due + unsettled-period quotas + genuine shortfall from settled periods.
  const dashTotalRemDueKpi = Math.max(0, dashUnsettledIncomeRemDue + dashUnsettledQuotas + dashSettledShortfall);
  // Split the all-time outstanding into "this period" vs "prior periods" so the dashboard
  // can show the selected period in the headline and surface any carryover as a sub-line.
  // The sum of the two always equals dashTotalRemDueKpi, so the Available Fund math is unchanged.
  const dashThisPeriodUnpaid = calcCurrentPeriodOutstandingRemittance(
    dashCurrentMonthRemDue,
    dashMonthPaidAmt,
    dashTotalRemDueKpi
  );
  const dashPriorUnpaid = dashTotalRemDueKpi - dashThisPeriodUnpaid;
  // Income from periods not yet covered by a paid remittance — denominator for the % metric.
  const dashPaidPeriods = allRemsForKpi.filter(r=>r.status==='paid'&&r.periodFrom&&r.periodTo).map(r=>({from:r.periodFrom,to:r.periodTo}));
  const dashUnpaidPeriodIncome = allIncomeDash.filter(r=>{
    const d=r.date||r.createdAt||'';
    return !d||!dashPaidPeriods.some(p=>d>=p.from&&d<=p.to);
  }).reduce((s,r)=>s+(r.totalCollection||0),0);
  // Historical snapshot when a past period is selected; live balance otherwise.
  const churchBal = await calcChurchBalance(dashIsPastPeriod ? dashAsOfDate : null, {
    income: allIncomeDash, expenses: allExpensesDash, remittances: allRemsDash,
    cashTx: cashTxDash, pettyHistory: pettyHistDash, pettyConfig: pettyConfigDash,
    satelliteFunds: allSatFundsDash,
    remRates: (remRatesDash.rates || DEFAULT_REMITTANCE_RATES)
  });
  const dashSatHeldDisp = satelliteHeldDisplay(churchBal.heldForSatellites);
  const pendingPetty = (pettyHistDash||[]).filter(h=>h.status==='pending_approval').length;
  const overdueRems = allRemsDash.filter(r=>r.status==='overdue').length;

  // Spendable = total church funds − net accumulated unpaid remittances.
  const dashOutstandingRems = dashTotalRemDueKpi;
  const dashTotalFunds = churchBal.total;
  const dashSpendable = dashTotalFunds - dashOutstandingRems;

  // ── Petty Cash Sustainability Indicator ──
  const _pettyTarget     = parseFloat(settingsDash?.pettyTargetFloat||0)||90000;
  const _pettyManageable = parseFloat(settingsDash?.pettyManageableFloat||0)||60000;
  const _pettyMinimum    = parseFloat(settingsDash?.pettyMinimumFloat||0)||40000;
  const _pettyBuffer     = parseFloat(settingsDash?.pettyBufferAmount||0)||30000;
  const _pettyCurrentFloat = churchBal.pettyFloat || 0;
  const _pettyTopUpNeeded  = Math.max(0, _pettyTarget - _pettyCurrentFloat);
  const _pettyAfterObligs  = dashSpendable - _pettyCurrentFloat - _pettyTopUpNeeded;
  // Max achievable petty float = all available funds (dashSpendable already includes
  // pettyCurrentFloat, so adding it again would double-count the deficit).
  const _pettyMaxFloat     = Math.max(dashSpendable, _pettyCurrentFloat);

  let dashSpendLabel, dashSpendColor, _pettyIcon, _pettyMsg;
  if (_pettyAfterObligs >= _pettyBuffer) {
    dashSpendLabel = 'Healthy'; dashSpendColor = 'var(--success)'; _pettyIcon = '🟢';
    _pettyMsg = `✅ Petty cash is sustainable. You can comfortably top up to ${fmt(_pettyTarget)} petty cash for next period.`;
  } else if (_pettyAfterObligs >= 0) {
    dashSpendLabel = 'Adequate'; dashSpendColor = '#1976D2'; _pettyIcon = '🔵';
    _pettyMsg = `👍 Can reach ${fmt(_pettyTarget)} petty cash target for next period but only ${fmt(_pettyAfterObligs)} will remain.`;
  } else if (_pettyMaxFloat >= _pettyManageable) {
    dashSpendLabel = 'Caution'; dashSpendColor = '#B8860B'; _pettyIcon = '🟡';
    _pettyMsg = `⚠️ Cannot reach ${fmt(_pettyTarget)} petty cash target for next period but can top up to ${fmt(_pettyMaxFloat)} which is above ${fmt(_pettyManageable)} manageable. Watch your spending.`;
  } else if (_pettyMaxFloat >= _pettyMinimum) {
    dashSpendLabel = 'Tight'; dashSpendColor = '#D97706'; _pettyIcon = '🟠';
    _pettyMsg = `⚠️ Can only top up to ${fmt(_pettyMaxFloat)} petty cash for next period — below ${fmt(_pettyManageable)} manageable. Consider reducing non-essential expenses.`;
  } else {
    dashSpendLabel = 'Critical'; dashSpendColor = 'var(--danger)'; _pettyIcon = '🔴';
    _pettyMsg = `🚨 Can only top up to ${fmt(_pettyMaxFloat)} petty cash for next period — below ${fmt(_pettyMinimum)} minimum. Please review expenses and income this period.`;
  }

  // Reconciliation card figures — include EVERY balance-affecting expense for the period:
  //   1. Logged expenses (approved + pending_approval), EXCLUDING those auto-created when an
  //      advance is settled. Those carry a pettyRef and are bookkeeping duplicates of the
  //      original advance — counting both double-counts the same petty cash spend.
  //   2. Approved/settled petty cash advances dated in this period. The float was debited
  //      at approval time, so the cash has already left the church's coffers; this is the
  //      moment the expense really happens, regardless of when (or whether) the receipt
  //      is later attached. For settled advances we use actualAmount so over-/under-spend
  //      is captured. The advance's approval date drives period membership.
  const totalPeriodApprExpenses = expenses
    .filter(e => e.status === 'approved' && !e.pettyRef)
    .reduce((s, e) => s + (e.amount || 0), 0);
  const totalPeriodPendingExpenses = expenses
    .filter(e => isPendingExpense(e) && !e.pettyRef)
    .reduce((s, e) => s + (e.amount || 0), 0);
  const totalPeriodLoggedExpenses = totalPeriodApprExpenses + totalPeriodPendingExpenses;

  const pettyAdvanceInPeriod = (h) => {
    if(!isApprovedOrSettledAdvance(h)) return false;
    const d = pettyAdvanceImpactDate(h);
    if(!d) return false;
    if(useRemPeriod) return d >= dashPeriodFrom && d <= dashPeriodTo;
    const dt = new Date(d);
    return dt.getMonth() === state.month && dt.getFullYear() === state.year;
  };
  const periodPettyAdvances = pettyHistDash.filter(pettyAdvanceInPeriod);
  const totalPeriodPettyAdvanceSpend = periodPettyAdvances
    .reduce((s, h) => s + pettyAdvanceImpactAmount(h), 0);
  const pendingPettyAdvanceCount = periodPettyAdvances
    .filter(h => h.status === 'approved' && !h.receiptNo).length;

  const totalPeriodAllExpenses = totalPeriodLoggedExpenses + totalPeriodPettyAdvanceSpend;

  // --- Opening balance = prior period's closing Total Church Balance ---
  // Date-helpers for the prior-close snapshot and card labels.
  const _pStart = new Date(dashPeriodFrom + 'T00:00:00');
  const _dayBefore = new Date(_pStart); _dayBefore.setDate(_dayBefore.getDate() - 1);
  const _lastDayPrevMo = new Date(state.year, state.month, 0);
  const dashPriorCloseDate = useRemPeriod ? ymdLocal(_dayBefore) : ymdLocal(_lastDayPrevMo);
  // Call calcChurchBalance for the day before this period began. The prefetched arrays
  // already contain all historical records, so no extra API call is needed.
  const dashOpeningBal = await calcChurchBalance(dashPriorCloseDate, {
    income: allIncomeDash, expenses: allExpensesDash, remittances: allRemsDash,
    cashTx: cashTxDash, pettyHistory: pettyHistDash, pettyConfig: pettyConfigDash,
    satelliteFunds: allSatFundsDash,
    remRates: (remRatesDash.rates || DEFAULT_REMITTANCE_RATES)
  });
  // dashCarriedForward is the opening amount shown on the card.
  // By construction, May's closing TCB === June's opening — period continuity is exact.
  const dashCarriedForward = dashOpeningBal.total;
  const dashCarriedFwdDateStr = useRemPeriod
    ? `${_dayBefore.getDate()} ${MONTHS[_dayBefore.getMonth()].slice(0,3)}`
    : `${_lastDayPrevMo.getDate()} ${MONTHS[_lastDayPrevMo.getMonth()].slice(0,3)}`;
  const dashCarriedFwdLabel = useRemPeriod
    ? `Opening balance (as of ${dashCarriedFwdDateStr})`
    : `Opening balance (as of ${dashCarriedFwdDateStr})`;
  const dashOpeningIncome = allIncomeDash.filter(r => {
    const d = String(r?.date || r?.dateNeeded || r?.createdAt || '').slice(0,10);
    return !d || d <= dashPriorCloseDate;
  });
  const dashOpeningAllTimeRemittances = await calcRemittancesFromRecords(dashOpeningIncome, remRatesDash);
  const dashOpeningIncomeRemDue = totalRemittanceDue(dashOpeningAllTimeRemittances);
  const dashOpeningFirstIncRec = dashOpeningIncome.length > 0 ? dashOpeningIncome[dashOpeningIncome.length-1] : null;
  const dashOpeningFirstDateStr = (dashOpeningFirstIncRec ? (dashOpeningFirstIncRec.date||dashOpeningFirstIncRec.createdAt||'') : '').slice(0,10);
  const dashOpeningAccumQuotas = dashOpeningFirstIncRec
    ? accumQuotasAcrossPeriods(dashQuotas, settingsDash, allRemsDash, dashOpeningFirstDateStr, dashPriorCloseDate)
    : 0;
  const dashOpeningPaidRems = allRemsDash
    .filter(r => r.status === 'paid' || r.status === 'written_off')
    .filter(r => {
      const d = remittanceSettledDate(r);
      return !d || d <= dashPriorCloseDate;
    })
    .reduce((s,r)=>s+(r.amount||0),0);
  const dashOpeningOutstandingRems = Math.max(0, dashOpeningIncomeRemDue + dashOpeningAccumQuotas - dashOpeningPaidRems);
  const dashPeriodRemittancesPaid = allRemsDash
    .filter(r => r.status === 'paid')
    .filter(r => {
      const d = String(r?.paidDate || r?.date || r?.createdAt || '').slice(0,10);
      if(!d) return false;
      if(useRemPeriod) return d >= dashPeriodFrom && d <= dashPeriodTo;
      const dt = new Date(d);
      return dt.getMonth() === state.month && dt.getFullYear() === state.year;
    })
    .reduce((s,r)=>s+(r.amount||0),0);
  // Satellite pass-through funds reclassified into the parish's own money this period
  // (satellite_funds direction='transfer_out' — see calcChurchBalance/heldForSatellites).
  // Dashboard's totalIncome comes purely from the income table, so none of this is baked
  // in there — it must be added explicitly, or this flow-reconstruction under-counts
  // relative to churchBal.total (which already reflects it via heldForSatellites).
  const dashPeriodSatTransferOut = (allSatFundsDash||[])
    .filter(s => s.direction === 'transfer_out')
    .filter(s => {
      const d = String(s?.date || s?.createdAt || '').slice(0,10);
      if(!d) return false;
      if(useRemPeriod) return d >= dashPeriodFrom && d <= dashPeriodTo;
      const dt = new Date(d);
      return dt.getMonth() === state.month && dt.getFullYear() === state.year;
    })
    .reduce((s,r)=>s+(r.amount||0),0);
  const dashAdminManagedIncome = totalIncome - dashChildrenTeacherTotal;
  const dashChurchBalanceFromOpening = calcChurchBalanceFromOpening(
    dashCarriedForward,
    totalIncome,
    dashChildrenTeacherTotal,
    totalPeriodAllExpenses,
    dashPeriodRemittancesPaid,
    dashPeriodSatTransferOut
  );
  const dashOutstandingRemsFromFlow = calcOutstandingRemittancesFromFlow(
    dashOpeningOutstandingRems,
    dashCurrentMonthRemDue,
    dashPeriodRemittancesPaid
  );
  const dashAvailableFromOpening = calcAvailableFundFromOpening(
    dashCarriedForward,
    dashOpeningOutstandingRems,
    totalIncome,
    dashChildrenTeacherTotal,
    totalPeriodAllExpenses,
    dashCurrentMonthRemDue,
    dashPeriodSatTransferOut
  );

  // Feed items — richer detail for Recent Transactions card
  const recentIncome = allIncome.slice(0,4);
  const recentExp = allExpenses.slice(0,4);
  const recentRems = allRemsForKpi.filter(r=>r.status==='paid').slice(0,3);
  const recentPetty = pettyHistDash.filter(h=>h.type==='disbursement'&&h.status==='approved'&&(!dashIsPastPeriod||_onOrBefore(h))).slice(0,2);
  const feedItems = [
    ...recentIncome.map(r=>{
      const isSunday = !r.source || r.source==='sunday_collection';
      const deposited = r.depositConfirmed;
      const bankAmt = r.bankTransferAmount||0;
      const method = r.paymentMethod || (bankAmt>0 ? 'bank_transfer' : 'cash');
      let title, methodLabel;
      if(isSunday){
        title = deposited ? 'Sunday collections deposited' : 'Sunday collections collected (cash)';
        methodLabel = deposited ? 'Deposited by Accountant' : (bankAmt>0 ? txMethodLabel('bank_transfer') : 'Cash held by Accountant');
      } else {
        const srcMeta = OTHER_INCOME_SOURCES.find(s=>s.key===r.source)||{label:(r.source||'Other').replace(/_/g,' ')};
        title = srcMeta.label;
        methodLabel = txMethodLabel(method);
      }
      return {type:'income',date:r.date,
        title,
        sub: `${fmtDate(r.date)} · ${methodLabel}`,
        amt:r.totalCollection, icon:'🏛️', color:'#1D9E75', bg:'rgba(29,158,117,0.15)'};
    }),
    ...recentExp.map(r=>{
      const c=EXPENSE_CATS_ALL.find(x=>x.key===r.category)||{label:r.category||'Expense',icon:'💸'};
      return {type:'expense',date:r.date||r.createdAt,
        title: `${c.label} – ${r.subCategory||r.description||'expense'}`,
        sub: `${fmtDate(r.date||r.createdAt)} · ${r.recordedBy||'Admin'}${r.receiptNo?' · Receipt #'+r.receiptNo:''}`,
        amt:r.amount, icon:c.icon||'💸', color:'#A32D2D', bg:'rgba(163,45,45,0.12)'};
    }),
    ...recentRems.map(r=>({type:'remittance',date:r.date||r.createdAt,
      title: `HQ remittance – ${r.incomeType||'payment'}`,
      sub: `${fmtDate(r.date||r.createdAt)} · Bank transfer · Signatories: ${r.signatories||'Pastor + Elder'}`,
      amt:r.amount, icon:'✓', color:'#534AB7', bg:'rgba(83,74,183,0.12)'})),
    ...recentPetty.map(h=>({type:'petty',date:h.createdAt||h.dateNeeded,
      title: `Petty cash – ${h.purpose||'disbursement'}`,
      sub: `${fmtDate(h.createdAt||h.dateNeeded)} · ${h.requestedBy||'Admin'}${h.receiptNo?' · Receipt #'+h.receiptNo:''}`,
      amt:h.actualAmount||h.amount, icon:'💳', color:'#BA7517', bg:'rgba(186,117,23,0.12)'}))
  ]
  .sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);

  // Income breakdown by type (includes Sunday collection types + Other Income)
  const incomeByCat = {};
  income.forEach(r=>{
    if(!r.source || r.source==='sunday_collection'){
      INCOME_TYPES.forEach(t=>{
        if(r[t.key]) incomeByCat[t.key] = (incomeByCat[t.key]||0) + (r[t.key]||0);
      });
    } else {
      const srcKey = r.source||'other';
      incomeByCat[srcKey] = (incomeByCat[srcKey]||0) + (r.totalCollection||0);
    }
  });
  const allIncomeCats = Object.entries(incomeByCat).sort((a,b)=>b[1]-a[1]);
  let displayIncomeCats = allIncomeCats;
  if(allIncomeCats.length > 5){
    displayIncomeCats = allIncomeCats.slice(0,4);
    const othersTotal = allIncomeCats.slice(4).reduce((s,e)=>s+e[1],0);
    if(othersTotal>0) displayIncomeCats.push(['_others',othersTotal]);
  }
  const maxIncomeCat = displayIncomeCats[0]?.[1]||1;
  // In remittance mode count distinct Sunday dates already recorded in the period (the period
  // may include Sundays from the tail of the prior calendar month). In calendar mode use the
  // date-aware helper that caps at today so only elapsed Sundays are counted.
  const sundayCount = useRemPeriod
    ? new Set(income.filter(r=>!r.source||r.source==='sunday_collection').map(r=>r.date)).size
    : countSundaysInMonth(state.year, state.month);

  const expByCat = {};
  expenses.forEach(e=>{ expByCat[e.category]=(expByCat[e.category]||0)+(e.amount||0) });
  const topCats = Object.entries(expByCat).sort((a,b)=>b[1]-a[1]).slice(0,7);
  const maxCat = topCats[0]?.[1]||1;

  // Pre-compute SVG donut-chart paths for the expense breakdown pie slide.
  // Each slice is a closed SVG path arc traced from the outer ring to the inner ring.
  const _expDonutSlices=(()=>{
    if(!topCats.length||!totalExpenses) return '';
    const cx=100,cy=97,oR=80,iR=50;
    let angle=-90; // start at 12 o'clock
    return topCats.map(([cat,amt])=>{
      const c=EXPENSE_CATS_ALL.find(e=>e.key===cat)||{color:'#999'};
      const sweep=(amt/totalExpenses)*360;
      if(sweep<0.4) return '';
      const r=n=>n.toFixed(2);
      const a1=angle*Math.PI/180, a2=(angle+sweep)*Math.PI/180;
      const lg=sweep>180?1:0;
      const path=`<path d="M${r(cx+oR*Math.cos(a1))},${r(cy+oR*Math.sin(a1))} A${oR},${oR} 0 ${lg} 1 ${r(cx+oR*Math.cos(a2))},${r(cy+oR*Math.sin(a2))} L${r(cx+iR*Math.cos(a2))},${r(cy+iR*Math.sin(a2))} A${iR},${iR} 0 ${lg} 0 ${r(cx+iR*Math.cos(a1))},${r(cy+iR*Math.sin(a1))} Z" fill="${c.color}" stroke="#fff" stroke-width="2.5"/>`;
      angle+=sweep; return path;
    }).join('');
  })();

  // Alerts — only shown in the live view. For a historical snapshot they'd be misleading
  // (an "overdue" or "low balance" warning rendered in retrospect implies action that's no
  // longer possible) so they're suppressed when a past period is selected.
  let alerts='';
  if(!dashIsPastPeriod){
    if(overdueRems>0) alerts+=`<div class="alert alert-danger"><span class="alert-icon">⚠</span><span>${overdueRems} remittance(s) are <strong>overdue</strong>. Please process immediately.</span></div>`;
    if(pendingPetty>0) alerts+=`<div class="alert alert-warn"><span class="alert-icon">⏳</span><span>${pendingPetty} petty cash request(s) awaiting approval. <button class="btn btn-sm" onclick="App.navigate('petty_cash')" style="margin-left:8px">Review</button></span></div>`;
    if(dashOutstandingRems>0 && dashTotalFunds<dashOutstandingRems) alerts+=`<div class="alert alert-danger"><span class="alert-icon">🚨</span><span>Church balance is <strong>critically low</strong> and cannot cover the remittance due. Notify the KPSC immediately.</span></div>`;
    const _dashFlaggedDeps = cashTxDash.filter(t=>t.type==='cash_deposit'&&(t.verificationStatus==='flagged'||t.verificationStatus==='pending'));
    if(_dashFlaggedDeps.length>0){
      const flagCount = _dashFlaggedDeps.filter(t=>t.verificationStatus==='flagged').length;
      const pendCount = _dashFlaggedDeps.filter(t=>t.verificationStatus==='pending').length;
      const totalAmt = _dashFlaggedDeps.reduce((s,t)=>s+(t.amount||0),0);
      const parts = [];
      if(flagCount) parts.push(`${flagCount} flagged by AI`);
      if(pendCount) parts.push(`${pendCount} pending verification`);
      alerts+=`<div class="alert alert-danger"><span class="alert-icon">🧾</span><span><strong>${_dashFlaggedDeps.length} deposit(s)</strong> (${fmt(totalAmt)}) ${parts.join(' and ')}. Cash is held until resolved. <button class="btn btn-sm" onclick="App.navigate('bank')" style="margin-left:8px">Review on Bank Page</button></span></div>`;
    }
  }

  // Monthly trend (last 4 months) — income, expenses, and netLocal retained
  // Compute historical netLocal in parallel for accurate retention rates and chart visualisation
  const histMonthRetention=await Promise.all([3,2,1].map(async i=>{
    let m=state.month-i,y=state.year;
    if(m<0){m+=12;y--;}
    let mInc, quotaFrom, quotaTo;
    if(useRemPeriod){
      const { from:pf, to:pt } = computeRemPeriodDates(settings,allRemsDash,y,m);
      mInc=filterByDateRange(allIncomeDash,pf,pt);
      quotaFrom=pf; quotaTo=pt;
    } else {
      mInc=allIncomeDash.filter(r=>{const d=new Date(r.date||r.createdAt);return d.getMonth()===m&&d.getFullYear()===y;});
      quotaFrom=ymdLocal(new Date(y,m,1));
      quotaTo=(y===now.getFullYear() && m===now.getMonth()) ? ymdLocal(now) : ymdLocal(new Date(y,m+1,0));
    }
    const mTotal=mInc.reduce((s,r)=>s+(r.totalCollection||0),0);
    if(!mTotal) return {netLocal:0,retentionRate:null};
    const mRem=await calcRemittancesFromRecords(mInc);
    const mNet=mRem.netLocal-sumQuotaLines(getQuotaLinesForPeriod(dashQuotas, quotaFrom, quotaTo));
    return {netLocal:mNet,retentionRate:mNet/mTotal};
  }));
  const trendData = [];
  for(let i=3;i>=0;i--){
    let m=state.month-i; let y=state.year;
    if(m<0){m+=12;y--;}
    let mIncome,mExpenses;
    if(useRemPeriod){
      const{from:pf,to:pt}=computeRemPeriodDates(settings,allRemsDash,y,m);
      mIncome=filterByDateRange(allIncomeDash,pf,pt);
      mExpenses=filterByDateRange(allExpensesDash,pf,pt);
    }else{
      mIncome=allIncomeDash.filter(r=>{const d=new Date(r.date||r.createdAt);return d.getMonth()===m&&d.getFullYear()===y});
      mExpenses=allExpensesDash.filter(r=>{const d=new Date(r.date||r.createdAt);return d.getMonth()===m&&d.getFullYear()===y});
    }
    const mNetLocal=i===0?netLocal:(histMonthRetention[3-i]?.netLocal||0);
    trendData.push({label:MONTHS[m].slice(0,3),income:mIncome.reduce((s,r)=>s+(r.totalCollection||0),0),expenses:mExpenses.reduce((s,r)=>s+(r.amount||0),0),netLocal:mNetLocal});
  }
  const maxTrend=Math.max(...trendData.map(t=>Math.max(t.income,t.expenses)),1);

  // Forecast: adaptive Sunday-weighted income projection + expense range
  const fullMonthSundays=(y,m)=>{let c=0,d=new Date(y,m,1);while(d.getMonth()===m){if(d.getDay()===0)c++;d.setDate(d.getDate()+1);}return c;};
  // In remittance mode, count Sundays across the actual period (which may span two calendar
  // months). In calendar mode, use the full calendar month.
  const totalSundaysFullMonth = useRemPeriod
    ? countSundaysInRange(dashPeriodFrom, dashPeriodTo)
    : fullMonthSundays(state.year,state.month);
  const remainingSundays=Math.max(0,totalSundaysFullMonth-sundayCount);
  const histMonths=[];
  for(let i=3;i>=1;i--){let m=state.month-i,y=state.year;if(m<0){m+=12;y--;}
    let hInc;
    if(useRemPeriod){const{from:pf,to:pt}=computeRemPeriodDates(settings,allRemsDash,y,m);hInc=filterByDateRange(allIncomeDash,pf,pt);}
    else{hInc=allIncomeDash.filter(r=>{const d=new Date(r.date||r.createdAt);return d.getMonth()===m&&d.getFullYear()===y;});}
    // Count distinct Sunday DATES, not records — a single Sunday's collection is routinely
    // split across multiple entries (e.g. cash + transfer), so counting records would inflate
    // the Sunday count and deflate the per-Sunday rate. Mirrors the Sunday-count logic used in
    // the Income Breakdown so the forecast agrees with the rest of the dashboard.
    const hSundayDates=new Set(hInc.filter(r=>!r.source||r.source==='sunday_collection').map(r=>r.date));
    const hSundays=hSundayDates.size>0?hSundayDates.size:fullMonthSundays(y,m);
    histMonths.push({income:trendData[3-i].income,expenses:trendData[3-i].expenses,sundays:hSundays});}
  const validHist=histMonths.filter(h=>h.income>0&&h.sundays>0);
  // Current month's per-Sunday rate (most accurate signal when available)
  const currentRate=sundayCount>0?trendData[3].income/sundayCount:null;
  // Historical per-Sunday rate (weighted, newest months count more)
  let historicalRate=null;
  if(validHist.length>0){
    const wts=validHist.map((_,i)=>i+1);
    historicalRate=validHist.reduce((s,h,i)=>s+wts[i]*(h.income/h.sundays),0)/wts.reduce((s,w)=>s+w,0);
  }
  let forecastIncome=null,forecastExpenses=null,forecastRetained=null;
  const forecastLabel=currentRate!==null&&validHist.length>0?`${validHist.length}-mo. + live`:currentRate!==null?'live data':validHist.length>0?`${validHist.length}-mo. trend`:'';
  // Skip forecasting for past periods — the period is closed, projecting it is meaningless.
  if(!dashIsPastPeriod && (currentRate!==null||historicalRate!==null)){
    // Blend: current month rate gains weight as more Sundays are recorded
    const cw=sundayCount*2, hw=Math.max(1,6-cw);
    const blendedRate=currentRate!==null&&historicalRate!==null
      ?(currentRate*cw+historicalRate*hw)/(cw+hw)
      :(currentRate??historicalRate);
    const realizedIncome=trendData[3].income;
    const proj=realizedIncome+remainingSundays*blendedRate;
    // Income spread: the uncertainty lives only in the *unbanked* Sundays — money already
    // collected is known, so the band must narrow as the month progresses and vanish once
    // the last Sunday is in. Per-Sunday rates here are monthly averages (i.e. month-level
    // variation), so the remaining same-month Sundays move together → scale linearly with
    // the number of Sundays still to come, not the full month.
    const allRates=[...validHist.map(h=>h.income/h.sundays),...(currentRate!==null?[currentRate]:[])];
    let incomeSpread;
    if(allRates.length>=2){
      const meanR=allRates.reduce((s,r)=>s+r,0)/allRates.length;
      const perSundayStd=Math.sqrt(allRates.reduce((s,r)=>s+(r-meanR)**2,0)/allRates.length);
      incomeSpread=perSundayStd*remainingSundays;
    }else{
      incomeSpread=remainingSundays*blendedRate*0.15; // single data point: 15% band on the unbanked portion
    }
    // Floor the band at income already collected — the month-end total can never end up below it.
    forecastIncome={min:Math.max(realizedIncome,Math.round(proj-incomeSpread)),max:Math.round(proj+incomeSpread)};
    // Retained income forecast: blend historical retention rates with current month
    // Correctly accounts for variable income mix (Thanksgiving = 0% local, tithes = ~40% local, etc.)
    const validHistRates=histMonthRetention.filter(h=>h.retentionRate!==null);
    const currentRetRate=totalIncome>0?netLocal/totalIncome:null;
    if(currentRetRate!==null||validHistRates.length>0){
      let blendedRetRate;
      if(currentRetRate!==null&&validHistRates.length>0){
        const rwts=validHistRates.map((_,i)=>i+1);
        const rSum=rwts.reduce((s,w)=>s+w,0);
        const histRetRate=validHistRates.reduce((s,h,i)=>s+rwts[i]*h.retentionRate,0)/rSum;
        blendedRetRate=(currentRetRate*cw+histRetRate*hw)/(cw+hw);
      }else{
        blendedRetRate=currentRetRate??validHistRates[validHistRates.length-1].retentionRate;
      }
      forecastRetained={min:Math.max(0,Math.round(forecastIncome.min*blendedRetRate)),max:Math.max(0,Math.round(forecastIncome.max*blendedRetRate))};
    }
    // Expense forecast: anchored to what's already been spent this month. Expenses don't
    // track Sundays, so we expect the month to land near the historical average — but it can
    // never end up below what's already gone out, so both the point estimate and the band
    // floor at the current month's actual spend (otherwise a month that has already overspent
    // the average would show an already-breached band, which is useless for budgeting).
    const validExp=histMonths.filter(h=>h.expenses>0);
    if(validExp.length>0){
      const curExp=trendData[3].expenses;
      const ewts=validExp.map((_,i)=>i+1);
      const avgExp=validExp.reduce((s,h,i)=>s+ewts[i]*h.expenses,0)/ewts.reduce((s,w)=>s+w,0);
      const projExp=Math.max(curExp,avgExp);
      let expSpread;
      if(validExp.length>=2){
        const expMean=validExp.reduce((s,h)=>s+h.expenses,0)/validExp.length;
        expSpread=Math.sqrt(validExp.reduce((s,h)=>s+(h.expenses-expMean)**2,0)/validExp.length);
      }else{
        expSpread=avgExp*0.20; // 20% band — single data point
      }
      forecastExpenses={min:Math.max(curExp,Math.round(projExp-expSpread)),max:Math.round(projExp+expSpread)};
    }
  }
  // "Balance after expenses" = retained share minus expenses — what the parish actually keeps.
  // Falls back to income minus expenses when the retained forecast isn't available.
  const _forecastBase = forecastRetained || forecastIncome;
  const forecastBalance = _forecastBase && forecastExpenses
    ? {min:_forecastBase.min-forecastExpenses.max, max:_forecastBase.max-forecastExpenses.min}
    : null;
  // Pre-compute midpoints and spreads for the ± display format.
  const _incMid = forecastIncome ? Math.round((forecastIncome.min+forecastIncome.max)/2) : 0;
  const _incSpread = forecastIncome ? Math.round((forecastIncome.max-forecastIncome.min)/2) : 0;
  const _retMid = forecastRetained ? Math.round((forecastRetained.min+forecastRetained.max)/2) : 0;
  const _retSpread = forecastRetained ? Math.round((forecastRetained.max-forecastRetained.min)/2) : 0;
  const _balColor = forecastBalance && forecastBalance.min < 0 ? 'var(--danger)' : '#185FA5';

  // ── Weekly Net Retained Analysis ──────────────────────────────────────────────
  const _wkPeriodFrom = useRemPeriod ? dashPeriodFrom : dashMonthStart;
  // Use full period/month end for week boundaries (not today-capped) so future weeks appear
  const _wkPeriodTo = useRemPeriod ? dashPeriodTo : ymdLocal(new Date(state.year, state.month+1, 0));
  // Build Monday–Sunday week boundaries within the period
  const _wkStart = parseYmdDate(_wkPeriodFrom);
  const _wkEnd = parseYmdDate(_wkPeriodTo);
  const _wkBounds = [];
  if(_wkStart && _wkEnd){
    let cursor = new Date(_wkStart.getFullYear(), _wkStart.getMonth(), _wkStart.getDate());
    while(cursor <= _wkEnd){
      const wkFrom = new Date(cursor);
      const dow = cursor.getDay();
      const daysToSun = dow === 0 ? 0 : 7 - dow;
      const sun = new Date(cursor);
      sun.setDate(sun.getDate() + daysToSun);
      const wkTo = sun > _wkEnd ? new Date(_wkEnd) : sun;
      _wkBounds.push({ from: ymdLocal(wkFrom), to: ymdLocal(wkTo) });
      cursor = new Date(wkTo);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  // Prorate quotas correctly: use full (un-prorated) period quota divided by total Sundays.
  // dashAllQuotasAmt is already today-capped (prorated to elapsed Sundays), so we recover
  // the full period amount from each quota line's monthlyAmount instead.
  const _wkTotalPeriodSundays = countSundaysInRange(_wkPeriodFrom, _wkPeriodTo);
  const _wkFullPeriodQuota = dashQuotaLines.reduce((s,q) => s + (q.monthlyAmount || q.amount || 0), 0);
  const _wkPerSundayQuota = _wkTotalPeriodSundays > 0 ? _wkFullPeriodQuota / _wkTotalPeriodSundays : 0;
  // Compute per-week metrics
  const _wkData = await Promise.all(_wkBounds.map(async (wk, idx) => {
    const wkIncome = filterByDateRange(income, wk.from, wk.to);
    const wkExpenses = filterByDateRange(expenses, wk.from, wk.to);
    const wkTotalIncome = wkIncome.reduce((s,r)=>s+(r.totalCollection||0),0);
    const wkTotalExpenses = wkExpenses.reduce((s,r)=>s+(r.amount||0),0);
    let wkNetRetained = 0;
    if(wkTotalIncome > 0){
      const wkRem = await calcRemittancesFromRecords(wkIncome, remRatesDash);
      // Use ACCRUED Sundays, not calendar Sundays — a week's quota share should only be
      // charged once that Sunday's collection has actually happened, so an in-progress
      // week's future Sunday doesn't prematurely eat into unrelated non-remittance income.
      const wkSundays = countAccruedSundaysInRange(wk.from, wk.to);
      const wkQuotas = _wkPerSundayQuota * wkSundays;
      wkNetRetained = wkRem.netLocal - wkQuotas;
    }
    const wkOtherLocal = wkIncome
      .filter(r => r.source && r.source !== 'sunday_collection')
      .filter(r => INCOME_TYPES.reduce((s,t)=>s+(r[t.key]||0),0) === 0)
      .reduce((s,r) => s + (r.totalCollection||0), 0);
    wkNetRetained += wkOtherLocal;
    const wkSurplus = wkNetRetained - wkTotalExpenses;
    const isComplete = wk.to <= dashTodayStrForAsOf;
    return { idx, from: wk.from, to: wk.to, income: wkTotalIncome, expenses: wkTotalExpenses, netRetained: wkNetRetained, surplus: wkSurplus, isComplete };
  }));
  const _wkCompleted = _wkData.filter(w => w.isComplete && (w.income > 0 || w.expenses > 0));
  // ── 3-Month Lookback for Averages (trimmed weighted mean) ──
  // Build weekly metrics across the last ~90 days for a robust average
  const _wkLookbackStart = new Date((_wkStart||new Date()).getFullYear(), (_wkStart||new Date()).getMonth() - 3, (_wkStart||new Date()).getDate());
  const _wkLookbackFrom = ymdLocal(_wkLookbackStart);
  const _wkLookbackTo = dashTodayStrForAsOf;
  // Build week boundaries for the 3-month lookback
  const _wkHistBounds = [];
  const _wkHStart = parseYmdDate(_wkLookbackFrom);
  const _wkHEnd = parseYmdDate(_wkLookbackTo);
  if(_wkHStart && _wkHEnd){
    let hCursor = new Date(_wkHStart.getFullYear(), _wkHStart.getMonth(), _wkHStart.getDate());
    while(hCursor <= _wkHEnd){
      const hFrom = new Date(hCursor);
      const hDow = hCursor.getDay();
      const hDaysToSun = hDow === 0 ? 0 : 7 - hDow;
      const hSun = new Date(hCursor);
      hSun.setDate(hSun.getDate() + hDaysToSun);
      const hTo = hSun > _wkHEnd ? new Date(_wkHEnd) : hSun;
      _wkHistBounds.push({ from: ymdLocal(hFrom), to: ymdLocal(hTo) });
      hCursor = new Date(hTo);
      hCursor.setDate(hCursor.getDate() + 1);
    }
  }
  // Compute metrics for each historical week
  const _wkHistData = await Promise.all(_wkHistBounds.map(async (wk) => {
    const wkIncome = filterByDateRange(allIncomeDash, wk.from, wk.to);
    const wkExpenses = filterByDateRange(allExpensesDash, wk.from, wk.to);
    const wkTotalIncome = wkIncome.reduce((s,r)=>s+(r.totalCollection||0),0);
    const wkTotalExpenses = wkExpenses.reduce((s,r)=>s+(r.amount||0),0);
    let wkNetRetained = 0;
    if(wkTotalIncome > 0){
      const wkRem = await calcRemittancesFromRecords(wkIncome, remRatesDash);
      const wkSundays = countAccruedSundaysInRange(wk.from, wk.to);
      wkNetRetained = wkRem.netLocal - (_wkPerSundayQuota * wkSundays);
    }
    const wkOtherLocal = wkIncome
      .filter(r => r.source && r.source !== 'sunday_collection')
      .filter(r => INCOME_TYPES.reduce((s,t)=>s+(r[t.key]||0),0) === 0)
      .reduce((s,r) => s + (r.totalCollection||0), 0);
    wkNetRetained += wkOtherLocal;
    return { from: wk.from, to: wk.to, netRetained: wkNetRetained, expenses: wkTotalExpenses, surplus: wkNetRetained - wkTotalExpenses };
  }));
  // Keep only completed weeks with activity.
  const _wkHistActive = _wkHistData.filter(w => w.to <= _wkLookbackTo && (w.netRetained !== 0 || w.expenses > 0));
  // Robust trimmed mean via IQR (Tukey's fences), applied separately to income and to
  // expenses. A single "trim the highest & lowest surplus week" pass would conflate the
  // two — an unusually big one-off expense and an unusually big one-off income don't
  // necessarily land in the same week, and there can be more than one outlier on a given
  // side (e.g. two separate big-expense weeks). IQR trimming removes however many values
  // are genuinely outside the normal spread, independently for each metric.
  const trimmedMean = (values) => {
    if(values.length === 0) return 0;
    if(values.length < 5) return values.reduce((s,v)=>s+v,0) / values.length;
    const sorted = [...values].sort((a,b)=>a-b);
    const quantile = (p) => {
      const idx = (sorted.length - 1) * p;
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
    };
    const q1 = quantile(0.25), q3 = quantile(0.75);
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr, upperBound = q3 + 1.5 * iqr;
    const kept = sorted.filter(v => v >= lowerBound && v <= upperBound);
    const use = kept.length > 0 ? kept : sorted;
    return use.reduce((s,v)=>s+v,0) / use.length;
  };
  let _wkAvgNetRetained = 0, _wkAvgExpenses = 0, _wkAvgSurplus = 0;
  if(_wkHistActive.length > 0){
    _wkAvgNetRetained = Math.round(trimmedMean(_wkHistActive.map(w => w.netRetained)));
    _wkAvgExpenses = Math.round(trimmedMean(_wkHistActive.map(w => w.expenses)));
    _wkAvgSurplus = _wkAvgNetRetained - _wkAvgExpenses;
  } else if(_wkCompleted.length > 0){
    _wkAvgNetRetained = Math.round(trimmedMean(_wkCompleted.map(w => w.netRetained)));
    _wkAvgExpenses = Math.round(trimmedMean(_wkCompleted.map(w => w.expenses)));
    _wkAvgSurplus = _wkAvgNetRetained - _wkAvgExpenses;
  }
  // Projection: available fund at end of period = current available + avg surplus × remaining weeks.
  // Use dashSpendable (Total Church Balance − Outstanding RCCG Remittance) as the baseline —
  // it's the actual current cash position shown elsewhere on the dashboard. Using netLocal −
  // totalExpenses here would measure only this period's income flow, not the real balance
  // (which includes the carried-forward balance sitting in the bank).
  const _wkRemaining = _wkData.filter(w => !w.isComplete).length;
  const _wkCurrentAvailable = dashSpendable;
  const _wkProjectedEnd = Math.round(_wkCurrentAvailable + (_wkAvgSurplus * _wkRemaining));
  const _wkTarget = _pettyTarget;
  const _wkProjColor = _wkProjectedEnd >= _wkTarget ? 'var(--success, #0F6E56)' : '#BA7517';
  const _wkMaxBar = Math.max(..._wkData.map(w => Math.max(Math.abs(w.netRetained), Math.abs(w.expenses))), 1);
  const _wkHistWeeksUsed = _wkHistActive.length;

  // Each period button shows its own anchor month. When the user hasn't picked a
  // month explicitly, the Remittance button shows the upcoming-anchor month
  // (June after May 24 cut-off) and the Calendar button shows today's calendar
  // month — so users see what they'll get if they click. After an explicit pick,
  // both buttons follow state.month.
  const _todayDash = new Date();
  const remBtnY = state.userPickedMonth ? state.year : (state.upcomingPeriodAnchor?.year ?? state.year);
  const remBtnM = state.userPickedMonth ? state.month : (state.upcomingPeriodAnchor?.month ?? state.month);
  const calBtnY = state.userPickedMonth ? state.year : _todayDash.getFullYear();
  const calBtnM = state.userPickedMonth ? state.month : _todayDash.getMonth();
  const remBtnRange = computeRemPeriodDates(settings, allRemsDash, remBtnY, remBtnM);
  const calBtnLastDay = new Date(calBtnY, calBtnM + 1, 0).getDate();

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div>
        <div class="page-title">Welcome, ${(state.user?.name?.split(/\s+/).slice(0,2).join(' '))||'User'} 👋</div>
        <div class="page-sub">${monthLabel()} Financial Overview</div>
      </div>
    </div>

    <!-- Period selector — full-width block so the two cards span the device edge-to-edge -->
    <section style="margin:0 0 18px">
      <div style="font-size:10.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:8px;text-align:center">Select Period Type</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button onclick="App.setPeriodMode('remittance')" style="min-width:0;padding:12px 14px;border-radius:12px;border:1.5px solid ${useRemPeriod?'var(--primary)':'var(--border)'};background:${useRemPeriod?'rgba(15,110,86,0.10)':'var(--bg)'};cursor:pointer;text-align:left;outline:none;transition:background 0.15s,border-color 0.15s;box-shadow:${useRemPeriod?'inset 4px 0 0 var(--primary)':'none'}">
          <div style="font-size:13px;font-weight:700;color:${useRemPeriod?'var(--primary)':'var(--text2)'};line-height:1.25">${MONTHS[remBtnM]} Remittance Period</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">the custom RCCG period</div>
          <div style="margin-top:8px"><span style="display:inline-block;padding:4px 10px;border-radius:12px;background:${useRemPeriod?'var(--primary)':'rgba(0,0,0,0.05)'};color:${useRemPeriod?'#fff':'var(--text2)'};font-size:11px;font-weight:700;letter-spacing:0.2px">${fmtDateShort(remBtnRange.from)} – ${fmtDateShort(remBtnRange.to)}</span></div>
        </button>
        <button onclick="App.setPeriodMode('calendar')" style="min-width:0;padding:12px 14px;border-radius:12px;border:1.5px solid ${!useRemPeriod?'var(--primary)':'var(--border)'};background:${!useRemPeriod?'rgba(15,110,86,0.10)':'var(--bg)'};cursor:pointer;text-align:left;outline:none;transition:background 0.15s,border-color 0.15s;box-shadow:${!useRemPeriod?'inset 4px 0 0 var(--primary)':'none'}">
          <div style="font-size:13px;font-weight:700;color:${!useRemPeriod?'var(--primary)':'var(--text2)'};line-height:1.25">${MONTHS[calBtnM]} Calendar Period</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">the normal month period</div>
          <div style="margin-top:8px"><span style="display:inline-block;padding:4px 10px;border-radius:12px;background:${!useRemPeriod?'var(--primary)':'rgba(0,0,0,0.05)'};color:${!useRemPeriod?'#fff':'var(--text2)'};font-size:11px;font-weight:700;letter-spacing:0.2px">1 ${MONTHS[calBtnM].slice(0,3)} – ${calBtnLastDay} ${MONTHS[calBtnM].slice(0,3)}</span></div>
        </button>
      </div>
    </section>

    ${alerts}

    <div class="dash-flow" style="display:flex;flex-direction:column;margin-bottom:16px">

      <!-- 1. Opening Balance — compact ledger anchor, not the headline figure -->
      <div style="background:rgba(99,102,241,0.05);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:10px 16px 10px 20px;position:relative;overflow:hidden">
        <div style="position:absolute;left:0;top:0;bottom:0;width:3px;background:#6366F1;border-radius:3px 0 0 3px"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div style="min-width:0;flex:1">
            <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#6366F1;margin-bottom:1px">${dashCarriedFwdLabel}</div>
            <div style="font-size:11px;color:var(--text3)">Total church balance carried from the previous period</div>
          </div>
          <div style="font-size:18px;font-weight:800;color:${dashCarriedForward<0?'var(--danger)':'#4F46E5'};letter-spacing:-0.5px;white-space:nowrap;flex-shrink:0">${fmt(dashCarriedForward)}</div>
        </div>
      </div>

      <!-- + connector -->
      <div style="display:flex;justify-content:center;align-items:center;height:30px;position:relative">
        <div style="position:absolute;left:50%;top:0;bottom:0;width:1.5px;background:var(--border);transform:translateX(-50%)"></div>
        <div style="width:32px;height:32px;border-radius:50%;background:var(--surface);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--success);z-index:1;flex-shrink:0;position:relative">+</div>
      </div>

      <!-- 2. Total Income -->
      <div class="flow-card" style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px 20px;position:relative;overflow:hidden">
        <div style="position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--success)"></div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px">
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text3);margin-bottom:6px">Total Income (This Period)</div>
            <div style="font-size:22px;font-weight:800;color:var(--success);letter-spacing:-0.5px;line-height:1.15">${fmt(totalIncome)}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:5px">Collections and other income</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px">↑ ${income.length} record(s) received</div>
          </div>
          <div style="width:44px;height:44px;border-radius:12px;background:#E1F5EE;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📥</div>
        </div>
        ${totalIncome > 0 ? `<div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:rgba(29,158,117,0.06);border:1px dashed rgba(29,158,117,0.3)">
          <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:7px">How this income splits</div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;margin-bottom:5px">
            <span style="color:var(--text2)">📤 RCCG Authority share</span>
            <span style="font-weight:600;color:var(--text3)">${fmt(rccgAuthorityShare)} <span style="font-size:11px;font-weight:600;color:var(--text3)">(${Math.round(rccgAuthorityShare/totalIncome*100)}%)</span></span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;margin-bottom:${otherUnremittedIncome>0?'5px':'0'}">
            <span style="color:var(--text2)">🏛 Parish retains</span>
            <span style="font-weight:700;color:#1D9E75">${fmt(parishRetains)} <span style="font-size:11px;font-weight:600;color:var(--text3)">(${Math.round(parishRetains/totalIncome*100)}%)</span></span>
          </div>
          ${otherUnremittedIncome>0?`<div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px">
            <span style="color:var(--text2)">🤝 Other unremitted income</span>
            <span style="font-weight:700;color:#1D9E75">${fmt(otherUnremittedIncome)} <span style="font-size:11px;font-weight:600;color:var(--text3)">(${Math.round(otherUnremittedIncome/totalIncome*100)}%)</span></span>
          </div>`:''}
        </div>` : ''}
        ${dashChildrenTeacherTotal > 0 ? `<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(186,117,23,0.08);border:1px solid rgba(186,117,23,0.22);font-size:11.5px;line-height:1.5;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="color:#BA7517;font-weight:600;flex:1;min-width:0">🧒 ${fmt(dashChildrenTeacherTotal)} with Children Teacher</span>
          <button class="btn btn-sm" onclick="App.showChildrenTeacherModal()" style="font-size:11px;padding:3px 10px">View →</button>
        </div>` : ''}
      </div>

      <!-- − connector -->
      <div style="display:flex;justify-content:center;align-items:center;height:30px;position:relative">
        <div style="position:absolute;left:50%;top:0;bottom:0;width:1.5px;background:var(--border);transform:translateX(-50%)"></div>
        <div style="width:32px;height:32px;border-radius:50%;background:var(--surface);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--danger);z-index:1;flex-shrink:0;position:relative">−</div>
      </div>

      <!-- 3. Total Expenses -->
      <div class="flow-card" style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px 20px;position:relative;overflow:hidden">
        <div style="position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--danger)"></div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px">
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text3);margin-bottom:6px">Total Expenses (This Period)</div>
            <div style="font-size:22px;font-weight:800;color:var(--danger);letter-spacing:-0.5px;line-height:1.15">${fmt(totalPeriodAllExpenses)}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:5px">${expenses.filter(e=>isLoggedExpense(e)&&!e.pettyRef).length} expense(s) logged this period</div>
            ${totalPeriodPettyAdvanceSpend>0?`<div style="margin-top:8px;padding:7px 10px;border-radius:8px;background:rgba(186,117,23,0.08);border:1px dashed rgba(186,117,23,0.3);font-size:11.5px;line-height:1.5;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span style="color:#BA7517">💳 Includes ${fmt(totalPeriodPettyAdvanceSpend)} via petty cash${pendingPettyAdvanceCount>0?` <span style="color:var(--text3)">(${pendingPettyAdvanceCount} awaiting receipt)</span>`:''}</span>
            </div>`:''}
          </div>
          <div style="width:44px;height:44px;border-radius:12px;background:#FCEBEB;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">💸</div>
        </div>
      </div>

      <!-- = connector to Total Church Balance -->
      <div style="display:flex;justify-content:center;align-items:center;height:36px;position:relative">
        <div style="position:absolute;left:50%;top:0;bottom:0;width:1.5px;background:var(--border);transform:translateX(-50%)"></div>
        <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:14px;padding:4px 12px;font-size:11px;font-weight:700;color:#185FA5;letter-spacing:0.8px;text-transform:uppercase;z-index:1;position:relative;display:flex;align-items:center;gap:6px">
          <span style="font-size:14px">=</span><span>Total Church Balance</span>
        </div>
      </div>

      <!-- 4. Total Church Balance -->
      <div class="flow-card" style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px 20px;position:relative;overflow:hidden">
        <div style="position:absolute;left:0;top:0;bottom:0;width:5px;background:#185FA5"></div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px">
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text3);margin-bottom:6px">Total Church Balance${dashIsPastPeriod?` <span style="text-transform:none;letter-spacing:0;font-weight:600">(As of ${dashAsOfLabel})</span>`:''}</div>
            <div style="font-size:24px;font-weight:800;color:${churchBal.total<0?'var(--danger)':'#185FA5'};letter-spacing:-0.5px;line-height:1.15">${fmt(churchBal.total)}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:5px">${dashIsPastPeriod?`Snapshot at end of period`:`Actual money on hand right now`}</div>
          </div>
          <div style="width:44px;height:44px;border-radius:12px;background:#EAF3DE;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🏛️</div>
        </div>
        <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--border);font-size:12.5px;color:var(--text2);line-height:1.9">
          <a onclick="App.navigate('bank')" style="cursor:pointer;text-decoration:none;color:inherit;display:flex;align-items:center;justify-content:space-between">
            <span><span style="display:inline-block;width:8px;height:8px;background:#185FA5;border-radius:50%;margin-right:8px"></span><span style="text-decoration:underline dotted #185FA5;text-underline-offset:3px">Bank</span></span>
            <span style="font-weight:600">${fmt(churchBal.bankBalance)}</span>
          </a>
          <a onclick="App.setIncomeTab('all');App.navigate('income')" style="cursor:pointer;text-decoration:none;color:inherit;display:flex;align-items:center;justify-content:space-between">
            <span><span style="display:inline-block;width:8px;height:8px;background:${churchBal.cashDeficit>0?'var(--danger)':'#BA7517'};border-radius:50%;margin-right:8px"></span>${churchBal.cashDeficit>0?`<span style="color:var(--danger);font-weight:600;text-decoration:underline dotted var(--danger);text-underline-offset:3px">Cash with Accountant ⚠ Owes</span>`:`<span style="text-decoration:underline dotted #BA7517;text-underline-offset:3px">Cash with Accountant</span>`}</span>
            <span style="font-weight:600;color:${churchBal.cashDeficit>0?'var(--danger)':'inherit'}">${churchBal.cashDeficit>0?'−'+fmt(churchBal.cashDeficit):fmt(churchBal.cashWithAccountant)}</span>
          </a>
          <a onclick="App.navigate('petty_cash')" style="cursor:pointer;text-decoration:none;color:inherit;display:flex;align-items:center;justify-content:space-between">
            <span><span style="display:inline-block;width:8px;height:8px;background:${churchBal.pettyFloat<0?'var(--danger)':'#1D9E75'};border-radius:50%;margin-right:8px"></span>${churchBal.pettyFloat<0?`<span style="color:var(--danger);font-weight:600;text-decoration:underline dotted var(--danger);text-underline-offset:3px">Petty Cash ⚠ Owes Admin Officer</span>`:`<span style="text-decoration:underline dotted #1D9E75;text-underline-offset:3px">Petty Cash</span>`}</span>
            <span style="font-weight:600;color:${churchBal.pettyFloat<0?'var(--danger)':'inherit'}">${fmt(churchBal.pettyFloat)}</span>
          </a>
          ${Math.abs(churchBal.heldForSatellites||0)>=0.5?`
          <a onclick="App.navigate('remittances')" style="cursor:pointer;text-decoration:none;color:inherit;display:flex;align-items:center;justify-content:space-between;border-top:1px dashed var(--border);margin-top:6px;padding-top:6px">
            <span><span style="display:inline-block;width:8px;height:8px;background:#8B4513;border-radius:50%;margin-right:8px"></span><span style="text-decoration:underline dotted #8B4513;text-underline-offset:3px">${dashSatHeldDisp.label}</span></span>
            <span style="font-weight:600;color:#8B4513">${churchBal.heldForSatellites>0?'−':'+'}${dashSatHeldDisp.amount}</span>
          </a>
          <div style="font-size:10.5px;color:var(--text3);margin-top:2px">${dashSatHeldDisp.label}: ${dashSatHeldDisp.amount} (${dashSatHeldDisp.suffix}${churchBal.heldForSatellites>0?' — already inside Bank or Cash with Accountant above':''})</div>`:''}
        </div>
      </div>

      <!-- − connector -->
      <div style="display:flex;justify-content:center;align-items:center;height:30px;position:relative">
        <div style="position:absolute;left:50%;top:0;bottom:0;width:1.5px;background:var(--border);transform:translateX(-50%)"></div>
        <div style="width:32px;height:32px;border-radius:50%;background:var(--surface);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--danger);z-index:1;flex-shrink:0;position:relative">−</div>
      </div>

      <!-- 5. RCCG Remittances Due -->
      <div class="flow-card" style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px 20px;position:relative;overflow:hidden">
        <div style="position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--amber)"></div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px">
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text3);margin-bottom:6px">RCCG Remittance Due</div>
            <div style="font-size:26px;font-weight:800;color:var(--danger);letter-spacing:-0.5px;line-height:1.15">${fmt(dashOutstandingRems)}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:5px">📅 ${dashDueLabel}</div>
            ${totalIncome>0?`<div style="margin-top:4px;font-size:11.5px;color:var(--amber)">${Math.round(dashOutstandingRems/totalIncome*100)}% of period income</div>`:''}
            ${dashMonthPaidAmt>0 && dashOutstandingRems>0 ? `<div style="margin-top:4px;font-size:11px;color:var(--text3)">After ${fmt(dashMonthPaidAmt)} already paid this period</div>` : ''}
          </div>
          <div style="width:44px;height:44px;border-radius:12px;background:#FCEBEB;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📤</div>
        </div>
        ${dashPriorUnpaid>0?`
        <div style="margin-top:10px;padding-top:10px;border-top:1px dashed rgba(184,134,11,0.25);display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div>
            <div style="font-size:10.5px;color:var(--text3)">Includes unpaid from previous period(s)</div>
            ${dashShortfallPeriods.length?`<button onclick="App.openReconcileModal()" style="margin-top:4px;background:transparent;border:none;color:var(--primary);font-size:11px;font-weight:600;text-decoration:underline;cursor:pointer;padding:0">Reconcile →</button>`:''}
          </div>
          <div style="font-size:14px;font-weight:700;color:var(--danger);white-space:nowrap;flex-shrink:0">${fmt(dashPriorUnpaid)}</div>
        </div>`:''}
      </div>

      <!-- = connector to Final -->
      <div style="display:flex;justify-content:center;align-items:center;height:36px;position:relative">
        <div style="position:absolute;left:50%;top:0;bottom:0;width:1.5px;background:var(--border);transform:translateX(-50%)"></div>
        <div style="background:var(--surface);border:1.5px solid ${dashSpendColor};border-radius:14px;padding:4px 12px;font-size:11px;font-weight:700;color:${dashSpendColor};letter-spacing:0.8px;text-transform:uppercase;z-index:1;position:relative;display:flex;align-items:center;gap:6px">
          <span style="font-size:14px">=</span><span>Actual Balance</span>
        </div>
      </div>

      <!-- 6. Available Fund After All Deductions (final answer) -->
      <div class="flow-card" style="background:${dashSpendColor}08;border:1.5px solid ${dashSpendColor}55;border-radius:14px;padding:18px 20px;position:relative;overflow:hidden">
        <div style="position:absolute;left:0;top:0;bottom:0;width:5px;background:${dashSpendColor}"></div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px">
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text3);margin-bottom:6px">Available Fund After All Deductions${dashIsPastPeriod?` <span style="text-transform:none;letter-spacing:0;font-weight:600">(As of ${dashAsOfLabel})</span>`:''}</div>
            <div style="font-size:26px;font-weight:800;color:${dashSpendColor};letter-spacing:-0.8px;line-height:1.1">${fmt(dashSpendable)}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:8px;flex-shrink:0">
            <div style="width:44px;height:44px;border-radius:12px;background:${dashSpendColor}22;display:flex;align-items:center;justify-content:center;font-size:22px">${_pettyIcon}</div>
            <span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;background:${dashSpendColor}22;font-size:11.5px;font-weight:700;color:${dashSpendColor};white-space:nowrap">${dashSpendLabel}</span>
          </div>
        </div>
        <div style="margin-top:14px;padding-top:12px;border-top:1px dashed ${dashSpendColor}33">
          <!-- Petty Cash Sustainability -->
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:4px">
            <span style="color:var(--text3)">Petty cash (committed)</span>
            <span style="font-weight:600;color:var(--text)">${fmt(_pettyCurrentFloat)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:6px">
            <span style="color:var(--text3)">Petty top-up for next period</span>
            <span style="font-weight:600;color:var(--text)">${fmt(_pettyTopUpNeeded)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <span style="font-size:12px;color:var(--text3)">After all obligations</span>
            <span style="font-size:18px;font-weight:800;color:${dashSpendColor};letter-spacing:-0.5px">${fmt(_pettyAfterObligs)}</span>
          </div>
          <div style="font-size:11.5px;color:var(--text2);line-height:1.5;padding:8px 10px;background:${dashSpendColor}0D;border-radius:8px;border-left:3px solid ${dashSpendColor}">${_pettyMsg}</div>
        </div>
      </div>

    </div>

    <!-- Collapsible full calculation breakdown — two slides, swipe left/right -->
    <details style="margin-bottom:16px">
      <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);font-size:12.5px;font-weight:600;color:var(--text2);user-select:none">
        <span style="font-size:16px">🧮</span>
        <span>How is Actual Balance calculated?</span>
        <span style="margin-left:auto;font-size:11px;color:var(--text3)">Tap to expand ▾</span>
      </summary>
      <div style="background:var(--surface);border:1px solid var(--border);border-top:none;border-radius:0 0 var(--rl) var(--rl);overflow:hidden">
        <div class="dash-explain-slider" style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;-webkit-overflow-scrolling:touch">
          <!-- Slide 1: Opening-balance path to total church balance -->
          <div style="flex:0 0 100%;scroll-snap-align:start;padding:16px 18px;box-sizing:border-box">
            <div style="font-size:10.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:8px">How Actual Balance is Calculated</div>
            <div style="font-size:12px;line-height:2.3;color:var(--text2)">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="color:var(--text3)">Opening balance</span>
                <span style="font-weight:600;font-family:ui-monospace,monospace">${fmt(dashCarriedForward)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="color:var(--text3)">+ Total income recorded this period</span>
                <span style="font-weight:600;font-family:ui-monospace,monospace;color:var(--success)">+${fmt(totalIncome)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="color:#BA7517">− Children Teacher hold (not managed by Admin team)</span>
                <span style="font-weight:600;font-family:ui-monospace,monospace;color:#BA7517">−${fmt(dashChildrenTeacherTotal)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="color:var(--text3)">− Total expenses this period</span>
                <span style="font-weight:600;font-family:ui-monospace,monospace;color:var(--danger)">−${fmt(totalPeriodAllExpenses)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="color:var(--text3)">− Remittances paid this period</span>
                <span style="font-weight:600;font-family:ui-monospace,monospace;color:var(--danger)">−${fmt(dashPeriodRemittancesPaid)}</span>
              </div>
              ${dashPeriodSatTransferOut>0?`
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="color:var(--text3)">+ Transferred from satellite pool to parish</span>
                <span style="font-weight:600;font-family:ui-monospace,monospace;color:var(--success)">+${fmt(dashPeriodSatTransferOut)}</span>
              </div>`:''}
              <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px dashed var(--border);padding-bottom:6px">
                <span>= Total Church Balance</span>
                <span style="font-weight:700;font-family:ui-monospace,monospace;color:#185FA5">${fmt(dashChurchBalanceFromOpening)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px dashed var(--border);padding-bottom:6px">
                <span style="color:var(--text3)">− RCCG outstanding remittances</span>
                <span style="font-weight:600;font-family:ui-monospace,monospace;color:var(--danger)">−${fmt(dashOutstandingRems)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:14px;padding-top:2px">
                <span>= Actual Balance</span>
                <span style="font-family:ui-monospace,monospace;color:${dashSpendColor}">${fmt(dashSpendable)}</span>
              </div>
            </div>
            <div style="margin-top:10px;font-size:11px;color:var(--text3);line-height:1.5;padding-top:8px;border-top:1px dashed var(--border)">
              This path starts from the opening balance, removes the Children Teacher share because it is not managed by the Admin team, and shows how the church arrived at the current physical church balance before deducting the HQ amount that is still owed.
            </div>
          </div>
          <!-- Slide 2: Alternative path using opening obligations and current-period due -->
          <div style="flex:0 0 100%;scroll-snap-align:start;padding:16px 18px;box-sizing:border-box">
            <div style="font-size:10.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:8px">Second Check — Opening Balance to Available Funds</div>
            <div style="font-size:12px;line-height:2.3;color:var(--text2)">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="color:var(--text3)">Opening balance</span>
                <span style="font-weight:600;font-family:ui-monospace,monospace">${fmt(dashCarriedForward)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="color:var(--text3)">− Opening remittance carryover</span>
                <span style="font-weight:600;font-family:ui-monospace,monospace;color:var(--danger)">−${fmt(dashOpeningOutstandingRems)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px dashed var(--border);padding-bottom:6px">
                <span>= Opening available balance</span>
                <span style="font-weight:700;font-family:ui-monospace,monospace;color:#4F46E5">${fmt(dashCarriedForward - dashOpeningOutstandingRems)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="color:var(--text3)">+ Admin-managed income this period</span>
                <span style="font-weight:600;font-family:ui-monospace,monospace;color:var(--success)">+${fmt(dashAdminManagedIncome)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="color:var(--text3)">− Total expenses this period</span>
                <span style="font-weight:600;font-family:ui-monospace,monospace;color:var(--danger)">−${fmt(totalPeriodAllExpenses)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;${dashPeriodSatTransferOut>0?'':'border-bottom:1.5px dashed var(--border);padding-bottom:6px'}">
                <span style="color:var(--text3)">− RCCG remittance due for this period</span>
                <span style="font-weight:600;font-family:ui-monospace,monospace;color:var(--danger)">−${fmt(dashCurrentMonthRemDue)}</span>
              </div>
              ${dashPeriodSatTransferOut>0?`
              <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px dashed var(--border);padding-bottom:6px">
                <span style="color:var(--text3)">+ Transferred from satellite pool to parish</span>
                <span style="font-weight:600;font-family:ui-monospace,monospace;color:var(--success)">+${fmt(dashPeriodSatTransferOut)}</span>
              </div>`:''}
              <div style="display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:14px;padding-top:2px">
                <span>= Actual Balance</span>
                <span style="font-family:ui-monospace,monospace;color:${dashSpendColor}">${fmt(dashAvailableFromOpening)}</span>
              </div>
            </div>
            <div style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--border);font-size:11px;color:var(--text3);line-height:1.7">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span>Current remittance flow cross-check</span>
                <span style="font-family:ui-monospace,monospace">${fmt(dashOutstandingRemsFromFlow)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="color:var(--text3)">Opening carryover + current due</span>
                <span style="font-family:ui-monospace,monospace">${fmt(dashOpeningOutstandingRems + dashCurrentMonthRemDue)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="color:var(--text3)">− Remittances paid this period</span>
                <span style="font-weight:600;font-family:ui-monospace,monospace;color:var(--danger)">−${fmt(dashPeriodRemittancesPaid)}</span>
              </div>
            </div>
          </div>
        </div>
        <div style="padding:10px 18px 14px;font-size:11px;color:var(--text3);line-height:1.6;border-top:1px solid var(--border);display:flex;align-items:center;gap:8px;justify-content:center">
          <span style="font-size:13px">◀</span>
          <span>Slide left or right — physical-balance path ◀▶ opening-liability path.</span>
          <span style="font-size:13px">▶</span>
        </div>
      </div>
    </details>

    ${(canAction('income_record')||canAction('expense_log')||canAction('petty_request')||canAccessPage('reports')||canAccessPage('remittances'))?`
    <div class="card">
      <div class="card-header"><span class="card-title">Quick Actions</span></div>
      <div class="qa-grid">
        ${canAction('income_record')?`<button class="qa-btn" onclick="App.navigate('income')"><div class="qa-icon" style="background:#E1F5EE">📥</div><div class="qa-label">Record Collections</div><div class="qa-sub">Log Sunday income</div></button>`:''}
        ${canAccessPage('remittances')?`<button class="qa-btn" onclick="App.navigate('remittances')"><div class="qa-icon" style="background:#FCEBEB">📤</div><div class="qa-label">Remittances</div><div class="qa-sub">Calculate & pay HQ</div></button>`:''}
        ${canAction('expense_log')?`<button class="qa-btn" onclick="App.navigate('expenses')"><div class="qa-icon" style="background:#FAEEDA">💸</div><div class="qa-label">Log Expense</div><div class="qa-sub">Record spending</div></button>`:''}
        ${canAccessPage('petty_cash')?`<button class="qa-btn" onclick="App.navigate('petty_cash')"><div class="qa-icon" style="background:#EAF3DE">💳</div><div class="qa-label">Petty Cash</div><div class="qa-sub">${pendingPetty>0?pendingPetty+' pending':'Request / Approve'}</div></button>`:''}
        ${canAction('bank_withdrawal')?`<button class="qa-btn" onclick="App.showBankWithdrawal()"><div class="qa-icon" style="background:#E6F1FB">🏦</div><div class="qa-label">Bank Withdrawal</div><div class="qa-sub">Record a bank debit</div></button>`:''}
        ${canAccessPage('reports')?`<button class="qa-btn" onclick="App.navigate('reports')"><div class="qa-icon" style="background:#EEEDFE">📊</div><div class="qa-label">Reports</div><div class="qa-sub">Generate statements</div></button>`:''}
        <button class="qa-btn" onclick="App.showKPSCAlert()"><div class="qa-icon" style="background:#FAEEDA">🔔</div><div class="qa-label">Alert KPSC</div><div class="qa-sub">Emergency support</div></button>
      </div>
    </div>`:''}

    <div class="grid-6040">
      <div style="min-width:0">
        <div class="card">
          <div class="card-header"><span class="card-title">RECENT TRANSACTIONS</span><button class="btn btn-sm" onclick="App.navigate('transactions')">See all ↗</button></div>
          ${feedItems.length?feedItems.map(f=>{
            const amtColor = f.type==='income'?'var(--success)':'var(--danger)';
            const prefix = f.type==='income'?'+':'−';
            return `<div class="feed-item" style="padding:12px 0">
              <div class="feed-dot" style="background:${f.bg};color:${f.color};font-size:16px">${f.icon}</div>
              <div class="feed-body"><div class="feed-title" style="font-size:14px;font-weight:600">${f.title}</div><div class="feed-sub" style="font-size:12px;margin-top:2px">${f.sub}</div></div>
              <div class="feed-right" style="color:${amtColor};font-size:14px;font-weight:600">${prefix}${fmt(f.amt)}</div>
            </div>`}).join(''):'<div class="empty-table">No transactions yet.</div>'}
        </div>

        ${_wkData.length > 0 ? `<div class="card">
          <div class="card-header"><span class="card-title">Weekly Net Retained</span><span style="font-size:11px;color:var(--text3)">${fmtDateShort(_wkPeriodFrom)} – ${fmtDateShort(_wkPeriodTo)}</span></div>
          <!-- Stat tiles — averages based on 3-month lookback -->
          <div style="font-size:10px;color:var(--text3);text-align:center;margin-bottom:6px">Weekly avg based on ${_wkHistWeeksUsed} week${_wkHistWeeksUsed!==1?'s':''} (last 3 months, outliers trimmed)</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
            <div style="text-align:center;padding:10px 6px;background:var(--green-light,#E1F5EE);border-radius:10px">
              <div style="font-size:16px;font-weight:800;color:var(--primary,#0F6E56)">${fmtShort(_wkAvgNetRetained)}</div>
              <div style="font-size:9.5px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.3px;margin-top:3px">Avg Net Retained</div>
            </div>
            <div style="text-align:center;padding:10px 6px;background:#FCEBEB;border-radius:10px">
              <div style="font-size:16px;font-weight:800;color:var(--danger,#c0392b)">${fmtShort(_wkAvgExpenses)}</div>
              <div style="font-size:9.5px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.3px;margin-top:3px">Avg Expenses</div>
            </div>
            <div style="text-align:center;padding:10px 6px;background:#E6F1FB;border-radius:10px">
              <div style="font-size:16px;font-weight:800;color:#185FA5">${fmtShort(_wkAvgSurplus)}</div>
              <div style="font-size:9.5px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.3px;margin-top:3px">Avg Surplus</div>
            </div>
          </div>
          <!-- Weekly bar chart -->
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;font-size:10px;color:var(--text3)">
            <span><span style="display:inline-block;width:8px;height:8px;background:var(--primary);border-radius:2px;margin-right:3px"></span>Net Retained</span>
            <span><span style="display:inline-block;width:8px;height:8px;background:var(--danger);border-radius:2px;margin-right:3px"></span>Expenses</span>
            <span><span style="display:inline-block;width:8px;height:8px;background:#185FA5;border-radius:2px;margin-right:3px"></span>Surplus</span>
          </div>
          <div style="display:flex;align-items:flex-end;gap:6px;height:110px;padding:4px 0">
            ${_wkData.map(w=>{
              const nrH = w.netRetained > 0 ? Math.max(3, Math.round((w.netRetained/_wkMaxBar)*70)) : 3;
              const exH = Math.max(3, Math.round((w.expenses/_wkMaxBar)*70));
              const surpH = w.surplus>0 ? Math.max(2, Math.round((w.surplus/_wkMaxBar)*70)) : 0;
              const opacity = w.isComplete ? '1' : '0.45';
              const nrLabel = w.netRetained > 0 ? fmtShort(w.netRetained).replace('₦','') : (w.netRetained < 0 ? '<span style="color:var(--danger)">−'+fmtShort(Math.abs(w.netRetained)).replace('₦','')+'</span>' : '');
              const surpLabel = w.surplus > 0 ? fmtShort(w.surplus).replace('₦','') : (w.surplus < 0 ? '<span style="color:var(--danger)">−'+fmtShort(Math.abs(w.surplus)).replace('₦','')+'</span>' : '');
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;opacity:${opacity}">
                <div style="display:flex;gap:2px;align-items:flex-end;width:100%;justify-content:center;height:86px">
                  <div style="width:28%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
                    <div style="font-size:8px;color:var(--text3);white-space:nowrap;margin-bottom:1px">${nrLabel}</div>
                    <div style="width:100%;background:${w.netRetained<0?'var(--danger)':'var(--primary)'};border-radius:3px 3px 0 0;height:${nrH}px"></div>
                  </div>
                  <div style="width:28%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
                    <div style="font-size:8px;color:var(--text3);white-space:nowrap;margin-bottom:1px">${w.expenses?fmtShort(w.expenses).replace('₦',''):''}</div>
                    <div style="width:100%;background:var(--danger);border-radius:3px 3px 0 0;height:${exH}px"></div>
                  </div>
                  <div style="width:28%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
                    <div style="font-size:8px;color:#185FA5;white-space:nowrap;margin-bottom:1px">${surpLabel}</div>
                    <div style="width:100%;background:#185FA5;border-radius:3px 3px 0 0;height:${surpH}px"></div>
                  </div>
                </div>
                <div style="font-size:10px;color:var(--text2);white-space:nowrap">Wk${w.idx+1}${!w.isComplete?' ⏳':''}</div>
              </div>`;}).join('')}
          </div>
          <!-- End-of-period projection -->
          ${_wkRemaining > 0 && _wkCompleted.length > 0 ? `
          <div style="margin-top:12px;padding:12px 14px;background:${_wkProjColor}11;border:1px solid ${_wkProjColor}44;border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:10px">
            <div style="font-size:11px;color:var(--text2);line-height:1.4"><span style="font-weight:700">Projected Available Fund</span><br><span style="font-size:10px;color:var(--text3)">End of period (${_wkRemaining} wk${_wkRemaining>1?'s':''} left) · Target: ${fmtShort(_wkTarget)}</span></div>
            <div style="font-size:20px;font-weight:800;color:${_wkProjColor};letter-spacing:-0.5px;white-space:nowrap">${fmt(_wkProjectedEnd)}</div>
          </div>` : ''}
          ${_wkRemaining === 0 && _wkCompleted.length > 0 ? `
          <div style="margin-top:12px;padding:10px 14px;background:var(--green-light,#E1F5EE);border-radius:10px;text-align:center">
            <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Period Total Surplus</div>
            <div style="font-size:20px;font-weight:800;color:var(--primary)">${fmt(_wkData.reduce((s,w)=>s+w.surplus,0))}</div>
          </div>` : ''}
        </div>` : ''}

        <div class="card">
          <div class="card-header"><span class="card-title">Monthly Trend (Income vs Expenses)</span></div>
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:8px;font-size:11px;color:var(--text3)">
            <span><span style="display:inline-block;width:10px;height:10px;background:var(--primary);border-radius:2px;margin-right:4px"></span>Income</span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#BA7517;border-radius:2px;margin-right:4px"></span>Retained</span>
            <span><span style="display:inline-block;width:10px;height:10px;background:var(--danger);border-radius:2px;margin-right:4px"></span>Expenses</span>
          </div>
          <div style="display:flex;align-items:flex-end;gap:12px;height:130px;padding:8px 0">
            ${trendData.map(t=>{
              const barH=Math.max(4,Math.round((t.income/maxTrend)*72)+4);
              const expH=Math.max(4,Math.round((t.expenses/maxTrend)*72)+4);
              const retainedH=t.netLocal>0&&t.income>0?Math.round(Math.min(1,Math.max(0,t.netLocal/t.income))*barH):0;
              const retainedSeg=retainedH>0?'<div style="height:'+retainedH+'px;background:#BA7517;transition:height 0.4s"></div>':'';
              return `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
                <div style="display:flex;gap:3px;align-items:flex-end;width:100%;justify-content:center;height:100px">
                  <div style="width:45%;display:flex;flex-direction:column;align-items:center">
                    <div style="font-size:9px;color:var(--text3);margin-bottom:1px;white-space:nowrap">${t.income?fmtShort(t.income).replace('₦',''):'—'}</div>
                    <div style="font-size:8px;color:#BA7517;margin-bottom:2px;white-space:nowrap;min-height:10px;line-height:10px">${t.netLocal>0?fmtShort(t.netLocal).replace('₦',''):''}</div>
                    <div style="width:100%;border-radius:4px 4px 0 0;height:${barH}px;transition:height 0.4s;overflow:hidden;display:flex;flex-direction:column">
                      <div style="flex:1;background:var(--primary)"></div>
                      ${retainedSeg}
                    </div>
                  </div>
                  <div style="width:45%;display:flex;flex-direction:column;align-items:center">
                    <div style="font-size:9px;color:var(--text3);margin-bottom:2px;white-space:nowrap">${t.expenses?fmtShort(t.expenses).replace('₦',''):'—'}</div>
                    <div style="width:100%;background:var(--danger);border-radius:4px 4px 0 0;height:${expH}px;transition:height 0.4s"></div>
                  </div>
                </div>
                <div style="font-size:11px;color:var(--text2)">${t.label}</div>
              </div>`;}).join('')}
          </div>
          ${forecastIncome?`
          <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text3);margin-bottom:10px">
              ${MONTHS[state.month].toUpperCase()} FORECAST
              <span style="font-weight:400;text-transform:none;letter-spacing:0"> (${forecastLabel} · ${remainingSundays} Sunday${remainingSundays!==1?'s':''} remaining)</span>
            </div>
            <div style="border-radius:12px;border:1px solid var(--border);overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.06)">

              <!-- Row 1: Expected Income -->
              <div style="padding:13px 14px;background:rgba(29,158,117,0.04);display:flex;align-items:stretch;gap:11px">
                <div style="width:3px;border-radius:2px;background:var(--primary);flex-shrink:0"></div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px">Expected Income for this period</div>
                  <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:7px">
                    <span style="font-size:18px;font-weight:800;color:var(--primary);letter-spacing:-0.4px">${fmtShort(_incMid)}</span>
                    <span style="font-size:11.5px;font-weight:700;color:var(--primary);opacity:0.75;background:rgba(29,158,117,0.12);border-radius:20px;padding:2px 9px;white-space:nowrap">± ${fmtShort(_incSpread)}</span>
                  </div>
                </div>
              </div>

              <div style="height:1px;background:var(--border)"></div>

              <!-- Row 2: Expected Retained Share -->
              ${forecastRetained?`
              <div style="padding:13px 14px;background:rgba(186,117,23,0.04);display:flex;align-items:stretch;gap:11px">
                <div style="width:3px;border-radius:2px;background:#BA7517;flex-shrink:0"></div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px">Expected Retained Share</div>
                  <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:7px">
                    <span style="font-size:18px;font-weight:800;color:#BA7517;letter-spacing:-0.4px">${fmtShort(_retMid)}</span>
                    <span style="font-size:11.5px;font-weight:700;color:#BA7517;opacity:0.75;background:rgba(186,117,23,0.12);border-radius:20px;padding:2px 9px;white-space:nowrap">± ${fmtShort(_retSpread)}</span>
                  </div>
                </div>
              </div>
              <div style="height:1px;background:var(--border)"></div>
              `:''}

              <!-- Row 3: Expected Balance after Expenses (or Expenses alone if balance unavailable) -->
              ${forecastBalance?`
              <div style="padding:13px 14px;background:${forecastBalance.min<0?'rgba(163,45,45,0.04)':'rgba(24,95,165,0.04)'};display:flex;align-items:stretch;gap:11px">
                <div style="width:3px;border-radius:2px;background:${_balColor};flex-shrink:0"></div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px">Expected Actual Balance after Expenses</div>
                  <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:6px">
                    <span style="font-size:11px;color:#6366F1;font-weight:700;letter-spacing:0.2px">b/w</span>
                    <span style="font-size:18px;font-weight:800;color:${_balColor};letter-spacing:-0.4px">${fmtShort(forecastBalance.min)}</span>
                    <span style="font-size:11px;color:#6366F1;font-weight:700;letter-spacing:0.2px">to</span>
                    <span style="font-size:18px;font-weight:800;color:${_balColor};letter-spacing:-0.4px">${fmtShort(forecastBalance.max)}</span>
                  </div>
                </div>
              </div>
              `:forecastExpenses?`
              <div style="padding:13px 14px;background:rgba(163,45,45,0.04);display:flex;align-items:stretch;gap:11px">
                <div style="width:3px;border-radius:2px;background:var(--danger);flex-shrink:0"></div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px">Expected Expenses</div>
                  <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:7px">
                    <span style="font-size:18px;font-weight:800;color:var(--danger);letter-spacing:-0.4px">${fmtShort(Math.round((forecastExpenses.min+forecastExpenses.max)/2))}</span>
                    <span style="font-size:11.5px;font-weight:700;color:var(--danger);opacity:0.75;background:rgba(163,45,45,0.12);border-radius:20px;padding:2px 9px;white-space:nowrap">± ${fmtShort(Math.round((forecastExpenses.max-forecastExpenses.min)/2))}</span>
                  </div>
                </div>
              </div>
              `:''}

            </div>
          </div>`:''}
        </div>
      </div>

      <div style="min-width:0">
        <div class="card">
          <div class="card-header"><span class="card-title">Income Breakdown</span><span style="color:var(--text3);font-size:11px">${MONTHS[state.month]} ${state.year} · ${sundayCount} Sunday${sundayCount!==1?'s':''}</span></div>
          ${displayIncomeCats.length?displayIncomeCats.map(([cat,amt])=>{
            const t = cat==='_others' ? {label:'CRM + Others'} : (INCOME_TYPES.find(e=>e.key===cat) || OTHER_INCOME_SOURCES.find(e=>e.key===cat) || {label:cat.replace(/_/g,' ')});
            const pct = totalIncome ? Math.round(amt/totalIncome*100) : 0;
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
              <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--text)">${t.label}</div></div>
              <div style="text-align:right;flex-shrink:0;margin-left:12px"><div style="font-size:13px;font-weight:600;color:var(--text)">${fmt(amt)}</div><div style="font-size:11px;color:var(--text3)">${pct}%</div></div>
            </div>`;
          }).join('')+`<div style="display:flex;justify-content:space-between;padding-top:10px;margin-top:4px"><span style="font-size:13px;font-weight:600;color:var(--text2)">Total income</span><span style="font-size:16px;font-weight:700;color:var(--primary)">${fmt(totalIncome)}</span></div>`
          :'<div class="empty-table">No income recorded this month.</div>'}
        </div>

        <div class="card" style="padding:0;overflow:hidden">
          <!-- Card header: always visible above the slider -->
          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border)">
            <span class="card-title">Expense Breakdown</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="color:var(--text3);font-size:11px">This month</span>
              ${topCats.length?`<div style="display:flex;background:var(--bg);border-radius:20px;padding:2px;gap:2px">
                <button onclick="(function(){var s=document.getElementById('exp-pie-slider');s.scrollTo({left:0,behavior:'smooth'});})()" style="border:none;background:var(--card);border-radius:18px;padding:3px 10px;font-size:11px;font-weight:600;color:var(--text2);cursor:pointer;line-height:1.6">≡ List</button>
                <button onclick="(function(){var s=document.getElementById('exp-pie-slider');s.scrollTo({left:s.offsetWidth,behavior:'smooth'});})()" style="border:none;background:transparent;border-radius:18px;padding:3px 10px;font-size:11px;font-weight:600;color:var(--text3);cursor:pointer;line-height:1.6">◑ Chart</button>
              </div>`:''}
            </div>
          </div>
          <!-- Two-slide horizontal scroller -->
          <div id="exp-pie-slider" style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;scrollbar-width:none">
            <!-- Slide 1 — progress-bar list (original view) -->
            <div style="flex:0 0 100%;scroll-snap-align:start;padding:14px 16px;box-sizing:border-box">
              ${topCats.length?topCats.map(([cat,amt])=>{
                const c=EXPENSE_CATS_ALL.find(e=>e.key===cat)||{label:cat,color:'#888',icon:''};
                return `<div class="exp-row"><div class="exp-label">${c.icon||''} ${c.label}</div><div class="progress-bar"><div class="progress-fill" style="width:${Math.round(amt/maxCat*100)}%;background:${c.color}"></div></div><div class="exp-val">${fmt(amt)}</div></div>`;
              }).join('')+`<div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:10px;margin-top:4px"><span style="font-size:13px;font-weight:600;color:var(--text2)">Total expenses</span><span style="font-size:16px;font-weight:700;color:var(--danger)">${fmt(totalExpenses)}</span></div>`
              :'<div class="empty-table">No expenses recorded this month.</div>'}
            </div>
            <!-- Slide 2 — donut (ring) pie chart + compact legend -->
            <div style="flex:0 0 100%;scroll-snap-align:start;padding:14px 16px;box-sizing:border-box">
              ${topCats.length?`
              <svg viewBox="0 0 200 195" width="100%" style="display:block;max-height:195px">
                ${_expDonutSlices}
                <!-- inner fill circle + centred label -->
                <circle cx="100" cy="97" r="47" fill="var(--card,#fff)"/>
                <text x="100" y="88" text-anchor="middle" font-size="9.5" fill="#aaa" font-family="system-ui,sans-serif" font-weight="500">Total</text>
                <text x="100" y="105" text-anchor="middle" font-size="15" font-weight="700" fill="#A32D2D" font-family="system-ui,sans-serif">${fmtShort(totalExpenses)}</text>
                <text x="100" y="117" text-anchor="middle" font-size="9" fill="#bbb" font-family="system-ui,sans-serif">${topCats.length} categor${topCats.length===1?'y':'ies'}</text>
              </svg>
              <!-- Legend rows -->
              <div style="margin-top:6px;display:flex;flex-direction:column;gap:5px">
                ${topCats.map(([cat,amt])=>{
                  const c=EXPENSE_CATS_ALL.find(e=>e.key===cat)||{label:cat,color:'#888',icon:''};
                  const pct=Math.round(amt/totalExpenses*100);
                  return `<div style="display:flex;align-items:center;gap:7px">
                    <div style="width:10px;height:10px;border-radius:2px;background:${c.color};flex-shrink:0"></div>
                    <span style="font-size:12px;color:var(--text2);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.icon||''} ${c.label}</span>
                    <span style="font-size:11px;font-weight:700;color:${c.color};flex-shrink:0;min-width:26px;text-align:right">${pct}%</span>
                    <span style="font-size:12px;font-weight:600;color:var(--text);flex-shrink:0;min-width:64px;text-align:right">${fmt(amt)}</span>
                  </div>`;
                }).join('')}
                <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:8px;margin-top:3px"><span style="font-size:13px;font-weight:600;color:var(--text2)">Total expenses</span><span style="font-size:16px;font-weight:700;color:var(--danger)">${fmt(totalExpenses)}</span></div>
              </div>`
              :'<div class="empty-table">No expenses recorded this month.</div>'}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Remittance Summary</span></div>
          <div class="status-row"><div><div class="status-row-label">National HQ</div></div><div class="status-row-right"><div class="status-row-amt">${fmt(remittances.totalNatl+dashNatlQuotasAmt)}</div></div></div>
          <div class="status-row"><div><div class="status-row-label">Regional</div></div><div class="status-row-right"><div class="status-row-amt">${fmt(dashRegionalAmt)}</div></div></div>
          <div class="status-row"><div><div class="status-row-label">Provincial</div></div><div class="status-row-right"><div class="status-row-amt">${fmt(remittances.provinceRebate)}</div></div></div>
          <div class="status-row"><div><div class="status-row-label">Pastor Family</div></div><div class="status-row-right"><div class="status-row-amt">${fmt((remittances.totalPastor||0)+(remittances.totalArea||0)+dashMummyAmt)}</div></div></div>
          <div class="status-row"><div><div class="status-row-label">Ministers</div></div><div class="status-row-right"><div class="status-row-amt">${fmt(remittances.totalMinisters)}</div></div></div>
          <div class="status-row" style="border-top:2px solid var(--border);margin-top:4px;padding-top:12px"><div><div class="status-row-label fw-bold">Net Local Retained</div></div><div class="status-row-right"><div class="status-row-amt" style="color:var(--primary);font-size:15px">${fmt(netLocal)}</div></div></div>
        </div>
      </div>
    </div>`;
}

async function calcRemittancesFromRecords(records, preRates){
  const combined = {};
  INCOME_TYPES.forEach(t=>{ combined[t.key]=0 });
  records.forEach(r=>{ INCOME_TYPES.forEach(t=>{ combined[t.key]+=(r[t.key]||0) }) });
  return await calcRemittances(combined, preRates);
}

// ── INCOME ────────────────────────────────
async function renderIncome(){
  renderPageSkeleton({ pageTitle: 'Income Recording', pageSub: monthLabel(), kpiCount: 3, hint: 'Loading income…' });
  const _incSources = [
    ['Income records',     () => DB.getIncome()],
    ['Cash transactions',  () => DB.getCashTransactions()],
    ['Remittance rates',   () => getRemRates()],
    ['Church balance',     () => calcChurchBalance()],
    ['Period range',       () => getCurrentPeriodRange()],
    ['Expenses',           () => DB.getExpenses()],
    ['Petty history',      () => DB.getPetty()],
    ['Satellite pass-through funds', () => DB.getSatelliteFunds()],
  ];
  const _incSettled = await Promise.allSettled(_incSources.map(([, fn]) => fn()));
  const _incFailed = _incSettled.map((r, i) => r.status === 'rejected' ? { label: _incSources[i][0], err: r.reason } : null).filter(Boolean);
  if(_incFailed.length > 0){
    renderPageErrorState({ pageId: 'income', pageTitle: 'Income Recording', pageSub: monthLabel(), failed: _incFailed });
    return;
  }
  const [allIncomeRecs, _cashTx, remRatesData, balance, periodRange, allExpensesRI, allPettyRI, allSatFundsRI] = _incSettled.map(r => r.value);
  const remRates = remRatesData.rates || DEFAULT_REMITTANCE_RATES;
  const cashWithAccountant = balance.cashWithAccountant;
  // Check for deposits awaiting verification — prevents confusing "Deposit Cash" button
  const _pendingFlaggedDeposits = _cashTx.filter(t=>t.type==='cash_deposit'&&(t.verificationStatus==='pending'||t.verificationStatus==='flagged'));
  const _hasPendingDeposits = _pendingFlaggedDeposits.length > 0;
  const _pendingDepTotal = _pendingFlaggedDeposits.reduce((s,t)=>s+(t.amount||0),0);
  const records = filterByCurrentPeriod(allIncomeRecs, periodRange.from, periodRange.to);
  const sundayRecs = records.filter(r=>!r.source||r.source==='sunday_collection');
  const otherRecs  = records.filter(r=>r.source && r.source!=='sunday_collection');
  const tab = state.incomeTab||'list';
  const expCoveringMap = buildExpenseCoveringMap(allIncomeRecs, _cashTx, remRates, allExpensesRI, allPettyRI);
  // Pending count for this month's income records (informational only).
  // Uses the FIFO-reconciled map so a record only counts as pending when its
  // share of the global cashWithAccountant pool is still positive.
  const pendingItems = records.filter(r=>{
    const entry = expCoveringMap.get(r.id);
    if(!entry) return false;
    return !entry.isReconciled;
  });
  const pendingCount = pendingItems.length;
  const totalCollected = records.reduce((s,r)=>s+(r.totalCollection||0),0);
  // Only count deposits linked to this period's income records (scoped to the active view)
  const currentPeriodRecordIds = new Set(records.map(r=>r.id));
  const totalDeposited = _cashTx.filter(t=>t.type==='cash_deposit'&&currentPeriodRecordIds.has(t.incomeRef)).reduce((s,t)=>s+(t.amount||0),0)
    + records.reduce((s,r)=>s+(r.bankTransferAmount||0),0);

  // Satellite / Zone pass-through funds RECEIVED — money the satellite parishes send
  // in (for Province remittance, a joint area/zone payment, or another purpose). This
  // is custodial money, never the parish's own income, so it comes from satellite_funds
  // (not the income table) and is deliberately excluded from every total above —
  // totalCollected, the KPI grid, and every income-by-type figure are all computed
  // purely from `records`/`allIncomeRecs`, which never include these rows.
  const satFundsInRecords = filterByCurrentPeriod((allSatFundsRI||[]).filter(s=>s.direction==='in'), periodRange.from, periodRange.to)
    .sort((a,b)=>new Date(b.date||b.createdAt||0)-new Date(a.date||a.createdAt||0));

  // ── Satellite / Zone Pass-Through Fund — one combined pool, all-time totals ──
  // (not filtered to the current period above: this is a running custodial balance,
  // not a per-period figure). Excluded from every income/expense total. Held = in −
  // out − transfer_out — identical formula to calcChurchBalance's heldForSatellites,
  // satellite_funds being the single source of truth for both. Reuses allSatFundsRI
  // (already fetched above for satFundsInRecords) rather than a second network call —
  // this panel moved here from the Remittances page (renderRemittances), which used
  // to compute the exact same 6 values from its own DB.getSatelliteFunds() fetch.
  const allSatFunds = allSatFundsRI || [];
  const satFundsIn=allSatFunds.filter(s=>s.direction==='in').reduce((s,r)=>s+(r.amount||0),0);
  const satFundsOut=allSatFunds.filter(s=>s.direction==='out').reduce((s,r)=>s+(r.amount||0),0);
  const satFundsTransferOut=allSatFunds.filter(s=>s.direction==='transfer_out').reduce((s,r)=>s+(r.amount||0),0);
  const satFundsHeld=satFundsIn-satFundsOut-satFundsTransferOut;
  const satFundsTransferByReason={ gift:0, reimbursement:0, correction:0 };
  allSatFunds.filter(s=>s.direction==='transfer_out').forEach(s=>{
    satFundsTransferByReason[s.purpose] = (satFundsTransferByReason[s.purpose]||0) + (s.amount||0);
  });
  const satFundsRecent=[...allSatFunds].sort((a,b)=>new Date(b.date||b.createdAt||0)-new Date(a.date||a.createdAt||0)).slice(0,10);

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Income Recording</div><div class="page-sub">${monthLabel()}${state.periodMode === 'remittance' ? ` · Remittance Period (${fmtDateShort(periodRange.from)} – ${fmtDateShort(periodRange.to)})` : ''}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${canAction('income_record')?`<button class="btn btn-primary" onclick="App.showIncomeForm()">📥 Sunday Collections</button>`:''}
        ${canAction('income_record')?`<button class="btn btn-amber" onclick="App.showOtherIncomeForm()">➕ Other Income</button>`:''}
        ${canAction('income_deposit')&&cashWithAccountant>0&&!_hasPendingDeposits?`<button class="btn btn-amber" onclick="App.confirmBulkDeposit()">💰 Deposit Cash (${fmt(cashWithAccountant)})</button>`:''}
        ${canAction('income_deposit')&&_hasPendingDeposits?`<button class="btn" style="border:1.5px solid var(--amber);color:var(--amber);background:rgba(184,134,11,0.08)" onclick="App.navigate('bank')">⏳ Deposit Pending (${fmt(_pendingDepTotal)})</button>`:''}
        ${canAction('income_deposit')&&state.user?.role==='it_admin'?`<button class="btn" style="border:1px solid var(--border);background:var(--bg)" onclick="App.reconcileCashWithAccountant()" title="Adjust the recorded cash balance to match what's physically with the accountant">⚖️ Reconcile Cash</button>`:''}
      </div>
    </div>
    <div class="kpi-grid" style="margin-bottom:16px">
      <div class="kpi"><div class="kpi-icon" style="background:#E1F5EE">📥</div><div class="kpi-label">Total Collected</div><div class="kpi-val">${fmt(totalCollected)}</div><div class="kpi-delta up">${records.length} record(s)</div></div>
      <div class="kpi"><div class="kpi-icon" style="background:#FAEEDA">💵</div><div class="kpi-label">Cash with Accountant</div><div class="kpi-val" style="color:${cashWithAccountant>0?'var(--amber)':'var(--primary)'}">${fmt(cashWithAccountant)}</div><div class="kpi-delta ${cashWithAccountant>0?'warn':'up'}">${cashWithAccountant>0?'Awaiting bank deposit':'All deposited ✓'}</div></div>
      <div class="kpi"><div class="kpi-icon" style="background:#EAF3DE">🏦</div><div class="kpi-label">In Bank (this month)</div><div class="kpi-val">${fmt(totalDeposited)}</div><div class="kpi-delta up">Transfers + deposits</div></div>
    </div>
    ${_hasPendingDeposits?`<div class="alert alert-warn" style="margin-bottom:12px"><span class="alert-icon">⏳</span><span>A deposit of <strong>${fmt(_pendingDepTotal)}</strong> is ${_pendingFlaggedDeposits[0]?.verificationStatus==='flagged'?'<strong>flagged by AI</strong> — please review and correct or approve it':'<strong>pending AI verification</strong>'}. Check the Bank page for details.</span></div>`:''}
    ${cashWithAccountant>0&&!_hasPendingDeposits&&canAction('income_deposit')?`<div class="alert alert-warn" style="margin-bottom:12px"><span class="alert-icon">⚠</span><span>Cash with Accountant: <strong>${fmt(cashWithAccountant)}</strong>${pendingItems.length>0?` — pending: <strong>${pendingItems.map(r=>fmtDate(r.date||r.createdAt)).join(', ')}</strong>`:''} — not yet deposited to the bank. <button class="btn btn-sm btn-amber" onclick="App.confirmBulkDeposit()" style="margin-left:8px">Record Deposit Now</button></span></div>`:''}
    ${renderSatelliteFundsInSection(satFundsInRecords)}
    <div class="tabs">
      <button class="tab ${tab==='list'?'active':''}" onclick="App.setIncomeTab('list')">Sunday Collections (${sundayRecs.length})</button>
      <button class="tab ${tab==='other'?'active':''}" onclick="App.setIncomeTab('other')">Other Income (${otherRecs.length})</button>
      <button class="tab ${tab==='summary'?'active':''}" onclick="App.setIncomeTab('summary')">Monthly Summary</button>
      <button class="tab ${tab==='all'?'active':''}" onclick="App.setIncomeTab('all')">All Records</button>
    </div>
    ${await (tab==='list'?renderIncomeList(sundayRecs, _cashTx, remRates, expCoveringMap):tab==='other'?renderOtherIncomeList(otherRecs, expCoveringMap):tab==='summary'?renderIncomeSummary(records):renderAllIncomeList(allIncomeRecs, _cashTx, remRates, expCoveringMap))}
    ${renderSatelliteFundsPanel(satFundsIn, satFundsOut, satFundsTransferOut, satFundsHeld, satFundsRecent, satFundsTransferByReason)}`;
}

// ── Satellite / Zone Funds Received — shown on the Income page, clearly separated
// from the parish's own income tabs/totals above. This card is intentionally styled
// with a distinct accent (brown/#8B4513, matching the "held for satellites" figures
// elsewhere) so it can never be mistaken for a parish income card. Just the header,
// the "Record Funds Received" button, and a period total — the itemized entry list
// used to live here too, but now lives ONLY in the bigger "Funds Received & Remitted
// on Behalf of Satellite Parishes" panel's "Recent Entries" section (see
// renderSatelliteFundsPanel, now rendered further down this same Income page — see
// renderIncome), so it isn't duplicated in both cards.
function renderSatelliteFundsInSection(records){
  const canRecord = canAction('satellite_fund_record');
  const total = records.reduce((s,r)=>s+(r.amount||0),0);
  return `
    <div class="card" style="margin-bottom:16px;border:2px solid #8B4513;background:rgba(139,69,19,0.04)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-size:15px;font-weight:700;color:#8B4513">🛰️ Satellite / Zone Funds Received</div>
          <div style="font-size:12px;color:#8B4513;font-style:italic;margin-top:2px">Pass-through — not counted as parish income.</div>
        </div>
        ${canRecord?`<button class="btn" style="border:2px solid #8B4513;color:#8B4513;background:#fff" onclick="App.showSatelliteFundsInForm()">🛰️ Record Funds Received</button>`:''}
      </div>
      ${records.length
        ? `<div style="margin-top:12px;font-size:12px;color:#8B4513;font-weight:600">Total this period: ${fmt(total)} (${records.length} entr${records.length===1?'y':'ies'}) — excluded from Total Collected above</div>`
        : `<div style="margin-top:10px;font-size:12px;color:var(--text3)">No satellite pass-through receipts recorded for this period.</div>`}
    </div>`;
}

function setIncomeTab(t){ state.incomeTab=t; renderIncome() }

async function renderIncomeList(records, cashTxOverride, remRatesOverride, expMapOverride){
  if(!records.length) return '<div class="card"><div class="empty-table">No Sunday collection records found for this month. Click "📥 Sunday Collections" above to add one.</div></div>';
  const allCashTxList = cashTxOverride || await DB.getCashTransactions();
  const remRates = remRatesOverride || (await getRemRates()).rates || DEFAULT_REMITTANCE_RATES;
  return `<div class="card">
    <span class="td-muted tx-mobile-hint" style="font-size:11px;padding-bottom:6px">Tap any row to see full details</span>
    <div class="table-wrap"><table class="tx-desktop-table">
      <tr><th>Date</th><th>Total Collection</th><th>Cash (Accountant)</th><th>Bank Transfer</th><th>Direct → Petty</th><th>Cash Status</th><th>Recorded By</th><th>Actions</th></tr>
      ${records.map(r=>{
        const btAmt = r.bankTransferAmount||0;
        const dpAmt = r.directPettyCash||0;
        const cashHeld = getIncomeCashWithAccountant(r, remRates);
        const depositedAmt = allCashTxList.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
        const entry = expMapOverride?.get(r.id);
        const isFullyDeposited = cashHeld > 0 && (depositedAmt >= cashHeld || entry?.isReconciled);
        const remaining = entry ? entry.stillPending : Math.max(0, cashHeld - depositedAmt);
        const statusBadge = cashHeld===0
          ? `<span class="badge badge-info">No Cash (All Transfer)</span>`
          : isFullyDeposited
            ? `<span class="badge badge-success">✓ Deposited</span>`
            : depositedAmt > 0
              ? `<span class="badge badge-warn">Partial — ${fmt(remaining)} still pending</span>`
              : `<span class="badge badge-warn">⏳ Cash Pending Deposit</span>`;
        return `<tr>
          <td><strong>${fmtDate(r.date)}</strong><div class="td-muted" style="font-size:11px">${fmtTime(r.createdAt||r.date)}</div>${r.notes?`<div class="td-muted">${r.notes}</div>`:''}</td>
          <td class="td-green td-bold">${fmt(r.totalCollection)}</td>
          <td class="td-muted">${cashHeld>0?fmt(cashHeld):'—'}</td>
          <td class="td-muted">${btAmt>0?fmt(btAmt):'—'}</td>
          <td class="td-muted">${dpAmt>0?fmt(dpAmt):'—'}</td>
          <td>${statusBadge}</td>
          <td class="td-muted">${r.recordedBy||'—'}</td>
          <td><button class="btn btn-sm" onclick="App.viewIncome('${r.id}')">View</button>
          ${canAction('income_deposit')&&cashHeld>0&&!isFullyDeposited?`<button class="btn btn-sm btn-primary" onclick="App.confirmDeposit('${r.id}')" style="margin-left:4px">Record Deposit</button>`:''}</td>
        </tr>`;}).join('')}
    </table>
    <table class="tx-mobile-table">
      <tr><th>Date</th><th>Details</th><th class="td-right">Amount</th></tr>
      ${records.map(r=>{
        const btAmt = r.bankTransferAmount||0;
        const dpAmt = r.directPettyCash||0;
        const cashHeld = getIncomeCashWithAccountant(r, remRates);
        const depositedAmt = allCashTxList.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
        const entry = expMapOverride?.get(r.id);
        const isFullyDeposited = cashHeld > 0 && (depositedAmt >= cashHeld || entry?.isReconciled);
        const mobileStatus = cashHeld===0
          ? `<span class="badge badge-info">No Cash</span>`
          : isFullyDeposited
            ? `<span class="badge badge-success">✓ Deposited</span>`
            : `<span class="badge badge-warn">⏳ Pending</span>`;
        return `<tr class="tx-mobile-row" onclick="App.viewIncome('${r.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.viewIncome('${r.id}')}" tabindex="0" style="cursor:pointer" role="button" aria-label="Sunday Collection ${fmtDate(r.date)} — ${fmt(r.totalCollection)}">
          <td><div style="font-size:13px;font-weight:600;white-space:nowrap">${fmtDate(r.date)}</div><div class="td-muted" style="font-size:11px">${fmtTime(r.createdAt||r.date)}</div></td>
          <td style="max-width:0;width:55%">
            <div style="font-size:13px;font-weight:500">📅 Sunday Collection</div>
            <div style="margin-top:3px">${mobileStatus}</div>
          </td>
          <td class="td-right td-green td-bold" style="white-space:nowrap">${fmt(r.totalCollection)}</td>
        </tr>`;}).join('')}
    </table></div></div>`;
}

async function renderOtherIncomeList(records, expMapOverride){
  if(!records.length) return '<div class="card"><div class="empty-table">No other income records found for this month. Click "➕ Other Income" above to add one.</div></div>';
  const allCashTxList = await DB.getCashTransactions();
  return `<div class="card">
    <span class="td-muted tx-mobile-hint" style="font-size:11px;padding-bottom:6px">Tap any row to see full details</span>
    <div class="table-wrap"><table class="tx-desktop-table">
      <tr><th>Date</th><th>Source Type</th><th>Donor / Notes</th><th>Amount</th><th>Payment Method</th><th>Status</th><th>Recorded By</th><th>Actions</th></tr>
      ${records.map(r=>{
        const src = OTHER_INCOME_SOURCES.find(s=>s.key===r.source)||{label:r.source||'Other'};
        const cashHeld = getIncomeCashWithAccountant(r, DEFAULT_REMITTANCE_RATES);
        const hasCashComponent = cashHeld > 0.005;
        const cashDep = allCashTxList.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
        const entry = hasCashComponent ? expMapOverride?.get(r.id) : null;
        const isFullyDep = cashDep>=cashHeld || entry?.isReconciled;
        const remaining = entry ? entry.stillPending : Math.max(0, cashHeld - cashDep);
        const statusBadge = !hasCashComponent
          ? `<span class="badge badge-info">🏦 Bank Transfer</span>`
          : isFullyDep
            ? `<span class="badge badge-success">✓ Deposited</span>`
            : cashDep>0
              ? `<span class="badge badge-warn">Partial — ${fmt(remaining)} pending</span>`
              : `<span class="badge badge-warn">⏳ Cash Pending Deposit</span>`;
        return `<tr>
          <td><strong>${fmtDate(r.date)}</strong><div class="td-muted" style="font-size:11px">${fmtTime(r.createdAt||r.date)}</div></td>
          <td><span class="badge badge-gray">${src.label}</span></td>
          <td class="td-muted">${r.donorName||r.notes||'—'}</td>
          <td class="td-green td-bold">${fmt(r.totalCollection)}</td>
          <td class="td-muted" style="font-size:11px">${(r.paymentMethod||'cash').replace('_',' ')}</td>
          <td>${statusBadge}</td>
          <td class="td-muted">${r.recordedBy||'—'}</td>
          <td><button class="btn btn-sm" onclick="App.viewIncome('${r.id}')">View</button>
          ${canAction('income_deposit')&&hasCashComponent&&!isFullyDep?`<button class="btn btn-sm btn-primary" onclick="App.confirmDeposit('${r.id}')" style="margin-left:4px">Record Deposit</button>`:''}</td>
        </tr>`;}).join('')}
    </table>
    <table class="tx-mobile-table">
      <tr><th>Date</th><th>Details</th><th class="td-right">Amount</th></tr>
      ${records.map(r=>{
        const src = OTHER_INCOME_SOURCES.find(s=>s.key===r.source)||{label:r.source||'Other'};
        const cashHeld = getIncomeCashWithAccountant(r, DEFAULT_REMITTANCE_RATES);
        const hasCashComponent = cashHeld > 0.005;
        const cashDep = allCashTxList.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
        const entry = hasCashComponent ? expMapOverride?.get(r.id) : null;
        const isFullyDep = cashDep>=cashHeld || entry?.isReconciled;
        const mobileStatus = !hasCashComponent
          ? `<span class="badge badge-info">🏦 Bank</span>`
          : isFullyDep
            ? `<span class="badge badge-success">✓ Deposited</span>`
            : `<span class="badge badge-warn">⏳ Pending</span>`;
        return `<tr class="tx-mobile-row" onclick="App.viewIncome('${r.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.viewIncome('${r.id}')}" tabindex="0" style="cursor:pointer" role="button" aria-label="${esc(src.label)} ${fmtDate(r.date)} — ${fmt(r.totalCollection)}">
          <td><div style="font-size:13px;font-weight:600;white-space:nowrap">${fmtDate(r.date)}</div><div class="td-muted" style="font-size:11px">${fmtTime(r.createdAt||r.date)}</div></td>
          <td style="max-width:0;width:55%">
            <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><span class="badge badge-gray">${esc(src.label)}</span></div>
            <div class="td-muted" style="font-size:11px;margin-top:3px">${r.donorName||r.notes?esc(r.donorName||r.notes||''):''}</div>
            <div style="margin-top:3px">${mobileStatus}</div>
          </td>
          <td class="td-right td-green td-bold" style="white-space:nowrap">${fmt(r.totalCollection)}</td>
        </tr>`;}).join('')}
    </table></div></div>`;
}

async function renderIncomeSummary(records){
  const sundayRecs = records.filter(r=>!r.source||r.source==='sunday_collection');
  const otherRecs  = records.filter(r=>r.source && r.source!=='sunday_collection');
  const totals = {};
  INCOME_TYPES.forEach(t=>{ totals[t.key]=0 });
  sundayRecs.forEach(r=>{ INCOME_TYPES.forEach(t=>{ totals[t.key]+=(r[t.key]||0) }) });
  const sundayGrand = Object.values(totals).reduce((a,b)=>a+b,0);
  const otherTotal  = otherRecs.reduce((s,r)=>s+(r.totalCollection||0),0);
  const grand = sundayGrand + otherTotal;
  const rem = await calcRemittances(totals);
  const settings = await DB.getSettings();
  const quotas = getQuotaList(settings);
  const monthEnd=(state.year===new Date().getFullYear() && state.month===new Date().getMonth())
    ? ymdLocal(new Date())
    : ymdLocal(new Date(state.year,state.month+1,0));
  const quotaLines = getQuotaLinesForPeriod(quotas, ymdLocal(new Date(state.year,state.month,1)), monthEnd);
  const quotasTotal = sumQuotaLines(quotaLines);
  const trueNetLocal = rem.netLocal - quotasTotal;
  return `
    <div class="grid-2">
      <div class="card">
        <div class="card-header"><span class="card-title">Income by Type (Sunday Collections)</span></div>
        ${INCOME_TYPES.map(t=>`
          <div class="status-row">
            <div class="status-row-label">${t.label}</div>
            <div class="status-row-amt">${totals[t.key]>0?fmt(totals[t.key]):'—'}</div>
          </div>`).join('')}
        <div class="status-row" style="border-top:2px solid var(--border);margin-top:4px"><div class="status-row-label fw-bold">Sunday Sub-total</div><div class="status-row-amt" style="color:var(--primary)">${fmt(sundayGrand)}</div></div>
        ${otherTotal>0?`<div class="status-row" style="margin-top:8px"><div class="status-row-label">Other Income (donations, midweek, etc.)</div><div class="status-row-amt" style="color:var(--primary)">${fmt(otherTotal)}</div></div>`:''}
        <div class="status-row" style="border-top:2px solid var(--border);margin-top:4px"><div class="status-row-label fw-bold">${otherTotal>0?'Grand Total (All Income)':'Grand Total'}</div><div class="status-row-amt" style="color:var(--primary);font-size:16px">${fmt(grand)}</div></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Remittance Breakdown</span><span style="font-size:11px;color:var(--text3)">Applies to Sunday collections only</span></div>
        ${rem.lines.length?rem.lines.map(l=>{
          if(l.isTg){
            return `
            <div class="status-row">
              <div><div class="status-row-label">${l.label} → HQ</div><div class="status-row-sub">From ${fmt(l.total)}</div></div>
              <div class="status-row-amt td-red">${fmt(l.national||0)}</div>
            </div>
            ${(l.area||0)>0?`<div class="status-row" style="padding-left:14px"><div><div class="status-row-label" style="font-size:12px">TG → Area / Zonal</div></div><div class="status-row-amt td-red" style="font-size:12px">${fmt(l.area)}</div></div>`:''}
            ${(l.pastor||0)>0?`<div class="status-row" style="padding-left:14px"><div><div class="status-row-label" style="font-size:12px">TG → Parish Pastor's Share</div></div><div class="status-row-amt td-red" style="font-size:12px">${fmt(l.pastor)}</div></div>`:''}
            ${(l.ministers||0)>0?`<div class="status-row" style="padding-left:14px"><div><div class="status-row-label" style="font-size:12px">TG → Ministers' Share</div></div><div class="status-row-amt td-red" style="font-size:12px">${fmt(l.ministers)}</div></div>`:''}
            ${(l.seed||0)>0?`<div class="status-row" style="padding-left:14px"><div><div class="status-row-label" style="font-size:12px">TG → Seed → National HQ</div></div><div class="status-row-amt td-red" style="font-size:12px">${fmt(l.seed)}</div></div>`:''}`;
          }
          return `
          <div class="status-row">
            <div><div class="status-row-label">${l.label} → HQ</div><div class="status-row-sub">From ${fmt(l.total)}</div></div>
            <div class="status-row-amt td-red">${fmt(l.national||0)}</div>
          </div>`;
        }).join(''):'<div class="empty-table">No Sunday collections recorded yet.</div>'}
        ${rem.lines.length?`
        <div class="status-row" style="background:var(--amber-light);border-radius:var(--r);padding:8px 10px;border:none;margin-top:4px">
          <div class="status-row-label">Province Rebate (20%)</div><div class="status-row-amt td-amber">${fmt(rem.provinceRebate)}</div>
        </div>
        ${quotaLines.map(q=>`
        <div class="status-row" style="background:var(--info-light);border-radius:var(--r);padding:8px 10px;border:none;margin-top:4px">
          <div><div class="status-row-label" style="color:var(--info)">${esc(q.label)}</div><div class="status-row-sub">${esc(q.basis||'Fixed monthly amount')}</div></div>
          <div class="status-row-amt" style="color:var(--info)">${fmt(q.amount)}</div>
        </div>`).join('')}
        <div class="status-row" style="border-top:2px solid var(--border);margin-top:4px"><div class="status-row-label fw-bold">Net Local Retained</div><div class="status-row-amt" style="color:var(--primary);font-size:16px">${fmt(trueNetLocal)}</div></div>`:''}
      </div>
    </div>`;
}

async function renderAllIncomeList(records, cashTxOverride, remRatesOverride, expMapOverride){
  if(!records.length) return '<div class="card"><div class="empty-table">No income records found across all months.</div></div>';
  const allCashTxList = cashTxOverride || await DB.getCashTransactions();
  const remRates = remRatesOverride || (await getRemRates()).rates || DEFAULT_REMITTANCE_RATES;
  const sorted = [...records].sort((a,b)=> new Date(b.date||b.createdAt||0) - new Date(a.date||a.createdAt||0));
  return `<div class="card">
    <span class="td-muted tx-mobile-hint" style="font-size:11px;padding-bottom:6px">Tap any row to see full details</span>
    <div class="table-wrap"><table class="tx-desktop-table">
      <tr><th>Date</th><th>Source / Type</th><th>Amount</th><th>Cash (Accountant)</th><th>Bank Transfer</th><th>Cash Status</th><th>Recorded By</th><th>Actions</th></tr>
      ${sorted.map(r=>{
        const isSunday = !r.source||r.source==='sunday_collection';
        const btAmt = r.bankTransferAmount||0;
        const dpAmt = r.directPettyCash||0;
        const cashHeld = isSunday
          ? getSundayCashWithAccountant(r, remRates)
          : getIncomeCashWithAccountant(r, remRates);
        const depositedAmt = allCashTxList.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
        const entry = expMapOverride?.get(r.id);
        const isFullyDeposited = cashHeld > 0 && (depositedAmt >= cashHeld || entry?.isReconciled);
        const remaining = entry ? entry.stillPending : Math.max(0, cashHeld - depositedAmt);
        const statusBadge = cashHeld===0
          ? `<span class="badge badge-info">No Cash</span>`
          : isFullyDeposited
            ? `<span class="badge badge-success">✓ Deposited</span>`
            : depositedAmt>0
              ? `<span class="badge badge-warn">Partial — ${fmt(remaining)} pending</span>`
              : `<span class="badge badge-warn">⏳ Pending</span>`;
        const srcLabel = isSunday ? '📅 Sunday Collection' : (OTHER_INCOME_SOURCES.find(s=>s.key===r.source)||{label:r.source||'Other'}).label;
        return `<tr>
          <td><strong>${fmtDate(r.date)}</strong><div class="td-muted" style="font-size:11px">${fmtTime(r.createdAt||r.date)}</div>${r.notes?`<div class="td-muted">${r.notes}</div>`:''}</td>
          <td class="td-green td-bold">${fmt(r.totalCollection)}</td>
          <td class="td-muted">${cashHeld>0?fmt(cashHeld):'—'}</td>
          <td class="td-muted">${btAmt>0?fmt(btAmt):'—'}</td>
          <td>${statusBadge}</td>
          <td class="td-muted">${r.recordedBy||'—'}</td>
          <td><button class="btn btn-sm" onclick="App.viewIncome('${r.id}')">View</button>
          ${canAction('income_deposit')&&cashHeld>0&&!isFullyDeposited?`<button class="btn btn-sm btn-primary" onclick="App.confirmDeposit('${r.id}')" style="margin-left:4px">Record Deposit</button>`:''}</td>
        </tr>`;}).join('')}
    </table>
    <table class="tx-mobile-table">
      <tr><th>Date</th><th>Details</th><th class="td-right">Amount</th></tr>
      ${sorted.map(r=>{
        const isSunday = !r.source||r.source==='sunday_collection';
        const btAmt = r.bankTransferAmount||0;
        const dpAmt = r.directPettyCash||0;
        const cashHeld = isSunday
          ? getSundayCashWithAccountant(r, remRates)
          : getIncomeCashWithAccountant(r, remRates);
        const depositedAmt = allCashTxList.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
        const entry = expMapOverride?.get(r.id);
        const isFullyDeposited = cashHeld > 0 && (depositedAmt >= cashHeld || entry?.isReconciled);
        const mobileStatus = cashHeld===0
          ? `<span class="badge badge-info">No Cash</span>`
          : isFullyDeposited
            ? `<span class="badge badge-success">✓ Deposited</span>`
            : `<span class="badge badge-warn">⏳ Pending</span>`;
        const srcLabel = isSunday ? '📅 Sunday Collection' : (OTHER_INCOME_SOURCES.find(s=>s.key===r.source)||{label:r.source||'Other'}).label;
        return `<tr class="tx-mobile-row" onclick="App.viewIncome('${r.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.viewIncome('${r.id}')}" tabindex="0" style="cursor:pointer" role="button" aria-label="${esc(srcLabel)} ${fmtDate(r.date)} — ${fmt(r.totalCollection)}">
          <td>
            <div style="font-size:13px;font-weight:600;white-space:nowrap">${fmtDate(r.date)}</div>
            <div class="td-muted" style="font-size:11px">${fmtTime(r.createdAt||r.date)}</div>
            ${r.notes?`<div class="td-muted" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px">${esc(r.notes)}</div>`:''}
          </td>
          <td style="max-width:0;width:55%">
            <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><span class="badge badge-gray" style="font-size:11px">${esc(srcLabel)}</span></div>
            ${r.donorName?`<div class="td-muted" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.donorName)}</div>`:''}
            <div style="margin-top:3px">${mobileStatus}</div>
          </td>
          <td class="td-right td-green td-bold" style="white-space:nowrap">${fmt(r.totalCollection)}</td>
        </tr>`;}).join('')}
    </table></div></div>`;
}

function showIncomeForm(){
  if(!canAction('income_record')){ showAlert('You do not have permission to record income.','danger'); return; }
  const today = new Date().toISOString().split('T')[0];
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">📥 Record Sunday Collections</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>Count cash together with the Head Usher before entering figures. Both must sign off.</span></div>
    <div class="form-group"><label class="form-label">Collection Date *</label><input type="date" id="inc_date" class="form-input" value="${today}" max="${today}" /></div>
    <div class="form-group"><label class="form-label">Counted Together With (Head Usher Name) *</label><input type="text" id="inc_usher" class="form-input" placeholder="e.g. Bro. Emmanuel Okafor" /></div>
    <hr class="divider"><p style="font-size:12px;color:var(--text3);margin-bottom:12px">Enter the amount counted for each collection category. Leave blank if none was collected.</p>
    ${INCOME_TYPES.map(t=>`<div class="form-group"><label class="form-label">${t.label}</label><input type="number" id="inc_${t.key}" class="form-input" placeholder="₦0" min="0" oninput="App.updateIncomeTotal()" /></div>`).join('')}
    <div class="card" style="background:var(--primary-light);border-color:var(--primary-mid);margin-top:8px">
      <div class="amount-label">Total Collection</div>
      <div class="amount-display" id="inc_total">₦0</div>
    </div>
    <hr class="divider">
    <p style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px">📋 How was this money received?</p>
    <p style="font-size:11px;color:var(--text3);margin-bottom:12px">If part of the total was paid directly to the bank or given to the Admin Officer, record those portions below. The local share of Teen/Children's Offering is automatically treated as cash held by the Children Teacher for refreshments and is not available for bank deposit or general spending.</p>
    <div class="form-row">
      <div class="form-group" style="flex:2">
        <label class="form-label">Paid via Bank Transfer (₦)</label>
        <div class="form-hint" style="margin-bottom:8px">Individual transfers received directly to the church bank account. Add each transfer separately for easier bank reconciliation.</div>
        <div id="inc_bank_transfers_list"></div>
        <button type="button" class="btn btn-sm" style="margin-top:6px" onclick="App.addBankTransferRow()">+ Add Transfer</button>
        <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface);border-radius:var(--r)">
          <span style="font-size:12px;font-weight:600;color:var(--text2)">Total Bank Transfers</span>
          <span id="inc_bank_transfer_total" style="font-size:15px;font-weight:700;color:var(--primary)">₦0</span>
        </div>
        <input type="hidden" id="inc_bank_transfer" value="0" />
      </div>
      <div class="form-group" style="flex:1"><label class="form-label">Given Directly to Admin Officer (₦)</label>
        <input type="number" id="inc_direct_petty" class="form-input" placeholder="0" min="0" oninput="App.updateIncomeCashBreakdown()" />
        <div class="form-hint">Cash handed to the Admin Officer to top up petty cash float</div>
      </div>
    </div>
    <div id="inc_breakdown_card" class="card" style="background:var(--surface);margin-top:4px">
      <div style="font-size:12px;color:var(--text2);line-height:2">
        <span style="color:var(--primary);font-weight:600">💵 Cash with Accountant (to deposit):</span> <span id="inc_cash_held">₦0</span>
        &nbsp;·&nbsp; 🏦 Bank Transfer: <span id="inc_bank_lbl">₦0</span>
        &nbsp;·&nbsp; 💳 To Petty Cash: <span id="inc_petty_lbl">₦0</span>
        &nbsp;·&nbsp; 🧒 Children Teacher Hold: <span id="inc_children_teacher_lbl">₦0</span>
      </div>
      <div id="inc_overalloc_warn" style="display:none;color:var(--danger);font-size:12px;margin-top:4px;font-weight:600">⚠ Bank transfer + petty cash amount exceeds what is available after Children Teacher hold. Please check the figures.</div>
    </div>
    <div class="form-group mt-2"><label class="form-label">Notes (optional)</label><textarea id="inc_notes" class="form-textarea" placeholder="e.g. Special thanksgiving offering, harvest Sunday, etc."></textarea></div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitIncome(this)">Save & Calculate Remittances</button>
    </div>`);
}

let _bankTransferRowCount = 0;
function addBankTransferRow(){
  const list = document.getElementById('inc_bank_transfers_list');
  if(!list) return;
  const idx = _bankTransferRowCount++;
  const today = new Date().toISOString().split('T')[0];
  const row = document.createElement('div');
  row.id = `bt_row_${idx}`;
  row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px';
  row.innerHTML = `
    <input type="number" class="form-input bt-amt" placeholder="Amount" min="0" style="flex:1;padding:8px" oninput="App.updateBankTransferTotal()" />
    <input type="date" class="form-input bt-date" value="${today}" style="flex:1;padding:8px;font-size:12px" />
    <button type="button" onclick="this.parentElement.remove();App.updateBankTransferTotal()" style="background:none;border:none;color:var(--danger);font-size:18px;cursor:pointer;padding:4px">✕</button>
  `;
  list.appendChild(row);
}
function updateBankTransferTotal(){
  const rows = document.querySelectorAll('#inc_bank_transfers_list .bt-amt');
  let total = 0;
  rows.forEach(r => { total += parseFloat(r.value) || 0; });
  const totalEl = document.getElementById('inc_bank_transfer_total');
  const hiddenEl = document.getElementById('inc_bank_transfer');
  if(totalEl) totalEl.textContent = fmt(total);
  if(hiddenEl) hiddenEl.value = total;
  updateIncomeCashBreakdown();
}
function getBankTransferDetails(){
  const rows = document.querySelectorAll('#inc_bank_transfers_list > div');
  const details = [];
  rows.forEach(row => {
    const amt = parseFloat(row.querySelector('.bt-amt')?.value) || 0;
    const date = row.querySelector('.bt-date')?.value || '';
    if(amt > 0) details.push({ amount: amt, date });
  });
  return JSON.stringify(details);
}

function updateIncomeTotal(){
  let total=0;
  INCOME_TYPES.forEach(t=>{ total+=parseFloat(document.getElementById('inc_'+t.key)?.value||0)||0 });
  const el=document.getElementById('inc_total');
  if(el) el.textContent=fmt(total);
  updateIncomeCashBreakdown();
}

function updateIncomeCashBreakdown(){
  let total=0;
  INCOME_TYPES.forEach(t=>{ total+=parseFloat(document.getElementById('inc_'+t.key)?.value||0)||0 });
  const bt = parseFloat(document.getElementById('inc_bank_transfer')?.value||0)||0;
  const dp = parseFloat(document.getElementById('inc_direct_petty')?.value||0)||0;
  const childrenOffering = parseFloat(document.getElementById('inc_childrenOffering')?.value||0)||0;
  const childrenTeacherHold = Math.max(0, childrenOffering * DEFAULT_REMITTANCE_RATES.childrenOffering.local);
  const allocatable = Math.max(0, total - childrenTeacherHold);
  const overalloc = bt + dp > allocatable && total > 0;
  const cash = Math.max(0, allocatable - bt - dp);
  const cashEl = document.getElementById('inc_cash_held');
  const btEl   = document.getElementById('inc_bank_lbl');
  const dpEl   = document.getElementById('inc_petty_lbl');
  const ctEl   = document.getElementById('inc_children_teacher_lbl');
  const warnEl = document.getElementById('inc_overalloc_warn');
  if(cashEl) cashEl.textContent = fmt(cash);
  if(btEl)   btEl.textContent   = fmt(bt);
  if(dpEl)   dpEl.textContent   = fmt(dp);
  if(ctEl)   ctEl.textContent   = fmt(childrenTeacherHold);
  if(warnEl) warnEl.style.display = overalloc ? 'block' : 'none';
  const btInput = document.getElementById('inc_bank_transfer');
  const dpInput = document.getElementById('inc_direct_petty');
  if(btInput) btInput.style.borderColor = overalloc ? 'var(--danger)' : '';
  if(dpInput) dpInput.style.borderColor = overalloc ? 'var(--danger)' : '';
}

async function submitIncome(btn=null){
  if(!canAction('income_record')){ showAlert('You do not have permission to record income.','danger'); return; }
  const date=document.getElementById('inc_date')?.value;
  const usher=document.getElementById('inc_usher')?.value?.trim();
  if(!date){ showAlert('Please select a date.','danger'); return }
  if(!usher){ showAlert('Please enter the Head Usher name for counter-signing.','danger'); return }
  const rec={date,usher,source:'sunday_collection',recordedBy:state.user?.name,depositConfirmed:false};
  let total=0;
  INCOME_TYPES.forEach(t=>{ const v=parseFloat(document.getElementById('inc_'+t.key)?.value||0)||0; rec[t.key]=v; total+=v });
  total=Math.round(total * 100) / 100;
  if(!total){ showAlert('Please enter at least one income amount.','danger'); return }
  rec.totalCollection=total;

  const bankTransferAmount = Math.round((parseFloat(document.getElementById('inc_bank_transfer')?.value||0)||0)*100)/100;
  const bankTransferDetails = typeof getBankTransferDetails === 'function' ? getBankTransferDetails() : '';
  const directPettyCash    = Math.round((parseFloat(document.getElementById('inc_direct_petty')?.value||0)||0)*100)/100;
  const remRates = (await getRemRates()).rates || DEFAULT_REMITTANCE_RATES;
  const childrenTeacherHeld = getChildrenTeacherHeldCash(rec, remRates);
  const maxAllocatable = Math.max(0, total - childrenTeacherHeld);
  if(bankTransferAmount + directPettyCash > maxAllocatable){
    showAlert(`Bank transfer (${fmt(bankTransferAmount)}) + direct petty cash (${fmt(directPettyCash)}) cannot exceed the amount available after Children Teacher hold (${fmt(maxAllocatable)}).`,"danger");
    return;
  }
  rec.bankTransferAmount = bankTransferAmount;
  rec.bankTransferDetails = bankTransferDetails;
  rec.directPettyCash    = directPettyCash;
  rec.notes=document.getElementById('inc_notes')?.value||'';

  const restore = setBtnLoading(btn, 'Saving…');
  try {
    const saved = await DB.addIncome(rec);
    // If this submission was folded into an already-recorded Sunday collection (e.g.
    // Holy Communion Offering counted separately from the main offering), reflect the
    // Sunday's cumulative totals — not just this entry — in the cash/audit figures.
    const sundayTotal = Number(saved?.totalCollection ?? total);
    const cashWithAccountant = getSundayCashWithAccountant(saved?.merged ? saved : rec, remRates);
    const cashHoldForAudit = saved?.merged ? getChildrenTeacherHeldCash(saved, remRates) : childrenTeacherHeld;

    if(saved?.merged){
      DB.addAudit('income_recorded',`+${fmt(total)} merged into existing Sunday collection for ${fmtDate(date)} (new total ${fmt(sundayTotal)}) — Cash with Accountant: ${fmt(cashWithAccountant)}, Children Teacher Hold: ${fmt(cashHoldForAudit)}, Direct Petty (this entry): ${fmt(directPettyCash)}. Counted with: ${usher}`,state.user?.name);
    } else {
      DB.addAudit('income_recorded',`Sunday collection ${fmt(total)} for ${fmtDate(date)} — Cash with Accountant: ${fmt(cashWithAccountant)}, Children Teacher Hold: ${fmt(cashHoldForAudit)}, Bank Transfer: ${fmt(bankTransferAmount)}, Direct Petty: ${fmt(directPettyCash)}. Counted with: ${usher}`,state.user?.name);
    }

    // If some cash was given directly to the admin officer, auto-create a petty refill
    if(directPettyCash > 0){
      const pettyConfigSI = await DB.getPettyConfig();
      const newFloat = Math.min(pettyConfigSI.float + directPettyCash, pettyConfigSI.max);
      await DB.addPettyEntry({ type:'refill', amount:directPettyCash, source:'collection_cash',
        reference:`From Sunday collection ${fmtDate(date)}`, authorizedBy:state.user?.name,
        requestedBy:state.user?.name, status:'settled', createdAt:new Date().toISOString(),
        purpose:`Cash from Sunday collection (${fmtDate(date)}) → Admin Officer Petty Cash` });
      await DB.savePettyConfig({ float: newFloat, max: pettyConfigSI.max });
      DB.addAudit('petty_refilled',`${fmt(directPettyCash)} from Sunday collection credited to Admin Officer petty cash`,state.user?.name);
    }

    closeModal();
    if(saved?.merged){
      DB.addNotification('Added to Existing Collection',`${fmt(total)} added to the ${fmtDate(date)} Sunday collection — new total ${fmt(sundayTotal)}`,'success');
      showAlert(`Added ${fmt(total)} to the existing collection for ${fmtDate(date)}. New total: ${fmt(sundayTotal)}. Cash with accountant: ${fmt(cashWithAccountant)}${directPettyCash?` | Petty: ${fmt(directPettyCash)}`:''}`, 'success');
    } else {
      DB.addNotification('Income Recorded',`${fmt(total)} recorded for ${fmtDate(date)}${cashHoldForAudit?` | ${fmt(cashHoldForAudit)} → Children Refreshments`:''}${directPettyCash?` | ${fmt(directPettyCash)} → Petty Cash`:''}`,'success');
      showAlert(`Income of ${fmt(total)} recorded. Cash with accountant: ${fmt(cashWithAccountant)}${cashHoldForAudit?` | Children Teacher: ${fmt(cashHoldForAudit)}`:''}${bankTransferAmount?` | Bank: ${fmt(bankTransferAmount)}`:''}${directPettyCash?` | Petty: ${fmt(directPettyCash)}`:''}`, 'success');
    }
    renderIncome();
    buildSidebar();
  } catch(err) {
    restore();
    showAlert(`Failed to save income: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

async function viewIncome(id){
  const allIncVI = await DB.getIncome();
  const r=allIncVI.find(x=>x.id===id);
  if(!r) return;
  const isSunday = !r.source||r.source==='sunday_collection';
  const rem = isSunday ? await calcRemittances(r) : null;
  const remRates = (await getRemRates()).rates || DEFAULT_REMITTANCE_RATES;
  const btAmt = r.bankTransferAmount||0;
  const dpAmt = r.directPettyCash||0;
  const childrenTeacherHeld = isSunday ? getChildrenTeacherHeldCash(r, remRates) : 0;
  const cashHeld = getIncomeCashWithAccountant(r, remRates);
  const [allCashVI, allExpensesVI, allPettyVI, settingsVI, allRemsVI] = await Promise.all([DB.getCashTransactions(), DB.getExpenses(), DB.getPetty(), DB.getSettings(), DB.getRemittances()]);
  // Linked deposit records — shown verbatim in the "Deposit records:" footer so the
  // user can audit each physical deposit, even when the FIFO reallocates the cash
  // attribution across records.
  const deposits = allCashVI.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id);
  const rawLinkedDepositTotal = deposits.reduce((s,t)=>s+(t.amount||0),0);
  // Globally-reconciled per-record breakdown. depositedTotal/expenseCovering/stillPending
  // are the FIFO-effective values — they always sum across records to the global
  // cash balance, no matter how individual deposits or expenses were tagged.
  const expMapVI = buildExpenseCoveringMap(allIncVI, allCashVI, remRates, allExpensesVI, allPettyVI);
  const entryVI = expMapVI.get(r.id);
  const depositedTotal = entryVI ? entryVI.deposited : 0;
  const periodCashExpenses = entryVI ? entryVI.expenseCovering : 0;
  const netCashForBank = Math.max(0, cashHeld - periodCashExpenses);
  const stillWithAccountant = entryVI ? entryVI.stillPending : Math.max(0, netCashForBank - depositedTotal);
  // Only surface the deposit-correction warning when the user's raw linked deposit
  // entries themselves exceed cash held for this record — a data-entry error the
  // FIFO can't silently absorb. (Drift between raw linkage and FIFO attribution is
  // expected and handled automatically.)
  const depositOverage = Math.max(0, rawLinkedDepositTotal - cashHeld);
  // Resolve allocations into renderable line items: which actual expense / petty
  // records consumed cash from THIS Sunday's bucket. Lets the user see exactly
  // where the money went — not just a total.
  const expenseById = new Map((allExpensesVI||[]).map(e=>[e.id, e]));
  const pettyById = new Map((allPettyVI||[]).map(h=>[h.id, h]));
  const expAllocLines = (entryVI?.expenseAllocations||[])
    .map(a=>{ const e = expenseById.get(a.id); if(!e) return null;
      const cat = (typeof EXPENSE_CATS_ALL!=='undefined'?EXPENSE_CATS_ALL:[]).find(c=>c.key===e.category)||{label:e.category||'Expense',icon:''};
      return { icon:cat.icon||'💸', label:e.description||cat.label, date:e.date||e.createdAt, amount:a.amount };
    }).filter(Boolean).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const pettyAllocLines = (entryVI?.pettyAllocations||[])
    .map(a=>{ const h = pettyById.get(a.id); if(!h) return null;
      return { icon:'🏧', label:'Petty Cash Refill', date:h.date||h.createdAt, amount:a.amount };
    }).filter(Boolean).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const allOutflowLines = [...expAllocLines, ...pettyAllocLines].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const pettyAllocTotal = pettyAllocLines.reduce((s,l)=>s+(l.amount||0),0);
  const src = OTHER_INCOME_SOURCES.find(s=>s.key===r.source)||{label:r.source||'Sunday Collection'};

  // Compute per-Sunday share of fixed quotas for this income record's remittance period
  let perSundayQuotaLines = [];
  let viewIncQuotasTotal = 0;
  if (isSunday) {
    const recDateObj = parseYmdDate(r.date);
    if (recDateObj) {
      const { from: pFrom, to: pTo } = computeRemPeriodDates(settingsVI, allRemsVI, recDateObj.getFullYear(), recDateObj.getMonth());
      const totalSundays = countSundaysInRange(pFrom, pTo);
      if (totalSundays > 0) {
        const quotaList = getQuotaList(settingsVI);
        perSundayQuotaLines = quotaList
          .filter(q => (q.amount || 0) > 0)
          .map(q => ({ label: q.label, amount: (q.amount || 0) / totalSundays }));
      }
      viewIncQuotasTotal = perSundayQuotaLines.reduce((s, q) => s + q.amount, 0);
    }
  }
  const viewIncTrueNetLocal = (rem?.netLocal || 0) - viewIncQuotasTotal;

  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">Income Details — ${fmtDate(r.date)}</div>
    <div class="grid-2">
      <div><div class="amount-label">Total Collection</div><div class="amount-display">${fmt(r.totalCollection)}</div></div>
      <div><div class="amount-label">Source</div><div style="font-size:14px;font-weight:600;padding-top:8px">${isSunday?'Sunday Collection':src.label}</div></div>
    </div>
    <hr class="divider">
    <p class="card-title">Cash Breakdown</p>
    <div class="status-row"><div class="status-row-label">💵 Cash with Accountant</div><div class="status-row-amt" style="color:var(--amber)">${fmt(cashHeld)}</div></div>
    ${childrenTeacherHeld?`<div class="status-row"><div class="status-row-label">🧒 Children Teacher Hold (for refreshments)</div><div class="status-row-amt" style="color:var(--success)">${fmt(childrenTeacherHeld)}</div></div>`:''}
    ${btAmt?`<div class="status-row"><div class="status-row-label">🏦 Bank Transfer (already in bank)</div><div class="status-row-amt" style="color:var(--primary)">${fmt(btAmt)}</div></div>`:''}
    ${dpAmt?`<div class="status-row"><div class="status-row-label">💳 Direct → Admin Officer Petty Cash</div><div class="status-row-amt" style="color:var(--success)">${fmt(dpAmt)}</div></div>`:''}
    ${periodCashExpenses>0?`<div class="status-row" style="cursor:pointer" onclick="var d=this.nextElementSibling;d.style.display=d.style.display==='none'?'block':'none'"><div class="status-row-label">💸 Cash used for expenses (recorded in Expenses) <span style="font-size:9px;color:var(--text3)">▾</span></div><div class="status-row-amt" style="color:var(--danger)">−${fmt(periodCashExpenses)}</div></div>${expAllocLines.length?`<div style="display:none;padding:4px 8px 8px 18px;background:rgba(0,0,0,0.02);border-left:2px solid var(--border)">${expAllocLines.map(l=>`<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;color:var(--text2)"><span>${l.icon} ${l.label} <span style="color:var(--text3)">· ${fmtDate(l.date)}</span></span><span style="color:var(--danger);font-weight:600">−${fmt(l.amount)}</span></div>`).join('')}</div>`:''}`:''}
    ${pettyAllocTotal>0?`<div class="status-row" style="cursor:pointer" onclick="var d=this.nextElementSibling;d.style.display=d.style.display==='none'?'block':'none'"><div class="status-row-label">🏧 Petty cash top-ups from this cash <span style="font-size:9px;color:var(--text3)">▾</span></div><div class="status-row-amt" style="color:var(--danger)">−${fmt(pettyAllocTotal)}</div></div>${pettyAllocLines.length?`<div style="display:none;padding:4px 8px 8px 18px;background:rgba(0,0,0,0.02);border-left:2px solid var(--border)">${pettyAllocLines.map(l=>`<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;color:var(--text2)"><span>${l.icon} ${l.label} <span style="color:var(--text3)">· ${fmtDate(l.date)}</span></span><span style="color:var(--danger);font-weight:600">−${fmt(l.amount)}</span></div>`).join('')}</div>`:''}`:''}
    ${(periodCashExpenses>0||pettyAllocTotal>0)?`<div class="status-row" style="border-top:1px solid var(--border);padding-top:6px"><div class="status-row-label" style="font-weight:600">💰 Net cash for bank deposit</div><div class="status-row-amt" style="font-weight:700;color:var(--primary)">${fmt(Math.max(0, cashHeld - periodCashExpenses - pettyAllocTotal))}</div></div>`:''}
    ${(deposits.length||depositedTotal>0.5)?`<div class="status-row"><div class="status-row-label">✅ Deposited to Bank so far</div><div class="status-row-amt" style="color:var(--success)">${fmt(depositedTotal)}</div></div>`:''}
    ${rawLinkedDepositTotal>0.5 && Math.abs(rawLinkedDepositTotal-depositedTotal)>0.5?`<div class="status-row" style="font-size:11px;color:var(--text2)"><div class="status-row-label" style="font-style:italic">↳ Linked deposit records total ${fmt(rawLinkedDepositTotal)} — redistributed across periods to balance the cash pool.</div><div class="status-row-amt"></div></div>`:''}
    ${depositOverage>0.5?`<div class="status-row" style="flex-direction:column;align-items:flex-start;gap:6px"><div class="status-row-label" style="color:var(--danger);font-size:12px">⚠️ Linked deposit records (${fmt(rawLinkedDepositTotal)}) total ${fmt(depositOverage)} more than this record's cash with accountant (${fmt(cashHeld)}). Please verify and correct.</div>${canAction('income_deposit')?`<button class="btn btn-sm btn-danger" style="font-size:11px;padding:3px 10px" onclick="App.correctIncomeDeposit('${r.id}',${cashHeld})">Correct Deposit to ${fmt(cashHeld)}</button>`:''}</div>`:''}
    ${stillWithAccountant>0.5?`<div class="status-row"><div class="status-row-label">⏳ Still with Accountant (undeposited)</div><div class="status-row-amt" style="color:var(--danger)">${fmt(stillWithAccountant)}</div></div>`:''}
    ${isSunday?`<hr class="divider">
    <p class="card-title">Income Breakdown</p>
    ${INCOME_TYPES.filter(t=>r[t.key]).map(t=>`<div class="status-row"><div class="status-row-label">${t.label}</div><div class="status-row-amt">${fmt(r[t.key])}</div></div>`).join('')}
    <hr class="divider">
    <p class="card-title">Remittances Due</p>
    ${rem.lines.map(l=>`<div class="status-row"><div class="status-row-label">${l.label} → HQ</div><div class="status-row-amt td-red">${fmt(l.national||0)}</div></div>`).join('')}
    <div class="status-row"><div class="status-row-label">Province Rebate</div><div class="status-row-amt td-amber">${fmt(rem.provinceRebate)}</div></div>
    ${(rem.crmAddon||0)>0?`<div class="status-row"><div class="status-row-label">CRM Add-on → National HQ</div><div class="status-row-amt td-amber">${fmt(rem.crmAddon)}</div></div>`:''}
    ${(rem.coastline||0)>0?`<div class="status-row"><div class="status-row-label">Coastline Worship Centre</div><div class="status-row-amt td-amber">${fmt(rem.coastline)}</div></div>`:''}
    ${(rem.insuranceGen||0)>0?`<div class="status-row"><div class="status-row-label">Insurance Fund (GEN TITHE)</div><div class="status-row-amt td-amber">${fmt(rem.insuranceGen)}</div></div>`:''}
    ${(rem.insuranceMin||0)>0?`<div class="status-row"><div class="status-row-label">Insurance Fund (MIN TITHE)</div><div class="status-row-amt td-amber">${fmt(rem.insuranceMin)}</div></div>`:''}
    ${perSundayQuotaLines.map(q=>`<div class="status-row"><div class="status-row-label">${esc(q.label)}</div><div class="status-row-amt td-amber">${fmt(q.amount)}</div></div>`).join('')}
    <div class="status-row" style="border-top:2px solid var(--border)"><div class="status-row-label fw-bold">Net Local Retained</div><div class="status-row-amt td-green" style="font-size:15px">${fmt(viewIncTrueNetLocal)}</div></div>`:''}
    <hr class="divider">
    <div class="fs-12 text-muted">Recorded by: ${r.recordedBy||'—'} · ${isSunday?'Counted with: '+r.usher:'Donor: '+(r.donorName||'—')}</div>
    ${deposits.length?`<div style="margin-top:8px">${deposits.map(d=>`<div style="font-size:12px;color:var(--text2);padding:4px 0;border-bottom:1px solid var(--border-light,#f0f0f0)"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span>${fmt(d.amount)} via ${d.depositMethod?.replace('_',' ')||'—'} on ${fmtDate(d.date)}</span><span>${d.reference?'Ref: '+d.reference:''}</span>${depositVerificationBadge(d)} ${depositActionButtons(d)}</div>${d.aiNotes?`<div style="font-size:10px;color:var(--text3);margin-top:2px;padding-left:4px">${d.aiNotes}</div>`:''}</div>`).join('')}</div>`:''}
    <div class="modal-footer">
    ${canAction('income_delete')?`<button class="btn btn-danger" style="margin-right:auto" onclick="closeModal();App.confirmDeleteIncome('${r.id}')">🗑 Delete</button>`:''}
    <button class="btn" onclick="closeModal()">Close</button>
    ${canAction('income_deposit')&&stillWithAccountant>0.5?`<button class="btn btn-primary" onclick="App.confirmDeposit('${r.id}')">Record Cash Deposit</button>`:''}</div>`);
}

function confirmDeleteIncome(id){
  if(!canAction('income_delete')){ showAlert('Access denied.','danger'); return; }
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">🗑 Delete Income Record</div>
    <div class="alert alert-warn" style="margin-bottom:16px"><span class="alert-icon">⚠</span><span><strong>This is permanent.</strong> Deleting this record will also remove its remittance and cash deposit references from calculations. This cannot be undone.</span></div>
    <div class="form-group">
      <label class="form-label">Enter your IT Admin PIN to confirm</label>
      <input type="password" id="del_income_pin" class="form-input" maxlength="6" placeholder="••••••" inputmode="numeric"
        onkeydown="if(event.key==='Enter')App.submitDeleteIncome('${id}',document.getElementById('del_income_confirm_btn'))" />
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button id="del_income_confirm_btn" class="btn btn-danger" onclick="App.submitDeleteIncome('${id}',this)">Confirm Delete</button>
    </div>`);
  setTimeout(()=>document.getElementById('del_income_pin')?.focus(),100);
}

async function submitDeleteIncome(id, btn=null){
  if(!canAction('income_delete')){ showAlert('Access denied.','danger'); return; }
  const pin = document.getElementById('del_income_pin')?.value?.trim();
  if(!pin){ showAlert('Please enter your PIN.','danger'); return; }
  const restore = setBtnLoading(btn, 'Verifying…');
  try {
    await DB.login({ role:'it_admin', userId: state.user.id, pin });
  } catch(e){
    restore();
    const msg = String(e?.message||'');
    showAlert(msg.toLowerCase().includes('invalid credentials') ? 'Incorrect PIN. Please try again.' : 'PIN verification failed: '+msg, 'danger');
    document.getElementById('del_income_pin')?.select();
    return;
  }
  try {
    btn.innerHTML = '<span class="btn-spinner-sm"></span> Deleting…';
    await DB.deleteIncome(id);
    DB.addAudit('income_deleted', `Income record deleted: ${id}`, state.user?.name);
    DB.addNotification('Income Deleted', `Income record deleted by ${state.user?.name}`, 'warn');
    closeModal();
    showAlert('Income record deleted.', 'warn');
    renderIncome();
  } catch(err){
    restore();
    showAlert('Failed to delete: '+(err?.message||'Unknown error'), 'danger');
  }
}

// ── Photo compression for deposit receipts ──────────────────────
function compressPhoto(file, maxDim=1200, quality=0.75){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = ()=>{
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if(w > maxDim || h > maxDim){
          if(w > h){ h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = ()=> resolve(e.target.result); // fallback to original
      img.src = e.target.result;
    };
    reader.onerror = ()=> reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ── Background AI deposit verification (fire-and-forget) ────────
async function verifyDepositInBackground(txId, photoData, recordedAmount, attempt=1){
  const MAX_ATTEMPTS = 3;
  try {
    const resp = await fetch('/api/verify-deposit', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ transactionId:txId, photoData, recordedAmount }),
    });
    const result = await resp.json();
    if(result?.status === 'verified'){
      showAlert(`✅ Deposit verified! ${fmt(recordedAmount)} moved from cash with accountant → bank${result.aiRef?' — Ref: '+result.aiRef:''}`,'success');
      if(typeof renderIncome==='function') renderIncome();
    } else if(result?.status === 'flagged'){
      showAlert(`⚠️ Deposit flagged: receipt shows ${fmt(result.aiAmount||0)} but ${fmt(recordedAmount)} was recorded. Cash remains with accountant until resolved.`,'danger');
      DB.addNotification('Deposit Flagged','AI detected amount mismatch on a deposit. Cash remains with accountant. Please review.','warn');
    } else if(result?.status === 'pending' && result?.reason){
      console.warn('AI verification issue:', result.reason);
      showAlert(`Deposit recorded. AI verification failed — requires manual review.`,'warning');
      if(typeof renderIncome==='function') renderIncome();
    }
  } catch(e){
    console.warn(`Background verification attempt ${attempt}/${MAX_ATTEMPTS} failed:`, e.message);
    if(attempt < MAX_ATTEMPTS){
      // Retry after a delay (3s, then 6s)
      const delay = attempt * 3000;
      setTimeout(()=> verifyDepositInBackground(txId, photoData, recordedAmount, attempt+1), delay);
      return;
    }
    // All retries exhausted — leave as pending for manual review
    showAlert(`AI verification failed after ${MAX_ATTEMPTS} attempts. Deposit requires manual review.`,'warning');
    if(typeof renderIncome==='function') renderIncome();
  }
}

function _previewDepPhoto(input, previewId){
  const file = input.files?.[0];
  const preview = document.getElementById(previewId);
  if(!file||!preview) return;
  const reader = new FileReader();
  reader.onload = e => {
    preview.style.display = 'block';
    preview.querySelector('img').src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Reconcile the recorded "cash with accountant" balance with the physical cash
// the accountant actually holds today. Logs a single audited adjustment so the
// ledger matches reality without quietly editing other people's deposit or
// expense records. Gated behind IT admin PIN — this is a sensitive operation.
async function reconcileCashWithAccountant(){
  if(!canAction('income_deposit')){ showAlert('Access denied.','danger'); return; }
  const balance = await calcChurchBalance();
  const current = Math.round(balance.cashWithAccountant * 100) / 100;
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">⚖️ Reconcile Cash with Accountant</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>Log an audited adjustment that brings the ledger balance in line with the cash the accountant actually has in hand today. The variance is recorded as an explicit entry (positive or negative) so the audit trail stays intact.</span></div>
    <div class="form-group">
      <label class="form-label">Current Ledger Balance (Cash with Accountant)</label>
      <div style="font-size:22px;font-weight:700;color:${current>0.5?'var(--amber)':'var(--primary)'};padding:8px 0">${fmt(current)}</div>
    </div>
    <div class="form-group">
      <label class="form-label">Actual Cash Counted with Accountant Today *</label>
      <input type="number" id="recon_actual" class="form-input" value="0" min="0" step="0.01" autofocus />
      <div class="form-hint">Enter 0 if the accountant has no cash in hand right now.</div>
    </div>
    <div class="form-group">
      <label class="form-label">Reason for Variance *</label>
      <textarea id="recon_reason" class="form-input" rows="3" placeholder="e.g., Phantom ₦2,000 left over from a deposit correction reducing CTX-mqjifugsv0x9 (18 Jun) from ₦23,500 to ₦21,500."></textarea>
      <div class="form-hint">Be specific — this note shows up on every audit and report.</div>
    </div>
    <div class="form-group">
      <label class="form-label">IT Admin PIN *</label>
      <input type="password" id="recon_pin" class="form-input" maxlength="6" placeholder="••••••" inputmode="numeric" />
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitReconcileCash(this)">Confirm Adjustment</button>
    </div>`);
  setTimeout(()=>document.getElementById('recon_actual')?.focus(),100);
}

async function submitReconcileCash(btn){
  if(!canAction('income_deposit')){ showAlert('Access denied.','danger'); return; }
  const actual = parseFloat(document.getElementById('recon_actual')?.value);
  const reason = document.getElementById('recon_reason')?.value?.trim();
  const pin    = document.getElementById('recon_pin')?.value?.trim();
  if(isNaN(actual) || actual < 0){ showAlert('Enter the actual cash amount (0 or more).','danger'); return; }
  if(!reason || reason.length < 8){ showAlert('Please provide a reason of at least 8 characters.','danger'); return; }
  if(!pin){ showAlert('Please enter your IT Admin PIN.','danger'); return; }

  const restore = setBtnLoading(btn, 'Verifying…');
  try { await DB.login({ role:'it_admin', userId: state.user.id, pin }); }
  catch(e){
    restore();
    const msg = String(e?.message||'');
    showAlert(msg.toLowerCase().includes('invalid credentials') ? 'Incorrect PIN. Please try again.' : 'PIN verification failed: '+msg, 'danger');
    document.getElementById('recon_pin')?.select();
    return;
  }

  try {
    const balance = await calcChurchBalance();
    const current = Math.round(balance.cashWithAccountant * 100) / 100;
    const variance = Math.round((current - actual) * 100) / 100;  // >0: ledger over-reports, write off; <0: ledger under-reports, top up
    if(Math.abs(variance) < 0.5){
      restore();
      showAlert('Ledger already matches the actual cash. No adjustment needed.','info');
      return;
    }
    btn.innerHTML = '<span class="btn-spinner-sm"></span> Saving…';
    const today = new Date().toISOString().split('T')[0];
    if(variance > 0){
      // Ledger says more cash than reality. Write off as a cash expense in the
      // dedicated reconciliation category — keeps the ledger arithmetic clean
      // and shows up alongside other expenses with a clear label.
      const expenseId = 'EXP-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await DB.addExpense({
        id: expenseId, date,
        category: 'reconciliation', subCategory: 'Cash Variance Write-off',
        description: 'Cash reconciliation — variance write-off',
        amount: variance, paymentMethod: 'cash', cashAmount: variance, bankAmount: 0,
        incomeRef: '', recordedBy: state.user?.name,
        status: 'approved', approvedBy: state.user?.name,
        notes: reason,
      });
    } else {
      // Ledger says less cash than reality — log as a bank→accountant withdrawal
      // (untagged inflow). The amount is the missing cash; the destination flag
      // means it counts as cash IN to the accountant's pool.
      await DB.addCashTransaction({
        type: 'withdrawal', date, amount: -variance,
        destination: 'accountant_cash',
        description: 'Cash reconciliation — variance top-up',
        reference: '', authorizedBy: state.user?.name, recordedBy: state.user?.name,
        notes: reason,
      });
    }
    DB.addAudit('cash_reconciled', `Cash with accountant reconciled: ${fmt(current)} → ${fmt(actual)} (variance ${variance>0?'−':'+'}${fmt(Math.abs(variance))}). Reason: ${reason}`, state.user?.name);
    DB.addNotification('Cash Reconciled', `Cash with accountant adjusted by ${variance>0?'−':'+'}${fmt(Math.abs(variance))} by ${state.user?.name}`, variance>0?'warn':'success');
    _apiCache.delete('expenses'); _apiCache.delete('cash-transactions');
    closeModal();
    showAlert(`Cash with accountant reconciled to ${fmt(actual)}.`,'success');
    renderIncome();
  } catch(err){
    restore();
    showAlert(`Failed to reconcile: ${err.message||'Unknown error'}`,'danger');
  }
}

async function correctIncomeDeposit(incomeId, targetTotal) {
  if(!canAction('income_deposit')){ showAlert('Access denied.','danger'); return; }
  const allCash = await DB.getCashTransactions();
  const linked = allCash
    .filter(t=>t.type==='cash_deposit' && t.incomeRef===incomeId)
    .sort((a,b)=>new Date(b.date||b.createdAt)-new Date(a.date||a.createdAt));
  const currentTotal = linked.reduce((s,t)=>s+(t.amount||0),0);
  if(currentTotal <= targetTotal+0.5){
    showAlert('Deposit total is already at or below the correct amount.','info'); return;
  }
  let overage = currentTotal - targetTotal;
  const updates=[];
  for(const dep of linked){
    if(overage < 0.005) break;
    const reduce = Math.min(dep.amount, overage);
    updates.push({ id:dep.id, newAmt: Math.round((dep.amount - reduce)*100)/100 });
    overage -= reduce;
  }
  if(overage > 0.005){ showAlert('Cannot fully correct — not enough deposit records to adjust.','danger'); return; }
  const lines = updates.map(u=>`• ${u.id}: new amount ${fmt(u.newAmt)}`).join('\n');
  if(!confirm(`This will adjust ${updates.length} deposit record(s) to correct the total from ${fmt(currentTotal)} to ${fmt(targetTotal)}:\n\n${lines}\n\nContinue?`)) return;
  try{
    for(const u of updates) await DB.updateCashTransaction(u.id,{amount:u.newAmt});
    DB.addAudit('deposit_corrected',`Deposit for income ${incomeId} corrected: ${fmt(currentTotal)} → ${fmt(targetTotal)} (overage ${fmt(currentTotal-targetTotal)} removed)`,state.user?.name);
    _apiCache.delete('cash-transactions');
    showAlert(`Deposit corrected to ${fmt(targetTotal)}.`,'success');
    await viewIncome(incomeId);
  }catch(err){
    showAlert(`Failed to correct deposit: ${err.message}`,'danger');
  }
}

async function confirmDeposit(id){
  if(!canAction('income_deposit')){ showAlert('You do not have permission to record deposits.','danger'); return; }
  const [allIncCD, allCashCD, remRatesData, balance, allExpensesCD, allPettyCD] = await Promise.all([DB.getIncome(), DB.getCashTransactions(), getRemRates(), calcChurchBalance(), DB.getExpenses(), DB.getPetty()]);
  const r = allIncCD.find(x=>x.id===id);
  if(!r) return;
  const remRates = remRatesData.rates || DEFAULT_REMITTANCE_RATES;
  const childrenTeacherHeld = getChildrenTeacherHeldCash(r, remRates);
  const cashHeld = getIncomeCashWithAccountant(r, remRates);
  const alreadyDeposited = allCashCD.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
  const remaining = Math.max(0, cashHeld - alreadyDeposited);
  const totalCashWithAccountant = balance.cashWithAccountant;
  // Use the same FIFO attribution as the income detail modal and list badges so the
  // pre-filled amount matches "Still with Accountant" exactly. Cash expenses already
  // recorded in the Expenses section reduce this record's depositable cash (oldest
  // records absorb expenses first), and the per-record figures always sum to the
  // global cashWithAccountant.
  const expMapCD = buildExpenseCoveringMap(allIncCD, allCashCD, remRates, allExpensesCD, allPettyCD);
  const entryCD = expMapCD.get(r.id);
  const effectiveRemaining = entryCD ? entryCD.stillPending : remaining;
  const expensesDeducted = entryCD ? entryCD.expenseCovering : 0;
  const otherCash = Math.max(0, totalCashWithAccountant - effectiveRemaining);
  const today = new Date().toISOString().split('T')[0];
  state._depositRemaining = effectiveRemaining;
  closeModal();
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">💰 Record Cash Deposit — ${fmtDate(r.date)}</div>
    ${totalCashWithAccountant > 0 ? `
    <div style="background:var(--primary-light);border:1.5px solid var(--primary);border-radius:8px;padding:12px 14px;margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Your Total Cash with Accountant</div>
      <div style="font-size:22px;font-weight:800;color:var(--primary);line-height:1;margin-bottom:8px">${fmt(totalCashWithAccountant)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:13px">
        <span style="color:var(--text2)">This record: <strong style="color:var(--text)">${fmt(effectiveRemaining)}</strong></span>
        ${otherCash > 0.5 ? `<span style="color:var(--text2)">Other cash held: <strong style="color:var(--text)">${fmt(otherCash)}</strong></span>` : `<span style="color:var(--success,#2e7d32);font-size:12px;font-weight:600">✓ Only pending record</span>`}
      </div>
      ${otherCash > 0.5 ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,0,0,.1);font-size:12px;color:var(--text2)">This form deposits cash from this record only. To deposit all your cash in one trip: <button class="btn btn-sm" onclick="closeModal();App.confirmBulkDeposit()" style="margin-left:4px;font-size:11px;padding:2px 8px">Deposit All Cash (${fmt(totalCashWithAccountant)}) →</button></div>` : ''}
    </div>` : ''}
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>Record when you physically deposit the cash collected into the church bank account.</span></div>
    <div class="form-group"><label class="form-label">Cash Available from this Record</label>
      <div style="font-size:20px;font-weight:700;color:var(--primary);padding:8px 0">${fmt(effectiveRemaining)}</div>
      ${alreadyDeposited?`<div class="form-hint">${fmt(alreadyDeposited)} already deposited previously from this record.</div>`:''}
      ${expensesDeducted>0?`<div class="form-hint" style="color:var(--danger)">💸 ${fmt(expensesDeducted)} deducted — cash expenses already recorded in the Expenses section.</div>`:''}
      ${childrenTeacherHeld?`<div class="form-hint">Children Teacher hold (${fmt(childrenTeacherHeld)}) is excluded from bank deposits.</div>`:''}
    </div>
    <div class="form-group"><label class="form-label">Amount Deposited *</label>
      <input type="number" id="dep_amount" class="form-input" value="${effectiveRemaining}" min="0" max="${effectiveRemaining}" />
    </div>
    <div class="form-group"><label class="form-label">Deposit Method *</label>
      <select id="dep_method" class="form-select">
        <option value="bank_teller">Bank Cash Teller</option>
        <option value="pos_terminal">POS Terminal</option>
        <option value="mobile_transfer">Mobile / Internet Banking Transfer</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Photo of Deposit Slip / Receipt <span style="color:var(--danger)">*</span></label>
      <div style="font-size:11px;color:var(--text2);margin-bottom:8px">Upload a clear photo of the deposit slip, POS receipt, or transfer confirmation. AI will verify the amount and extract the teller/reference number automatically.</div>
      <input type="file" id="dep_photo" accept="image/*" class="form-input" style="padding:6px" onchange="App._previewDepPhoto(this,'dep_photo_preview')" />
      <div id="dep_photo_preview" style="margin-top:6px;display:none"><img style="max-width:100%;max-height:150px;border-radius:6px;border:1px solid var(--border)" /></div>
    </div>
    <input type="hidden" id="dep_ref" value="" />
    <div class="form-group"><label class="form-label">Date of Deposit *</label>
      <input type="date" id="dep_date" class="form-input" value="${today}" max="${today}" />
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitCashDeposit('${id}', this)">Confirm Deposit</button>
    </div>`);
}

async function submitCashDeposit(incomeId, btn=null){
  if(!canAction('income_deposit')){ showAlert('You do not have permission to record deposits.','danger'); return; }
  const amount  = parseFloat(document.getElementById('dep_amount')?.value)||0;
  const method  = document.getElementById('dep_method')?.value;
  const ref     = document.getElementById('dep_ref')?.value?.trim();
  const date    = document.getElementById('dep_date')?.value;
  const photoFile = document.getElementById('dep_photo')?.files?.[0];
  if(!amount||!date){ showAlert('Please fill all required fields.','danger'); return; }
  if(!photoFile){ showAlert('Please upload a photo of the deposit slip or receipt. This is required for AI verification.','danger'); return; }
  const maxDeposit = state._depositRemaining ?? Infinity;
  if(amount > maxDeposit + 0.5){
    showAlert(`Deposit amount (${fmt(amount)}) exceeds the cash available for this record (${fmt(maxDeposit)}). Please enter a correct amount.`,'danger');
    return;
  }
  const restore = setBtnLoading(btn, 'Saving…');
  try {
    let photoData = '';
    if(photoFile){
      photoData = await compressPhoto(photoFile, 1200, 0.75);
    }
    const saved = await DB.addCashTransaction({ type:'cash_deposit', incomeRef:incomeId, amount, depositMethod:method, reference:ref||'', photoData, date, recordedBy:state.user?.name, verificationStatus:'pending' });
    const refLabel = ref || (photoData ? '(photo uploaded)' : '—');
    DB.addAudit('cash_deposited',`Cash deposit: ${fmt(amount)} via ${method?.replace(/_/g,' ')||'—'} — Ref: ${refLabel}`,state.user?.name);
    DB.addNotification('Cash Deposited',`${fmt(amount)} deposited to bank${ref?` (Ref: ${ref})`:''}`,'success');
    closeModal();
    showAlert(`${fmt(amount)} deposit recorded — ⏳ AI is verifying the receipt on the server. Cash will move to bank once verified.`, 'info');
    renderIncome();
  } catch(err) {
    restore();
    showAlert(`Failed to record deposit: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

async function confirmBulkDeposit(){
  if(!canAction('income_deposit')){ showAlert('You do not have permission to record deposits.','danger'); return; }
  const [allIncome, allCashTx, remRatesData, allExpenses, pettyHistory, balance] = await Promise.all([
    DB.getIncome(), DB.getCashTransactions(), getRemRates(), DB.getExpenses(), DB.getPetty(), calcChurchBalance()
  ]);
  const remRates = remRatesData.rates || DEFAULT_REMITTANCE_RATES;
  const cashWithAccountant = balance.cashWithAccountant;

  if(cashWithAccountant < 0.5){ showAlert('No cash currently held with accountant to deposit.','warn'); return; }

  // Income records with remaining cash (positive contributors) — use expense-adjusted
  // stillPending so records fully consumed by dated expenses are excluded from display.
  const expMapCBD = buildExpenseCoveringMap(allIncome, allCashTx, remRates, allExpenses, pettyHistory);
  const incomeItems = allIncome.map(r=>{
    const isSunday = !r.source||r.source==='sunday_collection';
    const cashHeld = getIncomeCashWithAccountant(r, remRates);
    if(cashHeld<=0) return null;
    const deposited = allCashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
    const entry = expMapCBD.get(r.id);
    const remaining = entry ? entry.stillPending : Math.max(0, cashHeld - deposited);
    if(remaining<=0.005) return null;
    const srcLabel = isSunday ? 'Sunday Collection' : (OTHER_INCOME_SOURCES.find(s=>s.key===r.source)||{label:r.source||'Other'}).label;
    const icon = isSunday ? '📅' : '💵';
    return { id:r.id, date:r.date||r.createdAt, icon, label:srcLabel, cashHeld, deposited, remaining };
  }).filter(Boolean).sort((a,b)=>new Date(a.date)-new Date(b.date));

  // Bank withdrawals routed to accountant's cash (positive)
  const bankToAccountantItems = allCashTx
    .filter(t=>t.type==='withdrawal'&&t.destination==='accountant_cash')
    .sort((a,b)=>new Date(a.date||a.createdAt)-new Date(b.date||b.createdAt));

  // Cash expenses (approved + pending — all are actual payments already made)
  const cashExpenseItems = allExpenses
    .filter(e=>isLoggedExpense(e)&&(e.paymentMethod==='cash'||(e.paymentMethod==='split'&&(e.cashAmount||0)>0)))
    .sort((a,b)=>new Date(a.date||a.createdAt)-new Date(b.date||b.createdAt));

  // Petty cash top-ups paid from accountant's cash (negative)
  const pettyTopupItems = pettyHistory
    .filter(h=>h.type==='refill'&&(h.status==='approved'||h.status==='settled')&&(h.paymentMethod==='cash_accountant'||(h.paymentMethod==='split'&&(h.cashAmount||0)>0)))
    .sort((a,b)=>new Date(a.date||a.createdAt)-new Date(b.date||b.createdAt));

  // Store for submit
  state._bulkDepositPending  = incomeItems;
  state._bulkDepositCashBalance = cashWithAccountant;

  const today = new Date().toISOString().split('T')[0];

  // Build a single expandable row
  function cwRow(icon, label, dateStr, amount, isPositive, detail){
    const color  = isPositive ? 'var(--success,#2e7d32)' : 'var(--danger)';
    const sign   = isPositive ? '+' : '−';
    return `<div onclick="var d=this.querySelector('.cw-det');d.style.display=d.style.display==='none'?'block':'none'" style="cursor:pointer;border-bottom:1px solid var(--border-light,#f0f0f0)">
      <div style="display:flex;align-items:center;gap:8px;padding:9px 0">
        <span style="font-size:15px;flex-shrink:0;width:22px;text-align:center">${icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</div>
          <div style="font-size:11px;color:var(--text3)">${fmtDate(dateStr)}</div>
        </div>
        <div style="font-size:13px;font-weight:700;color:${color};flex-shrink:0;margin-left:4px">${sign}${fmt(amount)}</div>
        <span style="font-size:9px;color:var(--text3);flex-shrink:0">▾</span>
      </div>
      <div class="cw-det" style="display:none;padding:2px 30px 9px;font-size:11px;color:var(--text2);line-height:1.6">${detail}</div>
    </div>`;
  }

  const hasIncome  = incomeItems.length > 0;
  const hasBank    = bankToAccountantItems.length > 0;
  const hasExp     = cashExpenseItems.length > 0;
  const hasPetty   = pettyTopupItems.length > 0;

  // Per-income-record breakdown showing FIFO attribution
  const incomeHtml = incomeItems.length > 0 ? incomeItems.map(item => {
    const entry = expMapCBD.get(item.id);
    const cashHeld = item.cashHeld || 0;
    const deposited = entry ? entry.deposited : 0;
    const expensed = entry ? entry.expenseCovering : 0;
    const pettyUsed = entry ? (entry.pettyAllocations||[]).reduce((s,a)=>s+(a.amount||0),0) : 0;
    const remaining = item.remaining || 0;
    return `<div style="border-bottom:1px solid var(--border-light,#f0f0f0);padding:10px 0">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:15px">${item.icon||'📥'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.label}</div>
          <div style="font-size:11px;color:var(--text3)">${fmtDate(item.date)}</div>
        </div>
        <div style="font-size:14px;font-weight:700;color:var(--primary)">${fmt(remaining)}</div>
      </div>
      <div style="padding-left:30px;font-size:11px;color:var(--text2);line-height:2">
        <div style="display:flex;justify-content:space-between"><span>Cash received</span><span style="font-weight:600">${fmt(cashHeld)}</span></div>
        ${expensed>0?`<div style="display:flex;justify-content:space-between"><span>Less: expenses from this cash</span><span style="color:var(--danger)">−${fmt(expensed)}</span></div>`:''}
        ${deposited>0?`<div style="display:flex;justify-content:space-between"><span>Less: already deposited</span><span style="color:var(--danger)">−${fmt(deposited)}</span></div>`:''}
        ${pettyUsed>0?`<div style="display:flex;justify-content:space-between"><span>Less: petty cash top-ups</span><span style="color:var(--danger)">−${fmt(pettyUsed)}</span></div>`:''}
        <div style="display:flex;justify-content:space-between;border-top:1px dashed var(--border);padding-top:3px;margin-top:2px"><span style="font-weight:700">Available for deposit</span><span style="font-weight:700;color:var(--primary)">${fmt(remaining)}</span></div>
      </div>
    </div>`;
  }).join('') : '<div style="padding:12px;font-size:12px;color:var(--text3);text-align:center">No cash income pending deposit.</div>';

  const bankHtml = bankToAccountantItems.length > 0 ? `
    <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;padding:10px 0 2px">🏦 Bank Withdrawals to Accountant</div>
    ${bankToAccountantItems.map(t=>`<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px;border-bottom:1px solid var(--border-light,#f0f0f0)"><span>${t.description||'Bank Withdrawal'} (${fmtDate(t.date||t.createdAt)})</span><span style="font-weight:600;color:var(--success)">+${fmt(t.amount||0)}</span></div>`).join('')}` : '';

  const expHtml = '';
  const pettyHtml = '';

  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">💰 Record Cash Deposit</div>
    <div style="background:var(--primary-light);border:1.5px solid var(--primary);border-radius:8px;padding:12px 14px;margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">Cash with Accountant — Full Balance</div>
      <div style="font-size:22px;font-weight:800;color:var(--primary);line-height:1">${fmt(cashWithAccountant)}</div>
      <div style="font-size:12px;color:var(--text2);margin-top:4px">This is the exact amount you will deposit to the bank.</div>
    </div>
    <details open style="margin-bottom:16px">
      <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;font-size:12px;font-weight:600;color:var(--text2);user-select:none">
        <span>📋</span><span>How is this amount calculated?</span><span style="margin-left:auto;font-size:11px;color:var(--text3)">Tap to collapse ▴</span>
      </summary>
      <div style="border:1px solid var(--border);border-top:none;border-radius:0 0 8px 8px;padding:0 12px;max-height:300px;overflow-y:auto">
        ${incomeHtml}${bankHtml}${expHtml}${pettyHtml}
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:2px solid var(--border);margin-top:6px">
          <span style="font-size:13px;font-weight:700">Net Cash to Deposit</span>
          <span style="font-size:17px;font-weight:800;color:var(--primary)">${fmt(cashWithAccountant)}</span>
        </div>
      </div>
    </details>
    <div class="form-group"><label class="form-label">Deposit Method *</label>
      <select id="bulk_dep_method" class="form-select">
        <option value="bank_teller">Bank Cash Teller</option>
        <option value="pos_terminal">POS Terminal</option>
        <option value="mobile_transfer">Mobile / Internet Banking Transfer</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Photo of Deposit Slip / Receipt <span style="color:var(--danger)">*</span></label>
      <div style="font-size:11px;color:var(--text2);margin-bottom:8px">Upload a clear photo of the deposit slip. AI will verify the amount and extract the teller/reference number automatically.</div>
      <input type="file" id="bulk_dep_photo" accept="image/*" class="form-input" style="padding:6px" onchange="App._previewDepPhoto(this,'bulk_dep_photo_preview')" />
      <div id="bulk_dep_photo_preview" style="margin-top:6px;display:none"><img style="max-width:100%;max-height:150px;border-radius:6px;border:1px solid var(--border)" /></div>
    </div>
    <input type="hidden" id="bulk_dep_ref" value="" />
    <div class="form-group"><label class="form-label">Date of Deposit *</label>
      <input type="date" id="bulk_dep_date" class="form-input" value="${today}" max="${today}" />
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="bulk_confirm_btn" onclick="App.submitBulkDeposit(this)">Confirm Deposit — ${fmt(cashWithAccountant)}</button>
    </div>`);
}


async function submitBulkDeposit(btn=null){
  if(!canAction('income_deposit')){ showAlert('You do not have permission to record deposits.','danger'); return; }
  if(state._bulkDepositInProgress){ showAlert('Deposit is already being processed. Please wait.','warn'); return; }
  const method    = document.getElementById('bulk_dep_method')?.value;
  const ref       = document.getElementById('bulk_dep_ref')?.value?.trim();
  const date      = document.getElementById('bulk_dep_date')?.value;
  const photoFile = document.getElementById('bulk_dep_photo')?.files?.[0];
  if(!date){ showAlert('Please enter the deposit date.','danger'); return; }
  if(!photoFile){ showAlert('Please upload a photo of the deposit slip or receipt. This is required for AI verification.','danger'); return; }
  const cashToDeposit = state._bulkDepositCashBalance || 0;
  if(cashToDeposit < 0.5){ showAlert('No cash to deposit.','warn'); return; }
  state._bulkDepositInProgress = true;
  const restore = setBtnLoading(btn, 'Saving…');
  try {
    let photoData = '';
    if(photoFile){
      photoData = await compressPhoto(photoFile, 1200, 0.75);
    }
    // Re-fetch fresh data to build accurate income-record distribution
    const [allIncome, allCashTx, remRatesData, allExpensesSD, allPettySD] = await Promise.all([DB.getIncome(), DB.getCashTransactions(), getRemRates(), DB.getExpenses(), DB.getPetty()]);
    const remRates = remRatesData.rates || DEFAULT_REMITTANCE_RATES;
    // Use the same date-aware FIFO expense map so deposit goes to records whose
    // net cash (after expense attribution) still needs to be deposited, not to
    // records that have already been consumed by attributed cash expenses.
    const expMapSD = buildExpenseCoveringMap(allIncome, allCashTx, remRates, allExpensesSD, allPettySD);
    const incomeItems = allIncome.map(r=>{
      const cashHeld = getIncomeCashWithAccountant(r, remRates);
      if(!cashHeld) return null;
      const entry = expMapSD.get(r.id);
      const dep = allCashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
      const remaining = entry ? entry.stillPending : Math.max(0, cashHeld - dep);
      return { id:r.id, date:r.date, remaining };
    }).filter(x=>x&&x.remaining>0.005).sort((a,b)=>new Date(a.date)-new Date(b.date));

    // Distribute cashToDeposit across income records sequentially (oldest first).
    // Stops when cashToDeposit is exhausted — this correctly handles cases where
    // cash expenses / petty top-ups have already consumed part of the balance.
    // All split records share the same groupId so they display as one transaction.
    const groupId = 'BDG-' + uid() + Math.random().toString(36).slice(2);
    let amountLeft = cashToDeposit;
    let recordCount = 0;
    for(const item of incomeItems){
      if(amountLeft < 0.5) break;
      const depositAmt = Math.min(item.remaining, amountLeft);
      await DB.addCashTransaction({ type:'cash_deposit', incomeRef:item.id, amount:depositAmt, depositMethod:method, reference:ref||'', photoData, date, recordedBy:state.user?.name, groupId, verificationStatus:'pending' });
      amountLeft -= depositAmt;
      recordCount++;
    }
    // Any remainder comes from bank-withdrawal funds not tied to income records
    if(amountLeft > 0.5){
      await DB.addCashTransaction({ type:'cash_deposit', incomeRef:'', amount:amountLeft, depositMethod:method, reference:ref||'', photoData, date, recordedBy:state.user?.name, description:'Cash deposit (bank withdrawal funds)', groupId, verificationStatus:'pending' });
      recordCount++;
    }
    const refLabel = ref || (photoData ? '(photo uploaded)' : '—');
    DB.addAudit('cash_deposited',`Cash deposit: ${fmt(cashToDeposit)} via ${method?.replace(/_/g,' ')||'—'} — Ref: ${refLabel}`,state.user?.name);
    DB.addNotification('Cash Deposited',`${fmt(cashToDeposit)} deposited to bank${ref?` (Ref: ${ref})`:''}`,'success');
    delete state._bulkDepositPending;
    delete state._bulkDepositCashBalance;
    delete state._bulkDepositInProgress;
    closeModal();
    showAlert(`${fmt(cashToDeposit)} deposit recorded — ⏳ AI is verifying the receipt on the server. Cash will move to bank once verified.`, 'info');
    if(state.page==='bank') renderBank(); else renderIncome();
    // Trigger ONE group verification for the entire bulk deposit
    if(photoData && groupId){
      fetch('/api/verify-deposit', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ groupId, photoData, recordedAmount:cashToDeposit, depositDate:date }),
      }).then(r=>r.json()).then(result=>{
        if(result?.status==='verified') showAlert(`✅ Bulk deposit verified! ${fmt(cashToDeposit)} moved to bank.`,'success');
        else if(result?.status==='flagged') showAlert(`⚠️ Bulk deposit flagged. Please check the deposit details.`,'danger');
        if(state.page==='bank') renderBank(); else renderIncome();
      }).catch(()=>{
        showAlert('AI verification request failed. Deposits remain pending — you can retry or manually approve.','warning');
      });
    }
  } catch(err) {
    delete state._bulkDepositInProgress;
    restore();
    showAlert(`Failed to record deposit: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

function showOtherIncomeForm(){
  if(!canAction('income_record')){ showAlert('You do not have permission to record income.','danger'); return; }
  const today = new Date().toISOString().split('T')[0];
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">➕ Record Other Income</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>Use this for income outside regular Sunday collections — individual donations, midweek offerings, seeds, transfers, etc.</span></div>
    <div class="form-group"><label class="form-label">Date *</label>
      <input type="date" id="oi_date" class="form-input" value="${today}" max="${today}" />
    </div>
    <div class="form-group"><label class="form-label">Income Source Type *</label>
      <select id="oi_source" class="form-select">
        <option value="">— Select source —</option>
        ${OTHER_INCOME_SOURCES.map(s=>`<option value="${s.key}">${s.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label class="form-label">Donor / Source Name (optional)</label>
      <input type="text" id="oi_donor" class="form-input" placeholder="Name of donor, member, or programme" />
    </div>
    <div class="form-group"><label class="form-label">Which income category does this belong to?</label>
      <select id="oi_category" class="form-select">
        <option value="local_only">Local Church Use Only (donation, etc.)</option>
        ${INCOME_TYPES.map(t=>`<option value="${t.key}">${t.label} (affects remittance split)</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label class="form-label">Amount (₦) *</label>
      <input type="number" id="oi_amount" class="form-input" placeholder="0" min="0" />
    </div>
    <div class="form-group"><label class="form-label">Payment Method *</label>
      <select id="oi_method" class="form-select">
        <option value="cash">Cash (received by accountant)</option>
        <option value="bank_transfer">Bank Transfer (already in church account)</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Notes (optional)</label>
      <textarea id="oi_notes" class="form-textarea" placeholder="Additional details, event name, etc."></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitOtherIncome(this)">Save Income</button>
    </div>`);
}

async function submitOtherIncome(btn=null){
  if(!canAction('income_record')){ showAlert('You do not have permission to record income.','danger'); return; }
  const date       = document.getElementById('oi_date')?.value;
  const source     = document.getElementById('oi_source')?.value;
  const donorName  = document.getElementById('oi_donor')?.value?.trim();
  const category   = document.getElementById('oi_category')?.value;
  const amount     = Math.round((parseFloat(document.getElementById('oi_amount')?.value)||0) * 100) / 100;
  const method     = document.getElementById('oi_method')?.value;
  const notes      = document.getElementById('oi_notes')?.value||'';
  if(!date||!source){ showAlert('Please select a date and source type.','danger'); return }
  if(!amount){ showAlert('Please enter an amount.','danger'); return }
  if(!method){ showAlert('Please select a payment method.','danger'); return }

  // Build a record compatible with the income structure
  const rec = {
    date, source, donorName, notes, recordedBy:state.user?.name,
    paymentMethod: method,
    totalCollection: amount,
    bankTransferAmount: method==='bank_transfer' ? amount : 0,
    directPettyCash: 0,
    depositConfirmed: method==='bank_transfer'
  };
  // Map income category to the right income type field if applicable (drives remittance splits)
  if(category && category !== 'local_only'){
    rec[category] = amount;
  }
  // local_only donations have no remittance split; they appear in income totals but not in remittance calculations

  const restore = setBtnLoading(btn, 'Saving…');
  try {
    await DB.addIncome(rec);
    const sourceLabel = OTHER_INCOME_SOURCES.find(s=>s.key===source)?.label || source;
    DB.addAudit('income_recorded',`Other income ${fmt(amount)} (${sourceLabel}) via ${method.replace(/_/g,' ')} from ${donorName||'unnamed donor'} on ${fmtDate(date)}`,state.user?.name);
    DB.addNotification('Other Income Recorded',`${fmt(amount)} recorded (${sourceLabel}) from ${donorName||'unnamed'}`,'success');
    closeModal();
    showAlert(`${fmt(amount)} recorded as ${sourceLabel}. Method: ${method.replace(/_/g,' ')}.`,'success');
    renderIncome();
    buildSidebar();
  } catch(err) {
    restore();
    showAlert(`Failed to save income: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

// ── REMITTANCES ───────────────────────────
// ── REMITTANCE CUT-OFF DATES ──────────────────────────────────────
const REM_MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

function getRemCutoffDates(settings, year=null){
  // Returns {year, dates} where dates is an array of 12 day-numbers (1-31), else null
  const targetYear = Number.isInteger(Number(year)) ? Number(year) : null;
  const byYear = settings?.remCutoffDatesByYear;
  if(targetYear && byYear && typeof byYear==='object'){
    const fromYear = byYear[targetYear];
    if(Array.isArray(fromYear) && fromYear.length===12) return { year: targetYear, dates: fromYear };
  }
  const saved = settings?.remCutoffDates;
  if(saved && Array.isArray(saved.dates) && saved.dates.length===12){
    const savedYear = Number(saved.year);
    if(!targetYear || savedYear===targetYear) return { year: savedYear, dates: saved.dates };
  }
  return null;
}

function remCutoffDayForMonth(settings, monthIdx){
  // monthIdx 0-11. Returns the cut-off day number or null.
  const c = getRemCutoffDates(settings);
  if(!c) return null;
  return c.dates[monthIdx] || null;
}

function getRemittanceDueLabel(settings, year=state.year, month=state.month, { isPaid=false, isPartial=false, paidAmount=0 }={}){
  // Payment takes priority over any countdown
  if(isPaid) return `✅ Paid for this period`;
  if(isPartial) return `⏳ Partially paid — ${fmt(paidAmount)} paid for this period`;

  const cutoffConfig = getRemCutoffDates(settings, year);
  const cutoffYear = cutoffConfig ? Number(cutoffConfig.year) : null;
  const cutoffDay = (cutoffConfig && cutoffYear === year && Number.isInteger(cutoffConfig.dates[month]))
    ? cutoffConfig.dates[month]
    : null;
  if(!cutoffDay) return `Due date not set for ${MONTHS[month]}`;

  const dueDate = new Date(year, month, cutoffDay);
  if(isNaN(dueDate.getTime())) return 'Due date not set';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const dayDiff = Math.round((due - today) / 86400000);

  if(dayDiff === 0) return `Due today (${fmtDate(due)})`;
  if(dayDiff < 0) return `Cut-off passed ${Math.abs(dayDiff)} day${Math.abs(dayDiff)!==1?'s':''} ago (${fmtDate(due)})`;

  if(due.getDay() === 0){
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if(start.getDay() === 0) start.setDate(start.getDate() + 1); // exclude current Sunday from "next Sundays"
    const sundays = countSundaysBetween(start, due);
    if(sundays > 0) return `Due in next ${sundays} Sunday${sundays!==1?'s':''} (${fmtDate(due)})`;
  }
  return `Due in ${dayDiff} day${dayDiff!==1?'s':''} (${fmtDate(due)})`;
}

function canEditRemCutoff(){
  return can('rem_cutoff_edit');
}

function getOrdinalSuffix(day){
  // Used only for calendar day values (1-31)
  const d = Number(day);
  if(!Number.isInteger(d)) return '';
  const mod100 = d % 100;
  if(mod100 >= 11 && mod100 <= 13) return 'th';
  const mod10 = d % 10;
  if(mod10 === 1) return 'st';
  if(mod10 === 2) return 'nd';
  if(mod10 === 3) return 'rd';
  return 'th';
}

function renderRemCutoffCard(settings){
  const c = getRemCutoffDates(settings, state.year) || getRemCutoffDates(settings);
  const now = new Date();
  const curMonth = now.getMonth(); // 0-11
  const curYear = now.getFullYear();
  const startOfToday = new Date(curYear, curMonth, now.getDate());

  const isOpen = !!state.remCutoffOpen;
  const chevron = isOpen ? '▲' : '▼';
  const editBtn = canEditRemCutoff()
    ? `<button class="btn btn-sm" onclick="App.showRemCutoffModal()" style="flex-shrink:0">✏️ Edit Dates</button>`
    : '';

  if(!c){
    return `<div class="card" style="margin-bottom:12px">
      <div class="card-header">
        <span onclick="App.toggleRemCutoff()" style="cursor:pointer;display:flex;align-items:center;gap:8px;flex:1;min-width:0" title="${isOpen?'Collapse':'Expand'} cut-off dates">
          <span id="remCutoffChevron" style="font-size:10px;color:var(--text3);flex-shrink:0">${chevron}</span>
          <span class="card-title">📅 Remittance Cut-Off Dates</span>
          <span id="remCutoffHint" style="font-size:11px;color:var(--text3);font-weight:400;font-style:italic;margin-left:2px">${isOpen?'(tap to collapse)':'(tap to expand)'}</span>
        </span>
        ${editBtn}
      </div>
      <div id="remCutoffBody" style="display:${isOpen?'block':'none'}">
        <div class="alert alert-info" style="margin:0"><span class="alert-icon">ℹ</span><span>No cut-off dates set for this year. ${canEditRemCutoff()?'Click <strong>Edit Dates</strong> to set the dates from the HQ memo.':'Ask an administrator to grant you the <strong>Edit Remittance Cut-Off Dates</strong> permission in IT Admin settings.'}</span></div>
      </div>
    </div>`;
  }

  const year = Number.isInteger(Number(c.year)) ? Number(c.year) : curYear;
  const rows = REM_MONTHS.map((m, i) => {
    const day = Number.isInteger(c.dates[i]) ? c.dates[i] : null;
    const isCurrent = (year === curYear) && (i === curMonth);
    const cutoffDate = day ? new Date(year, i, day) : null;
    const isPast = cutoffDate ? cutoffDate < startOfToday : (year < curYear || (year === curYear && i < curMonth));
    const isThisMonth = isCurrent;
    const dayLabel = day ? `${day}${getOrdinalSuffix(day)} ${m}` : '—';
    const rowStyle = isThisMonth
      ? 'background:var(--primary-light);font-weight:600'
      : isPast ? 'color:var(--text3)' : '';
    const badge = isThisMonth
      ? `<span class="badge badge-info" style="margin-left:6px;font-size:10px">This month</span>`
      : isPast ? `<span style="font-size:10px;color:var(--text3)">Passed</span>` : '';
    return `<tr style="${rowStyle}">
      <td style="padding:5px 10px;font-size:13px">${m}</td>
      <td style="padding:5px 10px;font-size:13px;font-weight:${isThisMonth?700:400};color:${isPast&&!isThisMonth?'var(--text3)':'inherit'}">${dayLabel} ${badge}</td>
    </tr>`;
  }).join('');

  return `<div class="card" style="margin-bottom:12px">
    <div class="card-header">
      <span onclick="App.toggleRemCutoff()" style="cursor:pointer;display:flex;align-items:center;gap:8px;flex:1;min-width:0" title="${isOpen?'Collapse':'Expand'} cut-off dates">
        <span id="remCutoffChevron" style="font-size:10px;color:var(--text3);flex-shrink:0">${chevron}</span>
        <span class="card-title">📅 Remittance Cut-Off Dates — ${year}</span>
        <span id="remCutoffHint" style="font-size:11px;color:var(--text3);font-weight:400;font-style:italic;margin-left:2px">${isOpen?'(tap to collapse)':'(tap to expand)'}</span>
      </span>
      ${editBtn}
    </div>
    <div id="remCutoffBody" style="display:${isOpen?'block':'none'}">
      <p style="font-size:12px;color:var(--text2);margin-bottom:8px">These are the HQ-mandated monthly deadlines for remittance payments. The highlighted row is this month.</p>
      <div class="table-wrap"><table style="width:100%">
        <tr style="background:var(--surface)">
          <th style="padding:5px 10px;font-size:11px">Month</th>
          <th style="padding:5px 10px;font-size:11px">Cut-Off Date</th>
        </tr>
        ${rows}
      </table></div>
    </div>
  </div>`;
}

function toggleRemCutoff(){
  state.remCutoffOpen = !state.remCutoffOpen;
  const body = document.getElementById('remCutoffBody');
  const icon = document.getElementById('remCutoffChevron');
  const hint = document.getElementById('remCutoffHint');
  if(body) body.style.display = state.remCutoffOpen ? 'block' : 'none';
  if(icon) icon.textContent = state.remCutoffOpen ? '▲' : '▼';
  if(hint) hint.textContent = state.remCutoffOpen ? '(tap to collapse)' : '(tap to expand)';
}

async function showRemCutoffModal(){
  if(!canEditRemCutoff()){ showAlert('You do not have permission to edit remittance cut-off dates.','danger'); return; }
  const settings = await DB.getSettings();
  const preferredYear = Number.isInteger(state.year) ? state.year : new Date().getFullYear();
  const c = getRemCutoffDates(settings, preferredYear) || getRemCutoffDates(settings);
  const year = c?.year || preferredYear;
  const dates = c?.dates || Array(12).fill('');

  const inputs = REM_MONTHS.map((m, i) => `
    <div class="form-row" style="align-items:center;gap:10px;margin-bottom:8px">
      <label class="form-label" style="width:110px;margin:0;flex-shrink:0">${m}</label>
      <input type="number" id="cutoff_${i}" class="form-input" min="1" max="31"
        value="${dates[i]||''}" placeholder="Day (1-31)"
        style="width:100px;flex-shrink:0" />
      <span style="font-size:12px;color:var(--text3)">${year}</span>
    </div>`).join('');

  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">📅 Set Remittance Cut-Off Dates</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>Enter the cut-off day for each month as stated in the HQ annual memo. These dates are shown on the Remittances page as a reminder.</span></div>
    <div class="form-group">
      <label class="form-label">Year</label>
      <input type="number" id="cutoff_year" class="form-input" value="${year}" min="2024" max="2099" style="width:120px" />
    </div>
    <div style="max-height:340px;overflow-y:auto;padding-right:4px">
      ${inputs}
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.saveRemCutoffDates(this)">Save Dates</button>
    </div>`);
}

async function saveRemCutoffDates(btn=null){
  if(!canEditRemCutoff()){ showAlert('You do not have permission to edit remittance cut-off dates.','danger'); return; }
  const yearInput = parseInt(document.getElementById('cutoff_year')?.value);
  const year = (Number.isFinite(yearInput) && yearInput>=2024 && yearInput<=2099)
    ? yearInput
    : new Date().getFullYear();
  const invalidMonths = [];
  const dates = Array.from({length:12}, (_,i) => {
    const raw = (document.getElementById(`cutoff_${i}`)?.value || '').trim();
    if(!raw) return null;
    const v = parseInt(raw);
    const maxDay = new Date(year, i+1, 0).getDate(); // day 0 of next month = last day of month i
    if(Number.isFinite(v) && v>=1 && v<=maxDay) return v;
    invalidMonths.push(`${REM_MONTHS[i]} (1-${maxDay})`);
    return null;
  });
  if(invalidMonths.length){
    showAlert(`Invalid cut-off day for ${invalidMonths.join(', ')}.`, 'danger');
    return;
  }
  const restore = setBtnLoading(btn, 'Saving…');
  try {
    const settings = await DB.getSettings();
    if(!settings.remCutoffDatesByYear || typeof settings.remCutoffDatesByYear!=='object'){
      settings.remCutoffDatesByYear = {};
    }
    settings.remCutoffDatesByYear[year] = dates;
    settings.remCutoffDates = { year, dates };
    await DB.saveSettings(settings);
    DB.addAudit('rem_cutoff_updated', `Remittance cut-off dates set for ${year}`, state.user?.name);
    closeModal();
    showAlert(`Cut-off dates saved for ${year}.`, 'success');
    renderRemittances();
  } catch(err){
    restore();
    showAlert(`Failed to save cut-off dates: ${err.message||'Unknown error'}. Please try again.`, 'danger');
  }
}

async function renderRemittances(){
  const [allIncome, allRems, settings, allUsers, rr] = await Promise.all([
    DB.getIncome(), DB.getRemittances(), DB.getSettings(), DB.getUsers(), getRemRates()
  ]);
  const quotas = getQuotaList(settings);

  // --- Cut-off date for selected month (governs To date when configured) ---
  const cutoffConfig = getRemCutoffDates(settings, state.year);
  const cutoffYear = cutoffConfig ? Number(cutoffConfig.year) : null;
  const cutoffDay = (cutoffConfig && cutoffYear === state.year && Number.isInteger(cutoffConfig.dates[state.month]))
    ? cutoffConfig.dates[state.month]
    : null;
  const hasCutoff = !!cutoffDay;

  // --- Determine period defaults ---
  const todayStr = ymdLocal(new Date());
  // When cut-off dates are configured, always recalculate both From and To from the cut-off table
  if(hasCutoff){
    // To = current month's cut-off date
    state.remToDate = ymdLocal(new Date(state.year, state.month, cutoffDay));
    // From = day after the previous month's cut-off date (wrapping year if needed)
    const prevMonth = state.month === 0 ? 11 : state.month - 1;
    const prevYear  = state.month === 0 ? state.year - 1 : state.year;
    const prevCutoffConfig = getRemCutoffDates(settings, prevYear);
    const prevCutoffDay = (prevCutoffConfig && Number.isInteger(prevCutoffConfig.dates[prevMonth]) && Number(prevCutoffConfig.year) === prevYear)
      ? prevCutoffConfig.dates[prevMonth]
      : null;
    if(prevCutoffDay){
      // Day after previous month's cut-off
      const d = new Date(prevYear, prevMonth, prevCutoffDay);
      d.setDate(d.getDate() + 1);
      state.remFromDate = ymdLocal(d);
    } else {
      // No cut-off for previous month — fall back to first day of current month
      state.remFromDate = ymdLocal(new Date(state.year, state.month, 1));
    }
  } else {
  if(!state.remFromDate){
    // Day after last paid remittance, or start of current month
    const lastPaid = allRems.filter(r=>r.status==='paid')
      .sort((a,b)=>new Date(b.paidDate||b.createdAt||0)-new Date(a.paidDate||a.createdAt||0))[0];
    if(lastPaid){
      const d=new Date(lastPaid.paidDate||lastPaid.createdAt||0);
      if(isNaN(d.getTime())){
        state.remFromDate=ymdLocal(new Date(state.year,state.month,1));
      } else {
        d.setDate(d.getDate()+1);
        state.remFromDate=ymdLocal(d);
      }
    } else {
      state.remFromDate=ymdLocal(new Date(state.year,state.month,1));
    }
  }
  if(!state.remToDate){
    state.remToDate = todayStr;
  }
  }

  const fromDate=state.remFromDate;
  const toDate=state.remToDate;

  // --- Income for selected period ---
  const income=filterByDateRange(allIncome, fromDate, toDate);
  const rem=await calcRemittancesFromRecords(income);

  // --- Build remittance lines ---
  // Non-TG income types → National HQ (% based)
  const incomeLines=rem.lines.filter(l=>!l.isTg).map(l=>({
    label:l.label+' → National HQ',
    pct: l.total>0 ? Math.round((l.national/l.total)*100) : null,
    amount:l.national||0, section:'income', from:l
  })).filter(l=>l.amount>0);

  // Thanksgiving National HQ portion (75%) — added as a separate income-based remittance line
  const tgNatlAmt=rem.lines.filter(l=>l.isTg).reduce((s,l)=>s+(l.national||0),0);
  if(tgNatlAmt>0) incomeLines.push({
    label:'Thanksgiving (TG) → National HQ',
    pct: Math.round(rr.tgNational*100),
    amount:tgNatlAmt, section:'income'
  });
  const tgSeedAmt=rem.totalSeed||0;
  if(tgSeedAmt>0) incomeLines.push({
    label:`Thanksgiving → Seed → National HQ`,
    pct: Math.round((rr.tgSeed||0)*100),
    amount:tgSeedAmt, section:'income'
  });

  const tgLines=[
    { label:`Thanksgiving → Area / Zonal Pastor (${Math.round(rr.tgArea*100)}%)`,      amount:rem.totalArea,     section:'tg' },
    { label:`Thanksgiving → Parish Pastor's Share (${Math.round(rr.tgPastor*100)}%)`,         amount:rem.totalPastor,   section:'tg' },
    { label:`Thanksgiving → Ministers' Share (${Math.round(rr.tgMinisters*100)}%)`,    amount:rem.totalMinisters,section:'tg' },
  ].filter(l=>l.amount>0);

  const provinceLines=rem.provinceRebate>0?[
    { label:`Province Rebate (${Math.round(rr.provinceRebate*100)}% of Local Retained Tithes)`, amount:rem.provinceRebate, section:'province' }
  ]:[];

  const quotaLines=getQuotaLinesForPeriod(quotas, fromDate, toDate);

  const levyLines=[
    rem.crmAddon>0   ?{ label:`CRM Add-on → National HQ (${Math.round((rr.crmAddon||0)*100)}% of CRM)`,                     amount:rem.crmAddon,    section:'levy', pct:Math.round((rr.crmAddon||0)*100) }:null,
    rem.coastline>0  ?{ label:`Coastline Worship Centre → National HQ (${+(((rr.coastline||0)*100).toFixed(2))}% of Min. Tithe)`, amount:rem.coastline,   section:'levy', pct:+(((rr.coastline||0)*100).toFixed(2)) }:null,
    rem.insuranceGen>0?{ label:`Insurance Fund (GEN TITHE) → National HQ (${+(((rr.insuranceGenTithe||0)*100).toFixed(4))}% of Mbr Tithe)`, amount:rem.insuranceGen, section:'levy', pct:+(((rr.insuranceGenTithe||0)*100).toFixed(4)) }:null,
    rem.insuranceMin>0?{ label:`Insurance Fund (MIN TITHE) → National HQ (${+(((rr.insuranceMinTithe||0)*100).toFixed(4))}% of Min. Tithe)`, amount:rem.insuranceMin, section:'levy', pct:+(((rr.insuranceMinTithe||0)*100).toFixed(4)) }:null,
  ].filter(Boolean);

  // ── Split lines into Part A (RCCG Authorities) and Part B (TG & Pastoral) ──
  const rccgQuotaLines=quotaLines.filter(q=>!isMummyQuotaLabel(q.label));
  const mummyQuotaLines=quotaLines.filter(q=>isMummyQuotaLabel(q.label));
  const partALines=[...incomeLines,...provinceLines,...levyLines,...rccgQuotaLines];
  const partBLines=[...tgLines,...mummyQuotaLines];
  const partATotal=partALines.reduce((s,l)=>s+l.amount,0);
  const partBTotal=partBLines.reduce((s,l)=>s+l.amount,0);
  const allLines=[...partALines,...partBLines];
  const totalDue=allLines.reduce((s,l)=>s+l.amount,0);
  const quotasTotal=sumQuotaLines(quotaLines);
  const trueNetLocal=rem.netLocal-quotasTotal;
  // Only count income that goes through the remittance split (records with INCOME_TYPES fields)
  const totalCollection=income
    .filter(r=>INCOME_TYPES.some(t=>(r[t.key]||0)>0))
    .reduce((s,r)=>s+(r.totalCollection||0),0);

  // --- Check for period payment (per-part tracking) ---
  const periodPayments=allRems.filter(r=>r.status==='paid'&&r.periodFrom===fromDate&&r.periodTo===toDate);
  const totalPaid=periodPayments.reduce((s,r)=>s+(r.amount||0),0);
  // Legacy (no part) payments count toward both parts for backward compat
  const _legacyPaid=periodPayments.filter(r=>!r.part).reduce((s,r)=>s+(r.amount||0),0);
  const _paidA=periodPayments.filter(r=>r.part==='a').reduce((s,r)=>s+(r.amount||0),0)+_legacyPaid;
  const _paidB=periodPayments.filter(r=>r.part==='b').reduce((s,r)=>s+(r.amount||0),0)+_legacyPaid;
  const _periodDueSnapshot=periodPayments.reduce((max,r)=>Math.max(max,r.dueAtTimeOfPayment||0),0);
  const _effectiveDue=_periodDueSnapshot>0?_periodDueSnapshot:(toDate<todayStr&&totalPaid>0?totalPaid:totalDue);
  const _isLegacyFullPaid=_legacyPaid>0&&_legacyPaid>=_effectiveDue*PAYMENT_TOLERANCE_THRESHOLD;
  const isPartAPaid=_isLegacyFullPaid||(partATotal>0&&_paidA>0&&_paidA>=partATotal*PAYMENT_TOLERANCE_THRESHOLD);
  const isPartBPaid=_isLegacyFullPaid||(partBTotal>0&&_paidB>0&&_paidB>=partBTotal*PAYMENT_TOLERANCE_THRESHOLD)||(partBTotal===0);
  const isPaid=isPartAPaid&&isPartBPaid;
  const isPartial=(totalPaid>0||_paidA>0||_paidB>0)&&!isPaid;
  const remDueLabel = getRemittanceDueLabel(settings, state.year, state.month,
    { isPaid, isPartial, paidAmount: totalPaid });

  // ── Snapshot override for paid periods ──────────────────────
  // When rates/quotas change after a period is paid, use the frozen snapshot
  // so the breakdown reflects what was actually paid, not current rates.
  let _snapshotActive = false;
  if(isPaid){
    const _snapA = periodPayments.find(r=>r.part==='a'&&r.breakdownSnapshot);
    const _snapB = periodPayments.find(r=>r.part==='b'&&r.breakdownSnapshot);
    if(_snapA||_snapB){
      _snapshotActive = true;
      if(_snapA){ try {
        const sl=JSON.parse(_snapA.breakdownSnapshot);
        partALines.length=0;
        sl.forEach(l=>partALines.push({label:l.label,amount:l.amount,section:'snapshot',pct:null}));
      } catch(e){} }
      if(_snapB){ try {
        const sl=JSON.parse(_snapB.breakdownSnapshot);
        partBLines.length=0;
        sl.forEach(l=>partBLines.push({label:l.label,amount:l.amount,section:'snapshot',pct:null}));
      } catch(e){} }
    }
  }
  // Recalculate totals from (possibly snapshot-overridden) lines
  const _dPartATotal=partALines.reduce((s,l)=>s+l.amount,0);
  const _dPartBTotal=partBLines.reduce((s,l)=>s+l.amount,0);
  const _dTotalDue=_dPartATotal+_dPartBTotal;

  const allPaidRems=allRems.filter(r=>r.status==='paid'||r.status==='written_off')
    .sort((a,b)=>new Date(b.paidDate||b.createdAt||0)-new Date(a.paidDate||a.createdAt||0));

  const pendingApprovals=allRems.filter(r=>r.status==='pending_approval')
    .sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));

  // Note: the Satellite/Zone Pass-Through Fund panel used to be rendered here — it now
  // lives on the Income page instead (last card — see renderIncome/renderSatelliteFundsPanel).

  const renderSection=(rows,sectionLabel)=>rows.length?`
    <tr style="background:var(--surface)">
      <td colspan="3" style="font-size:10px;font-weight:700;color:var(--text3);padding:5px 12px;letter-spacing:0.6px;text-transform:uppercase">${sectionLabel}</td>
    </tr>
    ${rows.map(l=>`<tr>
      <td style="padding:7px 12px">
        <strong>${l.label}</strong>
        ${l.pct!=null?`<span style="margin-left:6px;font-size:11px;color:var(--text3);font-weight:400">(${l.pct}%)</span>`:''}
        ${l.basis?`<div style="font-size:11px;color:var(--text3);font-weight:400;margin-top:2px">${esc(l.basis)}</div>`:''}
        ${l.section==='quota'&&l.isProrated&&l.monthlyAmount>l.amount?`<div style="font-size:11px;color:var(--text3);font-weight:400;margin-top:1px">Full monthly quota: <strong style="color:var(--text2)">${fmt(l.monthlyAmount)}</strong></div>`:''}
      </td>
      <td style="padding:7px 8px">
        <span class="badge ${l.section==='quota'?'badge-info':'badge-purple'}">${l.section==='quota'?(l.isProrated?'Partial':'Fixed Quota'):'% Based'}</span>
      </td>
      <td class="td-right td-bold td-red" style="padding:7px 12px">${fmt(l.amount)}</td>
    </tr>`).join('')}`:'';

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div>
        <div class="page-title">Remittances</div>
        <div class="page-sub">Summary of all amounts due to HQ, Province, and for local distribution</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${canAction('remittance_record_payment')?`
          ${!isPartAPaid?`<button class="btn btn-primary" onclick="App.showRemittancePaymentModal('a')">📤 Part A (${fmt(_dPartATotal)})</button>`:''}
          ${!isPartBPaid&&_dPartBTotal>0?`<button class="btn btn-amber" style="color:#fff;background:var(--amber)" onclick="App.showRemittancePaymentModal('b')">🤝 Part B (${fmt(_dPartBTotal)})</button>`:''}
        `:''}
        <button class="btn btn-amber" onclick="App.printRemittanceReport()">📄 Download Report</button>
        <button class="btn" onclick="App.shareRemittanceReport()">📤 Share</button>
      </div>
    </div>

    <!-- Period Selector -->
    <div class="card" style="margin-bottom:12px;padding:14px 16px">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">📅 Remittance Period</div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:6px">
          <label style="font-size:12px;color:var(--text2);white-space:nowrap">From</label>
          <input type="date" id="remFromDate" class="form-input" value="${fromDate}"
            style="width:auto;padding:6px 10px;font-size:13px${hasCutoff?';background:var(--surface);cursor:default;color:var(--text2)':''}"
            ${hasCutoff?'readonly':'onchange="App.onRemDatesChange()"'} />
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <label style="font-size:12px;color:var(--text2);white-space:nowrap">To</label>
          <input type="date" id="remToDate" class="form-input" value="${toDate}"
            style="width:auto;padding:6px 10px;font-size:13px${hasCutoff?';background:var(--surface);cursor:default;color:var(--text2)':''}"
            ${hasCutoff?'readonly':'onchange="App.onRemDatesChange()"'} />
        </div>
        ${hasCutoff?`<span class="badge badge-info" style="font-size:11px">🔒 Locked to cut-off date</span>`:''}
        ${isPaid?`<span class="badge badge-success" style="font-size:11px">✅ PAID for this period</span>`:isPartial?`<span class="badge badge-warn" style="font-size:11px">⏳ Partially paid</span>`:''}
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:8px">
        ${hasCutoff
          ? `🔒 Dates are automatically set from the HQ cut-off date for this month.`
          : `ℹ️ Set <strong>From</strong> to the day after your last remittance payment, and <strong>To</strong> to the date of this month's remittance.`}
        Showing <strong>${income.length}</strong> income record(s) in this period.
      </div>
    </div>

    ${renderRemCutoffCard(settings)}

    <!-- KPI Summary -->
    <div class="kpi-grid" style="margin-bottom:12px">
      <div class="kpi"><div class="kpi-icon" style="background:#E8F4FD">💰</div><div class="kpi-label">Total Collection</div><div class="kpi-val">${fmt(totalCollection)}</div></div>
      <div class="kpi"><div class="kpi-icon" style="background:#FCEBEB">📤</div><div class="kpi-label">Total Remittance Due</div><div class="kpi-val">${fmt(_dTotalDue)}</div><div class="kpi-delta" style="color:var(--text3)">📅 ${remDueLabel}</div></div>
      <div class="kpi"><div class="kpi-icon" style="background:#EAF3DE">✓</div><div class="kpi-label">Total Paid</div><div class="kpi-val">${fmt(totalPaid)}</div>
        <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;justify-content:center">
          ${isPartAPaid?'<span class="badge badge-success" style="font-size:9px">A ✓</span>':'<span class="badge badge-warn" style="font-size:9px">A ✗</span>'}
          ${isPartBPaid?'<span class="badge badge-success" style="font-size:9px">B ✓</span>':'<span class="badge badge-warn" style="font-size:9px">B ✗</span>'}
        </div>
      </div>
      <div class="kpi"><div class="kpi-icon" style="background:#E1F5EE">🏠</div><div class="kpi-label">Net Local Retained</div><div class="kpi-val">${fmt(trueNetLocal)}</div></div>
    </div>

    ${_snapshotActive?`<div class="alert alert-info" style="margin-bottom:12px"><span class="alert-icon">🔒</span><span>This period has been <strong>paid</strong>. The amounts shown are <strong>frozen from time of payment</strong> and will not change if rates or quotas are updated.</span></div>`:''}
    ${income.length===0?`<div class="alert alert-warn" style="margin-bottom:12px"><span class="alert-icon">⚠</span><span><strong>No income records found</strong> for the selected period (${fmtDateShort(fromDate)} – ${fmtDateShort(toDate)}). Please adjust the date range above or record income first.</span></div>`:''}

    <div class="grid-6040">
      <!-- LEFT: Breakdown Table -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Full Remittance Breakdown</span>
          <span style="font-size:11px;color:var(--text3)">${fmtDateShort(fromDate)} – ${fmtDateShort(toDate)}</span>
        </div>
        <div class="table-wrap"><table style="width:100%">
          <tr><th>Description</th><th style="width:100px">Type</th><th class="td-right" style="width:130px">Amount Due (₦)</th></tr>
          ${renderSection(incomeLines,'Part A — Income-Based Remittances → National HQ (% of collections)')}
          ${renderSection(provinceLines,'Part A — Province Rebate (20% of Local Retained Tithes)')}
          ${renderSection(levyLines,'Part A — Additional RCCG Levies → National HQ')}
          ${renderSection(rccgQuotaLines,'Part A — Fixed Quotas Due for This Period')}
          <tr style="border-top:2px solid var(--border);background:var(--surface)">
            <td colspan="2" class="td-bold" style="font-size:13px;padding:8px 12px">PART A SUBTOTAL — RCCG Authorities</td>
            <td class="td-right td-bold" style="font-size:14px;color:var(--danger);padding:8px 12px">${fmt(_dPartATotal)}</td>
          </tr>
          ${renderSection(tgLines,'Part B — Thanksgiving — Pastoral & Local Distribution')}
          ${renderSection(mummyQuotaLines,'Part B — Pastoral Stipend')}
          <tr style="border-top:2px solid var(--border);background:var(--surface)">
            <td colspan="2" class="td-bold" style="font-size:13px;padding:8px 12px">PART B SUBTOTAL — TG & Pastoral</td>
            <td class="td-right td-bold" style="font-size:14px;color:var(--danger);padding:8px 12px">${fmt(_dPartBTotal)}</td>
          </tr>
          <tr style="border-top:3px solid var(--text)">
            <td colspan="2" class="td-bold" style="font-size:14px;padding:10px 12px">TOTAL REMITTANCES DUE</td>
            <td class="td-right td-bold" style="font-size:15px;color:var(--danger);padding:10px 12px">${fmt(_dTotalDue)}</td>
          </tr>
          <tr>
            <td colspan="2" style="font-size:12px;color:var(--text2);padding:6px 12px">Net Local Retained (after Province Rebate &amp; Fixed Quotas)</td>
            <td class="td-right" style="font-size:13px;color:var(--primary);font-weight:600;padding:6px 12px">${fmt(trueNetLocal)}</td>
          </tr>
        </table></div>

        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
          ${canAction('remittance_record_payment')?`
            ${!isPartAPaid?`<button class="btn btn-primary" onclick="App.showRemittancePaymentModal('a')">📤 Part A — RCCG Authority (${fmt(_dPartATotal)})</button>`:`<span class="badge badge-success" style="padding:8px 12px;font-size:12px">✅ Part A Paid</span>`}
            ${_dPartBTotal>0?(!isPartBPaid?`<button class="btn btn-amber" style="color:#fff;background:var(--amber)" onclick="App.showRemittancePaymentModal('b')">🤝 Part B — TG & Pastoral (${fmt(_dPartBTotal)})</button>`:`<span class="badge badge-success" style="padding:8px 12px;font-size:12px">✅ Part B Paid</span>`):''}
          `:''}
          <button class="btn btn-amber" onclick="App.printRemittanceReport()">📄 Print / Download Report</button>
          <button class="btn" onclick="App.shareRemittanceReport()">📤 Share</button>
        </div>
      </div>

      <!-- RIGHT: History + Local Share -->
      <div>
        ${pendingApprovals.length&&(can('signoff')||canAction('remittance_delete_pending'))?`
        <div class="card" style="border-left:3px solid var(--amber);margin-bottom:12px">
          <div class="card-header"><span class="card-title">⏳ Pending Approval (${pendingApprovals.length})</span></div>
          <p style="font-size:11px;color:var(--text3);margin:0 0 8px 0">These payments have been submitted and are awaiting approval by the Pastor or a Bank Signatory.</p>
          ${pendingApprovals.map(r=>`
            <div class="feed-item">
              <div class="feed-dot" style="background:#FFF3CD">⏳</div>
              <div class="feed-body">
                <div class="feed-title">${esc(r.label||'RCCG Remittance')}</div>
                <div class="feed-sub">${r.periodFrom&&r.periodTo?`Period: ${fmtDate(r.periodFrom)} – ${fmtDate(r.periodTo)}<br>`:''}Submitted by: ${esc(r.submittedBy||r.authorizedBy||'—')}</div>
                <div class="feed-time">${fmtDate(r.createdAt)}</div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
                <span class="td-bold td-red">${fmt(r.amount)}</span>
                ${can('signoff')?`<button class="btn btn-sm btn-primary" onclick="App.approveRemittance('${r.id}', this)">✅ Approve</button>`:''}
                ${canAction('remittance_delete_pending')?`<button class="btn btn-sm btn-danger" onclick="App.deleteRemittance('${r.id}', this)">🗑 Delete</button>`:''}
              </div>
            </div>`).join('')}
        </div>`:''}

        ${isPaid?`
        <div class="card" style="border-left:3px solid var(--success);margin-bottom:12px">
          <div class="card-header"><span class="card-title">✅ Paid for this Period</span></div>
          ${periodPayments.map(r=>`
            <div class="feed-item">
              <div class="feed-dot" style="background:var(--success-light)">✓</div>
              <div class="feed-body">
                <div class="feed-title">RCCG Remittance Payment</div>
                <div class="feed-sub">${r.paymentMethod==='cash'?'<span style="color:var(--amber)">💵 Cash</span> · ':'🏦 Bank · '}Ref: ${esc(r.reference)||'—'}<br>Authorized: ${esc(r.authorizedBy)||'—'}${(r.otherParishesAmount||0)>0?`<br><span style="color:var(--primary)">🛰️ Satellite share (${fmt(r.otherParishesAmount)}) drawn from pool — see Satellite/Zone Pool panel</span>`:''}</div>
                <div class="feed-time">${fmtDate(r.paidDate)}</div>
              </div>
              <div class="feed-right td-green">${fmt(r.amount)}</div>
            </div>`).join('')}
        </div>`:''}

        <div class="card" style="margin-bottom:12px">
          <div class="card-header"><span class="card-title">Payment History</span></div>
          ${allPaidRems.length?allPaidRems.slice(0,10).map(r=>{
            const isWrittenOff=r.status==='written_off';
            return `
            <div class="feed-item">
              <div class="feed-dot" style="background:${isWrittenOff?'#FDECC8':'var(--success-light)'}">${isWrittenOff?'⚖️':'✓'}</div>
              <div class="feed-body">
                <div class="feed-title">${esc(r.label||'RCCG Remittance')} ${isWrittenOff?'<span class="badge badge-warn" style="font-size:9px;margin-left:4px">WRITTEN OFF</span>':''}</div>
                <div class="feed-sub">${r.periodFrom&&r.periodTo?`<em>Period: ${fmtDate(r.periodFrom)} – ${fmtDate(r.periodTo)}</em><br>`:''}${isWrittenOff?`Reason: ${esc(r.notes)||'—'}`:`${r.paymentMethod==='cash'?'💵 Cash':'🏦 Bank'} · Ref: ${esc(r.reference)||'—'}`} · ${esc(r.authorizedBy)||'—'}${(r.otherParishesAmount||0)>0?`<br><span style="color:var(--primary)">🛰️ Satellite share (${fmt(r.otherParishesAmount)}) drawn from pool</span>`:''}</div>
                <div class="feed-time">${fmtDate(r.paidDate)}</div>
              </div>
              <div class="feed-right" style="color:${isWrittenOff?'var(--amber)':'var(--success)'}">${fmt(r.amount)}</div>
            </div>`;
          }).join(''):'<div class="empty-table">No remittance payments recorded yet.</div>'}
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Local Church Share</span></div>
          <p style="font-size:11px;color:var(--text3);margin-bottom:10px">What the parish retains from this period after all remittances.</p>
          ${rem.lines.filter(l=>(l.local||0)>0).map(l=>`
            <div class="status-row">
              <div class="status-row-label">${l.label} (local ${Math.round((l.local/l.total)*100)}%)</div>
              <div class="status-row-amt" style="color:var(--primary)">${fmt(l.local)}</div>
            </div>`).join('')}
          ${rem.provinceRebate>0?`
          <div class="status-row" style="border-top:1px dashed var(--border)">
            <div class="status-row-label" style="color:var(--amber)">Province Rebate — 20% of Local Retained Tithes (deducted)</div>
            <div class="status-row-amt" style="color:var(--amber)">− ${fmt(rem.provinceRebate)}</div>
          </div>`:''}
          ${quotasTotal>0?`
          <div class="status-row" style="border-top:1px dashed var(--border)">
            <div class="status-row-label" style="color:var(--amber)">Fixed Quotas Due This Period (deducted)</div>
            <div class="status-row-amt" style="color:var(--amber)">− ${fmt(quotasTotal)}</div>
          </div>`:''}
          <div class="status-row" style="border-top:2px solid var(--border);margin-top:4px">
            <div class="status-row-label fw-bold">NET LOCAL RETAINED</div>
            <div class="status-row-amt" style="color:var(--primary);font-size:15px">${fmt(trueNetLocal)}</div>
          </div>
        </div>

        <!-- Pastorate & Ministers Share card -->
        ${(rem.totalPastor||0)+(rem.totalArea||0)+(rem.totalMinisters||0)+(quotaLines.find(q=>isMummyQuotaLabel(q.label))?.amount||0)>0?`
        <div class="card" style="margin-top:12px">
          <div class="card-header"><span class="card-title">👨‍💼 Pastorate &amp; Ministers Share</span></div>
          <p style="font-size:11px;color:var(--text3);margin-bottom:10px">Thanksgiving portions and stipend due to the Pastor's family and ministers (as Zonal / Area Pastor).</p>
          ${(rem.totalArea||0)>0?`
          <div class="status-row">
            <div class="status-row-label">TG → Area / Zonal Pastor (${Math.round(rr.tgArea*100)}%)</div>
            <div class="status-row-amt" style="color:var(--primary)">${fmt(rem.totalArea)}</div>
          </div>`:''}
          ${(rem.totalPastor||0)>0?`
          <div class="status-row">
            <div class="status-row-label">TG → Parish Pastor's Share (${Math.round(rr.tgPastor*100)}%)</div>
            <div class="status-row-amt" style="color:var(--primary)">${fmt(rem.totalPastor)}</div>
          </div>`:''}
          ${(rem.totalMinisters||0)>0?`
          <div class="status-row">
            <div class="status-row-label">TG → Ministers' Share (${Math.round(rr.tgMinisters*100)}%)</div>
            <div class="status-row-amt" style="color:var(--primary)">${fmt(rem.totalMinisters)}</div>
          </div>`:''}
          ${(()=>{ const mq=quotaLines.find(q=>isMummyQuotaLabel(q.label)); return mq&&(mq.amount||0)>0?`
          <div class="status-row">
            <div><div class="status-row-label">${mq.label}</div><div class="status-row-sub">${esc(mq.basis||'Fixed monthly amount')}</div></div>
            <div class="status-row-amt" style="color:var(--primary)">${fmt(mq.amount)}</div>
          </div>`:'' })()}
          <div class="status-row" style="border-top:2px solid var(--border);margin-top:4px">
            <div class="status-row-label fw-bold">TOTAL PASTORATE &amp; MINISTERS SHARE</div>
            <div class="status-row-amt" style="color:var(--primary);font-size:15px">${fmt((rem.totalArea||0)+(rem.totalPastor||0)+(rem.totalMinisters||0)+(quotaLines.find(q=>isMummyQuotaLabel(q.label))?.amount||0))}</div>
          </div>
        </div>`:''}
      </div>
    </div>`;
}

// Display-only label helper for the held-for-satellites figure — used by the
// Dashboard balance breakdown, the pool panel KPI, and the Bank page alert.
// held>0: money this parish holds on the satellites' behalf (excluded from
// available funds). held<0: the parish fronted money the satellites now owe back
// (a receivable, already added into the available total). Never touches the
// underlying sign/calc in calcChurchBalance or summarizeSatelliteFunds — display only.
function satelliteHeldDisplay(held){
  const h = held || 0;
  return h < 0
    ? { label:'Owed by satellites', amount:fmt(Math.abs(h)), suffix:'money the satellites owe the pool' }
    : { label:'Held for satellites', amount:fmt(h), suffix:'excluded from available funds' };
}

// ── Satellite / Zone Pass-Through Fund panel (lives on the Remittances page) ──
// Shown separately from remittance totals: this money is never this parish's own
// income or expense — it is custodial funds received from and remitted on behalf
// of the three satellite parishes (Province remittance contributions + joint
// area/zone payments), pooled into one combined balance (no per-parish tracking;
// the free-text note on each entry carries the trail). Held money sits INSIDE the
// bank balance (it really is in the bank) but is excluded from "available funds"
// until it is either remitted onward (direction='out') or explicitly transferred
// to the parish (direction='transfer_out' — see App.showSatelliteTransferForm).
function renderSatelliteFundsPanel(totalIn, totalOut, totalTransferOut, held, recent, transferByReason){
  const canRecord=canAction('satellite_fund_record');
  const canTransfer=canAction('satellite_fund_transfer');
  const canDelete=canAction('satellite_fund_delete');
  const purposeLabel=(direction,key)=>{
    const list = direction==='transfer_out' ? SATELLITE_TRANSFER_REASONS : SATELLITE_FUND_PURPOSES;
    return list.find(p=>p.key===key)?.label||(key||'Other');
  };
  const reasonBits=[];
  if(transferByReason.gift>0) reasonBits.push(`Gift ${fmt(transferByReason.gift)}`);
  if(transferByReason.reimbursement>0) reasonBits.push(`Reimbursement ${fmt(transferByReason.reimbursement)}`);
  if(transferByReason.correction>0) reasonBits.push(`Correction ${fmt(transferByReason.correction)}`);
  // held<0 means the parish fronted money the satellites now owe back — a receivable,
  // not a liability, so the KPI label flips (see satelliteHeldDisplay). The tile itself
  // always shows (unlike the Dashboard/Bank lines, which hide entirely when held===0).
  const heldDisp = satelliteHeldDisplay(held);
  return `
    <div class="card" style="margin-top:12px;border-left:3px solid var(--primary)">
      <div class="card-header">
        <span class="card-title">🛰️ Funds Received &amp; Remitted on Behalf of Satellite Parishes</span>
      </div>
      <p style="font-size:11px;color:var(--text3);margin-bottom:10px">
        Money the three satellite parishes send in for Province remittance and joint area/zone payments, which this parish forwards on their behalf. This is <strong>pass-through / custodial money</strong> — not our own income or expense — and is <strong>excluded from all income, expense, and remittance totals</strong>. Every In/Out is mirrored into the Bank module so the bank balance stays accurate; held money sits inside the bank balance until remitted onward or transferred to the parish below.
      </p>
      <div class="kpi-grid sat-kpi-grid" style="margin-bottom:12px">
        <div class="kpi"><div class="kpi-icon" style="background:#E1F5EE">📥</div><div class="kpi-label">Total Received (In)</div><div class="kpi-val" style="color:var(--success)">${fmt(totalIn)}</div></div>
        <div class="kpi"><div class="kpi-icon" style="background:#FCEBEB">📤</div><div class="kpi-label">Paid Out (Province/Joint)</div><div class="kpi-val" style="color:var(--danger)">${fmt(totalOut)}</div></div>
        <div class="kpi"><div class="kpi-icon" style="background:#FAEEDA">🔁</div><div class="kpi-label">Transferred to Parish</div><div class="kpi-val" style="color:var(--amber)">${fmt(totalTransferOut)}</div>${reasonBits.length?`<div class="kpi-delta" style="color:var(--text3)">${reasonBits.join(' · ')}</div>`:''}</div>
        <div class="kpi"><div class="kpi-icon" style="background:#E6F1FB">🏦</div><div class="kpi-label">${held<0?heldDisp.label:'Current Balance Held'}</div><div class="kpi-val" style="color:${held<0?'var(--primary)':'inherit'}">${heldDisp.amount}</div></div>
      </div>
      ${(canRecord||canTransfer)?`
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        ${canRecord?`<button class="btn btn-primary" onclick="App.showSatelliteFundForm('in')">📥 Record Funds In</button>
        <button class="btn btn-amber" style="color:#fff;background:var(--amber)" onclick="App.showSatelliteFundForm('out')">📤 Record Funds Out</button>`:''}
        ${canTransfer?`<button class="btn" onclick="App.showSatelliteTransferForm()">🔁 Transfer to Parish</button>`:''}
      </div>`:''}
      <div class="card-header" style="padding:0;margin-bottom:6px"><span class="card-title" style="font-size:12px">Recent Entries</span></div>
      ${recent.length?recent.map(s=>{
        const isTransfer = s.direction==='transfer_out';
        const icon = isTransfer ? '🔁' : (s.direction==='in' ? '📥' : '📤');
        const bg = isTransfer ? '#FAEEDA' : (s.direction==='in' ? 'var(--success-light)' : '#FCEBEB');
        const channelLabel = s.direction==='in'
          ? (s.channel==='cash'?'💵 Cash':'🏦 Bank')
          : (s.channel==='petty_cash'?'💳 Petty Cash':s.channel==='cash_accountant'?'💵 Cash (Accountant)':'🏦 Bank');
        const channelBadge = (s.direction==='in'||s.direction==='out') ? ` <span class="badge badge-gray" style="font-size:9px;vertical-align:middle">${channelLabel}</span>` : '';
        const title = isTransfer ? `Transferred to Parish — ${esc(purposeLabel('transfer_out', s.purpose))}` : `${s.direction==='in'?'Received':'Paid Out'} — ${esc(purposeLabel(s.direction, s.purpose))}${channelBadge}`;
        const amtClass = s.direction==='in' ? 'td-green' : (isTransfer ? '' : 'td-red');
        const amtStyle = isTransfer ? 'color:var(--amber)' : '';
        // Edit is gated on whatever permission would let this SAME entry be recorded
        // in the first place: satellite_fund_record for in/out, satellite_fund_transfer
        // for transfer_out — see editSatelliteFundEntry, which re-derives this same
        // split server-role-agnostically from the entry's own direction.
        const canEditThis = isTransfer ? canTransfer : canRecord;
        return `
        <div class="feed-item">
          <div class="feed-dot" style="background:${bg}">${icon}</div>
          <div class="feed-body">
            <div class="feed-title">${title}</div>
            <div class="feed-sub">${s.note?esc(s.note)+' · ':''}${s.reference?'Ref: '+esc(s.reference)+' · ':''}${esc(s.recordedBy)||'—'}</div>
            <div class="feed-time">${fmtDate(s.date)}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <span class="td-bold ${amtClass}" style="${amtStyle}">${s.direction==='in'?'+':'−'} ${fmt(s.amount)}</span>
            ${(canEditThis||canDelete)?`
            <div class="sat-entry-menu-wrap">
              <button class="sat-entry-menu-btn" onclick="App.toggleSatEntryMenu('${s.id}')" aria-label="More actions" title="More actions">⋮</button>
              <div class="sat-entry-menu" id="sat_entry_menu_${s.id}">
                ${canEditThis?`<button onclick="App.toggleSatEntryMenu('${s.id}');App.editSatelliteFundEntry('${s.id}')">✏️ Edit</button>`:''}
                ${canDelete?`<button class="danger" onclick="App.toggleSatEntryMenu('${s.id}');App.deleteSatelliteFundEntry('${s.id}', this)">🗑 Delete</button>`:''}
              </div>
            </div>`:''}
          </div>
        </div>`;}).join(''):'<div class="empty-table">No satellite pass-through entries recorded yet.</div>'}
    </div>`;
}

// Toggles the ⋮ dropdown menu for a single "Recent Entries" row (Edit/Delete),
// closing any other entry's menu that might already be open — mirrors the display-
// toggle pattern used elsewhere in this file (e.g. toggleWriteOffForm), just scoped
// to at most one open menu at a time since these render in a list.
function toggleSatEntryMenu(id){
  document.querySelectorAll('.sat-entry-menu').forEach(el=>{
    if(el.id !== `sat_entry_menu_${id}`) el.style.display='none';
  });
  const el = document.getElementById(`sat_entry_menu_${id}`);
  if(el) el.style.display = el.style.display==='block' ? 'none' : 'block';
}

// Edit = delete the old entry + create a fresh one with the edited values (no PATCH
// endpoint exists or is being added — see showSatelliteFundForm/showSatelliteTransferForm/
// submitSatelliteFund/submitSatelliteTransfer's editId/editEntry handling, which reuses
// the existing, already-tested create/delete paths). Known limitation, not solved here
// (same as today's plain Delete): an entry auto-linked from a Remittance Part A overage
// or a Split expense (see its note text) gets a NEW id when edited, so a parent record's
// stored satelliteFundRef would then point to a stale/deleted id.
async function editSatelliteFundEntry(id){
  const all = await DB.getSatelliteFunds();
  const entry = all.find(s=>s.id===id);
  if(!entry){ showAlert('This entry could not be found — it may have already been deleted.','danger'); return; }
  if(entry.direction === 'transfer_out'){
    if(!canAction('satellite_fund_transfer')){ showAlert('You do not have permission to edit this entry.','danger'); return; }
    showSatelliteTransferForm(entry);
  } else {
    if(!canAction('satellite_fund_record')){ showAlert('You do not have permission to edit this entry.','danger'); return; }
    showSatelliteFundForm(entry.direction, entry);
  }
}

async function showRemittancePaymentModal(part){
  if(!part) part='a'; // default
  if(!canAction('remittance_record_payment')){ showAlert('You do not have permission to record remittance payments.','danger'); return; }
  const [allIncome, settings, allUsers] = await Promise.all([DB.getIncome(), DB.getSettings(), DB.getUsers()]);
  const quotas=getQuotaList(settings);
  const fromDate=state.remFromDate||new Date(state.year,state.month,1).toISOString().split('T')[0];
  const toDate=state.remToDate||new Date().toISOString().split('T')[0];
  const income=filterByDateRange(allIncome, fromDate, toDate);
  const rem=await calcRemittancesFromRecords(income);
  const rr=await getRemRates();
  const quotaLines=getQuotaLinesForPeriod(quotas, fromDate, toDate);
  const rccgQuotaLines=quotaLines.filter(q=>!isMummyQuotaLabel(q.label));
  const mummyQuotaLines=quotaLines.filter(q=>isMummyQuotaLabel(q.label));

  let lines=[];
  let partLabel='', partDesc='', partIcon='', defaultMethod='bank_transfer';

  if(part==='a'){
    partLabel='Part A — RCCG Authorities';
    partDesc='This payment covers all remittances to RCCG National HQ, Province, Zonal authorities, and fixed quotas. Typically paid via bank transfer on the <strong>RCCG HQ portal</strong>.';
    partIcon='📤';
    // Non-TG income → National HQ
    lines.push(...rem.lines.filter(l=>!l.isTg).map(l=>({ label:l.label+' → National HQ', amount:l.national||0 })));
    // TG National HQ (75%)
    const tgNatlAmt=rem.lines.filter(l=>l.isTg).reduce((s,l)=>s+(l.national||0),0);
    if(tgNatlAmt>0) lines.push({ label:`Thanksgiving (TG) → National HQ (${Math.round(rr.tgNational*100)}%)`, amount:tgNatlAmt });
    // TG Seed → National HQ (1%)
    if((rem.totalSeed||0)>0) lines.push({ label:`Thanksgiving → Seed → National HQ (${Math.round(rr.tgSeed*100)}%)`, amount:rem.totalSeed });
    // Province Rebate
    if(rem.provinceRebate>0) lines.push({ label:`Province Rebate (${Math.round(rr.provinceRebate*100)}% of Local Retained Tithes)`, amount:rem.provinceRebate });
    // Additional RCCG Levies
    if((rem.crmAddon||0)>0) lines.push({ label:`CRM Add-on → National HQ (${Math.round(rr.crmAddon*100)}% of CRM)`, amount:rem.crmAddon });
    if((rem.coastline||0)>0) lines.push({ label:`Coastline Worship Centre (${+(((rr.coastline||0)*100).toFixed(2))}% of Min. Tithe)`, amount:rem.coastline });
    if((rem.insuranceGen||0)>0) lines.push({ label:`Insurance Fund — GEN TITHE (${+(((rr.insuranceGenTithe||0)*100).toFixed(4))}% of Mbr Tithe)`, amount:rem.insuranceGen });
    if((rem.insuranceMin||0)>0) lines.push({ label:`Insurance Fund — MIN TITHE (${+(((rr.insuranceMinTithe||0)*100).toFixed(4))}% of Min. Tithe)`, amount:rem.insuranceMin });
    // Fixed quotas (excluding Mummy Stipend)
    rccgQuotaLines.forEach(q=>{ if((q.amount||0)>0) lines.push({ label:q.label, amount:q.amount }); });
    lines=lines.filter(l=>l.amount>0);
    defaultMethod='bank_transfer';
  } else {
    partLabel='Part B — TG & Pastoral Stipend';
    partDesc='This payment covers Thanksgiving distributions to the Area Pastor, Parish Pastor, Ministers, and pastoral stipends. Paid directly to the <strong>Pastor</strong> using cash or bank transfer.';
    partIcon='🤝';
    if((rem.totalArea||0)>0) lines.push({ label:`Thanksgiving → Area / Zonal Pastor (${Math.round(rr.tgArea*100)}%)`, amount:rem.totalArea });
    if((rem.totalPastor||0)>0) lines.push({ label:`Thanksgiving → Parish Pastor's Share (${Math.round(rr.tgPastor*100)}%)`, amount:rem.totalPastor });
    if((rem.totalMinisters||0)>0) lines.push({ label:`Thanksgiving → Ministers' Share (${Math.round(rr.tgMinisters*100)}%)`, amount:rem.totalMinisters });
    mummyQuotaLines.forEach(q=>{ if((q.amount||0)>0) lines.push({ label:q.label, amount:q.amount }); });
    lines=lines.filter(l=>l.amount>0);
    defaultMethod='cash';
  }

  const totalDue=lines.reduce((s,l)=>s+l.amount,0);

  // Build signatory checkboxes from pastor + signatory roles
  const signatoryUsers=allUsers.filter(u=>['pastor','signatory','it_admin'].includes(u.role));
  const sigChecks=signatoryUsers.map(u=>`
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin-bottom:4px">
      <input type="checkbox" name="rem_sig" value="${esc(u.name)}" ${u.id===state.user?.id?'checked':''} />
      <span>${esc(u.name)}</span><span class="badge" style="font-size:10px;background:${ROLES[u.role]?.bg||'#eee'};color:${ROLES[u.role]?.color||'#333'}">${ROLES[u.role]?.label||u.role}</span>
    </label>`).join('');

  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">${partIcon} ${partLabel}</div>
    <div class="alert alert-info" style="margin:0 0 12px">
      <span class="alert-icon">ℹ</span>
      <span>${partDesc}</span>
    </div>
    <div style="background:var(--surface);border-radius:var(--r);padding:12px;margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">
        Period: ${fmtDate(fromDate)} — ${fmtDate(toDate)}
      </div>
      <div class="table-wrap" style="max-height:180px;overflow-y:auto">
        <table style="width:100%">
          ${lines.map(l=>`<tr><td style="font-size:12px;padding:4px 8px">${l.label}</td><td class="td-right td-bold" style="font-size:12px;padding:4px 8px">${fmt(l.amount)}</td></tr>`).join('')}
          <tr style="border-top:2px solid var(--border)">
            <td class="td-bold" style="padding:6px 8px">TOTAL DUE</td>
            <td class="td-right td-bold td-red" style="font-size:14px;padding:6px 8px">${fmt(totalDue)}</td>
          </tr>
        </table>
      </div>
    </div>

    ${part==='a'?`
    <!-- Area Payment (HQ pays for all parishes combined) -->
    <div style="background:var(--surface);border-radius:var(--r);padding:14px;margin-bottom:14px;border-left:3px solid var(--primary)">
      <div style="font-size:12px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">🏛️ Area Payment</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:12px">
        As Area HQ, you pay remittance for all parishes combined on the RCCG portal. Enter the <strong>total area amount</strong> paid — the system will calculate how much came from satellite parishes.
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:12px;color:var(--text2);white-space:nowrap">Our Parish Share:</span>
        <span style="font-size:15px;font-weight:700;color:var(--text)">${fmt(totalDue)}</span>
      </div>
      <div class="form-group" style="margin-bottom:8px">
        <label class="form-label">Total Amount Paid to RCCG Portal (₦)</label>
        <input type="number" id="rem_area_total" class="form-input" placeholder="Leave blank if paying only our parish share" min="0" oninput="App.onAreaTotalChange(${Math.round(totalDue)})" />
        <div class="form-hint">The exact amount debited from your bank to the RCCG portal for the entire area.</div>
      </div>
      <div id="rem_area_breakdown" style="display:none;background:#fff;border-radius:var(--r);padding:10px 12px;border:1px dashed var(--border)">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span style="color:var(--text2)">🏠 Our Parish (Kingdom Parish)</span>
          <span style="font-weight:600">${fmt(totalDue)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span style="color:var(--text2)">🏘️ Satellite Parishes (3)</span>
          <span id="rem_area_others_amt" style="font-weight:600;color:var(--primary)">₦0</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;padding-top:6px;border-top:1px solid var(--border);margin-top:4px">
          <span style="font-weight:700">Total Area Payment</span>
          <span id="rem_area_total_display" style="font-weight:700;color:var(--danger)">₦0</span>
        </div>
      </div>
    </div>
    `:''}

    <!-- Payment Method — Part A (RCCG portal remittance) is bank-transfer-only, since
         it is never paid in cash. Part B (TG & Pastoral Stipend, paid directly to the
         Pastor) keeps Cash/Split, since that IS routinely handed over as physical cash. -->
    <div class="form-group">
      <label class="form-label">Payment Method *</label>
      ${part==='a' ? `
      <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text2);margin-top:4px">
        <input type="radio" name="rem_method" value="bank_transfer" checked style="display:none" />
        🏦 Bank Transfer
      </div>
      <div class="form-hint">The RCCG portal remittance is always paid by bank transfer.</div>
      ` : `
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:4px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="rem_method" value="bank_transfer" ${defaultMethod==='bank_transfer'?'checked':''} onchange="App.onRemMethodChange()" /> 🏦 Bank Transfer only
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="rem_method" value="cash" ${defaultMethod==='cash'?'checked':''} onchange="App.onRemMethodChange()" /> 💵 Cash only
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="rem_method" value="split" onchange="App.onRemMethodChange()" /> 🏦💵 Split (Bank + Cash)
        </label>
      </div>
      `}
    </div>

    <!-- Single amount (hidden for Part A — amount comes from area payment field) -->
    ${part==='a'?'':`
    <div id="rem_single_amount_group" class="form-group">
      <label class="form-label">Amount to Pay (₦) *</label>
      <input type="number" id="rem_amount" class="form-input" value="${Math.round(totalDue)}" />
      <div class="form-hint">Calculated total: <strong>${fmt(totalDue)}</strong>. Adjust only if actual payment differs.</div>
    </div>
    `}

    <!-- Split amounts -->
    <div id="rem_split_group" style="display:none">
      <div style="background:var(--surface);border-radius:var(--r);padding:12px;margin-bottom:12px">
        <div style="font-size:12px;color:var(--text2);margin-bottom:10px">Enter the bank and cash portions — they must add up to the total due.</div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">🏦 Bank Transfer Amount (₦) *</label>
            <input type="number" id="rem_bank_amt" class="form-input" placeholder="0" min="0" oninput="App.onRemSplitChange(${Math.round(totalDue)})" />
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">💵 Cash Amount (₦) *</label>
            <input type="number" id="rem_cash_amt" class="form-input" placeholder="0" min="0" oninput="App.onRemSplitChange(${Math.round(totalDue)})" />
          </div>
        </div>
        <div id="rem_split_total_row" style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
          <span style="font-size:13px;color:var(--text2)">Total entered</span>
          <span id="rem_split_total" style="font-size:15px;font-weight:700;color:var(--text)">₦0</span>
        </div>
        <div id="rem_split_warning" style="display:none;margin-top:8px;font-size:12px;color:var(--danger);font-weight:500"></div>
      </div>
    </div>

    <div class="form-group"><label class="form-label">Payment Date *</label><input type="date" id="rem_date" class="form-input" value="${new Date().toISOString().split('T')[0]}" /></div>

    <!-- Bank reference — shown for bank transfer and split -->
    <div class="form-group" id="rem_ref_group" ${defaultMethod==='cash'?'style="display:none"':''}>
      <label class="form-label">Bank Reference / Transfer ID *</label>
      <input type="text" id="rem_ref" class="form-input" placeholder="Enter the bank transfer reference / teller number" />
      <div class="form-hint">Please also upload the bank receipt below.</div>
    </div>

    <!-- Receipt upload -->
    <div class="form-group" id="rem_receipt_group" ${defaultMethod==='cash'?'style="display:none"':''}>
      <label class="form-label">Bank Receipt / Teller Scan (optional)</label>
      <input type="file" id="rem_receipt" class="form-input" accept="image/*,.pdf" style="padding:4px" />
      <div class="form-hint">Attach a scan or photo of the bank teller/transfer confirmation for audit purposes.</div>
    </div>

    <!-- Authorized By — checklist of pastor + signatories -->
    <div class="form-group">
      <label class="form-label">Authorized By (Signatories) *</label>
      ${sigChecks||`<input type="text" id="rem_auth_text" class="form-input" placeholder="Names of authorizing signatories" value="${esc(state.user?.name||'')}" />`}
    </div>

    <div class="form-group"><label class="form-label">Notes (optional)</label><textarea id="rem_notes" class="form-textarea" rows="2" placeholder="Any additional notes…"></textarea></div>
    <input type="hidden" id="rem_total_due" value="${totalDue}" />
    <input type="hidden" id="rem_part" value="${part}" />
    <input type="hidden" id="rem_breakdown_snapshot" value='${JSON.stringify(lines).replace(/'/g,"&#39;")}' />

    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitRemittance(this)">✅ Record as Paid</button>
    </div>`);
  // Trigger method change to sync visibility
  onRemMethodChange();
}

function onRemMethodChange(){
  const method=document.querySelector('input[name="rem_method"]:checked')?.value||'bank_transfer';
  const singleGrp=document.getElementById('rem_single_amount_group');
  const splitGrp=document.getElementById('rem_split_group');
  const refGroup=document.getElementById('rem_ref_group');
  const receiptGroup=document.getElementById('rem_receipt_group');
  const isSplit=method==='split';
  const isBank=method==='bank_transfer'||isSplit;
  if(singleGrp) singleGrp.style.display=isSplit?'none':'';
  if(splitGrp)  splitGrp.style.display=isSplit?'':'none';
  if(refGroup)  refGroup.style.display=isBank?'':'none';
  if(receiptGroup) receiptGroup.style.display=isBank?'':'none';
}

function onRemSplitChange(totalDue){
  // For Part A (Area Payment), the split fields fund the WHOLE area total — not just
  // our own parish share (totalDue), which is what this function is normally called
  // with (baked in at render time — see showRemittancePaymentModal). Re-target the
  // validation live against rem_area_total whenever one is entered, so Bank+Cash are
  // checked against what the officer is actually paying, not just our own obligation.
  const part = document.getElementById('rem_part')?.value || '';
  const areaTotal = part==='a' ? (parseFloat(document.getElementById('rem_area_total')?.value)||0) : 0;
  const target = areaTotal > 0 ? areaTotal : totalDue;
  const bank=parseFloat(document.getElementById('rem_bank_amt')?.value)||0;
  const cash=parseFloat(document.getElementById('rem_cash_amt')?.value)||0;
  const total=bank+cash;
  const totalEl=document.getElementById('rem_split_total');
  const warnEl=document.getElementById('rem_split_warning');
  if(totalEl) totalEl.textContent=fmt(total);
  if(totalEl) totalEl.style.color=Math.abs(total-target)<1?'var(--success)':total>target?'var(--danger)':'var(--text)';
  if(warnEl){
    if(total>target){
      warnEl.style.display='block';
      warnEl.textContent=`Total entered (${fmt(total)}) exceeds the amount due (${fmt(target)}) by ${fmt(total-target)}.`;
    } else if(total<target && total>0){
      warnEl.style.display='block';
      warnEl.style.color='var(--amber)';
      warnEl.textContent=`${fmt(target-total)} still unaccounted for. This will be recorded as a partial payment.`;
    } else {
      warnEl.style.display='none';
    }
  }
}

function onAreaTotalChange(ourParishShare){
  const areaTotal=parseFloat(document.getElementById('rem_area_total')?.value)||0;
  const breakdownEl=document.getElementById('rem_area_breakdown');
  const othersEl=document.getElementById('rem_area_others_amt');
  const totalDisplayEl=document.getElementById('rem_area_total_display');
  if(breakdownEl){
    if(areaTotal>0){
      const othersAmt=Math.max(0, areaTotal-ourParishShare);
      breakdownEl.style.display='block';
      if(othersEl) othersEl.textContent=fmt(othersAmt);
      if(totalDisplayEl) totalDisplayEl.textContent=fmt(areaTotal);
    } else {
      breakdownEl.style.display='none';
    }
  }
  // The Bank/Cash split fields (if shown) validate against the area total once one is
  // entered — see onRemSplitChange — so re-validate live as the area total changes.
  if(document.querySelector('input[name="rem_method"]:checked')?.value==='split'){
    onRemSplitChange(ourParishShare);
  }
}

async function submitRemittance(btn=null){
  const part = document.getElementById('rem_part')?.value || '';
  const method = document.querySelector('input[name="rem_method"]:checked')?.value||'bank_transfer';
  const isSplit=method==='split';
  const date=document.getElementById('rem_date')?.value;
  const reference=(document.getElementById('rem_ref')?.value||'').trim();
  const notes=(document.getElementById('rem_notes')?.value||'').trim();

  // Collect selected signatories
  const checkedBoxes=[...document.querySelectorAll('input[name="rem_sig"]:checked')].map(c=>c.value);
  const authText=(document.getElementById('rem_auth_text')?.value||'').trim();
  const auth=checkedBoxes.length>0?checkedBoxes.join(', '):authText;

  // Resolve amounts
  let amount, bankAmount, cashAmount;
  if(part==='a'){
    // Part A: our parish share (parishShare) is always the remittance's own "amount"
    // (the parish's own due obligation — used for remittance-specific reporting and
    // left UNCHANGED by this) — but the money that actually left the bank/cash on
    // THIS payment covers paidTotal, the WHOLE area if an Area Payment total was
    // entered (see rem_area_total), and may be split across payment methods just
    // like a normal remittance. Resolve bankAmount/cashAmount against paidTotal,
    // respecting whichever Payment Method radio is selected — same resolution the
    // non-Part-A branch below uses; Part A just targets paidTotal instead of a fixed
    // rem_amount field (Part A doesn't render one — see showRemittancePaymentModal).
    // Previously this always forced bankAmount=areaTotal/cashAmount=0 regardless of
    // the selected method, silently ignoring Cash/Split for Part A — fixed here.
    const parishShare = parseFloat(document.getElementById('rem_total_due')?.value) || 0;
    const areaTotal = parseFloat(document.getElementById('rem_area_total')?.value) || 0;
    const paidTotal = areaTotal > 0 ? areaTotal : parishShare;
    amount = parishShare;
    if(isSplit){
      bankAmount=parseFloat(document.getElementById('rem_bank_amt')?.value)||0;
      cashAmount=parseFloat(document.getElementById('rem_cash_amt')?.value)||0;
      if(!bankAmount&&!cashAmount){ showAlert('Please enter at least one payment amount.','danger'); return }
      if(bankAmount>0&&!reference){ showAlert('Please enter the bank transfer reference number for the bank portion.','danger'); return }
    } else {
      bankAmount = method==='bank_transfer' ? paidTotal : 0;
      cashAmount = method==='cash' ? paidTotal : 0;
    }
    if(!areaTotal && !parishShare){ showAlert('Please enter the total amount paid to the RCCG portal.','danger'); return; }
    if(areaTotal > 0 && areaTotal < parishShare){ showAlert('The total area payment cannot be less than our parish share.','danger'); return; }
  } else if(isSplit){
    bankAmount=parseFloat(document.getElementById('rem_bank_amt')?.value)||0;
    cashAmount=parseFloat(document.getElementById('rem_cash_amt')?.value)||0;
    amount=bankAmount+cashAmount;
    if(!bankAmount&&!cashAmount){ showAlert('Please enter at least one payment amount.','danger'); return }
    if(bankAmount>0&&!reference){ showAlert('Please enter the bank transfer reference number for the bank portion.','danger'); return }
  } else {
    amount=parseFloat(document.getElementById('rem_amount')?.value)||0;
    bankAmount=method==='bank_transfer'?amount:0;
    cashAmount=method==='cash'?amount:0;
  }

  if(part==='a'){
    const areaTotal = parseFloat(document.getElementById('rem_area_total')?.value) || 0;
    if(!areaTotal&&!amount){ showAlert('Please enter the total amount paid to the RCCG portal.','danger'); return; }
    if(!date){ showAlert('Please enter the payment date.','danger'); return; }
  } else if(!amount||!date){ showAlert('Please enter the amount and payment date.','danger'); return; }
  if(method==='bank_transfer'&&!reference){ showAlert('Please enter the bank transfer reference number.','danger'); return }
  if(!auth){ showAlert('Please select or enter the authorizing signatories.','danger'); return }

  // Encode receipt file if provided — only the filename is persisted (appended to notes below).
  // The remittances table has no receipt image column; the filename serves as the audit reference.
  const receiptFile=document.getElementById('rem_receipt')?.files?.[0];
  const receiptFileName=receiptFile?.name||'';

  const fromDate=state.remFromDate||new Date(state.year,state.month,1).toISOString().split('T')[0];
  const toDate=state.remToDate||new Date().toISOString().split('T')[0];

  const isSuperUser=['it_admin','pastor'].includes(state.user?.role);
  const status='paid';

  // Build a clear description of how payment was split
  const methodLabel=isSplit
    ? `Split — Bank: ${fmt(bankAmount)} + Cash: ${fmt(cashAmount)}`
    : method==='bank_transfer'?'Bank Transfer':'Cash';

  const restore = setBtnLoading(btn, 'Submitting…');
  // Declared outside the try block so the catch handler below can see whether the
  // satellite fund auto-link (see Part A below) succeeded before DB.addRemittance
  // failed, and roll it back if so.
  let satelliteFundRef = '';
  try {
    const dueAtTimeOfPayment = parseFloat(document.getElementById('rem_total_due')?.value) || 0;
    const breakdownSnapshot = document.getElementById('rem_breakdown_snapshot')?.value || '';
    const areaTotalPaid = parseFloat(document.getElementById('rem_area_total')?.value) || 0;
    const otherParishesAmount = areaTotalPaid > 0 ? Math.max(0, areaTotalPaid - dueAtTimeOfPayment) : 0;
    const partLabel = part==='a'?'Part A — RCCG Authorities':part==='b'?'Part B — TG & Pastoral':'RCCG Monthly Remittance';

    // Funding source for the auto-linked satellite_funds 'out' entry below (the
    // satellite-parish overage). An Area Payment overage only exists for Part A,
    // and Part A is bank-transfer-only (its form renders no Cash/Split option —
    // see showRemittancePaymentModal), so the overage is always bank-funded.
    const satFundChannel = 'bank';

    // Auto-link a satellite_funds 'out' entry for the satellite-parish overage BEFORE
    // creating the remittance row, so its id can be stored on the remittance for
    // deleteRemittance to reverse later (see createRemittance/deleteRemittance in
    // functions/api/[[route]].js). This is pass-through money paid on the satellites'
    // behalf, never our own remittance/expense — exactly like any other Satellite/
    // Zone Pool payout (see calcChurchBalance/createSatelliteFund) — so the pool's
    // held balance and the real bank/petty/cash balance both stay correct without
    // touching paidRems, which continues to represent only our own true obligation.
    if(part === 'a' && otherParishesAmount > 0){
      const satNote = `Auto-linked from Remittance Part A — Area Payment (Ref: ${reference||'—'})`;
      const satResult = await DB.addSatelliteFund({
        direction:'out', purpose:'province_remittance', amount: otherParishesAmount, date,
        note: satNote, reference, recordedBy: state.user?.name||'', channel: satFundChannel
      });
      satelliteFundRef = satResult?.id || '';
    }

    await DB.addRemittance({
      label:partLabel, amount, paidDate:date,
      reference, authorizedBy:auth,
      notes:(receiptFileName?`Receipt: ${receiptFileName}\n`:'')+notes,
      paymentMethod:method,
      bankAmount, cashAmount,
      periodFrom:fromDate, periodTo:toDate,
      submittedBy:state.user?.name||'',
      status,
      dueAtTimeOfPayment,
      part,
      breakdownSnapshot,
      areaTotalPaid,
      otherParishesAmount,
      satelliteFundRef,
    });
    DB.addAudit('remittance_submitted',
      `Remittance paid: ${fmt(amount)} (${methodLabel}) — Period: ${fromDate} to ${toDate}${reference?' — Ref: '+reference:''}${areaTotalPaid>0?' — Area total: '+fmt(areaTotalPaid)+' (other parishes: '+fmt(otherParishesAmount)+')':''}${satelliteFundRef?' — satellite share auto-linked to the Satellite/Zone Pool':''}`,
      state.user?.name);
    DB.addNotification('Remittance Recorded',`RCCG remittance of ${fmt(amount)} paid (${methodLabel}) for period ${fmtDate(fromDate)} – ${fmtDate(toDate)}.`,'success');
    closeModal();
    showAlert(`Remittance of ${fmt(amount)} recorded and marked as paid!${satelliteFundRef?` 🛰️ ${fmt(otherParishesAmount)} satellite share drawn from the pool.`:''}`,'success');
    state.remFromDate=null; state.remToDate=null;
    renderRemittances();
  } catch(err) {
    restore();
    // If the satellite fund auto-link (Part A overage) was created above but the
    // remittance itself then failed to save, that satellite_funds 'out' entry (and
    // its bank/petty mirror) is now an orphan for a payment that, from the real
    // world's perspective, never completed. Left alone, a retry per the error
    // message below would create a SECOND satellite fund entry for the same
    // real-world payment — silently double-debiting the pool. Roll it back first,
    // in its own try/catch so a rollback failure never masks the original error.
    let rollbackFailed = false;
    if(satelliteFundRef){
      try {
        await DB.deleteSatelliteFund(satelliteFundRef);
      } catch(rollbackErr) {
        rollbackFailed = true;
      }
    }
    const rollbackNote = satelliteFundRef
      ? (rollbackFailed
          ? ' A linked Satellite/Zone Pool entry was created before this failure and could NOT be automatically rolled back — please check the Satellite/Zone Pool panel for a duplicate/orphaned entry before retrying.'
          : ' (A linked Satellite/Zone Pool entry created moments ago was automatically rolled back — safe to retry.)')
      : '';
    showAlert(`Failed to submit remittance: ${err.message||'Unknown error'}. Please try again.${rollbackNote}`,'danger');
  }
}

async function approveRemittance(id, btn=null){
  if(!can('signoff')){ showAlert('You do not have permission to approve remittances.','danger'); return; }
  if(!confirm('Approve this remittance payment?')) return;
  const restore = setBtnLoading(btn, 'Approving…');
  try {
    await DB.updateRemittance(id,{
      status:'paid',
      approvedBy:state.user?.name||'',
      approvedAt:new Date().toISOString().split('T')[0]
    });
    DB.addAudit('remittance_approved',`Remittance ${id} approved by ${state.user?.name||'—'}`,state.user?.name);
    DB.addNotification('Remittance Approved',`Remittance payment approved by ${state.user?.name||'—'} and marked as paid.`,'success');
    showAlert('Remittance approved and marked as paid!','success');
    renderRemittances();
  } catch(err) {
    restore();
    showAlert(`Failed to approve remittance: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

async function deleteRemittance(id, btn=null){
  if(!canAction('remittance_delete_pending')){ showAlert('You do not have permission to delete pending remittances.','danger'); return; }
  const allRems = await DB.getRemittances();
  const rem = allRems.find(r=>r.id===id);
  if(!rem) return;
  if(rem.status !== 'pending_approval'){ showAlert('Only pending remittances can be deleted.','danger'); return; }
  const periodLabel = rem.periodFrom && rem.periodTo ? ` for period ${fmtDate(rem.periodFrom)} – ${fmtDate(rem.periodTo)}` : '';
  if(!confirm(`Delete this pending remittance (${fmt(rem.amount)})${periodLabel}?\n\nThis will cancel the submission and reverse the pending approval notification. This action cannot be undone.`)) return;
  const restore = setBtnLoading(btn, 'Deleting…');
  try {
    await DB.deleteRemittance(id);
    DB.addAudit('remittance_deleted',
      `Pending remittance deleted/reversed: ${id} (${fmt(rem.amount)})${periodLabel} — Submitted by: ${rem.submittedBy||'—'}`,
      state.user?.name);
    showAlert('Pending remittance deleted and reversed successfully.','warn');
    renderRemittances();
  } catch(err) {
    restore();
    showAlert(`Failed to delete remittance: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

// ── Satellite / Zone Pass-Through Fund ──────────────────────────────────────
// `editEntry` (optional): the existing satellite_funds row being edited (from
// editSatelliteFundEntry) — pre-fills every field and switches submitSatelliteFund
// into delete-old+create-new mode via the editId argument on its submit button.
function showSatelliteFundForm(direction, editEntry){
  if(!canAction('satellite_fund_record')){ showAlert('You do not have permission to record satellite pass-through funds.','danger'); return; }
  const isIn = direction === 'in';
  const isEdit = !!editEntry;
  const today = new Date().toISOString().split('T')[0];
  const fDate = editEntry?.date || today;
  const fAmount = editEntry?.amount ?? '';
  const fPurpose = editEntry?.purpose || '';
  const fChannel = editEntry?.channel || 'bank';
  const fNote = editEntry?.note || '';
  const fReference = editEntry?.reference || '';
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">${isEdit ? '✏️ Edit Entry' : (isIn?'📥 Satellite Funds In':'📤 Satellite Funds Out')}</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>${isEdit
      ? 'Editing this entry replaces it: the original is deleted (reversing its bank/petty mirror) and a new one is created with your changes — its id will change.'
      : (isIn
        ? 'Record money received from a satellite parish for Province remittance or a joint area/zone payment. This is not our own income.'
        : 'Record money forwarded to Province or a joint area/zone payment on behalf of the satellite parishes. This is not our own expense.')}</span></div>
    <div class="form-group"><label class="form-label">Date *</label>
      <input type="date" id="sf_date" class="form-input" value="${fDate}" max="${today}" />
    </div>
    <div class="form-group"><label class="form-label">Amount (₦) *</label>
      <input type="number" id="sf_amount" class="form-input" placeholder="0" min="0" value="${fAmount}" />
    </div>
    <div class="form-group"><label class="form-label">Purpose *</label>
      <select id="sf_purpose" class="form-select">
        ${SATELLITE_FUND_PURPOSES.map(p=>`<option value="${p.key}" ${p.key===fPurpose?'selected':''}>${p.label}</option>`).join('')}
      </select>
    </div>
    ${isIn?`
    <div class="form-group"><label class="form-label">Received Via *</label>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="sf_channel" value="bank" ${fChannel!=='cash'?'checked':''} /> 🏦 Bank Transfer
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="sf_channel" value="cash" ${fChannel==='cash'?'checked':''} /> 💵 Cash (with Accountant)
        </label>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">Cash sits with the Accountant until deposited to the bank via the normal cash-deposit flow — no separate bank movement is created here.</div>
    </div>`:`
    <div class="form-group"><label class="form-label">Paid Via *</label>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px">
        ${getPoolPaidViaOptionsForRole(state.user?.role).map(m=>`
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="radio" name="sf_channel" value="${m.value}" ${m.value===fChannel?'checked':''} /> ${m.label}
          </label>`).join('')}
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">How this pool payout was actually funded — Bank Transfer mirrors a bank withdrawal, Petty Cash/Cash (Accountant) do not touch the bank.</div>
    </div>`}
    <div class="form-group"><label class="form-label">Note <span style="font-size:11px;color:var(--text3)">(optional — e.g. which satellite parish)</span></label>
      <input type="text" id="sf_note" class="form-input" placeholder="e.g. Parish A – July remittance" value="${esc(fNote)}" />
    </div>
    <div class="form-group"><label class="form-label">Reference <span style="font-size:11px;color:var(--text3)">(optional)</span></label>
      <input type="text" id="sf_reference" class="form-input" placeholder="Bank reference / teller no." value="${esc(fReference)}" />
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="sf_submit_btn" onclick="App.submitSatelliteFund('${direction}', this${isEdit?`, '${editEntry.id}'`:''})">${isEdit ? 'Save Changes' : (isIn?'Record Funds In':'Record Funds Out')}</button>
    </div>`);
}

// `editId` (optional): the id of the entry being replaced — see showSatelliteFundForm's
// editEntry / editSatelliteFundEntry. No PATCH endpoint exists (or is being added); an
// edit is implemented as delete-old-then-create-new, reusing the existing, already-
// tested createSatelliteFund/deleteSatelliteFund paths. The delete runs FIRST (so a
// duplicate never briefly exists) in its own try/catch — if it fails, nothing changed
// and the user is told plainly to retry. The create runs second in its own try/catch —
// if THAT fails after the delete already succeeded, the old entry is genuinely gone; no
// automatic re-creation is attempted (same rollback-safety spirit as submitRemittance's
// Part A auto-link fix), the user is told exactly that and asked to re-enter it.
async function submitSatelliteFund(direction, btn=null, editId=null){
  if(!canAction('satellite_fund_record')){ showAlert('You do not have permission to record satellite pass-through funds.','danger'); return; }
  const date      = document.getElementById('sf_date')?.value;
  const amount    = parseFloat(document.getElementById('sf_amount')?.value)||0;
  const purpose   = document.getElementById('sf_purpose')?.value||'other';
  // Channel: 'in' uses bank|cash (Received Via); 'out' uses bank|petty_cash|cash_accountant
  // (Paid Via) — see createSatelliteFund/calcChurchBalance for how each funding source
  // mirrors (or doesn't). 'transfer_out' never reaches this function — see submitSatelliteTransfer.
  const channel   = (document.querySelector('input[name="sf_channel"]:checked')?.value)||(direction==='in'?'bank':'bank');
  const note      = document.getElementById('sf_note')?.value?.trim()||'';
  const reference = document.getElementById('sf_reference')?.value?.trim()||'';
  if(!date||!amount){ showAlert('Please fill in the date and amount.','danger'); return; }

  const isEdit = !!editId;
  const restore = setBtnLoading(btn, 'Saving…');

  if(isEdit){
    try {
      await DB.deleteSatelliteFund(editId);
    } catch(err) {
      restore();
      showAlert(`Failed to update: could not remove the original entry (${err.message||'Unknown error'}). Nothing was changed — please try again.`,'danger');
      return;
    }
  }
  try {
    await DB.addSatelliteFund({ date, direction, amount, purpose, channel, note, reference, recordedBy:state.user?.name||'' });
  } catch(err) {
    restore();
    if(isEdit){
      showAlert(`The original entry was removed, but saving the updated entry failed (${err.message||'Unknown error'}). It was NOT automatically restored — please re-enter this satellite fund entry manually in the Satellite/Zone Pool panel.`,'danger');
    } else {
      showAlert(`Failed to record satellite pass-through fund: ${err.message||'Unknown error'}. Please try again.`,'danger');
    }
    return;
  }

  const purposeLabel = SATELLITE_FUND_PURPOSES.find(p=>p.key===purpose)?.label||purpose;
  const channelLabel = channel==='cash' ? ' (received as cash with Accountant)'
    : channel==='petty_cash' ? ' (paid via Petty Cash)'
    : channel==='cash_accountant' ? ' (paid via Cash — Accountant)'
    : '';
  DB.addAudit(isEdit ? 'satellite_fund_edited' : 'satellite_fund_recorded',
    `Satellite pass-through fund ${isEdit ? 'edited' : (direction==='in'?'received':'paid out')}: ${fmt(amount)} (${purposeLabel})${channelLabel}${note?' — '+note:''}${reference?' — Ref: '+reference:''}${isEdit?` (was ${editId})`:''}`,
    state.user?.name);
  DB.addNotification(isEdit ? 'Satellite Pass-Through Fund Edited' : 'Satellite Pass-Through Fund Recorded',
    `${fmt(amount)} ${direction==='in'?'received from':'paid out on behalf of'} a satellite parish (${purposeLabel})${channelLabel}.`,'success');
  closeModal();
  showAlert(isEdit ? `Entry updated — ${fmt(amount)} recorded.` : `Satellite pass-through fund of ${fmt(amount)} recorded!`,'success');
  if(state.page==='income') renderIncome(); else renderRemittances();
}

// ── Satellite / Zone Funds Received — Income page entry point ───────────────────
// A dedicated pair (rather than reusing showSatelliteFundForm('in')/submitSatelliteFund)
// because that pair always refreshes the Remittances page on success; this one must
// refresh Income instead. Same backend call (DB.addSatelliteFund, direction:'in') and
// the same SATELLITE_FUND_PURPOSES list as the Remittances pool panel, so both entry
// points stay numerically and semantically identical — only the copy/refresh differ.
function showSatelliteFundsInForm(){
  if(!canAction('satellite_fund_record')){ showAlert('You do not have permission to record satellite pass-through funds.','danger'); return; }
  const today = new Date().toISOString().split('T')[0];
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">🛰️ Satellite / Zone Funds Received</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>Record money received from a satellite parish — for Province remittance, a joint area/zone payment, or another purpose. This is <strong>pass-through money, not the parish's own income</strong> — it is never added to income totals.</span></div>
    <div class="form-group"><label class="form-label">Date *</label>
      <input type="date" id="sfi_date" class="form-input" value="${today}" max="${today}" />
    </div>
    <div class="form-group"><label class="form-label">Amount (₦) *</label>
      <input type="number" id="sfi_amount" class="form-input" placeholder="0" min="0" />
    </div>
    <div class="form-group"><label class="form-label">Purpose *</label>
      <select id="sfi_purpose" class="form-select">
        ${SATELLITE_FUND_PURPOSES.map(p=>`<option value="${p.key}">${p.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label class="form-label">Received Via *</label>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="sfi_channel" value="bank" checked /> 🏦 Bank Transfer
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="sfi_channel" value="cash" /> 💵 Cash (with Accountant)
        </label>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">Cash sits with the Accountant until deposited to the bank via the normal cash-deposit flow — no separate bank movement is created here.</div>
    </div>
    <div class="form-group"><label class="form-label">Note <span style="font-size:11px;color:var(--text3)">(optional — e.g. which satellite parish and what it's for)</span></label>
      <input type="text" id="sfi_note" class="form-input" placeholder="e.g. Parish A – July remittance" />
    </div>
    <div class="form-group"><label class="form-label">Reference <span style="font-size:11px;color:var(--text3)">(optional)</span></label>
      <input type="text" id="sfi_reference" class="form-input" placeholder="Bank reference / teller no." />
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitSatelliteFundsIn(this)">Record Funds Received</button>
    </div>`);
}

async function submitSatelliteFundsIn(btn=null){
  if(!canAction('satellite_fund_record')){ showAlert('You do not have permission to record satellite pass-through funds.','danger'); return; }
  const date      = document.getElementById('sfi_date')?.value;
  const amount    = parseFloat(document.getElementById('sfi_amount')?.value)||0;
  const purpose   = document.getElementById('sfi_purpose')?.value||'other';
  const channel   = document.querySelector('input[name="sfi_channel"]:checked')?.value||'bank';
  const note      = document.getElementById('sfi_note')?.value?.trim()||'';
  const reference = document.getElementById('sfi_reference')?.value?.trim()||'';
  if(!date||!amount){ showAlert('Please fill in the date and amount.','danger'); return; }

  const restore = setBtnLoading(btn, 'Saving…');
  try {
    // direction:'in' — a bank-channel receipt mirrors a bank deposit server-side; a
    // cash-channel receipt sits with the Accountant instead (see calcChurchBalance's
    // satelliteCashIn term) — either way heldForSatellites increases. Deliberately NOT
    // DB.addIncome — this money must never enter the income table/totals.
    await DB.addSatelliteFund({ date, direction:'in', amount, purpose, channel, note, reference, recordedBy:state.user?.name||'' });
    const purposeLabel = SATELLITE_FUND_PURPOSES.find(p=>p.key===purpose)?.label||purpose;
    const channelLabel = channel==='cash' ? ' (received as cash with Accountant)' : '';
    DB.addAudit('satellite_fund_recorded',
      `Satellite pass-through fund received (via Income page): ${fmt(amount)} (${purposeLabel})${channelLabel}${note?' — '+note:''}${reference?' — Ref: '+reference:''}`,
      state.user?.name);
    DB.addNotification('Satellite Funds Received',`${fmt(amount)} received from a satellite parish (${purposeLabel})${channelLabel} — not counted as parish income.`,'success');
    closeModal();
    showAlert(`${fmt(amount)} recorded as satellite pass-through funds received — not counted as parish income.`,'success');
    renderIncome();
  } catch(err) {
    restore();
    showAlert(`Failed to record satellite funds received: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

async function deleteSatelliteFundEntry(id, btn=null){
  if(!canAction('satellite_fund_delete')){ showAlert('You do not have permission to delete satellite pass-through fund entries.','danger'); return; }
  const all = await DB.getSatelliteFunds();
  const entry = all.find(s=>s.id===id);
  if(!entry) return;
  // A transfer_out entry has no bank mirror — deleting it only reverses the held
  // reduction (heldForSatellites goes back up, available total goes back down); an
  // in/out entry also reverses the matching cash_transactions bank movement.
  const hasBankMirror = !!entry.bankRef;
  const reverseMsg = hasBankMirror ? 'This will also reverse the matching bank transaction.' : 'This has no bank transaction (transfers move no cash) — it will simply restore the held balance.';
  if(!confirm(`Delete this satellite pass-through fund entry (${fmt(entry.amount)})?\n\n${reverseMsg} This action cannot be undone.`)) return;
  const restore = setBtnLoading(btn, 'Deleting…');
  try {
    await DB.deleteSatelliteFund(id);
    const directionLabel = entry.direction==='in' ? 'received' : entry.direction==='out' ? 'paid out' : 'transferred to parish';
    DB.addAudit('satellite_fund_deleted',
      `Satellite pass-through fund entry deleted: ${id} (${fmt(entry.amount)}, ${directionLabel})${hasBankMirror?' — bank movement reversed':' — held balance restored'}`,
      state.user?.name);
    showAlert(`Satellite pass-through fund entry deleted${hasBankMirror?' and bank movement reversed':''}.`,'warn');
    // Callable from both the Remittances pool panel and the Income page's satellite
    // receipts section — refresh whichever one is actually on screen.
    if(state.page==='income') renderIncome(); else renderRemittances();
  } catch(err) {
    restore();
    showAlert(`Failed to delete satellite pass-through fund entry: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

// `editEntry` (optional): the existing satellite_funds transfer_out row being edited
// (from editSatelliteFundEntry) — pre-fills every field and switches
// submitSatelliteTransfer into delete-old+create-new mode via editId.
function showSatelliteTransferForm(editEntry){
  if(!canAction('satellite_fund_transfer')){ showAlert('You do not have permission to transfer satellite pass-through funds.','danger'); return; }
  const isEdit = !!editEntry;
  const today = new Date().toISOString().split('T')[0];
  const fDate = editEntry?.date || today;
  const fAmount = editEntry?.amount ?? '';
  const fReason = editEntry?.purpose || '';
  const fNote = editEntry?.note || '';
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">${isEdit ? '✏️ Edit Entry' : '🔁 Transfer to Parish'}</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>${isEdit
      ? 'Editing this entry replaces it: the original is deleted and a new one is created with your changes — its id will change.'
      : 'Moves some or all of the satellite pool\'s held balance into the parish\'s own money. This money is <strong>already in the bank</strong> (it arrived as a satellite deposit) — no bank transaction is created; only the held balance changes.'}</span></div>
    <div class="form-group"><label class="form-label">Date *</label>
      <input type="date" id="st_date" class="form-input" value="${fDate}" max="${today}" />
    </div>
    <div class="form-group"><label class="form-label">Amount (₦) *</label>
      <input type="number" id="st_amount" class="form-input" placeholder="0" min="0" value="${fAmount}" />
    </div>
    <div class="form-group"><label class="form-label">Reason *</label>
      <select id="st_reason" class="form-select">
        ${SATELLITE_TRANSFER_REASONS.map(p=>`<option value="${p.key}" ${p.key===fReason?'selected':''}>${p.label}</option>`).join('')}
      </select>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">The reason only changes how this shows up in reports — Gift/Surplus is counted as parish income; Reimbursement and Correction are memo-only.</div>
    </div>
    <div class="form-group"><label class="form-label">Note <span style="font-size:11px;color:var(--text3)">(optional)</span></label>
      <input type="text" id="st_note" class="form-input" placeholder="e.g. Parish A left surplus after July remittance" value="${esc(fNote)}" />
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="st_submit_btn" onclick="App.submitSatelliteTransfer(this${isEdit?`, '${editEntry.id}'`:''})">${isEdit ? 'Save Changes' : 'Transfer to Parish'}</button>
    </div>`);
}

// `editId` (optional): see submitSatelliteFund's matching doc comment above — same
// delete-old-then-create-new sequencing and failure handling, applied to transfer_out.
async function submitSatelliteTransfer(btn=null, editId=null){
  if(!canAction('satellite_fund_transfer')){ showAlert('You do not have permission to transfer satellite pass-through funds.','danger'); return; }
  const date   = document.getElementById('st_date')?.value;
  const amount = parseFloat(document.getElementById('st_amount')?.value)||0;
  const reason = document.getElementById('st_reason')?.value||'gift';
  const note   = document.getElementById('st_note')?.value?.trim()||'';
  if(!date||!amount){ showAlert('Please fill in the date and amount.','danger'); return; }

  const isEdit = !!editId;
  const restore = setBtnLoading(btn, 'Saving…');

  if(isEdit){
    try {
      await DB.deleteSatelliteFund(editId);
    } catch(err) {
      restore();
      showAlert(`Failed to update: could not remove the original entry (${err.message||'Unknown error'}). Nothing was changed — please try again.`,'danger');
      return;
    }
  }
  try {
    await DB.addSatelliteFund({ date, direction:'transfer_out', amount, purpose:reason, note, recordedBy:state.user?.name||'' });
    const reasonLabel = SATELLITE_TRANSFER_REASONS.find(p=>p.key===reason)?.label||reason;
    DB.addAudit(isEdit ? 'satellite_fund_edited' : 'satellite_fund_transferred',
      `${fmt(amount)} transferred from satellite pool to parish (${reasonLabel})${note?' — '+note:''}${isEdit?` (edited, was ${editId})`:''}. No bank movement — already in the bank.`,
      state.user?.name);
    DB.addNotification(isEdit ? 'Satellite Fund Transfer Edited' : 'Satellite Funds Transferred to Parish',`${fmt(amount)} reclassified from the satellite pool as parish money (${reasonLabel}).`,'success');
    closeModal();
    showAlert(isEdit ? `Entry updated — ${fmt(amount)} recorded.` : `${fmt(amount)} transferred to parish funds!`,'success');
    if(state.page==='income') renderIncome(); else renderRemittances();
  } catch(err) {
    restore();
    if(isEdit){
      showAlert(`The original entry was removed, but saving the updated entry failed (${err.message||'Unknown error'}). It was NOT automatically restored — please re-enter this transfer manually in the Satellite/Zone Pool panel.`,'danger');
    } else {
      showAlert(`Failed to record transfer: ${err.message||'Unknown error'}. Please try again.`,'danger');
    }
  }
}

const WRITE_OFF_REASONS = [
  'Approved by Area/Zonal Pastor',
  'Small variance (rounding/pro-rata adjustment)',
  'Data correction',
  'Other (specify below)'
];

/** Modal listing every settled period with an unreconciled shortfall (dashboard's
 *  RCCG Remittance Due tile "Reconcile →" link). Lets the accountant write off a
 *  shortfall with a recorded reason instead of it silently vanishing. */
function openReconcileModal(){
  const periods = state.reconcileShortfalls || [];
  if(!periods.length){ showAlert('No unreconciled shortfalls found.','info'); return; }
  if(!canAction('remittance_record_payment')){ showAlert('You do not have permission to reconcile remittances.','danger'); return; }
  const rows = periods.map((p,idx)=>`
    <div class="card" style="margin-bottom:10px;padding:12px 14px" id="wo_row_${idx}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div>
          <div style="font-weight:700;font-size:13px">${fmtDate(p.from)} – ${fmtDate(p.to)}</div>
          <div style="font-size:11.5px;color:var(--text3);margin-top:3px">
            Due: <strong>${fmt(p.due)}</strong> · Paid: <strong>${fmt(p.paid)}</strong>${p.writtenOff>0?` · Written off: <strong>${fmt(p.writtenOff)}</strong>`:''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:15px;font-weight:800;color:var(--danger)">${fmt(p.shortfall)}</div>
          <button class="btn btn-sm btn-amber" style="margin-top:4px" onclick="App.toggleWriteOffForm(${idx})">⚖️ Write Off</button>
        </div>
      </div>
      <div id="wo_form_${idx}" style="display:none;margin-top:12px;padding-top:12px;border-top:1px dashed var(--border)">
        <div class="form-group">
          <label class="form-label">Amount to Write Off *</label>
          <input type="number" id="wo_amount_${idx}" class="form-input" value="${p.shortfall.toFixed(2)}" min="0.01" max="${p.shortfall}" step="0.01" />
        </div>
        <div class="form-group">
          <label class="form-label">Reason *</label>
          <select id="wo_reason_${idx}" class="form-input" onchange="App.onWriteOffReasonChange(${idx})">
            ${WRITE_OFF_REASONS.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" id="wo_notes_label_${idx}">Notes</label>
          <textarea id="wo_notes_${idx}" class="form-input" rows="2" placeholder="Additional detail (required for 'Other')"></textarea>
        </div>
        <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--text2);margin-bottom:12px">
          <input type="checkbox" id="wo_confirm_${idx}" style="margin-top:2px" />
          <span>I have authorization to record this write-off.</span>
        </label>
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button class="btn btn-sm" onclick="App.toggleWriteOffForm(${idx})">Cancel</button>
          <button class="btn btn-sm btn-primary" onclick="App.submitWriteOff(${idx}, this)">Confirm Write-Off</button>
        </div>
      </div>
    </div>`).join('');
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">⚖️ Reconcile Prior-Period Shortfalls</div>
    <div class="alert alert-info" style="margin-bottom:14px"><span class="alert-icon">ℹ</span><span>These settled periods were paid for less than the true amount due. Pay the balance separately through Remittances, or write off the shortfall here with a recorded justification.</span></div>
    ${rows}
  `);
}

function toggleWriteOffForm(idx){
  const el = document.getElementById(`wo_form_${idx}`);
  if(el) el.style.display = el.style.display==='none' ? 'block' : 'none';
}

function onWriteOffReasonChange(idx){
  const reason = document.getElementById(`wo_reason_${idx}`)?.value || '';
  const label = document.getElementById(`wo_notes_label_${idx}`);
  if(label) label.textContent = reason.startsWith('Other') ? 'Notes *' : 'Notes';
}

async function submitWriteOff(idx, btn=null){
  if(!canAction('remittance_record_payment')){ showAlert('You do not have permission to reconcile remittances.','danger'); return; }
  const period = (state.reconcileShortfalls||[])[idx];
  if(!period){ showAlert('This shortfall is no longer available. Please reopen the reconcile modal.','danger'); return; }
  const amount = parseFloat(document.getElementById(`wo_amount_${idx}`)?.value) || 0;
  const reason = document.getElementById(`wo_reason_${idx}`)?.value || '';
  const notes = (document.getElementById(`wo_notes_${idx}`)?.value || '').trim();
  const confirmed = document.getElementById(`wo_confirm_${idx}`)?.checked;
  if(!amount || amount <= 0){ showAlert('Enter a valid write-off amount.','danger'); return; }
  if(amount > period.shortfall + 0.5){ showAlert(`Write-off amount cannot exceed the shortfall (${fmt(period.shortfall)}).`,'danger'); return; }
  if(!reason){ showAlert('Please select a reason.','danger'); return; }
  if(reason.startsWith('Other') && !notes){ showAlert('Please specify a reason in the notes field.','danger'); return; }
  if(!confirmed){ showAlert('Please confirm you have authorization to record this write-off.','danger'); return; }

  const periodLabel = `${fmtDate(period.from)} – ${fmtDate(period.to)}`;
  const restore = setBtnLoading(btn, 'Saving…');
  try {
    await DB.addRemittance({
      label: `Write-off — ${periodLabel}`,
      amount,
      paidDate: ymdLocal(new Date()),
      status: 'written_off',
      periodFrom: period.from,
      periodTo: period.to,
      authorizedBy: state.user?.name || '',
      notes: `${reason}${notes ? ': ' + notes : ''}`,
      paymentMethod: 'reconciliation',
      part: '',
    });
    DB.addAudit('remittance_written_off',
      `Remittance shortfall written off: ${fmt(amount)} for period ${periodLabel} — Reason: ${reason}${notes?': '+notes:''}`,
      state.user?.name);
    DB.addNotification('Remittance Written Off',`${fmt(amount)} written off for period ${periodLabel}. Reason: ${reason}`,'warn');
    closeModal();
    showAlert(`${fmt(amount)} written off for ${periodLabel}.`,'success');
    renderDashboard();
  } catch(err) {
    restore();
    showAlert(`Failed to record write-off: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

function onRemDatesChange(){
  state.remFromDate=document.getElementById('remFromDate')?.value||null;
  state.remToDate=document.getElementById('remToDate')?.value||null;
  renderRemittances();
}

async function printRemittanceReport(fromOverride, toOverride){
  const [allIncome, settings, users] = await Promise.all([DB.getIncome(), DB.getSettings(), DB.getUsers()]);
  const accountantName=(users||[]).find(u=>u.role==='accountant')?.name||'';
  const quotas=getQuotaList(settings);
  const fromDate=fromOverride||state.remFromDate||new Date(state.year,state.month,1).toISOString().split('T')[0];
  const toDate=toOverride||state.remToDate||new Date().toISOString().split('T')[0];
  const income=filterByDateRange(allIncome, fromDate, toDate);
  const rem=await calcRemittancesFromRecords(income);
  const rr=await getRemRates();
  const churchName=settings.churchName||'RCCG Kingdom Parish, Aguleri';
  const quotaLines=getQuotaLinesForPeriod(quotas, fromDate, toDate);

  // Separate "Zonal Mummy Stipend" (pastoral stipend) from RCCG-authority quotas
  const rccgQuotas=quotaLines.filter(q=>!isMummyQuotaLabel(q.label));
  const mummyQuotas=quotaLines.filter(q=>isMummyQuotaLabel(q.label));

  // ─── COLLECTIONS SUMMARY ─────────────────────────────────────────
  const totalCollected=rem.lines.reduce((s,l)=>s+(l.total||0),0);
  const tgLine=rem.lines.find(l=>l.isTg);
  const tgTotal=tgLine?.total||0;
  const tgNatlAmt=tgLine?.national||0;
  const tgDistributed=tgTotal-tgNatlAmt-(tgLine?.seed||0); // area+pastor+ministers only
  const totalToHQ=rem.lines.reduce((s,l)=>s+(l.national||0),0); // incl. TG national
  const totalParishLocal=rem.lines.filter(l=>!l.isTg).reduce((s,l)=>s+(l.local||0),0);

  // Explicit canonical order for the collection summary rows (form field order is unchanged)
  const SUMMARY_ORDER=['ministersTithe','membersTithe','thanksgiving','slo','crm','workersOffering','firstFruit','childrenOffering','sundaySchool','weekendOffering','holyCommunionOffering'];
  const getL=key=>rem.lines.find(l=>l.key===key);
  const collectionRowsHTML=SUMMARY_ORDER.map(key=>{
    const l=getL(key);
    if(!l||!l.total) return '';
    if(l.isTg){
      const natlPct=Math.round(rr.tgNational*100);
      const distPct=100-natlPct;
      const tgRow=`<tr>
        <td>Thanksgiving (TG) <sup style="color:#c0392b">†</sup></td>
        <td class="td-r">${fmt(l.total)}</td>
        <td class="td-c">${natlPct}%</td>
        <td class="td-r">${fmt(l.national)}</td>
        <td class="td-c" style="color:#888">${distPct}%</td>
        <td class="td-r" style="color:#888;font-style:italic">0</td>
      </tr>`;
      const seedAmt=l.seed||0;
      const seedRow=seedAmt>0?`<tr style="background:#fff8e1">
        <td style="padding-left:24px;color:#7a5200;font-style:italic;font-size:11px">↳ Thanksgiving (Seed) → National HQ (${Math.round((rr.tgSeed||0)*100)}%)</td>
        <td class="td-r" style="color:#888;font-size:11px">—</td>
        <td class="td-c" style="color:#7a5200;font-size:11px">${Math.round((rr.tgSeed||0)*100)}%</td>
        <td class="td-r" style="color:#7a5200;font-size:11px">${fmt(seedAmt)}</td>
        <td class="td-c" style="color:#888;font-size:11px">—</td>
        <td class="td-r" style="color:#888;font-size:11px">—</td>
      </tr>`:'';
      return tgRow+seedRow;
    }
    const natlPct=Math.round((l.national/l.total)*100);
    const locPct=Math.round((l.local/l.total)*100);
    return `<tr>
      <td>${l.label}</td>
      <td class="td-r">${fmt(l.total)}</td>
      <td class="td-c">${natlPct}%</td>
      <td class="td-r">${fmt(l.national)}</td>
      <td class="td-c">${locPct}%</td>
      <td class="td-r grn">${fmt(l.local)}</td>
    </tr>`;
  }).filter(Boolean).join('');

  const tgDistNote=tgDistributed>0
    ?`<tr style="background:#fff8e1"><td colspan="6" style="font-size:11px;color:#7a5200;padding:5px 10px">
        <sup style="color:#c0392b">†</sup> TG balance ${fmt(tgDistributed)} (${100-Math.round((rr.tgNational+(rr.tgSeed||0))*100)}%) distributed locally — Area/Zonal: ${fmt(rem.totalArea)} · Pastor: ${fmt(rem.totalPastor)} · Ministers: ${fmt(rem.totalMinisters)} — shown in Part B
      </td></tr>`:'';

  const quotasTotal=sumQuotaLines(quotaLines);
  const trueNetLocal=rem.netLocal-quotasTotal;
  const additionalLevies=(rem.crmAddon||0)+(rem.coastline||0)+(rem.insuranceGen||0)+(rem.insuranceMin||0);

  // ─── PART A: RCCG AUTHORITY REMITTANCES (explicit canonical order) ────
  const partARows=[];
  const pushA=row=>{ if((row.amount||0)>0) partARows.push(row); };
  const getLine=key=>rem.lines.find(l=>l.key===key);
  const linePct=l=>l&&l.total>0?Math.round((l.national/l.total)*100):0;
  // 1. Ministers' Tithe
  { const l=getLine('ministersTithe'); if(l) pushA({ desc:`Ministers' Tithe → National HQ`, type:`${linePct(l)}% Based`, amount:l.national||0 }); }
  // 2. Members' Tithe
  { const l=getLine('membersTithe'); if(l) pushA({ desc:`Members' Tithe → National HQ`, type:`${linePct(l)}% Based`, amount:l.national||0 }); }
  // 3. Thanksgiving → National HQ (75%)
  { const l=getLine('thanksgiving'); if(l) pushA({ desc:`Thanksgiving Offering → National HQ (${Math.round(rr.tgNational*100)}%)`, type:`${Math.round(rr.tgNational*100)}% Based`, amount:l.national||0 }); }
  // 4. Thanksgiving → Seed → National HQ (1%)
  if((rem.totalSeed||0)>0) pushA({ desc:`Thanksgiving → Seed → National HQ (${Math.round(rr.tgSeed*100)}%)`, type:`${Math.round(rr.tgSeed*100)}% Based`, amount:rem.totalSeed });
  // 5. Sunday Love Offering
  { const l=getLine('slo'); if(l) pushA({ desc:`Sunday Love Offering → National HQ`, type:`${linePct(l)}% Based`, amount:l.national||0 }); }
  // 6. Province Rebate
  if(rem.provinceRebate>0) pushA({ desc:`Province Rebate — ${Math.round(rr.provinceRebate*100)}% of Local Retained Tithes (Members' + Ministers' Tithe: ${fmt(rem.localTithe)})`, type:`${Math.round(rr.provinceRebate*100)}% Based`, amount:rem.provinceRebate });
  // 7. CRM (Weekly Activities)
  { const l=getLine('crm'); if(l) pushA({ desc:`CRM (Weekly Activities) → National HQ`, type:`${linePct(l)}% Based`, amount:l.national||0 }); }
  // 8. Gospel Fund (Workers' Offering)
  { const l=getLine('workersOffering'); if(l) pushA({ desc:`Gospel Fund (Workers' Offering) → National HQ`, type:`${linePct(l)}% Based`, amount:l.national||0 }); }
  // 9. First Fruit
  { const l=getLine('firstFruit'); if(l) pushA({ desc:`First Fruit → National HQ`, type:`100% Based`, amount:l.national||0 }); }
  // 10. Teen/Children's Offering
  { const l=getLine('childrenOffering'); if(l) pushA({ desc:`Teen/Children's Offering → National HQ`, type:`${linePct(l)}% Based`, amount:l.national||0 }); }
  // 11. Sunday School
  { const l=getLine('sundaySchool'); if(l) pushA({ desc:`Sunday School → National HQ`, type:`100% Based`, amount:l.national||0 }); }
  // 11b. Weekend Offering
  { const l=getLine('weekendOffering'); if(l) pushA({ desc:`Weekend Offering → National HQ`, type:`${linePct(l)}% Based`, amount:l.national||0 }); }
  // 11c. Holy Communion Offering
  { const l=getLine('holyCommunionOffering'); if(l) pushA({ desc:`Holy Communion Offering → National HQ`, type:`${linePct(l)}% Based`, amount:l.national||0 }); }
  // 12. CRM Add-on
  if((rem.crmAddon||0)>0) pushA({ desc:`CRM Add-on → National HQ (${Math.round(rr.crmAddon*100)}% of CRM Total)`, type:`${Math.round(rr.crmAddon*100)}% Based`, amount:rem.crmAddon });
  // 13. Coastline Worship Centre
  if((rem.coastline||0)>0) pushA({ desc:`Coastline Worship Centre — ${Math.round(rr.coastline*100)}% of Ministers' Tithe`, type:`${Math.round(rr.coastline*100)}% Based`, amount:rem.coastline });
  // 14. Insurance Fund (GEN TITHE)
  if((rem.insuranceGen||0)>0) pushA({ desc:`Insurance Fund (GEN TITHE) — ${+(rr.insuranceGenTithe*100).toFixed(2)}% of Members' Tithe`, type:`${+(rr.insuranceGenTithe*100).toFixed(2)}% Based`, amount:rem.insuranceGen });
  // 15. Insurance Fund (MIN TITHE)
  if((rem.insuranceMin||0)>0) pushA({ desc:`Insurance Fund (MIN TITHE) — ${+(rr.insuranceMinTithe*100).toFixed(2)}% of Ministers' Tithe`, type:`${+(rr.insuranceMinTithe*100).toFixed(2)}% Based`, amount:rem.insuranceMin });
  // Fixed RCCG quotas (excluding pastoral Zonal Mummy Stipend)
  rccgQuotas.forEach(q=>{ if((q.amount||0)>0) partARows.push({ desc:q.label, type:quotaTypeTextForReport(q), amount:q.amount||0 }); });
  const subTotalA=partARows.reduce((s,r)=>s+r.amount,0);

  // ─── PART B: OTHER DISBURSEMENTS ─────────────────────────────────
  const partBRows=[
    { desc:`Thanksgiving → Area / Zonal Pastor (${Math.round(rr.tgArea*100)}%)`,       type:`${Math.round(rr.tgArea*100)}% Based`, amount:rem.totalArea||0 },
    { desc:`Thanksgiving → Parish Pastor's Share (${Math.round(rr.tgPastor*100)}%)`,          type:`${Math.round(rr.tgPastor*100)}% Based`, amount:rem.totalPastor||0 },
    { desc:`Thanksgiving → Ministers' Share (${Math.round(rr.tgMinisters*100)}%)`,     type:`${Math.round(rr.tgMinisters*100)}% Based`, amount:rem.totalMinisters||0 },
    ...mummyQuotas.map(q=>({ desc:q.label, type:quotaTypeTextForReport(q), amount:q.amount||0 }))
  ].filter(r=>r.amount>0);
  const subTotalB=partBRows.reduce((s,r)=>s+r.amount,0);

  const totalDue=subTotalA+subTotalB;

  const partAHTML=partARows.map(r=>`<tr><td>${r.desc}</td><td class="td-c">${r.type}</td><td class="td-r">${fmt(r.amount)}</td></tr>`).join('');
  const partBHTML=partBRows.map(r=>`<tr><td>${r.desc}</td><td class="td-c">${r.type}</td><td class="td-r">${fmt(r.amount)}</td></tr>`).join('');

  const html=`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>RCCG Remittance Report — ${fmtDate(fromDate)} to ${fmtDate(toDate)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:12px;color:#333;padding:24px}
  .header{text-align:center;border-bottom:3px solid #0F6E56;padding-bottom:14px;margin-bottom:18px}
  .header h1{font-size:19px;color:#0F6E56;margin-bottom:4px}
  .header h2{font-size:14px;color:#333;margin-bottom:6px}
  .header p{font-size:11px;color:#666;margin-bottom:2px}
  h3{font-size:13px;color:#0F6E56;margin:18px 0 8px;border-bottom:2px solid #0F6E56;padding-bottom:4px}
  h3 span{font-weight:normal;font-size:11px;color:#666;margin-left:6px}
  table{width:100%;border-collapse:collapse;margin-bottom:6px}
  th{background:#0F6E56;color:#fff;padding:7px 10px;text-align:left;font-size:11px;font-weight:700}
  td{padding:5px 10px;border-bottom:1px solid #eee;font-size:12px}
  .sec-row td{background:#e8f4f0;font-weight:700;font-size:10px;color:#0F6E56;letter-spacing:0.7px;text-transform:uppercase;padding:5px 10px;border-top:1px solid #b2d8cc}
  .subtotal-row td{background:#f5f5f5;font-weight:700;border-top:1.5px solid #aaa;padding:7px 10px;font-size:12px}
  .total-row td{border-top:2.5px solid #333;font-weight:700;font-size:13px;padding:9px 10px;background:#fff}
  .balance-row td{background:#e8f4f0;font-size:11px;color:#0F6E56;padding:6px 10px;font-style:italic}
  .deduct-row td{background:#fef9f9;padding:5px 10px;border-bottom:1px solid #f5c6c6}
  .net-local-row td{background:#e8f4f0;font-weight:700;font-size:13px;padding:9px 10px;border-top:2px solid #0F6E56;color:#0F6E56}
  .local-row td{color:#0F6E56;font-weight:700;padding:8px 10px;font-size:13px;border-top:1px solid #0F6E56}
  .td-r{text-align:right;font-weight:600}
  .td-c{text-align:center}
  .grn{color:#0F6E56}
  .danger{color:#c0392b}
  .muted{color:#888;font-size:11px}
  .spacer-row td{height:8px;background:#fff;border:none}
  .part-label{display:inline-block;background:#0F6E56;color:#fff;border-radius:3px;padding:1px 7px;font-size:10px;font-weight:700;margin-right:6px;letter-spacing:0.5px}
  .sig{display:flex;gap:24px;margin-top:36px}
  .sig-box{flex:1;border-top:1px solid #333;padding-top:8px;font-size:11px;line-height:1.7}
  .note{background:#fff8e1;border:1px solid #f0c040;border-radius:4px;padding:10px 12px;font-size:11px;margin-bottom:16px;color:#7a5200}
  .print-btn-bar{text-align:center;margin-bottom:14px}
  .print-btn{background:#0F6E56;color:#fff;border:none;padding:10px 24px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
  .print-btn:hover{background:#085041}
  @media print{body{padding:10px}.no-print{display:none}}
</style>
</head>
<body>
  <div class="print-btn-bar no-print"><button class="print-btn" onclick="window.print()">🖨️ Print Report</button></div>
  <div class="header">
    <h1>${esc(churchName)}</h1>
    <h2>RCCG Monthly Remittance Report</h2>
    <p><strong>Period Covered:</strong> ${fmtDate(fromDate)} — ${fmtDate(toDate)}</p>
    <p><strong>Generated by:</strong> ${esc(state.user?.name||'—')} &nbsp;|&nbsp; <strong>Date Generated:</strong> ${fmtDate(new Date().toISOString().split('T')[0])}</p>
    <p>Based on <strong>${income.length}</strong> income record(s) totalling <strong>${fmt(totalCollected)}</strong> in this period</p>
  </div>

  <h3>Collections Summary <span>— Period: ${fmtDate(fromDate)} to ${fmtDate(toDate)}</span></h3>
  <table>
    <tr>
      <th style="width:34%">Income Type</th>
      <th class="td-r" style="width:14%">Total Collected</th>
      <th class="td-c" style="width:8%">% → HQ</th>
      <th class="td-r" style="width:14%">To RCCG HQ (₦)</th>
      <th class="td-c" style="width:8%">% Local</th>
      <th class="td-r" style="width:14%">Parish Retained (₦)</th>
    </tr>
    ${collectionRowsHTML}
    ${tgDistNote}
    <tr class="total-row">
      <td>TOTAL COLLECTIONS</td>
      <td class="td-r">${fmt(totalCollected)}</td>
      <td></td>
      <td class="td-r danger">${fmt(totalToHQ)}</td>
      <td></td>
      <td class="td-r grn">${fmt(totalParishLocal)}</td>
    </tr>
    ${rem.provinceRebate>0?`<tr class="deduct-row">
      <td style="padding-left:22px;color:#555;font-style:italic">less: Province Rebate</td>
      <td></td>
      <td class="td-c" style="color:#555;font-size:11px">${Math.round(rr.provinceRebate*100)}% of Local Retained Tithes</td>
      <td></td>
      <td></td>
      <td class="td-r danger">− ${fmt(rem.provinceRebate)}</td>
    </tr>`:''}
    ${additionalLevies>0?`<tr class="deduct-row">
      <td style="padding-left:22px;color:#555;font-style:italic">less: Additional RCCG Levies</td>
      <td></td>
      <td class="td-c" style="color:#555;font-size:11px">CRM Add-on, Coastline, Insurance — see Part A</td>
      <td></td>
      <td></td>
      <td class="td-r danger">− ${fmt(additionalLevies)}</td>
    </tr>`:''}
    ${quotasTotal>0?`<tr class="deduct-row">
      <td style="padding-left:22px;color:#555;font-style:italic">less: Total Fixed Quotas</td>
      <td></td>
      <td class="td-c" style="color:#555;font-size:11px">${rccgQuotas.length + mummyQuotas.length} quota item(s)</td>
      <td></td>
      <td></td>
      <td class="td-r danger">− ${fmt(quotasTotal)}</td>
    </tr>`:''}
    <tr class="net-local-row">
      <td><strong>NET LOCAL RETAINED</strong></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td class="td-r grn"><strong>${fmt(trueNetLocal)}</strong></td>
    </tr>
  </table>

  <h3>Remittances &amp; Disbursements Due</h3>
  <table>
    <tr><th style="width:62%">Description</th><th class="td-c" style="width:10%">Type</th><th class="td-r" style="width:28%">Amount (₦)</th></tr>

    <tr class="sec-row"><td colspan="3"><span class="part-label">PART A</span> Remittances to RCCG Authorities</td></tr>
    ${partARows.length?partAHTML:'<tr><td colspan="3" class="muted" style="padding:6px 10px">No RCCG authority remittances for this period.</td></tr>'}
    <tr class="subtotal-row"><td colspan="2">Sub-Total (A) — RCCG Authority Remittances</td><td class="td-r danger">${fmt(subTotalA)}</td></tr>

    <tr class="spacer-row"><td colspan="3"></td></tr>

    <tr class="sec-row"><td colspan="3"><span class="part-label">PART B</span> Thanksgiving Distributions &amp; Pastoral Stipend</td></tr>
    ${partBRows.length?partBHTML:'<tr><td colspan="3" class="muted" style="padding:6px 10px">No TG distributions or pastoral stipend for this period.</td></tr>'}
    <tr class="subtotal-row"><td colspan="2">Sub-Total (B) — TG Distributions &amp; Pastoral Stipend</td><td class="td-r" style="color:#8B4513">${fmt(subTotalB)}</td></tr>

    <tr class="spacer-row"><td colspan="3"></td></tr>

    <tr class="total-row"><td colspan="2">TOTAL REMITTANCES DUE &nbsp;<span style="font-size:11px;font-weight:normal;color:#666">(A + B)</span></td><td class="td-r danger">${fmt(totalDue)}</td></tr>
    <tr class="local-row"><td colspan="2">Net Local Retained &nbsp;<span style="font-size:11px;font-weight:normal;color:#555">(after Province Rebate &amp; Quotas)</span></td><td class="td-r grn">${fmt(trueNetLocal)}</td></tr>
    <tr class="balance-row"><td colspan="3">✓ Balance: ${fmt(totalCollected)} Total Collected = ${fmt(totalDue)} Remittances Due + ${fmt(trueNetLocal)} Net Local Retained</td></tr>
  </table>

  <div class="sig">
    <div class="sig-box">Prepared by (Accountant)<br><br><br>${esc(accountantName||'_________________')}</div>
    <div class="sig-box">Reviewed &amp; Approved (Parish Pastor)<br><br><br>_________________</div>
    <div class="sig-box">Date of Payment<br><br><br>_________________</div>
    <div class="sig-box">Bank Teller / Reference No.<br><br><br>_________________</div>
  </div>
</body></html>`;

  const w=window.open('','_blank');
  if(!w){ showAlert('Pop-up blocked. Please allow pop-ups for this site to download the report.','warn'); return }
  w.document.write(html);
  w.document.close();
  w.focus();
}

async function shareRemittanceReport(fromOverride, toOverride){
  const restore = setBtnLoading(document.activeElement, 'Creating link…');
  try {
    const [allIncome, settings, users] = await Promise.all([DB.getIncome(), DB.getSettings(), DB.getUsers()]);
    const quotas=getQuotaList(settings);
    const fromDate=fromOverride||state.remFromDate||new Date(state.year,state.month,1).toISOString().split('T')[0];
    const toDate=toOverride||state.remToDate||new Date().toISOString().split('T')[0];
    const income=filterByDateRange(allIncome, fromDate, toDate);
    const rem=await calcRemittancesFromRecords(income);
    const rr=await getRemRates();
    const churchName=settings.churchName||'RCCG Kingdom Parish, Aguleri';
    const quotaLines=getQuotaLinesForPeriod(quotas, fromDate, toDate);
    const rccgQuotas=quotaLines.filter(q=>!isMummyQuotaLabel(q.label));
    const mummyQuotas=quotaLines.filter(q=>isMummyQuotaLabel(q.label));
    const totalCollected=rem.lines.reduce((s,l)=>s+(l.total||0),0);
    const tgLine=rem.lines.find(l=>l.isTg);
    const tgTotal=tgLine?.total||0;
    const tgNatlAmt=tgLine?.national||0;
    const tgDistributed=tgTotal-tgNatlAmt-(tgLine?.seed||0);
    const totalToHQ=rem.lines.reduce((s,l)=>s+(l.national||0),0);
    const totalParishLocal=rem.lines.filter(l=>!l.isTg).reduce((s,l)=>s+(l.local||0),0);
    const quotasTotal=sumQuotaLines(quotaLines);
    const trueNetLocal=rem.netLocal-quotasTotal;
    const additionalLevies=(rem.crmAddon||0)+(rem.coastline||0)+(rem.insuranceGen||0)+(rem.insuranceMin||0);
    const SUMMARY_ORDER=['ministersTithe','membersTithe','thanksgiving','slo','crm','workersOffering','firstFruit','childrenOffering','sundaySchool','weekendOffering','holyCommunionOffering'];
    const getLine=key=>rem.lines.find(l=>l.key===key);
    const linePct=l=>l&&l.total>0?Math.round((l.national/l.total)*100):0;
    const partARows=[];
    const pushA=row=>{ if((row.amount||0)>0) partARows.push(row); };
    { const l=getLine('ministersTithe'); if(l) pushA({ desc:`Ministers' Tithe → National HQ`, type:`${linePct(l)}% Based`, amount:l.national||0 }); }
    { const l=getLine('membersTithe'); if(l) pushA({ desc:`Members' Tithe → National HQ`, type:`${linePct(l)}% Based`, amount:l.national||0 }); }
    { const l=getLine('thanksgiving'); if(l) pushA({ desc:`Thanksgiving Offering → National HQ (${Math.round(rr.tgNational*100)}%)`, type:`${Math.round(rr.tgNational*100)}% Based`, amount:l.national||0 }); }
    if((rem.totalSeed||0)>0) pushA({ desc:`Thanksgiving → Seed → National HQ (${Math.round(rr.tgSeed*100)}%)`, type:`${Math.round(rr.tgSeed*100)}% Based`, amount:rem.totalSeed });
    { const l=getLine('slo'); if(l) pushA({ desc:`Sunday Love Offering → National HQ`, type:`${linePct(l)}% Based`, amount:l.national||0 }); }
    if(rem.provinceRebate>0) pushA({ desc:`Province Rebate — ${Math.round(rr.provinceRebate*100)}% of Local Retained Tithes`, type:`${Math.round(rr.provinceRebate*100)}% Based`, amount:rem.provinceRebate });
    { const l=getLine('crm'); if(l) pushA({ desc:`CRM (Weekly Activities) → National HQ`, type:`${linePct(l)}% Based`, amount:l.national||0 }); }
    { const l=getLine('workersOffering'); if(l) pushA({ desc:`Gospel Fund (Workers' Offering) → National HQ`, type:`${linePct(l)}% Based`, amount:l.national||0 }); }
    { const l=getLine('firstFruit'); if(l) pushA({ desc:`First Fruit → National HQ`, type:`100% Based`, amount:l.national||0 }); }
    { const l=getLine('childrenOffering'); if(l) pushA({ desc:`Teen/Children's Offering → National HQ`, type:`${linePct(l)}% Based`, amount:l.national||0 }); }
    { const l=getLine('sundaySchool'); if(l) pushA({ desc:`Sunday School → National HQ`, type:`100% Based`, amount:l.national||0 }); }
    { const l=getLine('weekendOffering'); if(l) pushA({ desc:`Weekend Offering → National HQ`, type:`100% Based`, amount:l.national||0 }); }
    { const l=getLine('holyCommunionOffering'); if(l) pushA({ desc:`Holy Communion Offering → National HQ`, type:`100% Based`, amount:l.national||0 }); }
    if((rem.crmAddon||0)>0) pushA({ desc:`CRM Add-on → National HQ (${Math.round(rr.crmAddon*100)}% of CRM Total)`, type:`${Math.round(rr.crmAddon*100)}% Based`, amount:rem.crmAddon });
    if((rem.coastline||0)>0) pushA({ desc:`Coastline Worship Centre — ${Math.round(rr.coastline*100)}% of Ministers' Tithe`, type:`${Math.round(rr.coastline*100)}% Based`, amount:rem.coastline });
    if((rem.insuranceGen||0)>0) pushA({ desc:`Insurance Fund (GEN TITHE) — ${+(rr.insuranceGenTithe*100).toFixed(2)}% of Members' Tithe`, type:`${+(rr.insuranceGenTithe*100).toFixed(2)}% Based`, amount:rem.insuranceGen });
    if((rem.insuranceMin||0)>0) pushA({ desc:`Insurance Fund (MIN TITHE) — ${+(rr.insuranceMinTithe*100).toFixed(2)}% of Ministers' Tithe`, type:`${+(rr.insuranceMinTithe*100).toFixed(2)}% Based`, amount:rem.insuranceMin });
    rccgQuotas.forEach(q=>{ if((q.amount||0)>0) partARows.push({ desc:q.label, type:quotaTypeTextForReport(q), amount:q.amount||0 }); });
    const subTotalA=partARows.reduce((s,r)=>s+r.amount,0);
    const partBRows=[
      { desc:`Thanksgiving → Area / Zonal Pastor (${Math.round(rr.tgArea*100)}%)`, type:`${Math.round(rr.tgArea*100)}% Based`, amount:rem.totalArea||0 },
      { desc:`Thanksgiving → Parish Pastor's Share (${Math.round(rr.tgPastor*100)}%)`, type:`${Math.round(rr.tgPastor*100)}% Based`, amount:rem.totalPastor||0 },
      { desc:`Thanksgiving → Ministers' Share (${Math.round(rr.tgMinisters*100)}%)`, type:`${Math.round(rr.tgMinisters*100)}% Based`, amount:rem.totalMinisters||0 },
      ...mummyQuotas.map(q=>({ desc:q.label, type:quotaTypeTextForReport(q), amount:q.amount||0 }))
    ].filter(r=>r.amount>0);
    const subTotalB=partBRows.reduce((s,r)=>s+r.amount,0);
    const totalDue=subTotalA+subTotalB;
    const summaryLines=SUMMARY_ORDER.map(key=>{
      const l=getLine(key); if(!l||!l.total) return null;
      if(l.isTg) return { key, label:l.label, total:l.total, national:l.national, local:0, isTg:true, seed:l.seed||0, natlPct:Math.round(rr.tgNational*100), locPct:0 };
      const natlPct=Math.round((l.national/l.total)*100);
      const locPct=Math.round((l.local/l.total)*100);
      return { key, label:l.label, total:l.total, national:l.national, local:l.local, natlPct, locPct };
    }).filter(Boolean);
    const snapshot = {
      fromDate, toDate, churchName, incomeCount:income.length,
      totalCollected, totalToHQ, totalParishLocal, trueNetLocal,
      provinceRebate:rem.provinceRebate, crmAddon:rem.crmAddon, coastline:rem.coastline,
      insuranceGen:rem.insuranceGen, insuranceMin:rem.insuranceMin, additionalLevies, quotasTotal,
      tgDistributed, localTithe:rem.localTithe,
      tgNational:rr.tgNational, tgSeed:rr.tgSeed, provinceRebatePct:rr.provinceRebate, crmAddonPct:rr.crmAddon,
      summaryLines, partARows, partBRows, subTotalA, subTotalB, totalDue,
    };
    const { token } = await DB.createSharedReport({ periodFrom:fromDate, periodTo:toDate, churchName, createdBy:state.user?.name||'', data:snapshot });
    restore && restore();
    const shareUrl = `${location.origin}/report.html?t=${token}`;
    showModal(`
      <button class="modal-close" onclick="closeModal()">✕</button>
      <div class="modal-title">📤 Share Remittance Report</div>
      <p style="font-size:13px;color:var(--text2);margin-bottom:16px">Share this link with anyone who needs to view or download the report. No login required.</p>
      <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:12px;word-break:break-all;font-size:12px;color:var(--text)">${shareUrl}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <button class="btn btn-primary" id="copyShareLinkBtn" onclick="(function(btn){navigator.clipboard.writeText('${shareUrl.replace(/'/g,"\\'")}').then(()=>{btn.textContent='✓ Copied!';btn.style.background='#1D9E75';setTimeout(()=>{btn.textContent='📋 Copy Link';btn.style.background='';},2000)}).catch(()=>{alert('Copy failed — please copy the link above manually.');})})(this)">📋 Copy Link</button>
        <button class="btn" onclick="window.open('${shareUrl.replace(/'/g,"\\'")}','_blank')">🔗 Open Report</button>
      </div>
      <p style="font-size:11px;color:var(--text3)">Period: ${fmtDate(fromDate)} — ${fmtDate(toDate)} · ${income.length} income record(s)</p>
      <div class="modal-footer"><button class="btn" onclick="closeModal()">Close</button></div>`);
    DB.addAudit('report_shared',`Remittance report shared for ${fromDate} to ${toDate}`,state.user?.name);
  } catch(err) {
    restore && restore();
    showAlert(`Failed to create share link: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

/**
 * Summarize the Satellite / Zone Pass-Through Fund for a reporting period —
 * the SINGLE authoritative helper (reused by the Remittances-page pool panel,
 * the Monthly Statement report note/income line, and calcChurchBalance's
 * heldForSatellites via the same in/out/transfer_out formula on the same table).
 *
 * In/Out/transfers are scoped to the period; `heldAsOf` is the running custodial
 * balance as of the period's end date (all entries up to and including toDate),
 * since the fund is one continuous pool rather than something that resets each
 * period. gift/reimbursement/correction are the transfer_out sub-totals by
 * `purpose` (reason) — see createSatelliteFund. This whole function is
 * display-only — none of it may ever be added into income/expense totals or
 * calcChurchBalance beyond the documented heldForSatellites / satelliteTransferred
 * hooks (see calcChurchBalance, calcChurchBalanceFromOpening).
 */
function summarizeSatelliteFunds(allSatFunds, fromDate, toDate){
  const entryDate = s => String(s?.date || s?.createdAt || '').slice(0,10);
  const inPeriodRange = s => { const d=entryDate(s); return d && d>=fromDate && d<=toDate; };
  const sumWhere = (dir, extra) => (allSatFunds||[])
    .filter(s=>s.direction===dir && inPeriodRange(s) && (!extra || extra(s)))
    .reduce((s,r)=>s+(r.amount||0),0);

  const inPeriod           = sumWhere('in');
  const outPeriod          = sumWhere('out');
  const transferOutPeriod  = sumWhere('transfer_out');
  const giftPeriod         = sumWhere('transfer_out', s=>s.purpose==='gift');
  const reimbursementPeriod= sumWhere('transfer_out', s=>s.purpose==='reimbursement');
  const correctionPeriod   = sumWhere('transfer_out', s=>s.purpose==='correction');

  // held = sum(in) − sum(out) − sum(transfer_out), all up to and including toDate —
  // identical formula to calcChurchBalance.heldForSatellites, this table being the
  // single source of truth for both.
  const heldAsOf = (allSatFunds||[])
    .filter(s=>{ const d=entryDate(s); return !d || d<=toDate; })
    .reduce((s,r)=>{
      if(r.direction==='in') return s+(r.amount||0);
      if(r.direction==='out'||r.direction==='transfer_out') return s-(r.amount||0);
      return s;
    },0);

  return { inPeriod, outPeriod, transferOutPeriod, giftPeriod, reimbursementPeriod, correctionPeriod, heldAsOf };
}

/**
 * Build a structured, self-contained snapshot of the Monthly Financial Statement
 * for the given period. Mirrors the sections rendered by generateMonthlyReport()
 * so the public statement.html page can reproduce identical figures without app
 * access. All currency basis text is pre-formatted; amounts stay numeric.
 */
async function buildMonthlyStatementData(fromDate, toDate){
  const [allIncome, allExpenses, allRemittances, settings, allCashTx, remRatesData, users, allPettyMS, allSatFundsMS] = await Promise.all([
    DB.getIncome(), DB.getExpenses(), DB.getRemittances(), DB.getSettings(), DB.getCashTransactions(), getRemRates(), DB.getUsers(), DB.getPetty(), DB.getSatelliteFunds()
  ]);
  const satFundsSummary=summarizeSatelliteFunds(allSatFundsMS, fromDate, toDate);
  const pastorName=(users||[]).find(u=>u.role==='pastor')?.name||'';
  const accountantName=(users||[]).find(u=>u.role==='accountant')?.name||'';
  const remRates=remRatesData.rates||DEFAULT_REMITTANCE_RATES;
  const churchName=settings?.churchName||'RCCG Kingdom Parish, Aguleri';
  const churchAddress=settings?.churchAddress||'Aguleri, Anambra State, Nigeria';
  const depositMapM={};
  allCashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef).forEach(t=>{depositMapM[t.incomeRef]=(depositMapM[t.incomeRef]||0)+(t.amount||0)});
  const expCoveringMapM=buildExpenseCoveringMap(allIncome, allCashTx, remRates, allExpenses, allPettyMS);
  const depositStatus=r=>{
    const cashHeld=getSundayCashWithAccountant(r,remRates);
    if(cashHeld===0) return 'No Cash';
    const dep=depositMapM[r.id]||0;
    const entry=expCoveringMapM.get(r.id);
    if(dep>=cashHeld||entry?.isReconciled) return 'Deposited';
    if(dep>0) return 'Partial';
    return 'Pending';
  };
  const periodLabel=`${fmtDate(fromDate)} – ${fmtDate(toDate)}`;
  const income=filterByDateRange(allIncome,fromDate,toDate);
  const expenses=filterByDateRange(allExpenses,fromDate,toDate).filter(e=>isLoggedExpense(e));
  const rem=await calcRemittancesFromRecords(income);
  const quotaList=getQuotaList(settings);
  const quotaLines=getQuotaLinesForPeriod(quotaList, fromDate, toDate);
  const totalFixedQuotas=sumQuotaLines(quotaLines);
  // 'gift' transfers from the satellite pool (surplus the satellites left for the parish)
  // are genuinely parish income once transferred — see summarizeSatelliteFunds/
  // createSatelliteFund — so they are folded into totalIncome for reporting HERE only
  // (this never touches the `income` table, so calcChurchBalance is unaffected).
  // 'reimbursement'/'correction' transfers are NOT income — they surface only in the
  // satellite pass-through note below, and their balance effect is absorbed by the
  // existing "Adjustments" line via closingReconcileDiff (see below).
  const totalIncome=income.reduce((s,r)=>s+(r.totalCollection||0),0) + satFundsSummary.giftPeriod;
  const totalExpenses=expenses.reduce((s,r)=>s+(r.amount||0),0);
  // Remittances actually paid *during* this period — filter by paidDate on records
  // with status='paid'. This is the only figure that matches the cash that left the
  // bank between fromDate and toDate (dashboard uses the same filter).
  const periodPaidRems=allRemittances.filter(r=>r.status==='paid').filter(r=>{
    const d=String(r?.paidDate||r?.date||r?.createdAt||'').slice(0,10);
    return d && d>=fromDate && d<=toDate;
  });
  const totalRemPaid=periodPaidRems.reduce((s,r)=>s+(r.amount||0),0);
  const totalRemDue=totalRemittanceDue(rem, totalFixedQuotas);
  const trueNetLocal=rem.netLocal-totalFixedQuotas;
  const netPosition=totalIncome-totalExpenses-totalRemDue;
  const totalChildrenOffering=income.reduce((s,r)=>s+(r.childrenOffering||0),0);
  const childrenLocalShare=totalChildrenOffering*getChildrenOfferingLocalRate(remRates);
  const netPositionExChildren=netPosition-childrenLocalShare;
  // Children Teacher held cash: the portion of children's offering that stays with
  // the teacher and never enters the church's admin-managed accounts. Sum across
  // Sunday records only (matches dashboard's dashChildrenTeacherTotal at line 3009).
  const sundayIncomeRecords=income.filter(r=>!r.source||r.source==='sunday_collection');
  const childrenTeacherHold=sundayIncomeRecords.reduce((s,r)=>s+getChildrenTeacherHeldCash(r,remRates),0);

  // Opening & closing balances via calcChurchBalance() — the same engine the
  // dashboard uses. Guarantees the report's closing balance matches the
  // dashboard's "Total Church Balance" figure exactly.
  const _msFromDate=new Date(fromDate+'T00:00:00');
  const _msDayBefore=new Date(_msFromDate);_msDayBefore.setDate(_msDayBefore.getDate()-1);
  const openingBalDate=ymdLocal(_msDayBefore);
  const [openingBalResult, closingBalResult]=await Promise.all([
    calcChurchBalance(openingBalDate,{
      income:allIncome,expenses:allExpenses,remittances:allRemittances,
      cashTx:allCashTx,pettyHistory:allPettyMS,satelliteFunds:allSatFundsMS,remRates:remRates
    }),
    calcChurchBalance(toDate,{
      income:allIncome,expenses:allExpenses,remittances:allRemittances,
      cashTx:allCashTx,pettyHistory:allPettyMS,satelliteFunds:allSatFundsMS,remRates:remRates
    })
  ]);
  const openingBalance=openingBalResult.total;
  const closingBalance=closingBalResult.total;
  const closingBankBalance=closingBalResult.bankBalance;
  const closingCashWithAccountant=closingBalResult.cashWithAccountant;
  const closingCashDeficit=closingBalResult.cashDeficit||0;
  const closingPettyFloat=closingBalResult.pettyFloat;
  // Algebraic check: opening + income − expenses − remPaid − childrenTeacherHold
  // should equal closing. Any drift is a data-integrity signal (typically a
  // remittance with an inconsistent paidDate vs date). Rounded to whole naira
  // to absorb the paise-level drift from percentage splits.
  const closingReconstructed=openingBalance+totalIncome-totalExpenses-totalRemPaid-childrenTeacherHold;
  const closingReconcileDiff=Math.round(closingBalance-closingReconstructed);

  // Total outstanding remittances (this period's due + any prior period unpaid).
  // Mirrors the dashboard's calcOutstandingRemittancesFromFlow logic so the two
  // views show the same "Available Fund" figure.
  const priorIncome=allIncome.filter(r=>{
    const d=String(r?.date||r?.createdAt||'').slice(0,10);
    return d && d<=openingBalDate;
  });
  const priorRemCalc=await calcRemittancesFromRecords(priorIncome, remRatesData);
  const priorFirstIncRec=priorIncome.length>0?priorIncome[priorIncome.length-1]:null;
  const priorFirstDate=priorFirstIncRec?String(priorFirstIncRec.date||priorFirstIncRec.createdAt||'').slice(0,10):'';
  const priorAccumQuotas=priorFirstIncRec?accumQuotasAcrossPeriods(quotaList, settings, allRemittances, priorFirstDate, openingBalDate):0;
  const priorPaidRems=allRemittances.filter(r=>r.status==='paid'||r.status==='written_off').filter(r=>{
    const d=remittanceSettledDate(r);
    return !d || d<=openingBalDate;
  }).reduce((s,r)=>s+(r.amount||0),0);
  const openingOutstandingRems=Math.max(0, totalRemittanceDue(priorRemCalc)+priorAccumQuotas-priorPaidRems);
  const totalOutstandingRems=calcOutstandingRemittancesFromFlow(openingOutstandingRems, totalRemDue, totalRemPaid);
  const availableParishFund=closingBalance-totalOutstandingRems;

  const sundayCount=new Set(sundayIncomeRecords.map(r=>r.date)).size;

  // Section A — income by type
  const incomeByType={};
  INCOME_TYPES.forEach(t=>{incomeByType[t.key]={key:t.key,label:t.label,total:0}});
  income.forEach(r=>{INCOME_TYPES.forEach(t=>{incomeByType[t.key].total+=(r[t.key]||0)})});
  const incomeTypeSummary=Object.values(incomeByType).filter(t=>t.total>0)
    .map(t=>({label:t.label, total:t.total, pct:totalIncome?Math.round(t.total/totalIncome*100):0}));
  const otherIncomeRecords = income.filter(r => r.source && r.source !== 'sunday_collection')
    .filter(r => INCOME_TYPES.reduce((s,t) => s + (r[t.key]||0), 0) === 0);
  const otherIncomeTotal = otherIncomeRecords.reduce((s,r) => s + (r.totalCollection||0), 0);
  if(otherIncomeTotal > 0){
    incomeTypeSummary.push({
      label: 'Other Income (donations, midweek, etc.)',
      total: otherIncomeTotal,
      pct: totalIncome ? Math.round(otherIncomeTotal / totalIncome * 100) : 0
    });
  }
  // 'Gift/surplus' transfers from the satellite pool — genuinely parish income once
  // transferred (see totalIncome above), sourced from satellite_funds, never from the
  // income table. Reimbursement/correction transfers are deliberately NOT added here.
  if(satFundsSummary.giftPeriod > 0){
    incomeTypeSummary.push({
      label: 'Retained from Satellite Funds (Gift/Surplus)',
      total: satFundsSummary.giftPeriod,
      pct: totalIncome ? Math.round(satFundsSummary.giftPeriod / totalIncome * 100) : 0
    });
  }

  // Section B — weekly collection details (one column per income type)
  const incomeTypeLabels=INCOME_TYPES.map(t=>t.label);
  const weeklyRows=income.map(r=>{
    const isSunday=!r.source||r.source==='sunday_collection';
    const srcMeta=!isSunday?(OTHER_INCOME_SOURCES.find(s=>s.key===r.source)||{label:(r.source||'Other').replace(/_/g,' ')}):null;
    return {
      date:fmtDate(r.date),
      cells:INCOME_TYPES.map(t=>r[t.key]||0),
      total:r.totalCollection||0,
      pct:totalIncome?Math.round((r.totalCollection||0)/totalIncome*100):0,
      status:depositStatus(r),
      isOtherIncome:!isSunday,
      sourceLabel:srcMeta?srcMeta.label:null
    };
  });
  const weeklyTotals=INCOME_TYPES.map(t=>income.reduce((a,r)=>a+(r[t.key]||0),0));

  // Section C — remittances due (pre-formatted basis text)
  const remittanceRows=[];
  rem.lines.filter(l=>!l.isTg&&l.national>0).forEach(l=>remittanceRows.push({
    label:`${l.label} → National HQ`, basis:l.total>0?Math.round(l.national/l.total*100)+'% of '+fmt(l.total):'% Based', amount:l.national }));
  rem.lines.filter(l=>l.isTg&&l.national>0).forEach(l=>{
    remittanceRows.push({ label:'Thanksgiving (TG) → National HQ', basis:`${Math.round(remRatesData.tgNational*100)}% of ${fmt(l.total)}`, amount:l.national });
    if((l.seed||0)>0) remittanceRows.push({ label:'Thanksgiving → Seed → National HQ', basis:`${Math.round((remRatesData.tgSeed||0)*100)}% of ${fmt(l.total)}`, amount:l.seed, indent:true });
  });
  if(rem.provinceRebate>0) remittanceRows.push({ label:'Province Rebate (on local tithes)', basis:rem.localTithe>0?Math.round(rem.provinceRebate/rem.localTithe*100)+'% of '+fmt(rem.localTithe):'% Based', amount:rem.provinceRebate });
  if((rem.crmAddon||0)>0) remittanceRows.push({ label:'CRM Add-on → National HQ', basis:`${Math.round(remRatesData.crmAddon*100)}% of CRM Total`, amount:rem.crmAddon });
  if((rem.coastline||0)>0) remittanceRows.push({ label:'Coastline Worship Centre', basis:`${Math.round(remRatesData.coastline*100)}% of Min. Tithe`, amount:rem.coastline });
  if((rem.insuranceGen||0)>0) remittanceRows.push({ label:'Insurance Fund (GEN TITHE)', basis:`${+(remRatesData.insuranceGenTithe*100).toFixed(2)}% of Mem. Tithe`, amount:rem.insuranceGen });
  if((rem.insuranceMin||0)>0) remittanceRows.push({ label:'Insurance Fund (MIN TITHE)', basis:`${+(remRatesData.insuranceMinTithe*100).toFixed(2)}% of Min. Tithe`, amount:rem.insuranceMin });
  if(rem.totalArea>0) remittanceRows.push({ label:'Thanksgiving → Area/Zonal Pastor', basis:`${Math.round(remRatesData.tgArea*100)}% of TG`, amount:rem.totalArea, indent:true });
  if(rem.totalPastor>0) remittanceRows.push({ label:"Thanksgiving → Parish Pastor's Share", basis:`${Math.round(remRatesData.tgPastor*100)}% of TG`, amount:rem.totalPastor, indent:true });
  if(rem.totalMinisters>0) remittanceRows.push({ label:"Thanksgiving → Ministers' Share", basis:`${Math.round(remRatesData.tgMinisters*100)}% of TG`, amount:rem.totalMinisters, indent:true });
  quotaLines.forEach(q=>remittanceRows.push({ label:q.label, basis:isQuotaFullyAccrued(q)?'Fixed':(q.isProrated?`Fixed • ${q.basis}`:'Fixed Quota'), amount:q.amount }));

  // Section D — expense line items (full detail)
  const expenseRows=expenses.map((e,i)=>{
    const cat=EXPENSE_CATS_ALL.find(c=>c.key===e.category)||{label:e.category||'—'};
    const methodLabel=e.paymentMethod==='bank_transfer'?'Bank Transfer':e.paymentMethod==='petty_cash'?'Petty Cash':e.paymentMethod==='split'?`Split (${[(e.bankAmount||0)>0?`Bank:${fmt(e.bankAmount)}`:'',(e.cashAmount||0)>0?`Cash:${fmt(e.cashAmount)}`:'',(e.pettyAmount||0)>0?`Petty:${fmt(e.pettyAmount)}`:''].filter(Boolean).join('+')})`:'Cash';
    const desc=e.description&&e.description.trim()&&e.description.trim()!==e.subCategory?e.description:'';
    return { sn:i+1, date:fmtDate(e.date||e.createdAt), category:cat.label, subCategory:e.subCategory||'', description:desc, method:methodLabel, receiptNo:e.receiptNo||'', amount:e.amount||0 };
  });

  // Section E — expense by category
  const expByCat={};
  EXPENSE_CATS_ALL.forEach(c=>{expByCat[c.key]={label:c.label,icon:c.icon,total:0,count:0}});
  expenses.forEach(e=>{if(expByCat[e.category]){expByCat[e.category].total+=e.amount||0;expByCat[e.category].count++}});
  const expenseByCategory=Object.values(expByCat).filter(c=>c.total>0).sort((a,b)=>b.total-a.total)
    .map(c=>({label:`${c.icon} ${c.label}`, count:c.count, total:c.total, pct:totalExpenses?Math.round(c.total/totalExpenses*100):0}));

  return {
    kind:'monthly-statement',
    churchName, churchAddress, periodLabel, fromDate, toDate,
    preparedBy:state.user?.name||'', pastorName, accountantName,
    generatedDate:fmtDate(new Date().toISOString()),
    sundayCount,
    totalIncome, totalExpenses, totalRemDue, totalRemPaid, trueNetLocal,
    netPosition, totalChildrenOffering, childrenLocalShare, netPositionExChildren,
    incomeTypeSummary,
    incomeTypeLabels, weeklyRows, weeklyTotals,
    remittanceRows,
    expenseRows,
    expenseByCategory,
    otherIncomeTotal, openingBalance, closingBalance, openingBalDate:fmtDate(openingBalDate),
    outstandingRemittance:Math.max(0, totalRemDue-totalRemPaid),
    // Section F v2 — accurate cash-position figures anchored to calcChurchBalance()
    closingBankBalance, closingCashWithAccountant, closingCashDeficit, closingPettyFloat,
    childrenTeacherHold, totalOutstandingRems, availableParishFund,
    closingReconcileDiff,
    // sectionFVersion signals to statement.html to use the new layout. Old saved
    // statements omit it and fall back to the legacy Opening+Income−RemDue view.
    sectionFVersion:2,
    // Satellite / Zone Pass-Through Fund note — In/Out/Held are display-only, NOT part
    // of totalIncome/totalExpenses/netPosition above. giftPeriod IS already folded into
    // totalIncome (see above and the "Retained from Satellite Funds" row in
    // incomeTypeSummary); reimbursement/correction are memo-only, never income.
    satelliteFundsIn:satFundsSummary.inPeriod, satelliteFundsOut:satFundsSummary.outPeriod, satelliteFundsHeld:satFundsSummary.heldAsOf,
    satelliteFundsTransferOut:satFundsSummary.transferOutPeriod, satelliteFundsGift:satFundsSummary.giftPeriod,
    satelliteFundsReimbursement:satFundsSummary.reimbursementPeriod, satelliteFundsCorrection:satFundsSummary.correctionPeriod,
  };
}

/** Create & share a public link for the Monthly Financial Statement. */
async function shareMonthlyStatement(fromOverride, toOverride){
  // Only show the inline spinner on a real button. When triggered from the
  // print window via window.opener, activeElement is the <body>, which must
  // not have its innerHTML replaced.
  const trigger = (document.activeElement && document.activeElement.tagName === 'BUTTON') ? document.activeElement : null;
  const restore = setBtnLoading(trigger, 'Creating link…');
  try {
    const fromDate=fromOverride||state.reportFromDate||ymdLocal(new Date(state.year,state.month,1));
    const toDate=toOverride||state.reportToDate||ymdLocal(new Date());
    const snapshot=await buildMonthlyStatementData(fromDate, toDate);
    const { token } = await DB.createSharedReport({ periodFrom:fromDate, periodTo:toDate, churchName:snapshot.churchName, createdBy:state.user?.name||'', data:snapshot });
    restore && restore();
    const shareUrl = `${location.origin}/statement.html?t=${token}`;
    const safeUrl = shareUrl.replace(/'/g,"\\'");
    const waText = encodeURIComponent(`*${snapshot.churchName}* — Monthly Financial Statement (${snapshot.periodLabel})\n\nView the full statement here:\n${shareUrl}`);
    showModal(`
      <button class="modal-close" onclick="closeModal()">✕</button>
      <div class="modal-title">📤 Share Monthly Financial Statement</div>
      <p style="font-size:13px;color:var(--text2);margin-bottom:16px">Share this link with anyone who needs to view or download the statement. No login required.</p>
      <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:12px;word-break:break-all;font-size:12px;color:var(--text)">${shareUrl}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <button class="btn btn-primary" id="copyShareLinkBtn" onclick="(function(btn){navigator.clipboard.writeText('${safeUrl}').then(()=>{btn.textContent='✓ Copied!';btn.style.background='#1D9E75';setTimeout(()=>{btn.textContent='📋 Copy Link';btn.style.background='';},2000)}).catch(()=>{alert('Copy failed — please copy the link above manually.');})})(this)">📋 Copy Link</button>
        <button class="btn" onclick="window.open('${safeUrl}','_blank')">🔗 Open</button>
        <button class="btn" style="background:#25D366;color:#fff" onclick="window.open('https://wa.me/?text=${waText}','_blank')">📲 WhatsApp</button>
      </div>
      <p style="font-size:11px;color:var(--text3)">Period: ${snapshot.periodLabel}</p>
      <div class="modal-footer"><button class="btn" onclick="closeModal()">Close</button></div>`);
    DB.addAudit('report_shared',`Monthly statement shared for ${fromDate} to ${toDate}`,state.user?.name);
  } catch(err) {
    restore && restore();
    showAlert(`Failed to create share link: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

// ── EXPENSES ──────────────────────────────
async function renderExpenses(){
  renderPageSkeleton({ pageTitle: 'Expenses', pageSub: monthLabel(), kpiCount: 3, hint: 'Loading expenses…' });
  // Consolidated from two back-to-back Promise.all blocks — all 6 sources are
  // independent so they fan out together. Saves one round-trip-worth of
  // sequential waiting on slow networks.
  const _expSources = [
    ['Expense records',    () => DB.getExpenses()],
    ['Period range',       () => getCurrentPeriodRange()],
    ['Church balance',     () => calcChurchBalance()],
    ['Income records',     () => DB.getIncome()],
    ['Remittance history', () => DB.getRemittances()],
    ['Settings',           () => DB.getSettings()],
  ];
  const _expSettled = await Promise.allSettled(_expSources.map(([, fn]) => fn()));
  const _expFailed = _expSettled.map((r, i) => r.status === 'rejected' ? { label: _expSources[i][0], err: r.reason } : null).filter(Boolean);
  if(_expFailed.length > 0){
    renderPageErrorState({ pageId: 'expenses', pageTitle: 'Expenses', pageSub: monthLabel(), failed: _expFailed });
    return;
  }
  const [allExp, periodRange, churchBal, allIncome, allRems, settings] = _expSettled.map(r => r.value);
  state._expAll = allExp;
  const expenses = filterByCurrentPeriod(allExp, periodRange.from, periodRange.to);
  const total = expenses.reduce((s,r)=>s+(r.amount||0),0);
  // Outstanding remittances — uses the same settled-period-aware logic as the Dashboard
  // to prevent rate changes from retroactively inflating past periods' due amounts.
  const quotaList = getQuotaList(settings);
  const firstIncRec = allIncome.length > 0 ? allIncome[allIncome.length-1] : null;
  const firstDateStr = (firstIncRec ? (firstIncRec.date||firstIncRec.createdAt||'') : '').slice(0,10);
  const accumQuotas = firstIncRec
    ? accumQuotasAcrossPeriods(quotaList, settings, allRems, firstDateStr, ymdLocal(new Date()))
    : 0;

  // Identify fully settled periods (both Part A + B paid, or legacy)
  const _expSettledKeys = [...new Set(
    allRems.filter(r=>r.status==='paid'&&r.periodFrom&&r.periodTo).map(r=>`${r.periodFrom}|${r.periodTo}`)
  )].filter(key=>{
    const [pF,pT]=key.split('|');
    const pp=allRems.filter(r=>r.status==='paid'&&r.periodFrom===pF&&r.periodTo===pT);
    return pp.some(r=>!r.part)||(pp.some(r=>r.part==='a')&&pp.some(r=>r.part==='b'));
  });
  const _expSettledRanges=_expSettledKeys.map(k=>{const [f,t]=k.split('|');return{from:f,to:t};});

  // Shortfall from settled periods (snapshot - paid, or 0 if no snapshot)
  let _expSettledShortfall=0;
  _expSettledKeys.forEach(key=>{
    const [pF,pT]=key.split('|');
    const pp=allRems.filter(r=>r.status==='paid'&&r.periodFrom===pF&&r.periodTo===pT);
    const ppPaid=pp.reduce((s,r)=>s+(r.amount||0),0);
    const ppSnap=pp.reduce((max,r)=>Math.max(max,r.dueAtTimeOfPayment||0),0);
    _expSettledShortfall+=Math.max(0,(ppSnap>0?ppSnap:ppPaid)-ppPaid);
  });

  // Only recalculate remittance for unsettled-period income
  const _expUnsettledIncome=allIncome.filter(r=>{
    const d=r.date||r.createdAt||'';
    return !d||!_expSettledRanges.some(p=>d>=p.from&&d<=p.to);
  });
  const _expUnsettledRem=await calcRemittancesFromRecords(_expUnsettledIncome);
  const _expUnsettledDue=totalRemittanceDue(_expUnsettledRem);
  const _expSettledQuotas=_expSettledRanges.reduce((s,pp)=>s+sumQuotaLines(getQuotaLinesForPeriod(quotaList,pp.from,pp.to)),0);
  const _expUnsettledQuotas=accumQuotas-_expSettledQuotas;

  const outstandingRems=Math.max(0, _expUnsettledDue+_expUnsettledQuotas+_expSettledShortfall);
  const totalChurch = churchBal.total;
  const spendable = totalChurch - outstandingRems;
  const _expPettyTarget = parseFloat(settings?.pettyTargetFloat||0)||90000;
  const _expPettyManageable = parseFloat(settings?.pettyManageableFloat||0)||60000;
  const _expPettyMinimum = parseFloat(settings?.pettyMinimumFloat||0)||40000;
  const _expPettyBuffer = parseFloat(settings?.pettyBufferAmount||0)||30000;
  const _expPettyFloat = churchBal.pettyFloat||0;
  const _expTopUpNeeded = Math.max(0, _expPettyTarget - _expPettyFloat);
  const _expAfterObligs = spendable - _expPettyFloat - _expTopUpNeeded;
  const _expMaxFloat = Math.max(spendable, _expPettyFloat);
  let spendLabel, spendColor;
  if (_expAfterObligs >= _expPettyBuffer) { spendLabel='Healthy'; spendColor='var(--success)'; }
  else if (_expAfterObligs >= 0) { spendLabel='Adequate'; spendColor='#1976D2'; }
  else if (_expMaxFloat >= _expPettyManageable) { spendLabel='Caution'; spendColor='#B8860B'; }
  else if (_expMaxFloat >= _expPettyMinimum) { spendLabel='Tight'; spendColor='#D97706'; }
  else { spendLabel='Critical'; spendColor='var(--danger)'; }

  // Store spendable in state so the expense form modal can access it without re-fetching
  state._spendable = spendable;
  state._churchBal = churchBal;
  state._outstandingRems = outstandingRems;
  state._spendColor = spendColor;

  // Category totals for breakdown
  const catTotals = {};
  EXPENSE_CATS_ALL.forEach(c=>{ catTotals[c.key]=expenses.filter(e=>e.category===c.key).reduce((s,e)=>s+(e.amount||0),0); });

  // Quick-log: top 5 most frequent subcategories from the last 3 months
  const _3moAgo = new Date(); _3moAgo.setMonth(_3moAgo.getMonth() - 3);
  const _3moStr = _3moAgo.toISOString().split('T')[0];
  const recentExp = allExp.filter(e => (e.date || e.createdAt || '') >= _3moStr && e.subCategory);
  const subcatFreq = {};
  recentExp.forEach(e => {
    const k = `${e.category}||${e.subCategory}`;
    if (!subcatFreq[k]) subcatFreq[k] = { category: e.category, subCategory: e.subCategory, count: 0 };
    subcatFreq[k].count++;
  });
  const topSubcats = Object.values(subcatFreq)
    .filter(s => s.subCategory !== 'Others...')
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  state._quickLogItems = topSubcats;

  // Active category filter (stored on state)
  const activeFilter   = state.expCatFilter    || null;
  const searchTerm     = state.expSearch       || '';
  const methodFilter   = state.expMethodFilter || null;
  const recordedByFilter = state.expRecordedBy || null;
  const sortField      = state.expSort     || 'date';
  const sortDir        = state.expSortDir  || 'desc';

  // Collect unique recordedBy values for the dropdown
  const uniqueRecordedBy = [...new Set(expenses.map(e=>e.recordedBy||'').filter(Boolean))].sort();

  // Apply filters to log
  let filtered = expenses.filter(e=>{
    if(activeFilter && e.category!==activeFilter) return false;
    if(methodFilter && e.paymentMethod!==methodFilter) return false;
    if(recordedByFilter && (e.recordedBy||'')!==recordedByFilter) return false;
    if(searchTerm){
      const q=searchTerm.toLowerCase();
      if(!(
        (e.description||'').toLowerCase().includes(q) ||
        (e.subCategory||'').toLowerCase().includes(q) ||
        (e.category||'').toLowerCase().includes(q) ||
        (e.recordedBy||'').toLowerCase().includes(q) ||
        (e.receiptNo||'').toLowerCase().includes(q) ||
        fmt(e.amount).includes(q)
      )) return false;
    }
    return true;
  });

  // Sort
  filtered.sort((a,b)=>{
    let av, bv;
    if(sortField==='amount'){ av=a.amount||0; bv=b.amount||0; }
    else if(sortField==='category'){ av=(a.category||''); bv=(b.category||''); }
    else { av=new Date(a.date||a.createdAt||0); bv=new Date(b.date||b.createdAt||0); }
    if(av<bv) return sortDir==='asc'?-1:1;
    if(av>bv) return sortDir==='asc'?1:-1;
    return 0;
  });

  const activeCat = activeFilter ? EXPENSE_CATS.find(c=>c.key===activeFilter) : null;

  const thStyle = (field)=> `style="cursor:pointer;user-select:none;white-space:nowrap" onclick="App.setExpSort('${field}')"`;
  const sortIcon = (field)=> sortField===field ? (sortDir==='asc'?'↑':'↓') : '';

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div>
        <div class="page-title">Expenses</div>
        <div class="page-sub">${monthLabel()}${state.periodMode === 'remittance' ? ` · Remittance Period (${fmtDateShort(periodRange.from)} – ${fmtDateShort(periodRange.to)})` : ''} — <strong>${fmt(total)}</strong> total${activeFilter?` · Filtered: ${activeCat?.label||activeFilter}`:''}${searchTerm?` · Search: "${searchTerm}"`:''}
        </div>
      </div>
      ${canAction('expense_log')?`<button class="btn btn-primary" onclick="App.showExpenseForm()">+ Log Expense</button>`:''}
    </div>

    <!-- Financial Position Bar -->
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--rl);padding:14px 16px;margin-bottom:1rem">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:var(--text3)">Church Financial Position</div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;color:${spendColor};font-weight:600">${spendLabel}</span>
          <span style="width:8px;height:8px;border-radius:50%;background:${spendColor};display:inline-block"></span>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr) 2px repeat(1,1fr);gap:8px;align-items:center">
        <div style="text-align:center">
          <div style="font-size:11px;color:var(--text3);margin-bottom:3px">🏦 Bank</div>
          <div style="font-size:13px;font-weight:600;color:var(--text)">${fmt(churchBal.bankBalance)}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:11px;color:var(--text3);margin-bottom:3px">💵 Accountant Cash</div>
          <div style="font-size:13px;font-weight:600;color:var(--text)">${fmt(Math.max(0,churchBal.cashWithAccountant))}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:11px;color:var(--text3);margin-bottom:3px">💳 Petty Cash</div>
          <div style="font-size:13px;font-weight:600;color:${churchBal.pettyFloat<0?'var(--danger)':'var(--text)'}">${churchBal.pettyFloat<0?'−'+fmt(Math.abs(churchBal.pettyFloat)):fmt(churchBal.pettyFloat)}</div>
        </div>
        <div style="height:40px;width:1px;background:var(--border);justify-self:center"></div>
        <div style="text-align:center">
          <div style="font-size:11px;color:var(--text3);margin-bottom:3px">✅ Spendable</div>
          <div style="font-size:16px;font-weight:700;color:${spendColor}">${fmt(spendable)}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:1px">After ${fmt(outstandingRems)} rem. due</div>
        </div>
      </div>
      <div style="margin-top:10px;height:4px;background:var(--border);border-radius:2px;overflow:hidden">
        <div style="height:4px;background:${spendColor};width:${Math.min(100,Math.max(0,spendable/Math.max(totalChurch,1)*100)).toFixed(1)}%;border-radius:2px;transition:width 0.4s"></div>
      </div>
    </div>

    ${canAction('expense_log') && topSubcats.length ? `
    <div style="margin-bottom:1rem">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding:0 2px">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:var(--text3)">Quick Log</div>
        <div style="font-size:10px;color:var(--text3)">Based on recent expenses</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        ${topSubcats.map((s, qi) => {
          const cat = EXPENSE_CATS.find(c => c.key === s.category);
          const icon = cat?.icon || '💸';
          const isWide = qi < 2;
          const maxLen = isWide ? 50 : 22;
          const label = s.subCategory.length > maxLen ? s.subCategory.slice(0, maxLen - 2) + '…' : s.subCategory;
          return `<button onclick="App.quickLogExpense(${qi})" style="
            all:unset;display:flex;align-items:center;gap:5px;
            background:var(--card);border:1px solid var(--border);
            border-radius:20px;padding:5px 10px 5px 7px;cursor:pointer;
            transition:border-color 0.15s;line-height:1;
            ${isWide ? 'grid-column:1/-1' : ''}
          " onmouseover="this.style.borderColor='var(--primary)'"
             onmouseout="this.style.borderColor='var(--border)'">
            <span style="font-size:13px;line-height:1;flex-shrink:0">${icon}</span>
            <span style="font-size:11px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label)}</span>
            <span style="font-size:9px;color:var(--text3);font-weight:500;flex-shrink:0">${s.count}x</span>
          </button>`;
        }).join('')}
      </div>
    </div>` : ''}

    <div class="card" style="margin-bottom:1rem">
      <div class="card-header">
        <span class="card-title">Category Breakdown</span>
        ${activeFilter?`<button class="btn btn-sm" onclick="App.setExpCatFilter(null)">✕ Clear filter</button>`:canAction('expense_log')?'<span style="font-size:11px;color:var(--text3)">Tap a category to log an expense</span>':''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">
        ${EXPENSE_CATS.map(c=>{
          const amt  = catTotals[c.key]||0;
          const pct  = total>0 ? (amt/total*100) : 0;
          const hasAmt = amt>0;
          return `
          <button onclick="${canAction('expense_log')?`App.showExpenseForm('${c.key}')`:``}" style="
            all:unset;display:flex;flex-direction:column;gap:4px;
            background:var(--surface);
            border:1.5px solid ${hasAmt?'var(--border2)':'var(--border)'};
            border-radius:var(--rl);padding:10px 12px;cursor:pointer;
            transition:all 0.15s;opacity:${hasAmt?1:0.45};
            box-shadow:none;
            text-align:left;width:100%;box-sizing:border-box
          " >
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <span style="font-size:22px;line-height:1">${c.icon}</span>
              ${pct>0?`<span style="font-size:11px;font-weight:700;padding:2px 6px;border-radius:10px;background:var(--primary-light);color:var(--primary)">${pct<1?'<1':Math.round(pct)}%</span>`:''}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:2px">
              <span style="font-size:12px;font-weight:600;color:var(--text);line-height:1.3">${c.label}</span>
              <span style="font-size:11px;font-weight:700;color:${hasAmt?'var(--danger)':'var(--text3)'};white-space:nowrap;margin-left:6px">${hasAmt?fmt(amt):'—'}</span>
            </div>
            ${pct>0?`<div style="height:3px;background:var(--border);border-radius:2px;overflow:hidden;margin-top:4px">
              <div style="height:3px;width:${Math.min(100,pct)}%;background:var(--primary);border-radius:2px"></div>
            </div>`:''}
          </button>`;
        }).join('')}
      </div>
    </div>

    <!-- Expense Log -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">Expense Log${filtered.length!==expenses.length?` (${filtered.length} of ${expenses.length})`:` (${expenses.length})`}</span>
      </div>

      <!-- Search + Filter bar -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
        <div style="flex:1;min-width:160px;position:relative">
          <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:14px;color:var(--text3)">🔍</span>
          <input type="text" id="exp_search_input" class="form-input"
            placeholder="Search description, category, amount…"
            value="${searchTerm}"
            oninput="App.setExpSearch(this.value)"
            style="padding-left:32px;height:36px" />
        </div>
        <select class="form-select" style="width:auto;height:36px;font-size:13px" onchange="App.setExpCatFilter(this.value)">
          <option value="">All categories</option>
          ${EXPENSE_CATS.map(c=>`<option value="${c.key}" ${activeFilter===c.key?'selected':''}>${c.icon} ${c.label}</option>`).join('')}
        </select>
        <select class="form-select" style="width:auto;height:36px;font-size:13px" onchange="App.setExpMethodFilter(this.value)">
          <option value="">All methods</option>
          <option value="petty_cash"    ${methodFilter==='petty_cash'?'selected':''}>💳 Petty Cash</option>
          <option value="bank_transfer" ${methodFilter==='bank_transfer'?'selected':''}>🏦 Bank Transfer</option>
          <option value="cash"          ${methodFilter==='cash'?'selected':''}>💵 Cash</option>
          <option value="split"         ${methodFilter==='split'?'selected':''}>🔀 Split</option>
        </select>
        ${uniqueRecordedBy.length>1?`<select class="form-select" style="width:auto;height:36px;font-size:13px" onchange="App.setExpRecordedBy(this.value)">
          <option value="">All recorders</option>
          ${uniqueRecordedBy.map(n=>`<option value="${esc(n)}" ${recordedByFilter===n?'selected':''}>${esc(n)}</option>`).join('')}
        </select>`:''}
        ${(activeFilter||searchTerm||methodFilter||recordedByFilter)?`<button class="btn btn-sm" onclick="App.clearExpFilters()" style="white-space:nowrap;flex-shrink:0">✕ Clear all</button>`:''}
      </div>

      ${filtered.length?`
      <span class="td-muted tx-mobile-hint" style="font-size:11px;padding-bottom:6px">Tap any row to see full details</span>
      <div class="table-wrap"><table class="tx-desktop-table">
        <tr>
          <th ${thStyle('date')}>Date ${sortIcon('date')}</th>
          <th>Category</th>
          <th>Sub-category / Description</th>
          <th ${thStyle('amount')} class="td-right">Amount ${sortIcon('amount')}</th>
          <th>Method</th>
          <th>Recorded By</th>
          <th>Receipt</th>
        </tr>
        ${filtered.map(e=>{
          const c=EXPENSE_CATS_ALL.find(x=>x.key===e.category)||{icon:'',label:e.category||'—'};
          const methodLabel = e.paymentMethod==='petty_cash'?'💳 Petty Cash'
            :e.paymentMethod==='bank_transfer'?'🏦 Bank'
            :e.paymentMethod==='split'?`🔀 Split`
            :'💵 Cash';
          const splitParts = [];
          if((e.bankAmount||0)>0) splitParts.push(`Bank: ${fmt(e.bankAmount||0)}`);
          if((e.pettyAmount||0)>0) splitParts.push(`Petty: ${fmt(e.pettyAmount||0)}`);
          if((e.cashAmount||0)>0) splitParts.push(`Cash: ${fmt(e.cashAmount||0)}`);
          const splitDetail = e.paymentMethod==='split'&&splitParts.length
            ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">${splitParts.join(' · ')}</div>` : '';
          const canEditPending = canAction('expense_edit_pending') && e.status!=='approved';
          return `<tr>
            <td style="white-space:nowrap">${fmtDate(e.date||e.createdAt)}<div class="td-muted" style="font-size:11px">${fmtTime(e.createdAt||e.date)}</div></td>
            <td><span class="badge badge-gray">${c.icon} ${c.label}</span></td>
            <td>
              <div style="font-size:13px;font-weight:500">${e.subCategory||e.description||'—'}</div>
              ${e.subCategory&&e.description&&e.description!==e.subCategory?`<div style="font-size:11px;color:var(--text3)">${e.description}</div>`:''}
            </td>
            <td class="td-right td-red td-bold">${fmt(e.amount)}</td>
            <td class="td-muted" style="font-size:12px">${methodLabel}${splitDetail}</td>
            <td class="td-muted" style="font-size:12px">${e.recordedBy||'—'}</td>
            <td>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${(e.hasReceiptImage||e.receiptImage)?`<button class="btn btn-sm" onclick="App.viewExpenseReceipt('${e.id}')">🧾 View</button>`:e.receiptNo?`<span class="badge badge-gray">#${e.receiptNo}</span>`:'<span style="color:var(--text3);font-size:12px">—</span>'}
                ${canEditPending?`<button class="btn btn-sm" onclick="App.editExpense('${e.id}')">✏️ Edit</button><button class="btn btn-sm btn-danger" onclick="App.deleteExpense('${e.id}', this)">🗑 Delete</button>`:''}
              </div>
            </td>
          </tr>`;
        }).join('')}
      </table>
      <table class="tx-mobile-table">
        <tr><th>Date</th><th>Details</th><th class="td-right">Amount</th></tr>
        ${filtered.map(e=>{
          const c=EXPENSE_CATS_ALL.find(x=>x.key===e.category)||{icon:'💸',label:e.category||'—'};
          const methodLabel = e.paymentMethod==='petty_cash'?'💳 Petty'
            :e.paymentMethod==='bank_transfer'?'🏦 Bank'
            :e.paymentMethod==='split'?'🔀 Split'
            :'💵 Cash';
          return `<tr class="tx-mobile-row" onclick="App.showExpenseDetail('${e.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.showExpenseDetail('${e.id}')}" tabindex="0" style="cursor:pointer" role="button" aria-label="${esc(e.subCategory||e.description||'Expense')} — ${fmt(e.amount)}">
            <td><div style="font-size:13px;font-weight:600;white-space:nowrap">${fmtDate(e.date||e.createdAt)}</div><div class="td-muted" style="font-size:11px">${fmtTime(e.createdAt||e.date)}</div></td>
            <td style="max-width:0;width:55%">
              <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><span class="badge badge-gray" style="font-size:11px">${c.icon} ${c.label}</span></div>
              <div class="td-muted" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px">${esc(e.subCategory||e.description||'—')}</div>
              <div style="margin-top:3px;display:flex;gap:4px;flex-wrap:wrap"><span class="td-muted" style="font-size:11px">${methodLabel}</span></div>
            </td>
            <td class="td-right td-red td-bold" style="white-space:nowrap">${fmt(e.amount)}</td>
          </tr>`;
        }).join('')}
      </table></div>
      <div style="padding:10px 0 2px;font-size:12px;color:var(--text3);text-align:right">
        Total shown: <strong style="color:var(--danger)">${fmt(filtered.reduce((s,e)=>s+(e.amount||0),0))}</strong>
      </div>`
      :(expenses.length?'<div class="empty-table">No expenses match your search or filter.</div>':'<div class="empty-table">No expenses recorded this month.</div>')}
    </div>`;
}

function setExpCatFilter(cat){
  state.expCatFilter = cat||null;
  renderExpenses();
}
function setExpSearch(val){
  state.expSearch = val||'';
  renderExpenses();
}
function setExpMethodFilter(val){
  state.expMethodFilter = val||null;
  renderExpenses();
}
function setExpRecordedBy(val){
  state.expRecordedBy = val||null;
  renderExpenses();
}
function setExpSort(field){
  if(state.expSort===field){ state.expSortDir = state.expSortDir==='asc'?'desc':'asc'; }
  else { state.expSort=field; state.expSortDir='desc'; }
  renderExpenses();
}
function clearExpFilters(){
  state.expCatFilter=null; state.expSearch=''; state.expMethodFilter=null; state.expRecordedBy=null; renderExpenses();
}

function showExpenseDetail(id){
  const all = state._expAll || [];
  const e = all.find(x=>x.id===id);
  if(!e) return;
  const c = EXPENSE_CATS_ALL.find(x=>x.key===e.category)||{icon:'💸',label:e.category||'—'};
  const methodLabel = e.paymentMethod==='petty_cash'?'💳 Petty Cash'
    :e.paymentMethod==='bank_transfer'?'🏦 Bank Transfer'
    :e.paymentMethod==='split'?'🔀 Split'
    :'💵 Cash';
  const splitParts = [];
  if((e.bankAmount||0)>0) splitParts.push(`Bank: ${fmt(e.bankAmount)}`);
  if((e.pettyAmount||0)>0) splitParts.push(`Petty: ${fmt(e.pettyAmount)}`);
  if((e.cashAmount||0)>0) splitParts.push(`Cash: ${fmt(e.cashAmount)}`);
  const canEditPending = canAction('expense_edit_pending') && e.status!=='approved';
  const canDeleteApproved = canAction('expense_delete_approved') && e.status==='approved';
  const rows = [
    ['Date',            fmtDate(e.date||e.createdAt)],
    ['Category',        `<span class="badge badge-gray">${c.icon} ${c.label}</span>`],
    ['Sub-category',    esc(e.subCategory||'—')],
    ...(e.description && e.description!==e.subCategory ? [['Description', esc(e.description)]] : []),
    ['Amount',          `<span class="td-red td-bold" style="font-size:16px">${fmt(e.amount)}</span>`],
    ['Payment Method',  `${methodLabel}${splitParts.length?`<div style="font-size:11px;color:var(--text3);margin-top:3px">${splitParts.join(' · ')}</div>`:''}`],
    ['Recorded By',     esc(e.recordedBy||'—')],
    ['Receipt / Ref',   e.receiptNo?`#${esc(e.receiptNo)}`:((e.hasReceiptImage||e.receiptImage)?'📎 Image attached':'—')],
  ];
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">💸 Expense Details</div>
    <table style="width:100%;border-collapse:collapse">
      ${rows.map(([label,val])=>`
        <tr>
          <td style="padding:8px 0 8px 0;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.4px;width:38%;vertical-align:top">${label}</td>
          <td style="padding:8px 0 8px 8px;font-size:13px;color:var(--text);vertical-align:top">${val}</td>
        </tr>`).join('')}
    </table>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Close</button>
      ${(e.hasReceiptImage||e.receiptImage)?`<button class="btn btn-sm" onclick="closeModal();App.viewExpenseReceipt('${e.id}')">🧾 View Receipt</button>`:''}
      ${canEditPending?`<button class="btn btn-sm" onclick="closeModal();App.editExpense('${e.id}')">✏️ Edit</button>`:''}
      ${(canEditPending||canDeleteApproved)?`<button class="btn btn-sm btn-danger" onclick="closeModal();App.deleteExpense('${e.id}')">🗑 Delete</button>`:''}
    </div>`);
}

// ── Petty cash history filters ────────────────────────────────
function setPettySearch(v){ state.pettySearch=v||''; renderPettyCash(); }
function setPettyTypeFilter(v){ state.pettyTypeFilter=v||null; renderPettyCash(); }
function setPettyStatusFilter(v){ state.pettyStatusFilter=v||null; renderPettyCash(); }
function setPettySort(v){ state.pettySort=v||'date_desc'; renderPettyCash(); }
function clearPettyFilters(){ state.pettySearch=''; state.pettyTypeFilter=null; state.pettyStatusFilter=null; renderPettyCash(); }

async function recalcPettyFloat(btn=null){
  if(!confirm('Recalculate petty cash balance from all expense and petty cash records? This will correct any drift caused by failed operations.')) return;
  const restore = setBtnLoading(btn, 'Recalculating…');
  try {
    const result = await DB.recalcPettyFloat();
    const drift = result.drift||0;
    if(Math.abs(drift) < 0.01){
      showAlert('Petty cash balance is already correct — no adjustment needed.','success');
    } else {
      DB.addAudit('petty_recalc',`Petty float recalculated: ${fmt(result.previousFloat)} → ${fmt(result.correctedFloat)} (drift: ${drift>0?'+':''}${fmt(drift)})`,state.user?.name);
      showAlert(`Petty cash balance corrected by ${fmt(Math.abs(drift))} (was ${fmt(result.previousFloat)}, now ${fmt(result.correctedFloat)}).`,'success');
    }
    renderPettyCash();
  } catch(err) {
    restore();
    showAlert(`Failed to recalculate: ${err.message||'Unknown error'}`,'danger');
  }
}

function updateExpenseSubcats(){
  const cat = document.getElementById('exp_cat')?.value;
  const subcats = cat ? (EXPENSE_SUBCATS[cat]||['Others...']) : [];
  const subDiv = document.getElementById('exp_subcat_group');
  if(!subDiv) return;
  if(!cat){ subDiv.style.display='none'; return }
  subDiv.style.display='block';
  const sel = document.getElementById('exp_subcat');
  sel.innerHTML = `<option value="">— Select sub-category —</option>` +
    subcats.map(s=>`<option value="${s}">${s}</option>`).join('');
  updateExpenseDescRequired();
  applyCategoryFundSourceDefault(cat);
}

// Guides an Admin Officer/Accountant straight into the correct flow for an RCCG
// Payments (rccg_proj) expense without needing to know the term "pool": selecting
// this category auto-switches "Pay From" to Split (Parish + Pool) and reveals its
// fields (the user can still change it afterward — this only sets the default). Also
// owns showing/hiding the whole "Pay From" block: it only exists for roles holding
// satellite_fund_record (gated in showExpenseForm — exp_fund_source_wrapper simply
// isn't in the DOM for other roles, making every call below a silent no-op), AND only
// when the category is 'rccg_proj' — for every other category (or no category chosen
// yet) the block is hidden and fundSource is force-reset to 'parish' so nothing stale
// lingers from a prior Split/Pool selection; the expense then submits through the
// ORIGINAL plain parish-expense path exactly as it worked before this feature existed.
function applyCategoryFundSourceDefault(cat){
  const wrapper = document.getElementById('exp_fund_source_wrapper');
  if(cat === 'rccg_proj'){
    if(wrapper) wrapper.style.display = '';
    const splitRadio = document.querySelector('input[name="exp_fund_source"][value="split_pool"]');
    if(!splitRadio) return;
    splitRadio.checked = true;
    onExpFundSourceChange();
    return;
  }
  if(wrapper) wrapper.style.display = 'none';
  const parishRadio = document.querySelector('input[name="exp_fund_source"][value="parish"]');
  if(!parishRadio) return;
  parishRadio.checked = true;
  onExpFundSourceChange();
}

function updateExpenseDescRequired(){
  const subcat = document.getElementById('exp_subcat')?.value;
  const label = document.getElementById('exp_desc_label');
  const input = document.getElementById('exp_desc');
  const hint  = document.getElementById('exp_desc_hint');
  const isOthers = subcat === 'Others...';
  if(label) label.textContent = isOthers ? 'Description *' : 'Description (optional)';
  if(input) input.placeholder = isOthers ? 'Required: describe what this is for' : 'What was purchased / paid for?';
  if(hint)  hint.style.display = isOthers ? 'block' : 'none';
  enforceExpenseMethodLock();
}

// Bank Charges are auto-deducted from the bank balance and must be paid via bank transfer —
// except POS terminal charges, which banks may also debit from cash/petty cash on hand.
function enforceExpenseMethodLock(){
  const cat = document.getElementById('exp_cat')?.value;
  const subcat = document.getElementById('exp_subcat')?.value;
  if(cat==='bank' && subcat!=='POS terminal charges'){
    const bankRadio = document.querySelector('input[name="exp_method"][value="bank_transfer"]');
    const splitGrp = document.getElementById('exp_split_group');
    if(bankRadio){ bankRadio.checked=true; if(splitGrp) splitGrp.style.display='none'; }
  }
}

function getExpenseMethodOptionsForRole(role){
  const options = [];
  if(role==='admin_officer' || role==='it_admin') options.push({ value:'petty_cash', label:'💳 Petty Cash' });
  if(role==='accountant' || role==='it_admin') options.push({ value:'cash', label:'💵 Cash (Accountant)' });
  options.push({ value:'bank_transfer', label:'🏦 Bank Transfer' });
  if(role==='admin_officer' || role==='it_admin') options.push({ value:'split_petty_bank', label:'💳🏦 Split (Petty + Bank)' });
  if(role==='accountant' || role==='it_admin') options.push({ value:'split_cash_bank', label:'💵🏦 Split (Cash + Bank)' });
  return options;
}

// Role-scoped funding source options for a Satellite/Zone Pool OUT payout (Pool-only
// expense, Pool-share of a Split, or the Remittances-page pool panel's Funds Out) —
// a pool payout has exactly ONE funding source (never a split), unlike a parish
// expense's Payment Method above. 'bank' stays first/default so a role or caller that
// never touches this picks the same bank-mirror behavior the pool had before this
// selector existed. Values map 1:1 to the satellite_funds.channel values the backend
// accepts for direction='out' — see createSatelliteFund in functions/api/[[route]].js.
function getPoolPaidViaOptionsForRole(role){
  const options = [{ value:'bank', label:'🏦 Bank Transfer' }];
  if(role==='admin_officer' || role==='it_admin') options.push({ value:'petty_cash', label:'💳 Petty Cash' });
  if(role==='accountant' || role==='it_admin') options.push({ value:'cash_accountant', label:'💵 Cash (Accountant)' });
  return options;
}

function quickLogExpense(idx){
  const item = state._quickLogItems?.[idx];
  if(item) showExpenseForm(item.category, item.subCategory);
}

function showExpenseForm(preselectedCat, preselectedSubcat){
  if(!canAction('expense_log')){ showAlert('You do not have permission to log expenses.','danger'); return; }
  _expPoolSplitSource = 'parish'; // reset auto-split "primary" field for this fresh modal instance
  const today=new Date().toISOString().split('T')[0];
  const methodOptions = getExpenseMethodOptionsForRole(state.user?.role);
  const defaultMethod = methodOptions[0]?.value || 'bank_transfer';
  const poolPaidViaOptions = getPoolPaidViaOptionsForRole(state.user?.role);
  const defaultPoolPaidVia = poolPaidViaOptions[0]?.value || 'bank';
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">💸 Log Expense</div>
    <div class="form-group"><label class="form-label">Date</label><input type="date" id="exp_date" class="form-input" value="${today}" max="${today}" /></div>
    <div class="form-group"><label class="form-label">Category *</label>
      <select id="exp_cat" class="form-select" onchange="App.updateExpenseSubcats()">
        <option value="">— Select category —</option>
        ${EXPENSE_CATS.map(c=>`<option value="${c.key}" ${preselectedCat===c.key?'selected':''}>${c.icon} ${c.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" id="exp_subcat_group" style="display:${preselectedCat?'block':'none'}"><label class="form-label">Sub-category *</label>
      <select id="exp_subcat" class="form-select" onchange="App.updateExpenseDescRequired()">
        <option value="">— Select sub-category —</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label" id="exp_desc_label">Description (optional)</label>
      <input type="text" id="exp_desc" class="form-input" placeholder="What was purchased / paid for?" />
      <div id="exp_desc_hint" class="form-hint" style="display:none;color:var(--danger);font-size:11px;margin-top:4px">Description is required when "Others..." is selected.</div>
    </div>
    <div class="form-group"><label class="form-label">Total Amount (₦) *</label>
      <input type="number" id="exp_amt" class="form-input" placeholder="0" min="0" oninput="App.onExpAmountChange()" />
      ${state._spendable!=null?`<div style="margin-top:6px;padding:8px 12px;border-radius:var(--r);background:${state._spendable<0?'var(--danger-light)':state._spendable<20000?'var(--amber-light)':'var(--success-light)'};font-size:12px">
        <span style="color:${state._spendable<0?'var(--danger)':state._spendable<20000?'var(--amber)':'var(--success)'};font-weight:600" id="exp_remaining_disp">
          Spendable after remittances: ${fmt(state._spendable)}
        </span>
        <span style="color:var(--text3);margin-left:6px">(Bank ${fmt(state._churchBal?.bankBalance||0)} + Cash ${fmt(Math.max(0,state._churchBal?.cashWithAccountant||0))} + Petty ${fmt(state._churchBal?.pettyFloat||0)} − ${fmt(state._outstandingRems||0)} due)</span>
      </div>`:''}
    </div>
    ${canAction('satellite_fund_record')?`
    <!-- Pay From (fund source) — Parish Funds (today's behavior) vs the Satellite/Zone
         Pool pass-through vs a Split of both. Hidden entirely for roles that can't
         record pool funds, so the form behaves exactly as before for them. Also hidden
         (via inline display, toggled by applyCategoryFundSourceDefault) for every
         category other than 'rccg_proj' — a pool payout only ever makes sense for that
         category, so the whole block only appears once it's selected. -->
    <div id="exp_fund_source_wrapper" style="display:${preselectedCat==='rccg_proj'?'block':'none'}">
    <div class="form-group">
      <label class="form-label">Pay From *</label>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="exp_fund_source" value="parish" checked onchange="App.onExpFundSourceChange()" /> 🏛️ Parish Funds
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="exp_fund_source" value="pool" onchange="App.onExpFundSourceChange()" /> 🛰️ Satellite / Zone Pool
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="exp_fund_source" value="split_pool" onchange="App.onExpFundSourceChange()" /> 🔀 Split (Parish + Pool)
        </label>
      </div>
      <div id="exp_fund_source_hint" style="font-size:11px;color:var(--text3);margin-top:4px"></div>
    </div>
    <!-- "Paid via" — funding source for a 100% Pool payment (Pay From = Satellite/Zone
         Pool). Replaces the Payment Method block below for this fund source: a pool
         payout has exactly one funding source, never a split. -->
    <div id="exp_pool_paidvia_group" class="form-group" style="display:none">
      <label class="form-label">Paid via *</label>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px">
        ${poolPaidViaOptions.map(m=>`
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="radio" name="exp_pool_paidvia" value="${m.value}" ${m.value===defaultPoolPaidVia?'checked':''} /> ${m.label}
          </label>`).join('')}
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">How the officer actually funded this pool payout — Bank Transfer mirrors a bank withdrawal, Petty Cash/Cash (Accountant) do not touch the bank.</div>
    </div>
    <div id="exp_pool_split_group" style="display:none">
      <div style="background:var(--surface);border-radius:var(--r);padding:12px;margin-bottom:12px">
        <div style="font-size:12px;color:var(--text2);margin-bottom:10px">Enter the Parish share — the Pool share fills in automatically (and vice-versa). They always add up to the total amount above.</div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">🏛️ Parish share (₦)</label>
            <input type="number" id="exp_parish_share" class="form-input" placeholder="0" min="0" oninput="App.onExpPoolSplitChange('parish')" />
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">🛰️ Pool share (₦)</label>
            <input type="number" id="exp_pool_share" class="form-input" placeholder="0" min="0" oninput="App.onExpPoolSplitChange('pool')" />
          </div>
        </div>
        <div id="exp_pool_split_status" style="margin-top:10px;font-size:12px;color:var(--text3)"></div>
        <div class="form-group" style="margin-bottom:0;margin-top:10px">
          <label class="form-label">Pool share paid via *</label>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px">
            ${poolPaidViaOptions.map(m=>`
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
                <input type="radio" name="exp_pool_split_paidvia" value="${m.value}" ${m.value===defaultPoolPaidVia?'checked':''} /> ${m.label}
              </label>`).join('')}
          </div>
        </div>
      </div>
    </div>
    </div>`:''}

    <!-- Payment Method — applies to the Parish share (all of it, or its portion of a
         Split). Hidden entirely for a pure Pool payment: pool payouts leave the bank
         directly and use the "Paid via" selector above instead. -->
    <div id="exp_payment_method_group">
    <div class="form-group">
      <label class="form-label">Payment Method *</label>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px">
        ${methodOptions.map(m=>`
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="radio" name="exp_method" value="${m.value}" ${m.value===defaultMethod?'checked':''} onchange="App.onExpMethodChange()" /> ${m.label}
          </label>`).join('')}
      </div>
    </div>

    <!-- Split payment fields -->
    <div id="exp_split_group" style="display:none">
      <div style="background:var(--surface);border-radius:var(--r);padding:12px;margin-bottom:12px">
        <div style="font-size:12px;color:var(--text2);margin-bottom:10px">Enter how much comes from each source. They must add up to the total amount above.</div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" id="exp_split_secondary_label">💳 Petty Cash (₦)</label>
            <input type="number" id="exp_secondary_amt" class="form-input" placeholder="0" min="0" oninput="App.onExpSplitChange()" />
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">🏦 Bank Transfer (₦)</label>
            <input type="number" id="exp_bank_amt" class="form-input" placeholder="0" min="0" oninput="App.onExpSplitChange()" />
          </div>
        </div>
        <div id="exp_split_status" style="margin-top:10px;font-size:12px;color:var(--text3)"></div>
      </div>
    </div>
    </div>

    <div class="form-row">
      <div class="form-group"><label class="form-label">Receipt / Invoice No. (optional)</label><input type="text" id="exp_receipt" class="form-input" placeholder="Optional" /></div>
    </div>
    <div class="form-group"><label class="form-label">Upload Receipt Image (optional)</label>
      <input type="file" id="exp_receipt_file" class="form-input" accept="image/*,application/pdf" style="padding:6px" />
    </div>
    <div class="form-group"><label class="form-label">Notes (optional)</label><textarea id="exp_notes" class="form-textarea" placeholder="Additional details..."></textarea></div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.submitExpense(this)">Save Expense</button></div>`);
  if(preselectedCat){
    setTimeout(()=>{
      App.updateExpenseSubcats();
      if(preselectedSubcat){
        const sel = document.getElementById('exp_subcat');
        if(sel){ sel.value = preselectedSubcat; App.updateExpenseDescRequired(); }
      }
    }, 30);
  }
}

function onExpMethodChange(){
  const method = document.querySelector('input[name="exp_method"]:checked')?.value || 'bank_transfer';
  const splitGrp = document.getElementById('exp_split_group');
  const splitLabel = document.getElementById('exp_split_secondary_label');
  const isSplit = method==='split_petty_bank' || method==='split_cash_bank';
  if(splitGrp) splitGrp.style.display = isSplit ? '' : 'none';
  if(splitLabel){
    splitLabel.textContent = method==='split_cash_bank' ? '💵 Cash (₦)' : '💳 Petty Cash (₦)';
  }
  if(isSplit) onExpSplitChange();
  enforceExpenseMethodLock();
}

// The Payment Method split fields (bank + petty/cash) always target the amount that
// is actually going through the Parish payment method — the full expense amount for
// "Parish Funds", or just the Parish share for "Split (Parish + Pool)". Reading
// exp_fund_source is safe even when the selector doesn't exist in the DOM (roles
// without satellite_fund_record never render it) — it falls back to 'parish', which
// is exactly today's behavior (target = the full Total Amount).
function onExpSplitChange(){
  const fundSource = document.querySelector('input[name="exp_fund_source"]:checked')?.value || 'parish';
  const total = fundSource==='split_pool'
    ? (parseFloat(document.getElementById('exp_parish_share')?.value)||0)
    : (parseFloat(document.getElementById('exp_amt')?.value)||0);
  const secondary = parseFloat(document.getElementById('exp_secondary_amt')?.value)||0;
  const bank  = parseFloat(document.getElementById('exp_bank_amt')?.value)||0;
  const sum   = secondary+bank;
  const statusEl = document.getElementById('exp_split_status');
  if(!statusEl) return;
  if(!total){ statusEl.textContent='Enter the total amount above first.'; statusEl.style.color='var(--text3)'; return; }
  if(Math.abs(sum-total)<1){ statusEl.textContent=`✓ Total matches: ${fmt(sum)}`; statusEl.style.color='var(--success)'; }
  else if(sum>total){ statusEl.textContent=`Over by ${fmt(sum-total)}. Reduce one of the amounts.`; statusEl.style.color='var(--danger)'; }
  else if(sum>0){ statusEl.textContent=`${fmt(total-sum)} still unaccounted for.`; statusEl.style.color='var(--amber)'; }
  else { statusEl.textContent=''; }
}

// ── Pay From (fund source): Parish Funds / Satellite-Zone Pool / Split ──────────
function onExpFundSourceChange(){
  const fundSource = document.querySelector('input[name="exp_fund_source"]:checked')?.value || 'parish';
  const pmGroup = document.getElementById('exp_payment_method_group');
  const poolSplitGroup = document.getElementById('exp_pool_split_group');
  const poolPaidViaGroup = document.getElementById('exp_pool_paidvia_group');
  const hint = document.getElementById('exp_fund_source_hint');
  // A pure Pool payment leaves the bank directly via the satellite pool mirror — no
  // parish payment method (bank/cash/petty) applies; the "Paid via" selector (which
  // funding source actually paid the pool amount) replaces it instead.
  if(pmGroup) pmGroup.style.display = fundSource==='pool' ? 'none' : '';
  if(poolPaidViaGroup) poolPaidViaGroup.style.display = fundSource==='pool' ? '' : 'none';
  if(poolSplitGroup) poolSplitGroup.style.display = fundSource==='split_pool' ? '' : 'none';
  if(hint){
    hint.textContent = fundSource==='pool'
      ? 'This whole payment leaves the Satellite/Zone Pool — it will NOT be logged as a parish expense.'
      : fundSource==='split_pool'
        ? 'Parish share is logged as a normal expense; Pool share is a pass-through payout and will NOT be logged as a parish expense.'
        : '';
  }
  // The parish payment method's own split fields (if shown) now target the Parish
  // share instead of the full total when Split is selected — re-validate both. Parish
  // share is the "primary" input (see onExpPoolSplitChange), so re-entering Split
  // always re-derives Pool share from whatever Parish share currently holds.
  if(fundSource==='split_pool'){ onExpPoolSplitChange('parish'); }
}

// Auto-splits the Parish/Pool share fields so users rarely have to balance them by
// hand: Parish share is the PRIMARY input — typing a Total + Parish share auto-fills
// Pool share = max(0, Total − Parish share). Typing directly into Pool share instead
// flips the roles for that edit: Parish share = max(0, Total − Pool share). `source`
// records which field the user is actively driving so a later Total Amount edit (see
// onExpAmountChange) knows which one to keep authoritative and which to recompute.
let _expPoolSplitSource = 'parish';
function onExpPoolSplitChange(source){
  if(source) _expPoolSplitSource = source;
  const totalEl = document.getElementById('exp_amt');
  const parishEl = document.getElementById('exp_parish_share');
  const poolEl = document.getElementById('exp_pool_share');
  if(!parishEl || !poolEl) return;
  const total = parseFloat(totalEl?.value)||0;
  if(total > 0){
    if(_expPoolSplitSource === 'pool'){
      const poolShare = parseFloat(poolEl.value)||0;
      parishEl.value = Math.max(0, total - poolShare);
    } else {
      const parishShare = parseFloat(parishEl.value)||0;
      poolEl.value = Math.max(0, total - parishShare);
    }
  }
  const parishShare = parseFloat(parishEl.value)||0;
  const poolShare = parseFloat(poolEl.value)||0;
  const sum = parishShare+poolShare;
  const statusEl = document.getElementById('exp_pool_split_status');
  if(statusEl){
    if(!total){ statusEl.textContent='Enter the total amount above first.'; statusEl.style.color='var(--text3)'; }
    else if(Math.abs(sum-total)<1){ statusEl.textContent=`✓ Parish ${fmt(parishShare)} + Pool ${fmt(poolShare)} = Total ${fmt(total)} ✓`; statusEl.style.color='var(--success)'; }
    else if(sum>total){ statusEl.textContent=`Over by ${fmt(sum-total)}. Reduce one of the amounts.`; statusEl.style.color='var(--danger)'; }
    else if(sum>0){ statusEl.textContent=`${fmt(total-sum)} still unaccounted for.`; statusEl.style.color='var(--amber)'; }
    else { statusEl.textContent=''; }
  }
  // The parish payment-method's own bank/petty split (if shown) targets exp_parish_share
  // — keep its validation in sync since auto-fill can change that value silently.
  onExpSplitChange();
}

// The Total Amount field drives both the parish payment-method lock (unchanged) and,
// when Split (Parish + Pool) is active, re-derives whichever share isn't currently
// "primary" (see onExpPoolSplitChange) so the two stay in sync as the total changes.
function onExpAmountChange(){
  onExpMethodChange();
  const poolSplitGroup = document.getElementById('exp_pool_split_group');
  if(poolSplitGroup && poolSplitGroup.style.display !== 'none') onExpPoolSplitChange();
}

let _expenseSubmitting = false;
async function submitExpense(btn=null){
  if(_expenseSubmitting) return;
  if(!canAction('expense_log')){ showAlert('You do not have permission to log expenses.','danger'); return; }
  const date=document.getElementById('exp_date')?.value;
  const category=document.getElementById('exp_cat')?.value;
  const subCategory=document.getElementById('exp_subcat')?.value;
  const description=document.getElementById('exp_desc')?.value?.trim();
  const amount=parseFloat(document.getElementById('exp_amt')?.value)||0;
  const isOthers = subCategory==='Others...';
  if(!date||!category){ showAlert('Please select a date and category.','danger'); return }
  if(!subCategory){ showAlert('Please select a sub-category.','danger'); return }
  if(isOthers && !description){ showAlert('Description is required when "Others..." is selected.','danger'); return }
  if(!amount){ showAlert('Please enter an amount.','danger'); return }

  // ── Pay From: Parish Funds (below, unchanged) / Satellite-Zone Pool / Split ──────
  // The selector only exists in the DOM for roles holding satellite_fund_record, AND
  // it is only ever meaningful for category==='rccg_proj' (the block is hidden/reset
  // to 'parish' for every other category — see applyCategoryFundSourceDefault). This
  // guard is a defensive backstop on top of that UI reset: no category other than
  // 'rccg_proj' can ever submit through the pool/split_pool paths, so every other
  // category always goes through the ORIGINAL plain parish-expense path below.
  const fundSource = (canAction('satellite_fund_record') && category === 'rccg_proj')
    ? (document.querySelector('input[name="exp_fund_source"]:checked')?.value || 'parish')
    : 'parish';
  if(fundSource === 'pool'){
    return submitPoolOnlyExpense({ date, category, subCategory, description, amount, btn });
  }
  if(fundSource === 'split_pool'){
    return submitSplitPoolExpense({ date, category, subCategory, description, amount, btn });
  }

  const method = document.querySelector('input[name="exp_method"]:checked')?.value || 'bank_transfer';
  const isSplitPettyBank = method==='split_petty_bank';
  const isSplitCashBank = method==='split_cash_bank';
  const isSplit = isSplitPettyBank || isSplitCashBank;

  // Resolve split amounts
  let bankAmount=0, cashAmount=0, pettyAmount=0;
  if(isSplit){
    const secondaryAmount=parseFloat(document.getElementById('exp_secondary_amt')?.value)||0;
    bankAmount=parseFloat(document.getElementById('exp_bank_amt')?.value)||0;
    if(isSplitPettyBank) pettyAmount=secondaryAmount;
    if(isSplitCashBank) cashAmount=secondaryAmount;
    const splitTotal = secondaryAmount + bankAmount;
    if(!secondaryAmount&&!bankAmount){ showAlert('Please enter at least one split amount.','danger'); return }
    if(Math.abs(splitTotal-amount)>0.5){ showAlert(`Split total (${fmt(splitTotal)}) must equal the expense amount (${fmt(amount)}). Please correct.`,'danger'); return }
  } else if(method==='petty_cash'){
    pettyAmount=amount;
  } else if(method==='bank_transfer'){
    bankAmount=amount;
  } else {
    cashAmount=amount; // cash (accountant)
  }

  // Guards: amounts must not exceed available balances.
  // +0.5 tolerance absorbs floating-point rounding differences (consistent with submitRefill).
  if(bankAmount > 0 || cashAmount > 0){
    const _bal = await calcChurchBalance();
    if(bankAmount > 0){
      const availBank = Math.max(0, _bal.bankBalance||0);
      if(bankAmount > availBank + 0.5){
        showAlert(`Bank balance is insufficient for this expense.\nAvailable bank balance: ${fmt(availBank)}. Required: ${fmt(bankAmount)}`,'danger');
        return;
      }
    }
    if(cashAmount > 0){
      const availCash = Math.max(0, _bal.cashWithAccountant||0);
      if(cashAmount > availCash + 0.5){
        showAlert(`Cash with Accountant is insufficient for this expense.\nAvailable cash: ${fmt(availCash)}. Required: ${fmt(cashAmount)}`,'danger');
        return;
      }
    }
  }

  // For cash/split expenses, resolve which income record's cash pool this draws from.
  // This makes the attribution explicit so the income modal and deposit form are exact
  // rather than relying on the FIFO date-window heuristic.
  let expenseIncomeRef = '';
  if(cashAmount > 0){
    try {
      const [_allIncSE, _remRatesSE, _allCashSE] = await Promise.all([DB.getIncome(), getRemRates(), DB.getCashTransactions()]);
      expenseIncomeRef = findIncomeRefForCashExpense(date, _allIncSE, _remRatesSE.rates||DEFAULT_REMITTANCE_RATES, _allCashSE);
    } catch(e){ /* non-fatal — falls back to FIFO attribution */ }
  }

  const fileEl = document.getElementById('exp_receipt_file');
  const file = fileEl?.files?.[0];
  const restore = setBtnLoading(btn, 'Saving…');

  const expenseId = 'EXP-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  async function saveExpenseRecord(receiptDataUrl, receiptFileName){
    _expenseSubmitting = true;
    try {
      const expenseStatus = defaultExpenseStatusForCurrentUser();
      await DB.addExpense({ id: expenseId, date, category, subCategory, description: description || subCategory, amount,
        receiptNo: document.getElementById('exp_receipt')?.value,
        receiptImage: receiptDataUrl||null, receiptFileName: receiptFileName||null,
        paymentMethod: isSplit ? 'split' : method,
        bankAmount: bankAmount,
        cashAmount: cashAmount,
        pettyAmount: pettyAmount,
        incomeRef: expenseIncomeRef,
        notes: document.getElementById('exp_notes')?.value, recordedBy:state.user?.name, status:expenseStatus });

      closeModal();
      const splitLabel = isSplit
        ? ` (${pettyAmount>0?`Petty: ${fmt(pettyAmount)} · `:''}${cashAmount>0?`Cash: ${fmt(cashAmount)} · `:''}Bank: ${fmt(bankAmount)})`
        : '';
      showAlert(`Expense of ${fmt(amount)} logged${splitLabel}.`,'success');
      await renderExpenses();
    } catch(err) {
      restore();
      showAlert(`Failed to save expense: ${err.message||'Unknown error'}. Please try again.`,'danger');
    } finally {
      _expenseSubmitting = false;
    }
  }

  if(file){
    const reader = new FileReader();
    reader.onload = async ev => { await saveExpenseRecord(ev.target.result, file.name); };
    reader.onerror = async () => { showAlert('Failed to read receipt file. Saving expense without image.','warn'); await saveExpenseRecord(null, null); };
    reader.readAsDataURL(file);
  } else {
    await saveExpenseRecord(null, null);
  }
}

// ── "Pay From: Satellite / Zone Pool" — the WHOLE payment is a pass-through pool
// payout, never a parish expense. No expenses row is ever created here — the pool
// share must never hit calcChurchBalance as an expense, or it would double-count
// against the pool's own held/bank accounting (see calcChurchBalance/createSatelliteFund).
// Reuses the existing satellite-funds create path exactly like the Remittances-page
// pool panel's "Record Funds Out" — direction:'out' mirrors a bank withdrawal server-side.
async function submitPoolOnlyExpense({ date, category, subCategory, description, amount, btn }){
  if(_expenseSubmitting) return;
  if(!canAction('satellite_fund_record')){ showAlert('You do not have permission to record satellite pass-through funds.','danger'); return; }
  const receiptNo = document.getElementById('exp_receipt')?.value?.trim()||'';
  const notesVal = document.getElementById('exp_notes')?.value?.trim()||'';
  const catLabel = EXPENSE_CATS.find(c=>c.key===category)?.label||category;
  const note = [`${catLabel}${subCategory?` — ${subCategory}`:''}`, description, notesVal].filter(Boolean).join(' · ');
  // Funding source for this pool payout — see the "Paid via" selector in showExpenseForm.
  const channel = document.querySelector('input[name="exp_pool_paidvia"]:checked')?.value || 'bank';

  const restore = setBtnLoading(btn, 'Saving…');
  _expenseSubmitting = true;
  try {
    await DB.addSatelliteFund({
      direction:'out', purpose:'joint_area_zone', amount, date, channel,
      note, reference:receiptNo, recordedBy:state.user?.name||''
    });
    DB.addAudit('satellite_fund_recorded',
      `Joint/zonal payment ${fmt(amount)} paid entirely from the Satellite/Zone Pool (${catLabel}${subCategory?' — '+subCategory:''})${receiptNo?' — Ref: '+receiptNo:''}. Not logged as a parish expense.`,
      state.user?.name);
    DB.addNotification('Pool Payment Recorded',`${fmt(amount)} paid from the Satellite/Zone Pool for ${catLabel}${subCategory?' — '+subCategory:''}.`,'success');
    closeModal();
    showAlert(`${fmt(amount)} paid from the Satellite/Zone Pool — not logged as a parish expense.`,'success');
    await renderExpenses();
  } catch(err) {
    restore();
    showAlert(`Failed to record pool payment: ${err.message||'Unknown error'}. Please try again.`,'danger');
  } finally {
    _expenseSubmitting = false;
  }
}

// ── "Pay From: Split (Parish + Pool)" — the payment is part the parish's own share
// (a normal expense, using the parish payment method radios), part the satellite
// parishes' pass-through share (a pool payout, no expenses row). The two halves are
// linked with a shared reference tag for audit — the receipt/invoice no. if one was
// entered, otherwise a generated JZ- tag — stamped into both records' reference/notes.
async function submitSplitPoolExpense({ date, category, subCategory, description, amount, btn }){
  if(_expenseSubmitting) return;
  if(!canAction('satellite_fund_record')){ showAlert('You do not have permission to record satellite pass-through funds.','danger'); return; }
  const parishShare = parseFloat(document.getElementById('exp_parish_share')?.value)||0;
  const poolShare = parseFloat(document.getElementById('exp_pool_share')?.value)||0;
  if(!parishShare && !poolShare){ showAlert('Please enter at least one of the Parish share / Pool share amounts.','danger'); return; }
  if(Math.abs((parishShare+poolShare)-amount)>0.5){ showAlert(`Parish share + Pool share (${fmt(parishShare+poolShare)}) must equal the total amount (${fmt(amount)}). Please correct.`,'danger'); return; }

  const receiptNo = document.getElementById('exp_receipt')?.value?.trim()||'';
  const notesVal = document.getElementById('exp_notes')?.value?.trim()||'';
  const catLabel = EXPENSE_CATS.find(c=>c.key===category)?.label||category;
  // Shared reference so the two halves of one joint/zonal payment can be traced as one.
  const sharedRef = receiptNo || `JZ-${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
  // Funding source for the Pool share — see the "Pool share paid via" selector in showExpenseForm.
  const poolChannel = document.querySelector('input[name="exp_pool_split_paidvia"]:checked')?.value || 'bank';

  // Parish share: resolve the SAME bank/cash/petty/split payment-method radios the
  // "Parish Funds" path uses (see submitExpense above) — just scoped to parishShare
  // instead of the full amount, since only the parish's own portion is ever an expense.
  let bankAmount=0, cashAmount=0, pettyAmount=0, method='bank_transfer', isSplit=false;
  if(parishShare > 0){
    method = document.querySelector('input[name="exp_method"]:checked')?.value || 'bank_transfer';
    const isSplitPettyBank = method==='split_petty_bank';
    const isSplitCashBank = method==='split_cash_bank';
    isSplit = isSplitPettyBank || isSplitCashBank;
    if(isSplit){
      const secondaryAmount=parseFloat(document.getElementById('exp_secondary_amt')?.value)||0;
      bankAmount=parseFloat(document.getElementById('exp_bank_amt')?.value)||0;
      if(isSplitPettyBank) pettyAmount=secondaryAmount;
      if(isSplitCashBank) cashAmount=secondaryAmount;
      const splitTotal = secondaryAmount + bankAmount;
      if(!secondaryAmount&&!bankAmount){ showAlert('Please enter at least one split amount for the parish share.','danger'); return }
      if(Math.abs(splitTotal-parishShare)>0.5){ showAlert(`Split total (${fmt(splitTotal)}) must equal the parish share (${fmt(parishShare)}). Please correct.`,'danger'); return }
    } else if(method==='petty_cash'){
      pettyAmount=parishShare;
    } else if(method==='bank_transfer'){
      bankAmount=parishShare;
    } else {
      cashAmount=parishShare; // cash (accountant)
    }

    // Guards: amounts must not exceed available balances — same tolerance as the Parish path.
    if(bankAmount > 0 || cashAmount > 0){
      const _bal = await calcChurchBalance();
      if(bankAmount > 0){
        const availBank = Math.max(0, _bal.bankBalance||0);
        if(bankAmount > availBank + 0.5){
          showAlert(`Bank balance is insufficient for the parish share.\nAvailable bank balance: ${fmt(availBank)}. Required: ${fmt(bankAmount)}`,'danger');
          return;
        }
      }
      if(cashAmount > 0){
        const availCash = Math.max(0, _bal.cashWithAccountant||0);
        if(cashAmount > availCash + 0.5){
          showAlert(`Cash with Accountant is insufficient for the parish share.\nAvailable cash: ${fmt(availCash)}. Required: ${fmt(cashAmount)}`,'danger');
          return;
        }
      }
    }
  }

  let expenseIncomeRef = '';
  if(cashAmount > 0){
    try {
      const [_allIncSE, _remRatesSE, _allCashSE] = await Promise.all([DB.getIncome(), getRemRates(), DB.getCashTransactions()]);
      expenseIncomeRef = findIncomeRefForCashExpense(date, _allIncSE, _remRatesSE.rates||DEFAULT_REMITTANCE_RATES, _allCashSE);
    } catch(e){ /* non-fatal — falls back to FIFO attribution */ }
  }

  const restore = setBtnLoading(btn, 'Saving…');
  _expenseSubmitting = true;
  try {
    if(parishShare > 0){
      const expenseId = 'EXP-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const expenseStatus = defaultExpenseStatusForCurrentUser();
      await DB.addExpense({ id: expenseId, date, category, subCategory,
        description: description || subCategory, amount: parishShare,
        receiptNo: sharedRef,
        paymentMethod: isSplit ? 'split' : method,
        bankAmount, cashAmount, pettyAmount,
        incomeRef: expenseIncomeRef,
        notes: [notesVal, poolShare>0?`Linked joint/zonal payment — pool share: ${fmt(poolShare)} (ref ${sharedRef}).`:''].filter(Boolean).join(' '),
        recordedBy: state.user?.name, status: expenseStatus });
    }
    if(poolShare > 0){
      const note = [`${catLabel}${subCategory?` — ${subCategory}`:''}`, description,
        parishShare>0?`Linked parish expense — parish share: ${fmt(parishShare)} (ref ${sharedRef}).`:''].filter(Boolean).join(' · ');
      await DB.addSatelliteFund({
        direction:'out', purpose:'joint_area_zone', amount: poolShare, date, channel: poolChannel,
        note, reference: sharedRef, recordedBy: state.user?.name||''
      });
    }
    DB.addAudit('expense_recorded',
      `Split joint/zonal payment ${fmt(amount)} — Parish: ${fmt(parishShare)} (expense) · Pool: ${fmt(poolShare)} (pass-through) — Ref: ${sharedRef}`,
      state.user?.name);
    closeModal();
    showAlert(`Split payment of ${fmt(amount)} recorded — Parish: ${fmt(parishShare)}, Pool: ${fmt(poolShare)}.`,'success');
    await renderExpenses();
  } catch(err) {
    restore();
    showAlert(`Failed to save split payment: ${err.message||'Unknown error'}. Please try again.`,'danger');
  } finally {
    _expenseSubmitting = false;
  }
}

async function viewExpenseReceipt(id){
  const allExpVE = await DB.getExpenses();
  const exp = allExpVE.find(e=>e.id===id);
  if(!exp || !(exp.hasReceiptImage || exp.receiptImage)) return;
  // The image is no longer shipped in the list payload — fetch it on demand.
  let receiptImage = exp.receiptImage;
  if(!receiptImage){
    try { const r = await DB.getExpenseReceipt(id); receiptImage = r?.receiptImage || ''; }
    catch(e){ showAlert('Could not load the receipt image. Please try again.','danger'); return; }
  }
  if(!receiptImage){ showAlert('No receipt image found for this expense.','info'); return; }
  const isImg = receiptImage.startsWith('data:image');
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">🧾 Receipt — ${exp.description||exp.subCategory||'Expense'}</div>
    <p style="font-size:12px;color:var(--text3);margin-bottom:8px">${exp.receiptFileName||''} · ${fmtDate(exp.date||exp.createdAt)}</p>
    ${isImg?`<img src="${receiptImage}" style="width:100%;border-radius:var(--r);max-height:70vh;object-fit:contain" alt="Receipt" />`:
      `<a href="${receiptImage}" target="_blank" class="btn btn-primary" download="${exp.receiptFileName||'receipt'}">Download Receipt PDF</a>`}
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Close</button></div>`);
}

// Lazy-load and show a cash transaction's deposit-slip photo (no longer shipped
// inline in the transactions list).
async function viewCashPhoto(id){
  let photoData = '';
  try { const r = await DB.getCashPhoto(id); photoData = r?.photoData || ''; }
  catch(e){ showAlert('Could not load the deposit slip. Please try again.','danger'); return; }
  if(!photoData){ showAlert('No deposit slip photo found for this transaction.','info'); return; }
  const isImg = photoData.startsWith('data:image');
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">📷 Deposit Slip</div>
    ${isImg?`<img src="${photoData}" style="width:100%;border-radius:var(--r);max-height:70vh;object-fit:contain" alt="Deposit slip" />`:
      `<a href="${photoData}" target="_blank" class="btn btn-primary" download="deposit-slip">Open Deposit Slip</a>`}
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Close</button></div>`);
}

async function editExpense(id){
  const all = await DB.getExpenses();
  const exp = all.find(e=>e.id===id);
  if(!exp) return;
  if(exp.status==='approved' && state.user?.role!=='it_admin'){ showAlert('Approved expenses cannot be edited.','danger'); return }
  if(!canAction('expense_edit_pending') && state.user?.role!=='it_admin'){ showAlert('You are not allowed to edit this expense.','danger'); return }

  const methodLabel = exp.paymentMethod==='petty_cash'?'💳 Petty Cash'
    :exp.paymentMethod==='bank_transfer'?'🏦 Bank Transfer'
    :exp.paymentMethod==='split'?'🔀 Split'
    :'💵 Cash';
  const splitDetail = exp.paymentMethod==='split'
    ? `<span style="color:var(--text3);font-size:11px;margin-left:8px">Bank: ${fmt(exp.bankAmount||0)} · Petty: ${fmt(exp.pettyAmount||0)} · Cash: ${fmt(exp.cashAmount||0)}</span>`
    : '';

  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">✏️ Edit Expense</div>
    <div class="form-group">
      <label class="form-label">Category *</label>
      <select id="exp_cat" class="form-select" onchange="App.updateExpenseSubcats()">
        <option value="">— Select category —</option>
        ${EXPENSE_CATS.map(c=>`<option value="${c.key}" ${exp.category===c.key?'selected':''}>${c.icon} ${c.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" id="exp_subcat_group" style="display:${exp.category?'block':'none'}">
      <label class="form-label">Sub-category *</label>
      <select id="exp_subcat" class="form-select" onchange="App.updateExpenseDescRequired()">
        <option value="">— Select sub-category —</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label" id="exp_desc_label">Description</label>
      <input type="text" id="exp_desc" class="form-input" value="${esc(exp.description||'')}" placeholder="What was purchased / paid for?" />
      <div id="exp_desc_hint" class="form-hint" style="display:none;color:var(--danger);font-size:11px;margin-top:4px">Description is required when "Others..." is selected.</div>
    </div>
    <div class="form-group">
      <label class="form-label">Amount (₦) *</label>
      <input type="number" id="exp_amt" class="form-input" value="${exp.amount||0}" min="0" />
    </div>
    <div class="form-group">
      <label class="form-label">Payment Method</label>
      <div style="font-size:13px;color:var(--text2);padding:8px 0">${methodLabel}${splitDetail}
        <span style="color:var(--text3);font-size:11px;margin-left:8px">(cannot be changed here)</span>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes (optional)</label>
      <textarea id="exp_notes" class="form-textarea">${esc(exp.notes||'')}</textarea>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitEditExpense('${id}', this)">Save Changes</button>
    </div>`);

  // Populate subcategory dropdown and restore the saved selection
  setTimeout(()=>{
    App.updateExpenseSubcats();
    const sel = document.getElementById('exp_subcat');
    if(sel && exp.subCategory){
      for(const opt of sel.options){
        if(opt.value===exp.subCategory){ opt.selected=true; break; }
      }
    }
    App.updateExpenseDescRequired();
  }, 30);
}

async function submitEditExpense(id, btn=null){
  const category    = document.getElementById('exp_cat')?.value;
  const subCategory = document.getElementById('exp_subcat')?.value;
  const description = document.getElementById('exp_desc')?.value?.trim();
  const amount      = parseFloat(document.getElementById('exp_amt')?.value)||0;
  const notes       = document.getElementById('exp_notes')?.value?.trim();

  if(!category){ showAlert('Please select a category.','danger'); return }
  if(!subCategory){ showAlert('Please select a sub-category.','danger'); return }
  if(subCategory==='Others...' && !description){ showAlert('Description is required when "Others..." is selected.','danger'); return }
  if(!amount || amount<=0){ showAlert('Please enter a valid amount.','danger'); return }

  if(btn) btn.disabled=true;
  const all = await DB.getExpenses();
  const exp = all.find(e=>e.id===id);
  if(!exp){ if(btn) btn.disabled=false; showAlert('Expense not found.','danger'); return }

  let newPettyAmount = exp.pettyAmount||0;
  if(exp.paymentMethod==='petty_cash'){
    newPettyAmount = amount;
  } else if(exp.paymentMethod==='split' && (exp.pettyAmount||0)>0){
    newPettyAmount = Math.min(exp.pettyAmount||0, amount);
  }

  const pettyDelta = newPettyAmount - (exp.pettyAmount||0);
  if(Math.abs(pettyDelta)>0.001){
    const pettyCfg = await DB.getPettyConfig();
    await DB.savePettyConfig({ float: pettyCfg.float - pettyDelta, max: pettyCfg.max });
    DB.addAudit('petty_adjustment',`Petty float adjusted by ${fmt(Math.abs(pettyDelta))} from expense edit (${pettyDelta>0?'deducted':'returned'})`,state.user?.name);
  }

  await DB.updateExpense(id, { category, subCategory, description: description||subCategory, notes, amount, pettyAmount: newPettyAmount });
  DB.addAudit('expense_updated',`Expense updated: ${id} — ${category}/${subCategory}, amount: ${fmt(amount)}`,state.user?.name);
  closeModal();
  showAlert('Expense updated.','success');
  if(state.page==='bank') renderBank(); else renderExpenses();
}

const _expenseDeleting = new Set();
async function deleteExpense(id, btn=null){
  if(_expenseDeleting.has(id)) return;
  const all = await DB.getExpenses();
  const exp = all.find(e=>e.id===id);
  if(!exp) return;
  if(exp.status==='approved'){
    if(!canAction('expense_delete_approved')){ showAlert('You are not allowed to delete approved expenses.','danger'); return }
  } else {
    if(!canAction('expense_delete_pending')){ showAlert('You are not allowed to delete this expense.','danger'); return }
  }
  if(!confirm(`Delete this expense (${fmt(exp.amount)})?`)) return;
  _expenseDeleting.add(id);
  const restore = setBtnLoading(btn, 'Deleting…');
  try {
    await DB.deleteExpense(id);
    if((exp.pettyAmount||0)>0){
      DB.addAudit('petty_adjustment',`Petty float restored by ${fmt(exp.pettyAmount||0)} from deleted expense (${exp.id})`,state.user?.name);
    }
    DB.addAudit('expense_deleted',`Expense deleted: ${exp.id} (${fmt(exp.amount)})`,state.user?.name);
    showAlert('Expense deleted.','warn');
    renderExpenses();
  } catch(err) {
    restore();
    showAlert(`Failed to delete expense: ${err.message||'Unknown error'}. Please try again.`,'danger');
  } finally {
    _expenseDeleting.delete(id);
  }
}


async function showBankWithdrawal(){
  if(!canAction('bank_withdrawal')){ showAlert('You do not have permission to record bank withdrawals.','danger'); return; }
  const today = new Date().toISOString().split('T')[0];
  const allUsers = await DB.getUsers();
  const sigUsers = allUsers.filter(u=>['pastor','signatory','it_admin'].includes(u.role));
  const sigChecks = sigUsers.map(u=>`
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;margin-bottom:6px">
      <input type="checkbox" name="wd_sig" value="${esc(u.name)}" />
      <span>${esc(u.name)}</span>
      <span class="badge" style="font-size:10px;background:${ROLES[u.role]?.bg||'#eee'};color:${ROLES[u.role]?.color||'#333'}">${ROLES[u.role]?.label||u.role}</span>
    </label>`).join('');

  const catOptions = EXPENSE_CATS.map(c=>`<option value="${c.key}">${c.icon} ${c.label}</option>`).join('');

  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">🏦 Record Bank Withdrawal</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>Record cash withdrawn from the church bank account. Choose where the cash is going — this keeps the balance accurate.</span></div>

    <div class="form-group"><label class="form-label">Date *</label>
      <input type="date" id="wd_date" class="form-input" value="${today}" max="${today}" />
    </div>
    <div class="form-group"><label class="form-label">Amount Withdrawn (₦) *</label>
      <input type="number" id="wd_amt" class="form-input" placeholder="0" min="0" />
    </div>
    <div class="form-group"><label class="form-label">Destination *</label>
      <select id="wd_dest" class="form-select" onchange="App.onWdDestChange()">
        <option value="accountant_cash">→ Accountant's Cash (for expenses, remittances, etc.)</option>
        <option value="admin_petty_cash">→ Admin Officer's Petty Cash (top up the imprest wallet)</option>
        <option value="direct_expense">→ Direct Expense Payment (vendor paid immediately from bank)</option>
      </select>
    </div>

    <!-- Purpose — hidden when Direct Expense is selected (expense details serve this purpose) -->
    <div class="form-group" id="wd_desc_group"><label class="form-label">Purpose / Description *</label>
      <input type="text" id="wd_desc" class="form-input" placeholder="e.g. Petty cash top-up, Payment for hall rental" />
    </div>

    <!-- Direct Expense fields — shown only when Direct Expense Payment is selected -->
    <div id="wd_expense_section" style="display:none;background:var(--surface);border-radius:var(--r);padding:12px;margin-bottom:14px;border-left:3px solid var(--primary)">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--primary);margin-bottom:10px">📋 Expense Details</div>
      <div class="form-group" style="margin-bottom:10px">
        <label class="form-label">Category *</label>
        <select id="wd_exp_cat" class="form-select" onchange="App.onWdCatChange()">
          <option value="">— Select category —</option>
          ${catOptions}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:10px;display:none" id="wd_subcat_group">
        <label class="form-label">Sub-category *</label>
        <select id="wd_exp_subcat" class="form-select">
          <option value="">— Select category first —</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom:10px">
        <label class="form-label">Vendor / Paid To</label>
        <input type="text" id="wd_exp_vendor" class="form-input" placeholder="e.g. EEDC, Total Filling Station, Mr Emeka" />
      </div>
      <div class="form-group" style="margin-bottom:10px">
        <label class="form-label">Description (optional)</label>
        <input type="text" id="wd_exp_desc" class="form-input" placeholder="Additional detail about this expense" />
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Receipt / Invoice Proof <span style="font-size:11px;color:var(--text2);font-weight:normal">(optional)</span></label>
        <div style="font-size:11px;color:var(--text2);margin-bottom:8px">Provide a receipt/invoice number <strong>or</strong> upload a photo — at least one recommended.</div>
        <input type="text" id="wd_exp_receipt" class="form-input" placeholder="Receipt or invoice number" style="margin-bottom:8px" />
        <div style="font-size:11px;color:var(--text3);text-align:center;margin:2px 0 8px">— OR —</div>
        <label style="font-size:12px;color:var(--text2);margin-bottom:4px;display:block">Upload Photo of Receipt / Invoice</label>
        <input type="file" id="wd_exp_receipt_photo" accept="image/*" class="form-input" style="padding:6px" onchange="App._previewDepPhoto(this,'wd_exp_receipt_preview')" />
        <div id="wd_exp_receipt_preview" style="margin-top:6px;display:none"><img style="max-width:100%;max-height:150px;border-radius:6px;border:1px solid var(--border)" /></div>
      </div>
    </div>

    <div class="form-group"><label class="form-label" id="wd_ref_label">Bank Reference / Teller No.</label>
      <input type="text" id="wd_ref" class="form-input" placeholder="Optional bank reference number" />
    </div>
    <div class="form-group">
      <label class="form-label">Authorized By * <span style="font-size:11px;color:var(--text3)">(select all who approved this withdrawal)</span></label>
      ${sigChecks || `<input type="text" id="wd_auth_text" class="form-input" placeholder="Signatory names" />`}
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" id="wd_submit_btn" onclick="App.submitBankWithdrawal(this)">Record Withdrawal</button>
    </div>`);
}

function onWdDestChange(){
  const dest    = document.getElementById('wd_dest')?.value;
  const isDirect = dest==='direct_expense';
  const section  = document.getElementById('wd_expense_section');
  const descGrp  = document.getElementById('wd_desc_group');
  const btn      = document.getElementById('wd_submit_btn');
  const refLabel = document.getElementById('wd_ref_label');
  if(section)  section.style.display = isDirect ? '' : 'none';
  if(descGrp)  descGrp.style.display = isDirect ? 'none' : '';
  if(btn) btn.textContent = isDirect ? 'Record Withdrawal & Log Expense' : 'Record Withdrawal';
  if(refLabel) refLabel.textContent = isDirect ? 'Bank Reference / Teller No.' : 'Bank Reference / Cheque No.';
}

function onWdCatChange(){
  const cat     = document.getElementById('wd_exp_cat')?.value;
  const subcats = cat ? (EXPENSE_SUBCATS[cat]||['Others...']) : [];
  const group   = document.getElementById('wd_subcat_group');
  const sel     = document.getElementById('wd_exp_subcat');
  if(!group||!sel) return;
  if(!cat){
    sel.innerHTML = '<option value="">— Select category first —</option>';
    group.style.display = 'none';
    return;
  }
  sel.innerHTML = `<option value="">— Select sub-category —</option>` +
    subcats.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
  group.style.display = '';
}

function onWdAmtChange(){}

async function submitBankWithdrawal(btn=null){
  const date        = document.getElementById('wd_date')?.value;
  const amount      = parseFloat(document.getElementById('wd_amt')?.value)||0;
  const destination = document.getElementById('wd_dest')?.value||'accountant_cash';
  const description = document.getElementById('wd_desc')?.value?.trim();
  const reference   = document.getElementById('wd_ref')?.value?.trim();
  const checkedSigs = [...document.querySelectorAll('input[name="wd_sig"]:checked')].map(c=>c.value);
  const authText    = document.getElementById('wd_auth_text')?.value?.trim();
  const auth        = checkedSigs.length>0 ? checkedSigs.join(', ') : authText;

  const isDirect  = destination==='direct_expense';
  const expCat    = document.getElementById('wd_exp_cat')?.value;
  const expSubcat = document.getElementById('wd_exp_subcat')?.value?.trim();
  const expVendor = document.getElementById('wd_exp_vendor')?.value?.trim();
  const expDesc   = document.getElementById('wd_exp_desc')?.value?.trim();
  const receipt   = document.getElementById('wd_exp_receipt')?.value?.trim();
  const receiptPhotoFile = isDirect ? document.getElementById('wd_exp_receipt_photo')?.files?.[0] : null;

  if(!date||!amount){ showAlert('Please fill in the date and amount.','danger'); return; }
  if(!isDirect && !description){ showAlert('Please fill in the purpose / description.','danger'); return; }
  if(!auth){ showAlert('Please select at least one authorizing signatory.','danger'); return; }
  if(isDirect && !expCat){ showAlert('Please select an expense category.','danger'); return; }
  if(isDirect && !expSubcat){ showAlert('Please select a sub-category.','danger'); return; }

  let receiptPhotoData = '';
  if(receiptPhotoFile){
    receiptPhotoData = await new Promise(resolve=>{
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsDataURL(receiptPhotoFile);
    });
  }

  // Build description for the cash_transaction record
  const txDescription = isDirect
    ? [EXPENSE_CATS.find(c=>c.key===expCat)?.label, expSubcat, expDesc, expVendor?`Paid to: ${expVendor}`:''].filter(Boolean).join(' — ')
    : description;

  const restore = setBtnLoading(btn, 'Saving…');
  try {
    // 1. Record the bank withdrawal
    await DB.addCashTransaction({ type:'withdrawal', destination, date, amount, description:txDescription, reference, authorizedBy:auth, recordedBy:state.user?.name });
    DB.addAudit('bank_withdrawal',`Bank withdrawal: ${fmt(amount)} to ${destination.replace(/_/g,' ')} — "${txDescription}"${auth?` (auth: ${auth})`:''}`,state.user?.name);

    // 2. Handle destination-specific side effects
    if(destination === 'admin_petty_cash'){
      const pettyConfigBW = await DB.getPettyConfig();
      const newFloat = Math.min(pettyConfigBW.float + amount, pettyConfigBW.max);
      await DB.addPettyEntry({
        type:'refill', amount, source:'bank_withdrawal',
        reference, authorizedBy:auth, requestedBy:state.user?.name, status:'settled',
        createdAt:new Date().toISOString(),
        purpose:`Bank withdrawal → Admin Officer Petty Cash: ${description}`
      });
      await DB.savePettyConfig({ float: newFloat, max: pettyConfigBW.max });
      DB.addAudit('petty_refilled',`${fmt(amount)} from bank withdrawal credited to petty cash (${description})`,state.user?.name);
      closeModal();
      showAlert(`${fmt(amount)} withdrawn and credited to Admin Officer's petty cash. New wallet balance: ${fmt(newFloat)}.`,'success');

    } else if(isDirect){
      const catLabel  = EXPENSE_CATS.find(c=>c.key===expCat)?.label||expCat;
      const fullDesc  = [expVendor ? `${expSubcat||catLabel} — ${expVendor}` : (expSubcat||catLabel), expDesc].filter(Boolean).join('. ');
      await DB.addExpense({
        date, category:expCat,
        subCategory: expSubcat||catLabel,
        description: fullDesc||txDescription,
        amount,
        paymentMethod:'bank_transfer',
        bankAmount: amount,
        receiptNo: receipt||'',
        receiptImage: receiptPhotoData||'',
        notes:`Direct bank withdrawal. Ref: ${reference||'—'}. Authorized by: ${auth}.`,
        recordedBy: state.user?.name,
        status:'approved'
      });
      DB.addAudit('expense_recorded',`Direct expense from bank withdrawal: ${fmt(amount)} — "${fullDesc||txDescription}" (${expCat})`,state.user?.name);
      DB.addNotification('Direct Expense Logged',`${fmt(amount)} withdrawn and logged as "${catLabel}" expense.`,'info');
      closeModal();
      showAlert(`${fmt(amount)} withdrawn and logged as "${catLabel}" expense. Ref: ${reference||'—'}.`,'success');

    } else {
      closeModal();
      showAlert(`Bank withdrawal of ${fmt(amount)} recorded. Destination: ${destination.replace(/_/g,' ')}.`,'success');
    }

    navigate(state.page);
  } catch(err) {
    restore();
    showAlert(`Failed to record withdrawal: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

// ── BANK ────────────────────────────────
function setBankTab(t){ state.bankTab=t; renderBank() }

async function renderBank(){
  renderPageSkeleton({ pageTitle: 'Bank Account', pageSub: monthLabel(), kpiCount: 4, hint: 'Loading bank activity…' });
  // Pulled getRemRates into the parallel batch (was awaited sequentially after).
  const _bankSources = [
    ['Cash transactions',  () => DB.getCashTransactions()],
    ['Expense records',    () => DB.getExpenses()],
    ['Income records',     () => DB.getIncome()],
    ['Remittance history', () => DB.getRemittances()],
    ['Period range',       () => getCurrentPeriodRange()],
    ['Remittance rates',   () => getRemRates()],
    ['Satellite pass-through funds', () => DB.getSatelliteFunds()],
  ];
  const _bankSettled = await Promise.allSettled(_bankSources.map(([, fn]) => fn()));
  const _bankFailed = _bankSettled.map((r, i) => r.status === 'rejected' ? { label: _bankSources[i][0], err: r.reason } : null).filter(Boolean);
  if(_bankFailed.length > 0){
    renderPageErrorState({ pageId: 'bank', pageTitle: 'Bank Account', pageSub: monthLabel(), failed: _bankFailed });
    return;
  }
  const [allCashTx, allExpenses, allIncome, allRemittances, periodRange, _bankRatesData, allSatFundsRB] = _bankSettled.map(r => r.value);
  const remRates = _bankRatesData.rates || DEFAULT_REMITTANCE_RATES;
  const tab = state.bankTab||'overview';
  const { from: bankPeriodFrom, to: bankPeriodTo } = periodRange;

  // Calculate bank balance components
  const bankTransferIncome = allIncome.reduce((s,r) => s + (r.bankTransferAmount||0), 0);
  const cashDepositedToBank = allCashTx.filter(t=>t.type==='cash_deposit'&&isDepositEffective(t)).reduce((s,t) => s+(t.amount||0), 0);
  const bankExpenses = allExpenses.filter(isLoggedExpense).reduce((sum,e)=>{
    if(e.paymentMethod==='bank_transfer') return sum+(e.amount||0);
    if(e.paymentMethod==='split') return sum+(e.bankAmount||0);
    return sum;
  }, 0);
  const paidRems = allRemittances.filter(r=>r.status==='paid').reduce((s,r) => s+(r.amount||0), 0);
  const bankWithdrawals = allCashTx.filter(t=>t.type==='withdrawal').reduce((s,t) => s+(t.amount||0), 0);
  // Petty top-ups paid via bank transfer must be deducted (same as calcChurchBalance).
  // Status filter mirrors pettyCashTopupsRB — pending_approval requests haven't paid yet.
  const pettyHistory = await DB.getPetty();
  const pettyBankTopups = pettyHistory.filter(h=>h.type==='refill'&&(h.status==='approved'||h.status==='settled')&&(h.paymentMethod==='bank_transfer'||(h.paymentMethod==='split'&&(h.bankAmount||0)>0)))
    .reduce((s,h)=>s+(h.paymentMethod==='split'?(h.bankAmount||0):(h.amount||0)),0);
  const pettyToBankDeposits = pettyHistory.filter(h=>h.type==='petty_to_bank'&&(h.status==='approved'||h.status==='settled'))
    .reduce((s,h)=>s+(h.amount||0),0);
  const bankBalance = bankTransferIncome + cashDepositedToBank - bankExpenses - paidRems - bankWithdrawals - pettyBankTopups + pettyToBankDeposits;

  // Cash with Accountant (mirrors calcChurchBalance, using data already fetched above)
  const cashFromCollectionsRB = allIncome.reduce((s,r)=>{
    return s + getIncomeCashWithAccountant(r, remRates);
  },0);
  // Deposits that actually moved the ACCOUNTANT's held cash into the bank — excludes
  // satellite pass-through "in" mirrors (destination==='satellite_passthrough'), which
  // never touched the accountant. Mirrors the P1 fix in calcChurchBalance; see there.
  const cashDepositedFromAccountantRB = allCashTx.filter(t=>t.type==='cash_deposit'&&isDepositEffective(t)&&t.destination!=='satellite_passthrough').reduce((s,t) => s+(t.amount||0), 0);
  const bankToAccountantRB = allCashTx.filter(t=>t.type==='withdrawal'&&t.destination==='accountant_cash').reduce((s,t)=>s+(t.amount||0),0);
  const cashExpensesRB = allExpenses.filter(isLoggedExpense).reduce((s,e)=>{
    if(e.paymentMethod==='cash') return s+(e.amount||0);
    if(e.paymentMethod==='split') return s+(e.cashAmount||0);
    return s;
  },0);
  const pettyCashTopupsRB = pettyHistory.filter(h=>h.type==='refill'&&(h.status==='approved'||h.status==='settled')&&(h.paymentMethod==='cash_accountant'||(h.paymentMethod==='split'&&(h.cashAmount||0)>0)))
    .reduce((s,h)=>s+(h.paymentMethod==='split'?(h.cashAmount||0):(h.amount||0)),0);
  // Satellite "in" receipts handed to the accountant as CASH (channel==='cash') rather
  // than deposited to the bank — no cash_transactions mirror exists for these, so they
  // only ever enter the balance here. Mirrors calcChurchBalance's satelliteCashIn term.
  const satelliteCashInRB = (allSatFundsRB||[]).filter(s=>s.direction==='in' && s.channel==='cash').reduce((s,r)=>s+(r.amount||0),0);
  // Satellite/Zone Pool "out" payouts funded straight from the accountant's own cash
  // (channel==='cash_accountant') — no bank/petty mirror exists for these either, so
  // this is the only place they reduce the balance. Mirrors calcChurchBalance's
  // satelliteCashAccountantOut term.
  const satelliteCashAccountantOutRB = (allSatFundsRB||[]).filter(s=>s.direction==='out' && s.channel==='cash_accountant').reduce((s,r)=>s+(r.amount||0),0);
  const cashWithAccountant = Math.max(0, cashFromCollectionsRB - cashDepositedFromAccountantRB + bankToAccountantRB - cashExpensesRB - pettyCashTopupsRB + satelliteCashInRB - satelliteCashAccountantOutRB);
  const _bankPendingDeps = allCashTx.filter(t=>t.type==='cash_deposit'&&(t.verificationStatus==='pending'||t.verificationStatus==='flagged'));
  const _bankHasPending = _bankPendingDeps.length > 0;
  const _bankPendingTotal = _bankPendingDeps.reduce((s,t)=>s+(t.amount||0),0);

  // Held for satellites — authoritative from satellite_funds (same formula as
  // calcChurchBalance.heldForSatellites): a bank-channel receipt sits inside bankBalance
  // above; a cash-channel receipt sits inside cashWithAccountant above instead — either
  // way it is excluded from the parish's own available funds.
  const heldForSatellitesRB = (allSatFundsRB||[]).filter(s=>s.direction==='in').reduce((s,r)=>s+(r.amount||0),0)
    - (allSatFundsRB||[]).filter(s=>s.direction==='out').reduce((s,r)=>s+(r.amount||0),0)
    - (allSatFundsRB||[]).filter(s=>s.direction==='transfer_out').reduce((s,r)=>s+(r.amount||0),0);
  const bankSatHeldDisp = satelliteHeldDisplay(heldForSatellitesRB);

  // Period bank charges (calendar month or remittance period — follows state.periodMode)
  const periodExpenses = filterByCurrentPeriod(allExpenses, bankPeriodFrom, bankPeriodTo);
  const periodCashTx = filterByCurrentPeriod(allCashTx, bankPeriodFrom, bankPeriodTo);
  const monthlyBankCharges = periodExpenses.filter(e=>e.category==='bank'&&isLoggedExpense(e)).reduce((s,e)=>s+(e.amount||0),0);
  const monthlyWithdrawals = periodCashTx.filter(t=>t.type==='withdrawal');
  const monthlyDeposits = groupCashDeposits(periodCashTx.filter(t=>t.type==='cash_deposit'));

  // Period summary — opening balance, period inflows/outflows, closing balance
  const _ypd = raw => { const d = new Date(raw||''); return isNaN(d.getTime()) ? null : ymdLocal(d); };
  const _prePeriod = raw => { const d = _ypd(raw); return d !== null && d < bankPeriodFrom; };

  const openingBankBalance =
      allIncome.filter(r => _prePeriod(r.date||r.createdAt)).reduce((s,r) => s+(r.bankTransferAmount||0), 0)
    + allCashTx.filter(t => t.type==='cash_deposit' && isDepositEffective(t) && _prePeriod(t.date||t.createdAt)).reduce((s,t) => s+(t.amount||0), 0)
    - allExpenses.filter(e => isLoggedExpense(e) && _prePeriod(e.date||e.createdAt)).reduce((sum,e) => {
        if(e.paymentMethod==='bank_transfer') return sum+(e.amount||0);
        if(e.paymentMethod==='split') return sum+(e.bankAmount||0);
        return sum;
      }, 0)
    - allRemittances.filter(r => r.status==='paid' && _prePeriod(r.date||r.createdAt)).reduce((s,r) => s+(r.amount||0), 0)
    - allCashTx.filter(t => t.type==='withdrawal' && _prePeriod(t.date||t.createdAt)).reduce((s,t) => s+(t.amount||0), 0)
    - pettyHistory.filter(h => h.type==='refill' && (h.status==='approved'||h.status==='settled')
        && (h.paymentMethod==='bank_transfer'||(h.paymentMethod==='split'&&(h.bankAmount||0)>0))
        && _prePeriod(h.date||h.createdAt)).reduce((s,h) => s+(h.paymentMethod==='split'?(h.bankAmount||0):(h.amount||0)), 0);

  const periodTotalInflows =
      filterByCurrentPeriod(allIncome, bankPeriodFrom, bankPeriodTo).reduce((s,r) => s+(r.bankTransferAmount||0), 0)
    + monthlyDeposits.reduce((s,t) => s+(t.amount||0), 0);

  const periodTotalOutflows =
      periodExpenses.filter(e => isLoggedExpense(e) && (e.paymentMethod==='bank_transfer'||(e.paymentMethod==='split'&&(e.bankAmount||0)>0)))
        .reduce((sum,e) => { if(e.paymentMethod==='bank_transfer') return sum+(e.amount||0); if(e.paymentMethod==='split') return sum+(e.bankAmount||0); return sum; }, 0)
    + filterByCurrentPeriod(allRemittances, bankPeriodFrom, bankPeriodTo).filter(r => r.status==='paid').reduce((s,r) => s+(r.amount||0), 0)
    + monthlyWithdrawals.reduce((s,t) => s+(t.amount||0), 0)
    + filterByCurrentPeriod(pettyHistory, bankPeriodFrom, bankPeriodTo)
        .filter(h => h.type==='refill' && (h.status==='approved'||h.status==='settled')
          && (h.paymentMethod==='bank_transfer'||(h.paymentMethod==='split'&&(h.bankAmount||0)>0)))
        .reduce((s,h) => s+(h.paymentMethod==='split'?(h.bankAmount||0):(h.amount||0)), 0);

  const closingBankBalance = openingBankBalance + periodTotalInflows - periodTotalOutflows;

  // Pending cash deposits (income records with net undeposited cash after expense attribution)
  const expMapBank = buildExpenseCoveringMap(allIncome, allCashTx, remRates, allExpenses, pettyHistory);
  const pendingDepItems = allIncome.filter(r=>{
    const cashHeld = getIncomeCashWithAccountant(r, remRates);
    if(cashHeld<=0) return false;
    const entry = expMapBank.get(r.id);
    if(entry) return entry.stillPending > 0.5;
    const deposited = allCashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
    return deposited < cashHeld - 0.5;
  });
  const pendingDepCount = pendingDepItems.length;
  const pendingDepTotal = pendingDepItems.reduce((s,r)=>{
    const entry = expMapBank.get(r.id);
    if(entry) return s + entry.stillPending;
    const cashHeld = getIncomeCashWithAccountant(r, remRates);
    const deposited = allCashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
    return s + Math.max(0, cashHeld - deposited);
  }, 0);

  // All bank transactions for reconciliation (combined view)
  const bankTxAll = [
    ...allCashTx.filter(t=>t.type==='withdrawal').map(t=>({...t, txType:'withdrawal', txLabel:'Withdrawal', txAmt: -(t.amount||0)})),
    ...groupCashDeposits(allCashTx.filter(t=>t.type==='cash_deposit')).map(t=>({...t, txType:'deposit', txLabel:'Cash Deposit', txAmt: (t.amount||0)})),
    ...allExpenses
      .filter(e=>isLoggedExpense(e)&&(e.paymentMethod==='bank_transfer'||(e.paymentMethod==='split'&&(e.bankAmount||0)>0)))
      .map(e=>({
        ...e,
        txType:'expense',
        txLabel:`Expense: ${e.description||e.category}`,
        txAmt: -(e.paymentMethod==='split'?(e.bankAmount||0):(e.amount||0)),
        date:e.date||e.createdAt
      })),
    ...allRemittances.filter(r=>r.status==='paid').map(r=>({...r, txType:'remittance', txLabel:`Remittance: ${r.incomeType||'HQ'}`, txAmt: -(r.amount||0), date:r.date||r.createdAt})),
    ...allIncome.filter(r=>(r.bankTransferAmount||0)>0).map(r=>({...r, txType:'income', txLabel:`Income deposit (bank transfer)`, txAmt: (r.bankTransferAmount||0)})),
    ...pettyHistory.filter(h=>h.type==='refill'&&(h.status==='approved'||h.status==='settled')&&(h.paymentMethod==='bank_transfer'||(h.paymentMethod==='split'&&(h.bankAmount||0)>0)))
      .map(h=>({...h, txType:'petty-topup', txLabel:`Petty cash top-up (bank)`, txAmt:-(h.paymentMethod==='split'?(h.bankAmount||0):(h.amount||0))}))
  ].sort((a,b)=>new Date(b.date||b.createdAt||0)-new Date(a.date||a.createdAt||0));

  const monthBankTx = bankTxAll.filter(t=>{
    if(state.periodMode === 'remittance'){
      const raw = new Date(t.date || t.createdAt || '');
      if(isNaN(raw.getTime())) return false;
      const d = ymdLocal(raw);
      return d >= bankPeriodFrom && d <= bankPeriodTo;
    }
    const d=new Date(t.date||t.createdAt||0);
    return d.getMonth()===state.month && d.getFullYear()===state.year;
  });

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Bank Account</div><div class="page-sub">Balance: ${fmt(bankBalance)} · ${monthLabel()}${state.periodMode === 'remittance' ? ` Remittance Period (${fmtDateShort(bankPeriodFrom)} – ${fmtDateShort(bankPeriodTo)})` : ''}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${canAction('income_deposit')&&cashWithAccountant>0&&!_bankHasPending?`<button class="btn btn-amber" onclick="App.confirmBulkDeposit()">💰 Deposit Cash (${fmt(cashWithAccountant)})</button>`:''}
        ${canAction('income_deposit')&&_bankHasPending?`<button class="btn" style="border:1.5px solid var(--amber);color:var(--amber);background:rgba(184,134,11,0.08)" onclick="App.navigate('bank')">⏳ Deposit Pending (${fmt(_bankPendingTotal)})</button>`:''}
        ${canAction('bank_withdrawal')?`<button class="btn btn-primary" onclick="App.showBankWithdrawal()">🏦 Record Withdrawal</button>`:''}
        ${canAction('bank_charge')?`<button class="btn" onclick="App.showBankChargeForm()">💳 Bank Charge</button>`:''}
      </div>
    </div>
    ${_bankHasPending?`<div class="alert alert-warn" style="margin-bottom:12px"><span class="alert-icon">⏳</span><span>A deposit of <strong>${fmt(_bankPendingTotal)}</strong> is ${_bankPendingDeps[0]?.verificationStatus==='flagged'?'<strong>flagged by AI</strong> — please review and correct or approve it below':'<strong>pending AI verification</strong>'}.</span></div>`:''}
    ${cashWithAccountant>0&&!_bankHasPending&&canAction('income_deposit')?`<div class="alert alert-warn" style="margin-bottom:12px"><span class="alert-icon">⚠</span><span>Cash with Accountant: <strong>${fmt(cashWithAccountant)}</strong> not yet deposited to the bank account.${pendingDepCount>0?` (${pendingDepCount} income record(s) pending)`:''} <button class="btn btn-sm btn-amber" onclick="App.confirmBulkDeposit()" style="margin-left:8px">Deposit Now</button></span></div>`:''}
    ${Math.abs(heldForSatellitesRB||0)>=0.5?`<div class="alert alert-info" style="margin-bottom:12px"><span class="alert-icon">🛰️</span><span>${bankSatHeldDisp.label}: <strong>${bankSatHeldDisp.amount}</strong> (${bankSatHeldDisp.suffix}) — already included in the Bank Balance or Cash with Accountant below (depending on how it was received); see the <a onclick="App.navigate('remittances')" style="cursor:pointer;text-decoration:underline">Satellite Pass-Through Fund panel</a> on Remittances.</span></div>`:''}

    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
      <div class="kpi">
        <div class="kpi-icon" style="background:#E6F1FB">🏦</div>
        <div class="kpi-label">Bank Balance</div>
        <div class="kpi-val" style="color:${bankBalance<0?'var(--danger)':'var(--primary)'}">${fmt(bankBalance)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-icon" style="background:#E1F5EE">📥</div>
        <div class="kpi-label">Total Inflows</div>
        <div class="kpi-val">${fmt(bankTransferIncome + cashDepositedToBank)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-icon" style="background:#FCEBEB">📤</div>
        <div class="kpi-label">Total Outflows</div>
        <div class="kpi-val">${fmt(bankExpenses + paidRems + bankWithdrawals + pettyBankTopups)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-icon" style="background:#FAEEDA">💳</div>
        <div class="kpi-label">Bank Charges (${state.periodMode==='remittance'?'Period':MONTHS[state.month].slice(0,3)})</div>
        <div class="kpi-val">${fmt(monthlyBankCharges)}</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:12px">
      <div class="card-header"><span class="card-title">${monthLabel()} Summary</span></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:4px 0 8px">
        <div style="text-align:center;padding:10px 4px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Opening Balance</div>
          <div style="font-size:14px;font-weight:700;color:${openingBankBalance<0?'var(--danger)':'var(--text1)'}">${fmt(openingBankBalance)}</div>
        </div>
        <div style="text-align:center;padding:10px 4px;background:#E1F5EE;border-radius:8px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Inflows</div>
          <div style="font-size:14px;font-weight:700;color:var(--success,#2e7d32)">+${fmt(periodTotalInflows)}</div>
        </div>
        <div style="text-align:center;padding:10px 4px;background:#FCEBEB;border-radius:8px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Outflows</div>
          <div style="font-size:14px;font-weight:700;color:var(--danger)">−${fmt(periodTotalOutflows)}</div>
        </div>
        <div style="text-align:center;padding:10px 4px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Closing Balance</div>
          <div style="font-size:14px;font-weight:700;color:${closingBankBalance<0?'var(--danger)':'var(--primary)'}">${fmt(closingBankBalance)}</div>
        </div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab ${tab==='overview'?'active':''}" onclick="App.setBankTab('overview')">Overview</button>
      <button class="tab ${tab==='withdrawals'?'active':''}" onclick="App.setBankTab('withdrawals')">Withdrawals (${monthlyWithdrawals.length})</button>
      <button class="tab ${tab==='deposits'?'active':''}" onclick="App.setBankTab('deposits')">Deposits (${monthlyDeposits.length})</button>
      <button class="tab ${tab==='charges'?'active':''}" onclick="App.setBankTab('charges')">Bank Charges</button>
      <button class="tab ${tab==='reconciliation'?'active':''}" onclick="App.setBankTab('reconciliation')">Reconciliation</button>
    </div>

    ${tab==='overview'?renderBankOverview(monthBankTx,closingBankBalance):
      tab==='withdrawals'?renderBankWithdrawals(monthlyWithdrawals):
      tab==='deposits'?renderBankDeposits(monthlyDeposits):
      tab==='charges'?renderBankCharges(periodExpenses.filter(e=>e.category==='bank')):
      renderBankReconciliation(bankTxAll,bankBalance,bankTransferIncome,cashDepositedToBank,bankExpenses,paidRems,bankWithdrawals,pettyBankTopups)}`;

  // These populate their own DOM regions asynchronously after the page above
  // is already showing, so a slow/failed fetch never blocks the Bank page itself.
  if(tab==='charges') loadBankEmailIngestCard();
  if(tab==='reconciliation') autoCheckBankReconciliation();
}

function renderBankOverview(monthBankTx,bankBalance){
  if(!monthBankTx.length) return '<div class="card"><div class="empty-table">No bank transactions this month.</div></div>';
  // Compute balance after each transaction (list is newest-first)
  let runningBal = bankBalance;
  const txWithBal = monthBankTx.map(t => {
    const balAfter = runningBal;
    runningBal -= t.txAmt;
    return { ...t, balAfter };
  });
  return `<div class="card">
    <div class="card-header"><span class="card-title">Bank Transactions — ${monthLabel()}</span></div>
    <div style="padding:0 4px">
      ${txWithBal.map(t=>{
        const isCredit = t.txAmt > 0;
        const color = isCredit ? 'var(--success,#2e7d32)' : 'var(--danger)';
        const sign  = isCredit ? '+' : '';
        const balColor = t.balAfter < 0 ? 'var(--danger)' : 'var(--primary)';
        return `<div onclick="var d=this.querySelector('.bk-det');d.style.display=d.style.display==='none'?'block':'none'" style="cursor:pointer;border-bottom:1px solid var(--border-light,#f0f0f0);padding:10px 0">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.txLabel}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">${fmtDate(t.date||t.createdAt)} &nbsp;·&nbsp; <span class="badge ${isCredit?'badge-success':'badge-danger'}" style="font-size:10px">${t.txType}</span> ${t.verificationStatus?depositVerificationBadge(t):''}</div>
            </div>
            <div style="text-align:right;flex-shrink:0;margin-left:4px">
              <div style="font-size:14px;font-weight:700;color:${color}">${sign}${fmt(Math.abs(t.txAmt))}</div>
            </div>
            <span style="font-size:9px;color:var(--text3);flex-shrink:0">▾</span>
          </div>
          <div class="bk-det" style="display:none;padding:8px 0 2px;font-size:11px;color:var(--text2);line-height:2">
            <div>Balance after this transaction: <strong style="color:${balColor}">${fmt(t.balAfter)}</strong></div>
            ${t.reference?`<div>Reference: <strong>${t.reference}</strong></div>`:''}
            ${(()=>{ const pid=t._splitParts?t._splitParts.find(p=>p.hasPhoto||p.photoData)?.id:(t.hasPhoto||t.photoData?t.id:null); return pid?`<div><a href="#" onclick="event.preventDefault();App.viewCashPhoto('${pid}')" style="color:var(--primary);font-weight:600">📷 View Deposit Slip</a></div>`:''; })()}
            ${t._splitParts?`<div style="margin-top:4px;font-size:10px;color:var(--text3)">Split across ${t._splitParts.length} income records: ${t._splitParts.map(p=>fmt(p.amount)).join(' + ')}</div>`:''}
            ${t.verificationStatus?`<div style="margin-top:4px">${depositActionButtons(t)}</div>`:''}
            ${t.aiNotes?`<div style="margin-top:4px;font-size:10px;color:var(--text3)">AI: ${t.aiNotes}</div>`:''}
            <div>Time: ${fmtTime(t.createdAt||t.date)}</div>
            ${bankTxActionButtons(t)}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// ── Bank Ledger — Edit / Delete (IT Admin only) ─────────────────────────────
// The Bank Overview ledger merges several underlying record types (cash
// deposits/withdrawals, bank-transfer expenses, paid remittances, income bank
// transfers, petty top-ups paid via bank) into one unified view. These actions
// are deliberately self-contained (rather than reusing each source page's own
// edit/delete flow) since those flows carry role rules meant for other roles
// (e.g. admin_officer expense edits, accountant approvals) that don't apply
// to this IT-Admin-only surface, and some (paid remittances) are otherwise
// locked from deletion entirely once paid.
const BANK_TX_LABELS = {
  deposit:'Cash Deposit', withdrawal:'Bank Withdrawal', expense:'Expense',
  remittance:'Remittance', income:'Income (Bank Transfer)', 'petty-topup':'Petty Cash Top-up'
};

function bankTxActionButtons(t){
  if(state.user?.role!=='it_admin') return '';
  const grouped = !!t._splitParts && t._splitParts.length>1;
  if(grouped){
    return `<div style="margin-top:6px;font-size:10px;color:var(--text3)">This deposit combines multiple income records — edit or delete the individual entries from the Income page.</div>`;
  }
  return `<div style="margin-top:6px;display:flex;gap:6px">
    <button class="btn btn-sm" onclick="event.stopPropagation();App.editBankTx('${t.txType}','${t.id}')" style="font-size:10px;padding:2px 8px">✏️ Edit</button>
    <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();App.confirmDeleteBankTx('${t.txType}','${t.id}')" style="font-size:10px;padding:2px 8px">🗑️ Delete</button>
  </div>`;
}

async function editBankTx(txType, id){
  if(state.user?.role!=='it_admin'){ showAlert('Access denied.','danger'); return; }
  if(txType==='expense') return editExpense(id);

  let record, amountLabel='Amount (₦) *', extraFieldsHtml='';
  if(txType==='deposit' || txType==='withdrawal'){
    const all = await DB.getCashTransactions();
    record = all.find(r=>r.id===id);
    if(!record){ showAlert('Record not found.','danger'); return; }
    extraFieldsHtml = `
      <div class="form-group"><label class="form-label">Date</label><input type="date" id="btx_date" class="form-input" value="${(record.date||'').slice(0,10)}" /></div>
      <div class="form-group"><label class="form-label">Description</label><input type="text" id="btx_desc" class="form-input" value="${esc(record.description||'')}" /></div>`;
  } else if(txType==='petty-topup'){
    const all = await DB.getPetty();
    record = all.find(r=>r.id===id);
    if(!record){ showAlert('Record not found.','danger'); return; }
  } else if(txType==='remittance'){
    const all = await DB.getRemittances();
    record = all.find(r=>r.id===id);
    if(!record){ showAlert('Record not found.','danger'); return; }
    extraFieldsHtml = `<div class="form-group"><label class="form-label">Reference</label><input type="text" id="btx_ref" class="form-input" value="${esc(record.reference||'')}" /></div>`;
  } else if(txType==='income'){
    const all = await DB.getIncome();
    record = all.find(r=>r.id===id);
    if(!record){ showAlert('Record not found.','danger'); return; }
    amountLabel = 'Bank Transfer Amount (₦) *';
    record = { ...record, amount: record.bankTransferAmount||0 };
  } else {
    showAlert('This transaction type cannot be edited here.','danger'); return;
  }

  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">✏️ Edit ${BANK_TX_LABELS[txType]||'Bank Transaction'}</div>
    <div class="form-group"><label class="form-label">${amountLabel}</label><input type="number" id="btx_amount" class="form-input" value="${record.amount||0}" min="0" step="0.01" /></div>
    ${extraFieldsHtml}
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitEditBankTx('${txType}','${id}',this)">Save Changes</button>
    </div>`);
  setTimeout(()=>document.getElementById('btx_amount')?.focus(),100);
}

async function submitEditBankTx(txType, id, btn=null){
  if(state.user?.role!=='it_admin'){ showAlert('Access denied.','danger'); return; }
  const amount = parseFloat(document.getElementById('btx_amount')?.value);
  if(isNaN(amount) || amount<0){ showAlert('Please enter a valid amount.','danger'); return; }
  const restore = setBtnLoading(btn, 'Saving…');
  try {
    if(txType==='deposit' || txType==='withdrawal'){
      const date = document.getElementById('btx_date')?.value;
      const description = document.getElementById('btx_desc')?.value?.trim();
      await DB.updateCashTransaction(id, { amount, date, description });
    } else if(txType==='petty-topup'){
      await DB.updatePettyEntry(id, { amount });
    } else if(txType==='remittance'){
      const reference = document.getElementById('btx_ref')?.value?.trim();
      await DB.updateRemittance(id, { amount, reference });
    } else if(txType==='income'){
      await DB.updateIncome(id, { bankTransferAmount: amount });
    }
    DB.addAudit('bank_tx_updated', `${BANK_TX_LABELS[txType]||'Bank transaction'} updated (${id}): amount set to ${fmt(amount)}`, state.user?.name);
    closeModal();
    showAlert('Bank transaction updated.','success');
    renderBank();
  } catch(err){
    restore();
    showAlert('Failed to save: '+(err?.message||'Unknown error'),'danger');
  }
}

function confirmDeleteBankTx(txType, id){
  if(state.user?.role!=='it_admin'){ showAlert('Access denied.','danger'); return; }
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">🗑 Delete ${BANK_TX_LABELS[txType]||'Bank Transaction'}</div>
    <div class="alert alert-warn" style="margin-bottom:16px"><span class="alert-icon">⚠</span><span><strong>This is permanent.</strong> Deleting this record will remove it from the bank ledger and all balance calculations. This cannot be undone.</span></div>
    <div class="form-group">
      <label class="form-label">Enter your IT Admin PIN to confirm</label>
      <input type="password" id="del_btx_pin" class="form-input" maxlength="6" placeholder="••••••" inputmode="numeric"
        onkeydown="if(event.key==='Enter')App.submitDeleteBankTx('${txType}','${id}',document.getElementById('del_btx_confirm_btn'))" />
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button id="del_btx_confirm_btn" class="btn btn-danger" onclick="App.submitDeleteBankTx('${txType}','${id}',this)">Confirm Delete</button>
    </div>`);
  setTimeout(()=>document.getElementById('del_btx_pin')?.focus(),100);
}

async function submitDeleteBankTx(txType, id, btn=null){
  if(state.user?.role!=='it_admin'){ showAlert('Access denied.','danger'); return; }
  const pin = document.getElementById('del_btx_pin')?.value?.trim();
  if(!pin){ showAlert('Please enter your PIN.','danger'); return; }
  const restore = setBtnLoading(btn, 'Verifying…');
  try {
    await DB.login({ role:'it_admin', userId: state.user.id, pin });
  } catch(e){
    restore();
    const msg = String(e?.message||'');
    showAlert(msg.toLowerCase().includes('invalid credentials') ? 'Incorrect PIN. Please try again.' : 'PIN verification failed: '+msg, 'danger');
    document.getElementById('del_btx_pin')?.select();
    return;
  }
  try {
    btn.innerHTML = '<span class="btn-spinner-sm"></span> Deleting…';
    if(txType==='expense'){
      const all = await DB.getExpenses();
      const exp = all.find(e=>e.id===id);
      await DB.deleteExpense(id);
      if(exp && (exp.pettyAmount||0)>0){
        DB.addAudit('petty_adjustment', `Petty float restored by ${fmt(exp.pettyAmount)} from deleted expense (${id})`, state.user?.name);
      }
    } else if(txType==='deposit' || txType==='withdrawal'){
      await DB.deleteCashTransaction(id);
    } else if(txType==='petty-topup'){
      await DB.deletePettyEntry(id);
    } else if(txType==='remittance'){
      await DB.deleteRemittance(id, true);
    } else if(txType==='income'){
      await DB.updateIncome(id, { bankTransferAmount: 0 });
    }
    DB.addAudit('bank_tx_deleted', `${BANK_TX_LABELS[txType]||'Bank transaction'} deleted by ${state.user?.name}: ${id}`, state.user?.name);
    DB.addNotification('Bank Transaction Deleted', `${BANK_TX_LABELS[txType]||'A bank transaction'} was deleted by ${state.user?.name}.`, 'warn');
    closeModal();
    showAlert('Bank transaction deleted.','warn');
    renderBank();
  } catch(err){
    restore();
    showAlert('Failed to delete: '+(err?.message||'Unknown error'),'danger');
  }
}

function renderBankWithdrawals(withdrawals){
  if(!withdrawals.length) return '<div class="card"><div class="empty-table">No bank withdrawals this month.</div></div>';
  return `<div class="card">
    <div class="card-header"><span class="card-title">Bank Withdrawals — ${monthLabel()}</span></div>
    <div style="padding:0 4px">
      ${withdrawals.map(t=>`<div onclick="var d=this.querySelector('.bk-det');d.style.display=d.style.display==='none'?'block':'none'" style="cursor:pointer;border-bottom:1px solid var(--border-light,#f0f0f0);padding:10px 0">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.description||'Bank Withdrawal'}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">${fmtDate(t.date||t.createdAt)} &nbsp;·&nbsp; <span class="badge badge-info" style="font-size:10px">${(t.destination||'').replace(/_/g,' ')}</span></div>
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:4px">
            <div style="font-size:14px;font-weight:700;color:var(--danger)">−${fmt(t.amount)}</div>
          </div>
          <span style="font-size:9px;color:var(--text3);flex-shrink:0">▾</span>
        </div>
        <div class="bk-det" style="display:none;padding:8px 0 2px;font-size:11px;color:var(--text2);line-height:2">
          ${t.reference?`<div>Reference: <strong>${t.reference}</strong></div>`:''}
          ${t.authorizedBy?`<div>Authorized By: <strong>${t.authorizedBy}</strong></div>`:''}
          <div>Time: ${fmtTime(t.createdAt||t.date)}</div>
        </div>
      </div>`).join('')}
    </div>
  </div>`;
}

function renderBankDeposits(deposits){
  if(!deposits.length) return '<div class="card"><div class="empty-table">No cash deposits to bank this month.</div></div>';
  return `<div class="card">
    <div class="card-header"><span class="card-title">Cash Deposits to Bank — ${monthLabel()}</span></div>
    <div style="padding:0 4px">
      ${deposits.map(t=>{
        const parts = t._splitParts;
        const photoId = parts ? parts.find(p=>p.hasPhoto||p.photoData)?.id : (t.hasPhoto||t.photoData?t.id:null);
        const breakdown = parts
          ? `<div style="margin-top:6px;padding:6px 8px;background:var(--bg2,#f7f7f7);border-radius:6px;font-size:10px;color:var(--text3)">Split across ${parts.length} income records: ${parts.map(p=>fmt(p.amount)).join(' + ')}</div>`
          : '';
        return `<div onclick="var d=this.querySelector('.bk-det');d.style.display=d.style.display==='none'?'block':'none'" style="cursor:pointer;border-bottom:1px solid var(--border-light,#f0f0f0);padding:10px 0">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.description||'Cash Deposit'}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">${fmtDate(t.date||t.createdAt)}${t.depositMethod?` &nbsp;·&nbsp; ${(t.depositMethod||'').replace(/_/g,' ')}`:''}${photoId?` &nbsp;·&nbsp; <span class="badge badge-info" style="font-size:10px">📷 Photo</span>`:''}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:4px">
            <div style="font-size:14px;font-weight:700;color:var(--success,#2e7d32)">+${fmt(t.amount)}</div>
          </div>
          <span style="font-size:9px;color:var(--text3);flex-shrink:0">▾</span>
        </div>
        <div class="bk-det" style="display:none;padding:8px 0 2px;font-size:11px;color:var(--text2);line-height:2">
          ${t.reference?`<div>Reference: <strong>${t.reference}</strong></div>`:''}
          ${t.recordedBy?`<div>Recorded By: <strong>${t.recordedBy}</strong></div>`:''}
          ${photoId?`<div><a href="#" onclick="event.preventDefault();App.viewCashPhoto('${photoId}')" style="color:var(--primary);font-weight:600">📷 View Deposit Slip</a></div>`:''}
          ${breakdown}
          <div>Time: ${fmtTime(t.createdAt||t.date)}</div>
        </div>
      </div>`;
      }).join('')}
    </div>
  </div>`;
}

function renderBankCharges(charges){
  const total = charges.reduce((s,e)=>s+(e.amount||0),0);
  const ingestCard = `<div id="bankEmailIngestCard"></div>`;
  if(!charges.length) return ingestCard + '<div class="card"><div class="empty-table">No bank charges recorded this month.</div></div>';
  return ingestCard + `<div class="card">
    <div class="card-header"><span class="card-title">Bank Charges — ${monthLabel()}</span><span style="font-size:13px;font-weight:600;color:var(--danger)">${fmt(total)}</span></div>
    <div style="padding:0 4px">
      ${charges.map(e=>`<div onclick="var d=this.querySelector('.bk-det');d.style.display=d.style.display==='none'?'block':'none'" style="cursor:pointer;border-bottom:1px solid var(--border-light,#f0f0f0);padding:10px 0">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.subCategory||'Bank Charge'}${e.recordedBy==='AI Email Ingest'?' <span class="badge badge-info" style="font-size:9px;vertical-align:middle">🤖 AI Email</span>':''}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">${fmtDate(e.date||e.createdAt)}${e.description?` &nbsp;·&nbsp; ${e.description}`:''}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:4px">
            <div style="font-size:14px;font-weight:700;color:var(--danger)">−${fmt(e.amount)}</div>
          </div>
          <span style="font-size:9px;color:var(--text3);flex-shrink:0">▾</span>
        </div>
        <div class="bk-det" style="display:none;padding:8px 0 2px;font-size:11px;color:var(--text2);line-height:2">
          ${e.receiptNo?`<div>Receipt: <strong>${e.receiptNo}</strong></div>`:''}
          <div>Time: ${fmtTime(e.createdAt||e.date)}</div>
        </div>
      </div>`).join('')}
    </div>
  </div>`;
}

const CHURCH_INGEST_OUTCOME_LABELS = {
  inserted: 'Recorded', skipped_not_charge: 'Not a charge', skipped_duplicate: 'Duplicate',
  skipped_wrong_account: 'Wrong account', error: 'Error', pending: 'Pending',
};
const CHURCH_INGEST_OUTCOME_BADGES = {
  inserted: 'badge-success', skipped_not_charge: 'badge-gray', skipped_duplicate: 'badge-gray',
  skipped_wrong_account: 'badge-danger', error: 'badge-danger', pending: 'badge-info',
};

// Fetched and rendered separately from the main Bank page data (rather than
// inside the critical Promise.allSettled batch) so a hiccup on this
// supplementary audit log never blocks the whole Bank page from loading.
async function loadBankEmailIngestCard(){
  const el = document.getElementById('bankEmailIngestCard');
  if(!el) return;
  try {
    const log = await DB.getChurchBankIngestLog();
    el.innerHTML = renderChurchBankIngestCard(log);
  } catch(_) { /* supplementary info only — fail silently */ }
}

function renderChurchBankIngestCard(log){
  const entries = Array.isArray(log?.entries) ? log.entries : [];
  const counts = log?.counts || {};
  const needsAttention = !!log?.needsAttention;
  if(!entries.length) return '';
  return `<div class="card" style="margin-bottom:12px">
    <details>
      <summary style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;list-style:none">
        <span class="card-title">🤖 Bank Charge Email Automation</span>
        <span class="badge ${needsAttention?'badge-danger':'badge-success'}">${needsAttention?'⚠ Needs attention':'✓ Healthy'}</span>
      </summary>
      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--text2)">
        <span>✅ ${counts.inserted||0} recorded</span>
        <span>⏭ ${(counts.skipped_not_charge||0)+(counts.skipped_duplicate||0)} skipped</span>
        <span style="color:${(counts.skipped_wrong_account||0)>0?'var(--danger)':'inherit'}">🚫 ${counts.skipped_wrong_account||0} wrong account</span>
        <span style="color:${(counts.error||0)>0?'var(--danger)':'inherit'}">❌ ${counts.error||0} error${counts.error===1?'':'s'}</span>
        ${needsAttention?`<button class="btn btn-sm" onclick="App.ackChurchBankIngestAttention('${esc(log.lastActivityAt||'')}')">Mark as reviewed</button>`:''}
      </div>
      <div style="margin-top:10px;max-height:240px;overflow-y:auto">
        ${entries.map(e=>`<div style="padding:6px 0;border-bottom:1px solid var(--border-light,#f0f0f0);font-size:12px">
          <div style="display:flex;justify-content:space-between;gap:8px">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.subject||'(no subject)')}</span>
            <span class="badge ${CHURCH_INGEST_OUTCOME_BADGES[e.outcome]||'badge-gray'}" style="flex-shrink:0">${CHURCH_INGEST_OUTCOME_LABELS[e.outcome]||e.outcome}</span>
          </div>
          <div style="color:var(--text3);margin-top:2px">${fmtDate(e.createdAt)} ${fmtTime(e.createdAt)}</div>
          ${(e.outcome==='error'||e.outcome==='skipped_wrong_account')&&e.errorDetail?`<div style="color:var(--danger);margin-top:2px">⚠ ${esc(e.errorDetail)}</div>`:''}
        </div>`).join('')}
      </div>
    </details>
  </div>`;
}

async function ackChurchBankIngestAttention(lastActivityAt){
  const s = await DB.getSettings();
  s.church_email_ingest_ack_at = lastActivityAt || '';
  await DB.saveSettings(s);
  loadBankEmailIngestCard();
}

function renderBankReconciliation(bankTxAll,bankBalance,bankTransferIncome,cashDepositedToBank,bankExpenses,paidRems,bankWithdrawals,pettyBankTopups=0){
  return `
    <div class="card">
      <div class="card-header"><span class="card-title">Bank Reconciliation Summary</span></div>
      <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>This reconciliation view shows how the computed bank balance is derived from all income, deposits, expenses, remittances, and withdrawals. Compare this with your actual bank statement.</span></div>

      <div style="margin-top:12px">
        <div class="status-row"><div><div class="status-row-label" style="color:var(--success)">+ Income received via bank transfer</div></div><div class="status-row-right"><div class="status-row-amt td-green">${fmt(bankTransferIncome)}</div></div></div>
        <div class="status-row"><div><div class="status-row-label" style="color:var(--success)">+ Cash deposited to bank</div></div><div class="status-row-right"><div class="status-row-amt td-green">${fmt(cashDepositedToBank)}</div></div></div>
        <div class="status-row"><div><div class="status-row-label" style="color:var(--danger)">− Expenses paid via bank transfer</div></div><div class="status-row-right"><div class="status-row-amt td-red">${fmt(bankExpenses)}</div></div></div>
        <div class="status-row"><div><div class="status-row-label" style="color:var(--danger)">− Paid remittances</div></div><div class="status-row-right"><div class="status-row-amt td-red">${fmt(paidRems)}</div></div></div>
        <div class="status-row"><div><div class="status-row-label" style="color:var(--danger)">− Bank withdrawals (cash out)</div></div><div class="status-row-right"><div class="status-row-amt td-red">${fmt(bankWithdrawals)}</div></div></div>
        <div class="status-row"><div><div class="status-row-label" style="color:var(--danger)">− Petty cash top-ups via bank transfer</div></div><div class="status-row-right"><div class="status-row-amt td-red">${fmt(pettyBankTopups)}</div></div></div>
        <div class="status-row" style="border-top:2px solid var(--border);margin-top:8px;padding-top:12px">
          <div><div class="status-row-label fw-bold">= Computed Bank Balance</div></div>
          <div class="status-row-right"><div class="status-row-amt" style="color:${bankBalance<0?'var(--danger)':'var(--primary)'};font-size:18px;font-weight:700">${fmt(bankBalance)}</div></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Statement Entry Check</span></div>
      <p style="font-size:13px;color:var(--text2);margin-bottom:12px">Automatically checked against the balance in the bank's own alert emails whenever one arrives. You can also enter a balance manually below to compare on demand.</p>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Bank Statement Balance (₦)</label><input type="number" id="bank_stmt_bal" class="form-input" placeholder="Enter actual balance from bank statement" /></div>
        <div class="form-group" style="display:flex;align-items:flex-end"><button class="btn btn-primary" onclick="App.compareBankBalance()">Compare</button></div>
      </div>
      <div id="bankCompareResult"></div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">All Bank Transactions (Ledger)</span></div>
      ${bankTxAll.length?`<div class="table-wrap"><table>
        <tr><th>Date</th><th>Type</th><th>Description</th><th class="td-right">Debit</th><th class="td-right">Credit</th><th>Reference</th></tr>
        ${bankTxAll.map(t=>{
          const isCredit = t.txAmt > 0;
          return `<tr>
            <td style="white-space:nowrap">${fmtDate(t.date||t.createdAt)}<div class="td-muted" style="font-size:11px">${fmtTime(t.createdAt||t.date)}</div></td>
            <td><span class="badge ${isCredit?'badge-success':'badge-danger'}">${t.txType}</span></td>
            <td>${t.txLabel}</td>
            <td class="td-right ${!isCredit?'td-red':''}">${!isCredit?fmt(Math.abs(t.txAmt)):'—'}</td>
            <td class="td-right ${isCredit?'td-green':''}">${isCredit?fmt(t.txAmt):'—'}</td>
            <td class="td-muted">${t.reference||'—'}</td>
          </tr>`}).join('')}
      </table></div>`:'<div class="empty-table">No bank transactions found.</div>'}
    </div>`;
}

function compareBankBalance(){
  const stmtBal = parseFloat(document.getElementById('bank_stmt_bal')?.value);
  if(isNaN(stmtBal)){ showAlert('Please enter the bank statement balance.','danger'); return }
  calcChurchBalance().then(bal=>{
    const diff = bal.bankBalance - stmtBal;
    const el = document.getElementById('bankCompareResult');
    if(!el) return;
    if(Math.abs(diff) < 1){
      el.innerHTML = `<div class="alert alert-success" style="margin-top:12px"><span class="alert-icon">✓</span><span><strong>Reconciled!</strong> The computed bank balance matches the bank statement.</span></div>`;
    } else {
      el.innerHTML = `<div class="alert ${diff>0?'alert-warn':'alert-danger'}" style="margin-top:12px"><span class="alert-icon">⚠</span><span><strong>Discrepancy: ${fmt(Math.abs(diff))}</strong><br>Computed balance: ${fmt(bal.bankBalance)}<br>Statement balance: ${fmt(stmtBal)}<br>${diff>0?'System shows more than bank statement. Check for unrecorded bank charges or debits.':'Bank statement shows more than system. Check for unrecorded deposits or credits.'}</span></div>`;
    }
  });
}

// Auto-fills and auto-runs the Statement Entry Check using the balance figure
// captured from the most recent bank alert email, comparing the computed
// balance "as of" that same date (not "as of now") so later, legitimately
// unreflected transactions never produce a false-positive mismatch. Reuses
// calcChurchBalance's own asOfDate support rather than re-deriving the bank
// balance formula server-side, so there is only ever one source of truth for it.
async function autoCheckBankReconciliation(){
  const input = document.getElementById('bank_stmt_bal');
  const el = document.getElementById('bankCompareResult');
  if(!input || !el) return;
  try {
    const snap = await DB.getBankBalanceSnapshot();
    if(!snap || !snap.date || snap.balance===null || snap.balance===undefined) return;
    if(!input.value) input.value = snap.balance;
    const bal = await calcChurchBalance(snap.date);
    const diff = bal.bankBalance - snap.balance;
    const asOfNote = `<div style="font-size:11px;color:var(--text3);margin-top:4px">Auto-checked against the balance reported in the bank's own alert email as of ${fmtDate(snap.date)}.</div>`;
    if(Math.abs(diff) < 1){
      el.innerHTML = `<div class="alert alert-success" style="margin-top:12px"><span class="alert-icon">✓</span><span><strong>Reconciled!</strong> Computed balance matches the bank's last reported balance as of ${fmtDate(snap.date)}.</span></div>${asOfNote}`;
    } else {
      el.innerHTML = `<div class="alert ${diff>0?'alert-warn':'alert-danger'}" style="margin-top:12px"><span class="alert-icon">⚠</span><span><strong>Discrepancy: ${fmt(Math.abs(diff))}</strong><br>Computed balance (as of ${fmtDate(snap.date)}): ${fmt(bal.bankBalance)}<br>Bank's reported balance: ${fmt(snap.balance)}<br>${diff>0?'System shows more than the bank. Check for unrecorded bank charges or debits.':'Bank shows more than the system. Check for unrecorded deposits or credits.'}</span></div>${asOfNote}`;
      const s = await DB.getSettings();
      if(s.bank_balance_last_notified_snapshot_id !== snap.id){
        DB.addNotification('Bank Balance Mismatch', `Computed bank balance differs from the bank's reported balance (as of ${fmtDate(snap.date)}) by ${fmt(Math.abs(diff))}. Check Bank → Reconciliation.`, 'warn');
        s.bank_balance_last_notified_snapshot_id = snap.id;
        DB.saveSettings(s);
      }
    }
  } catch(_) { /* supplementary check only — fail silently */ }
}

function showBankChargeForm(){
  if(!canAction('bank_charge')){ showAlert('You do not have permission to record bank charges.','danger'); return; }
  const today=new Date().toISOString().split('T')[0];
  const bankSubcats = EXPENSE_SUBCATS.bank || ['Others...'];
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">💳 Record Bank Charge</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>Record charges deducted by the bank (POS charges, SMS alerts, transfer fees, maintenance fees, etc.)</span></div>
    <div class="form-group"><label class="form-label">Date *</label><input type="date" id="bc_date" class="form-input" value="${today}" max="${today}" /></div>
    <div class="form-group"><label class="form-label">Type of Charge *</label>
      <select id="bc_subcat" class="form-select">
        ${bankSubcats.map(s=>`<option value="${s}">${s}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label class="form-label">Description</label><input type="text" id="bc_desc" class="form-input" placeholder="Details about the charge" /></div>
    <div class="form-group"><label class="form-label">Amount (₦) *</label><input type="number" id="bc_amt" class="form-input" placeholder="0" min="0" /></div>
    <div class="form-group"><label class="form-label">Reference / Transaction ID</label><input type="text" id="bc_ref" class="form-input" placeholder="Optional" /></div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.submitBankCharge(this)">Save Bank Charge</button></div>`);
}

async function submitBankCharge(btn=null){
  if(!canAction('bank_charge')){ showAlert('You do not have permission to record bank charges.','danger'); return; }
  const date = document.getElementById('bc_date')?.value;
  const subCategory = document.getElementById('bc_subcat')?.value;
  const description = document.getElementById('bc_desc')?.value?.trim() || subCategory;
  const amount = parseFloat(document.getElementById('bc_amt')?.value)||0;
  const receiptNo = document.getElementById('bc_ref')?.value;
  if(!date||!amount){ showAlert('Please fill date and amount.','danger'); return }
  const restore = setBtnLoading(btn, 'Saving…');
  try {
    await DB.addExpense({
      date, category:'bank', subCategory, description, amount,
      paymentMethod:'bank_transfer', status:'approved', receiptNo,
      recordedBy: state.user?.name,
      createdAt: new Date().toISOString()
    });
    DB.addAudit('bank_charge',`Bank charge: ${description} — ${fmt(amount)}`,state.user?.name);
    closeModal();
    showAlert(`Bank charge of ${fmt(amount)} recorded.`,'success');
    navigate('bank');
  } catch(err) {
    restore();
    showAlert(`Failed to record bank charge: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

// ── PETTY CASH ────────────────────────────
// The Admin Officer holds a cash wallet for small day-to-day church purchases.
// They spend from it, log expenses in the Expenses page, and request a top-up when low.
// Advance requests are for unusual or larger purchases that need approval before buying.

function pettyMonthHistory(history){
  return (history||[]).filter(h=>{
    const d=new Date(h.createdAt||h.date||0);
    return d.getMonth()===state.month && d.getFullYear()===state.year;
  });
}

function isReceiptOverdue(req){
  // Only advances (cash released before purchase) have the 48-hr receipt rule
  if(req.type!=='advance') return false;
  if(req.status!=='approved'||req.receiptNo) return false;
  const hrs=(Date.now()-new Date(req.approvedAt||req.createdAt).getTime())/3600000;
  return hrs>48;
}

async function renderPettyCash(){
  // Silently correct any float drift before displaying so the balance is always accurate
  try { await DB.recalcPettyFloat(); } catch(e) { console.warn('recalcPettyFloat failed:', e); }
  const [pettyHistory, pettyConfig, allExpenses] = await Promise.all([DB.getPetty(), DB.getPettyConfig(), DB.getExpenses()]);
  const petty = { history: pettyHistory, float: pettyConfig.float, max: pettyConfig.max };
  const history = petty.history||[];
  state._pettyAll = history;
  const monthHistory = pettyMonthHistory(history);
  const pct = petty.float <= 0 ? 0 : Math.min(100, Math.round((petty.float/petty.max)*100));

  // Pending approvals (all time — not month scoped)
  const pending = history.filter(h=>h.status==='pending_approval');
  const pendingTopups = pending.filter(h=>h.type==='topup_request');
  const pendingAdvances = pending.filter(h=>h.type==='advance');

  // Approved top-up requests awaiting payment recording
  // Approved top-up requests awaiting payment — only show those with remaining balance
  // Recalculate effective amount from expenseRefs against current expenses to handle
  // cases where an expense was deleted after the request was created/approved.
  const expenseMap = new Map(allExpenses.map(e => [e.id, e]));
  const approvedTopups = history.filter(h=>h.status==='approved'&&h.type==='topup_request')
    .map(h => {
      const refs = Array.isArray(h.expenseRefs) ? h.expenseRefs : [];
      const liveTotal = refs.reduce((s, id) => {
        const e = expenseMap.get(id);
        if (!e) return s;
        return s + (e.paymentMethod === 'split' ? (e.pettyAmount || 0) : (e.amount || 0));
      }, 0);
      const effectiveAmount = refs.length > 0 ? liveTotal : (h.amount || 0);
      return { ...h, _effectiveAmount: effectiveAmount };
    })
    .filter(h => Math.max(0, (h._effectiveAmount) - (h.actualAmount || 0)) > 0.5);

  // Advances awaiting proof
  const advancesAwaitingProof = history.filter(h=>h.status==='approved'&&h.type==='advance'&&!h.receiptNo);
  const overdueReceipts = advancesAwaitingProof.filter(h=>isReceiptOverdue(h));

  // This month stats
  const monthTopups = monthHistory.filter(h=>h.type==='refill').reduce((s,h)=>s+(h.amount||0),0);
  const monthAdvancesDisbursed = monthHistory.filter(h=>h.type==='advance'&&(h.status==='approved'||h.status==='settled')).reduce((s,h)=>s+(h.amount||0),0);

  // All petty cash expenses not yet covered by any top-up request (pending, approved, or settled).
  // We do NOT filter by last refill date — the goal is to recover every unclaimed expense
  // regardless of when the last cash handover was, so the suggested top-up always restores
  // the admin to the total cash level they have been given.
  const alreadyClaimedExpIds = new Set(
    history
      .filter(h=>h.type==='topup_request'&&(h.status==='pending_approval'||h.status==='approved'||h.status==='settled'))
      .flatMap(h=>Array.isArray(h.expenseRefs)?h.expenseRefs:[])
  );
  const expensesSinceRefill = allExpenses.filter(e=>{
    if(e.status!=='approved' && e.status!=='pending_approval') return false;
    if(e.paymentMethod!=='petty_cash' && !(e.paymentMethod==='split' && (e.pettyAmount||0)>0)) return false;
    return !alreadyClaimedExpIds.has(e.id);
  });
  const expensesSinceRefillTotal = expensesSinceRefill.reduce((s,e)=>
    s+(e.paymentMethod==='split'?(e.pettyAmount||0):(e.amount||0)), 0);

  const pctColor = petty.float<0?'var(--danger)':pct<20?'var(--danger)':pct<50?'var(--amber)':'var(--primary)';

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div>
        <div class="page-title">Petty Cash</div>
        <div class="page-sub">Admin Officer's cash wallet — ${monthLabel()}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${canAction('petty_request')?`
          <button class="btn btn-primary" onclick="App.showTopUpRequest()">↺ Request Top-Up</button>
          <button class="btn" onclick="App.showAdvanceRequest()">+ Request Advance</button>
        `:''}
        ${canAction('petty_topup_payment')?`<button class="btn btn-amber" onclick="App.showPettyRefill()">📋 Record Top-Up Payment</button>`:''}\n        ${canAction('petty_to_bank')?`<button class="btn" style="background:#E6F1FB;color:#0F6E56" onclick="App.showPettyToBankDeposit()">🏦 Deposit to Bank</button>`:''}
      </div>
    </div>

    ${overdueReceipts.length?`<div class="alert alert-danger"><span class="alert-icon">⚠</span><span><strong>${overdueReceipts.length} advance(s) overdue!</strong> Proof of purchase not submitted within 48 hours: ${overdueReceipts.map(r=>r.purpose).join(', ')}. Follow up with the Admin Officer.</span></div>`:''}
    ${petty.float<0?`<div class="alert alert-danger"><span class="alert-icon">⚠</span><span><strong>Wallet in debt:</strong> The Admin Officer has used ${fmt(Math.abs(petty.float))} of personal funds. The church owes this and should top up immediately.</span></div>`:''}
    ${pendingTopups.length>0?`<div class="alert alert-warn"><span class="alert-icon">⏳</span><span><strong>${pendingTopups.length} top-up request(s)</strong> awaiting approval — ${fmt(pendingTopups.reduce((s,r)=>s+(r.amount||0),0))} total.</span></div>`:''}

    <!-- Cash Meter card -->
    <div class="card" style="margin-bottom:1rem">
      <div class="card-header">
        <span class="card-title">Cash Meter</span>
        ${canAction('petty_topup_payment')?`<button class="btn btn-sm btn-amber" onclick="App.showPettyRefill()">Record Top-Up Payment</button>`:''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:center;padding:8px 0">
        <div style="text-align:center">
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">${petty.float<0?'Church owes Admin Officer':'Cash on Hand'}</div>
          <div style="font-size:28px;font-weight:800;color:${pctColor};letter-spacing:-1px">${petty.float<0?'−'+fmt(Math.abs(petty.float)):fmt(petty.float)}</div>
          <div class="progress-bar" style="margin:10px auto 6px;max-width:180px;height:10px;border-radius:5px">
            <div class="progress-fill" style="width:${pct}%;background:${pctColor};border-radius:5px"></div>
          </div>
          <div style="font-size:11px;color:var(--text3)">${pct}% of ${fmt(petty.max)} approved max</div>
        </div>
        <div style="border-left:1px solid var(--border);padding-left:16px">
          <div style="margin-bottom:10px">
            <div style="font-size:11px;color:var(--text3);margin-bottom:2px">Not yet refunded</div>
            <div style="font-size:16px;font-weight:700;color:var(--danger)">${fmt(expensesSinceRefillTotal)}</div>
            <div style="font-size:11px;color:var(--text3)">${expensesSinceRefill.length} expense(s) not yet covered</div>
          </div>
          <div style="margin-bottom:10px">
            <div style="font-size:11px;color:var(--text3);margin-bottom:2px">Topped up this month</div>
            <div style="font-size:15px;font-weight:600;color:var(--success)">${fmt(monthTopups)}</div>
          </div>
          ${monthAdvancesDisbursed>0?`<div>
            <div style="font-size:11px;color:var(--text3);margin-bottom:2px">Advances released</div>
            <div style="font-size:15px;font-weight:600;color:var(--amber)">${fmt(monthAdvancesDisbursed)}</div>
          </div>`:''}
        </div>
      </div>
      ${expensesSinceRefillTotal>0&&canAction('petty_request')?`
      <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">
        <div style="font-size:13px;color:var(--text2);margin-bottom:8px">
          ${fmt(expensesSinceRefillTotal)} in expenses have not yet been covered by a top-up request.
          ${petty.float/petty.max < 0.4 ? ' The balance is getting low — consider requesting a top-up.' : ''}
        </div>
        <button class="btn btn-primary btn-sm" onclick="App.showTopUpRequest()">↺ Request Top-Up (${fmt(expensesSinceRefillTotal)})</button>
      </div>`:''}
    </div>

    <!-- Pending Approvals -->
    <div class="card" style="margin-bottom:1rem">
      <div class="card-header"><span class="card-title">Pending Approval (${pending.length})</span></div>
      ${pending.length ? pending.map(r=>{
        const isTopup = r.type==='topup_request';
        const typeLabel = isTopup
          ? `<span class="badge badge-info" style="margin-right:6px">↺ Top-Up</span>`
          : `<span class="badge badge-warn" style="margin-right:6px">💳 Advance</span>`;
        const expCount = r.expenseRefs?.length||0;
        return `
        <div class="status-row" style="flex-wrap:wrap;gap:6px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:3px">
              ${typeLabel}
              <span style="font-size:13px;font-weight:600">${r.purpose}</span>
            </div>
            <div class="status-row-sub">By: ${r.requestedBy||'—'} · ${fmtDate(r.createdAt)}</div>
            ${isTopup&&expCount>0?`<div class="status-row-sub" style="color:var(--text3)">${expCount} expense(s) included</div>`:''}
            ${r.notes?`<div class="status-row-sub" style="color:var(--text3)">"${r.notes}"</div>`:''}
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
            <div class="status-row-amt td-amber" style="white-space:nowrap">${fmt(r.amount)}</div>
            ${isTopup
              ? canAction('petty_approve_or_view')
                  ? `<button class="btn btn-sm btn-primary" onclick="App.approvePetty('${r.id}', this)">👁 View & Approve</button>`
                  : `<button class="btn btn-sm" onclick="App.approvePetty('${r.id}', this)">👁 View</button>`
              : canAction('petty_approve_or_view')
                  ? `<button class="btn btn-sm btn-primary" onclick="App.approvePetty('${r.id}', this)">Approve</button>
                     <button class="btn btn-sm btn-danger" onclick="App.rejectPetty('${r.id}')">Reject</button>`
                  : ''
            }
            ${isTopup && canAction('topup_cancel', { request:r }) ? `<button class="btn btn-sm btn-danger" onclick="App.cancelTopUpRequest('${r.id}', this)">Cancel</button>` : ''}
          </div>
        </div>`;
      }).join('') : '<div class="empty-table">No pending requests.</div>'}
    </div>

    ${approvedTopups.length?`
    <div class="card" style="margin-bottom:1rem">
      <div class="card-header">
        <span class="card-title">✅ Approved Top-Ups — Awaiting Payment (${approvedTopups.length})</span>
        <span style="font-size:11px;color:var(--text3)">Total: ${fmt(approvedTopups.reduce((s,r)=>s+(r._effectiveAmount||0),0))}</span>
      </div>
      <div class="topup-desktop-table">
        <div class="table-wrap"><table>
          <tr><th>Date Approved</th><th>Request</th><th>Requested By</th><th>Approved By</th><th class="td-right">Amount</th><th>Action</th></tr>
          ${approvedTopups.map(r=>{ const _due=Math.max(0,(r._effectiveAmount)-(r.actualAmount||0)); return `<tr>
            <td style="white-space:nowrap">${fmtDate(r.approvedAt||r.createdAt)}<div class="td-muted" style="font-size:11px">${fmtTime(r.approvedAt||r.createdAt)}</div></td>
            <td>
              <div style="font-size:13px;font-weight:500">${r.purpose||'Wallet top-up'}</div>
              ${r.expenseRefs?.length?`<div style="font-size:11px;color:var(--text3)">${r.expenseRefs.length} expense(s) included</div>`:''}
              ${(r.actualAmount||0)>0?`<div style="font-size:11px;color:var(--text3)">Paid so far: ${fmt(r.actualAmount||0)} · Remaining: ${fmt(_due)}</div>`:''}
            </td>
            <td class="td-muted">${r.requestedBy||'—'}</td>
            <td class="td-muted">${r.approvedBy||'—'}</td>
            <td class="td-right td-bold" style="color:var(--primary)">
              <div>${fmt(r._effectiveAmount)}</div>
              ${(r.actualAmount||0)>0?`<div style="font-size:11px;color:var(--success)">Paid: ${fmt(r.actualAmount)}</div>`:''}
              ${(r.actualAmount||0)>0?`<div style="font-size:11px;color:var(--amber)">Due: ${fmt(_due)}</div>`:''}
            </td>
            <td style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-sm btn-primary" onclick="App.showPettyRefill(${_due}, '${r.id}')">📋 Record Payment</button>
              ${canAction('petty_topup_payment')?`<button class="btn btn-sm" onclick="App.markTopupSettled('${r.id}')">✓ Mark Settled</button>`:''}
            </td>
          </tr>`; }).join('')}
        </table></div>
      </div>
      <div class="topup-mobile-list">
        ${approvedTopups.map(r=>{
          const due=Math.max(0,(r._effectiveAmount)-(r.actualAmount||0));
          return`<div class="topup-card">
            <div class="topup-card-header" onclick="toggleTopupCard(this)" role="button" tabindex="0" aria-expanded="false" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleTopupCard(this)}">
              <div class="topup-card-left">
                <div class="topup-card-date">${fmtDate(r.approvedAt||r.createdAt)}<span class="topup-card-time" style="margin-left:6px">${fmtTime(r.approvedAt||r.createdAt)}</span></div>
                <div class="topup-card-title">${r.purpose||'Wallet top-up'}</div>
                ${r.expenseRefs?.length?`<div class="topup-card-sub">${r.expenseRefs.length} expense(s) included</div>`:''}
              </div>
              <div class="topup-card-right">
                <div class="topup-card-amount">${fmt(r._effectiveAmount)}</div>
                ${(r.actualAmount||0)>0?`<div style="font-size:11px;color:var(--amber)">Due: ${fmt(due)}</div>`:''}
              </div>
              <span class="topup-card-chevron">▼</span>
            </div>
            <div class="topup-card-body">
              <div class="topup-card-detail-row"><span class="topup-card-detail-label">Requested By</span><span class="topup-card-detail-val">${r.requestedBy||'—'}</span></div>
              <div class="topup-card-detail-row"><span class="topup-card-detail-label">Approved By</span><span class="topup-card-detail-val">${r.approvedBy||'—'}</span></div>
              ${(r.actualAmount||0)>0?`<div class="topup-card-detail-row"><span class="topup-card-detail-label">Paid So Far</span><span class="topup-card-detail-val" style="color:var(--success)">${fmt(r.actualAmount)}</span></div>`:''}
              ${(r.actualAmount||0)>0?`<div class="topup-card-detail-row"><span class="topup-card-detail-label">Remaining</span><span class="topup-card-detail-val" style="color:var(--amber)">${fmt(due)}</span></div>`:''}
              <div class="topup-card-action" style="display:flex;gap:8px">
                <button class="btn btn-sm btn-primary btn-full" onclick="App.showPettyRefill(${due}, '${r.id}')">📋 Record Payment</button>
                ${canAction('petty_topup_payment')?`<button class="btn btn-sm" onclick="App.markTopupSettled('${r.id}')">✓ Mark Settled</button>`:''}
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`:''}

    ${advancesAwaitingProof.length?`
    <div class="card" style="margin-bottom:1rem">
      <div class="card-header"><span class="card-title">Advances — Proof of Purchase Outstanding (${advancesAwaitingProof.length})</span></div>
      <div class="topup-desktop-table">
        <div class="table-wrap"><table>
          <tr><th>When Approved</th><th>Purpose</th><th>Approved By</th><th>Time Since Approval</th><th class="td-right">Amount</th><th>Action</th></tr>
          ${advancesAwaitingProof.map(r=>{
            const hrs=Math.round((Date.now()-new Date(r.approvedAt||r.createdAt).getTime())/3600000);
            return`<tr${hrs>48?' style="background:var(--danger-light)"':''}>
              <td style="white-space:nowrap">${fmtDate(r.approvedAt||r.createdAt)}<div class="td-muted" style="font-size:11px">${fmtTime(r.approvedAt||r.createdAt)}</div></td>
              <td>${r.purpose}</td>
              <td class="td-muted">${r.approvedBy||'—'}</td>
              <td><span class="badge ${hrs>48?'badge-danger':hrs>24?'badge-warn':'badge-info'}">${hrs}h${hrs>48?' ⚠ OVERDUE':''}</span></td>
              <td class="td-right td-bold td-amber">${fmt(r.amount)}</td>
              <td><button class="btn btn-sm btn-primary" onclick="App.submitPettyReceipt('${r.id}')">Submit Proof</button></td>
            </tr>`;}).join('')}
        </table></div>
      </div>
      <div class="topup-mobile-list">
        ${advancesAwaitingProof.map(r=>{
          const hrs=Math.round((Date.now()-new Date(r.approvedAt||r.createdAt).getTime())/3600000);
          const overdue=hrs>48;
          const urgencyBadge=`<span class="badge ${hrs>48?'badge-danger':hrs>24?'badge-warn':'badge-info'}">${hrs}h${overdue?' ⚠ OVERDUE':''}</span>`;
          return`<div class="topup-card"${overdue?' style="border-color:var(--danger)"':''}>
            <div class="topup-card-header" onclick="toggleTopupCard(this)" role="button" tabindex="0" aria-expanded="false" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleTopupCard(this)}"${overdue?' style="background:var(--danger-light)"':''}>
              <div class="topup-card-left">
                <div class="topup-card-date">${fmtDate(r.approvedAt||r.createdAt)}<span class="topup-card-time" style="margin-left:6px">${fmtTime(r.approvedAt||r.createdAt)}</span></div>
                <div class="topup-card-title">${r.purpose||'Advance'}</div>
                <div style="margin-top:3px">${urgencyBadge}</div>
              </div>
              <div class="topup-card-right">
                <div class="topup-card-amount" style="color:var(--amber)">${fmt(r.amount)}</div>
              </div>
              <span class="topup-card-chevron">▼</span>
            </div>
            <div class="topup-card-body">
              <div class="topup-card-detail-row"><span class="topup-card-detail-label">Approved By</span><span class="topup-card-detail-val">${r.approvedBy||'—'}</span></div>
              <div class="topup-card-detail-row"><span class="topup-card-detail-label">Time Since Approval</span><span class="topup-card-detail-val">${urgencyBadge}</span></div>
              <div class="topup-card-action"><button class="btn btn-sm btn-primary btn-full" onclick="App.submitPettyReceipt('${r.id}')">Submit Proof</button></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`:''}

    <div class="card">
      <div class="card-header">
        <span class="card-title">History</span>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;font-weight:400">
          <input type="checkbox" id="petty_show_all" onchange="App.renderPettyCash()"
            ${state.pettyShowAll?'checked':''} />
          Show all months
        </label>
      </div>
      <!-- Filter / sort bar -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
        <div style="flex:1;min-width:140px;position:relative">
          <span style="position:absolute;left:9px;top:50%;transform:translateY(-50%);font-size:13px;color:var(--text3)">🔍</span>
          <input type="text" id="petty_search" class="form-input"
            placeholder="Search purpose, by, ref…"
            value="${state.pettySearch||''}"
            oninput="App.setPettySearch(this.value)"
            style="padding-left:28px;height:34px;font-size:13px" />
        </div>
        <select class="form-select" style="width:auto;height:34px;font-size:13px"
          onchange="App.setPettyTypeFilter(this.value)">
          <option value="">All types</option>
          <option value="topup_request" ${state.pettyTypeFilter==='topup_request'?'selected':''}>↺ Top-Up Requests</option>
          <option value="refill"        ${state.pettyTypeFilter==='refill'?'selected':''}>↺ Top-Up Paid</option>
          <option value="advance"       ${state.pettyTypeFilter==='advance'?'selected':''}>💳 Advances</option>
        </select>
        <select class="form-select" style="width:auto;height:34px;font-size:13px"
          onchange="App.setPettyStatusFilter(this.value)">
          <option value="">All statuses</option>
          <option value="pending_approval" ${state.pettyStatusFilter==='pending_approval'?'selected':''}>Pending</option>
          <option value="approved"         ${state.pettyStatusFilter==='approved'?'selected':''}>Approved</option>
          <option value="settled"          ${state.pettyStatusFilter==='settled'?'selected':''}>Settled</option>
          <option value="rejected"         ${state.pettyStatusFilter==='rejected'?'selected':''}>Rejected</option>
          <option value="cancelled"        ${state.pettyStatusFilter==='cancelled'?'selected':''}>Cancelled</option>
        </select>
        <select class="form-select" style="width:auto;height:34px;font-size:13px"
          onchange="App.setPettySort(this.value)">
          <option value="date_desc"   ${(state.pettySort||'date_desc')==='date_desc'?'selected':''}>Date ↓ Newest</option>
          <option value="date_asc"    ${state.pettySort==='date_asc'?'selected':''}>Date ↑ Oldest</option>
          <option value="amount_desc" ${state.pettySort==='amount_desc'?'selected':''}>Amount ↓ Largest</option>
          <option value="amount_asc"  ${state.pettySort==='amount_asc'?'selected':''}>Amount ↑ Smallest</option>
        </select>
        ${(state.pettySearch||state.pettyTypeFilter||state.pettyStatusFilter)?
          `<button class="btn btn-sm" onclick="App.clearPettyFilters()" style="white-space:nowrap;flex-shrink:0">✕ Clear</button>`:''
        }
      </div>
      ${(()=>{
        // Determine source: all-time or current month
        const source = state.pettyShowAll ? history : monthHistory;
        // Apply search
        const q = (state.pettySearch||'').toLowerCase();
        let rows = source.filter(r=>{
          if(state.pettyTypeFilter && r.type!==state.pettyTypeFilter) return false;
          if(state.pettyStatusFilter && r.status!==state.pettyStatusFilter) return false;
          if(q){
            const hay = [(r.purpose||''),(r.requestedBy||''),(r.approvedBy||''),(r.authorizedBy||''),(r.reference||''),(r.notes||''), fmt(r.originalAmount||r.amount)].join(' ').toLowerCase();
            if(!hay.includes(q)) return false;
          }
          return true;
        });
        // Sort
        const sort = state.pettySort||'date_desc';
        rows.sort((a,b)=>{
          if(sort==='amount_desc') return (b.originalAmount||b.amount||0)-(a.originalAmount||a.amount||0);
          if(sort==='amount_asc')  return (a.originalAmount||a.amount||0)-(b.originalAmount||b.amount||0);
          if(sort==='date_asc')    return new Date(a.createdAt||0)-new Date(b.createdAt||0);
          return new Date(b.createdAt||0)-new Date(a.createdAt||0); // date_desc default
        });
        if(!rows.length) return `<div class="empty-table">${source.length?'No entries match your filters.':'No petty cash activity '+(state.pettyShowAll?'yet.':'this month.')}</div>`;
        return `<span class="td-muted tx-mobile-hint" style="font-size:11px;padding-bottom:6px">Tap any row to see full details</span>
        <div class="table-wrap"><table class="tx-desktop-table">
          <tr>
            <th style="white-space:nowrap">Date</th>
            <th>Type</th>
            <th>Purpose</th>
            <th>By</th>
            <th>Authorized By</th>
            <th>Status</th>
            <th class="td-right" style="white-space:nowrap">Amount</th>
            <th>Proof / Ref</th>
          </tr>
          ${rows.map(r=>{
            const isRefill=r.type==='refill';
            const isTopupReq=r.type==='topup_request';
            const overdue=isReceiptOverdue(r);
            const typeTag=isRefill
              ?`<span class="badge badge-success">↺ Top-Up Paid</span>`
              :isTopupReq
                ?`<span class="badge badge-info">↺ Top-Up Request</span>`
                :`<span class="badge badge-warn">💳 Advance</span>`;
            const statusColor=r.status==='settled'?'badge-success':r.status==='approved'?'badge-info':r.status==='rejected'||r.status==='cancelled'?'badge-danger':'badge-warn';
            const amtDisplay=isRefill
              ?`<span style="color:var(--success);font-weight:700">+${fmt(r.amount)}</span>`
              :isTopupReq
                ?`<span style="color:var(--text2)">${fmt(r.originalAmount||r.amount)}</span>`
                :`<span style="color:var(--amber);font-weight:700">−${fmt(r.amount)}</span>`;
            const proofCell=r.receiptNo
              ?`<span class="badge badge-success">✓ ${r.receiptNo}</span>`
              :r.rejectionReason
                ?`<span class="td-muted" style="font-size:11px">${r.rejectionReason}</span>`
                :r.reference
                  ?`<span class="badge badge-gray">Ref: ${r.reference}</span>`
                  :'<span style="color:var(--text3)">—</span>';
            return `<tr style="${overdue?'background:var(--danger-light)':''}">
              <td style="white-space:nowrap;font-size:12px">${fmtDate(r.createdAt)}<div class="td-muted" style="font-size:11px">${fmtTime(r.createdAt)}</div></td>
              <td>${typeTag}</td>
              <td style="font-size:12px">${r.purpose||'—'}</td>
              <td class="td-muted" style="font-size:12px">${r.requestedBy||'—'}</td>
              <td class="td-muted" style="font-size:12px">${r.approvedBy||r.authorizedBy||'—'}</td>
              <td>
                <span class="badge ${statusColor}">${r.status?.replace('_',' ')||'pending'}</span>
                ${overdue?'<span class="badge badge-danger" style="margin-left:4px">Overdue</span>':''}
              </td>
              <td class="td-right" style="white-space:nowrap">${amtDisplay}</td>
              <td style="font-size:12px">${proofCell}</td>
            </tr>`;
          }).join('')}
        </table>
        <table class="tx-mobile-table">
          <tr><th>Date</th><th>Details</th><th class="td-right">Amount</th></tr>
          ${rows.map(r=>{
            const isRefill=r.type==='refill';
            const isTopupReq=r.type==='topup_request';
            const overdue=isReceiptOverdue(r);
            const typeTag=isRefill
              ?`<span class="badge badge-success">↺ Top-Up Paid</span>`
              :isTopupReq
                ?`<span class="badge badge-info">↺ Top-Up Req</span>`
                :`<span class="badge badge-warn">💳 Advance</span>`;
            const statusColor=r.status==='settled'?'badge-success':r.status==='approved'?'badge-info':r.status==='rejected'||r.status==='cancelled'?'badge-danger':'badge-warn';
            const mobileAmt=isRefill
              ?`<span style="color:var(--success);font-weight:700">+${fmt(r.amount)}</span>`
              :isTopupReq
                ?`<span style="font-weight:600">${fmt(r.originalAmount||r.amount)}</span>`
                :`<span style="color:var(--amber);font-weight:700">−${fmt(r.amount)}</span>`;
            return `<tr class="tx-mobile-row" style="cursor:pointer${overdue?';background:var(--danger-light)':''}" onclick="App.showPettyDetail('${r.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.showPettyDetail('${r.id}')}" tabindex="0" role="button" aria-label="${esc(r.purpose||'Petty cash entry')} — ${fmt(r.originalAmount||r.amount)}">
              <td><div style="font-size:13px;font-weight:600;white-space:nowrap">${fmtDate(r.createdAt)}</div><div class="td-muted" style="font-size:11px">${fmtTime(r.createdAt)}</div></td>
              <td style="max-width:0;width:55%">
                <div>${typeTag}${overdue?'<span class="badge badge-danger" style="margin-left:4px">Overdue</span>':''}</div>
                <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px">${esc(r.purpose||'—')}</div>
                <div style="margin-top:3px"><span class="badge ${statusColor}" style="font-size:10px">${(r.status||'pending').replace('_',' ')}</span></div>
              </td>
              <td class="td-right" style="white-space:nowrap">${mobileAmt}</td>
            </tr>`;
          }).join('')}
        </table></div>
        <div style="padding:8px 0 2px;font-size:12px;color:var(--text3);text-align:right">
          ${rows.length} entr${rows.length===1?'y':'ies'}
          ${rows.filter(r=>r.type==='refill').length>0?` · Topped up: <strong style="color:var(--success)">${fmt(rows.filter(r=>r.type==='refill').reduce((s,r)=>s+(r.amount||0),0))}</strong>`:''}
        </div>`;
      })()}
    </div>`;
}
// ── PETTY CASH DETAIL MODAL ──
function showPettyDetail(id){
  const all = state._pettyAll || [];
  const r = all.find(x=>x.id===id);
  if(!r) return;
  const isRefill = r.type==='refill';
  const isTopupReq = r.type==='topup_request';
  const overdue = isReceiptOverdue(r);
  const typeBadge = isRefill
    ? `<span class="badge badge-success">↺ Top-Up Paid</span>`
    : isTopupReq
      ? `<span class="badge badge-info">↺ Top-Up Request</span>`
      : `<span class="badge badge-warn">💳 Advance</span>`;
  const statusColor = r.status==='settled'?'badge-success':r.status==='approved'?'badge-info':r.status==='rejected'||r.status==='cancelled'?'badge-danger':'badge-warn';
  const amtFormatted = isRefill
    ? `<span style="color:var(--success);font-weight:700;font-size:16px">+${fmt(r.amount)}</span>`
    : isTopupReq
      ? `<span style="font-weight:600;font-size:16px">${fmt(r.originalAmount||r.amount)}</span>`
      : `<span style="color:var(--amber);font-weight:700;font-size:16px">−${fmt(r.amount)}</span>`;
  const proofVal = r.receiptNo
    ? `<span class="badge badge-success">✓ ${esc(r.receiptNo)}</span>`
    : r.reference
      ? esc(r.reference)
      : '—';
  const extraRows = [
    ...(r.expenseRefs?.length ? [['Expenses Included', `${r.expenseRefs.length} expense(s)`]] : []),
    ...(r.rejectionReason ? [['Rejection Reason', esc(r.rejectionReason)]] : []),
    ...(r.notes ? [['Notes', esc(r.notes)]] : []),
  ];
  const rows = [
    ['Date',           fmtDate(r.createdAt)],
    ['Type',           typeBadge],
    ['Purpose',        esc(r.purpose||'—')],
    ['Requested By',   esc(r.requestedBy||'—')],
    ['Authorized By',  esc(r.approvedBy||r.authorizedBy||'—')],
    ['Amount',         amtFormatted],
    ['Status',         `<span class="badge ${statusColor}">${(r.status||'pending').replace('_',' ')}</span>${overdue?' <span class="badge badge-danger">Overdue</span>':''}`],
    ['Proof / Ref',    proofVal],
    ...extraRows,
  ];
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">💳 Petty Cash Details</div>
    <table style="width:100%;border-collapse:collapse">
      ${rows.map(([label,val])=>`
        <tr>
          <td style="padding:8px 0 8px 0;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.4px;width:38%;vertical-align:top">${label}</td>
          <td style="padding:8px 0 8px 8px;font-size:13px;color:var(--text);vertical-align:top">${val}</td>
        </tr>`).join('')}
    </table>
    <div class="modal-footer">
    ${canAction('petty_delete')?`<button class="btn btn-danger" style="margin-right:auto" onclick="closeModal();App.confirmDeletePetty('${r.id}')">🗑 Delete</button>`:''}
    <button class="btn" onclick="closeModal()">Close</button></div>`);
}

function confirmDeletePetty(id){
  if(!canAction('petty_delete')){ showAlert('Access denied.','danger'); return; }
  const all = state._pettyAll || [];
  const r = all.find(x=>x.id===id);
  if(!r) return;
  const isRefill = r.type==='refill';
  const floatNote = isRefill
    ? `The petty float will be reduced by <strong>${fmt(r.amount)}</strong> to reverse this refill.`
    : (r.status==='settled' ? `The petty float will be increased by <strong>${fmt(r.amount)}</strong> to restore this advance.` : '');
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">🗑 Delete Petty Cash Record</div>
    <div class="alert alert-warn" style="margin-bottom:16px"><span class="alert-icon">⚠</span><span><strong>This is permanent.</strong> ${floatNote ? floatNote+' ' : ''}This cannot be undone.</span></div>
    <div class="form-group">
      <label class="form-label">Enter your IT Admin PIN to confirm</label>
      <input type="password" id="del_petty_pin" class="form-input" maxlength="6" placeholder="••••••" inputmode="numeric"
        onkeydown="if(event.key==='Enter')App.submitDeletePetty('${id}',document.getElementById('del_petty_confirm_btn'))" />
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button id="del_petty_confirm_btn" class="btn btn-danger" onclick="App.submitDeletePetty('${id}',this)">Confirm Delete</button>
    </div>`);
  setTimeout(()=>document.getElementById('del_petty_pin')?.focus(),100);
}

async function submitDeletePetty(id, btn=null){
  if(!canAction('petty_delete')){ showAlert('Access denied.','danger'); return; }
  const pin = document.getElementById('del_petty_pin')?.value?.trim();
  if(!pin){ showAlert('Please enter your PIN.','danger'); return; }
  const restore = setBtnLoading(btn, 'Verifying…');
  try {
    await DB.login({ role:'it_admin', userId: state.user.id, pin });
  } catch(e){
    restore();
    const msg = String(e?.message||'');
    showAlert(msg.toLowerCase().includes('invalid credentials') ? 'Incorrect PIN. Please try again.' : 'PIN verification failed: '+msg, 'danger');
    document.getElementById('del_petty_pin')?.select();
    return;
  }
  try {
    btn.innerHTML = '<span class="btn-spinner-sm"></span> Deleting…';
    await DB.deletePettyEntry(id);
    DB.addAudit('petty_deleted', `Petty cash record deleted: ${id}`, state.user?.name);
    closeModal();
    showAlert('Petty cash record deleted.', 'warn');
    renderPettyCash();
  } catch(err){
    restore();
    showAlert('Failed to delete: '+(err?.message||'Unknown error'), 'danger');
  }
}

// ── PETTY CASH → BANK DEPOSIT ──────────────────────────────────────────────
async function showPettyToBankDeposit(){
  if(!canAction('petty_to_bank')){ showAlert('You do not have permission to deposit petty cash to bank.','danger'); return; }
  const pettyConfig = await DB.getPettyConfig();
  const currentFloat = pettyConfig.float || 0;
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">🏦 Deposit Petty Cash to Bank</div>
    <div class="alert alert-info" style="margin:0 0 12px">
      <span class="alert-icon">ℹ</span>
      <span>Transfer cash from the petty cash wallet into the church bank account. Current wallet balance: <strong>${fmt(currentFloat)}</strong></span>
    </div>
    <div class="form-group">
      <label class="form-label">Amount to Deposit (₦) *</label>
      <input type="number" id="ptb_amount" class="form-input" placeholder="0" min="1" max="${Math.max(0,currentFloat)}" />
      <div class="form-hint">Maximum: ${fmt(currentFloat)} (current wallet balance)</div>
    </div>
    <div class="form-group">
      <label class="form-label">Date *</label>
      <input type="date" id="ptb_date" class="form-input" value="${new Date().toISOString().split('T')[0]}" />
    </div>
    <div class="form-group">
      <label class="form-label">Bank Reference / Teller Number</label>
      <input type="text" id="ptb_ref" class="form-input" placeholder="Enter the deposit reference (optional)" />
    </div>
    <div class="form-group">
      <label class="form-label">Notes (optional)</label>
      <textarea id="ptb_notes" class="form-textarea" rows="2" placeholder="Reason for depositing petty cash to bank…"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitPettyToBankDeposit(this)">🏦 Confirm Deposit</button>
    </div>`);
}

async function submitPettyToBankDeposit(btn=null){
  const amount = parseFloat(document.getElementById('ptb_amount')?.value) || 0;
  const date = document.getElementById('ptb_date')?.value;
  const reference = (document.getElementById('ptb_ref')?.value||'').trim();
  const notes = (document.getElementById('ptb_notes')?.value||'').trim();
  if(!amount || amount <= 0){ showAlert('Please enter a valid amount.','danger'); return; }
  if(!date){ showAlert('Please enter the deposit date.','danger'); return; }
  const pettyConfig = await DB.getPettyConfig();
  if(amount > pettyConfig.float){ showAlert(`Amount (${fmt(amount)}) exceeds the current petty cash balance (${fmt(pettyConfig.float)}).`,'danger'); return; }
  const restore = setBtnLoading(btn, 'Processing…');
  try {
    await DB.addPettyEntry({
      type: 'petty_to_bank',
      amount,
      date,
      status: 'approved',
      paymentMethod: 'bank_transfer',
      reference,
      notes: notes || 'Petty cash deposited to bank',
      requestedBy: state.user?.name || '',
      approvedBy: state.user?.name || '',
      approvedAt: new Date().toISOString().split('T')[0],
    });
    const newFloat = pettyConfig.float - amount;
    await DB.savePettyConfig({ float: newFloat, max: pettyConfig.max });
    DB.addAudit('petty_to_bank', `${fmt(amount)} deposited from petty cash to bank${reference?' — Ref: '+reference:''}. New petty balance: ${fmt(newFloat)}.`, state.user?.name);
    DB.addNotification('Petty Cash Deposited', `${fmt(amount)} moved from petty cash to bank account.`, 'success');
    closeModal();
    showAlert(`${fmt(amount)} deposited from petty cash to bank. New wallet balance: ${fmt(newFloat)}.`, 'success');
    renderPettyCash();
  } catch(err){
    restore();
    showAlert(`Failed: ${err.message||'Unknown error'}`, 'danger');
  }
}

// ── TOP-UP REQUEST (Admin Officer: wallet is low, based on expenses already logged) ──
async function showTopUpRequest(){
  if(!canAction('petty_request')){ showAlert('You do not have permission to request petty cash top-up.','danger'); return; }
  const [pettyConfig, allExpenses, allPettyRaw] = await Promise.all([DB.getPettyConfig(), DB.getExpenses(), DB.getPetty()]);
  // All petty cash expenses not yet covered by any top-up request — no last-refill cutoff,
  // so the request covers every unclaimed expense and restores the admin to their full float level.
  const alreadyInRequest = new Set(
    allPettyRaw
      .filter(h=>h.type==='topup_request'&&(h.status==='pending_approval'||h.status==='approved'||h.status==='settled'))
      .flatMap(h=>Array.isArray(h.expenseRefs)?h.expenseRefs:[])
  );
  const unrecovered = allExpenses.filter(e=>{
    if(e.status!=='approved' && e.status!=='pending_approval') return false;
    if(e.paymentMethod!=='petty_cash' && !(e.paymentMethod==='split' && (e.pettyAmount||0)>0)) return false;
    return !alreadyInRequest.has(e.id);
  }).sort((a,b)=>new Date(a.createdAt||a.date||0)-new Date(b.createdAt||b.date||0));

  const totalAmt = unrecovered.reduce((s,e)=>s+(e.paymentMethod==='split'?(e.pettyAmount||0):(e.amount||0)),0);
  const cashOnHand = pettyConfig.float;

  const expRows = unrecovered.map(e=>{
    const c=EXPENSE_CATS_ALL.find(x=>x.key===e.category)||{icon:'💸',label:e.category||'Other'};
    const amt = e.paymentMethod==='split'?(e.pettyAmount||0):(e.amount||0);
    const detailBits = [e.subCategory, e.description&&e.description!==e.subCategory?e.description:'', e.notes?`Notes: ${e.notes}`:''].filter(Boolean);
    return `<tr>
      <td style="font-size:12px;white-space:nowrap">${fmtDate(e.date||e.createdAt)}<div class="td-muted" style="font-size:11px">${fmtTime(e.createdAt||e.date)}</div></td>
      <td><span class="badge badge-gray" style="font-size:11px">${c.icon} ${c.label}</span></td>
      <td style="font-size:12px">
        ${detailBits.map(d=>`<div>${esc(d)}</div>`).join('')||'—'}
      </td>
      <td class="td-right td-bold" style="font-size:13px;color:var(--danger)">${fmt(amt)}</td>
    </tr>`;
  }).join('');

  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">↺ Request Wallet Top-Up</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>This lists all petty cash expenses not yet covered by a previous top-up request. The Accountant will verify these, then a Signatory approves before the cash is sent to you.</span></div>
    <div style="background:var(--surface);border-radius:var(--r);padding:10px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:12px;color:var(--text2)">Current wallet balance</span>
      <span style="font-weight:700;color:${cashOnHand<0?'var(--danger)':cashOnHand<10000?'var(--amber)':'var(--primary)'}">${cashOnHand<0?'−'+fmt(Math.abs(cashOnHand)):fmt(cashOnHand)}</span>
    </div>
    ${unrecovered.length ? `
    <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:8px">Expenses to be recovered (${unrecovered.length}):</div>
    <div class="table-wrap" style="max-height:200px;overflow-y:auto;margin-bottom:12px">
      <table style="width:100%">
        <tr><th>Date</th><th>Category</th><th>Details (Sub-category / Description / Notes)</th><th class="td-right">Amount</th></tr>
        ${expRows}
        <tr style="border-top:2px solid var(--border)">
          <td colspan="3" style="font-size:13px;font-weight:700;padding:8px">Total to recover</td>
          <td class="td-right td-bold" style="font-size:15px;color:var(--primary);padding:8px">${fmt(totalAmt)}</td>
        </tr>
      </table>
    </div>
    <div class="form-group">
      <label class="form-label">Top-Up Amount (₦) *</label>
      <input type="number" id="topup_amt" class="form-input" value="${Math.round(totalAmt)}" readonly />
      <div class="form-hint">Auto-calculated from the selected expenses (${unrecovered.length}).</div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;margin-top:8px">
        <input type="checkbox" id="topup_override" onchange="App.onTopupOverrideToggle()" />
        Override amount (requires reason)
      </label>
      <div id="topup_override_reason_group" style="display:none;margin-top:8px">
        <input type="text" id="topup_override_reason" class="form-input" placeholder="Why this differs from the calculated total" />
      </div>
    </div>` : `<div class="empty-table" style="margin-bottom:12px">No petty cash expenses found since the last top-up. If you paid for something and haven't logged it yet, go to the <strong>Expenses page</strong> first and record it there.</div>
    <div class="form-group">
      <label class="form-label">Top-Up Amount (₦) *</label>
      <input type="number" id="topup_amt" class="form-input" placeholder="0" readonly />
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;margin-top:8px">
        <input type="checkbox" id="topup_override" onchange="App.onTopupOverrideToggle()" />
        Override amount (requires reason)
      </label>
      <div id="topup_override_reason_group" style="display:none;margin-top:8px">
        <input type="text" id="topup_override_reason" class="form-input" placeholder="Reason for manual amount" />
      </div>
    </div>`}
    <div class="form-group"><label class="form-label">Notes for Accountant (optional)</label>
      <textarea id="topup_notes" class="form-textarea" placeholder="Any context that helps with approval..."></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitTopUpRequest(this)">Submit Top-Up Request</button>
    </div>`);
  // Store IDs in state so submitTopUpRequest can read them without HTML attribute issues
  state._topupExpenseIds = unrecovered.map(e=>e.id);
}

async function submitTopUpRequest(btn=null){
  if(!canAction('petty_request')){ showAlert('You do not have permission to request petty cash top-up.','danger'); return; }
  const expenseIds = state._topupExpenseIds || [];
  const amount = parseFloat(document.getElementById('topup_amt')?.value)||0;
  const override = !!document.getElementById('topup_override')?.checked;
  const overrideReason = document.getElementById('topup_override_reason')?.value?.trim()||'';
  const notes  = document.getElementById('topup_notes')?.value||'';
  if(!amount){ showAlert('Please enter the top-up amount.','danger'); return }
  if(override && !overrideReason){ showAlert('Please provide a reason for overriding the calculated amount.','danger'); return }
  const pettyConfig = await DB.getPettyConfig();
  const req = {
    id:'PC-'+Date.now(), type:'topup_request',
    purpose: `Wallet top-up — ${expenseIds.length} expense(s)`,
    amount, notes: override ? `${notes}${notes?'\n':''}Override reason: ${overrideReason}` : notes,
    expenseRefs: expenseIds,
    requestedBy: state.user?.name,
    status:'pending_approval',
    createdAt: new Date().toISOString()
  };
  const restore = setBtnLoading(btn, 'Submitting…');
  try {
    await DB.addPettyEntry(req);
    DB.addAudit('petty_topup_requested',`Top-up requested: ${fmt(amount)} for ${expenseIds.length} expense(s)${override?` [override: ${overrideReason}]`:''}`,state.user?.name);
    DB.addNotification('Top-Up Requested',`${state.user?.name} requested a wallet top-up of ${fmt(amount)}. Awaiting approval.`,'warn');
    closeModal();
    showAlert(`Top-up request of ${fmt(amount)} submitted. The Accountant will review and a Signatory will approve.`,'success');
    renderPettyCash();
    buildSidebar();
  } catch(err) {
    restore();
    showAlert(`Failed to submit request: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

function onTopupOverrideToggle(){
  const checked = !!document.getElementById('topup_override')?.checked;
  const amtInput = document.getElementById('topup_amt');
  const reasonGrp = document.getElementById('topup_override_reason_group');
  if(amtInput){
    amtInput.readOnly = !checked;
    if(!checked && state._topupExpenseIds){
      // Recompute from current scoped expenses if available
      DB.getExpenses().then(all=>{
        const expenseSet = new Set(state._topupExpenseIds||[]);
        const total = (all||[]).filter(e=>expenseSet.has(e.id))
          .reduce((s,e)=>s+(e.paymentMethod==='split'?(e.pettyAmount||0):(e.amount||0)),0);
        amtInput.value = Math.round(total)||'';
      }).catch(()=>{});
    }
  }
  if(reasonGrp) reasonGrp.style.display = checked ? '' : 'none';
}

async function cancelTopUpRequest(id, btn=null){
  const pettyHistory = await DB.getPetty();
  const req = pettyHistory.find(h=>h.id===id);
  if(!req || req.type!=='topup_request') return;
  if(req.status!=='pending_approval'){ showAlert('Only pending top-up requests can be cancelled.','danger'); return }
  const canCancel = canAction('topup_cancel', { request:req });
  if(!canCancel){ showAlert('You are not allowed to cancel this request.','danger'); return }
  if(!confirm(`Cancel top-up request of ${fmt(req.amount)}?`)) return;
  const restore = setBtnLoading(btn, 'Cancelling…');
  try {
    await DB.updatePettyEntry(id, { status:'cancelled', rejectedAt:new Date().toISOString(), rejectionReason:'Cancelled by requester' });
    DB.addAudit('topup_cancelled',`Top-up request cancelled: ${fmt(req.amount)} (${req.id})`,state.user?.name);
    showAlert('Top-up request cancelled.','warn');
    renderPettyCash();
    buildSidebar();
  } catch(err) {
    restore();
    showAlert(`Failed to cancel request: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

// ── ADVANCE REQUEST (Admin Officer: needs cash before buying) ─────
async function showAdvanceRequest(){
  if(!canAction('petty_request')){ showAlert('You do not have permission to request cash advances.','danger'); return; }
  const pettyConfig = await DB.getPettyConfig();
  const cashOnHand = pettyConfig.float;
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">💳 Request Cash Advance</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>Use this when you need cash <strong>before</strong> making a purchase. The Accountant verifies, a Signatory approves, then cash is released. You must submit proof of purchase within <strong>48 hours</strong>.</span></div>
    <div style="background:var(--surface);border-radius:var(--r);padding:10px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:12px;color:var(--text2)">Current wallet balance</span>
      <span style="font-weight:700;color:${cashOnHand<0?'var(--danger)':cashOnHand<10000?'var(--amber)':'var(--primary)'}">${cashOnHand<0?'−'+fmt(Math.abs(cashOnHand)):fmt(cashOnHand)}</span>
    </div>
    <div class="form-group"><label class="form-label">What do you need to buy? *</label>
      <input type="text" id="adv_purpose" class="form-input" placeholder="e.g. Diesel for generator — Sunday 27 Apr" />
    </div>
    <div class="form-group"><label class="form-label">Amount Needed (₦) *</label>
      <input type="number" id="adv_amt" class="form-input" placeholder="0" min="0" />
    </div>
    <div class="form-group"><label class="form-label">Category *</label>
      <select id="adv_cat" class="form-select">
        <option value="">— Select category —</option>
        ${EXPENSE_CATS.map(c=>`<option value="${c.key}">${c.icon} ${c.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label class="form-label">Date Needed By</label>
      <input type="date" id="adv_date" class="form-input" value="${new Date().toISOString().split('T')[0]}" />
    </div>
    <div class="form-group"><label class="form-label">Notes</label>
      <textarea id="adv_notes" class="form-textarea" placeholder="Any context that helps with approval..."></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitAdvanceRequest(this)">Submit Advance Request</button>
    </div>`);
}

async function submitAdvanceRequest(btn=null){
  if(!canAction('petty_request')){ showAlert('You do not have permission to request cash advances.','danger'); return; }
  const purpose  = document.getElementById('adv_purpose')?.value?.trim();
  const amount   = parseFloat(document.getElementById('adv_amt')?.value)||0;
  const category = document.getElementById('adv_cat')?.value;
  const dateNeeded = document.getElementById('adv_date')?.value;
  const notes    = document.getElementById('adv_notes')?.value||'';
  if(!purpose||!amount||!category){ showAlert('Please fill in the purpose, amount, and category.','danger'); return }

  const pettyConfig = await DB.getPettyConfig();
  if(amount > pettyConfig.float && pettyConfig.float > 0){
    if(!confirm(`The requested amount (${fmt(amount)}) is more than the current wallet balance (${fmt(pettyConfig.float)}). Submit anyway for the Accountant to review?`)) return;
  }
  const req = {
    id:'PC-'+Date.now(), type:'advance',
    purpose, amount, category, dateNeeded, notes,
    requestedBy:state.user?.name, status:'pending_approval',
    createdAt:new Date().toISOString()
  };
  const restore = setBtnLoading(btn, 'Submitting…');
  try {
    await DB.addPettyEntry(req);
    DB.addAudit('petty_advance_requested',`Advance requested: ${purpose} — ${fmt(amount)}`,state.user?.name);
    DB.addNotification('Advance Request',`${state.user?.name} requested an advance of ${fmt(amount)} for "${purpose}". Awaiting approval.`,'warn');
    closeModal();
    showAlert('Advance request submitted. The Accountant will verify and a Signatory will approve before cash is released.','success');
    renderPettyCash();
    buildSidebar();
  } catch(err) {
    restore();
    showAlert(`Failed to submit request: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

// Keep showPettyRequest as alias for the old tab-based form in case any links still reference it
async function showPettyRequest(){ showTopUpRequest(); }

async function approvePetty(id, btn=null){
  if(!canAction('petty_approve_or_view')){ showAlert('You do not have permission to approve petty cash requests.','danger'); return; }
  const restore = setBtnLoading(btn, 'Loading…');
  const [pettyHistory, pettyConfig] = await Promise.all([DB.getPetty(), DB.getPettyConfig()]);
  const req = pettyHistory.find(h=>h.id===id);
  if(!req){ restore(); return; }
  const isTopup = req.type === 'topup_request';

  if(isTopup){
    restore(); // modal takes over; restore the button immediately
    // Show full expense detail modal for review before approving
    const allExpenses = await DB.getExpenses();
    const requestedExpIds = new Set(Array.isArray(req.expenseRefs) ? req.expenseRefs : []);
    const includedExpenses = requestedExpIds.size > 0
      ? allExpenses.filter(e=>requestedExpIds.has(e.id))
      : [];
    const settingsRow = await DB.getSettings();
    const churchName = settingsRow?.churchName || 'RCCG Kingdom Parish, Aguleri';

    const expRows = includedExpenses.map(e=>{
      const c = EXPENSE_CATS_ALL.find(x=>x.key===e.category)||{icon:'💸',label:e.category||'Other'};
      const amt = e.paymentMethod==='split'?(e.pettyAmount||0):(e.amount||0);
      const detailBits = [e.subCategory, e.description&&e.description!==e.subCategory?e.description:'', e.notes?`Notes: ${e.notes}`:''].filter(Boolean);
      const receiptCell = e.receiptNo
        ? `<span style="color:var(--success)">✓ ${e.receiptNo}</span>`
        : e.notes&&e.notes.includes('NO-RECEIPT')
          ? `<span style="color:var(--amber)">No receipt</span>`
          : '<span style="color:var(--text3)">—</span>';
      return `<tr>
        <td style="font-size:12px;padding:5px 8px;white-space:nowrap">${fmtDate(e.date||e.createdAt)}<div class="td-muted" style="font-size:11px">${fmtTime(e.createdAt||e.date)}</div></td>
        <td style="padding:5px 8px;font-size:12px">${c.icon} ${c.label}</td>
        <td style="padding:5px 8px;font-size:12px">${detailBits.map(d=>`<div>${esc(d)}</div>`).join('')||'—'}</td>
        <td style="padding:5px 8px;font-size:11px">${receiptCell}</td>
        <td style="padding:5px 8px;font-size:13px;font-weight:700;color:var(--danger);text-align:right">${fmt(amt)}</td>
      </tr>`;
    }).join('');

    showModal(`
      <button class="modal-close" onclick="closeModal()">✕</button>
      <div class="modal-title">📋 Review Top-Up Request</div>

      <div style="background:var(--surface);border-radius:var(--r);padding:10px 14px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;color:var(--text2)">Requested by <strong>${req.requestedBy||'—'}</strong></span>
          <span style="font-size:12px;color:var(--text3)">${fmtDate(req.createdAt)}</span>
        </div>
        ${req.notes?`<div style="font-size:12px;color:var(--text3);margin-top:4px">"${esc(req.notes)}"</div>`:''}
      </div>

      <div id="topup_review_printable">
        <style>.print-only{display:none}</style>
        <div class="print-only" style="text-align:center;margin-bottom:20px;border-bottom:2px solid #111;padding-bottom:12px">
          <h1 style="font-size:18px;font-weight:700;margin:0 0 4px 0">${esc(churchName)}</h1>
          <div class="subtitle" style="font-size:12px;color:#555">Petty Cash Top-Up Request — ${fmtDate(req.createdAt)}</div>
          <div class="meta" style="font-size:12px">Requested by: <strong>${req.requestedBy||'—'}</strong> &nbsp;|&nbsp; Amount: <strong>${fmt(req.amount)}</strong></div>
        </div>

        <div style="font-size:13px;font-weight:600;margin-bottom:8px">
          Expenses included (${includedExpenses.length}) — Total: ${fmt(req.amount)}
        </div>

        ${includedExpenses.length ? `<div class="table-wrap" style="max-height:240px;overflow-y:auto;margin-bottom:4px">
          <table style="width:100%">
            <tr style="background:var(--surface)">
              <th style="padding:5px 8px;font-size:11px;text-align:left">Date</th>
              <th style="padding:5px 8px;font-size:11px;text-align:left">Category</th>
              <th style="padding:5px 8px;font-size:11px;text-align:left">Details</th>
              <th style="padding:5px 8px;font-size:11px;text-align:left">Receipt</th>
              <th style="padding:5px 8px;font-size:11px;text-align:right">Amount</th>
            </tr>
            ${expRows}
            <tr style="border-top:2px solid var(--border)">
              <td colspan="4" style="font-weight:700;padding:8px;font-size:13px">Total Requested</td>
              <td style="font-weight:800;font-size:15px;color:var(--primary);text-align:right;padding:8px">${fmt(req.amount)}</td>
            </tr>
          </table>
        </div>` : `<div class="empty-table" style="margin-bottom:12px">No linked expenses found. The Admin Officer submitted this without selecting specific expenses.</div>`}
      </div>

      <div class="alert alert-info" style="margin-top:10px"><span class="alert-icon">ℹ</span><span>Approving authorises the payment. The wallet balance updates when the Accountant records the payment.</span></div>

      <div class="modal-footer" style="justify-content:space-between">
        <button class="btn" onclick="App.printTopupReview()">🖨 Print</button>
        <div style="display:flex;gap:8px">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-danger" onclick="App.rejectPettyFromModal('${id}', this)">Reject</button>
          <button class="btn btn-primary" onclick="App.confirmTopupApproval('${id}', this)">✓ Approve</button>
        </div>
      </div>`);
    return; // actual approval done in confirmTopupApproval

  } else {
    // Advance Request: cash is released from the wallet NOW
    if(req.amount > pettyConfig.float){
      const willOwe = pettyConfig.float - req.amount;
      const msg = pettyConfig.float <= 0
        ? `The wallet is already at ${fmt(pettyConfig.float)}.\n\nApproving means the Admin Officer will use ${fmt(Math.abs(willOwe))} of personal funds, which the church will owe them.\n\nProceed?`
        : `Wallet balance is insufficient.\nRequested: ${fmt(req.amount)}\nAvailable: ${fmt(pettyConfig.float)}\n\nApproving means the Admin Officer will need to use ${fmt(Math.abs(willOwe))} of personal funds.\n\nProceed anyway?`;
      if(!confirm(msg)){ restore(); return; }
    }
    try {
      const approvedAt = new Date().toISOString();
      await DB.updatePettyEntry(id, { status:'approved', approvedBy:state.user?.name, approvedAt });
      await DB.savePettyConfig({ float: pettyConfig.float - req.amount, max: pettyConfig.max });
      DB.addAudit('advance_approved',`Advance approved: "${req.purpose}" — ${fmt(req.amount)} (by ${state.user?.name})`,state.user?.name);
      DB.addNotification('Advance Approved',`"${req.purpose}" — ${fmt(req.amount)} approved. Remind ${req.requestedBy} to submit proof within 48 hours.`,'success');
      showAlert(`Advance approved. ${fmt(req.amount)} released from wallet. ${req.requestedBy} must submit proof of purchase within 48 hours.`,'success');
      renderPettyCash();
      buildSidebar();
    } catch(err) {
      restore();
      showAlert(`Failed to approve advance: ${err.message||'Unknown error'}. Please try again.`,'danger');
    }
  }
}

function printTopupReview(){
  const el = document.getElementById('topup_review_printable');
  if(!el) return;
  const content = el.innerHTML;
  const win = window.open('','_blank','width=800,height=700');
  if(!win){ showAlert('Please allow pop-ups for this site to print.','danger'); return; }
  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Petty Cash Top-Up Request</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #111; padding: 32px 40px; max-width: 720px; margin: 0 auto; }
  h1 { font-size: 18px; margin: 0 0 2px 0; }
  .subtitle { font-size: 12px; color: #555; margin-bottom: 4px; }
  .meta { font-size: 12px; margin-bottom: 20px; color: #333; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #f0f0f0; font-size: 11px; padding: 6px 8px; text-align: left; border: 1px solid #ccc; }
  td { font-size: 12px; padding: 6px 8px; border: 1px solid #ddd; vertical-align: top; }
  .total-row td { font-weight: 700; background: #f8f8f8; font-size: 13px; }
  .amt { text-align: right; font-weight: 700; }
  .red { color: #b00; }
  .note { font-size: 11px; color: #666; margin-bottom: 20px; }
  .sigs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 32px; margin-top: 48px; }
  .sig-box { border-top: 1px solid #333; padding-top: 6px; font-size: 11px; color: #555; }
  .print-only { display: block !important; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
${content}
<div class="sigs">
  <div class="sig-box">Prepared by (Admin Officer)</div>
  <div class="sig-box">Verified by (Accountant)</div>
  <div class="sig-box">Approved by (Pastor / Signatory)</div>
</div>
</body>
</html>`);
  win.document.close();
  // Wait for content to render then print
  win.onload = ()=>{ win.focus(); win.print(); };
}

async function confirmTopupApproval(id, btn=null){
  if(!canAction('petty_approve_or_view')){ showAlert('You do not have permission to approve petty cash requests.','danger'); return; }
  const [pettyHistory] = await Promise.all([DB.getPetty()]);
  const req = pettyHistory.find(h=>h.id===id);
  if(!req){ closeModal(); return; }
  const restore = setBtnLoading(btn, 'Approving…');
  try {
    const approvedAt = new Date().toISOString();
    await DB.updatePettyEntry(id, { status:'approved', approvedBy:state.user?.name, approvedAt });
    DB.addAudit('topup_approved',`Top-up approved: ${fmt(req.amount)} (by ${state.user?.name})`,state.user?.name);
    DB.addNotification('Top-Up Approved',`Top-up of ${fmt(req.amount)} approved by ${state.user?.name}. Accountant should record the payment.`,'success');
    closeModal();
    showAlert(`Top-up of ${fmt(req.amount)} approved by you. The Accountant should now record the payment using "Record Top-Up Payment".`,'success');
    renderPettyCash();
    buildSidebar();
  } catch(err) {
    restore();
    showAlert(`Failed to approve: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

async function rejectPettyFromModal(id, btn=null){
  if(!canAction('petty_approve_or_view')){ showAlert('You do not have permission to reject petty cash requests.','danger'); return; }
  closeModal();
  rejectPetty(id);
}


async function rejectPetty(id){
  if(!canAction('petty_approve_or_view')){ showAlert('You do not have permission to reject petty cash requests.','danger'); return; }
  const reason=prompt('Reason for rejection (the requester will see this):');
  const pettyHistory=await DB.getPetty();
  const req=pettyHistory.find(h=>h.id===id);
  if(!req) return;
  const rejectionReason=reason||'No reason given';
  await DB.updatePettyEntry(id, { status:'rejected', rejectedBy:state.user?.name, rejectionReason, rejectedAt:new Date().toISOString() });
  DB.addAudit('petty_rejected',`Petty cash rejected: "${req.purpose}" — Reason: ${rejectionReason}`,state.user?.name);
  DB.addNotification('Petty Cash Rejected',`"${req.purpose}" was rejected by ${state.user?.name}. Reason: ${rejectionReason}`,'warn');
  showAlert('Request rejected and requester notified.','warn');
  renderPettyCash();
  buildSidebar();
}

// Settling a petty cash request — receipt is optional, no-receipt reason required if no receipt
function submitPettyReceipt(id){
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">🧾 Submit Proof of Purchase</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>This will mark the petty cash as settled and <strong>automatically record it as an expense</strong> in the expense log.</span></div>
    <div class="form-group">
      <label class="form-label">Actual Amount Spent (₦)</label>
      <input type="number" id="rc_amt" class="form-input" placeholder="Leave blank if same as approved amount" />
    </div>
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
        <input type="checkbox" id="rc_no_receipt" onchange="App.onReceiptToggle()" />
        No physical receipt (e.g. bought from a market vendor or roadside seller)
      </label>
    </div>
    <div class="form-group" id="rc_receipt_group">
      <label class="form-label">Receipt / Invoice Number <span style="color:var(--danger)">*</span></label>
      <input type="text" id="rc_no" class="form-input" placeholder="e.g. REC-001 or vendor receipt number" />
    </div>
    <div class="form-group" id="rc_no_receipt_group" style="display:none">
      <label class="form-label">Reason (why no receipt) <span style="color:var(--danger)">*</span></label>
      <input type="text" id="rc_reason" class="form-input" placeholder="e.g. Bought diesel from roadside seller — no receipt issued" />
    </div>
    <div class="form-group"><label class="form-label">Vendor / Purchased From</label><input type="text" id="rc_vendor" class="form-input" placeholder="e.g. Total Petrol Station, Onitsha" /></div>
    <div class="form-group"><label class="form-label">Notes</label><textarea id="rc_notes" class="form-textarea" placeholder="Any change returned, additional detail..."></textarea></div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.confirmPettyReceipt('${id}', this)">Submit & Settle</button></div>`);
}

function onReceiptToggle(){
  const checked = document.getElementById('rc_no_receipt')?.checked;
  const rcGroup = document.getElementById('rc_receipt_group');
  const noRcGroup = document.getElementById('rc_no_receipt_group');
  if(rcGroup) rcGroup.style.display = checked ? 'none' : '';
  if(noRcGroup) noRcGroup.style.display = checked ? '' : 'none';
}

async function confirmPettyReceipt(id, btn=null){
  const noReceiptChecked = document.getElementById('rc_no_receipt')?.checked;
  const no = noReceiptChecked
    ? ('NO-RECEIPT: ' + (document.getElementById('rc_reason')?.value?.trim() || 'No reason given'))
    : document.getElementById('rc_no')?.value?.trim();

  if(!noReceiptChecked && !no){ showAlert('Please enter the receipt number, or tick "No physical receipt" and give a reason.','danger'); return }
  if(noReceiptChecked && !document.getElementById('rc_reason')?.value?.trim()){ showAlert('Please explain why there is no receipt.','danger'); return }

  const [pettyHistory, pettyConfig] = await Promise.all([DB.getPetty(), DB.getPettyConfig()]);
  const req = pettyHistory.find(h=>h.id===id);
  if(!req){ closeModal(); return }

  const actualAmt = parseFloat(document.getElementById('rc_amt')?.value)||req.amount;
  const vendor = document.getElementById('rc_vendor')?.value||'';
  const notes  = document.getElementById('rc_notes')?.value||'';

  const updateData = {
    receiptNo: no,
    status: 'settled',
    settledAt: new Date().toISOString(),
    settledBy: state.user?.name,
    actualAmount: actualAmt,
    vendor,
    noReceipt: noReceiptChecked || false
  };

  const restore = setBtnLoading(btn, 'Saving…');
  try {
    let changeReturned = 0;
    let extraSpent = 0;
    if(actualAmt < req.amount){
      changeReturned = req.amount - actualAmt;
      updateData.changeReturned = changeReturned;
      await DB.savePettyConfig({ float: pettyConfig.float + changeReturned, max: pettyConfig.max });
      DB.addNotification('Petty Cash Change Returned', `${fmt(changeReturned)} returned to cash from "${req.purpose}" (spent ${fmt(actualAmt)} of approved ${fmt(req.amount)}).`, 'info');
    } else if(actualAmt > req.amount){
      extraSpent = actualAmt - req.amount;
      await DB.savePettyConfig({ float: pettyConfig.float - extraSpent, max: pettyConfig.max });
      DB.addNotification('Petty Cash Overspend Recorded', `${fmt(extraSpent)} additional petty cash used for "${req.purpose}" (actual ${fmt(actualAmt)} vs approved ${fmt(req.amount)}).`, 'warn');
    }

    await DB.updatePettyEntry(id, updateData);

    await DB.addExpense({
      date: new Date().toISOString().split('T')[0],
      category: req.category||'power',
      subCategory: req.purpose,
      description: req.purpose + (vendor ? ` — ${vendor}` : ''),
      amount: actualAmt,
      receiptNo: noReceiptChecked ? '' : no,
      paymentMethod: 'petty_cash',
      notes: (noReceiptChecked ? `No receipt — ${document.getElementById('rc_reason')?.value||''}\n` : '') + `Petty cash ref: ${req.id}. ${notes}`,
      recordedBy: state.user?.name,
      pettyRef: req.id,
      status: 'approved'  // advance was already approved before cash was released
    });

    DB.addAudit('petty_settled', `Petty cash settled: "${req.purpose}" — ${fmt(actualAmt)}${noReceiptChecked?' (no receipt)':`, Receipt: ${no}`}. Expense auto-created.`, state.user?.name);
    closeModal();
    showAlert(`Settled. ${fmt(actualAmt)} recorded as expense.${changeReturned ? ` ${fmt(changeReturned)} change returned.` : ''}${extraSpent ? ` ${fmt(extraSpent)} extra spent deducted from petty cash.` : ''}${noReceiptChecked ? ' (No receipt — reason recorded)' : ''}`, 'success');
    renderPettyCash();
  } catch(err) {
    restore();
    showAlert(`Failed to settle receipt: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

async function showPettyRefill(prefillAmount, topupRequestId=''){
  if(!canAction('petty_topup_payment')){ showAlert('You do not have permission to record petty cash top-up payments.','danger'); return; }
  const [pettyHistory, pettyConfig, allUsers, allExpenses] = await Promise.all([DB.getPetty(), DB.getPettyConfig(), DB.getUsers(), DB.getExpenses()]);
  const petty = { history: pettyHistory, float: pettyConfig.float, max: pettyConfig.max };

  // Approved top-up requests still awaiting payment. Effective amount is recomputed
  // from live expenseRefs (mirrors renderPettyCash) so deleted expenses don't strand
  // a request. The recorded payment can be attributed to one of these so its status
  // advances to "settled" instead of lingering in "Awaiting Payment".
  const _expenseMap = new Map(allExpenses.map(e => [e.id, e]));
  const outstandingTopups = pettyHistory
    .filter(h => h.type === 'topup_request' && h.status === 'approved')
    .map(h => {
      const refs = Array.isArray(h.expenseRefs) ? h.expenseRefs : [];
      const liveTotal = refs.reduce((s, id) => {
        const e = _expenseMap.get(id);
        if (!e) return s;
        return s + (e.paymentMethod === 'split' ? (e.pettyAmount || 0) : (e.amount || 0));
      }, 0);
      const effectiveAmount = refs.length > 0 ? liveTotal : (h.amount || 0);
      const remaining = Math.max(0, effectiveAmount - (h.actualAmount || 0));
      return { id: h.id, purpose: h.purpose || 'Wallet top-up', approvedAt: h.approvedAt || h.createdAt, remaining };
    })
    .filter(h => h.remaining > 0.5);
  const settled = pettyMonthHistory(petty.history).filter(h=>h.status==='settled'&&h.type!=='refill');
  const settledTotal = settled.reduce((s,h)=>s+(h.actualAmount||h.amount||0),0);
  const spaceInFloat = petty.max - petty.float;
  // When no specific request was passed but exactly one is outstanding, default to it
  // so the common case settles without the user having to remember to attribute it.
  const fixedTopupId = topupRequestId || '';
  const defaultTopupId = fixedTopupId || (outstandingTopups.length === 1 ? outstandingTopups[0].id : '');
  const selectedOutstanding = outstandingTopups.find(o => o.id === defaultTopupId);
  const suggested = prefillAmount != null
    ? prefillAmount   // use the pre-filled amount from an approved request
    : selectedOutstanding ? selectedOutstanding.remaining   // settle the single outstanding request
    : petty.float < 0 ? Math.min(Math.abs(petty.float)+settledTotal, petty.max) : Math.min(settledTotal, spaceInFloat);

  // Build signatory checklist from app users
  const sigUsers = allUsers.filter(u=>['pastor','signatory','it_admin'].includes(u.role));
  const sigChecks = sigUsers.map(u=>`
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;margin-bottom:6px">
      <input type="checkbox" name="ref_sig" value="${esc(u.name)}" />
      <span>${esc(u.name)}</span><span class="badge" style="font-size:10px;background:${ROLES[u.role]?.bg||'#eee'};color:${ROLES[u.role]?.color||'#333'}">${ROLES[u.role]?.label||u.role}</span>
    </label>`).join('');

  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">↺ Top Up Petty Cash</div>
    <div style="background:var(--surface);border-radius:var(--r);padding:10px 14px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:12px;color:var(--text2)">Current cash balance</span><span style="font-weight:600;color:${petty.float<0?'var(--danger)':'var(--text)'}">${petty.float<0?'−'+fmt(Math.abs(petty.float)):fmt(petty.float)}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:12px;color:var(--text2)">Approved maximum</span><span style="font-weight:600">${fmt(petty.max)}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:12px;color:var(--text2)">Space to top up</span><span style="font-weight:600;color:var(--primary)">${fmt(Math.max(0,spaceInFloat))}</span></div>
      ${suggested>0?`<div style="display:flex;justify-content:space-between;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)"><span style="font-size:12px;color:var(--text2)">Suggested amount (based on settled items)</span><span style="font-weight:700;color:var(--amber)">${fmt(suggested)}</span></div>`:''}
      ${petty.float<0?`<div style="margin-top:8px;font-size:12px;color:var(--danger);font-weight:600">⚠ The Admin Officer is owed ${fmt(Math.abs(petty.float))} of personal funds. Top this up to clear the debt.</div>`:''}
    </div>

    ${fixedTopupId || outstandingTopups.length === 0 ? `
      <input type="hidden" id="ref_topup_id" value="${esc(fixedTopupId)}" />
    ` : `
    <div class="form-group"><label class="form-label">Settle which approved request?</label>
      <select id="ref_topup_id" class="form-select" onchange="App.onRefillTopupChange()">
        <option value="">None — general top-up (not linked to a request)</option>
        ${outstandingTopups.map(o=>`<option value="${esc(o.id)}" data-remaining="${o.remaining}" ${o.id===defaultTopupId?'selected':''}>${esc(o.purpose)} — ${fmt(o.remaining)} due (approved ${fmtDate(o.approvedAt)})</option>`).join('')}
      </select>
      <div class="form-hint">Linking this payment to an approved request marks it as settled once fully paid. Leave as "None" for an ad-hoc top-up.</div>
    </div>`}

    <div class="form-group"><label class="form-label">Top-Up Amount (₦) <span style="color:var(--danger)">*</span></label>
      <input type="number" id="ref_amt" class="form-input" placeholder="0" value="${suggested||''}" />
      <div class="form-hint">Max top-up: ${fmt(Math.max(0,spaceInFloat))} (total cannot exceed the approved max of ${fmt(petty.max)})</div>
    </div>

    <!-- Payment method for the top-up -->
    <div class="form-group">
      <label class="form-label">How is this top-up being paid? *</label>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:4px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="ref_method" value="bank_transfer" checked onchange="App.onRefillMethodChange()" /> 🏦 Bank Transfer
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="ref_method" value="cash_accountant" onchange="App.onRefillMethodChange()" /> 💵 Cash with Accountant
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="ref_method" value="split" onchange="App.onRefillMethodChange()" /> 🏦💵 Split (Bank + Cash)
        </label>
      </div>
      <div class="form-hint" id="ref_method_hint">Money leaves the bank account and goes to the Admin Officer's wallet.</div>
    </div>

    <div class="form-group" id="ref_ref_group">
      <label class="form-label">Bank Transfer Reference <span style="color:var(--danger)">*</span></label>
      <input type="text" id="ref_ref" class="form-input" placeholder="Reference number from bank transfer" />
    </div>
    <div class="form-group" id="ref_split_group" style="display:none">
      <div class="form-row">
        <div class="form-group" style="margin-bottom:0"><label class="form-label">🏦 Bank Amount (₦)</label><input type="number" id="ref_bank_amt" class="form-input" placeholder="0" /></div>
        <div class="form-group" style="margin-bottom:0"><label class="form-label">💵 Cash Amount (₦)</label><input type="number" id="ref_cash_amt" class="form-input" placeholder="0" /></div>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Authorized By <span style="color:var(--danger)">*</span></label>
      ${sigChecks||`<input type="text" id="ref_auth_text" class="form-input" placeholder="Names of authorizing signatories" />`}
    </div>

    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitRefill(this)">Confirm Top-Up</button>
    </div>`);
}

async function markTopupSettled(id){
  if(!canAction('petty_topup_payment')){ showAlert('You do not have permission.','danger'); return; }
  if(!confirm('Mark this top-up request as settled?\n\nOnly use this if the full amount owed has already been paid through a separate top-up entry. The cash balance will not be changed.')) return;
  try {
    await DB.updatePettyEntry(id, { status:'settled', settledAt:new Date().toISOString(), settledBy:state.user?.name });
    DB.addAudit('petty_manual_settle',`Top-up request ${id} manually marked as settled by ${state.user?.name}`,state.user?.name);
    showAlert('Request marked as settled.','success');
    renderPettyCash();
  } catch(err) {
    showAlert(`Failed to settle request: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

function onRefillTopupChange(){
  const sel = document.getElementById('ref_topup_id');
  const opt = sel?.selectedOptions?.[0];
  const remaining = opt ? parseFloat(opt.getAttribute('data-remaining')) : NaN;
  const amtInput = document.getElementById('ref_amt');
  // Prefill the amount with the selected request's outstanding balance so the
  // common "pay it off" action settles it. Clearing the selection leaves the
  // amount untouched (it may be an ad-hoc top-up).
  if(amtInput && Number.isFinite(remaining) && remaining > 0){ amtInput.value = remaining; }
}

function onRefillMethodChange(){
  const method = document.querySelector('input[name="ref_method"]:checked')?.value||'bank_transfer';
  const refGroup = document.getElementById('ref_ref_group');
  const splitGroup = document.getElementById('ref_split_group');
  const hint = document.getElementById('ref_method_hint');
  const isCashOnly = method==='cash_accountant';
  if(refGroup) refGroup.style.display = isCashOnly ? 'none' : '';
  if(splitGroup) splitGroup.style.display = method==='split' ? '' : 'none';
  if(hint){
    hint.textContent = isCashOnly
      ? 'The Accountant hands cash directly to the Admin Officer from their own cash holding. Bank balance is not affected.'
      : method==='split'
        ? 'Part comes from the bank (reduces bank balance), part from the Accountant\'s cash holding.'
        : 'Money leaves the bank account and goes to the Admin Officer\'s wallet.';
  }
}

async function submitRefill(btn=null){
  if(!canAction('petty_topup_payment')){ showAlert('You do not have permission to record petty cash top-up payments.','danger'); return; }
  const amt = parseFloat(document.getElementById('ref_amt')?.value)||0;
  const method = document.querySelector('input[name="ref_method"]:checked')?.value||'bank_transfer';
  const topupRequestId = document.getElementById('ref_topup_id')?.value?.trim();
  const ref = method==='cash_accountant' ? '' : (document.getElementById('ref_ref')?.value?.trim()||'');
  const checkedSigs = [...document.querySelectorAll('input[name="ref_sig"]:checked')].map(c=>c.value);
  const authText = document.getElementById('ref_auth_text')?.value?.trim();
  const auth = checkedSigs.length>0 ? checkedSigs.join(', ') : authText;

  if(!amt){ showAlert('Please enter a top-up amount.','danger'); return }
  if(method!=='cash_accountant' && !ref){ showAlert('Please enter the bank transfer reference number.','danger'); return }
  if(!auth){ showAlert('Please select or enter who is authorizing this top-up.','danger'); return }

  const pettyConfig = await DB.getPettyConfig();
  const spaceAvailable = pettyConfig.max - pettyConfig.float;
  if(spaceAvailable <= 0){
    showAlert(`Petty cash is already at or above the approved max (${fmt(pettyConfig.max)}). Reduce current float before recording another top-up.`,'danger');
    return;
  }
  const actualAdded = Math.max(0, Math.min(amt, spaceAvailable));
  if(amt > spaceAvailable){
    if(!confirm(`The amount (${fmt(amt)}) exceeds available space (${fmt(spaceAvailable)}).\n\nOnly ${fmt(spaceAvailable)} will be added to reach the approved max of ${fmt(pettyConfig.max)}.\n\nProceed?`)) return;
  }

  const newFloat = pettyConfig.float + actualAdded;
  const bankAmt = method==='split' ? (parseFloat(document.getElementById('ref_bank_amt')?.value)||0) : method==='bank_transfer' ? actualAdded : 0;
  const cashAmt = method==='split' ? (parseFloat(document.getElementById('ref_cash_amt')?.value)||0) : method==='cash_accountant' ? actualAdded : 0;
  const churchBal = await calcChurchBalance();
  const bankBal = churchBal.bankBalance||0;
  const cashBal = Math.max(0, churchBal.cashWithAccountant||0);
  if(method==='bank_transfer' && bankAmt > bankBal + 0.5){
    showAlert(`Bank balance is insufficient for this top-up. Available: ${fmt(bankBal)}, Requested: ${fmt(bankAmt)}`,'danger');
    return;
  }
  if(method==='cash_accountant' && cashAmt > cashBal + 0.5){
    showAlert(`Cash with Accountant is insufficient for this top-up. Available: ${fmt(cashBal)}, Requested: ${fmt(cashAmt)}`,'danger');
    return;
  }
  if(method==='split'){
    const splitTotal = bankAmt + cashAmt;
    if(!bankAmt && !cashAmt){ showAlert('Enter split amounts for bank and cash.','danger'); return }
    if(Math.abs(splitTotal-actualAdded)>0.5){ showAlert(`Split total (${fmt(splitTotal)}) must match top-up amount (${fmt(actualAdded)}).`,'danger'); return }
    if(bankAmt > bankBal + 0.5){ showAlert(`Bank portion exceeds available bank balance (${fmt(bankBal)}).`,'danger'); return }
    if(cashAmt > cashBal + 0.5){ showAlert(`Cash portion exceeds available cash with Accountant (${fmt(cashBal)}).`,'danger'); return }
  }
  const methodLabel = method==='split' ? `Split — Bank: ${fmt(bankAmt)} + Cash: ${fmt(cashAmt)}` : method==='cash_accountant' ? 'Cash with Accountant' : 'Bank Transfer';

  let linkedTopup = null;
  let linkedEffectiveAmount = 0;
  if(topupRequestId){
    const [pettyHistory, allExpenses] = await Promise.all([DB.getPetty(), DB.getExpenses()]);
    linkedTopup = pettyHistory.find(h=>h.id===topupRequestId && h.type==='topup_request');
    if(!linkedTopup){ showAlert('Linked top-up request was not found. Please refresh and try again.','danger'); return }
    if(linkedTopup.status!=='approved'){ showAlert('Only approved top-up requests can be settled from this screen.','danger'); return }
    // Effective amount mirrors renderPettyCash: recompute from live expenseRefs so a
    // deleted expense doesn't leave the request impossible to settle.
    const refs = Array.isArray(linkedTopup.expenseRefs) ? linkedTopup.expenseRefs : [];
    if(refs.length > 0){
      const expMap = new Map(allExpenses.map(e=>[e.id, e]));
      linkedEffectiveAmount = refs.reduce((s,id)=>{ const e=expMap.get(id); if(!e) return s; return s + (e.paymentMethod==='split'?(e.pettyAmount||0):(e.amount||0)); }, 0);
    } else {
      linkedEffectiveAmount = linkedTopup.amount || 0;
    }
  }

  const restore = setBtnLoading(btn, 'Saving…');
  try {
    await DB.addPettyEntry({
      type:'refill', amount:actualAdded,
      requestedBy:state.user?.name, status:'settled',
      createdAt:new Date().toISOString(), purpose:'Cash Top-Up',
      reference:ref, authorizedBy:auth, paymentMethod:method, bankAmount:bankAmt, cashAmount:cashAmt
    });
    if(linkedTopup){
      // Settle against the live effective amount (what the UI shows as due), tracking
      // cumulative payment via actualAmount. originalAmount locks the effective total
      // on first payment so the record keeps an audit trail of what was owed.
      const originalAmt = linkedTopup.originalAmount || linkedEffectiveAmount || linkedTopup.amount || 0;
      const paidSoFar = linkedTopup.actualAmount || 0;
      const totalPaid = paidSoFar + actualAdded;
      const remaining = Math.max(0, linkedEffectiveAmount - totalPaid);
      const settledNow = remaining <= 0.5;
      const paymentLine = `${new Date().toISOString().split('T')[0]}: ${fmt(actualAdded)} via ${methodLabel}${ref?` (ref: ${ref})`:''}`;
      const mergedNotes = [linkedTopup.notes||'', `Payment log → ${paymentLine}`].filter(Boolean).join('\n');
      await DB.updatePettyEntry(topupRequestId, {
        status: settledNow ? 'settled' : 'approved',
        settledAt: settledNow ? new Date().toISOString() : undefined,
        settledBy: settledNow ? state.user?.name : undefined,
        originalAmount: originalAmt,   // lock in original on first payment
        actualAmount: totalPaid,       // running total paid
        // DO NOT update amount — preserving original requested amount
        paymentMethod: method,
        bankAmount: bankAmt,
        cashAmount: cashAmt,
        reference: ref,
        notes: mergedNotes
      });
    }
    await DB.savePettyConfig({ float: newFloat, max: pettyConfig.max });
    DB.addAudit('petty_refilled',`Cash topped up: ${fmt(actualAdded)} via ${methodLabel} (authorized by ${auth}${ref?', ref: '+ref:''})`,state.user?.name);
    DB.addNotification('Petty Cash Topped Up',`${fmt(actualAdded)} added to petty cash. New balance: ${fmt(newFloat)}. Authorized by: ${auth}.`,'success');
    closeModal();
    const _paidSoFar = linkedTopup ? (linkedTopup.actualAmount || 0) : 0;
    const _remaining = linkedTopup ? Math.max(0, linkedEffectiveAmount - (_paidSoFar + actualAdded)) : 0;
    const remainingMsg = linkedTopup ? (_remaining > 0.5 ? ` Remaining on approved request: ${fmt(_remaining)}.` : ' Top-up request fully settled.') : '';
    showAlert(`Petty cash topped up by ${fmt(actualAdded)}. New balance: ${fmt(newFloat)}.${actualAdded<amt?` (Max reached — only ${fmt(actualAdded)} added.)`:''}${remainingMsg}`,'success');
    renderPettyCash();
  } catch(err) {
    restore();
    showAlert(`Failed to record top-up: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

// ── REPORTS ────────────────────────────────

/** Opens a print-friendly report in a new window (manual print via button inside report window) */
function openPrintableReport(title, bodyHTML, shareConfig){
  const shareBtn = shareConfig ? `<button class="print-btn print-btn-outline" onclick="if(window.opener&&window.opener.App){window.opener.App.shareMonthlyStatement('${esc(shareConfig.from)}','${esc(shareConfig.to)}');window.opener.focus();}else{alert('Please return to the app tab to create a shareable link.');}">🔗 Share Link</button>` : '';
  const html=`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>${esc(title)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#333;line-height:1.5;background:#eef1ee;padding:20px 12px}
  #report-sheet{width:1040px;max-width:1040px;margin:0 auto;background:#fff;padding:28px 32px;box-shadow:0 2px 16px rgba(0,0,0,.08)}
  .report-header{text-align:center;border-bottom:3px double #0F6E56;padding-bottom:16px;margin-bottom:20px}
  .report-header .church-name{font-size:24px;font-weight:700;color:#0F6E56;margin-bottom:2px;text-transform:uppercase;letter-spacing:1px}
  .report-header .church-address{font-size:13px;color:#666;margin-bottom:8px}
  .report-header .report-title{font-size:17px;font-weight:700;color:#333;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px}
  .report-header .report-period{font-size:14px;color:#555}
  .report-header .report-meta{font-size:12px;color:#777;margin-top:6px}
  .section-title{font-size:15px;font-weight:700;color:#0F6E56;margin:18px 0 8px;padding:4px 0;border-bottom:2px solid #0F6E56;text-transform:uppercase;letter-spacing:0.5px;page-break-after:avoid}
  .section-title span{font-weight:normal;font-size:12px;color:#666;margin-left:8px;text-transform:none;letter-spacing:0}
  table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:13px}
  th{background:#0F6E56;color:#fff;padding:8px 10px;text-align:left;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.3px}
  td{padding:7px 10px;border-bottom:1px solid #e0e0e0;overflow-wrap:break-word}
  tr:nth-child(even) td{background:#fafafa}
  /* Wide tables (many columns) use fixed layout so columns share width and wrap by word */
  table.wide{font-size:11px;table-layout:fixed}
  table.wide th{font-size:10.5px;padding:5px 5px;white-space:normal;overflow-wrap:break-word}
  table.wide td{padding:5px 5px;white-space:normal;overflow-wrap:break-word}
  .summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:14px 0 18px;page-break-inside:avoid}
  .summary-box{border:1.5px solid #e0e0e0;border-radius:6px;padding:12px 14px;text-align:center}
  .summary-box .label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#777;margin-bottom:4px}
  .summary-box .value{font-size:21px;font-weight:700;color:#333}
  .summary-box .value.green{color:#0F6E56}
  .summary-box .value.red{color:#c0392b}
  .summary-box .value.amber{color:#BA7517}
  .summary-box .value.blue{color:#185FA5}
  .td-r{text-align:right}
  .td-c{text-align:center}
  .td-bold{font-weight:700}
  .td-green{color:#0F6E56;font-weight:600}
  .td-red{color:#c0392b;font-weight:600}
  .td-amber{color:#BA7517;font-weight:600}
  .total-row td{border-top:2px solid #333;font-weight:700;background:#f5f5f5!important;padding:8px 10px}
  .subtotal-row td{border-top:1.5px solid #aaa;font-weight:600;background:#fafafa!important}
  .note-box{background:#fff8e1;border:1px solid #f0c040;border-radius:4px;padding:10px 14px;font-size:12px;margin:12px 0;color:#7a5200;line-height:1.6}
  .sig-section{display:grid;grid-template-columns:1fr 1fr 1fr;gap:28px;margin-top:36px;page-break-inside:avoid}
  .sig-box{border-top:1.5px solid #333;padding-top:8px;font-size:12px;text-align:center;line-height:1.6}
  .sig-box .sig-name{font-weight:600;margin-top:4px}
  .footer-note{margin-top:24px;padding-top:12px;border-top:1px solid #ddd;font-size:10.5px;color:#999;text-align:center}
  .badge{display:inline-block;font-size:11px;font-weight:600;padding:2px 7px;border-radius:10px}
  .badge-success{background:#EAF3DE;color:#3B6D11}
  .badge-warn{background:#FAEEDA;color:#BA7517}
  .badge-danger{background:#FCEBEB;color:#A32D2D}
  .badge-info{background:#E6F1FB;color:#185FA5}
  .no-data{text-align:center;padding:30px;color:#999;font-style:italic}
  @media print{
    @page{margin:8mm 10mm;size:A4 landscape}
    html,body{background:#fff!important}
    body{padding:0;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    #report-sheet{width:100%!important;max-width:none!important;box-shadow:none;padding:0;margin:0}
    .no-print{display:none!important}
    .section-title{page-break-after:avoid;break-after:avoid;margin-top:12px;margin-bottom:6px;font-size:13px}
    table{page-break-inside:auto;margin-bottom:8px;font-size:11px}
    tr{page-break-inside:avoid;page-break-after:auto}
    thead{display:table-header-group}
    tfoot{display:table-footer-group}
    th{padding:5px 7px;font-size:10.5px}
    td{padding:4px 7px}
    /* Wide tables (Section B, D): shrink font & padding so all columns fit
       A4 landscape width without column-text wrapping into single letters. */
    table.wide{font-size:7.5pt;table-layout:fixed;width:100%}
    table.wide th,table.wide td{padding:2px 3px;white-space:normal;overflow-wrap:break-word;word-break:normal}
    table.wide th{font-size:7pt}
    .summary-grid{grid-template-columns:repeat(6,1fr);gap:6px;margin:6px 0 10px}
    .summary-box{padding:6px 8px}
    .summary-box .label{font-size:9px;margin-bottom:2px}
    .summary-box .value{font-size:14px}
    .report-header{padding-bottom:8px;margin-bottom:10px}
    .report-header .church-name{font-size:18px}
    .report-header .report-title{font-size:14px}
    .report-header .report-period{font-size:12px}
    .report-header .report-meta{font-size:10.5px}
    .note-box{font-size:10.5px;padding:6px 10px;margin:6px 0;page-break-inside:avoid}
    .sig-section{margin-top:16px;page-break-inside:avoid}
    .sig-box{font-size:10.5px}
  }
  .print-btn-bar{text-align:center;margin-bottom:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
  .print-btn{background:#0F6E56;color:#fff;border:none;padding:10px 28px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
  .print-btn:hover{background:#085041}
  .print-btn-outline{background:#fff;color:#0F6E56;border:1.5px solid #0F6E56}
  .print-btn-outline:hover{background:#e8f4f0}
  .print-hint{text-align:center;font-size:12px;color:#777;margin:-8px 0 16px}
</style>
</head>
<body>
  <div class="print-btn-bar no-print" style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin:16px 0">
    <button class="print-btn" onclick="window.print()" style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:#185FA5;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">📄 Save as PDF</button>
    <button class="print-btn" onclick="window.print()" style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:#fff;color:#185FA5;border:2px solid #185FA5;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">🖨️ Print</button>
    ${shareBtn}
  </div>
  <div class="no-print" style="text-align:center;font-size:12px;color:#777;margin:-8px 0 16px;line-height:1.5">
    Both buttons open your browser's print dialog. To download a PDF, pick <strong>"Save as PDF"</strong> as the destination. Paper size: <strong>A4 Landscape</strong>.
  </div>
  <div id="report-sheet">${bodyHTML}</div>
</body></html>`;
  const w=window.open('','_blank');
  if(!w){ showAlert('Pop-up blocked. Please allow pop-ups for this site to download the report.','warn'); return }
  w.document.write(html);
  w.document.close();
  w.focus();
}

/** Shared report header HTML */
function reportHeaderHTML(reportTitle, periodText, settings){
  const churchName=settings?.churchName||'RCCG Kingdom Parish, Aguleri';
  const address=settings?.churchAddress||'Aguleri, Anambra State, Nigeria';
  return `<div class="report-header">
    <div class="church-name">${esc(churchName)}</div>
    <div class="church-address">${esc(address)}</div>
    <div class="report-title">${esc(reportTitle)}</div>
    <div class="report-period">${esc(periodText)}</div>
    <div class="report-meta">Generated by: ${esc(state.user?.name||'—')} &nbsp;|&nbsp; Date: ${fmtDate(new Date().toISOString())}</div>
  </div>`;
}

/** Shared signature section */
function reportSignatureHTML(pastorName='', reviewerLabel='Reviewed &amp; Approved by:', accountantName=''){
  const pastorDisplay = pastorName ? esc(pastorName) : '________________';
  return `<div class="sig-section">
    <div class="sig-box">Prepared by:<br><br><br><div class="sig-name">${accountantName?esc(accountantName):'________________'}</div>Church Accountant</div>
    <div class="sig-box">${reviewerLabel}<br><br><br><div class="sig-name">${pastorDisplay}</div>Parish Pastor</div>
    <div class="sig-box">Date:<br><br><br><div class="sig-name">${fmtDate(new Date().toISOString())}</div></div>
  </div>
  <div class="footer-note">This is a computer-generated report from the RCCG Kingdom Parish Finance Portal. For enquiries, contact the Church Accountant or Admin Officer.</div>`;
}


function applyReportPeriodDefaults(settings){
  const mode = state.reportPeriodMode || 'remittance';
  if(mode==='calendar'){
    if(!state.reportFromDate) state.reportFromDate = ymdLocal(new Date(state.year, state.month, 1));
    if(!state.reportToDate)   state.reportToDate   = ymdLocal(new Date(state.year, state.month+1, 0));
    return { cutoffDay:null, mode };
  }
  const cutoffConfig = getRemCutoffDates(settings, state.year);
  const cutoffYear = cutoffConfig ? Number(cutoffConfig.year) : null;
  const cutoffDay = (cutoffConfig && cutoffYear===state.year && Number.isInteger(cutoffConfig.dates[state.month]))
    ? cutoffConfig.dates[state.month] : null;
  if(cutoffDay){
    if(!state.reportToDate) state.reportToDate = ymdLocal(new Date(state.year, state.month, cutoffDay));
    if(!state.reportFromDate){
      const prevMonth = state.month===0 ? 11 : state.month-1;
      const prevYear  = state.month===0 ? state.year-1 : state.year;
      const prevCC = getRemCutoffDates(settings, prevYear);
      const prevCutoffDay = (prevCC && Number.isInteger(prevCC.dates[prevMonth]) && Number(prevCC.year)===prevYear)
        ? prevCC.dates[prevMonth] : null;
      if(prevCutoffDay){
        const from = new Date(prevYear, prevMonth, prevCutoffDay);
        from.setDate(from.getDate()+1);
        state.reportFromDate=ymdLocal(from);
      } else {
        state.reportFromDate=ymdLocal(new Date(state.year,state.month,1));
      }
    }
  } else {
    if(!state.reportFromDate) state.reportFromDate=ymdLocal(new Date(state.year,state.month,1));
    if(!state.reportToDate)   state.reportToDate  =ymdLocal(new Date());
  }
  return { cutoffDay, mode };
}

function setReportPeriodMode(mode){
  state.reportPeriodMode = mode==='calendar' ? 'calendar' : 'remittance';
  // Clear cached dates so applyReportPeriodDefaults recalculates for the new mode
  state.reportFromDate = null;
  state.reportToDate = null;
  renderReports();
}

async function renderReports(){
  const settings = await DB.getSettings();
  // Initialize report date range from selected mode (remittance cut-off or calendar month)
  const { cutoffDay, mode } = applyReportPeriodDefaults(settings);
  const fromDate=state.reportFromDate;
  const toDate=state.reportToDate;
  document.getElementById('pageContent').innerHTML=`
    <div class="page-header"><div class="page-title">📊 Reports Centre</div><div class="page-sub">Generate comprehensive financial reports</div></div>
    <div class="card" style="margin-bottom:12px;padding:14px 16px">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">📅 Report Period</div>
      <div style="display:flex;gap:6px;margin-bottom:12px">
        <button onclick="App.setReportPeriodMode('remittance')" style="padding:5px 14px;border-radius:20px;border:1.5px solid ${mode==='remittance'?'var(--primary)':'var(--border)'};background:${mode==='remittance'?'var(--primary)':'transparent'};color:${mode==='remittance'?'#fff':'var(--text2)'};font-size:12px;font-weight:600;cursor:pointer;transition:all .15s">Remittance Period</button>
        <button onclick="App.setReportPeriodMode('calendar')" style="padding:5px 14px;border-radius:20px;border:1.5px solid ${mode==='calendar'?'var(--primary)':'var(--border)'};background:${mode==='calendar'?'var(--primary)':'transparent'};color:${mode==='calendar'?'#fff':'var(--text2)'};font-size:12px;font-weight:600;cursor:pointer;transition:all .15s">Calendar Month</button>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:6px">
          <label style="font-size:12px;color:var(--text2);white-space:nowrap">From</label>
          <input type="date" id="reportFromDate" class="form-input" value="${fromDate}"
            style="width:auto;padding:6px 10px;font-size:13px"
            onchange="App.onReportDatesChange()" />
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <label style="font-size:12px;color:var(--text2);white-space:nowrap">To</label>
          <input type="date" id="reportToDate" class="form-input" value="${toDate}"
            style="width:auto;padding:6px 10px;font-size:13px"
            onchange="App.onReportDatesChange()" />
        </div>
        ${mode==='remittance'&&cutoffDay?'<span class="badge badge-info" style="font-size:11px">📅 Default from cut-off date</span>':''}${mode==='calendar'?'<span class="badge badge-info" style="font-size:11px">🗓️ Calendar month period</span>':''}
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px">
        ℹ️ All reports below will cover this period. ${mode==='remittance'?(cutoffDay?'Defaulted from HQ cut-off date. ':'Using remittance cycle for this month. '):'Using full calendar month period. '}Adjust the dates before generating any report.
        Period: <strong>${fmtDate(fromDate)}</strong> – <strong>${fmtDate(toDate)}</strong>
      </div>
    </div>
    <div class="card" style="margin-bottom:1rem;padding:1rem 1.25rem">
      <p style="font-size:12px;color:var(--text2);margin-bottom:0"><strong>Tip:</strong> Each report opens in a new window for clean, professional printing. Only the report content will be printed — not the web app interface.</p>
    </div>
    <div class="grid-3" style="margin-bottom:1rem">
      <button class="qa-btn" onclick="App.generateWeeklyReport()"><div class="qa-icon" style="background:#E1F5EE">📋</div><div class="qa-label">Weekly Summary</div><div class="qa-sub">Sunday collections breakdown</div></button>
      <button class="qa-btn" onclick="App.generateMonthlyReport()"><div class="qa-icon" style="background:#E6F1FB">📊</div><div class="qa-label">Monthly Financial Statement</div><div class="qa-sub">Full income, expenses & position</div></button>
      <button class="qa-btn" onclick="App.generateRemittanceReport()"><div class="qa-icon" style="background:#FCEBEB">📤</div><div class="qa-label">Remittance Report</div><div class="qa-sub">For RCCG HQ submission</div></button>
      <button class="qa-btn" onclick="App.generateQuarterlyReport()"><div class="qa-icon" style="background:#FAEEDA">📈</div><div class="qa-label">Quarterly Review</div><div class="qa-sub">3-month trend & health check</div></button>
      <button class="qa-btn" onclick="App.generateExpenseReport()"><div class="qa-icon" style="background:#EAF3DE">💸</div><div class="qa-label">Expense Report</div><div class="qa-sub">Detailed by category & line item</div></button>
      <button class="qa-btn" onclick="App.generatePettyCashReport()"><div class="qa-icon" style="background:#EEEDFE">💳</div><div class="qa-label">Petty Cash Report</div><div class="qa-sub">Imprest reconciliation</div></button>
    </div>
    <div class="card" style="margin-bottom:1rem;padding:0.9rem 1.25rem;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div style="min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text)">🔗 Share the Monthly Financial Statement online</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">Generate a mobile-friendly link anyone can open — no login required. Covers the selected period above.</div>
      </div>
      <button class="btn btn-primary" style="white-space:nowrap" onclick="App.shareMonthlyStatement()">📤 Share Statement</button>
    </div>
    <div id="reportOutput"></div>`;
}

function onReportDatesChange(){
  state.reportFromDate=document.getElementById('reportFromDate')?.value||null;
  state.reportToDate=document.getElementById('reportToDate')?.value||null;
  renderReports();
}

async function generateMonthlyReport(){
  const [allIncome, allExpenses, allRemittances, settings, allCashTx, remRatesData, users, allPettyMR, allSatFundsMR] = await Promise.all([
    DB.getIncome(), DB.getExpenses(), DB.getRemittances(), DB.getSettings(), DB.getCashTransactions(), getRemRates(), DB.getUsers(), DB.getPetty(), DB.getSatelliteFunds()
  ]);
  const pastorName=(users||[]).find(u=>u.role==='pastor')?.name||'';
  const accountantName=(users||[]).find(u=>u.role==='accountant')?.name||'';
  const remRates=remRatesData.rates||DEFAULT_REMITTANCE_RATES;
  const depositMapM={};
  allCashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef).forEach(t=>{depositMapM[t.incomeRef]=(depositMapM[t.incomeRef]||0)+(t.amount||0)});
  const expCoveringMapM=buildExpenseCoveringMap(allIncome, allCashTx, remRates, allExpenses, allPettyMR);
  function depositBadgeM(r){
    const cashHeld=getSundayCashWithAccountant(r,remRates);
    if(cashHeld===0) return '<span class="badge badge-info">No Cash</span>';
    const dep=depositMapM[r.id]||0;
    const entry=expCoveringMapM.get(r.id);
    if(dep>=cashHeld||entry?.isReconciled) return '<span class="badge badge-success">Deposited</span>';
    if(dep>0) return '<span class="badge badge-warn">Partial</span>';
    return '<span class="badge badge-warn">Pending</span>';
  }
  const fromDate=state.reportFromDate||ymdLocal(new Date(state.year,state.month,1));
  const toDate=state.reportToDate||ymdLocal(new Date());
  const periodLabel=`${fmtDate(fromDate)} – ${fmtDate(toDate)}`;
  const satFundsSummaryMR=summarizeSatelliteFunds(allSatFundsMR, fromDate, toDate);
  const income=filterByDateRange(allIncome,fromDate,toDate);
  const allMonthExpenses=filterByDateRange(allExpenses,fromDate,toDate);
  const expenses=allMonthExpenses.filter(e=>isLoggedExpense(e));
  const pendingExpCount=0;
  const rem=await calcRemittancesFromRecords(income);
  const quotaList=getQuotaList(settings);
  const quotaLines=getQuotaLinesForPeriod(quotaList, fromDate, toDate);
  const totalFixedQuotas=sumQuotaLines(quotaLines);
  // 'gift' transfers from the satellite pool are genuine parish income once
  // transferred — folded into totalIncome for reporting here only. See the matching
  // comment in buildMonthlyStatementData for the full rationale.
  const totalIncome=income.reduce((s,r)=>s+(r.totalCollection||0),0) + satFundsSummaryMR.giftPeriod;
  const totalExpenses=expenses.reduce((s,r)=>s+(r.amount||0),0);
  // See buildMonthlyStatementData() for filter rationale — paidDate + status='paid'
  // gives the true cash outflow within the period.
  const periodPaidRems=allRemittances.filter(r=>r.status==='paid').filter(r=>{
    const d=String(r?.paidDate||r?.date||r?.createdAt||'').slice(0,10);
    return d && d>=fromDate && d<=toDate;
  });
  const totalRemPaid=periodPaidRems.reduce((s,r)=>s+(r.amount||0),0);
  const totalRemDue=totalRemittanceDue(rem, totalFixedQuotas);
  const trueNetLocal=rem.netLocal-totalFixedQuotas;
  const netPosition=totalIncome-totalExpenses-totalRemDue;
  const totalChildrenOffering=income.reduce((s,r)=>s+(r.childrenOffering||0),0);
  const childrenLocalShare=totalChildrenOffering*getChildrenOfferingLocalRate(remRates);
  const netPositionExChildren=netPosition-childrenLocalShare;
  const sundayIncomeRecords=income.filter(r=>!r.source||r.source==='sunday_collection');
  const childrenTeacherHold=sundayIncomeRecords.reduce((s,r)=>s+getChildrenTeacherHeldCash(r,remRates),0);

  // Opening & closing balances via calcChurchBalance() — matches dashboard exactly.
  const _mrFromDate=new Date(fromDate+'T00:00:00');
  const _mrDayBefore=new Date(_mrFromDate);_mrDayBefore.setDate(_mrDayBefore.getDate()-1);
  const openingBalDate=ymdLocal(_mrDayBefore);
  const [openingBalResult, closingBalResult]=await Promise.all([
    calcChurchBalance(openingBalDate,{
      income:allIncome,expenses:allExpenses,remittances:allRemittances,
      cashTx:allCashTx,pettyHistory:allPettyMR,satelliteFunds:allSatFundsMR,remRates:remRates
    }),
    calcChurchBalance(toDate,{
      income:allIncome,expenses:allExpenses,remittances:allRemittances,
      cashTx:allCashTx,pettyHistory:allPettyMR,satelliteFunds:allSatFundsMR,remRates:remRates
    })
  ]);
  const openingBalance=openingBalResult.total;
  const closingBalance=closingBalResult.total;
  const closingBankBalance=closingBalResult.bankBalance;
  const closingCashWithAccountant=closingBalResult.cashWithAccountant;
  const closingCashDeficit=closingBalResult.cashDeficit||0;
  const closingPettyFloat=closingBalResult.pettyFloat;
  const closingReconstructed=openingBalance+totalIncome-totalExpenses-totalRemPaid-childrenTeacherHold;
  const closingReconcileDiff=Math.round(closingBalance-closingReconstructed);

  const priorIncome=allIncome.filter(r=>{
    const d=String(r?.date||r?.createdAt||'').slice(0,10);
    return d && d<=openingBalDate;
  });
  const priorRemCalc=await calcRemittancesFromRecords(priorIncome, remRatesData);
  const priorFirstIncRec=priorIncome.length>0?priorIncome[priorIncome.length-1]:null;
  const priorFirstDate=priorFirstIncRec?String(priorFirstIncRec.date||priorFirstIncRec.createdAt||'').slice(0,10):'';
  const priorAccumQuotas=priorFirstIncRec?accumQuotasAcrossPeriods(quotaList, settings, allRemittances, priorFirstDate, openingBalDate):0;
  const priorPaidRems=allRemittances.filter(r=>r.status==='paid'||r.status==='written_off').filter(r=>{
    const d=remittanceSettledDate(r);
    return !d || d<=openingBalDate;
  }).reduce((s,r)=>s+(r.amount||0),0);
  const openingOutstandingRems=Math.max(0, totalRemittanceDue(priorRemCalc)+priorAccumQuotas-priorPaidRems);
  const totalOutstandingRems=calcOutstandingRemittancesFromFlow(openingOutstandingRems, totalRemDue, totalRemPaid);
  const availableParishFund=closingBalance-totalOutstandingRems;

  const sundayCount=new Set(sundayIncomeRecords.map(r=>r.date)).size;

  // Income by type summary
  const incomeByType={};
  INCOME_TYPES.forEach(t=>{incomeByType[t.key]={label:t.label,total:0}});
  income.forEach(r=>{INCOME_TYPES.forEach(t=>{incomeByType[t.key].total+=(r[t.key]||0)})});
  const incomeTypeSummary=Object.values(incomeByType).filter(t=>t.total>0);
  const otherIncomeRecords = income.filter(r => r.source && r.source !== 'sunday_collection')
    .filter(r => INCOME_TYPES.reduce((s,t) => s + (r[t.key]||0), 0) === 0);
  const otherIncomeTotal = otherIncomeRecords.reduce((s,r) => s + (r.totalCollection||0), 0);

  // Expense by category summary
  const expByCat={};
  EXPENSE_CATS_ALL.forEach(c=>{expByCat[c.key]={label:c.label,icon:c.icon,total:0,count:0}});
  expenses.forEach(e=>{if(expByCat[e.category]){expByCat[e.category].total+=e.amount||0;expByCat[e.category].count++}});
  const expSorted=Object.values(expByCat).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);

  const body=`
    ${reportHeaderHTML('Monthly Financial Statement', periodLabel, settings)}

    <div class="summary-grid">
      <div class="summary-box"><div class="label">Total Income</div><div class="value green">${fmt(totalIncome)}</div></div>
      <div class="summary-box"><div class="label">Total Expenses</div><div class="value red">${fmt(totalExpenses)}</div></div>
      <div class="summary-box"><div class="label">Total Remittances Due</div><div class="value red">${fmt(totalRemDue)}</div></div>
      <div class="summary-box"><div class="label">Net Local Retained</div><div class="value green">${fmt(trueNetLocal)}</div></div>
      <div class="summary-box"><div class="label">Money in Bank &amp; Cash <span style="font-size:10px;color:var(--text3);font-weight:normal">(period end)</span></div><div class="value ${closingBalance>=0?'green':'red'}">${fmt(closingBalance)}</div><div style="font-size:10px;color:var(--text3);margin-top:3px">Available after remittances: ${fmt(availableParishFund)}</div></div>
      <div class="summary-box"><div class="label">No. of Sundays</div><div class="value blue">${sundayCount}</div></div>
    </div>

    <div class="section-title">Section A: Income Summary by Type</div>
    <table>
      <tr><th>Income Type</th><th class="td-r">Amount (₦)</th><th class="td-c">% of Total</th></tr>
      ${incomeTypeSummary.map(t=>`<tr><td>${t.label}</td><td class="td-r">${fmt(t.total)}</td><td class="td-c">${totalIncome?Math.round(t.total/totalIncome*100):0}%</td></tr>`).join('')}
      ${otherIncomeTotal > 0 ? `<tr><td>Other Income (donations, midweek, etc.)</td><td class="td-r">${fmt(otherIncomeTotal)}</td><td class="td-c">${totalIncome?Math.round(otherIncomeTotal/totalIncome*100):0}%</td></tr>` : ''}
      ${satFundsSummaryMR.giftPeriod > 0 ? `<tr><td>Retained from Satellite Funds (Gift/Surplus)</td><td class="td-r">${fmt(satFundsSummaryMR.giftPeriod)}</td><td class="td-c">${totalIncome?Math.round(satFundsSummaryMR.giftPeriod/totalIncome*100):0}%</td></tr>` : ''}
      <tr class="total-row"><td>TOTAL INCOME</td><td class="td-r">${fmt(totalIncome)}</td><td class="td-c">100%</td></tr>
    </table>

    <div class="section-title">Section B: Weekly Collection Details</div>
    ${income.length?`<table class="wide">
      <tr><th>S/N</th><th>Date</th>${INCOME_TYPES.map(t=>`<th class="td-r">${t.label}</th>`).join('')}<th class="td-r">Total</th><th class="td-c">% of Month</th><th>Status</th></tr>
      ${income.map((r,i)=>{
        const isSunday=!r.source||r.source==='sunday_collection';
        const srcLabel=!isSunday?(OTHER_INCOME_SOURCES.find(s=>s.key===r.source)||{label:r.source||'Other'}).label:'';
        return `<tr><td>${i+1}</td><td>${fmtDate(r.date)}${!isSunday?`<br><span style="font-size:10px;color:#666;font-style:italic">${esc(srcLabel)}</span>`:''}</td>${INCOME_TYPES.map(t=>`<td class="td-r">${r[t.key]?fmt(r[t.key]):'—'}</td>`).join('')}<td class="td-r td-bold">${fmt(r.totalCollection)}</td><td class="td-c">${totalIncome?Math.round((r.totalCollection||0)/totalIncome*100):0}%</td><td>${depositBadgeM(r)}</td></tr>`;
      }).join('')}
      <tr class="total-row"><td colspan="2">TOTAL COLLECTIONS</td>${INCOME_TYPES.map(t=>{const s=income.reduce((a,r)=>a+(r[t.key]||0),0);return `<td class="td-r">${s?fmt(s):'—'}</td>`}).join('')}<td class="td-r">${fmt(totalIncome)}</td><td class="td-c">100%</td><td></td></tr>
    </table>`:'<div class="no-data">No income records for this period.</div>'}

    <div class="section-title">Section C: Remittances Due to RCCG Authorities</div>
    <table>
      <tr><th>Description</th><th class="td-c">Rate / Basis</th><th class="td-r">Amount (₦)</th></tr>
      ${rem.lines.filter(l=>!l.isTg&&l.national>0).map(l=>`<tr><td>${l.label} → National HQ</td><td class="td-c">${l.total>0?Math.round(l.national/l.total*100)+'% of '+fmt(l.total):'% Based'}</td><td class="td-r">${fmt(l.national)}</td></tr>`).join('')}
      ${rem.lines.filter(l=>l.isTg&&l.national>0).map(l=>`<tr><td>Thanksgiving (TG) → National HQ</td><td class="td-c">${Math.round(remRatesData.tgNational*100)}% of ${fmt(l.total)}</td><td class="td-r">${fmt(l.national)}</td></tr>${(l.seed||0)>0?`<tr><td style="padding-left:16px">Thanksgiving → Seed → National HQ</td><td class="td-c">${Math.round((remRatesData.tgSeed||0)*100)}% of ${fmt(l.total)}</td><td class="td-r">${fmt(l.seed)}</td></tr>`:''}`).join('')}
      ${rem.provinceRebate>0?`<tr><td>Province Rebate (on local tithes)</td><td class="td-c">${rem.localTithe>0?Math.round(rem.provinceRebate/rem.localTithe*100)+'% of '+fmt(rem.localTithe):'% Based'}</td><td class="td-r">${fmt(rem.provinceRebate)}</td></tr>`:''}
      ${(rem.crmAddon||0)>0?`<tr><td>CRM Add-on → National HQ</td><td class="td-c">${Math.round(remRatesData.crmAddon*100)}% of CRM Total</td><td class="td-r">${fmt(rem.crmAddon)}</td></tr>`:''}
      ${(rem.coastline||0)>0?`<tr><td>Coastline Worship Centre</td><td class="td-c">${Math.round(remRatesData.coastline*100)}% of Min. Tithe</td><td class="td-r">${fmt(rem.coastline)}</td></tr>`:''}
      ${(rem.insuranceGen||0)>0?`<tr><td>Insurance Fund (GEN TITHE)</td><td class="td-c">${+(remRatesData.insuranceGenTithe*100).toFixed(2)}% of Mem. Tithe</td><td class="td-r">${fmt(rem.insuranceGen)}</td></tr>`:''}
      ${(rem.insuranceMin||0)>0?`<tr><td>Insurance Fund (MIN TITHE)</td><td class="td-c">${+(remRatesData.insuranceMinTithe*100).toFixed(2)}% of Min. Tithe</td><td class="td-r">${fmt(rem.insuranceMin)}</td></tr>`:''}
      ${rem.totalArea>0?`<tr><td style="padding-left:16px">Thanksgiving → Area/Zonal Pastor</td><td class="td-c">${Math.round(remRatesData.tgArea*100)}% of TG</td><td class="td-r">${fmt(rem.totalArea)}</td></tr>`:''}
      ${rem.totalPastor>0?`<tr><td style="padding-left:16px">Thanksgiving → Parish Pastor's Share</td><td class="td-c">${Math.round(remRatesData.tgPastor*100)}% of TG</td><td class="td-r">${fmt(rem.totalPastor)}</td></tr>`:''}
      ${rem.totalMinisters>0?`<tr><td style="padding-left:16px">Thanksgiving → Ministers' Share</td><td class="td-c">${Math.round(remRatesData.tgMinisters*100)}% of TG</td><td class="td-r">${fmt(rem.totalMinisters)}</td></tr>`:''}
      ${quotaLines.map(q=>`<tr><td>${esc(q.label)}</td><td class="td-c">${esc(isQuotaFullyAccrued(q)?'Fixed':(q.isProrated?`Fixed • ${q.basis}`:'Fixed Quota'))}</td><td class="td-r">${fmt(q.amount)}</td></tr>`).join('')}
      <tr class="total-row"><td colspan="2">TOTAL REMITTANCES DUE</td><td class="td-r">${fmt(totalRemDue)}</td></tr>
      <tr style="background:#e8f4f0"><td colspan="2" style="font-weight:600;color:#0F6E56">Remittances Paid This Period</td><td class="td-r" style="font-weight:600;color:#0F6E56">${fmt(totalRemPaid)}</td></tr>
      <tr style="background:${(totalRemDue-totalRemPaid)>0?'#fdf0f0':'#e8f4f0'}"><td colspan="2" style="font-weight:600;color:${(totalRemDue-totalRemPaid)>0?'#c0392b':'#0F6E56'}">Outstanding Remittance Balance</td><td class="td-r" style="font-weight:700;color:${(totalRemDue-totalRemPaid)>0?'#c0392b':'#0F6E56'}">${(totalRemDue-totalRemPaid)>0?fmt(totalRemDue-totalRemPaid):fmt(0)}</td></tr>
      <tr style="background:#e8f4f0"><td colspan="2" style="font-weight:600;color:#0F6E56">NET LOCAL RETAINED</td><td class="td-r" style="font-weight:600;color:#0F6E56">${fmt(trueNetLocal)}</td></tr>
    </table>

    <div class="section-title">Section D: Expenses <span>(${expenses.length} entries totalling ${fmt(totalExpenses)})</span></div>
    ${expenses.length?`<table class="wide">
      <tr><th>S/N</th><th>Date</th><th>Category</th><th>Sub-category</th><th>Description</th><th>Method</th><th>Receipt No.</th><th class="td-r">Amount (₦)</th></tr>
      ${expenses.map((e,i)=>{const cat=EXPENSE_CATS_ALL.find(c=>c.key===e.category)||{label:e.category||'—'};const methodLabel=e.paymentMethod==='bank_transfer'?'Bank Transfer':e.paymentMethod==='petty_cash'?'Petty Cash':e.paymentMethod==='split'?`Split (${[(e.bankAmount||0)>0?`Bank:${fmt(e.bankAmount)}`:'',(e.cashAmount||0)>0?`Cash:${fmt(e.cashAmount)}`:'',(e.pettyAmount||0)>0?`Petty:${fmt(e.pettyAmount)}`:''].filter(Boolean).join('+')})`:'Cash';const desc=e.description&&e.description.trim()&&e.description.trim()!==e.subCategory?esc(e.description):'—';return `<tr><td>${i+1}</td><td>${fmtDate(e.date||e.createdAt)}</td><td>${cat.label}</td><td>${esc(e.subCategory||'—')}</td><td>${desc}</td><td>${methodLabel}</td><td>${e.receiptNo||'—'}</td><td class="td-r">${fmt(e.amount)}</td></tr>`}).join('')}
      <tr class="total-row"><td colspan="7">TOTAL EXPENSES</td><td class="td-r">${fmt(totalExpenses)}</td></tr>
    </table>`:'<div class="no-data">No expenses recorded for this period.</div>'}

    ${expSorted.length?`<div class="section-title">Section E: Expense Summary by Category</div>
    <table>
      <tr><th>Category</th><th class="td-c">No. of Items</th><th class="td-r">Amount (₦)</th><th class="td-c">% of Total</th></tr>
      ${expSorted.map(c=>`<tr><td>${c.icon} ${c.label}</td><td class="td-c">${c.count}</td><td class="td-r">${fmt(c.total)}</td><td class="td-c">${totalExpenses?Math.round(c.total/totalExpenses*100):0}%</td></tr>`).join('')}
      <tr class="total-row"><td>TOTAL</td><td class="td-c">${expSorted.reduce((s,c)=>s+c.count,0)}</td><td class="td-r">${fmt(totalExpenses)}</td><td class="td-c">100%</td></tr>
    </table>`:''}

    <div class="section-title">Section F: Where The Money Stands <span>(Financial Position Summary)</span></div>

    <table style="margin-bottom:6px">
      <tr style="background:#eaf5ff"><td style="font-weight:600;color:#185FA5">Money carried over from last period <span style="font-size:11px;color:#666;font-weight:normal">(as of ${fmtDate(openingBalDate)})</span></td><td class="td-r" style="font-weight:600;color:#185FA5">${fmt(openingBalance)}</td></tr>
      <tr><td style="padding-left:20px">Add: All money received this period</td><td class="td-r td-green">+ ${fmt(totalIncome)}</td></tr>
      <tr><td style="padding-left:20px;color:#555">Less: Money spent on church needs (expenses)</td><td class="td-r td-red">− ${fmt(totalExpenses)}</td></tr>
      <tr><td style="padding-left:20px;color:#555">Less: RCCG remittances already paid</td><td class="td-r td-red">− ${fmt(totalRemPaid)}</td></tr>
      ${childrenTeacherHold>0?`<tr><td style="padding-left:20px;color:#555">Less: Children's Dept. cash kept with teacher</td><td class="td-r td-red">− ${fmt(childrenTeacherHold)}</td></tr>`:''}
      ${Math.abs(closingReconcileDiff)>=1?`<tr><td style="padding-left:20px;color:#888;font-style:italic">Adjustments (internal cash movements, rounding)</td><td class="td-r" style="color:#888">${closingReconcileDiff>0?'+ ':'− '}${fmt(Math.abs(closingReconcileDiff))}</td></tr>`:''}
      <tr class="total-row" style="background:#e8f4f0!important"><td style="color:#0F6E56">💰 MONEY CURRENTLY IN OUR BANK &amp; CASH <span style="font-size:11px;font-weight:normal;color:#666">(as of ${fmtDate(toDate)})</span></td><td class="td-r" style="color:${closingBalance>=0?'#0F6E56':'#c0392b'};font-size:15px">${fmt(closingBalance)}</td></tr>
    </table>

    <table style="margin-bottom:14px;font-size:12px">
      <tr><td style="padding-left:36px;color:#555;border-bottom:none">• In the Bank Account</td><td class="td-r" style="color:#333;border-bottom:none">${fmt(closingBankBalance)}</td></tr>
      <tr><td style="padding-left:36px;color:#555;border-bottom:none">• Cash with Accountant</td><td class="td-r" style="color:#333;border-bottom:none">${fmt(closingCashWithAccountant)}${closingCashDeficit>0?` <span style="color:#c0392b;font-size:11px">(deficit: ${fmt(closingCashDeficit)})</span>`:''}</td></tr>
      <tr><td style="padding-left:36px;color:#555">• Petty Cash Float</td><td class="td-r" style="color:${closingPettyFloat<0?'#c0392b':'#333'}">${fmt(closingPettyFloat)}${closingPettyFloat<0?' <span style="font-size:11px">⚠️ owed by petty holder</span>':''}</td></tr>
    </table>

    <div class="section-title" style="font-size:13px;margin-top:14px">But some of this money is not really ours to spend…</div>
    <table>
      <tr><td>Money in bank &amp; cash</td><td class="td-r">${fmt(closingBalance)}</td></tr>
      <tr><td style="padding-left:20px;color:#555">Less: RCCG remittances still owed <span style="font-size:11px;color:#888">(this period + any prior unpaid)</span></td><td class="td-r td-red">− ${fmt(totalOutstandingRems)}</td></tr>
      <tr class="total-row" style="background:${availableParishFund>=0?'#e8f4f0':'#fdf0f0'}!important"><td style="color:${availableParishFund>=0?'#0F6E56':'#c0392b'}">✅ WHAT THE PARISH CAN ACTUALLY USE</td><td class="td-r" style="color:${availableParishFund>=0?'#0F6E56':'#c0392b'};font-size:15px">${fmt(availableParishFund)}</td></tr>
    </table>

    <div class="note-box" style="background:#f4f9ff;border-color:#c9dcef;color:#345574">
      <strong>How to read this:</strong> The ${fmt(totalOutstandingRems)} above is money currently sitting in our bank that must be sent to RCCG headquarters — think of it as money we're holding on their behalf. Once we send it, our true parish balance will be <strong>${fmt(availableParishFund)}</strong>.
    </div>

    ${availableParishFund<0?'<div class="note-box">⚠️ The parish is in a deficit position — outstanding remittances exceed available cash. Please review with the Parish Pastor.</div>':''}
    ${closingPettyFloat<0?'<div class="note-box">⚠️ Petty cash float is negative — the petty cash holder has spent more than the float. A reconciliation top-up is needed.</div>':''}

    ${(satFundsSummaryMR.inPeriod>0||satFundsSummaryMR.outPeriod>0||satFundsSummaryMR.transferOutPeriod>0||Math.abs(satFundsSummaryMR.heldAsOf)>=1)?`
    <div class="note-box" style="background:#eef0fb;border-color:#c7cdee;color:#33396b">
      <strong>Funds Received &amp; Remitted on Behalf of Satellite Parishes</strong> — In ${fmt(satFundsSummaryMR.inPeriod)} / Out ${fmt(satFundsSummaryMR.outPeriod)} / Held ${fmt(satFundsSummaryMR.heldAsOf)}
      <div style="font-size:11px;margin-top:4px;color:#555">Pass-through custodial funds for the satellite parishes' Province remittance and joint area/zone payments — excluded from Income, Expenses, and Net Position above.</div>
      ${satFundsSummaryMR.transferOutPeriod>0?`<div style="font-size:11px;margin-top:6px;color:#555">Transferred to parish this period: <strong>${fmt(satFundsSummaryMR.transferOutPeriod)}</strong>${satFundsSummaryMR.giftPeriod>0?` — Gift/surplus: ${fmt(satFundsSummaryMR.giftPeriod)} (counted as income above, see Section A)`:''}${satFundsSummaryMR.reimbursementPeriod>0?` — Reimbursement: ${fmt(satFundsSummaryMR.reimbursementPeriod)} (memo only, not income)`:''}${satFundsSummaryMR.correctionPeriod>0?` — Correction: ${fmt(satFundsSummaryMR.correctionPeriod)} (memo only, not income)`:''}</div>`:''}
    </div>`:''}

    ${reportSignatureHTML(pastorName, undefined, accountantName)}`;

  openPrintableReport('Monthly Financial Statement — '+periodLabel, body, { from:fromDate, to:toDate });
}

async function generateWeeklyReport(){
  const [allIncome, allExpenses, settings, allCashTx, remRatesData, users, allPettyWR] = await Promise.all([DB.getIncome(), DB.getExpenses(), DB.getSettings(), DB.getCashTransactions(), getRemRates(), DB.getUsers(), DB.getPetty()]);
  const pastorName=(users||[]).find(u=>u.role==='pastor')?.name||'';
  const accountantName=(users||[]).find(u=>u.role==='accountant')?.name||'';
  const remRates=remRatesData.rates||DEFAULT_REMITTANCE_RATES;
  const fromDate=state.reportFromDate||ymdLocal(new Date(state.year,state.month,1));
  const toDate=state.reportToDate||ymdLocal(new Date());
  const periodLabel=`${fmtDate(fromDate)} – ${fmtDate(toDate)}`;
  const income=filterByDateRange(allIncome,fromDate,toDate);

  // Build deposit map from cash_transactions
  const depositMap={};
  allCashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef).forEach(t=>{depositMap[t.incomeRef]=(depositMap[t.incomeRef]||0)+(t.amount||0)});
  const expCoveringMap=buildExpenseCoveringMap(allIncome, allCashTx, remRates, allExpenses, allPettyWR);
  function depositBadge(r){
    const cashHeld=getSundayCashWithAccountant(r,remRates);
    if(cashHeld===0) return '<span class="badge badge-info">No Cash</span>';
    const dep=depositMap[r.id]||0;
    const entry=expCoveringMap.get(r.id);
    if(dep>=cashHeld||entry?.isReconciled) return '<span class="badge badge-success">✓ Deposited</span>';
    if(dep>0) return `<span class="badge badge-warn">Partial</span>`;
    return '<span class="badge badge-warn">Pending</span>';
  }

  // Group by week
  const weeks={};
  income.forEach(r=>{
    const d=new Date(r.date||r.createdAt);
    const weekNum=Math.ceil(d.getDate()/7);
    if(!weeks[weekNum]) weeks[weekNum]={records:[],total:0};
    weeks[weekNum].records.push(r);
    weeks[weekNum].total+=(r.totalCollection||0);
  });

  const totalCollected=income.reduce((s,r)=>s+(r.totalCollection||0),0);
  const sundayRecs=income.filter(r=>!r.source||r.source==='sunday_collection');
  const weeklySundayCount=new Set(sundayRecs.map(r=>r.date)).size;
  const sundayCollected=sundayRecs.reduce((s,r)=>s+(r.totalCollection||0),0);
  const avgPerSunday=weeklySundayCount?Math.round(sundayCollected/weeklySundayCount):0;
  const deposited=income.filter(r=>{const c=getSundayCashWithAccountant(r,remRates);if(c===0) return true;const dep=depositMap[r.id]||0;return dep>=c||expCoveringMap.get(r.id)?.isReconciled;}).length;
  const pending=income.length-deposited;

  // Highest and lowest
  const highestRecord=income.length?income.reduce((a,b)=>(b.totalCollection||0)>(a.totalCollection||0)?b:a,income[0]):null;
  const lowestRecord=income.length>1?income.reduce((a,b)=>(b.totalCollection||0)<(a.totalCollection||0)?b:a,income[0]):null;

  const body=`
    ${reportHeaderHTML('Weekly Collection Summary Report', periodLabel, settings)}

    <div class="summary-grid">
      <div class="summary-box"><div class="label">Total Collections</div><div class="value green">${fmt(totalCollected)}</div></div>
      <div class="summary-box"><div class="label">No. of Sundays</div><div class="value blue">${weeklySundayCount}</div></div>
      <div class="summary-box"><div class="label">Average per Sunday</div><div class="value">${fmt(avgPerSunday)}</div></div>
      <div class="summary-box"><div class="label">Deposited</div><div class="value green">${deposited}</div></div>
      <div class="summary-box"><div class="label">Pending Deposit</div><div class="value ${pending>0?'amber':'green'}">${pending}</div></div>
      ${highestRecord?`<div class="summary-box"><div class="label">Highest Sunday</div><div class="value green">${fmt(highestRecord.totalCollection)}</div></div>`:''}
    </div>

    <div class="section-title">Detailed Weekly Breakdown</div>
    ${income.length?`<table>
      <tr><th>S/N</th><th>Date</th>${INCOME_TYPES.map(t=>`<th class="td-r">${t.label}</th>`).join('')}<th class="td-r">Total</th><th>Deposit Status</th></tr>
      ${income.map((r,i)=>`<tr><td>${i+1}</td><td>${fmtDate(r.date)}</td>${INCOME_TYPES.map(t=>`<td class="td-r">${r[t.key]?fmt(r[t.key]):'—'}</td>`).join('')}<td class="td-r td-bold">${fmt(r.totalCollection)}</td><td>${depositBadge(r)}</td></tr>`).join('')}
      <tr class="total-row"><td colspan="2">GRAND TOTAL</td>${INCOME_TYPES.map(t=>{const sum=income.reduce((s,r)=>s+(r[t.key]||0),0);return `<td class="td-r">${sum?fmt(sum):'—'}</td>`}).join('')}<td class="td-r">${fmt(totalCollected)}</td><td></td></tr>
    </table>`:'<div class="no-data">No Sunday collections recorded for this period.</div>'}

    ${Object.keys(weeks).length>1?`<div class="section-title">Summary by Week</div>
    <table>
      <tr><th>Week</th><th>Sundays</th><th class="td-r">Total Collected</th><th class="td-c">% of Month Total</th></tr>
      ${Object.entries(weeks).sort(([a],[b])=>a-b).map(([w,data])=>`<tr><td>Week ${w}</td><td>${data.records.map(r=>fmtDate(r.date)).join(', ')}</td><td class="td-r">${fmt(data.total)}</td><td class="td-c">${totalCollected?Math.round(data.total/totalCollected*100):0}%</td></tr>`).join('')}
      <tr class="total-row"><td colspan="2">TOTAL</td><td class="td-r">${fmt(totalCollected)}</td><td class="td-c">100%</td></tr>
    </table>`:''}

    ${pending>0?`<div class="note-box">⚠️ ${pending} collection record(s) still pending bank deposit. Please ensure all cash is deposited promptly and teller numbers recorded.</div>`:''}

    ${reportSignatureHTML(pastorName, undefined, accountantName)}`;

  openPrintableReport('Weekly Collection Summary — '+periodLabel, body);
}

function generateRemittanceReport(){ printRemittanceReport(state.reportFromDate, state.reportToDate); }

async function generateQuarterlyReport(){
  const [allIncome, allExpenses, settings, users] = await Promise.all([DB.getIncome(), DB.getExpenses(), DB.getSettings(), DB.getUsers()]);
  const pastorName=(users||[]).find(u=>u.role==='pastor')?.name||'';
  const accountantName=(users||[]).find(u=>u.role==='accountant')?.name||'';
  const quotaList=getQuotaList(settings);
  const quotasTotal=quotaList.reduce((s,q)=>s+(q.amount||0),0);
  const quarterData=[];
  let grandIncome=0, grandExp=0, grandRem=0, grandNet=0;

  for(let i=2;i>=0;i--){
    let m=state.month-i; let y=state.year; if(m<0){m+=12;y--;}
    const recs=allIncome.filter(r=>{const d=new Date(r.date||r.createdAt);return d.getMonth()===m&&d.getFullYear()===y});
    const exps=allExpenses.filter(r=>{const d=new Date(r.date||r.createdAt);return d.getMonth()===m&&d.getFullYear()===y&&r.status==='approved'});
    const total=recs.reduce((s,r)=>s+(r.totalCollection||0),0);
    const exp=exps.reduce((s,e)=>s+(e.amount||0),0);
    const rem=await calcRemittancesFromRecords(recs);
    const totalRemDue=totalRemittanceDue(rem, quotasTotal);
    const trueNetLocal=rem.netLocal-quotasTotal;
    const netSurplus=total-totalRemDue-exp;
    quarterData.push({month:MONTHS[m],year:y,income:total,expenses:exp,remittances:totalRemDue,netLocal:trueNetLocal,surplus:netSurplus,sundays:recs.length});
    grandIncome+=total; grandExp+=exp; grandRem+=totalRemDue; grandNet+=netSurplus;
  }

  // Trend analysis
  const trend=quarterData.length>=2?(quarterData[quarterData.length-1].income-quarterData[0].income):0;
  const trendPct=quarterData[0].income?Math.round(trend/quarterData[0].income*100):0;
  const avgMonthlyIncome=Math.round(grandIncome/3);
  const avgMonthlyExp=Math.round(grandExp/3);

  const periodLabel=`${quarterData[0].month} — ${quarterData[quarterData.length-1].month} ${quarterData[quarterData.length-1].year}`;

  const body=`
    ${reportHeaderHTML('Quarterly Financial Health Report', periodLabel, settings)}

    <div class="summary-grid">
      <div class="summary-box"><div class="label">Quarter Total Income</div><div class="value green">${fmt(grandIncome)}</div></div>
      <div class="summary-box"><div class="label">Quarter Total Expenses</div><div class="value red">${fmt(grandExp)}</div></div>
      <div class="summary-box"><div class="label">Quarter Remittances</div><div class="value red">${fmt(grandRem)}</div></div>
      <div class="summary-box"><div class="label">Net Surplus/(Deficit)</div><div class="value ${grandNet>=0?'green':'red'}">${fmt(grandNet)}</div></div>
      <div class="summary-box"><div class="label">Avg Monthly Income</div><div class="value">${fmt(avgMonthlyIncome)}</div></div>
      <div class="summary-box"><div class="label">Income Trend</div><div class="value ${trendPct>=0?'green':'red'}">${trendPct>=0?'+':''}${trendPct}%</div></div>
    </div>

    <div class="section-title">Monthly Comparison</div>
    <table>
      <tr><th>Month</th><th class="td-c">Sundays</th><th class="td-r">Total Income</th><th class="td-r">Remittances</th><th class="td-r">Expenses</th><th class="td-r">Net Surplus/(Deficit)</th></tr>
      ${quarterData.map(d=>`<tr><td>${d.month} ${d.year}</td><td class="td-c">${d.sundays}</td><td class="td-r td-green">${fmt(d.income)}</td><td class="td-r td-red">${fmt(d.remittances)}</td><td class="td-r td-amber">${fmt(d.expenses)}</td><td class="td-r td-bold ${d.surplus>=0?'td-green':'td-red'}">${fmt(d.surplus)}</td></tr>`).join('')}
      <tr class="total-row"><td>QUARTER TOTAL</td><td class="td-c">${quarterData.reduce((s,d)=>s+d.sundays,0)}</td><td class="td-r">${fmt(grandIncome)}</td><td class="td-r">${fmt(grandRem)}</td><td class="td-r">${fmt(grandExp)}</td><td class="td-r ${grandNet>=0?'td-green':'td-red'}">${fmt(grandNet)}</td></tr>
    </table>

    <div class="section-title">Breakdown: Income Allocation per Month</div>
    <table>
      <tr><th>Month</th><th class="td-r">Gross Income</th><th class="td-r">To RCCG HQ</th><th class="td-r">To Parish (Net Local)</th><th class="td-c">% Retained</th></tr>
      ${quarterData.map(d=>`<tr><td>${d.month} ${d.year}</td><td class="td-r">${fmt(d.income)}</td><td class="td-r td-red">${fmt(d.remittances)}</td><td class="td-r td-green">${fmt(d.netLocal)}</td><td class="td-c">${d.income?Math.round(d.netLocal/d.income*100):0}%</td></tr>`).join('')}
      <tr class="total-row"><td>TOTAL</td><td class="td-r">${fmt(grandIncome)}</td><td class="td-r">${fmt(grandRem)}</td><td class="td-r">${fmt(quarterData.reduce((s,d)=>s+d.netLocal,0))}</td><td class="td-c">${grandIncome?Math.round(quarterData.reduce((s,d)=>s+d.netLocal,0)/grandIncome*100):0}%</td></tr>
    </table>

    <div class="section-title">Financial Health Assessment</div>
    <table>
      <tr><td style="font-weight:600">Average Monthly Income</td><td class="td-r">${fmt(avgMonthlyIncome)}</td></tr>
      <tr><td style="font-weight:600">Average Monthly Expenditure</td><td class="td-r">${fmt(avgMonthlyExp)}</td></tr>
      <tr><td style="font-weight:600">Income Trend (Month 1 → Month 3)</td><td class="td-r ${trendPct>=0?'td-green':'td-red'}">${trendPct>=0?'↑ +':'↓ '}${Math.abs(trendPct)}%</td></tr>
      <tr><td style="font-weight:600">Overall Health Status</td><td class="td-r td-bold ${grandNet>=0?'td-green':'td-red'}">${grandNet>=0?'SURPLUS — Healthy':'DEFICIT — Needs Attention'}</td></tr>
    </table>
    ${grandNet<0?'<div class="note-box">⚠️ The parish has been running at a deficit over this quarter. It is recommended that the Admin Team reviews expenditure patterns and consider cost optimization measures.</div>':''}
    ${trendPct<-10?'<div class="note-box">⚠️ Income has declined by more than 10% over the quarter. This may require pastoral attention and congregation engagement.</div>':''}

    ${reportSignatureHTML(pastorName, undefined, accountantName)}`;

  openPrintableReport('Quarterly Health Report — '+periodLabel, body);
}

async function generateExpenseReport(){
  const [allExpenses, settings, users] = await Promise.all([DB.getExpenses(), DB.getSettings(), DB.getUsers()]);
  const pastorName=(users||[]).find(u=>u.role==='pastor')?.name||'';
  const accountantName=(users||[]).find(u=>u.role==='accountant')?.name||'';
  const fromDate=state.reportFromDate||ymdLocal(new Date(state.year,state.month,1));
  const toDate=state.reportToDate||ymdLocal(new Date());
  const periodLabel=`${fmtDate(fromDate)} – ${fmtDate(toDate)}`;
  const expenses=filterByDateRange(allExpenses,fromDate,toDate);
  const totalExpenses=expenses.reduce((s,e)=>s+(e.amount||0),0);

  // By category
  const byCat={};
  EXPENSE_CATS_ALL.forEach(c=>{byCat[c.key]={label:c.label,icon:c.icon,total:0,count:0,items:[]}});
  expenses.forEach(e=>{if(byCat[e.category]){byCat[e.category].total+=e.amount||0;byCat[e.category].count++;byCat[e.category].items.push(e)}});
  const sorted=Object.values(byCat).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);

  const withReceipt=expenses.filter(e=>e.receiptNo).length;

  const body=`
    ${reportHeaderHTML('Expense Report', periodLabel, settings)}

    <div class="summary-grid">
      <div class="summary-box"><div class="label">Total Expenditure</div><div class="value red">${fmt(totalExpenses)}</div></div>
      <div class="summary-box"><div class="label">No. of Entries</div><div class="value blue">${expenses.length}</div></div>
      <div class="summary-box"><div class="label">Categories Used</div><div class="value">${sorted.length}</div></div>
      <div class="summary-box"><div class="label">With Receipts</div><div class="value green">${withReceipt}/${expenses.length}</div></div>
    </div>

    <div class="section-title">Summary by Category</div>
    ${sorted.length?`<table>
      <tr><th>S/N</th><th>Category</th><th class="td-c">No. of Items</th><th class="td-r">Amount (₦)</th><th class="td-c">% of Total</th></tr>
      ${sorted.map((c,i)=>`<tr><td>${i+1}</td><td>${c.icon} ${c.label}</td><td class="td-c">${c.count}</td><td class="td-r td-bold">${fmt(c.total)}</td><td class="td-c">${Math.round(c.total/totalExpenses*100)}%</td></tr>`).join('')}
      <tr class="total-row"><td colspan="2">GRAND TOTAL</td><td class="td-c">${sorted.reduce((s,c)=>s+c.count,0)}</td><td class="td-r">${fmt(totalExpenses)}</td><td class="td-c">100%</td></tr>
    </table>`:'<div class="no-data">No expenses recorded.</div>'}

    <div class="section-title">Detailed Line Items (All Expenses)</div>
    ${expenses.length?`<table>
      <tr><th>S/N</th><th>Date</th><th>Category</th><th>Sub-category</th><th>Description</th><th>Method</th><th>Status</th><th>Receipt No.</th><th>Recorded By</th><th class="td-r">Amount (₦)</th></tr>
      ${expenses.map((e,i)=>{const cat=EXPENSE_CATS_ALL.find(c=>c.key===e.category)||{label:e.category||'—'};const mL=e.paymentMethod==='bank_transfer'?'Bank Transfer':e.paymentMethod==='petty_cash'?'Petty Cash':e.paymentMethod==='split'?`Split (${[(e.bankAmount||0)>0?`Bank:${fmt(e.bankAmount)}`:'',(e.cashAmount||0)>0?`Cash:${fmt(e.cashAmount)}`:'',(e.pettyAmount||0)>0?`Petty:${fmt(e.pettyAmount)}`:''].filter(Boolean).join('+')})`:'Cash';const sb=e.status==='rejected'?'<span class="badge badge-danger">Rejected</span>':'<span class="badge badge-success">Logged</span>';const desc=e.description&&e.description.trim()&&e.description.trim()!==e.subCategory?esc(e.description):'—';return `<tr><td>${i+1}</td><td>${fmtDate(e.date||e.createdAt)}</td><td>${cat.label}</td><td>${esc(e.subCategory||'—')}</td><td>${desc}</td><td>${mL}</td><td>${sb}</td><td>${e.receiptNo||'—'}</td><td>${esc(e.recordedBy||e.createdByName||'—')}</td><td class="td-r">${fmt(e.amount)}</td></tr>`}).join('')}
      <tr class="total-row"><td colspan="9">TOTAL EXPENDITURE</td><td class="td-r">${fmt(totalExpenses)}</td></tr>
    </table>`:'<div class="no-data">No expenses recorded for this period.</div>'}

    ${withReceipt<expenses.length&&expenses.length>0?`<div class="note-box">⚠️ ${expenses.length-withReceipt} expense(s) do not have a receipt number attached. All expenditure should be supported by proper documentation.</div>`:''}

    ${reportSignatureHTML(pastorName, undefined, accountantName)}`;

  openPrintableReport('Expense Report — '+periodLabel, body);
}

async function generatePettyCashReport(){
  const [pettyHistory, pettyConfig, settings, users] = await Promise.all([DB.getPetty(), DB.getPettyConfig(), DB.getSettings(), DB.getUsers()]);
  const pastorName=(users||[]).find(u=>u.role==='pastor')?.name||'';
  const accountantName=(users||[]).find(u=>u.role==='accountant')?.name||'';
  const fromDate=state.reportFromDate||ymdLocal(new Date(state.year,state.month,1));
  const toDate=state.reportToDate||ymdLocal(new Date());
  const periodLabel=`${fmtDate(fromDate)} – ${fmtDate(toDate)}`;
  const history=(pettyHistory||[]).filter(h=>{const d=ymdLocal(new Date(h.createdAt||h.date||0));return d>=fromDate&&d<=toDate});
  const disbursements=history.filter(h=>h.type!=='refill'&&(h.status==='approved'||h.status==='settled'));
  const disbursed=disbursements.reduce((s,h)=>s+(h.actualAmount||h.amount||0),0);
  const settled=history.filter(h=>h.status==='settled'&&h.type!=='refill').reduce((s,h)=>s+(h.actualAmount||h.amount||0),0);
  const refills=history.filter(h=>h.type==='refill');
  const refilled=refills.reduce((s,h)=>s+(h.amount||0),0);
  const unaccounted=disbursed-settled;
  const rejected=history.filter(h=>h.status==='rejected').length;
  const pendingCount=history.filter(h=>h.status==='pending'||h.status==='pending_approval').length;

  const body=`
    ${reportHeaderHTML('Petty Cash Reconciliation Report', periodLabel, settings)}

    <div class="summary-grid">
      <div class="summary-box"><div class="label">Approved Float</div><div class="value blue">${fmt(pettyConfig.float||0)}</div></div>
      <div class="summary-box"><div class="label">Disbursed This Period</div><div class="value red">${fmt(disbursed)}</div></div>
      <div class="summary-box"><div class="label">Receipts Accounted</div><div class="value green">${fmt(settled)}</div></div>
      <div class="summary-box"><div class="label">Unaccounted</div><div class="value ${unaccounted>0?'amber':'green'}">${fmt(unaccounted)}</div></div>
      <div class="summary-box"><div class="label">Refills This Period</div><div class="value blue">${fmt(refilled)}</div></div>
      <div class="summary-box"><div class="label">Total Transactions</div><div class="value">${history.length}</div></div>
    </div>

    ${unaccounted>0?`<div class="note-box">⚠️ ${fmt(unaccounted)} has been disbursed but not yet accounted for with receipts. The Admin Officer should follow up and submit receipts within 48 hours of each disbursement.</div>`:''}

    <div class="section-title">Imprest Account Status</div>
    <table>
      <tr><td style="font-weight:600">Approved Float Amount</td><td class="td-r">${fmt(pettyConfig.float||0)}</td></tr>
      <tr><td style="font-weight:600">Total Disbursed (Approved + Settled)</td><td class="td-r td-red">− ${fmt(disbursed)}</td></tr>
      <tr><td style="font-weight:600">Total Refilled</td><td class="td-r td-green">+ ${fmt(refilled)}</td></tr>
      <tr><td style="font-weight:600">Receipts Submitted &amp; Settled</td><td class="td-r td-green">${fmt(settled)}</td></tr>
      <tr><td style="font-weight:600">Pending Receipt Submission</td><td class="td-r ${unaccounted>0?'td-amber':'td-green'}">${fmt(unaccounted)}</td></tr>
      ${rejected>0?`<tr><td style="font-weight:600">Rejected Requests</td><td class="td-r td-red">${rejected}</td></tr>`:''}
      ${pendingCount>0?`<tr><td style="font-weight:600">Awaiting Approval</td><td class="td-r td-amber">${pendingCount}</td></tr>`:''}
      <tr class="total-row"><td style="font-weight:700">Current Float Balance (Live)</td><td class="td-r td-bold ${(pettyConfig.float||0)<0?'td-red':'td-green'}">${fmt(pettyConfig.float||0)}</td></tr>
      <tr style="background:#e8f4f0"><td colspan="2" style="font-size:11px;color:#0F6E56">Reconciliation: Opening Float (${fmt((pettyConfig.float||0)+disbursed-refilled)}) + Refills (${fmt(refilled)}) − Disbursements (${fmt(disbursed)}) = Closing Balance (${fmt(pettyConfig.float||0)})</td></tr>
    </table>

    <div class="section-title">Transaction Details</div>
    ${history.length?`<table>
      <tr><th>S/N</th><th>Date</th><th>Type</th><th>Purpose</th><th>Method</th><th>Requested By</th><th>Approved By</th><th>Status</th><th class="td-r">Approved (₦)</th><th class="td-r">Actual (₦)</th><th>Receipt</th></tr>
      ${history.map((h,i)=>`<tr>
        <td>${i+1}</td>
        <td>${fmtDate(h.createdAt)}</td>
        <td>${h.type==='refill'?'<span class="badge badge-info">Refill</span>':h.type==='advance'?'<span class="badge badge-warn">Advance</span>':'<span class="badge badge-success">Direct</span>'}</td>
        <td>${h.type==='refill'?'Cash Top-Up / Refill':esc(h.purpose||'—')}</td>
        <td style="font-size:11px">${h.type==='refill'?txMethodLabel(h.paymentMethod||h.source):'—'}</td>
        <td>${esc(h.requestedBy||'—')}</td>
        <td>${esc(h.approvedBy||h.authorizedBy||'—')}</td>
        <td>${h.status==='settled'?'<span class="badge badge-success">Settled</span>':h.status==='approved'?'<span class="badge badge-info">Approved</span>':h.status==='rejected'?'<span class="badge badge-danger">Rejected</span>':'<span class="badge badge-warn">Pending</span>'}</td>
        <td class="td-r">${fmt(h.amount)}</td>
        <td class="td-r td-bold">${h.actualAmount!=null?fmt(h.actualAmount):h.status==='settled'?fmt(h.amount):'—'}</td>
        <td>${h.receiptNo||'—'}</td>
      </tr>`).join('')}
      <tr class="total-row">
        <td colspan="8">TOTALS</td>
        <td class="td-r">${fmt(history.filter(h=>h.type!=='refill').reduce((s,h)=>s+(h.amount||0),0))}</td>
        <td class="td-r">${fmt(settled)}</td>
        <td>${history.filter(h=>h.receiptNo).length} receipt(s)</td>
      </tr>
    </table>`:'<div class="no-data">No petty cash transactions for this period.</div>'}

    ${reportSignatureHTML(pastorName, 'Confirmed by (Admin Officer):', accountantName)}`;

  openPrintableReport('Petty Cash Report — '+periodLabel, body);
}

// ── AUDIT LOG ─────────────────────────────
async function renderAudit(){
  const log=(await DB.getAudit()).slice(0,100);
  document.getElementById('pageContent').innerHTML=`
    <div class="page-header"><div class="page-title">Audit Log</div><div class="page-sub">Last 100 actions in the system</div></div>
    <div class="card"><div class="table-wrap"><table>
      <tr><th>Time</th><th>Action</th><th>Details</th><th>User</th></tr>
      ${log.length?log.map(l=>`<tr><td class="td-muted" style="white-space:nowrap">${fmtDate(l.ts)} ${fmtTime(l.ts)}</td><td><span class="badge badge-gray">${esc(l.type?.replace(/_/g,' '))}</span></td><td>${esc(l.detail)}</td><td class="td-muted">${esc(l.by||'—')}</td></tr>`).join(''):'<tr><td colspan="4" class="empty-table">No audit entries yet.</td></tr>'}
    </table></div></div>`;
}

// ── IT ADMIN ──────────────────────────────
async function renderAdmin(){
  if(state.user?.role!=='it_admin'){ document.getElementById('pageContent').innerHTML='<div class="card"><p style="color:var(--danger)">Access denied. IT Administrators only.</p></div>'; return }
  // Show loading skeleton immediately
  document.getElementById('pageContent').innerHTML='<div class="card"><p style="color:var(--text3)">Loading admin panel…</p></div>';
  // Sync tab state from URL hash (e.g. #admin-settings → 'settings')
  const hashTab = (window.location.hash||'').replace(/^#admin-/,'').trim();
  if(hashTab && ['users','settings','quotas','rates','perms','backup'].includes(hashTab)){
    state.adminTab = hashTab;
  }
  const [users, settings, auditLog, pettyConfig] = await Promise.all([
    DB.getUsers(),
    DB.getSettings(),
    DB.getAudit(),
    DB.getPettyConfig()
  ]);
  const settingsForView = { ...settings, pettyMax: pettyConfig?.max ?? settings.pettyMax, pettyFloat: pettyConfig?.float ?? 0 };
  const tab=state.adminTab||'users';

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header"><div class="page-title">IT Admin Panel</div><div class="page-sub">System management — full access</div></div>
    <div class="admin-grid" style="margin-bottom:1rem">
      <div class="admin-stat"><div class="admin-stat-val">${users.length}</div><div class="admin-stat-label">Total Users</div></div>
      <div class="admin-stat"><div class="admin-stat-val">${(await DB.getIncome()).length}</div><div class="admin-stat-label">Income Records</div></div>
      <div class="admin-stat"><div class="admin-stat-val">${auditLog.length}</div><div class="admin-stat-label">Audit Events</div></div>
    </div>
    <div class="tabs">
      <button class="tab ${tab==='users'?'active':''}" onclick="App.setAdminTab('users')">Users & Roles</button>
      <button class="tab ${tab==='settings'?'active':''}" onclick="App.setAdminTab('settings')">Church Settings</button>
      <button class="tab ${tab==='quotas'?'active':''}" onclick="App.setAdminTab('quotas')">Monthly Quotas</button>
      <button class="tab ${tab==='rates'?'active':''}" onclick="App.setAdminTab('rates')">Remittance Rates</button>
      <button class="tab ${tab==='perms'?'active':''}" onclick="App.setAdminTab('perms')">Role Permissions</button>
      <button class="tab ${tab==='backup'?'active':''}" onclick="App.setAdminTab('backup')">Backup & Restore</button>
    </div>
    ${tab==='users'?renderAdminUsers(users):tab==='settings'?renderAdminSettings(settingsForView):tab==='quotas'?renderAdminQuotas(settings):tab==='rates'?renderAdminRates(settings):tab==='perms'?renderAdminPerms(settings):renderAdminBackup()}`;
  if(tab==='quotas') initQuotaDnd();
}

function setAdminTab(t){
  state.adminTab=t;
  history.replaceState(null, '', '#admin-'+t);
  renderAdmin();
}

function setAdminUserSearch(q){ state.adminUserSearch=q; renderAdmin(); }

function renderAdminUsers(users){
  const q = (state.adminUserSearch||'').toLowerCase();
  const filtered = q ? users.filter(u=>u.name.toLowerCase().includes(q)||(u.role||'').toLowerCase().includes(q)||(u.email||'').toLowerCase().includes(q)) : users;
  function permSummary(role){
    const rp = state.rolePermissions?.[role];
    const perms = rp || PERMISSIONS[role] || [];
    if(role === 'it_admin' || perms.includes('all')) return '<span class="badge" style="background:#EEEDFE;color:#534AB7">Full Access</span>';
    const labels = PERMISSION_DEFS.filter(d=>perms.includes(d.key)).map(d=>`<span class="badge" style="background:#f0f0f0;color:#444;font-size:10px;margin:1px">${d.label}</span>`);
    return labels.length ? labels.join(' ') : '<span style="color:var(--text3);font-size:12px">No permissions</span>';
  }
  return `<div class="card">
    <div class="card-header"><span class="card-title">User Accounts</span><button class="btn btn-primary btn-sm" onclick="App.showAddUser()">+ Add User</button></div>
    <div style="margin-bottom:10px"><input type="search" class="form-input" placeholder="Search by name, role or email…" value="${esc(state.adminUserSearch||'')}" oninput="App.setAdminUserSearch(this.value)" style="max-width:320px" /></div>
    <div class="table-wrap"><table>
      <tr><th>Name</th><th>Role</th><th>Access / Permissions</th><th>Email</th><th>Actions</th></tr>
      ${filtered.map(u=>{const r=ROLES[u.role]||{}; return`<tr>
        <td><strong>${u.name}</strong></td>
        <td><span class="badge" style="background:${r.bg};color:${r.color}">${r.label||u.role}</span></td>
        <td style="max-width:260px;white-space:normal;line-height:1.6">${permSummary(u.role)}</td>
        <td class="td-muted">${u.email||'—'}</td>
        <td><button class="btn btn-sm" onclick="App.editUser('${u.id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="App.deleteUser('${u.id}', this)" style="margin-left:4px">Delete</button></td>
      </tr>`}).join('')}
      ${filtered.length===0?`<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:16px">No users match your search.</td></tr>`:''}
    </table></div></div>`;
}

function renderAdminSettings(s){
  const floatColor = s.pettyFloat < 0 ? 'var(--danger)' : 'var(--success)';
  return `<div class="card">
    <div class="modal-title" style="font-size:15px;margin-bottom:1rem">Church Information</div>
    <input type="hidden" id="set_petty_float_current" value="${s.pettyFloat}" />
    <div class="form-group"><label class="form-label">Church Name</label><input type="text" id="set_name" class="form-input" value="${s.churchName||''}" /></div>
    <div class="form-group"><label class="form-label">Bank Name</label><input type="text" id="set_bank" class="form-input" value="${s.bankName||''}" /></div>
    <div class="form-group"><label class="form-label">Account Number</label><input type="text" id="set_acct" class="form-input" value="${s.accountNo||''}" /></div>
    <div class="form-group"><label class="form-label">Petty Cash Max Float (₦)</label><input type="number" id="set_petty" class="form-input" value="${s.pettyMax||50000}" /></div>
    <div style="margin-top:18px;margin-bottom:8px;font-size:13px;font-weight:700;color:var(--text2);border-top:1px solid var(--border);padding-top:14px">Available Balance Status Thresholds</div>
    <p style="font-size:12px;color:var(--text3);margin-bottom:12px">Set the petty cash sustainability thresholds shown on the Dashboard. These control the health indicator on the "Available Fund After All Deductions" card.</p>
    <div class="form-group"><label class="form-label">Target Float (₦)</label><input type="number" id="set_petty_target_float" class="form-input" value="${s.pettyTargetFloat||90000}" /><div class="form-hint">Ideal petty cash balance for next period. Default: ₦90,000.</div></div>
    <div class="form-group"><label class="form-label">Manageable Float (₦)</label><input type="number" id="set_petty_manageable_float" class="form-input" value="${s.pettyManageableFloat||60000}" /><div class="form-hint">Acceptable minimum if target isn't possible. Default: ₦60,000.</div></div>
    <div class="form-group"><label class="form-label">Minimum Float (₦)</label><input type="number" id="set_petty_minimum_float" class="form-input" value="${s.pettyMinimumFloat||40000}" /><div class="form-hint">Absolute floor — below this is Critical. Default: ₦40,000.</div></div>
    <div class="form-group"><label class="form-label">Buffer Above Target (₦)</label><input type="number" id="set_petty_buffer_amount" class="form-input" value="${s.pettyBufferAmount||30000}" /><div class="form-hint">Cushion above target to stay "Healthy" instead of "Adequate". Default: ₦30,000.</div></div>
    </div>
    <button class="btn btn-primary" onclick="App.saveSettings(this)">Save Settings</button>
  </div>
  ${renderBankEmailAutomationSettings(s)}
  <div class="card" style="margin-top:16px;border:1.5px solid var(--border)">
    <div class="modal-title" style="font-size:15px;margin-bottom:4px">🔧 Petty Float Override</div>
    <p style="font-size:12px;color:var(--text3);margin-bottom:12px">Use this to correct the petty cash float when a deletion or data error has left it at the wrong value. A negative number means the church owes the Admin Officer that amount.</p>
    <div style="background:var(--bg);border-radius:8px;padding:10px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:12px;color:var(--text2)">Current float</span>
      <span style="font-weight:700;font-size:15px;color:${floatColor}">${s.pettyFloat<0?'−'+fmt(Math.abs(s.pettyFloat)):fmt(s.pettyFloat)}${s.pettyFloat<0?' (Owes Admin Officer)':''}</span>
    </div>
    <div class="form-group">
      <label class="form-label">Set Float To (₦) — use negative to indicate church owes Admin Officer</label>
      <input type="number" id="override_petty_float" class="form-input" value="${s.pettyFloat}" step="0.01" placeholder="e.g. -5000" />
      <div class="form-hint">Example: enter <strong>-5000</strong> if the Admin Officer is owed ₦5,000. Enter <strong>0</strong> to clear. Enter a positive number if cash is on hand.</div>
    </div>
    <button class="btn btn-danger" onclick="App.confirmPettyFloatOverride(this)">Override Float (requires PIN)</button>
  </div>`;
}

function renderBankEmailAutomationSettings(s){
  // The server no longer sends raw key values (only a configured/not flag) —
  // see getSettings() in functions/api/[[route]].js.
  const deepseekOk = !!s.ai_deepseek_key_set;
  const openaiOk = !!s.ai_openai_key_set;
  return `<div class="card" style="margin-top:16px">
    <div class="modal-title" style="font-size:15px;margin-bottom:4px">🤖 Bank Charge Email Automation</div>
    <p style="font-size:12px;color:var(--text3);margin-bottom:12px">Automatically records bank-imposed charges (SMS alert fees, maintenance fees, COT, stamp duty, etc.) from the church's bank alert emails as Bank Charges expenses — no manual entry needed. See the setup guide for connecting the accountant's inbox via Make.com.</p>
    <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <span class="badge ${deepseekOk?'badge-success':'badge-danger'}">${deepseekOk?'✓':'✗'} DeepSeek key</span>
      <span class="badge ${openaiOk?'badge-success':'badge-danger'}">${openaiOk?'✓':'✗'} OpenAI key (fallback)</span>
    </div>
    ${!deepseekOk?`<div class="alert alert-warn" style="margin-bottom:12px"><span class="alert-icon">⚠</span><span>No DeepSeek key configured yet — add one under KPSC → Settings → AI Provider Keys (the key is shared across the whole portal, so it only needs to be entered once).</span></div>`:''}
    <div class="form-group">
      <label class="form-label">Church Bank Account Number(s)</label>
      <input type="text" id="set_church_bank_account" class="form-input" value="${esc(s.church_bank_account_number||'')}" placeholder="e.g. 147******487" />
      <div class="form-hint">Enter the masked account number exactly as it appears in the bank's own alert emails (comma-separate if more than one). Alerts from any other account number are always ignored, never recorded.</div>
    </div>
    <button class="btn btn-primary" onclick="App.saveBankEmailAutomationSettings(this)">Save Automation Settings</button>
  </div>`;
}

async function saveBankEmailAutomationSettings(btn=null){
  if(!requireAdmin()) return;
  const s = await DB.getSettings();
  s.church_bank_account_number = document.getElementById('set_church_bank_account')?.value?.trim() || '';
  const restore = setBtnLoading(btn, 'Saving…');
  try {
    await DB.saveSettings(s);
    DB.addAudit('bank_email_automation_updated','Bank charge email automation settings updated',state.user?.name);
    showAlert('Automation settings saved.','success');
    restore();
  } catch(err) {
    restore();
    showAlert(`Failed to save: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

function renderAdminQuotas(s){
  const list=getQuotaList(s);
  const rows=list.map((q)=>`
    <div class="quota-row" draggable="true">
      <span class="dnd-handle" title="Drag to reorder">⠿</span>
      <div style="flex:2"><label class="form-label">Label</label><input type="text" class="form-input" value="${esc(q.label)}" placeholder="e.g. Building Fund" /></div>
      <div style="flex:1"><label class="form-label">Amount (₦)</label><input type="number" class="form-input" value="${q.amount||0}" min="0" /></div>
      <button class="btn" style="padding:8px 10px;color:var(--danger);flex-shrink:0" onclick="App.removeQuotaRow(this)" title="Remove">✕</button>
    </div>`).join('');
  return `<div class="card">
    <div class="modal-title" style="font-size:15px;margin-bottom:8px">Monthly Fixed Quotas</div>
    <p style="font-size:12px;color:var(--text3);margin-bottom:1rem">These flat amounts are remitted monthly regardless of income fluctuations. They are included in the bulk remittance payment each month.</p>
    <div class="alert alert-info" style="margin-bottom:10px"><span class="alert-icon">ℹ</span><span>Drag items using the ⠿ handle to reorder, then click <strong>Save Quotas</strong> to apply changes.</span></div>
    <div id="quota-rows-container">${rows}</div>
    <button class="btn" style="margin-top:4px;margin-bottom:12px" onclick="App.addQuotaRow()">➕ Add Quota</button><br/>
    <button class="btn btn-primary" onclick="App.saveQuotas(this)">Save Quotas</button>
  </div>`;
}

function renderAdminRates(s){
  const r = s.remittanceRates || DEFAULT_REMITTANCE_RATES;
  const isCustom = !!s.remittanceRates;
  const ratesBadge = isCustom
    ? `<span class="badge" style="background:#E6F1FB;color:#185FA5;margin-left:8px">Custom Rates</span>`
    : `<span class="badge" style="background:#f0f0f0;color:#444;margin-left:8px">Default RCCG Rates</span>`;
  const decToPct = v => +(((v??0)*100).toFixed(4));
  const rateInput = (id, val) =>
    `<input type="number" id="${id}" class="form-input" value="${decToPct(val)}" min="0" max="100" step="0.1" style="width:80px;display:inline-block" /> %`;
  const rateInputFine = (id, val) =>
    `<input type="number" id="${id}" class="form-input" value="${decToPct(val)}" min="0" max="100" step="0.01" style="width:90px;display:inline-block" /> %`;
  return `<div class="card">
    <div class="modal-title" style="font-size:15px;margin-bottom:8px">Remittance Percentage Rates ${ratesBadge}</div>
    <p style="font-size:12px;color:var(--text3);margin-bottom:1rem">Configure what percentage of each income type goes to National HQ and what stays local. National + Local should sum to 100%. Changes take effect immediately for all new calculations.</p>
    <div class="table-wrap"><table>
      <tr><th>Income Type</th><th>→ National HQ %</th><th style="color:var(--text3)">→ Local Retained</th></tr>
      ${INCOME_TYPES.filter(t=>!t.special).map(t=>{
        const rd = r[t.key] || DEFAULT_REMITTANCE_RATES[t.key] || { natl:0, local:0 };
        const localPct = decToPct(rd.local);
        return `<tr><td>${t.label}</td>
          <td><input type="number" id="rate_${t.key}_natl" class="form-input" value="${decToPct(rd.natl)}" min="0" max="100" step="0.1" style="width:80px;display:inline-block"
            oninput="(function(el){var l=document.getElementById('localLbl_${t.key}');if(l){var v=parseFloat(el.value)||0;l.textContent=(Math.round((100-v)*10)/10)+'%';}})(this)" /> %</td>
          <td><span id="localLbl_${t.key}" style="color:var(--text3);font-size:13px">${localPct}%</span></td></tr>`;
      }).join('')}
    </table></div>
    <hr class="divider">
    <div class="modal-title" style="font-size:13px;margin-bottom:8px;color:var(--text2)">Thanksgiving (TG) Split</div>
    <div class="table-wrap"><table>
      <tr><th>Recipient</th><th>Percentage</th></tr>
      <tr><td>TG → National HQ</td><td>${rateInput('rate_tgNational', r.tgNational ?? DEFAULT_REMITTANCE_RATES.tgNational)}</td></tr>
      <tr><td>TG → Area</td><td>${rateInput('rate_tgArea', r.tgArea ?? DEFAULT_REMITTANCE_RATES.tgArea)}</td></tr>
      <tr><td>TG → Parish Pastor's Share</td><td>${rateInput('rate_tgPastor', r.tgPastor ?? DEFAULT_REMITTANCE_RATES.tgPastor)}</td></tr>
      <tr><td>TG → Ministers' Share</td><td>${rateInput('rate_tgMinisters', r.tgMinisters ?? DEFAULT_REMITTANCE_RATES.tgMinisters)}</td></tr>
      <tr><td>TG → Seed (Remitted to National HQ)</td><td>${rateInput('rate_tgSeed', r.tgSeed ?? DEFAULT_REMITTANCE_RATES.tgSeed)}</td></tr>
    </table></div>
    <hr class="divider">
    <div class="form-row" style="align-items:center;gap:12px">
      <label class="form-label" style="margin:0;flex:1">Province Rebate — % of Local Retained Tithes (Members' + Ministers' only):</label>
      ${rateInput('rate_provinceRebate', r.provinceRebate ?? DEFAULT_REMITTANCE_RATES.provinceRebate)}
    </div>
    <hr class="divider">
    <div class="modal-title" style="font-size:13px;margin-bottom:8px;color:var(--text2)">Additional RCCG Levies</div>
    <p style="font-size:12px;color:var(--text3);margin-bottom:10px">These are computed from the raw collection totals and appear as separate lines in Part A of the remittance report.</p>
    <div class="table-wrap"><table>
      <tr><th>Levy</th><th>Basis</th><th>Rate %</th></tr>
      <tr><td>CRM Add-on → National HQ</td><td style="font-size:11px;color:var(--text3)">% of total CRM collection</td><td>${rateInput('rate_crmAddon', r.crmAddon ?? DEFAULT_REMITTANCE_RATES.crmAddon)}</td></tr>
      <tr><td>Coastline Worship Centre</td><td style="font-size:11px;color:var(--text3)">% of Ministers' Tithe total</td><td>${rateInputFine('rate_coastline', r.coastline ?? DEFAULT_REMITTANCE_RATES.coastline)}</td></tr>
      <tr><td>Insurance Fund (GEN TITHE)</td><td style="font-size:11px;color:var(--text3)">% of Members' Tithe total</td><td>${rateInputFine('rate_insuranceGenTithe', r.insuranceGenTithe ?? DEFAULT_REMITTANCE_RATES.insuranceGenTithe)}</td></tr>
      <tr><td>Insurance Fund (MIN TITHE)</td><td style="font-size:11px;color:var(--text3)">% of Ministers' Tithe total</td><td>${rateInputFine('rate_insuranceMinTithe', r.insuranceMinTithe ?? DEFAULT_REMITTANCE_RATES.insuranceMinTithe)}</td></tr>
    </table></div>
    <br>
    <button class="btn btn-primary" onclick="App.saveRates(this)">Save Remittance Rates</button>
  </div>`;
}

async function saveRates(btn=null){
  if(!requireAdmin()) return;
  const s = await DB.getSettings();
  const r = s.remittanceRates || {};
  const pct2dec = id => { const el=document.getElementById(id); return el ? parseFloat(el.value||0)/100 : null; };
  const badRows = [];
  INCOME_TYPES.filter(t=>!t.special).forEach(t=>{
    if(!r[t.key]) r[t.key]={};
    const natl = pct2dec(`rate_${t.key}_natl`);
    if(natl!==null){
      if(natl < 0 || natl > 1){ badRows.push(`${t.label} (${Math.round(natl*100)}% — must be 0–100%)`); return; }
      r[t.key].natl = natl;
      r[t.key].local = Math.round((1 - natl) * 10000) / 10000;
    }
  });
  if(badRows.length){
    showAlert(`National HQ % out of range for: ${badRows.join(', ')}. Please correct before saving.`,'danger');
    return;
  }
  ['tgNational','tgArea','tgPastor','tgMinisters','tgSeed','provinceRebate','crmAddon','coastline','insuranceGenTithe','insuranceMinTithe'].forEach(k=>{
    const v = pct2dec(`rate_${k}`);
    if(v!==null) r[k] = v;
  });
  // Validate TG split sums to 100%
  const tgKeys = ['tgNational','tgArea','tgPastor','tgMinisters','tgSeed'];
  const tgSum = tgKeys.reduce((sum,k)=>sum+(r[k]??0),0);
  if(Math.abs(tgSum-1) > TG_SUM_TOLERANCE){
    showAlert(`Thanksgiving (TG) split percentages must sum to 100% (currently ${Math.round(tgSum*1000)/10}%). Please correct before saving.`,'danger');
    return;
  }
  s.remittanceRates = r;
  const restore = setBtnLoading(btn, 'Saving…');
  try {
    await DB.saveSettings(s);
    DB.addAudit('rates_updated','Remittance rates updated',state.user?.name);
    showAlert('Remittance rates updated successfully!','success');
    restore();
  } catch(err) {
    restore();
    showAlert(`Failed to save rates: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

function renderAdminPerms(s){
  const savedPerms = s.rolePermissions || {};
  const groups = [...new Set(PERMISSION_DEFS.map(d=>d.group))];
  const editableRoles = Object.keys(ROLES).filter(r=>r!=='it_admin');

  const colHeaders = editableRoles.map(r=>{
    const ro=ROLES[r];
    return `<th style="text-align:center;min-width:90px"><span class="badge" style="background:${ro.bg};color:${ro.color};white-space:normal;line-height:1.3">${ro.label}</span></th>`;
  }).join('');

  const rows = groups.map(g=>{
    const defs = PERMISSION_DEFS.filter(d=>d.group===g);
    const groupHeader = `<tr><td colspan="${editableRoles.length+1}" style="padding:6px 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text3);background:var(--surface)">${g}</td></tr>`;
    const permRows = defs.map(d=>{
      const cells = editableRoles.map(r=>{
        const rp = savedPerms[r] || PERMISSIONS[r] || [];
        const checked = rp.includes(d.key) ? 'checked' : '';
        return `<td style="text-align:center"><input type="checkbox" id="perm_${r}_${d.key}" ${checked} style="width:16px;height:16px;cursor:pointer" /></td>`;
      }).join('');
      return `<tr><td style="padding:7px 8px;font-size:13px">${d.label}</td>${cells}</tr>`;
    }).join('');
    return groupHeader + permRows;
  }).join('');

  return `<div class="card">
    <div class="modal-title" style="font-size:15px;margin-bottom:8px">Role Permissions</div>
    <p style="font-size:12px;color:var(--text3);margin-bottom:1rem">Control which features each role can access. <strong>IT Administrator</strong> always has full access and cannot be restricted here. Changes take effect immediately — no logout required.</p>
    <div class="table-wrap"><table>
      <tr><th>Permission</th>${colHeaders}</tr>
      ${rows}
    </table></div>
    <br>
    <button class="btn btn-primary" onclick="App.saveRolePermissions(this)">Save Permissions</button>
    <button class="btn" style="margin-left:8px" onclick="App.resetRolePermissions()">Reset to Defaults</button>
  </div>`;
}

async function saveRolePermissions(btn=null){
  if(!requireAdmin()) return;
  const s = await DB.getSettings();
  const saved = {};
  Object.keys(ROLES).filter(r=>r!=='it_admin').forEach(r=>{
    saved[r] = PERMISSION_DEFS.map(d=>d.key).filter(k=>document.getElementById(`perm_${r}_${k}`)?.checked);
  });
  s.rolePermissions = saved;
  const restore = setBtnLoading(btn, 'Saving…');
  try {
    await DB.saveSettings(s);
    state.rolePermissions = saved;
    DB.addAudit('perms_updated','Role permissions updated',state.user?.name);
    showAlert('Role permissions saved! Changes apply immediately for all users.','success');
    renderAdmin();
  } catch(err) {
    restore();
    showAlert(`Failed to save permissions: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

async function resetRolePermissions(){
  if(!requireAdmin()) return;
  const word = prompt('Type RESET to restore all role permissions to factory defaults:');
  if(word !== 'RESET'){ if(word !== null) showAlert('Cancelled — you must type RESET exactly.','danger'); return; }
  const s = await DB.getSettings();
  delete s.rolePermissions;
  await DB.saveSettings(s);
  state.rolePermissions = null;
  DB.addAudit('perms_reset','Role permissions reset to defaults',state.user?.name);
  showAlert('Permissions reset to defaults.','success');
  renderAdmin();
}

function renderAdminBackup(){
  return `<div class="card">
    <div class="card-header"><span class="card-title">Data Backup & Restore</span></div>
    <p style="font-size:13px;color:var(--text2);margin-bottom:1rem">Export all church financial data as a JSON backup file. Store it securely.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="App.exportData(this)">⬇ Export Backup</button>
      <button class="btn" onclick="App.importData()">⬆ Import / Restore</button>
    </div>
    <hr class="divider">
    <div class="card" style="background:var(--surface);border:1px solid var(--border);margin-bottom:12px">
      <div style="font-size:13px;font-weight:600;margin-bottom:6px">🚀 Launch / Reset for Production</div>
      <p style="font-size:12px;color:var(--text2);margin-bottom:10px">Clears all financial records (income, expenses, remittances, petty cash, bank movements, audit log) but <strong>preserves</strong> your users, church settings, remittance rates, quotas, and role permissions. Use this when going live with a fresh start.</p>
      <button class="btn btn-amber" onclick="App.clearDataOnly()">🗑 Clear Data — Keep Settings & Users</button>
    </div>
    <div class="card" style="background:var(--danger-light);border:1px solid var(--danger);opacity:0.85">
      <div style="font-size:13px;font-weight:600;color:var(--danger);margin-bottom:6px">⚠ Full Reset (Danger Zone)</div>
      <p style="font-size:12px;color:var(--danger);margin-bottom:10px">Wipes everything including users and settings. Only use this to start completely from scratch.</p>
      <button class="btn btn-danger" onclick="App.clearAllData()">🗑 Clear Everything</button>
    </div>
    <div class="alert alert-warn"><span class="alert-icon">⚠</span><span>Clearing data is irreversible. Always export a backup first.</span></div>
  </div>`;
}


async function saveSettings(btn=null){
  if(!requireAdmin()) return;
  const s=await DB.getSettings();
  s.churchName=document.getElementById('set_name')?.value;
  s.bankName=document.getElementById('set_bank')?.value;
  s.accountNo=document.getElementById('set_acct')?.value;
  const pettyMax = parseFloat(document.getElementById('set_petty')?.value)||50000;
  s.pettyMax=pettyMax;
  s.pettyTargetFloat=parseFloat(document.getElementById('set_petty_target_float')?.value)||90000;
  s.pettyManageableFloat=parseFloat(document.getElementById('set_petty_manageable_float')?.value)||60000;
  s.pettyMinimumFloat=parseFloat(document.getElementById('set_petty_minimum_float')?.value)||40000;
  s.pettyBufferAmount=parseFloat(document.getElementById('set_petty_buffer_amount')?.value)||30000;
  const restore = setBtnLoading(btn, 'Saving…');
  try {
    await DB.saveSettings(s);
    // Use the float shown on screen (captured at render time) to avoid clobbering concurrent changes
    const displayedFloat = parseFloat(document.getElementById('set_petty_float_current')?.value);
    const currentFloat = Number.isFinite(displayedFloat) ? displayedFloat : (await DB.getPettyConfig())?.float ?? 0;
    await DB.savePettyConfig({ float: currentFloat, max: pettyMax });
    DB.addAudit('settings_updated','Church settings updated',state.user?.name);
    showAlert('Settings saved!','success');
    restore();
  } catch(err) {
    restore();
    showAlert(`Failed to save settings: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

function confirmPettyFloatOverride(){
  const newFloat = parseFloat(document.getElementById('override_petty_float')?.value);
  if(!Number.isFinite(newFloat)){ showAlert('Please enter a valid number.','danger'); return; }
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">🔧 Confirm Petty Float Override</div>
    <div class="alert alert-warn" style="margin-bottom:16px"><span class="alert-icon">⚠</span><span>You are setting the petty float to <strong>${newFloat < 0 ? '−'+fmt(Math.abs(newFloat))+' (Owes Admin Officer)' : fmt(newFloat)}</strong>. This directly overwrites the current balance — use only to fix data errors.</span></div>
    <div class="form-group">
      <label class="form-label">Enter your IT Admin PIN to confirm</label>
      <input type="password" id="petty_float_pin" class="form-input" maxlength="6" placeholder="••••••" inputmode="numeric"
        onkeydown="if(event.key==='Enter')App.submitPettyFloatOverride(${newFloat},document.getElementById('petty_float_override_btn'))" />
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button id="petty_float_override_btn" class="btn btn-danger" onclick="App.submitPettyFloatOverride(${newFloat},this)">Confirm Override</button>
    </div>`);
  setTimeout(()=>document.getElementById('petty_float_pin')?.focus(),100);
}

async function submitPettyFloatOverride(newFloat, btn=null){
  const pin = document.getElementById('petty_float_pin')?.value?.trim();
  if(!pin){ showAlert('Please enter your PIN.','danger'); return; }
  const restore = setBtnLoading(btn, 'Verifying…');
  try {
    await DB.login({ role:'it_admin', userId: state.user.id, pin });
  } catch(e){
    restore();
    const msg = String(e?.message||'');
    showAlert(msg.toLowerCase().includes('invalid credentials') ? 'Incorrect PIN. Please try again.' : 'PIN verification failed: '+msg, 'danger');
    document.getElementById('petty_float_pin')?.select();
    return;
  }
  try {
    btn.innerHTML = '<span class="btn-spinner-sm"></span> Saving…';
    const cfg = await DB.getPettyConfig();
    const oldFloat = cfg?.float ?? 0;
    await DB.savePettyConfig({ float: newFloat, max: cfg?.max ?? 50000 });
    DB.addAudit('petty_float_override', `Petty float manually overridden from ${fmt(oldFloat)} to ${fmt(newFloat)} by IT Admin`, state.user?.name);
    closeModal();
    showAlert(`Petty float set to ${newFloat < 0 ? '−'+fmt(Math.abs(newFloat))+' (Owes Admin Officer)' : fmt(newFloat)}.`, 'success');
    renderAdmin();
  } catch(err){
    restore();
    showAlert('Failed to save: '+(err?.message||'Unknown error'), 'danger');
  }
}

function addQuotaRow(){
  const container=document.getElementById('quota-rows-container');
  if(!container) return;
  const div=document.createElement('div');
  div.className='quota-row';
  div.draggable=true;
  div.innerHTML=`<span class="dnd-handle" title="Drag to reorder">⠿</span><div style="flex:2"><label class="form-label">Label</label><input type="text" class="form-input" value="" placeholder="e.g. Building Fund" /></div><div style="flex:1"><label class="form-label">Amount (₦)</label><input type="number" class="form-input" value="0" min="0" /></div><button class="btn" style="padding:8px 10px;color:var(--danger);flex-shrink:0" onclick="App.removeQuotaRow(this)" title="Remove">✕</button>`;
  container.appendChild(div);
}

function removeQuotaRow(btn){
  const row=btn.closest('.quota-row');
  if(row) row.remove();
}

function initQuotaDnd(){
  const container=document.getElementById('quota-rows-container');
  if(!container) return;

  // ── HTML5 Drag & Drop (desktop / pointer-capable devices) ─────────────────
  let dragSrc=null;
  container.addEventListener('dragstart',e=>{
    dragSrc=e.target.closest('.quota-row');
    if(!dragSrc) return;
    e.dataTransfer.effectAllowed='move';
    setTimeout(()=>{ if(dragSrc) dragSrc.style.opacity='0.4'; },0);
  });
  container.addEventListener('dragend',()=>{
    if(dragSrc) dragSrc.style.opacity='';
    dragSrc=null;
    container.querySelectorAll('.quota-row.drag-over').forEach(r=>r.classList.remove('drag-over'));
  });
  container.addEventListener('dragover',e=>{
    e.preventDefault();
    e.dataTransfer.dropEffect='move';
    const target=e.target.closest('.quota-row');
    if(!target||target===dragSrc) return;
    container.querySelectorAll('.quota-row.drag-over').forEach(r=>r.classList.remove('drag-over'));
    target.classList.add('drag-over');
  });
  container.addEventListener('drop',e=>{
    e.preventDefault();
    const target=e.target.closest('.quota-row');
    if(!target||!dragSrc||target===dragSrc) return;
    const rows=[...container.querySelectorAll('.quota-row')];
    if(rows.indexOf(dragSrc)<rows.indexOf(target)){
      container.insertBefore(dragSrc,target.nextSibling);
    } else {
      container.insertBefore(dragSrc,target);
    }
    container.querySelectorAll('.quota-row.drag-over').forEach(r=>r.classList.remove('drag-over'));
  });

  // ── Touch drag (mobile) — initiated from the ⠿ handle only ───────────────
  let touchSrc=null, touchClone=null;
  container.addEventListener('touchstart',e=>{
    const handle=e.target.closest('.dnd-handle');
    if(!handle) return;
    touchSrc=handle.closest('.quota-row');
    if(!touchSrc) return;
    e.preventDefault();
    const rect=touchSrc.getBoundingClientRect();
    touchClone=touchSrc.cloneNode(true);
    Object.assign(touchClone.style,{
      position:'fixed',left:rect.left+'px',top:rect.top+'px',
      width:rect.width+'px',opacity:'0.85',pointerEvents:'none',
      zIndex:'9999',background:'var(--card)',boxShadow:'0 4px 20px rgba(0,0,0,0.2)',
      borderRadius:'var(--rl)',transform:'scale(1.02)'
    });
    document.body.appendChild(touchClone);
    touchSrc.style.opacity='0.25';
  },{passive:false});
  container.addEventListener('touchmove',e=>{
    if(!touchSrc||!touchClone) return;
    e.preventDefault();
    const y=e.touches[0].clientY;
    touchClone.style.top=(y-touchClone.getBoundingClientRect().height/2)+'px';
    container.querySelectorAll('.quota-row.drag-over').forEach(r=>r.classList.remove('drag-over'));
    [...container.querySelectorAll('.quota-row')].filter(r=>r!==touchSrc).forEach(row=>{
      const {top,bottom}=row.getBoundingClientRect();
      if(y>=top&&y<=bottom) row.classList.add('drag-over');
    });
  },{passive:false});
  container.addEventListener('touchend',e=>{
    if(!touchSrc) return;
    if(touchClone){ document.body.removeChild(touchClone); touchClone=null; }
    const y=e.changedTouches[0].clientY;
    const rows=[...container.querySelectorAll('.quota-row')];
    for(const row of rows){
      if(row===touchSrc) continue;
      const {top,bottom}=row.getBoundingClientRect();
      if(y>=top&&y<=bottom){
        if(rows.indexOf(touchSrc)<rows.indexOf(row)){
          container.insertBefore(touchSrc,row.nextSibling);
        } else {
          container.insertBefore(touchSrc,row);
        }
        break;
      }
    }
    touchSrc.style.opacity='';
    container.querySelectorAll('.quota-row.drag-over').forEach(r=>r.classList.remove('drag-over'));
    touchSrc=null;
  });
}

async function saveQuotas(btn=null){
  if(!requireAdmin()) return;
  const container=document.getElementById('quota-rows-container');
  const list=[];
  if(container){
    container.querySelectorAll('.quota-row').forEach((row)=>{
      const labelEl=row.querySelector('input[type="text"]');
      const amountEl=row.querySelector('input[type="number"]');
      const label=(labelEl?.value||'').trim();
      const amount=parseFloat(amountEl?.value)||0;
      if(label) list.push({ label, amount });
    });
  }
  const s=await DB.getSettings();
  s.quotaList=list;
  delete s.quotas; // remove legacy format
  const restore = setBtnLoading(btn, 'Saving…');
  try {
    await DB.saveSettings(s);
    DB.addAudit('quotas_updated',`Monthly quotas updated (${list.length} quota${list.length===1?'':'s'})`,state.user?.name);
    showAlert('Monthly quotas updated!','success');
    restore();
  } catch(err) {
    restore();
    showAlert(`Failed to save quotas: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

function showAddUser(){
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">Add New User</div>
    <div class="form-group"><label class="form-label">Full Name</label><input type="text" id="nu_name" class="form-input" placeholder="Full name" /></div>
    <div class="form-group"><label class="form-label">Role</label>
      <select id="nu_role" class="form-select">${Object.entries(ROLES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label class="form-label">Email (optional)</label><input type="email" id="nu_email" class="form-input" placeholder="email@example.com" /></div>
    <div class="form-group"><label class="form-label">PIN (4-6 digits)</label><input type="password" id="nu_pin" class="form-input" maxlength="6" placeholder="••••" inputmode="numeric" /></div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.addUser(this)">Add User</button></div>`);
}

async function addUser(btn=null){
  if(!requireAdmin()) return;
  const name=document.getElementById('nu_name')?.value?.trim();
  const role=document.getElementById('nu_role')?.value;
  const email=document.getElementById('nu_email')?.value;
  const pin=document.getElementById('nu_pin')?.value;
  if(!name||!role||!pin||pin.length<4){ showAlert('Please fill name, role, and PIN (min 4 digits).','danger'); return }
  // Duplicate check
  const existingUsers = await DB.getUsers();
  const duplicate = existingUsers.find(u=>u.name.toLowerCase()===name.toLowerCase() && u.role===role);
  if(duplicate){
    if(!confirm(`A user named "${name}" with role "${ROLES[role]?.label||role}" already exists. Add anyway?`)) return;
  }
  const restore = setBtnLoading(btn, 'Adding…');
  try {
    await DB.addUser({ name, role, email, pin });
    DB.addAudit('user_added',`New user added: ${name} (${role})`,state.user?.name);
    closeModal();
    showAlert(`User ${name} added successfully!`,'success');
    renderAdmin();
  } catch(err) {
    restore();
    showAlert(`Failed to add user: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

async function editUser(id){
  if(!requireAdmin()) return;
  const usersEU=await DB.getUsers();
  const u=usersEU.find(x=>x.id===id);
  if(!u) return;
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">Edit User: ${u.name}</div>
    <div class="form-group"><label class="form-label">Full Name</label><input type="text" id="eu_name" class="form-input" value="${u.name}" /></div>
    <div class="form-group"><label class="form-label">Role</label>
      <select id="eu_role" class="form-select">${Object.entries(ROLES).map(([k,v])=>`<option value="${k}" ${k===u.role?'selected':''}>${v.label}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label class="form-label">Email</label><input type="email" id="eu_email" class="form-input" value="${u.email||''}" /></div>
    <div class="form-group"><label class="form-label">New PIN (leave blank to keep current)</label><input type="password" id="eu_pin" class="form-input" maxlength="6" placeholder="New PIN" inputmode="numeric" /></div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.updateUser('${id}', this)">Update</button></div>`);
}

async function updateUser(id, btn=null){
  if(!requireAdmin()) return;
  const updateData = { name:document.getElementById('eu_name')?.value, role:document.getElementById('eu_role')?.value, email:document.getElementById('eu_email')?.value, pin:document.getElementById('eu_pin')?.value };
  const restore = setBtnLoading(btn, 'Saving…');
  try {
    await DB.updateUser(id, updateData);
    DB.addAudit('user_updated',`User updated: ${updateData.name}`,state.user?.name);
    closeModal();
    showAlert('User updated!','success');
    renderAdmin();
  } catch(err) {
    restore();
    showAlert(`Failed to update user: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

async function deleteUser(id, btn=null){
  if(!requireAdmin()) return;
  const usersDelU=await DB.getUsers();
  const u=usersDelU.find(x=>x.id===id);
  if(!u) return;
  // Block deletion of the last IT Admin
  if(u.role==='it_admin' && usersDelU.filter(x=>x.role==='it_admin').length<=1){
    showAlert('Cannot delete the only IT Administrator. Assign another user as IT Admin first.','danger');
    return;
  }
  if(!confirm(`Delete user "${u.name}"? This cannot be undone.`)) return;
  const restore = setBtnLoading(btn, 'Deleting…');
  try {
    await DB.deleteUser(id);
    DB.addAudit('user_deleted',`User deleted: ${u.name}`,state.user?.name);
    showAlert('User deleted.','warn');
    renderAdmin();
  } catch(err) {
    restore();
    showAlert(`Failed to delete user: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

async function exportData(btn=null){
  if(!requireAdmin()) return;
  const restore = setBtnLoading(btn, 'Exporting…');
  try {
    // Pass full=true so the backup includes receipt/deposit-slip images, which the
    // normal list endpoints now omit for speed.
    const [usersRaw,income,remittances,expenses,petty,auditLog,settings,cashTransactions,satelliteFunds] = await Promise.all([DB.getUsers(),DB.getIncome(),DB.getRemittances(),DB.getExpenses(true),DB.getPetty(),DB.getAudit(),DB.getSettings(),DB.getCashTransactions(true),DB.getSatelliteFunds()]);
    // Strip sensitive auth data (PIN hashes) — they must never leave the database in any export
    const users = usersRaw.map(({pin:_pin, pinHash:_hash, ...u})=>u);
    const data={ users,income,remittances,expenses,petty,audit:auditLog,settings,cashTransactions,satelliteFunds, exportedAt:new Date().toISOString(), exportedBy:state.user?.name };
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`rccg-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    DB.addAudit('data_exported','Full data export performed',state.user?.name);
    showAlert('Backup exported successfully!','success');
    restore();
  } catch(err) {
    restore();
    showAlert(`Failed to export data: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

function importData(){
  if(!requireAdmin()) return;
  const input=document.createElement('input'); input.type='file'; input.accept='.json';
  input.onchange=async e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=async ev=>{
      try{
        const data=JSON.parse(ev.target.result);
        // Schema validation — must have at minimum users (array) and settings (object)
        const warnings=[];
        if(!data || typeof data !== 'object') throw new Error('Not a valid JSON object.');
        if(!Array.isArray(data.users)) warnings.push('• Missing or invalid "users" array.');
        if(!data.settings || typeof data.settings !== 'object') warnings.push('• Missing or invalid "settings" object.');
        if(data.exportedAt){
          const exportedDate = new Date(data.exportedAt).toLocaleDateString();
          warnings.unshift(`Backup created: ${exportedDate}.`);
        }
        if(warnings.filter(w=>w.startsWith('•')).length>0){
          alert('This backup file has validation issues and cannot be safely restored:\n\n'+warnings.join('\n')+'\n\nPlease use a valid RCCG backup file.');
          return;
        }
        if(warnings.length && !confirm('Backup file info:\n\n'+warnings.join('\n')+'\n\nContinue?')) return;
        if(!confirm('This will overwrite all existing financial records (income, expenses, remittances, petty cash) with data from the backup.\n\nUser accounts and PINs will NOT be changed — any names or PINs you have updated will be preserved.\n\nAre you sure you want to proceed?')) return;
        await DB.importBackup(data);
        DB.addAudit('data_imported','Data restored from backup',state.user?.name);
        showAlert('Data restored successfully! Reloading…','success');
        setTimeout(()=>window.location.reload(), 600);
      }catch(e){ showAlert('Invalid backup file. Please use a valid JSON backup.','danger') }
    };
    reader.readAsText(file);
  };
  input.click();
}

async function clearDataOnly(){
  if(!requireAdmin()) return;
  if(!confirm(
    'This will permanently delete all financial records:\n\n' +
    '• Income records\n• Expenses\n• Remittances\n• Petty cash history\n• Bank transactions\n• Audit log\n• Notifications\n\n' +
    'Your users, church settings, remittance rates, quotas, and role permissions will be KEPT.\n\n' +
    'Export a backup first if you need to keep the test data.\n\nProceed?'
  )) return;
  const word=prompt('Type CLEAR DATA to confirm deletion of all financial records:');
  if(word!=='CLEAR DATA'){ if(word!==null) showAlert('Cancelled — you must type CLEAR DATA exactly.','danger'); return; }
  try {
    showAlert('Clearing data…', 'info');
    await DB.clearDataOnly();
    showAlert('All financial data cleared. Settings and users are intact. The app is ready for live use.', 'success');
    DB.addAudit('data_cleared', 'All financial data cleared for production launch', state.user?.name);
    navigate('dashboard');
  } catch(e) {
    showAlert('Error: ' + e.message, 'danger');
  }
}

async function clearAllData(){
  if(!requireAdmin()) return;
  if(!confirm('⚠ This will permanently delete ALL church financial records. Type CONFIRM to proceed.')) return;
  const word=prompt('Type CONFIRM to delete everything:');
  if(word!=='CONFIRM'){ showAlert('Cancelled.','danger'); return }
  try{
    await DB.clearAllData();
    showAlert('All data cleared. Reloading…','warn');
    setTimeout(()=>window.location.reload(), 600);
  }catch(e){
    showAlert(`Failed to clear data: ${e.message||'Unknown error'}`,'danger');
  }
}

async function showChildrenTeacherModal(){
  const remRates = (await getRemRates()).rates || DEFAULT_REMITTANCE_RATES;
  const allIncome = await DB.getIncome();
  const monthIncome = filterByMonth(allIncome);
  const sundayRecs = monthIncome
    .filter(r => !r.source || r.source === 'sunday_collection')
    .filter(r => (r.childrenOffering || 0) > 0);
  const localRate = getChildrenOfferingLocalRate(remRates);
  const natlRate = typeof remRates.childrenOffering?.natl === 'number'
    ? remRates.childrenOffering.natl
    : DEFAULT_REMITTANCE_RATES.childrenOffering.natl;
  const totalChildrenOffering = sundayRecs.reduce((s, r) => s + (r.childrenOffering || 0), 0);
  const totalTeacherShare = sundayRecs.reduce((s, r) => s + getChildrenTeacherHeldCash(r, remRates), 0);
  const totalNatlShare = totalChildrenOffering * natlRate;

  const rows = sundayRecs.map(r => {
    const co = r.childrenOffering || 0;
    const teacherShare = getChildrenTeacherHeldCash(r, remRates);
    return `<tr>
      <td style="padding:6px 8px">${fmtDate(r.date)}</td>
      <td style="padding:6px 8px;text-align:right">${fmt(co)}</td>
      <td style="padding:6px 8px;text-align:right;color:#A32D2D">${fmt(co * natlRate)}</td>
      <td style="padding:6px 8px;text-align:right;color:#BA7517;font-weight:600">${fmt(teacherShare)}</td>
    </tr>`;
  }).join('');

  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">🧒 Children Teacher — ${monthLabel()}</div>
    <p style="font-size:12px;color:var(--text3);margin-bottom:14px">The local share (${Math.round(localRate*100)}%) of the Teen/Children's Offering stays with the Children Teacher to cover refreshments and departmental needs. This amount is <strong>not</strong> held by the accountant.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      <div style="background:var(--surface);border-radius:var(--r);padding:10px;text-align:center">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Total Collected</div>
        <div style="font-size:18px;font-weight:700;color:var(--text)">${fmt(totalChildrenOffering)}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">Teen/Children's Offering</div>
      </div>
      <div style="background:rgba(186,117,23,0.08);border:1px solid rgba(186,117,23,0.25);border-radius:var(--r);padding:10px;text-align:center">
        <div style="font-size:10px;color:#BA7517;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px">🧒 Teacher's Share (${Math.round(localRate*100)}%)</div>
        <div style="font-size:18px;font-weight:700;color:#BA7517">${fmt(totalTeacherShare)}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">For refreshments &amp; dept. needs</div>
      </div>
    </div>
    <div style="background:rgba(163,45,45,0.06);border-radius:var(--r);padding:8px 10px;margin-bottom:14px;font-size:11px;color:var(--text2)">
      <span style="color:#A32D2D;font-weight:600">📤 ${fmt(totalNatlShare)} (${Math.round(natlRate*100)}%) → National HQ</span>
    </div>
    ${sundayRecs.length > 0 ? `
    <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:6px">Per-Sunday Breakdown</div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:var(--surface)">
            <th style="padding:6px 8px;text-align:left;font-weight:600;color:var(--text2)">Date</th>
            <th style="padding:6px 8px;text-align:right;font-weight:600;color:var(--text2)">Offering</th>
            <th style="padding:6px 8px;text-align:right;font-weight:600;color:#A32D2D">→ HQ (${Math.round(natlRate*100)}%)</th>
            <th style="padding:6px 8px;text-align:right;font-weight:600;color:#BA7517">Teacher (${Math.round(localRate*100)}%)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:var(--surface);border-top:2px solid var(--border)">
            <td style="padding:6px 8px;font-weight:700">Total</td>
            <td style="padding:6px 8px;text-align:right;font-weight:700">${fmt(totalChildrenOffering)}</td>
            <td style="padding:6px 8px;text-align:right;font-weight:700;color:#A32D2D">${fmt(totalNatlShare)}</td>
            <td style="padding:6px 8px;text-align:right;font-weight:700;color:#BA7517">${fmt(totalTeacherShare)}</td>
          </tr>
        </tfoot>
      </table>
    </div>` : '<div style="text-align:center;color:var(--text3);font-size:13px;padding:16px 0">No Teen/Children\'s Offering recorded this month.</div>'}
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Close</button></div>`);
}


// ── AI SECRETARY ──────────────────────────
const AI_SECRETARY_PARTICIPANT_GROUPS = [
  { group:'men', label:'Men' },
  { group:'women', label:'Women' },
  { group:'youth', label:'Youth' },
  { group:'ministers', label:'Ministers' },
];

function normalizeAiSecretaryParticipants(participants=[], kpscMembers=[]){
  const byGroup = new Map((participants||[]).map(p=>[String(p.group||'').toLowerCase(),p]));
  const rosterByGroup = new Map();
  for(const m of (kpscMembers||[])){ const g=String(m.group||'').toLowerCase(); if(!rosterByGroup.has(g)) rosterByGroup.set(g,m); }
  return AI_SECRETARY_PARTICIPANT_GROUPS.map(base=>{
    const row = byGroup.get(base.group) || {};
    return { group:base.group, label:base.label, present:!!row.present, name:row.name || rosterByGroup.get(base.group)?.name || '' };
  });
}

function aiSecretaryParticipantPayload(){
  return AI_SECRETARY_PARTICIPANT_GROUPS.map(p=>({
    group:p.group,
    label:p.label,
    present:!!document.getElementById(`ais_${p.group}_present`)?.checked,
    name:document.getElementById(`ais_${p.group}_name`)?.value?.trim() || ''
  }));
}

function aiSecretaryStatusBadge(status){
  const s = String(status||'draft').toLowerCase();
  if(s==='processed') return '<span class="badge badge-success">✅ Processed</span>';
  if(s==='recording') return '<span class="badge badge-warn">🔴 Recording</span>';
  if(s==='ended') return '<span class="badge badge-gray">⏹ Ended</span>';
  return '<span class="badge badge-gray">Draft</span>';
}




// ── KPSC ALERT ────────────────────────────
async function showKPSCAlert(){
  const income=filterByMonth(await DB.getIncome());
  const totalIncome=income.reduce((s,r)=>s+(r.totalCollection||0),0);
  const rem=await calcRemittancesFromRecords(income);
  const expenses=filterByMonth(await DB.getExpenses());
  const totalExp=expenses.reduce((s,e)=>s+(e.amount||0),0);
  const remPending=totalRemittanceDue(rem);
  const balance=totalIncome-remPending-totalExp;
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">🔔 Alert KPSC — Emergency Support</div>
    <div class="alert alert-warn"><span class="alert-icon">⚠</span><span>Use this when the main account cannot cover necessary daily expenses after RCCG remittances. This follows proper procedure — no public announcements from the Pastor.</span></div>
    <div class="grid-2" style="margin:12px 0">
      <div style="background:var(--surface);padding:10px;border-radius:var(--r);text-align:center"><div class="amount-label">Current Balance</div><div style="font-size:18px;font-weight:700;color:${balance<0?'var(--danger)':'var(--primary)'}">${fmt(balance)}</div></div>
      <div style="background:var(--surface);padding:10px;border-radius:var(--r);text-align:center"><div class="amount-label">Remittances Pending</div><div style="font-size:18px;font-weight:700;color:var(--amber)">${fmt(remPending)}</div></div>
    </div>
    <div class="form-group"><label class="form-label">Nature of Emergency</label>
      <select id="kpsc_type" class="form-select">
        <option>Insufficient funds for diesel/fuel</option>
        <option>Cannot cover RCCG quota after daily expenses</option>
        <option>Emergency utility bill (NEPA)</option>
        <option>Emergency maintenance needed</option>
        <option>Other operational emergency</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Amount Needed from KPSC (₦)</label><input type="number" id="kpsc_amt" class="form-input" placeholder="0" /></div>
    <div class="form-group"><label class="form-label">Description</label><textarea id="kpsc_desc" class="form-textarea" placeholder="Explain the situation clearly..."></textarea></div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-amber" onclick="App.submitKPSCAlert()">Send Alert to KPSC</button></div>`);
}

function submitKPSCAlert(){
  const type=document.getElementById('kpsc_type')?.value;
  const amt=parseFloat(document.getElementById('kpsc_amt')?.value)||0;
  const desc=document.getElementById('kpsc_desc')?.value;
  if(!amt||!desc){ showAlert('Please fill all fields.','danger'); return }
  DB.addAudit('kpsc_alert',`KPSC Alert sent: ${type} — ${fmt(amt)}`,state.user?.name);
  DB.addNotification('KPSC Alert Sent',`Emergency request: ${type} — ${fmt(amt)} needed`,'warn');
  closeModal();
  showAlert('KPSC alert recorded and logged. Present this request formally to the KPSC at the next available opportunity.','warn');
}

// ──────────────────────────────────────────
// 8. SESSION RESTORE
// ──────────────────────────────────────────
(function restoreSession(){
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('rccgSession') || 'null'); } catch(e) {}
  if (!saved || !saved.id || !saved.role || !saved.name) return;
  state.user = saved;
  function doRestore(){
    const loginEl = document.getElementById('loginScreen');
    const appEl = document.getElementById('appShell');
    if (!loginEl || !appEl) return;
    loginEl.style.display = 'none';
    appEl.style.display = 'flex';
    DB.getSettings()
      .then(s => { state.rolePermissions = s.rolePermissions || null; initApp(); })
      .catch(() => initApp());
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', doRestore);
  } else {
    doRestore();
  }
})();

async function setPeriodMode(mode){
  if(state.periodMode === mode) return;
  state.periodMode = mode;
  // Each mode picks its own "today's period" anchor — June for remittance after
  // a cut-off, May for calendar. Reset the user-pick flag so the smart default
  // kicks in for the new mode (per spec: "modes should consider today's date
  // and show the period modes they fall under").
  state.userPickedMonth = false;
  await applySmartDefaultMonth();
  navigate(state.page);
}

// ──────────────────────────────────────────
// 9. PUBLIC API
// ──────────────────────────────────────────
return {
  onRoleChange, login, logout, showChangePinModal, submitChangePin, navigate, toggleSidebar, toggleNotifications,
  onMonthChange, setIncomeTab, showIncomeForm, updateIncomeTotal, updateIncomeCashBreakdown, addBankTransferRow, updateBankTransferTotal, retryDepositVerification, manuallyApproveDeposit, correctDepositAmount, submitDepositCorrection, deleteDepositRecord, submitIncome,
  showOtherIncomeForm, submitOtherIncome,
  viewIncome, confirmDeleteIncome, submitDeleteIncome, _previewDepPhoto, correctIncomeDeposit, reconcileCashWithAccountant, submitReconcileCash, confirmDeposit, submitCashDeposit, confirmBulkDeposit, submitBulkDeposit, showRemittancePaymentModal, submitRemittance, showRemCutoffModal, saveRemCutoffDates, toggleRemCutoff, onRemDatesChange, onRemMethodChange, onRemSplitChange, onAreaTotalChange, printRemittanceReport, shareRemittanceReport, approveRemittance, deleteRemittance,
  showSatelliteFundForm, submitSatelliteFund, deleteSatelliteFundEntry, showSatelliteTransferForm, submitSatelliteTransfer, showSatelliteFundsInForm, submitSatelliteFundsIn, toggleSatEntryMenu, editSatelliteFundEntry,
  openReconcileModal, toggleWriteOffForm, onWriteOffReasonChange, submitWriteOff,
  updateExpenseSubcats, updateExpenseDescRequired,
  quickLogExpense, showExpenseForm, submitExpense, viewExpenseReceipt, viewCashPhoto, editExpense, submitEditExpense, deleteExpense, showExpenseDetail, onExpMethodChange, onExpSplitChange, onExpFundSourceChange, onExpPoolSplitChange, onExpAmountChange, setExpCatFilter, setExpSearch, setExpMethodFilter, setExpRecordedBy, setExpSort, clearExpFilters,
  showBankWithdrawal, submitBankWithdrawal, onWdDestChange, onWdAmtChange, onWdCatChange,
  setBankTab, showBankChargeForm, submitBankCharge, compareBankBalance, saveBankEmailAutomationSettings, ackChurchBankIngestAttention,
  editBankTx, submitEditBankTx, confirmDeleteBankTx, submitDeleteBankTx,
  setTxFilter, setTxPage, setTxPageSize, clearTxFilters, showTxDetail, exportTxCSV, exportTxPDF, saveTxView, loadTxView, deleteTxView,
  renderPettyCash, recalcPettyFloat, showPettyDetail, confirmDeletePetty, submitDeletePetty, showPettyRequest, showTopUpRequest, submitTopUpRequest, onTopupOverrideToggle, cancelTopUpRequest, showAdvanceRequest, submitAdvanceRequest, onReceiptToggle, setPettySearch, setPettyTypeFilter, setPettyStatusFilter, setPettySort, clearPettyFilters,
  approvePetty, confirmTopupApproval, printTopupReview, rejectPettyFromModal, rejectPetty, submitPettyReceipt, confirmPettyReceipt, showPettyRefill, showPettyToBankDeposit, submitPettyToBankDeposit, markTopupSettled, submitRefill, onRefillMethodChange, onRefillTopupChange,
  generateMonthlyReport, generateWeeklyReport, generateRemittanceReport, shareMonthlyStatement,
  generateQuarterlyReport, generateExpenseReport, generatePettyCashReport, onReportDatesChange, setReportPeriodMode,
  setAdminTab, setAdminUserSearch, saveSettings, confirmPettyFloatOverride, submitPettyFloatOverride, saveQuotas, addQuotaRow, removeQuotaRow, saveRates, saveRolePermissions, resetRolePermissions, showAddUser, addUser, editUser,
  updateUser, deleteUser, exportData, importData, clearDataOnly, clearAllData,
  setPeriodMode,
  showKPSCAlert, submitKPSCAlert, showChildrenTeacherModal, closeModal: closeModal, showAlert,
  _countSundaysInRange: countSundaysInRange, _getQuotaLinesForPeriod: getQuotaLinesForPeriod,
  _getIncomeCashWithAccountant: getIncomeCashWithAccountant,
  _buildExpenseCoveringMap: buildExpenseCoveringMap,
  _findIncomeRefForCashExpense: findIncomeRefForCashExpense,
  _calcPettyFloatFromLedger: calcPettyFloatFromLedger,
  _totalRemittanceDue: totalRemittanceDue,
  _calcChurchBalanceFromOpening: calcChurchBalanceFromOpening,
  _calcOutstandingRemittancesFromFlow: calcOutstandingRemittancesFromFlow,
  _calcCurrentPeriodOutstandingRemittance: calcCurrentPeriodOutstandingRemittance,
  _calcAvailableFundFromOpening: calcAvailableFundFromOpening,
  _remittanceSettledDate: remittanceSettledDate,
  _calcChurchBalance: calcChurchBalance,
  _summarizeSatelliteFunds: summarizeSatelliteFunds,
  // Test-only hooks: exercise the real permission map without a login round-trip.
  _canAction: canAction,
  _setTestUserRole: (role) => { state.user = { name:'Test User', role }; },
  _satelliteHeldDisplay: satelliteHeldDisplay,
  _SATELLITE_FUND_PURPOSES: SATELLITE_FUND_PURPOSES,
  _EXPENSE_CATS: EXPENSE_CATS,
  _EXPENSE_CATS_ALL: EXPENSE_CATS_ALL,
  _LEGACY_EXPENSE_CATS: LEGACY_EXPENSE_CATS,
  _EXPENSE_SUBCATS: EXPENSE_SUBCATS,
  _getExpenseMethodOptionsForRole: getExpenseMethodOptionsForRole,
  _getPoolPaidViaOptionsForRole: getPoolPaidViaOptionsForRole,
  _applyCategoryFundSourceDefault: applyCategoryFundSourceDefault
  };

})();

// Global helpers
function closeModal(){ const o=document.getElementById('modalOverlay'); if(o) o.remove() }
function toggleTopupCard(el){ const card=el.closest('.topup-card'); if(card){ card.classList.toggle('expanded'); el.setAttribute('aria-expanded', card.classList.contains('expanded')?'true':'false') } }

// Ensure App is accessible from inline onclick handlers in all browsers
window.App = App;

window.onerror = function(message, source, lineno, colno, error){
  console.error('Fatal runtime error:', { message, source, lineno, colno, error });
  if(document.getElementById('appShell')?.style.display!=='none'){
    App.showAlert('Unexpected error occurred. Please refresh the page.','danger');
  }
};

window.onunhandledrejection = function(event){
  console.error('Unhandled promise rejection:', event?.reason || event);
  if(document.getElementById('appShell')?.style.display!=='none'){
    App.showAlert('A background operation failed. Please retry or refresh.','danger');
  }
};

// ──────────────────────────────────────────
// SLOW NETWORK DETECTION
// ──────────────────────────────────────────
(function initSlowNetworkBanner(){
  const SLOW_TYPES = new Set(['slow-2g','2g']);
  const SLOW_DOWNLINK_MBPS = 0.5; // below 0.5 Mbps is considered slow
  const SLOW_RTT_MS = 500;        // above 500 ms RTT is considered slow

  function isSlow(conn){
    if(!conn) return false;
    if(SLOW_TYPES.has(conn.effectiveType)) return true;
    if(typeof conn.downlink === 'number' && conn.downlink < SLOW_DOWNLINK_MBPS) return true;
    if(typeof conn.rtt === 'number' && conn.rtt > SLOW_RTT_MS) return true;
    return false;
  }

  function updateBanner(){
    const banner = document.getElementById('slowNetworkBanner');
    if(!banner) return;
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    banner.style.display = isSlow(conn) ? 'flex' : 'none';
  }

  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if(conn){
    conn.addEventListener('change', updateBanner);
    // Poll every 10 s so the banner hides promptly when the connection recovers,
    // since the 'change' event does not always fire on improvement.
    setInterval(updateBanner, 10000);
    // Run once on load
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', updateBanner);
    } else {
      updateBanner();
    }
  }
})();
