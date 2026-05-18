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
  it_admin:      ['all'],
  pastor:        ['dashboard','transactions','income_view','remittances','expenses_view','petty_view','reports','audit','signoff','rem_cutoff_edit'],
  accountant:    ['dashboard','transactions','income','income_view','remittances','expenses','bank','petty_view','reports','audit','rem_cutoff_edit','expense_delete_approved'],
  admin_officer: ['dashboard','transactions','expenses','petty_request','petty_view','income_view'],
  signatory:     ['dashboard','transactions','income_view','remittances_view','expenses_view','bank','petty_approve','signoff'],
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

const INCOME_TYPES = [
  { key:'membersTithe',    label:"Members' Tithe",         natl:0.58, local:0.42 },
  { key:'ministersTithe',  label:"Ministers' Tithe",       natl:0.62, local:0.38 },
  { key:'thanksgiving',    label:'Thanksgiving (TG)',      special:'tg' },
  { key:'sundaySchool',    label:'Sunday School',          natl:1.00, local:0 },
  { key:'slo',             label:'Sunday Love Offering',   natl:0.30, local:0.70 },
  { key:'crm',             label:'CRM (Weekly Activities)',natl:0.60, local:0.40 },
  { key:'workersOffering', label:"Gospel Fund (Workers' Offering)", natl:0.25, local:0.75 },
  { key:'childrenOffering',label:"Teen/Children's Offering",        natl:0.35, local:0.65 }
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
  { key:'rccg_proj',  label:'RCCG Special Projects',   color:'#A32D2D', icon:'⛪' },
  { key:'hospitality',label:'Hospitality & Guests',    color:'#BA7517', icon:'☕' },
  { key:'security',   label:'Security',                color:'#555',    icon:'🔒' },
  { key:'welfare',    label:'Church Welfare',          color:'#D85A30', icon:'❤️' },
  { key:'property',   label:'Property & Projects',     color:'#185FA5', icon:'🏗️' },
  { key:'events',     label:'Events & Departments',    color:'#534AB7', icon:'🎉' }
];

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
  rccg_proj:   ["Let's Go A-Fishing contributions",'Financial demands for ongoing Provincial, Regional, or National building projects','Special emergency offerings or project support requested by RCCG higher authorities','Others...'],
  property:    ['Annual land or building rent','Building construction and renovations','Buying major equipment','Others...'],
  events:      ['Flyers, banners, and posters for special programs','Church decorations for special events or festive seasons','Teaching materials and snacks for the Children\'s department','Purchasing Sunday School manuals for the parish','Others...'],
  security:    ['Monthly salary or allowance for the night security guard','Security supplies','Occasional tips or relations with local police or community vigilantes','Others...']
};

const DEFAULT_QUOTAS = { rmf:5000, csr:3000, edu:2000, camp:5000, mummy:8000, volunteer:2000, regional:0 };

const QUOTA_LABELS = {
  rmf:      'RMF (Camp Clearing)',
  csr:      'CSR (Christian Social Responsibility)',
  edu:      'Education Fund',
  camp:     'Camp Meeting Fund',
  mummy:    'Zonal Mummy Stipend',
  volunteer:'Volunteer Fund',
  regional: 'Regional Contribution'
};

// Income source types used in the "Other Income" form
const OTHER_INCOME_SOURCES = [
  { key:'midweek_offering',   label:'Midweek / Programme Offering' },
  { key:'go_a_fishing_offering', label:'Go-a-Fishing Offering' },
  { key:'individual_tithe',   label:'Individual Tithe (Bank Transfer)' },
  { key:'individual_donation',label:'Personal / Individual Donation' },
  { key:'seed',               label:'Seed Offering' },
  { key:'special_offering',   label:'Special Offering (e.g. Naming, Wedding)' },
  { key:'harvest',            label:'Harvest / Thanksgiving Offering' },
  { key:'building_fund',      label:'Building / Project Fund Contribution' },
  { key:'external_transfer',  label:'External Bank Transfer Received' },
  { key:'other',              label:'Other (specify in notes)' }
];

const DEFAULT_REMITTANCE_RATES = {
  membersTithe:    { natl:0.58, local:0.42 },
  ministersTithe:  { natl:0.62, local:0.38 },
  sundaySchool:    { natl:1.00, local:0.00 },
  slo:             { natl:0.30, local:0.70 },
  crm:             { natl:0.60, local:0.40 },
  workersOffering: { natl:0.25, local:0.75 },
  childrenOffering:{ natl:0.35, local:0.65 },
  tgNational:0.75, tgArea:0.05, tgPastor:0.10, tgMinisters:0.09, tgSeed:0.01,
  provinceRebate:0.20
};
const PIN_REGEX = /^\d{4,6}$/;

// ──────────────────────────────────────────
// 2. DATA LAYER — Cloudflare D1 via /api/*
// ──────────────────────────────────────────
async function apiFetch(path, method='GET', body=null){
  const opts = { method, headers:{'Content-Type':'application/json'} };
  if(body !== null) opts.body = JSON.stringify(body);
  const res = await fetch('/api/'+path, opts);
  const data = await res.json();
  if(!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
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

  getExpenses()                { return apiFetch('expenses'); },
  addExpense(d)                { return apiFetch('expenses','POST',d); },
  updateExpense(id,d)          { return apiFetch(`expenses/${id}`,'PUT',d); },
  deleteExpense(id)            { return apiFetch(`expenses/${id}`,'DELETE'); },

  getPetty()                   { return apiFetch('petty'); },
  getPettyConfig()             { return apiFetch('petty-config'); },
  savePettyConfig(d)           { return apiFetch('petty-config','POST',d); },
  addPettyEntry(d)             { return apiFetch('petty','POST',d); },
  updatePettyEntry(id,d)       { return apiFetch(`petty/${id}`,'PUT',d); },
  deletePettyEntry(id)         { return apiFetch(`petty/${id}`,'DELETE'); },

  getRemittances()             { return apiFetch('remittances'); },
  addRemittance(d)             { return apiFetch('remittances','POST',d); },
  updateRemittance(id,d)       { return apiFetch(`remittances/${id}`,'PUT',d); },

  getCashTransactions()        { return apiFetch('cash-transactions'); },
  addCashTransaction(d)        { return apiFetch('cash-transactions','POST',d); },

  getAudit()                   { return apiFetch('audit'); },
  // addAudit is fire-and-forget — never blocks the UI
  addAudit(type,detail,by){
    apiFetch('audit','POST',{type,detail,by:by||'System'}).catch(()=>{});
  },

  getSettings()                { return apiFetch('settings'); },
  saveSettings(d)              { return apiFetch('settings','POST',d); },

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
};

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
  dashPeriodMode: 'remittance', // 'remittance' | 'calendar'
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
  const dt = parseDisplayDate(d);
  if(!dt) return '—';
  return dt.toLocaleDateString('en-NG',{day:'2-digit',month:'short',year:'numeric',timeZone:NIGERIA_TIMEZONE});
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
  const rp = state.rolePermissions?.[state.user.role];
  const perms = rp || PERMISSIONS[state.user.role] || [];
  return perms.includes('all') || perms.includes(p);
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
    expense_log: ['expenses'],
    bank_withdrawal: ['income'],
    bank_charge: ['expenses'],
    petty_request: ['petty_request'],
    petty_topup_payment: ['income'],
    petty_approve_or_view: ['income','petty_approve'],
    income_delete: { roles:['it_admin'] },
    petty_delete:  { roles:['it_admin'] },
    expense_edit_pending: { roles:['admin_officer','it_admin'] },
    expense_delete_pending: { roles:['admin_officer','it_admin'] },
    expense_delete_approved: ['expense_delete_approved'],
    expense_approve_pending: { roles:['accountant','it_admin'] },
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
  // Only the Admin Officer's expenses need Accountant verification
  // All other roles (Accountant, Pastor, Signatory, IT Admin) log pre-approved expenses
  return state.user?.role==='admin_officer' ? 'pending_approval' : 'approved';
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
  const timer = setTimeout(()=>{ btn.disabled=false; btn.innerHTML=orig; }, 30000);
  return function restore(){ clearTimeout(timer); btn.disabled=false; btn.innerHTML=orig; };
}

// Remittance engine
async function getRemRates(){
  const s = await DB.getSettings();
  const r = s.remittanceRates || DEFAULT_REMITTANCE_RATES;
  return {
    rates: r,
    tgNational:  r.tgNational   ?? DEFAULT_REMITTANCE_RATES.tgNational,
    tgArea:      r.tgArea       ?? DEFAULT_REMITTANCE_RATES.tgArea,
    tgPastor:    r.tgPastor     ?? DEFAULT_REMITTANCE_RATES.tgPastor,
    tgMinisters: r.tgMinisters  ?? DEFAULT_REMITTANCE_RATES.tgMinisters,
    tgSeed:      r.tgSeed       ?? DEFAULT_REMITTANCE_RATES.tgSeed,
    provinceRebate: r.provinceRebate ?? DEFAULT_REMITTANCE_RATES.provinceRebate
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

async function calcRemittances(income){
  const rr = await getRemRates();
  const res = { lines:[], totalNatl:0, totalArea:0, totalPastor:0, totalMinisters:0, totalSeed:0,
                localBefore:0, localTithe:0, provinceRebate:0, netLocal:0 };
  INCOME_TYPES.forEach(t=>{
    const amt = income[t.key]||0;
    if(!amt) return;
    if(t.special==='tg'){
      const line = { label:t.label, isTg:true, total:amt, national: amt*rr.tgNational, area: amt*rr.tgArea,
        pastor: amt*rr.tgPastor, ministers: amt*rr.tgMinisters, seed: amt*rr.tgSeed, local:0 };
      res.lines.push(line);
      res.totalNatl+=line.national; res.totalArea+=line.area;
      res.totalPastor+=line.pastor; res.totalMinisters+=line.ministers; res.totalSeed+=line.seed;
    } else {
      const rateEntry = (rr.rates[t.key]) || { natl: t.natl||0, local: t.local||0 };
      const local = amt*(rateEntry.local);
      const natl  = amt*(rateEntry.natl);
      res.lines.push({ label:t.label, total:amt, national:natl, local });
      res.totalNatl+=natl; res.localBefore+=local;
      // Province Rebate applies only to local retained tithes (Members' + Ministers')
      if(t.key==='membersTithe' || t.key==='ministersTithe'){
        res.localTithe+=local;
      }
    }
  });
  // Province Rebate = 20% of local retained tithes (Members' Tithe + Ministers' Tithe)
  res.provinceRebate = res.localTithe * rr.provinceRebate;
  res.netLocal = res.localBefore - res.provinceRebate;
  return res;
}

function showModal(html){ const o=document.createElement('div'); o.className='modal-overlay'; o.id='modalOverlay'; o.innerHTML=`<div class="modal">${html}</div>`; document.body.appendChild(o) }
function closeModal(){ const o=document.getElementById('modalOverlay'); if(o) o.remove() }
function showAlert(msg,type='success'){
  const a=document.createElement('div'); a.className=`alert alert-${type}`;
  const icon=document.createElement('span'); icon.className='alert-icon'; icon.textContent=type==='success'?'✓':type==='danger'?'✕':'⚠';
  const txt=document.createElement('span'); txt.textContent=msg;
  a.appendChild(icon); a.appendChild(txt);
  const pc=document.getElementById('pageContent'); if(pc){ pc.insertBefore(a,pc.firstChild); setTimeout(()=>a.remove(),4000) }
}
async function updateNotifBadge(){ try{ const notifs=await DB.getNotifications(); const unread=notifs.filter(n=>!n.read).length; const el=document.getElementById('notifCount'); if(el){ el.textContent=unread; el.style.display=unread?'flex':'none' } }catch(e){} }

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
}

// Handle browser back / forward
window.addEventListener('popstate', ()=>{
  if(!state.user) return;
  navigate(pageFromPath(), true);
});

function buildMonthSelector(){
  const sel = document.getElementById('globalMonth');
  sel.innerHTML = '';
  for(let y=state.year;y>=state.year-2;y--){
    for(let m=11;m>=0;m--){
      if(y===state.year && m>new Date().getMonth()) continue;
      const opt = document.createElement('option');
      opt.value=`${y}-${m}`;
      opt.textContent=`${MONTHS[m]} ${y}`;
      if(y===state.year && m===state.month) opt.selected=true;
      sel.appendChild(opt);
    }
  }
}

function onMonthChange(){
  const [y,m] = document.getElementById('globalMonth').value.split('-').map(Number);
  state.year=y; state.month=m;
  // Reset remittance period so it recalculates defaults for the new month
  state.remFromDate=null; state.remToDate=null;
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
  document.getElementById('sidebarUser').innerHTML=`
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
  const pc=document.getElementById('pageContent');
  pc.innerHTML='<div style="padding:40px;text-align:center;color:var(--text3)">Loading...</div>';
  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
  // Close notifications
  document.getElementById('notifPanel').style.display='none';
  await Promise.all([buildSidebar(), updateNotifBadge()]);
  setTimeout(()=>{ renderPage(page).catch(e=>console.error(e)); },50);
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
    document.getElementById('pageContent').innerHTML=`<div class="card"><div class="alert alert-danger"><span class="alert-icon">✕</span><span>Error loading page: ${esc(e.message)}</span></div></div>`;
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
  const [income, expenses, remittances, cashTx, petty] = await Promise.all([
    DB.getIncome(), DB.getExpenses(), DB.getRemittances(), DB.getCashTransactions(), DB.getPetty()
  ]);
  const remRates = (await getRemRates()).rates || DEFAULT_REMITTANCE_RATES;

  const tx = [];

  (income||[]).forEach(r=>{
    const sourceMeta = OTHER_INCOME_SOURCES.find(s=>s.key===r.source);
    const isSunday = !r.source || r.source==='sunday_collection';
    const cashHeld = isSunday
      ? getSundayCashWithAccountant(r, remRates)
      : Math.max(0,(r.totalCollection||0)-(r.bankTransferAmount||0)-(r.directPettyCash||0));
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
      description:`Expense — ${(EXPENSE_CATS.find(c=>c.key===e.category)?.label)||e.category||'Uncategorized'}${e.subCategory?` · ${e.subCategory}`:''}`,
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
      direction:(p.type==='refill'||p.type==='topup_request')?'transfer':'debit',
      method:p.paymentMethod||'',
      status:p.status||'pending_approval',
      description:`Petty Cash — ${p.type==='topup_request'?'Top-Up Request':p.type==='advance'?'Advance':p.type==='refill'?'Refill':'Disbursement'}`,
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
async function calcChurchBalance(){
  const [allIncome,allExpenses,allRemittances,cashTx,pettyHistory,pettyConfig] = await Promise.all([DB.getIncome(),DB.getExpenses(),DB.getRemittances(),DB.getCashTransactions(),DB.getPetty(),DB.getPettyConfig()]);
  const petty = { history: pettyHistory, float: pettyConfig.float, max: pettyConfig.max };
  const remRates = (await getRemRates()).rates || DEFAULT_REMITTANCE_RATES;

  // --- BANK BALANCE ---
  const bankTransferIncome = allIncome.reduce((s,r) => s + (r.bankTransferAmount||0), 0);
  const cashDepositedToBank = cashTx.filter(t=>t.type==='cash_deposit').reduce((s,t) => s+(t.amount||0), 0);
  const bankExpenses = allExpenses.filter(e=>e.status==='approved').reduce((s,e)=>{
    if(e.paymentMethod==='bank_transfer') return s+(e.amount||0);
    if(e.paymentMethod==='split') return s+(e.bankAmount||0);
    return s;
  }, 0);
  const paidRems = allRemittances.filter(r=>r.status==='paid').reduce((s,r) => s+(r.amount||0), 0);
  const bankWithdrawals = cashTx.filter(t=>t.type==='withdrawal').reduce((s,t) => s+(t.amount||0), 0);
  // Petty top-ups via bank transfer leave the bank account
  const pettyBankTopups = pettyHistory.filter(h=>h.type==='refill'&&(h.paymentMethod==='bank_transfer'||(h.paymentMethod==='split'&&(h.bankAmount||0)>0)))
    .reduce((s,h)=>s+(h.paymentMethod==='split'?(h.bankAmount||0):(h.amount||0)),0);
  const bankBalance = bankTransferIncome + cashDepositedToBank - bankExpenses - paidRems - bankWithdrawals - pettyBankTopups;

  // --- CASH WITH ACCOUNTANT ---
  const cashFromCollections = allIncome.reduce((s,r) => {
    const isSunday = !r.source || r.source==='sunday_collection';
    if(isSunday) return s + getSundayCashWithAccountant(r, remRates);
    const btAmt = r.bankTransferAmount||0;
    const dpAmt = r.directPettyCash||0;
    return s + Math.max(0, (r.totalCollection||0) - btAmt - dpAmt);
  }, 0);
  const bankToAccountant = cashTx.filter(t=>t.type==='withdrawal' && t.destination==='accountant_cash').reduce((s,t) => s+(t.amount||0), 0);
  const cashExpenses = allExpenses.filter(e=>e.status==='approved').reduce((s,e)=>{
    if(e.paymentMethod==='cash') return s+(e.amount||0);
    if(e.paymentMethod==='split') return s+(e.cashAmount||0);
    return s;
  }, 0);
  // Petty top-ups via accountant's cash reduce the accountant's cash holding
  const pettyCashTopups = pettyHistory.filter(h=>h.type==='refill'&&(h.status==='approved'||h.status==='settled')&&(h.paymentMethod==='cash_accountant'||(h.paymentMethod==='split'&&(h.cashAmount||0)>0)))
    .reduce((s,h)=>s+(h.paymentMethod==='split'?(h.cashAmount||0):(h.amount||0)),0);
  const cashWithAccountantRaw = cashFromCollections - cashDepositedToBank + bankToAccountant - cashExpenses - pettyCashTopups;

  // --- PETTY CASH (with Admin Officer) ---
  // pettyFloat can be negative — means Admin Officer spent personal money and church owes them
  const pettyFloat = petty.float;

  return {
    cashWithAccountant: Math.max(0, cashWithAccountantRaw),
    // cashDeficit > 0 means cash outflows (approved + pending) exceed recorded cash inflows —
    // accountant has disbursed more cash than received; pending expenses awaiting approval contribute here
    cashDeficit: Math.max(0, -cashWithAccountantRaw),
    bankBalance,
    pettyFloat,
    total: cashWithAccountantRaw + bankBalance + pettyFloat
  };
}

async function renderDashboard(){
  const [allIncomeDash,allExpensesDash,pettyHistDash,settingsDash,allRemsDash,pettyConfigDash,remRatesDash] = await Promise.all([DB.getIncome(),DB.getExpenses(),DB.getPetty(),DB.getSettings(),DB.getRemittances(),DB.getPettyConfig(),getRemRates()]);
  const settings = settingsDash;
  const { from: dashPeriodFrom, to: dashPeriodTo } =
    computeRemPeriodDates(settings, allRemsDash, state.year, state.month);
  const useRemPeriod = state.dashPeriodMode === 'remittance';
  const income   = useRemPeriod ? filterByDateRange(allIncomeDash,   dashPeriodFrom, dashPeriodTo) : filterByMonth(allIncomeDash);
  const expenses = useRemPeriod ? filterByDateRange(allExpensesDash, dashPeriodFrom, dashPeriodTo) : filterByMonth(allExpensesDash);
  const petty = { history: pettyHistDash, float: pettyConfigDash.float, max: pettyConfigDash.max };
  const allIncome = allIncomeDash;
  const allExpenses = allExpensesDash;

  const totalIncome = income.reduce((s,r)=>s+(r.totalCollection||0),0);
  const totalExpenses = expenses.reduce((s,r)=>s+(r.amount||0),0);
  const remittances = await calcRemittancesFromRecords(income);
  const dashQuotas = getQuotaList(settings);
  const dashRegionalQuota = dashQuotas.find(q=>q.label.toLowerCase().includes('regional contribution'));
  const dashMummyQuota   = dashQuotas.find(q=>q.label.toLowerCase().includes('mummy'));
  const dashRegionalAmt  = dashRegionalQuota ? (dashRegionalQuota.amount||0) : 0;
  const dashMummyAmt     = dashMummyQuota    ? (dashMummyQuota.amount||0)    : 0;
  const dashNatlQuotasAmt = dashQuotas
    .filter(q=>q!==dashRegionalQuota && q!==dashMummyQuota)
    .reduce((s,q)=>s+(q.amount||0),0);
  const dashAllQuotasAmt = dashNatlQuotasAmt + dashRegionalAmt + dashMummyAmt;
  const netLocal = remittances.netLocal - dashAllQuotasAmt;
  const dashRemRates = remRatesDash?.rates || DEFAULT_REMITTANCE_RATES;
  const dashSundayRecs = income.filter(r => !r.source || r.source === 'sunday_collection');
  const dashChildrenTeacherTotal = dashSundayRecs.reduce((s, r) => s + getChildrenTeacherHeldCash(r, dashRemRates), 0);
  // Check if the current month's remittance has already been paid or partially paid.
  // A remittance is considered "for this month" when its periodTo falls within the viewed year/month.
  const dashMonthPrefix = `${state.year}-${String(state.month+1).padStart(2,'0')}`;
  const dashMonthPaidRems = allRemsDash.filter(r=>r.status==='paid' && (r.periodTo||'').startsWith(dashMonthPrefix));
  const dashMonthPaidAmt = dashMonthPaidRems.reduce((s,r)=>s+(r.amount||0),0);
  // Current month due (used only for paid/partial status label).
  const dashCurrentMonthRemDue = (remittances.totalNatl||0)+(remittances.totalArea||0)+(remittances.totalPastor||0)
    +(remittances.totalMinisters||0)+(remittances.totalSeed||0)+(remittances.provinceRebate||0)+dashAllQuotasAmt;
  const dashKpiIsPaid = dashMonthPaidAmt > 0 && dashMonthPaidAmt >= dashCurrentMonthRemDue * PAYMENT_TOLERANCE_THRESHOLD;
  const dashKpiIsPartial = dashMonthPaidAmt > 0 && !dashKpiIsPaid;
  const dashDueLabel = getRemittanceDueLabel(settings, state.year, state.month,
    { isPaid: dashKpiIsPaid, isPartial: dashKpiIsPartial, paidAmount: dashMonthPaidAmt });
  // Accumulated unpaid: remittances owed on ALL income ever collected, minus everything already paid.
  const dashAllTimeRemittances = await calcRemittancesFromRecords(allIncomeDash);
  const dashAllTimeIncomeRemDue = (dashAllTimeRemittances.totalNatl||0)+(dashAllTimeRemittances.totalArea||0)
    +(dashAllTimeRemittances.totalPastor||0)+(dashAllTimeRemittances.totalMinisters||0)
    +(dashAllTimeRemittances.totalSeed||0)+(dashAllTimeRemittances.provinceRebate||0);
  // Accumulate quotas by counting remittance PERIODS (cut-off to cut-off), not calendar months.
  // A period ends on a monthly cut-off date; counting calendar months over-counts when one period
  // spans two calendar months (e.g. Apr 20 – May 24 is ONE period, not two).
  const dashFirstIncRec = allIncomeDash.length > 0 ? allIncomeDash[allIncomeDash.length-1] : null;
  const dashFirstDate = dashFirstIncRec ? new Date(dashFirstIncRec.date||dashFirstIncRec.createdAt) : new Date(state.year, state.month, 1);
  const dashFirstDateStr = (dashFirstIncRec ? (dashFirstIncRec.date||dashFirstIncRec.createdAt||'') : '').slice(0,10);
  let dashQuotaPeriods = 0;
  if(dashFirstIncRec){
    let fy=dashFirstDate.getFullYear(), fm=dashFirstDate.getMonth();
    let y=fy, m=fm;
    while(y<state.year||(y===state.year&&m<=state.month)){
      // Try year-specific cut-off first, fall back to default (year-agnostic lookup via remCutoffDayForMonth)
      const cd=getRemCutoffDates(settingsDash,y)||getRemCutoffDates(settingsDash);
      const cutDay=cd?.dates?.[m]||null;
      if(cutDay){
        const cutStr=`${y}-${String(m+1).padStart(2,'0')}-${String(cutDay).padStart(2,'0')}`;
        if(cutStr>dashFirstDateStr) dashQuotaPeriods++;
      } else {
        dashQuotaPeriods++; // no cut-off configured: treat each calendar month as one period
      }
      m++; if(m>11){m=0;y++;}
    }
    dashQuotaPeriods=Math.max(1,dashQuotaPeriods);
  }
  const dashMonthsElapsed = dashQuotaPeriods;
  const dashAccumQuotas = dashAllQuotasAmt * dashQuotaPeriods;
  const dashAllPaidRems = allRemsDash.filter(r=>r.status==='paid').reduce((s,r)=>s+(r.amount||0),0);
  // KPI = total ever owed (all income + accumulated quotas) minus total ever paid = net unpaid.
  const dashTotalRemDueKpi = Math.max(0, dashAllTimeIncomeRemDue + dashAccumQuotas - dashAllPaidRems);
  // Income from periods not yet covered by a paid remittance — denominator for the % metric.
  const dashPaidPeriods = allRemsDash.filter(r=>r.status==='paid'&&r.periodFrom&&r.periodTo).map(r=>({from:r.periodFrom,to:r.periodTo}));
  const dashUnpaidPeriodIncome = allIncomeDash.filter(r=>{
    const d=r.date||r.createdAt||'';
    return !d||!dashPaidPeriods.some(p=>d>=p.from&&d<=p.to);
  }).reduce((s,r)=>s+(r.totalCollection||0),0);
  const churchBal = await calcChurchBalance();
  const pendingPetty = await getPettyCashPendingCount();
  const overdueRems = allRemsDash.filter(r=>r.status==='overdue').length;

  // Spendable = total church funds − net accumulated unpaid remittances.
  const dashOutstandingRems = dashTotalRemDueKpi;
  const dashTotalFunds = churchBal.total;
  const dashSpendable = dashTotalFunds - dashOutstandingRems;
  const dashSpendStrong   = parseFloat(settingsDash?.spendableStrong||0)||40000;
  const dashSpendModerate = parseFloat(settingsDash?.spendableModerate||0)||20000;
  const dashSpendVeryLow  = parseFloat(settingsDash?.spendableVeryLow||0)||10000;
  const dashSpendLabel = dashSpendable < 0 ? 'Deficit - Critical'
    : dashSpendable < dashSpendVeryLow  ? 'Very Low'
    : dashSpendable < dashSpendModerate ? 'Low'
    : dashSpendable < dashSpendStrong   ? 'Moderate'
    : 'Strong';
  const dashSpendColor = dashSpendable < 0 ? 'var(--danger)'
    : dashSpendable < dashSpendVeryLow  ? '#D97706'
    : dashSpendable < dashSpendModerate ? '#B8860B'
    : dashSpendable < dashSpendStrong   ? '#2d7f5e'
    : 'var(--success)';

  // Reconciliation card figures — include ALL expenses (approved + pending) for the period
  const totalPeriodApprExpenses = expenses
    .filter(e => e.status === 'approved')
    .reduce((s, e) => s + (e.amount || 0), 0);
  const totalPeriodPendingExpenses = expenses
    .filter(e => e.status === 'pending')
    .reduce((s, e) => s + (e.amount || 0), 0);
  const totalPeriodAllExpenses = totalPeriodApprExpenses + totalPeriodPendingExpenses;
  // Carried forward = churchBal − (income − approved-expenses for period).
  // Must use approved-only to match calcChurchBalance (pending expenses don't reduce balances yet).
  const dashCarriedForward = churchBal.total - totalIncome + totalPeriodApprExpenses;
  const dashPrevMonthName = MONTHS[state.month === 0 ? 11 : state.month - 1];
  // Label for the Carried Forward card — "after last remittance (19 Apr)" or "after last month (31 Mar)"
  const _pStart = new Date(dashPeriodFrom + 'T00:00:00');
  const _dayBefore = new Date(_pStart); _dayBefore.setDate(_dayBefore.getDate() - 1);
  const _lastDayPrevMo = new Date(state.year, state.month, 0);
  const dashCarriedFwdDateStr = useRemPeriod
    ? `${_dayBefore.getDate()} ${MONTHS[_dayBefore.getMonth()].slice(0,3)}`
    : `${_lastDayPrevMo.getDate()} ${MONTHS[_lastDayPrevMo.getMonth()].slice(0,3)}`;
  const dashCarriedFwdLabel = useRemPeriod
    ? `Balance after last remittance (${dashCarriedFwdDateStr})`
    : `Balance after last month (${dashCarriedFwdDateStr})`;

  // Feed items — richer detail for Recent Transactions card
  const recentIncome = allIncome.slice(0,4);
  const recentExp = allExpenses.slice(0,4);
  const recentRems = allRemsDash.filter(r=>r.status==='paid').slice(0,3);
  const recentPetty = pettyHistDash.filter(h=>h.type==='disbursement'&&h.status==='approved').slice(0,2);
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
      const c=EXPENSE_CATS.find(x=>x.key===r.category)||{label:r.category||'Expense',icon:'💸'};
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
  const sundayCount = countSundaysInMonth(state.year, state.month);

  const expByCat = {};
  expenses.forEach(e=>{ expByCat[e.category]=(expByCat[e.category]||0)+(e.amount||0) });
  const topCats = Object.entries(expByCat).sort((a,b)=>b[1]-a[1]).slice(0,7);
  const maxCat = topCats[0]?.[1]||1;

  // Alerts
  let alerts='';
  if(overdueRems>0) alerts+=`<div class="alert alert-danger"><span class="alert-icon">⚠</span><span>${overdueRems} remittance(s) are <strong>overdue</strong>. Please process immediately.</span></div>`;
  if(pendingPetty>0) alerts+=`<div class="alert alert-warn"><span class="alert-icon">⏳</span><span>${pendingPetty} petty cash request(s) awaiting approval. <button class="btn btn-sm" onclick="App.navigate('petty_cash')" style="margin-left:8px">Review</button></span></div>`;
  if(churchBal.bankBalance<50000 && churchBal.bankBalance>0) alerts+=`<div class="alert alert-warn"><span class="alert-icon">💰</span><span>Church balance is running low. Consider notifying the KPSC if remittances cannot be covered.</span></div>`;

  // Monthly trend (last 4 months) — income, expenses, and netLocal retained
  // Compute historical netLocal in parallel for accurate retention rates and chart visualisation
  const histMonthRetention=await Promise.all([3,2,1].map(async i=>{
    let m=state.month-i,y=state.year;
    if(m<0){m+=12;y--;}
    let mInc;
    if(useRemPeriod){const{from:pf,to:pt}=computeRemPeriodDates(settings,allRemsDash,y,m);mInc=filterByDateRange(allIncomeDash,pf,pt);}
    else{mInc=allIncomeDash.filter(r=>{const d=new Date(r.date||r.createdAt);return d.getMonth()===m&&d.getFullYear()===y;});}
    const mTotal=mInc.reduce((s,r)=>s+(r.totalCollection||0),0);
    if(!mTotal) return {netLocal:0,retentionRate:null};
    const mRem=await calcRemittancesFromRecords(mInc);
    const mNet=mRem.netLocal-dashAllQuotasAmt;
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
  const totalSundaysFullMonth=fullMonthSundays(state.year,state.month);
  const remainingSundays=Math.max(0,totalSundaysFullMonth-sundayCount);
  const histMonths=[];
  for(let i=3;i>=1;i--){let m=state.month-i,y=state.year;if(m<0){m+=12;y--;}
    let hInc;
    if(useRemPeriod){const{from:pf,to:pt}=computeRemPeriodDates(settings,allRemsDash,y,m);hInc=filterByDateRange(allIncomeDash,pf,pt);}
    else{hInc=allIncomeDash.filter(r=>{const d=new Date(r.date||r.createdAt);return d.getMonth()===m&&d.getFullYear()===y;});}
    const hSundayRecs=hInc.filter(r=>!r.source||r.source==='sunday_collection');
    const hSundays=hSundayRecs.length>0?hSundayRecs.length:fullMonthSundays(y,m);
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
  if(currentRate!==null||historicalRate!==null){
    // Blend: current month rate gains weight as more Sundays are recorded
    const cw=sundayCount*2, hw=Math.max(1,6-cw);
    const blendedRate=currentRate!==null&&historicalRate!==null
      ?(currentRate*cw+historicalRate*hw)/(cw+hw)
      :(currentRate??historicalRate);
    const proj=trendData[3].income+remainingSundays*blendedRate;
    // Income spread: std dev of all known per-Sunday rates × full month Sunday count
    const allRates=[...validHist.map(h=>h.income/h.sundays),...(currentRate!==null?[currentRate]:[])];
    let incomeSpread;
    if(allRates.length>=2){
      const meanR=allRates.reduce((s,r)=>s+r,0)/allRates.length;
      incomeSpread=Math.sqrt(allRates.reduce((s,r)=>s+(r-meanR)**2,0)/allRates.length)*totalSundaysFullMonth;
    }else{
      incomeSpread=proj*0.10; // 10% floor — single data point
    }
    forecastIncome={min:Math.max(0,Math.round(proj-incomeSpread)),max:Math.round(proj+incomeSpread)};
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
    // Expense spread: std dev of actual monthly totals
    const validExp=histMonths.filter(h=>h.expenses>0);
    if(validExp.length>0){
      const ewts=validExp.map((_,i)=>i+1);
      const avgExp=validExp.reduce((s,h,i)=>s+ewts[i]*h.expenses,0)/ewts.reduce((s,w)=>s+w,0);
      let expSpread;
      if(validExp.length>=2){
        const expMean=validExp.reduce((s,h)=>s+h.expenses,0)/validExp.length;
        expSpread=Math.sqrt(validExp.reduce((s,h)=>s+(h.expenses-expMean)**2,0)/validExp.length);
      }else{
        expSpread=avgExp*0.20; // 20% floor — single data point
      }
      forecastExpenses={min:Math.max(0,Math.round(avgExp-expSpread)),max:Math.round(avgExp+expSpread)};
    }
  }

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div>
        <div class="page-title">Welcome, ${state.user?.name?.split(' ')[0]||'User'} 👋</div>
        <div class="page-sub">${monthLabel()} Financial Overview</div>
        <div style="margin-top:10px">
          <div style="font-size:10.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:7px">Select Period Type</div>
          <div style="display:flex;border-radius:10px;overflow:hidden;border:1.5px solid var(--border);background:var(--bg)">
            <button onclick="App.setDashPeriodMode('remittance')" style="flex:1;padding:9px 12px;border:none;border-right:1.5px solid var(--border);background:${useRemPeriod?'var(--surface)':'transparent'};cursor:pointer;text-align:left;outline:none;transition:background 0.15s">
              <div style="font-size:12.5px;font-weight:700;color:${useRemPeriod?'var(--primary)':'var(--text2)'}">${MONTHS[state.month]} Remittance Period</div>
              <div style="font-size:10.5px;color:var(--text3);margin-top:2px">the custom RCCG period (${fmtDate(dashPeriodFrom)} – ${fmtDate(dashPeriodTo)})</div>
            </button>
            <button onclick="App.setDashPeriodMode('calendar')" style="flex:1;padding:9px 12px;border:none;background:${!useRemPeriod?'var(--surface)':'transparent'};cursor:pointer;text-align:left;outline:none;transition:background 0.15s">
              <div style="font-size:12.5px;font-weight:700;color:${!useRemPeriod?'var(--primary)':'var(--text2)'}">${MONTHS[state.month]} Calendar Period</div>
              <div style="font-size:10.5px;color:var(--text3);margin-top:2px">the normal month period (1 ${MONTHS[state.month].slice(0,3)} – ${new Date(state.year,state.month+1,0).getDate()} ${MONTHS[state.month].slice(0,3)})</div>
            </button>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${canAction('income_record')?`<button class="btn btn-primary" onclick="App.navigate('income')">📥 Record Income</button>`:''}
        ${!canAction('income_record')&&canAction('expense_log')?`<button class="btn btn-primary" onclick="App.navigate('expenses')">💸 Log Expenses</button>`:''}
      </div>
    </div>

    ${alerts}

    <div class="dash-flow" style="display:flex;flex-direction:column;margin-bottom:16px">

      <!-- 1. Opening Balance — compact ledger anchor, not the headline figure -->
      <div style="background:rgba(99,102,241,0.05);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:10px 16px 10px 20px;position:relative;overflow:hidden">
        <div style="position:absolute;left:0;top:0;bottom:0;width:3px;background:#6366F1;border-radius:3px 0 0 3px"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div style="min-width:0;flex:1">
            <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#6366F1;margin-bottom:1px">${dashCarriedFwdLabel}</div>
            <div style="font-size:11px;color:var(--text3)">Opening balance at the start of this period</div>
          </div>
          <div style="font-size:20px;font-weight:800;color:${dashCarriedForward<0?'var(--danger)':'#4F46E5'};letter-spacing:-0.5px;white-space:nowrap;flex-shrink:0">${fmt(dashCarriedForward)}</div>
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
            <div style="font-size:26px;font-weight:800;color:var(--success);letter-spacing:-0.5px;line-height:1.15">${fmt(totalIncome)}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:5px">↑ ${income.length} record(s) received</div>
          </div>
          <div style="width:44px;height:44px;border-radius:12px;background:#E1F5EE;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📥</div>
        </div>
        ${totalIncome > 0 ? `<div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:rgba(29,158,117,0.06);border:1px dashed rgba(29,158,117,0.3)">
          <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:7px">How this income splits</div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;margin-bottom:5px">
            <span style="color:var(--text2)">🏛 Parish retains</span>
            <span style="font-weight:700;color:#1D9E75">${fmt(Math.max(0,netLocal))} <span style="font-size:11px;font-weight:600;color:var(--text3)">(${Math.round(Math.max(0,netLocal)/totalIncome*100)}%)</span></span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px">
            <span style="color:var(--text2)">📤 RCCG HQ share</span>
            <span style="font-weight:600;color:var(--text3)">${fmt(Math.max(0,totalIncome-Math.max(0,netLocal)))}</span>
          </div>
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
            <div style="font-size:26px;font-weight:800;color:var(--danger);letter-spacing:-0.5px;line-height:1.15">${fmt(totalPeriodAllExpenses)}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:5px">${expenses.filter(e=>e.status==='approved').length} approved${totalPeriodPendingExpenses>0?` · <span style="color:var(--amber);font-weight:600">${expenses.filter(e=>e.status==='pending').length} pending (${fmt(totalPeriodPendingExpenses)})</span>`:''}</div>
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
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text3);margin-bottom:6px">Total Church Balance</div>
            <div style="font-size:28px;font-weight:800;color:${churchBal.total<0?'var(--danger)':'#185FA5'};letter-spacing:-0.5px;line-height:1.15">${fmt(churchBal.total)}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:5px">Actual money on hand right now</div>
          </div>
          <div style="width:44px;height:44px;border-radius:12px;background:#EAF3DE;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🏛️</div>
        </div>
        <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--border);font-size:12.5px;color:var(--text2);line-height:1.9">
          <a onclick="App.navigate('bank')" style="cursor:pointer;text-decoration:none;color:inherit;display:flex;align-items:center;justify-content:space-between">
            <span><span style="display:inline-block;width:8px;height:8px;background:#185FA5;border-radius:50%;margin-right:8px"></span>Bank</span>
            <span style="font-weight:600">${fmt(churchBal.bankBalance)}</span>
          </a>
          <a onclick="App.setIncomeTab('all');App.navigate('income')" style="cursor:pointer;text-decoration:none;color:inherit;display:flex;align-items:center;justify-content:space-between">
            <span><span style="display:inline-block;width:8px;height:8px;background:${churchBal.cashDeficit>0?'var(--danger)':'#BA7517'};border-radius:50%;margin-right:8px"></span>${churchBal.cashDeficit>0?'<span style="color:var(--danger);font-weight:600">Cash with Accountant ⚠ Owes</span>':'Cash with Accountant'}</span>
            <span style="font-weight:600;color:${churchBal.cashDeficit>0?'var(--danger)':'inherit'}">${churchBal.cashDeficit>0?'−'+fmt(churchBal.cashDeficit):fmt(churchBal.cashWithAccountant)}</span>
          </a>
          <a onclick="App.navigate('petty_cash')" style="cursor:pointer;text-decoration:none;color:inherit;display:flex;align-items:center;justify-content:space-between">
            <span><span style="display:inline-block;width:8px;height:8px;background:${churchBal.pettyFloat<0?'var(--danger)':'#1D9E75'};border-radius:50%;margin-right:8px"></span>${churchBal.pettyFloat<0?'<span style="color:var(--danger);font-weight:600">Petty Cash ⚠ Owes Admin Officer</span>':'Petty Cash'}</span>
            <span style="font-weight:600;color:${churchBal.pettyFloat<0?'var(--danger)':'inherit'}">${fmt(churchBal.pettyFloat)}</span>
          </a>
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
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text3);margin-bottom:6px">RCCG Remittances Due</div>
            <div style="font-size:26px;font-weight:800;color:var(--danger);letter-spacing:-0.5px;line-height:1.15">${fmt(dashTotalRemDueKpi)}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:5px">📅 ${dashDueLabel}</div>
            ${dashMonthsElapsed>1?`<div style="margin-top:6px;font-size:11.5px;color:var(--amber);font-weight:600">⚠ Accumulated since ${fmtDate(dashFirstIncRec.date||dashFirstIncRec.createdAt)}</div>`:''}
            <div style="margin-top:4px;font-size:11.5px;color:var(--amber)">${dashUnpaidPeriodIncome>0?Math.round(dashTotalRemDueKpi/dashUnpaidPeriodIncome*100):0}% of unpaid period income</div>
          </div>
          <div style="width:44px;height:44px;border-radius:12px;background:#FCEBEB;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">📤</div>
        </div>
      </div>

      <!-- = connector to Final -->
      <div style="display:flex;justify-content:center;align-items:center;height:36px;position:relative">
        <div style="position:absolute;left:50%;top:0;bottom:0;width:1.5px;background:var(--border);transform:translateX(-50%)"></div>
        <div style="background:var(--surface);border:1.5px solid ${dashSpendColor};border-radius:14px;padding:4px 12px;font-size:11px;font-weight:700;color:${dashSpendColor};letter-spacing:0.8px;text-transform:uppercase;z-index:1;position:relative;display:flex;align-items:center;gap:6px">
          <span style="font-size:14px">=</span><span>Actual Balance</span>
        </div>
      </div>

      <!-- 6. Available Fund After All Deductions (final answer) -->
      <div class="flow-card" style="background:${dashSpendable<0?'rgba(163,45,45,0.04)':dashSpendable<dashSpendModerate?'rgba(184,134,11,0.04)':'rgba(29,158,117,0.04)'};border:1.5px solid ${dashSpendColor}55;border-radius:14px;padding:18px 20px;position:relative;overflow:hidden">
        <div style="position:absolute;left:0;top:0;bottom:0;width:5px;background:${dashSpendColor}"></div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px">
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text3);margin-bottom:6px">Available Fund After All Deductions</div>
            <div style="font-size:32px;font-weight:800;color:${dashSpendColor};letter-spacing:-0.8px;line-height:1.1">${fmt(dashSpendable)}</div>
            <div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;background:${dashSpendColor}22;font-size:11.5px;font-weight:700;color:${dashSpendColor}">
                ${dashSpendLabel}
              </span>
            </div>
          </div>
          <div style="width:44px;height:44px;border-radius:12px;background:${dashSpendColor}22;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${dashSpendable<0?'🔴':dashSpendable<dashSpendVeryLow?'🟠':dashSpendable<dashSpendModerate?'🟡':dashSpendable<dashSpendStrong?'🟩':'🟢'}</div>
        </div>
        <div style="margin-top:14px;padding-top:12px;border-top:1px dashed ${dashSpendColor}33">
          <div style="height:8px;background:var(--bg);border-radius:4px;overflow:hidden;border:1.5px solid ${dashSpendColor}55">
            <div style="height:100%;width:${dashTotalFunds>0?Math.min(100,Math.max(0,dashSpendable/dashTotalFunds*100)).toFixed(1):0}%;background:${dashSpendColor};border-radius:4px;transition:width 0.5s"></div>
          </div>
          <div style="margin-top:6px;font-size:11px;color:var(--text3);display:flex;justify-content:space-between">
            <span>${fmt(dashOutstandingRems)} still due to HQ</span>
            <span>${dashTotalFunds>0?Math.round(dashSpendable/dashTotalFunds*100):0}% of balance</span>
          </div>
        </div>
      </div>

    </div>

    <!-- Collapsible full calculation breakdown -->
    <details style="margin-bottom:16px">
      <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);font-size:12.5px;font-weight:600;color:var(--text2);user-select:none">
        <span style="font-size:16px">🧮</span>
        <span>How is Actual Balance calculated?</span>
        <span style="margin-left:auto;font-size:11px;color:var(--text3)">Tap to expand ▾</span>
      </summary>
      <div style="padding:16px 18px;background:var(--surface);border:1px solid var(--border);border-top:none;border-radius:0 0 var(--rl) var(--rl)">
        <div style="font-size:12px;line-height:2.3;color:var(--text2)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="color:var(--text3)">${dashCarriedFwdLabel}</span>
            <span style="font-weight:600;font-family:ui-monospace,monospace;color:${dashCarriedForward<0?'var(--danger)':'#4F46E5'}">${fmt(dashCarriedForward)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="color:var(--text3)">+ Total Income</span>
            <span style="font-weight:600;font-family:ui-monospace,monospace;color:var(--success)">${fmt(totalIncome)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center${totalPeriodPendingExpenses>0?'':';border-bottom:1.5px dashed var(--border);padding-bottom:6px'}">
            <span style="color:var(--text3)">− Approved Expenses</span>
            <span style="font-weight:600;font-family:ui-monospace,monospace;color:var(--danger)">−${fmt(totalPeriodApprExpenses)}</span>
          </div>
          ${totalPeriodPendingExpenses>0?`<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px dashed var(--border);padding-bottom:6px;font-size:11px">
            <span style="color:var(--text3)">⏳ + ${expenses.filter(e=>e.status==='pending').length} pending (not yet in balances)</span>
            <span style="font-family:ui-monospace,monospace;color:#B8860B">+${fmt(totalPeriodPendingExpenses)}</span>
          </div>`:''}
          <div style="display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:13px;padding-top:2px">
            <span>= Total Church Balance</span>
            <span style="font-family:ui-monospace,monospace;color:#185FA5">${fmt(churchBal.total)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px dashed var(--border);padding-bottom:6px">
            <span style="color:var(--text3)">− RCCG Remittances Due</span>
            <span style="font-weight:600;font-family:ui-monospace,monospace;color:var(--danger)">−${fmt(dashTotalRemDueKpi)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:14px;padding-top:2px">
            <span>= Actual Balance</span>
            <span style="font-family:ui-monospace,monospace;color:${dashSpendColor}">${fmt(dashSpendable)}</span>
          </div>
        </div>
        <div style="margin-top:12px;font-size:11px;color:var(--text3);line-height:1.6;border-top:1px solid var(--border);padding-top:10px">
          Each row matches a card above. Pending expenses are shown separately — they don't reduce bank/cash balances until approved.
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
      <div>
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
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text3);margin-bottom:8px">${MONTHS[state.month].toUpperCase()} FORECAST <span style="font-weight:400;text-transform:none;letter-spacing:0">(${forecastLabel} · ${remainingSundays} Sunday${remainingSundays!==1?'s':''} remaining)</span></div>
            <div style="display:flex;gap:8px;margin-bottom:${forecastExpenses?'8px':'0'}">
              <div style="flex:1;padding:8px 10px;background:rgba(29,158,117,0.06);border-radius:8px;border:1px solid rgba(29,158,117,0.18)">
                <div style="font-size:10px;color:var(--text3);margin-bottom:3px">Expected Income</div>
                <div style="font-size:13px;font-weight:700;color:var(--primary)">${fmtShort(forecastIncome.min)} – ${fmtShort(forecastIncome.max)}</div>
              </div>
              ${forecastRetained?`
              <div style="flex:1;padding:8px 10px;background:rgba(186,117,23,0.06);border-radius:8px;border:1px solid rgba(186,117,23,0.18)">
                <div style="font-size:10px;color:var(--text3);margin-bottom:3px">Expected Retained</div>
                <div style="font-size:13px;font-weight:700;color:#BA7517">${fmtShort(forecastRetained.min)} – ${fmtShort(forecastRetained.max)}</div>
              </div>`:''}
            </div>
            ${forecastExpenses?`
            <div style="padding:8px 10px;background:rgba(163,45,45,0.06);border-radius:8px;border:1px solid rgba(163,45,45,0.18)">
              <div style="font-size:10px;color:var(--text3);margin-bottom:3px">Expected Expenses</div>
              <div style="font-size:13px;font-weight:700;color:var(--danger)">${fmtShort(forecastExpenses.min)} – ${fmtShort(forecastExpenses.max)}</div>
            </div>`:''}
          </div>`:''}
        </div>
      </div>

      <div>
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

        <div class="card">
          <div class="card-header"><span class="card-title">Expense Breakdown</span><span style="color:var(--text3);font-size:11px">This month</span></div>
          ${topCats.length?topCats.map(([cat,amt])=>{
            const c=EXPENSE_CATS.find(e=>e.key===cat)||{label:cat,color:'#888',icon:''};
            return `<div class="exp-row"><div class="exp-label">${c.icon||''} ${c.label}</div><div class="progress-bar"><div class="progress-fill" style="width:${Math.round(amt/maxCat*100)}%;background:${c.color}"></div></div><div class="exp-val">${fmt(amt)}</div></div>`;
          }).join('')+`<div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:10px;margin-top:4px"><span style="font-size:13px;font-weight:600;color:var(--text2)">Total expenses</span><span style="font-size:16px;font-weight:700;color:var(--danger)">${fmt(totalExpenses)}</span></div>`
          :'<div class="empty-table">No expenses recorded this month.</div>'}
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Remittance Summary</span></div>
          <div class="status-row"><div><div class="status-row-label">National HQ</div></div><div class="status-row-right"><div class="status-row-amt">${fmt(remittances.totalNatl+dashNatlQuotasAmt)}</div></div></div>
          <div class="status-row"><div><div class="status-row-label">Regional</div></div><div class="status-row-right"><div class="status-row-amt">${fmt(dashRegionalAmt)}</div></div></div>
          <div class="status-row"><div><div class="status-row-label">Provincial</div></div><div class="status-row-right"><div class="status-row-amt">${fmt(remittances.provinceRebate)}</div></div></div>
          <div class="status-row"><div><div class="status-row-label">Pastor Family</div></div><div class="status-row-right"><div class="status-row-amt">${fmt((remittances.totalPastor||0)+(remittances.totalSeed||0)+(remittances.totalArea||0)+dashMummyAmt)}</div></div></div>
          <div class="status-row"><div><div class="status-row-label">Ministers</div></div><div class="status-row-right"><div class="status-row-amt">${fmt(remittances.totalMinisters)}</div></div></div>
          <div class="status-row" style="border-top:2px solid var(--border);margin-top:4px;padding-top:12px"><div><div class="status-row-label fw-bold">Net Local Retained</div></div><div class="status-row-right"><div class="status-row-amt" style="color:var(--primary);font-size:15px">${fmt(netLocal)}</div></div></div>
        </div>
      </div>
    </div>`;
}

async function calcRemittancesFromRecords(records){
  const combined = {};
  INCOME_TYPES.forEach(t=>{ combined[t.key]=0 });
  records.forEach(r=>{ INCOME_TYPES.forEach(t=>{ combined[t.key]+=(r[t.key]||0) }) });
  return await calcRemittances(combined);
}

// ── INCOME ────────────────────────────────
async function renderIncome(){
  const [allIncomeRecs, _cashTx, remRatesData, balance] = await Promise.all([DB.getIncome(), DB.getCashTransactions(), getRemRates(), calcChurchBalance()]);
  const remRates = remRatesData.rates || DEFAULT_REMITTANCE_RATES;
  const cashWithAccountant = balance.cashWithAccountant;
  const records = filterByMonth(allIncomeRecs);
  const sundayRecs = records.filter(r=>!r.source||r.source==='sunday_collection');
  const otherRecs  = records.filter(r=>r.source && r.source!=='sunday_collection');
  const tab = state.incomeTab||'list';
  // Pending count for this month's income records (informational only)
  const pendingItems = records.map(r=>{
    const isSunday = !r.source||r.source==='sunday_collection';
    const cashHeld = isSunday
      ? getSundayCashWithAccountant(r, remRates)
      : r.paymentMethod==='cash' ? (r.totalCollection||0) : 0;
    const dep = _cashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
    return { cashHeld, dep };
  }).filter(p=>p.cashHeld>0 && p.dep<p.cashHeld);
  const pendingCount = pendingItems.length;
  const totalCollected = records.reduce((s,r)=>s+(r.totalCollection||0),0);
  // Only count deposits linked to this month's income records (scoped correctly to the month view)
  const currentMonthRecordIds = new Set(records.map(r=>r.id));
  const totalDeposited = _cashTx.filter(t=>t.type==='cash_deposit'&&currentMonthRecordIds.has(t.incomeRef)).reduce((s,t)=>s+(t.amount||0),0)
    + records.reduce((s,r)=>s+(r.bankTransferAmount||0),0);

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Income Recording</div><div class="page-sub">${monthLabel()}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${canAction('income_record')?`<button class="btn btn-primary" onclick="App.showIncomeForm()">📥 Sunday Collections</button>`:''}
        ${canAction('income_record')?`<button class="btn btn-amber" onclick="App.showOtherIncomeForm()">➕ Other Income</button>`:''}
        ${canAction('income_deposit')&&cashWithAccountant>0?`<button class="btn btn-amber" onclick="App.confirmBulkDeposit()">💰 Deposit Cash (${fmt(cashWithAccountant)})</button>`:''}
      </div>
    </div>
    <div class="kpi-grid" style="margin-bottom:16px">
      <div class="kpi"><div class="kpi-icon" style="background:#E1F5EE">📥</div><div class="kpi-label">Total Collected</div><div class="kpi-val">${fmt(totalCollected)}</div><div class="kpi-delta up">${records.length} record(s)</div></div>
      <div class="kpi"><div class="kpi-icon" style="background:#FAEEDA">💵</div><div class="kpi-label">Cash with Accountant</div><div class="kpi-val" style="color:${cashWithAccountant>0?'var(--amber)':'var(--primary)'}">${fmt(cashWithAccountant)}</div><div class="kpi-delta ${cashWithAccountant>0?'warn':'up'}">${cashWithAccountant>0?'Awaiting bank deposit':'All deposited ✓'}</div></div>
      <div class="kpi"><div class="kpi-icon" style="background:#EAF3DE">🏦</div><div class="kpi-label">In Bank (this month)</div><div class="kpi-val">${fmt(totalDeposited)}</div><div class="kpi-delta up">Transfers + deposits</div></div>
    </div>
    ${cashWithAccountant>0&&canAction('income_deposit')?`<div class="alert alert-warn" style="margin-bottom:12px"><span class="alert-icon">⚠</span><span>Cash with Accountant: <strong>${fmt(cashWithAccountant)}</strong>${pendingCount>0?` (${pendingCount} income record(s) this month pending)`:''} — not yet deposited to the bank. <button class="btn btn-sm btn-amber" onclick="App.confirmBulkDeposit()" style="margin-left:8px">Record Deposit Now</button></span></div>`:''}
    <div class="tabs">
      <button class="tab ${tab==='list'?'active':''}" onclick="App.setIncomeTab('list')">Sunday Collections (${sundayRecs.length})</button>
      <button class="tab ${tab==='other'?'active':''}" onclick="App.setIncomeTab('other')">Other Income (${otherRecs.length})</button>
      <button class="tab ${tab==='summary'?'active':''}" onclick="App.setIncomeTab('summary')">Monthly Summary</button>
      <button class="tab ${tab==='all'?'active':''}" onclick="App.setIncomeTab('all')">All Records</button>
    </div>
    ${await (tab==='list'?renderIncomeList(sundayRecs, _cashTx, remRates):tab==='other'?renderOtherIncomeList(otherRecs):tab==='summary'?renderIncomeSummary(records):renderAllIncomeList(allIncomeRecs, _cashTx, remRates))}`;
}

function setIncomeTab(t){ state.incomeTab=t; renderIncome() }

async function renderIncomeList(records, cashTxOverride, remRatesOverride){
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
        const cashHeld = getSundayCashWithAccountant(r, remRates);
        const depositedAmt = allCashTxList.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
        const isFullyDeposited = cashHeld > 0 && depositedAmt >= cashHeld;
        const remaining = cashHeld - depositedAmt;
        const statusBadge = cashHeld===0
          ? `<span class="badge badge-info">No Cash (All Transfer)</span>`
          : isFullyDeposited
            ? `<span class="badge badge-success">✓ Deposited</span>`
            : depositedAmt>0
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
        const cashHeld = getSundayCashWithAccountant(r, remRates);
        const depositedAmt = allCashTxList.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
        const isFullyDeposited = cashHeld > 0 && depositedAmt >= cashHeld;
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

async function renderOtherIncomeList(records){
  if(!records.length) return '<div class="card"><div class="empty-table">No other income records found for this month. Click "➕ Other Income" above to add one.</div></div>';
  const allCashTxList = await DB.getCashTransactions();
  return `<div class="card">
    <span class="td-muted tx-mobile-hint" style="font-size:11px;padding-bottom:6px">Tap any row to see full details</span>
    <div class="table-wrap"><table class="tx-desktop-table">
      <tr><th>Date</th><th>Source Type</th><th>Donor / Notes</th><th>Amount</th><th>Payment Method</th><th>Status</th><th>Recorded By</th><th>Actions</th></tr>
      ${records.map(r=>{
        const src = OTHER_INCOME_SOURCES.find(s=>s.key===r.source)||{label:r.source||'Other'};
        const isCash = r.paymentMethod==='cash';
        const cashDep = allCashTxList.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
        const remaining = Math.max(0,(r.totalCollection||0) - cashDep);
        const statusBadge = !isCash
          ? `<span class="badge badge-info">🏦 Bank Transfer</span>`
          : cashDep>=(r.totalCollection||0)
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
          ${canAction('income_deposit')&&isCash&&cashDep<(r.totalCollection||0)?`<button class="btn btn-sm btn-primary" onclick="App.confirmDeposit('${r.id}')" style="margin-left:4px">Record Deposit</button>`:''}</td>
        </tr>`;}).join('')}
    </table>
    <table class="tx-mobile-table">
      <tr><th>Date</th><th>Details</th><th class="td-right">Amount</th></tr>
      ${records.map(r=>{
        const src = OTHER_INCOME_SOURCES.find(s=>s.key===r.source)||{label:r.source||'Other'};
        const isCash = r.paymentMethod==='cash';
        const cashDep = allCashTxList.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
        const mobileStatus = !isCash
          ? `<span class="badge badge-info">🏦 Bank</span>`
          : cashDep>=(r.totalCollection||0)
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
  const quotasTotal = quotas.reduce((s,q)=>s+(q.amount||0),0);
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
            ${(l.seed||0)>0?`<div class="status-row" style="padding-left:14px"><div><div class="status-row-label" style="font-size:12px">TG → Seed (Pastor's Children)</div></div><div class="status-row-amt td-red" style="font-size:12px">${fmt(l.seed)}</div></div>`:''}`;
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
        ${quotas.filter(q=>(q.amount||0)>0).map(q=>`
        <div class="status-row" style="background:var(--info-light);border-radius:var(--r);padding:8px 10px;border:none;margin-top:4px">
          <div class="status-row-label" style="color:var(--info)">${esc(q.label)}</div>
          <div class="status-row-amt" style="color:var(--info)">${fmt(q.amount)}</div>
        </div>`).join('')}
        <div class="status-row" style="border-top:2px solid var(--border);margin-top:4px"><div class="status-row-label fw-bold">Net Local Retained</div><div class="status-row-amt" style="color:var(--primary);font-size:16px">${fmt(trueNetLocal)}</div></div>`:''}
      </div>
    </div>`;
}

async function renderAllIncomeList(records, cashTxOverride, remRatesOverride){
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
          : r.paymentMethod==='cash' ? (r.totalCollection||0) : 0;
        const depositedAmt = allCashTxList.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
        const isFullyDeposited = cashHeld > 0 && depositedAmt >= cashHeld;
        const remaining = cashHeld - depositedAmt;
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
          : r.paymentMethod==='cash' ? (r.totalCollection||0) : 0;
        const depositedAmt = allCashTxList.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
        const isFullyDeposited = cashHeld > 0 && depositedAmt >= cashHeld;
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
      <div class="form-group"><label class="form-label">Paid via Bank Transfer (₦)</label>
        <input type="number" id="inc_bank_transfer" class="form-input" placeholder="0" min="0" oninput="App.updateIncomeCashBreakdown()" />
        <div class="form-hint">Members who transferred tithe/offerings directly to the church bank account</div>
      </div>
      <div class="form-group"><label class="form-label">Given Directly to Admin Officer (₦)</label>
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
  if(!date){ alert('Please select a date.'); return }
  if(!usher){ alert('Please enter the Head Usher name for counter-signing.'); return }
  const rec={date,usher,source:'sunday_collection',recordedBy:state.user?.name,depositConfirmed:false};
  let total=0;
  INCOME_TYPES.forEach(t=>{ const v=parseFloat(document.getElementById('inc_'+t.key)?.value||0)||0; rec[t.key]=v; total+=v });
  total=Math.round(total);
  if(!total){ alert('Please enter at least one income amount.'); return }
  rec.totalCollection=total;

  const bankTransferAmount = Math.round((parseFloat(document.getElementById('inc_bank_transfer')?.value||0)||0)*100)/100;
  const directPettyCash    = Math.round((parseFloat(document.getElementById('inc_direct_petty')?.value||0)||0)*100)/100;
  const remRates = (await getRemRates()).rates || DEFAULT_REMITTANCE_RATES;
  const childrenTeacherHeld = getChildrenTeacherHeldCash(rec, remRates);
  const maxAllocatable = Math.max(0, total - childrenTeacherHeld);
  if(bankTransferAmount + directPettyCash > maxAllocatable){
    alert(`Bank transfer (${fmt(bankTransferAmount)}) + direct petty cash (${fmt(directPettyCash)}) cannot exceed the amount available after Children Teacher hold (${fmt(maxAllocatable)}).`);
    return;
  }
  rec.bankTransferAmount = bankTransferAmount;
  rec.directPettyCash    = directPettyCash;
  rec.notes=document.getElementById('inc_notes')?.value||'';

  const restore = setBtnLoading(btn, 'Saving…');
  try {
    const saved = await DB.addIncome(rec);
    const cashWithAccountant = getSundayCashWithAccountant(rec, remRates);
    DB.addAudit('income_recorded',`Sunday collection ${fmt(total)} for ${fmtDate(date)} — Cash with Accountant: ${fmt(cashWithAccountant)}, Children Teacher Hold: ${fmt(childrenTeacherHeld)}, Bank Transfer: ${fmt(bankTransferAmount)}, Direct Petty: ${fmt(directPettyCash)}. Counted with: ${usher}`,state.user?.name);

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

    DB.addNotification('Income Recorded',`${fmt(total)} recorded for ${fmtDate(date)}${childrenTeacherHeld?` | ${fmt(childrenTeacherHeld)} → Children Refreshments`:''}${directPettyCash?` | ${fmt(directPettyCash)} → Petty Cash`:''}`,'success');
    closeModal();
    showAlert(`Income of ${fmt(total)} recorded. Cash with accountant: ${fmt(cashWithAccountant)}${childrenTeacherHeld?` | Children Teacher: ${fmt(childrenTeacherHeld)}`:''}${bankTransferAmount?` | Bank: ${fmt(bankTransferAmount)}`:''}${directPettyCash?` | Petty: ${fmt(directPettyCash)}`:''}`, 'success');
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
  const cashHeld = isSunday
    ? getSundayCashWithAccountant(r, remRates)
    : Math.max(0,(r.totalCollection||0) - btAmt - dpAmt);
  const allCashVI = await DB.getCashTransactions();
  const deposits = allCashVI.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id);
  const depositedTotal = deposits.reduce((s,t)=>s+(t.amount||0),0);
  const src = OTHER_INCOME_SOURCES.find(s=>s.key===r.source)||{label:r.source||'Sunday Collection'};
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
    ${deposits.length?`<div class="status-row"><div class="status-row-label">✅ Deposited to Bank so far</div><div class="status-row-amt" style="color:var(--success)">${fmt(depositedTotal)}</div></div>`:''}
    ${cashHeld>depositedTotal?`<div class="status-row"><div class="status-row-label">⏳ Still with Accountant (undeposited)</div><div class="status-row-amt" style="color:var(--danger)">${fmt(cashHeld-depositedTotal)}</div></div>`:''}
    ${isSunday?`<hr class="divider">
    <p class="card-title">Income Breakdown</p>
    ${INCOME_TYPES.filter(t=>r[t.key]).map(t=>`<div class="status-row"><div class="status-row-label">${t.label}</div><div class="status-row-amt">${fmt(r[t.key])}</div></div>`).join('')}
    <hr class="divider">
    <p class="card-title">Remittances Due</p>
    ${rem.lines.map(l=>`<div class="status-row"><div class="status-row-label">${l.label} → HQ</div><div class="status-row-amt td-red">${fmt(l.national||0)}</div></div>`).join('')}
    <div class="status-row"><div class="status-row-label">Province Rebate (20%)</div><div class="status-row-amt td-amber">${fmt(rem.provinceRebate)}</div></div>
    <div class="status-row" style="border-top:2px solid var(--border)"><div class="status-row-label fw-bold">Net Local Retained</div><div class="status-row-amt td-green" style="font-size:15px">${fmt(rem.netLocal)}</div></div>`:''}
    <hr class="divider">
    <div class="fs-12 text-muted">Recorded by: ${r.recordedBy||'—'} · ${isSunday?'Counted with: '+r.usher:'Donor: '+(r.donorName||'—')}</div>
    ${deposits.length?`<div class="fs-12 text-muted">Deposit records: ${deposits.map(d=>`${fmt(d.amount)} via ${d.depositMethod?.replace('_',' ')||'—'} on ${fmtDate(d.date)} (Ref: ${d.reference||'—'})`).join('; ')}</div>`:''}
    <div class="modal-footer">
    ${canAction('income_delete')?`<button class="btn btn-danger" style="margin-right:auto" onclick="closeModal();App.confirmDeleteIncome('${r.id}')">🗑 Delete</button>`:''}
    <button class="btn" onclick="closeModal()">Close</button>
    ${canAction('income_deposit')&&cashHeld>depositedTotal?`<button class="btn btn-primary" onclick="App.confirmDeposit('${r.id}')">Record Cash Deposit</button>`:''}</div>`);
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

async function confirmDeposit(id){
  if(!canAction('income_deposit')){ showAlert('You do not have permission to record deposits.','danger'); return; }
  const [allIncCD, allCashCD, remRatesData, balance] = await Promise.all([DB.getIncome(), DB.getCashTransactions(), getRemRates(), calcChurchBalance()]);
  const r = allIncCD.find(x=>x.id===id);
  if(!r) return;
  const remRates = remRatesData.rates || DEFAULT_REMITTANCE_RATES;
  const childrenTeacherHeld = getChildrenTeacherHeldCash(r, remRates);
  const cashHeld = getSundayCashWithAccountant(r, remRates);
  const alreadyDeposited = allCashCD.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
  const remaining = Math.max(0, cashHeld - alreadyDeposited);
  const totalCashWithAccountant = balance.cashWithAccountant;
  const otherCash = Math.max(0, totalCashWithAccountant - remaining);
  const today = new Date().toISOString().split('T')[0];
  state._depositRemaining = remaining;
  closeModal();
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">💰 Record Cash Deposit — ${fmtDate(r.date)}</div>
    ${totalCashWithAccountant > 0 ? `
    <div style="background:var(--primary-light);border:1.5px solid var(--primary);border-radius:8px;padding:12px 14px;margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Your Total Cash with Accountant</div>
      <div style="font-size:22px;font-weight:800;color:var(--primary);line-height:1;margin-bottom:8px">${fmt(totalCashWithAccountant)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:13px">
        <span style="color:var(--text2)">This record: <strong style="color:var(--text)">${fmt(remaining)}</strong></span>
        ${otherCash > 0.5 ? `<span style="color:var(--text2)">Other cash held: <strong style="color:var(--text)">${fmt(otherCash)}</strong></span>` : `<span style="color:var(--success,#2e7d32);font-size:12px;font-weight:600">✓ Only pending record</span>`}
      </div>
      ${otherCash > 0.5 ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,0,0,.1);font-size:12px;color:var(--text2)">This form deposits cash from this record only. To deposit all your cash in one trip: <button class="btn btn-sm" onclick="closeModal();App.confirmBulkDeposit()" style="margin-left:4px;font-size:11px;padding:2px 8px">Deposit All Cash (${fmt(totalCashWithAccountant)}) →</button></div>` : ''}
    </div>` : ''}
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>Record when you physically deposit the cash collected into the church bank account.</span></div>
    <div class="form-group"><label class="form-label">Cash Available from this Record</label>
      <div style="font-size:20px;font-weight:700;color:var(--primary);padding:8px 0">${fmt(remaining)}</div>
      ${alreadyDeposited?`<div class="form-hint">₦${alreadyDeposited.toLocaleString('en-NG')} already deposited previously from this record.</div>`:''}
      ${childrenTeacherHeld?`<div class="form-hint">Children Teacher hold (${fmt(childrenTeacherHeld)}) is excluded from bank deposits.</div>`:''}
    </div>
    <div class="form-group"><label class="form-label">Amount Deposited *</label>
      <input type="number" id="dep_amount" class="form-input" value="${remaining}" min="0" max="${remaining}" />
    </div>
    <div class="form-group"><label class="form-label">Deposit Method *</label>
      <select id="dep_method" class="form-select">
        <option value="bank_teller">Bank Cash Teller</option>
        <option value="pos_terminal">POS Terminal</option>
        <option value="mobile_transfer">Mobile / Internet Banking Transfer</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Proof of Deposit <span style="color:var(--danger)">*</span></label>
      <div style="font-size:11px;color:var(--text2);margin-bottom:8px">Provide at least one: a teller/reference number <strong>or</strong> a photo of the deposit slip.</div>
      <input type="text" id="dep_ref" class="form-input" placeholder="Teller number / transaction reference (optional if photo uploaded)" style="margin-bottom:8px" />
      <div style="font-size:11px;color:var(--text3);text-align:center;margin:2px 0 8px">— OR —</div>
      <label style="font-size:12px;color:var(--text2);margin-bottom:4px;display:block">Upload Photo of Deposit Slip / POS Receipt</label>
      <input type="file" id="dep_photo" accept="image/*" class="form-input" style="padding:6px" onchange="App._previewDepPhoto(this,'dep_photo_preview')" />
      <div id="dep_photo_preview" style="margin-top:6px;display:none"><img style="max-width:100%;max-height:150px;border-radius:6px;border:1px solid var(--border)" /></div>
    </div>
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
  if(!amount||!date){ alert('Please fill all required fields.'); return; }
  if(!ref&&!photoFile){ alert('Please provide either a teller/reference number or upload a photo of the deposit slip. At least one is required.'); return; }
  const maxDeposit = state._depositRemaining ?? Infinity;
  if(amount > maxDeposit + 0.5){
    showAlert(`Deposit amount (${fmt(amount)}) exceeds the cash available for this record (${fmt(maxDeposit)}). Please enter a correct amount.`,'danger');
    return;
  }
  let photoData = '';
  if(photoFile){
    photoData = await new Promise(resolve=>{
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsDataURL(photoFile);
    });
  }
  const restore = setBtnLoading(btn, 'Saving…');
  try {
    await DB.addCashTransaction({ type:'cash_deposit', incomeRef:incomeId, amount, depositMethod:method, reference:ref||'', photoData, date, recordedBy:state.user?.name });
    const refLabel = ref || (photoData ? '(photo uploaded)' : '—');
    DB.addAudit('cash_deposited',`Cash deposit: ${fmt(amount)} via ${method?.replace(/_/g,' ')||'—'} — Ref: ${refLabel}`,state.user?.name);
    DB.addNotification('Cash Deposited',`${fmt(amount)} deposited to bank${ref?` (Ref: ${ref})`:''}`,'success');
    closeModal();
    showAlert(`${fmt(amount)} deposited to bank successfully!${ref?` Ref: ${ref}`:''}`, 'success');
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

  // Income records with remaining cash (positive contributors)
  const incomeItems = allIncome.map(r=>{
    const isSunday = !r.source||r.source==='sunday_collection';
    const cashHeld = isSunday
      ? getSundayCashWithAccountant(r, remRates)
      : r.paymentMethod==='cash' ? (r.totalCollection||0) : 0;
    if(cashHeld<=0) return null;
    const deposited = allCashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
    const remaining = Math.max(0, cashHeld - deposited);
    if(remaining<=0) return null;
    const srcLabel = isSunday ? 'Sunday Collection' : (OTHER_INCOME_SOURCES.find(s=>s.key===r.source)||{label:r.source||'Other'}).label;
    const icon = isSunday ? '📅' : '💵';
    return { id:r.id, date:r.date, icon, label:srcLabel, cashHeld, deposited, remaining };
  }).filter(Boolean).sort((a,b)=>new Date(a.date)-new Date(b.date));

  // Bank withdrawals routed to accountant's cash (positive)
  const bankToAccountantItems = allCashTx
    .filter(t=>t.type==='withdrawal'&&t.destination==='accountant_cash')
    .sort((a,b)=>new Date(a.date||a.createdAt)-new Date(b.date||b.createdAt));

  // Cash expenses (approved + pending — all are actual payments already made)
  const cashExpenseItems = allExpenses
    .filter(e=>(e.status==='approved'||e.status==='pending')&&(e.paymentMethod==='cash'||(e.paymentMethod==='split'&&(e.cashAmount||0)>0)))
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

  const incomeHtml = hasIncome ? `
    <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;padding:10px 0 2px">📥 Cash Received</div>
    ${incomeItems.map(item=>{
      const detail = item.deposited > 0
        ? `Collected: ${fmt(item.cashHeld)} &nbsp;·&nbsp; Already deposited: ${fmt(item.deposited)} &nbsp;·&nbsp; <strong>Remaining: ${fmt(item.remaining)}</strong>`
        : `Collected: ${fmt(item.cashHeld)}`;
      return cwRow(item.icon, item.label, item.date, item.remaining, true, detail);
    }).join('')}` : '';

  const bankHtml = hasBank ? `
    <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;padding:10px 0 2px">🏦 Bank Withdrawals to You</div>
    ${bankToAccountantItems.map(t=>cwRow('🏦', t.description||'Bank Withdrawal', t.date||t.createdAt, t.amount||0, true,
        (t.reference?`Ref: ${t.reference} &nbsp;·&nbsp; `:'')+(t.authorizedBy?`Authorised by: ${t.authorizedBy}`:'')
      )).join('')}` : '';

  const expHtml = hasExp ? `
    <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;padding:10px 0 2px">💸 Cash Expenses Paid</div>
    ${cashExpenseItems.map(e=>{
      const amt = e.paymentMethod==='split' ? (e.cashAmount||0) : (e.amount||0);
      const cat = (typeof EXPENSE_CATS!=='undefined'?EXPENSE_CATS:[]).find(c=>c.key===e.category)||{label:e.category||'Expense'};
      return cwRow('💸', e.description||cat.label, e.date||e.createdAt, amt, false,
        `Category: ${cat.label}`+(e.description&&e.description!==cat.label?` &nbsp;·&nbsp; ${e.description}`:'')+
        (e.approvedBy?` &nbsp;·&nbsp; Approved by: ${e.approvedBy}`:'')
      );
    }).join('')}` : '';

  const pettyHtml = hasPetty ? `
    <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;padding:10px 0 2px">🏧 Petty Cash Top-ups Paid</div>
    ${pettyTopupItems.map(h=>{
      const amt = h.paymentMethod==='split' ? (h.cashAmount||0) : (h.amount||0);
      return cwRow('🏧', 'Petty Cash Refill', h.date||h.createdAt, amt, false,
        `Amount paid: ${fmt(amt)}`+(h.status?` &nbsp;·&nbsp; Status: ${h.status}`:'')
      );
    }).join('')}` : '';

  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">💰 Record Cash Deposit</div>
    <div style="background:var(--primary-light);border:1.5px solid var(--primary);border-radius:8px;padding:12px 14px;margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">Cash with Accountant — Full Balance</div>
      <div style="font-size:22px;font-weight:800;color:var(--primary);line-height:1">${fmt(cashWithAccountant)}</div>
      <div style="font-size:12px;color:var(--text2);margin-top:4px">This is the exact amount you will deposit to the bank.</div>
    </div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>Every cash movement that makes up your current balance is listed below. Tap any row to see full details. Confirm to deposit the full amount.</span></div>
    <div style="border:1px solid var(--border);border-radius:8px;padding:0 12px;margin-bottom:16px;max-height:300px;overflow-y:auto">
      ${incomeHtml}${bankHtml}${expHtml}${pettyHtml}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:2px solid var(--border);margin-top:6px">
        <span style="font-size:13px;font-weight:700">Net Cash to Deposit</span>
        <span style="font-size:17px;font-weight:800;color:var(--primary)">${fmt(cashWithAccountant)}</span>
      </div>
    </div>
    <div class="form-group"><label class="form-label">Deposit Method *</label>
      <select id="bulk_dep_method" class="form-select">
        <option value="bank_teller">Bank Cash Teller</option>
        <option value="pos_terminal">POS Terminal</option>
        <option value="mobile_transfer">Mobile / Internet Banking Transfer</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Proof of Deposit <span style="color:var(--danger)">*</span></label>
      <div style="font-size:11px;color:var(--text2);margin-bottom:8px">Provide at least one: a teller/reference number <strong>or</strong> a photo of the deposit slip.</div>
      <input type="text" id="bulk_dep_ref" class="form-input" placeholder="Teller number / transaction reference (optional if photo uploaded)" style="margin-bottom:8px" />
      <div style="font-size:11px;color:var(--text3);text-align:center;margin:2px 0 8px">— OR —</div>
      <label style="font-size:12px;color:var(--text2);margin-bottom:4px;display:block">Upload Photo of Deposit Slip / POS Receipt</label>
      <input type="file" id="bulk_dep_photo" accept="image/*" class="form-input" style="padding:6px" onchange="App._previewDepPhoto(this,'bulk_dep_photo_preview')" />
      <div id="bulk_dep_photo_preview" style="margin-top:6px;display:none"><img style="max-width:100%;max-height:150px;border-radius:6px;border:1px solid var(--border)" /></div>
    </div>
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
  const method    = document.getElementById('bulk_dep_method')?.value;
  const ref       = document.getElementById('bulk_dep_ref')?.value?.trim();
  const date      = document.getElementById('bulk_dep_date')?.value;
  const photoFile = document.getElementById('bulk_dep_photo')?.files?.[0];
  if(!date){ alert('Please enter the deposit date.'); return; }
  if(!ref&&!photoFile){ alert('Please provide either a teller/reference number or upload a photo of the deposit slip. At least one is required.'); return; }
  let photoData = '';
  if(photoFile){
    photoData = await new Promise(resolve=>{
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsDataURL(photoFile);
    });
  }
  const cashToDeposit = state._bulkDepositCashBalance || 0;
  if(cashToDeposit < 0.5){ showAlert('No cash to deposit.','warn'); return; }
  const restore = setBtnLoading(btn, 'Saving…');
  try {
    // Re-fetch fresh data to build accurate income-record distribution
    const [allIncome, allCashTx, remRatesData] = await Promise.all([DB.getIncome(), DB.getCashTransactions(), getRemRates()]);
    const remRates = remRatesData.rates || DEFAULT_REMITTANCE_RATES;
    const incomeItems = allIncome.map(r=>{
      const isSunday = !r.source||r.source==='sunday_collection';
      const cashHeld = isSunday ? getSundayCashWithAccountant(r, remRates) : (r.paymentMethod==='cash'?(r.totalCollection||0):0);
      const dep = allCashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
      return { id:r.id, date:r.date, remaining: Math.max(0, cashHeld - dep) };
    }).filter(x=>x.remaining>0).sort((a,b)=>new Date(a.date)-new Date(b.date));

    // Distribute cashToDeposit across income records sequentially (oldest first).
    // Stops when cashToDeposit is exhausted — this correctly handles cases where
    // cash expenses / petty top-ups have already consumed part of the balance.
    let amountLeft = cashToDeposit;
    let recordCount = 0;
    for(const item of incomeItems){
      if(amountLeft < 0.5) break;
      const depositAmt = Math.min(item.remaining, amountLeft);
      await DB.addCashTransaction({ type:'cash_deposit', incomeRef:item.id, amount:depositAmt, depositMethod:method, reference:ref||'', photoData, date, recordedBy:state.user?.name });
      amountLeft -= depositAmt;
      recordCount++;
    }
    // Any remainder comes from bank-withdrawal funds not tied to income records
    if(amountLeft > 0.5){
      await DB.addCashTransaction({ type:'cash_deposit', incomeRef:'', amount:amountLeft, depositMethod:method, reference:ref||'', photoData, date, recordedBy:state.user?.name, description:'Cash deposit (bank withdrawal funds)' });
      recordCount++;
    }
    const refLabel = ref || (photoData ? '(photo uploaded)' : '—');
    DB.addAudit('cash_deposited',`Cash deposit: ${fmt(cashToDeposit)} via ${method?.replace(/_/g,' ')||'—'} — Ref: ${refLabel}`,state.user?.name);
    DB.addNotification('Cash Deposited',`${fmt(cashToDeposit)} deposited to bank${ref?` (Ref: ${ref})`:''}`,'success');
    delete state._bulkDepositPending;
    delete state._bulkDepositCashBalance;
    closeModal();
    showAlert(`${fmt(cashToDeposit)} deposited to bank successfully!${ref?` Ref: ${ref}`:''}`, 'success');
    if(state.page==='bank') renderBank(); else renderIncome();
  } catch(err) {
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
  const amount     = Math.round(parseFloat(document.getElementById('oi_amount')?.value)||0);
  const method     = document.getElementById('oi_method')?.value;
  const notes      = document.getElementById('oi_notes')?.value||'';
  if(!date||!source){ alert('Please select a date and source type.'); return }
  if(!amount){ alert('Please enter an amount.'); return }
  if(!method){ alert('Please select a payment method.'); return }

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
  const [allIncome, allRems, settings, allUsers] = await Promise.all([
    DB.getIncome(), DB.getRemittances(), DB.getSettings(), DB.getUsers()
  ]);
  const quotas = getQuotaList(settings);
  const rr = await getRemRates();

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

  const tgLines=[
    { label:`Thanksgiving → Area / Zonal Pastor (${Math.round(rr.tgArea*100)}%)`,      amount:rem.totalArea,     section:'tg' },
    { label:`Thanksgiving → Parish Pastor's Share (${Math.round(rr.tgPastor*100)}%)`,         amount:rem.totalPastor,   section:'tg' },
    { label:`Thanksgiving → Ministers' Share (${Math.round(rr.tgMinisters*100)}%)`,    amount:rem.totalMinisters,section:'tg' },
    { label:`Thanksgiving → Seed — Pastor's Children (${Math.round(rr.tgSeed*100)}%)`, amount:rem.totalSeed||0,  section:'tg' },
  ].filter(l=>l.amount>0);

  const provinceLines=rem.provinceRebate>0?[
    { label:`Province Rebate (${Math.round(rr.provinceRebate*100)}% of Local Retained Tithes)`, amount:rem.provinceRebate, section:'province' }
  ]:[];

  const activeQuotas=quotas;
  const quotaLines=activeQuotas
    .map(q=>({ label:q.label, amount:q.amount||0, section:'quota' }))
    .filter(l=>l.amount>0);

  const allLines=[...incomeLines,...tgLines,...provinceLines,...quotaLines];
  const totalDue=allLines.reduce((s,l)=>s+l.amount,0);
  const quotasTotal=quotaLines.reduce((s,l)=>s+l.amount,0);
  const trueNetLocal=rem.netLocal-quotasTotal;
  // Only count income that goes through the remittance split (records with INCOME_TYPES fields)
  const totalCollection=income
    .filter(r=>INCOME_TYPES.some(t=>(r[t.key]||0)>0))
    .reduce((s,r)=>s+(r.totalCollection||0),0);

  // --- Check for period payment ---
  const periodPayments=allRems.filter(r=>r.status==='paid'&&r.periodFrom===fromDate&&r.periodTo===toDate);
  const totalPaid=periodPayments.reduce((s,r)=>s+(r.amount||0),0);
  const isPaid=totalPaid>0&&totalPaid>=totalDue*PAYMENT_TOLERANCE_THRESHOLD;
  const isPartial=totalPaid>0&&!isPaid;
  const remDueLabel = getRemittanceDueLabel(settings, state.year, state.month,
    { isPaid, isPartial, paidAmount: totalPaid });

  const allPaidRems=allRems.filter(r=>r.status==='paid')
    .sort((a,b)=>new Date(b.paidDate||b.createdAt||0)-new Date(a.paidDate||a.createdAt||0));

  const pendingApprovals=allRems.filter(r=>r.status==='pending_approval')
    .sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));

  const renderSection=(rows,sectionLabel)=>rows.length?`
    <tr style="background:var(--surface)">
      <td colspan="3" style="font-size:10px;font-weight:700;color:var(--text3);padding:5px 12px;letter-spacing:0.6px;text-transform:uppercase">${sectionLabel}</td>
    </tr>
    ${rows.map(l=>`<tr>
      <td style="padding:7px 12px">
        <strong>${l.label}</strong>
        ${l.pct!=null?`<span style="margin-left:6px;font-size:11px;color:var(--text3);font-weight:400">(${l.pct}%)</span>`:''}
      </td>
      <td style="padding:7px 8px">
        <span class="badge ${l.section==='quota'?'badge-info':'badge-purple'}">${l.section==='quota'?'Fixed Quota':'% Based'}</span>
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
        ${canAction('remittance_record_payment')?`<button class="btn btn-primary" onclick="App.showRemittancePaymentModal()">📤 Record Payment</button>`:''}
        <button class="btn btn-amber" onclick="App.printRemittanceReport()">📄 Download Report</button>
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
      <div class="kpi"><div class="kpi-icon" style="background:#FCEBEB">📤</div><div class="kpi-label">Total Remittance Due</div><div class="kpi-val">${fmt(totalDue)}</div><div class="kpi-delta" style="color:var(--text3)">📅 ${remDueLabel}</div></div>
      <div class="kpi"><div class="kpi-icon" style="background:#EAF3DE">✓</div><div class="kpi-label">Total Paid</div><div class="kpi-val">${fmt(totalPaid)}</div></div>
      <div class="kpi"><div class="kpi-icon" style="background:#E1F5EE">🏠</div><div class="kpi-label">Net Local Retained</div><div class="kpi-val">${fmt(trueNetLocal)}</div></div>
    </div>

    ${income.length===0?`<div class="alert alert-warn" style="margin-bottom:12px"><span class="alert-icon">⚠</span><span><strong>No income records found</strong> for the selected period (${fmtDate(fromDate)} – ${fmtDate(toDate)}). Please adjust the date range above or record income first.</span></div>`:''}

    <div class="grid-6040">
      <!-- LEFT: Breakdown Table -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Full Remittance Breakdown</span>
          <span style="font-size:11px;color:var(--text3)">${fmtDate(fromDate)} – ${fmtDate(toDate)}</span>
        </div>
        <div class="table-wrap"><table style="width:100%">
          <tr><th>Description</th><th style="width:100px">Type</th><th class="td-right" style="width:130px">Amount Due (₦)</th></tr>
          ${renderSection(incomeLines,'Income-Based Remittances → National HQ (% of collections)')}
          ${renderSection(tgLines,'Thanksgiving — Pastoral & Local Distribution')}
          ${renderSection(provinceLines,'Province Rebate (20% of Local Retained Tithes)')}
          ${renderSection(quotaLines,'Fixed Monthly Quotas')}
          <tr style="border-top:2px solid var(--border)">
            <td colspan="2" class="td-bold" style="font-size:14px;padding:10px 12px">TOTAL REMITTANCES DUE</td>
            <td class="td-right td-bold" style="font-size:15px;color:var(--danger);padding:10px 12px">${fmt(totalDue)}</td>
          </tr>
          <tr>
            <td colspan="2" style="font-size:12px;color:var(--text2);padding:6px 12px">Net Local Retained (after Province Rebate &amp; Fixed Quotas)</td>
            <td class="td-right" style="font-size:13px;color:var(--primary);font-weight:600;padding:6px 12px">${fmt(trueNetLocal)}</td>
          </tr>
        </table></div>

        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
          ${canAction('remittance_record_payment')?`<button class="btn btn-primary" onclick="App.showRemittancePaymentModal()">📤 Record Bulk Payment (${fmt(totalDue)})</button>`:''}
          <button class="btn btn-amber" onclick="App.printRemittanceReport()">📄 Print / Download Report</button>
        </div>
      </div>

      <!-- RIGHT: History + Local Share -->
      <div>
        ${pendingApprovals.length&&can('signoff')?`
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
                <div class="feed-sub">${r.paymentMethod==='cash'?'<span style="color:var(--amber)">💵 Cash</span> · ':'🏦 Bank · '}Ref: ${esc(r.reference)||'—'}<br>Authorized: ${esc(r.authorizedBy)||'—'}</div>
                <div class="feed-time">${fmtDate(r.paidDate)}</div>
              </div>
              <div class="feed-right td-green">${fmt(r.amount)}</div>
            </div>`).join('')}
        </div>`:''}

        <div class="card" style="margin-bottom:12px">
          <div class="card-header"><span class="card-title">Payment History</span></div>
          ${allPaidRems.length?allPaidRems.slice(0,10).map(r=>`
            <div class="feed-item">
              <div class="feed-dot" style="background:var(--success-light)">✓</div>
              <div class="feed-body">
                <div class="feed-title">${esc(r.label||'RCCG Remittance')}</div>
                <div class="feed-sub">${r.periodFrom&&r.periodTo?`<em>Period: ${fmtDate(r.periodFrom)} – ${fmtDate(r.periodTo)}</em><br>`:''}${r.paymentMethod==='cash'?'💵 Cash':'🏦 Bank'} · Ref: ${esc(r.reference)||'—'} · ${esc(r.authorizedBy)||'—'}</div>
                <div class="feed-time">${fmtDate(r.paidDate)}</div>
              </div>
              <div class="feed-right td-green">${fmt(r.amount)}</div>
            </div>`).join(''):'<div class="empty-table">No remittance payments recorded yet.</div>'}
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
            <div class="status-row-label" style="color:var(--amber)">Total Fixed Monthly Quotas (deducted)</div>
            <div class="status-row-amt" style="color:var(--amber)">− ${fmt(quotasTotal)}</div>
          </div>`:''}
          <div class="status-row" style="border-top:2px solid var(--border);margin-top:4px">
            <div class="status-row-label fw-bold">NET LOCAL RETAINED</div>
            <div class="status-row-amt" style="color:var(--primary);font-size:15px">${fmt(trueNetLocal)}</div>
          </div>
        </div>

        <!-- Parish Pastor's Share card -->
        ${(rem.totalPastor||0)+(rem.totalArea||0)+(rem.totalSeed||0)+(quotas.find(q=>q.label.toLowerCase().includes('mummy'))?.amount||0)>0?`
        <div class="card" style="margin-top:12px">
          <div class="card-header"><span class="card-title">👨‍💼 Parish Pastor's Share</span></div>
          <p style="font-size:11px;color:var(--text3);margin-bottom:10px">Thanksgiving portions and stipend due to the Pastor's family (as Zonal / Area Pastor).</p>
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
          ${(rem.totalSeed||0)>0?`
          <div class="status-row">
            <div class="status-row-label">TG → Seed — Pastor's Children (${Math.round(rr.tgSeed*100)}%)</div>
            <div class="status-row-amt" style="color:var(--primary)">${fmt(rem.totalSeed)}</div>
          </div>`:''}
          ${(()=>{ const mq=quotas.find(q=>q.label.toLowerCase().includes('mummy')); return mq&&(mq.amount||0)>0?`
          <div class="status-row">
            <div class="status-row-label">${mq.label} (Fixed Monthly)</div>
            <div class="status-row-amt" style="color:var(--primary)">${fmt(mq.amount)}</div>
          </div>`:'' })()}
          <div class="status-row" style="border-top:2px solid var(--border);margin-top:4px">
            <div class="status-row-label fw-bold">TOTAL PASTOR'S FAMILY SHARE</div>
            <div class="status-row-amt" style="color:var(--primary);font-size:15px">${fmt((rem.totalArea||0)+(rem.totalPastor||0)+(rem.totalSeed||0)+(quotas.find(q=>q.label.toLowerCase().includes('mummy'))?.amount||0))}</div>
          </div>
        </div>`:''}
      </div>
    </div>`;
}

async function showRemittancePaymentModal(){
  if(!canAction('remittance_record_payment')){ showAlert('You do not have permission to record remittance payments.','danger'); return; }
  const [allIncome, settings, allUsers] = await Promise.all([DB.getIncome(), DB.getSettings(), DB.getUsers()]);
  const quotas=getQuotaList(settings);
  const fromDate=state.remFromDate||new Date(state.year,state.month,1).toISOString().split('T')[0];
  const toDate=state.remToDate||new Date().toISOString().split('T')[0];
  const income=filterByDateRange(allIncome, fromDate, toDate);
  const rem=await calcRemittancesFromRecords(income);
  const rr=await getRemRates();

  const lines=[
    ...rem.lines.map(l=>({ label:l.label+' → National HQ', amount:l.national||0 })),
    { label:`Thanksgiving → Area / Zonal Pastor (${Math.round(rr.tgArea*100)}%)`,      amount:rem.totalArea },
    { label:`Thanksgiving → Parish Pastor's Share (${Math.round(rr.tgPastor*100)}%)`,         amount:rem.totalPastor },
    { label:`Thanksgiving → Ministers' Share (${Math.round(rr.tgMinisters*100)}%)`,    amount:rem.totalMinisters },
    { label:`Thanksgiving → Seed — Pastor's Children (${Math.round(rr.tgSeed*100)}%)`, amount:rem.totalSeed||0 },
    { label:`Province Rebate (${Math.round(rr.provinceRebate*100)}% of Local Retained Tithes)`, amount:rem.provinceRebate },
    ...quotas.map(q=>({ label:q.label, amount:q.amount||0 }))
  ].filter(l=>l.amount>0);

  const totalDue=lines.reduce((s,l)=>s+l.amount,0);

  // Build signatory checkboxes from pastor + signatory roles
  const signatoryUsers=allUsers.filter(u=>['pastor','signatory','it_admin'].includes(u.role));
  const sigChecks=signatoryUsers.map(u=>`
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin-bottom:4px">
      <input type="checkbox" name="rem_sig" value="${esc(u.name)}" ${u.id===state.user?.id?'checked':''} />
      <span>${esc(u.name)}</span><span class="badge" style="font-size:10px;background:${ROLES[u.role]?.bg||'#eee'};color:${ROLES[u.role]?.color||'#333'}">${ROLES[u.role]?.label||u.role}</span>
    </label>`).join('');

  const isCan=canAction('remittance_record_payment'); // for role-aware submit label
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">📤 Record Remittance Payment</div>
    <div class="alert alert-info" style="margin:0 0 12px">
      <span class="alert-icon">ℹ</span>
      <span>Remittances are paid as <strong>one bulk payment</strong> each period. The full breakdown is shown below for reference.</span>
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

    <!-- Payment Method -->
    <div class="form-group">
      <label class="form-label">Payment Method *</label>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:4px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="rem_method" value="bank_transfer" checked onchange="App.onRemMethodChange()" /> 🏦 Bank Transfer only
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="rem_method" value="cash" onchange="App.onRemMethodChange()" /> 💵 Cash only
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="rem_method" value="split" onchange="App.onRemMethodChange()" /> 🏦💵 Split (Bank + Cash)
        </label>
      </div>
    </div>

    <!-- Single amount (bank or cash only) -->
    <div id="rem_single_amount_group" class="form-group">
      <label class="form-label">Amount to Pay (₦) *</label>
      <input type="number" id="rem_amount" class="form-input" value="${Math.round(totalDue)}" />
      <div class="form-hint">Calculated total: <strong>${fmt(totalDue)}</strong>. Adjust only if actual payment differs.</div>
    </div>

    <!-- Split amounts (shown only for split method) -->
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
    <div class="form-group" id="rem_ref_group">
      <label class="form-label">Bank Reference / Transfer ID *</label>
      <input type="text" id="rem_ref" class="form-input" placeholder="Enter the bank transfer reference / teller number" />
      <div class="form-hint">Please also upload the bank receipt below.</div>
    </div>

    <!-- Receipt upload -->
    <div class="form-group" id="rem_receipt_group">
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

    <div class="alert alert-warn" style="margin:0 0 10px">
      <span class="alert-icon">⚠</span>
      <span>Submission will create a <strong>Pending Approval</strong> record. The Pastor or a Bank Signatory must then approve it to mark it as fully paid.</span>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitRemittance(this)">📤 Submit for Approval</button>
    </div>`);
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
  const bank=parseFloat(document.getElementById('rem_bank_amt')?.value)||0;
  const cash=parseFloat(document.getElementById('rem_cash_amt')?.value)||0;
  const total=bank+cash;
  const totalEl=document.getElementById('rem_split_total');
  const warnEl=document.getElementById('rem_split_warning');
  if(totalEl) totalEl.textContent=fmt(total);
  if(totalEl) totalEl.style.color=Math.abs(total-totalDue)<1?'var(--success)':total>totalDue?'var(--danger)':'var(--text)';
  if(warnEl){
    if(total>totalDue){
      warnEl.style.display='block';
      warnEl.textContent=`Total entered (${fmt(total)}) exceeds the amount due (${fmt(totalDue)}) by ${fmt(total-totalDue)}.`;
    } else if(total<totalDue && total>0){
      warnEl.style.display='block';
      warnEl.style.color='var(--amber)';
      warnEl.textContent=`${fmt(totalDue-total)} still unaccounted for. This will be recorded as a partial payment.`;
    } else {
      warnEl.style.display='none';
    }
  }
}

async function submitRemittance(btn=null){
  const method=document.querySelector('input[name="rem_method"]:checked')?.value||'bank_transfer';
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
  if(isSplit){
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

  if(!amount||!date){ showAlert('Please enter the amount and payment date.','danger'); return }
  if(method==='bank_transfer'&&!reference){ showAlert('Please enter the bank transfer reference number.','danger'); return }
  if(!auth){ showAlert('Please select or enter the authorizing signatories.','danger'); return }

  // Encode receipt file if provided — only the filename is persisted (appended to notes below).
  // The remittances table has no receipt image column; the filename serves as the audit reference.
  const receiptFile=document.getElementById('rem_receipt')?.files?.[0];
  const receiptFileName=receiptFile?.name||'';

  const fromDate=state.remFromDate||new Date(state.year,state.month,1).toISOString().split('T')[0];
  const toDate=state.remToDate||new Date().toISOString().split('T')[0];

  const isSuperUser=['it_admin','pastor'].includes(state.user?.role);
  const status=isSuperUser?'paid':'pending_approval';

  // Build a clear description of how payment was split
  const methodLabel=isSplit
    ? `Split — Bank: ${fmt(bankAmount)} + Cash: ${fmt(cashAmount)}`
    : method==='bank_transfer'?'Bank Transfer':'Cash';

  const restore = setBtnLoading(btn, 'Submitting…');
  try {
    await DB.addRemittance({
      label:'RCCG Monthly Remittance', amount, paidDate:date,
      reference, authorizedBy:auth,
      notes:(receiptFileName?`Receipt: ${receiptFileName}\n`:'')+notes,
      paymentMethod:method,
      bankAmount, cashAmount,
      periodFrom:fromDate, periodTo:toDate,
      submittedBy:state.user?.name||'',
      status
    });
    DB.addAudit('remittance_submitted',
      `Remittance ${status==='paid'?'paid':'submitted for approval'}: ${fmt(amount)} (${methodLabel}) — Period: ${fromDate} to ${toDate}${reference?' — Ref: '+reference:''}`,
      state.user?.name);
    if(status==='paid'){
      DB.addNotification('Remittance Recorded',`RCCG remittance of ${fmt(amount)} paid (${methodLabel}) for period ${fmtDate(fromDate)} – ${fmtDate(toDate)}.`,'success');
    } else {
      DB.addNotification('Remittance Pending Approval',`Remittance of ${fmt(amount)} submitted by ${state.user?.name||'accountant'} — awaiting Pastor/Signatory approval.`,'warn');
    }
    closeModal();
    showAlert(status==='paid'?`Remittance of ${fmt(amount)} recorded and marked as paid!`:'Remittance submitted — pending approval by Pastor/Signatory.','success');
    state.remFromDate=null; state.remToDate=null;
    renderRemittances();
  } catch(err) {
    restore();
    showAlert(`Failed to submit remittance: ${err.message||'Unknown error'}. Please try again.`,'danger');
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

function onRemDatesChange(){
  state.remFromDate=document.getElementById('remFromDate')?.value||null;
  state.remToDate=document.getElementById('remToDate')?.value||null;
  renderRemittances();
}

async function printRemittanceReport(fromOverride, toOverride){
  const [allIncome, settings] = await Promise.all([DB.getIncome(), DB.getSettings()]);
  const quotas=getQuotaList(settings);
  const fromDate=fromOverride||state.remFromDate||new Date(state.year,state.month,1).toISOString().split('T')[0];
  const toDate=toOverride||state.remToDate||new Date().toISOString().split('T')[0];
  const income=filterByDateRange(allIncome, fromDate, toDate);
  const rem=await calcRemittancesFromRecords(income);
  const rr=await getRemRates();
  const churchName=settings.churchName||'RCCG Kingdom Parish, Aguleri';

  // Separate "Zonal Mummy Stipend" (pastoral stipend) from RCCG-authority quotas
  const rccgQuotas=quotas.filter(q=>!q.label.toLowerCase().includes('mummy'));
  const mummyQuotas=quotas.filter(q=>q.label.toLowerCase().includes('mummy'));

  // ─── COLLECTIONS SUMMARY ─────────────────────────────────────────
  const totalCollected=rem.lines.reduce((s,l)=>s+(l.total||0),0);
  const tgLine=rem.lines.find(l=>l.isTg);
  const tgTotal=tgLine?.total||0;
  const tgNatlAmt=tgLine?.national||0;
  const tgDistributed=tgTotal-tgNatlAmt; // area+pastor+ministers+seed
  const totalToHQ=rem.lines.reduce((s,l)=>s+(l.national||0),0); // incl. TG national
  const totalParishLocal=rem.lines.filter(l=>!l.isTg).reduce((s,l)=>s+(l.local||0),0);

  const collectionRowsHTML=rem.lines.map(l=>{
    if(!l.total) return '';
    if(l.isTg){
      const natlPct=Math.round(rr.tgNational*100);
      const distPct=100-natlPct;
      return `<tr>
        <td>Thanksgiving (TG) <sup style="color:#c0392b">†</sup></td>
        <td class="td-r">${fmt(l.total)}</td>
        <td class="td-c">${natlPct}%</td>
        <td class="td-r">${fmt(l.national)}</td>
        <td class="td-c" style="color:#888">${distPct}%</td>
        <td class="td-r" style="color:#888;font-style:italic">0</td>
      </tr>`;
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
        <sup style="color:#c0392b">†</sup> TG balance ${fmt(tgDistributed)} (${100-Math.round(rr.tgNational*100)}%) distributed — Area/Zonal: ${fmt(rem.totalArea)} · Pastor: ${fmt(rem.totalPastor)} · Ministers: ${fmt(rem.totalMinisters)} · Seed: ${fmt(rem.totalSeed||0)} — shown in Part B
      </td></tr>`:'';

  const quotasTotal=quotas.reduce((s,q)=>s+(q.amount||0),0);
  const trueNetLocal=rem.netLocal-quotasTotal;

  // ─── PART A: RCCG AUTHORITY REMITTANCES ──────────────────────────
  const partARows=[
    // Income-based % remittances → National HQ (all types including TG)
    ...rem.lines.map(l=>({
      desc: l.isTg
        ? `Thanksgiving Offering → National HQ (${Math.round(rr.tgNational*100)}%)`
        : `${l.label} → National HQ`,
      type:'% Based', amount:l.national||0
    })).filter(r=>r.amount>0),
    // Province Rebate (% of local retained tithes)
    ...(rem.provinceRebate>0?[{
      desc:`Province Rebate — ${Math.round(rr.provinceRebate*100)}% of Local Retained Tithes (Members' + Ministers' Tithe: ${fmt(rem.localTithe)})`,
      type:'% Based', amount:rem.provinceRebate
    }]:[]),
    // Fixed RCCG quotas (excluding pastoral Zonal Mummy Stipend)
    ...rccgQuotas.map(q=>({ desc:q.label, type:'Fixed', amount:q.amount||0 })).filter(r=>r.amount>0)
  ];
  const subTotalA=partARows.reduce((s,r)=>s+r.amount,0);

  // ─── PART B: OTHER DISBURSEMENTS ─────────────────────────────────
  const partBRows=[
    { desc:`Thanksgiving → Area / Zonal Pastor (${Math.round(rr.tgArea*100)}%)`,       type:'% Based', amount:rem.totalArea||0 },
    { desc:`Thanksgiving → Parish Pastor's Share (${Math.round(rr.tgPastor*100)}%)`,          type:'% Based', amount:rem.totalPastor||0 },
    { desc:`Thanksgiving → Ministers' Share (${Math.round(rr.tgMinisters*100)}%)`,     type:'% Based', amount:rem.totalMinisters||0 },
    { desc:`Thanksgiving → Seed — Pastor's Children (${Math.round(rr.tgSeed*100)}%)`,  type:'% Based', amount:rem.totalSeed||0 },
    ...mummyQuotas.map(q=>({ desc:q.label, type:'Fixed', amount:q.amount||0 }))
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
    <p><strong>Prepared by:</strong> ${esc(state.user?.name||'—')} &nbsp;|&nbsp; <strong>Date Prepared:</strong> ${fmtDate(new Date().toISOString().split('T')[0])}</p>
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
    <div class="sig-box">Prepared by (Accountant)<br><br><br>${esc(state.user?.name||'_________________')}</div>
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

// ── EXPENSES ──────────────────────────────
async function renderExpenses(){
  const allExp = await DB.getExpenses();
  state._expAll = allExp;
  const expenses = filterByMonth(allExp);
  const total = expenses.reduce((s,r)=>s+(r.amount||0),0);

  // Fetch balance data for the financial position bar
  const [churchBal, allIncome, allRems, settings] = await Promise.all([
    calcChurchBalance(),
    DB.getIncome(),
    DB.getRemittances(),
    DB.getSettings()
  ]);
  // Outstanding remittances = accumulated all-time due minus all-time paid (same as dashboard KPI logic)
  const allTimeRemittances = await calcRemittancesFromRecords(allIncome);
  const allTimeIncomeRemDue = (allTimeRemittances.totalNatl||0)+(allTimeRemittances.totalArea||0)
    +(allTimeRemittances.totalPastor||0)+(allTimeRemittances.totalMinisters||0)
    +(allTimeRemittances.totalSeed||0)+(allTimeRemittances.provinceRebate||0);
  const quotaList = getQuotaList(settings);
  const allQuotasPerPeriod = quotaList.reduce((s,q)=>s+(q.amount||0),0);

  // Count remittance periods from first income record up to viewed month, using configured cut-off dates.
  const firstIncRec = allIncome.length > 0 ? allIncome[allIncome.length-1] : null;
  const firstDate = firstIncRec ? new Date(firstIncRec.date||firstIncRec.createdAt) : new Date(state.year, state.month, 1);
  const firstDateStr = (firstIncRec ? (firstIncRec.date||firstIncRec.createdAt||'') : '').slice(0,10);
  let quotaPeriods = 0;
  if(firstIncRec){
    let fy=firstDate.getFullYear(), fm=firstDate.getMonth();
    let y=fy, m=fm;
    while(y<state.year||(y===state.year&&m<=state.month)){
      const cd=getRemCutoffDates(settings,y)||getRemCutoffDates(settings);
      const cutDay=cd?.dates?.[m]||null;
      if(cutDay){
        const cutStr=`${y}-${String(m+1).padStart(2,'0')}-${String(cutDay).padStart(2,'0')}`;
        if(cutStr>firstDateStr) quotaPeriods++;
      } else {
        quotaPeriods++;
      }
      m++; if(m>11){m=0;y++;}
    }
    quotaPeriods=Math.max(1,quotaPeriods);
  }

  const accumQuotas = allQuotasPerPeriod * quotaPeriods;
  const paidRems = allRems.filter(r=>r.status==='paid').reduce((s,r)=>s+(r.amount||0),0);
  const outstandingRems = Math.max(0, allTimeIncomeRemDue + accumQuotas - paidRems);
  const totalChurch = churchBal.total;
  const spendable = totalChurch - outstandingRems;
  const spendLow = parseFloat(settings?.spendableModerate||0)||20000;
  const spendColor = spendable < 0 ? 'var(--danger)' : spendable < spendLow ? 'var(--amber)' : 'var(--success)';
  const spendLabel = spendable < 0 ? 'Deficit — remittances exceed available funds' : spendable < spendLow ? `Low — under ${fmt(spendLow)} threshold` : 'Sufficient';

  // Store spendable in state so the expense form modal can access it without re-fetching
  state._spendable = spendable;
  state._churchBal = churchBal;
  state._outstandingRems = outstandingRems;
  state._spendLow = spendLow;

  // Category totals for breakdown
  const catTotals = {};
  EXPENSE_CATS.forEach(c=>{ catTotals[c.key]=expenses.filter(e=>e.category===c.key).reduce((s,e)=>s+(e.amount||0),0); });

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
        <div class="page-sub">${monthLabel()} — <strong>${fmt(total)}</strong> total${activeFilter?` · Filtered: ${activeCat?.label||activeFilter}`:''}${searchTerm?` · Search: "${searchTerm}"`:''}
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
            all:unset;display:flex;flex-direction:column;gap:6px;
            background:var(--surface);
            border:1.5px solid ${hasAmt?'var(--border2)':'var(--border)'};
            border-radius:var(--rl);padding:12px 14px;cursor:pointer;
            transition:all 0.15s;opacity:${hasAmt?1:0.45};
            box-shadow:none;
            text-align:left;width:100%;box-sizing:border-box
          " >
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <span style="font-size:22px;line-height:1">${c.icon}</span>
              ${pct>0?`<span style="font-size:11px;font-weight:700;padding:2px 6px;border-radius:10px;background:var(--primary-light);color:var(--primary)">${pct<1?'<1':Math.round(pct)}%</span>`:''}
            </div>
            <div style="font-size:12px;font-weight:600;color:var(--text);line-height:1.3;margin-top:2px">${c.label}</div>
            <div style="font-size:13px;font-weight:700;color:${hasAmt?'var(--danger)':'var(--text3)'}">
              ${hasAmt?fmt(amt):'—'}
            </div>
            ${pct>0?`<div style="height:3px;background:var(--border);border-radius:2px;overflow:hidden;margin-top:2px">
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
          <th>Status</th>
          <th>Method</th>
          <th>Recorded By</th>
          <th>Receipt</th>
        </tr>
        ${filtered.map(e=>{
          const c=EXPENSE_CATS.find(x=>x.key===e.category)||{icon:'',label:e.category||'—'};
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
          const canApprovePending = canAction('expense_approve_pending') && e.status!=='approved';
          const statusBadge = e.status==='approved'
            ? '<span class="badge badge-success">Approved</span>'
            : '<span class="badge badge-warn">Pending Approval</span>';
          return `<tr>
            <td style="white-space:nowrap">${fmtDate(e.date||e.createdAt)}<div class="td-muted" style="font-size:11px">${fmtTime(e.createdAt||e.date)}</div></td>
            <td><span class="badge badge-gray">${c.icon} ${c.label}</span></td>
            <td>
              <div style="font-size:13px;font-weight:500">${e.subCategory||e.description||'—'}</div>
              ${e.subCategory&&e.description&&e.description!==e.subCategory?`<div style="font-size:11px;color:var(--text3)">${e.description}</div>`:''}
            </td>
            <td class="td-right td-red td-bold">${fmt(e.amount)}</td>
            <td>${statusBadge}</td>
            <td class="td-muted" style="font-size:12px">${methodLabel}${splitDetail}</td>
            <td class="td-muted" style="font-size:12px">${e.recordedBy||'—'}</td>
            <td>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${e.receiptImage?`<button class="btn btn-sm" onclick="App.viewExpenseReceipt('${e.id}')">🧾 View</button>`:e.receiptNo?`<span class="badge badge-gray">#${e.receiptNo}</span>`:'<span style="color:var(--text3);font-size:12px">—</span>'}
                ${canEditPending?`<button class="btn btn-sm" onclick="App.editExpense('${e.id}')">✏️ Edit</button><button class="btn btn-sm btn-danger" onclick="App.deleteExpense('${e.id}', this)">🗑 Delete</button>`:''}
              </div>
            </td>
          </tr>`;
        }).join('')}
      </table>
      <table class="tx-mobile-table">
        <tr><th>Date</th><th>Details</th><th class="td-right">Amount</th></tr>
        ${filtered.map(e=>{
          const c=EXPENSE_CATS.find(x=>x.key===e.category)||{icon:'💸',label:e.category||'—'};
          const methodLabel = e.paymentMethod==='petty_cash'?'💳 Petty'
            :e.paymentMethod==='bank_transfer'?'🏦 Bank'
            :e.paymentMethod==='split'?'🔀 Split'
            :'💵 Cash';
          const mobileStatus = e.status==='approved'
            ? '<span class="badge badge-success">Approved</span>'
            : '<span class="badge badge-warn">Pending</span>';
          return `<tr class="tx-mobile-row" onclick="App.showExpenseDetail('${e.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.showExpenseDetail('${e.id}')}" tabindex="0" style="cursor:pointer" role="button" aria-label="${esc(e.subCategory||e.description||'Expense')} — ${fmt(e.amount)}">
            <td><div style="font-size:13px;font-weight:600;white-space:nowrap">${fmtDate(e.date||e.createdAt)}</div><div class="td-muted" style="font-size:11px">${fmtTime(e.createdAt||e.date)}</div></td>
            <td style="max-width:0;width:55%">
              <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><span class="badge badge-gray" style="font-size:11px">${c.icon} ${c.label}</span></div>
              <div class="td-muted" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px">${esc(e.subCategory||e.description||'—')}</div>
              <div style="margin-top:3px;display:flex;gap:4px;flex-wrap:wrap">${mobileStatus}<span class="td-muted" style="font-size:11px">${methodLabel}</span></div>
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
  const c = EXPENSE_CATS.find(x=>x.key===e.category)||{icon:'💸',label:e.category||'—'};
  const methodLabel = e.paymentMethod==='petty_cash'?'💳 Petty Cash'
    :e.paymentMethod==='bank_transfer'?'🏦 Bank Transfer'
    :e.paymentMethod==='split'?'🔀 Split'
    :'💵 Cash';
  const splitParts = [];
  if((e.bankAmount||0)>0) splitParts.push(`Bank: ${fmt(e.bankAmount)}`);
  if((e.pettyAmount||0)>0) splitParts.push(`Petty: ${fmt(e.pettyAmount)}`);
  if((e.cashAmount||0)>0) splitParts.push(`Cash: ${fmt(e.cashAmount)}`);
  const statusBadge = e.status==='approved'
    ? '<span class="badge badge-success">Approved</span>'
    : '<span class="badge badge-warn">Pending Approval</span>';
  const canEditPending = canAction('expense_edit_pending') && e.status!=='approved';
  const canDeleteApproved = canAction('expense_delete_approved') && e.status==='approved';
  const canApprovePending = canAction('expense_approve_pending') && e.status!=='approved';
  const rows = [
    ['Date',            fmtDate(e.date||e.createdAt)],
    ['Category',        `<span class="badge badge-gray">${c.icon} ${c.label}</span>`],
    ['Sub-category',    esc(e.subCategory||'—')],
    ...(e.description && e.description!==e.subCategory ? [['Description', esc(e.description)]] : []),
    ['Amount',          `<span class="td-red td-bold" style="font-size:16px">${fmt(e.amount)}</span>`],
    ['Status',          statusBadge],
    ['Payment Method',  `${methodLabel}${splitParts.length?`<div style="font-size:11px;color:var(--text3);margin-top:3px">${splitParts.join(' · ')}</div>`:''}`],
    ['Recorded By',     esc(e.recordedBy||'—')],
    ['Receipt / Ref',   e.receiptNo?`#${esc(e.receiptNo)}`:(e.receiptImage?'📎 Image attached':'—')],
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
      ${e.receiptImage?`<button class="btn btn-sm" onclick="closeModal();App.viewExpenseReceipt('${e.id}')">🧾 View Receipt</button>`:''}
      ${canEditPending?`<button class="btn btn-sm" onclick="closeModal();App.editExpense('${e.id}')">✏️ Edit</button>`:''}
      ${(canEditPending||canDeleteApproved)?`<button class="btn btn-sm btn-danger" onclick="closeModal();App.deleteExpense('${e.id}')">🗑 Delete</button>`:''}
      ${canApprovePending?`<button class="btn btn-primary" onclick="closeModal();App.approveExpense('${e.id}')">✓ Approve</button>`:''}
    </div>`);
}

// ── Petty cash history filters ────────────────────────────────
function setPettySearch(v){ state.pettySearch=v||''; renderPettyCash(); }
function setPettyTypeFilter(v){ state.pettyTypeFilter=v||null; renderPettyCash(); }
function setPettyStatusFilter(v){ state.pettyStatusFilter=v||null; renderPettyCash(); }
function setPettySort(v){ state.pettySort=v||'date_desc'; renderPettyCash(); }
function clearPettyFilters(){ state.pettySearch=''; state.pettyTypeFilter=null; state.pettyStatusFilter=null; renderPettyCash(); }

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
  // Bank Charges must always be paid via bank transfer (auto-deducted from bank balance)
  const methodSel = document.getElementById('exp_method');
  if(methodSel){
    if(cat === 'bank'){
      methodSel.value = 'bank_transfer';
      methodSel.style.opacity = '0.6';
      methodSel.style.pointerEvents = 'none';
      methodSel.setAttribute('aria-readonly','true');
      methodSel.title = 'Bank charges are automatically deducted from the bank balance';
    } else {
      methodSel.style.opacity = '';
      methodSel.style.pointerEvents = '';
      methodSel.removeAttribute('aria-readonly');
      methodSel.title = '';
    }
  }
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

function showExpenseForm(preselectedCat){
  if(!canAction('expense_log')){ showAlert('You do not have permission to log expenses.','danger'); return; }
  const today=new Date().toISOString().split('T')[0];
  const methodOptions = getExpenseMethodOptionsForRole(state.user?.role);
  const defaultMethod = methodOptions[0]?.value || 'bank_transfer';
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
      <input type="number" id="exp_amt" class="form-input" placeholder="0" min="0" oninput="App.onExpMethodChange()" />
      ${state._spendable!=null?`<div style="margin-top:6px;padding:8px 12px;border-radius:var(--r);background:${state._spendable<0?'var(--danger-light)':state._spendable<20000?'var(--amber-light)':'var(--success-light)'};font-size:12px">
        <span style="color:${state._spendable<0?'var(--danger)':state._spendable<20000?'var(--amber)':'var(--success)'};font-weight:600" id="exp_remaining_disp">
          Spendable after remittances: ${fmt(state._spendable)}
        </span>
        <span style="color:var(--text3);margin-left:6px">(Bank ${fmt(state._churchBal?.bankBalance||0)} + Cash ${fmt(Math.max(0,state._churchBal?.cashWithAccountant||0))} + Petty ${fmt(state._churchBal?.pettyFloat||0)} − ${fmt(state._outstandingRems||0)} due)</span>
      </div>`:''}
    </div>

    <!-- Payment Method -->
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

    <div class="form-row">
      <div class="form-group"><label class="form-label">Receipt / Invoice No. (optional)</label><input type="text" id="exp_receipt" class="form-input" placeholder="Optional" /></div>
    </div>
    <div class="form-group"><label class="form-label">Upload Receipt Image (optional)</label>
      <input type="file" id="exp_receipt_file" class="form-input" accept="image/*,application/pdf" style="padding:6px" />
    </div>
    <div class="form-group"><label class="form-label">Notes (optional)</label><textarea id="exp_notes" class="form-textarea" placeholder="Additional details..."></textarea></div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.submitExpense(this)">Save Expense</button></div>`);
  // If a category was pre-selected, populate subcategories immediately
  if(preselectedCat){ setTimeout(()=>App.updateExpenseSubcats(), 30); }
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
  // Lock bank_transfer for bank category
  const cat = document.getElementById('exp_cat')?.value;
  if(cat==='bank'){
    const bankRadio = document.querySelector('input[name="exp_method"][value="bank_transfer"]');
    if(bankRadio){ bankRadio.checked=true; if(splitGrp) splitGrp.style.display='none'; }
  }
}

function onExpSplitChange(){
  const total = parseFloat(document.getElementById('exp_amt')?.value)||0;
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

async function submitExpense(btn=null){
  if(!canAction('expense_log')){ showAlert('You do not have permission to log expenses.','danger'); return; }
  const date=document.getElementById('exp_date')?.value;
  const category=document.getElementById('exp_cat')?.value;
  const subCategory=document.getElementById('exp_subcat')?.value;
  const description=document.getElementById('exp_desc')?.value?.trim();
  const amount=parseFloat(document.getElementById('exp_amt')?.value)||0;
  const isOthers = subCategory==='Others...';
  if(!date||!category){ alert('Please select a date and category.'); return }
  if(!subCategory){ alert('Please select a sub-category.'); return }
  if(isOthers && !description){ alert('Description is required when "Others..." is selected.'); return }
  if(!amount){ alert('Please enter an amount.'); return }

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
    if(!secondaryAmount&&!bankAmount){ alert('Please enter at least one split amount.'); return }
    if(Math.abs(splitTotal-amount)>0.5){ alert(`Split total (${fmt(splitTotal)}) must equal the expense amount (${fmt(amount)}). Please correct.`); return }
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
        alert(`Bank balance is insufficient for this expense.\nAvailable bank balance: ${fmt(availBank)}\nRequired: ${fmt(bankAmount)}`);
        return;
      }
    }
    if(cashAmount > 0){
      const availCash = Math.max(0, _bal.cashWithAccountant||0);
      if(cashAmount > availCash + 0.5){
        alert(`Cash with Accountant is insufficient for this expense.\nAvailable cash: ${fmt(availCash)}\nRequired: ${fmt(cashAmount)}`);
        return;
      }
    }
  }

  const fileEl = document.getElementById('exp_receipt_file');
  const file = fileEl?.files?.[0];
  const restore = setBtnLoading(btn, 'Saving…');

  async function saveExpenseRecord(receiptDataUrl, receiptFileName){
    try {
      const expenseStatus = defaultExpenseStatusForCurrentUser();
      await DB.addExpense({ date, category, subCategory, description: description || subCategory, amount,
        receiptNo: document.getElementById('exp_receipt')?.value,
        receiptImage: receiptDataUrl||null, receiptFileName: receiptFileName||null,
        paymentMethod: isSplit ? 'split' : method,
        bankAmount: bankAmount,
        cashAmount: cashAmount,
        pettyAmount: pettyAmount,
        notes: document.getElementById('exp_notes')?.value, recordedBy:state.user?.name, status:expenseStatus });

      // Deduct from petty cash float for petty_cash or the petty portion of split
      const pettyDeduction = pettyAmount;
      if(pettyDeduction>0){
        const pettyCfg = await DB.getPettyConfig();
        await DB.savePettyConfig({ float: pettyCfg.float - pettyDeduction, max: pettyCfg.max });
      }
      closeModal();
      const splitLabel = isSplit
        ? ` (${pettyAmount>0?`Petty: ${fmt(pettyAmount)} · `:''}${cashAmount>0?`Cash: ${fmt(cashAmount)} · `:''}Bank: ${fmt(bankAmount)})`
        : '';
      showAlert(`Expense of ${fmt(amount)} logged${splitLabel}.${expenseStatus!=='approved'?' It is pending approval.':''}`,'success');
      await renderExpenses();
    } catch(err) {
      restore();
      showAlert(`Failed to save expense: ${err.message||'Unknown error'}. Please try again.`,'danger');
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

async function viewExpenseReceipt(id){
  const allExpVE = await DB.getExpenses();
  const exp = allExpVE.find(e=>e.id===id);
  if(!exp||!exp.receiptImage) return;
  const isImg = exp.receiptImage.startsWith('data:image');
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">🧾 Receipt — ${exp.description||exp.subCategory||'Expense'}</div>
    <p style="font-size:12px;color:var(--text3);margin-bottom:8px">${exp.receiptFileName||''} · ${fmtDate(exp.date||exp.createdAt)}</p>
    ${isImg?`<img src="${exp.receiptImage}" style="width:100%;border-radius:var(--r);max-height:70vh;object-fit:contain" alt="Receipt" />`:
      `<a href="${exp.receiptImage}" target="_blank" class="btn btn-primary" download="${exp.receiptFileName||'receipt'}">Download Receipt PDF</a>`}
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Close</button></div>`);
}

async function editExpense(id){
  const all = await DB.getExpenses();
  const exp = all.find(e=>e.id===id);
  if(!exp) return;
  if(exp.status==='approved'){ alert('Approved expenses cannot be edited.'); return }
  if(!canAction('expense_edit_pending')){ alert('You are not allowed to edit this expense.'); return }

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

  if(!category){ alert('Please select a category.'); return }
  if(!subCategory){ alert('Please select a sub-category.'); return }
  if(subCategory==='Others...' && !description){ alert('Description is required when "Others..." is selected.'); return }
  if(!amount || amount<=0){ alert('Please enter a valid amount.'); return }

  if(btn) btn.disabled=true;
  const all = await DB.getExpenses();
  const exp = all.find(e=>e.id===id);
  if(!exp){ if(btn) btn.disabled=false; alert('Expense not found.'); return }

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
  renderExpenses();
}

async function deleteExpense(id, btn=null){
  const all = await DB.getExpenses();
  const exp = all.find(e=>e.id===id);
  if(!exp) return;
  if(exp.status==='approved'){
    if(!canAction('expense_delete_approved')){ alert('You are not allowed to delete approved expenses.'); return }
  } else {
    if(!canAction('expense_delete_pending')){ alert('You are not allowed to delete this expense.'); return }
  }
  if(!confirm(`Delete this expense (${fmt(exp.amount)})?`)) return;
  const restore = setBtnLoading(btn, 'Deleting…');
  try {
    if((exp.pettyAmount||0)>0){
      const pettyCfg = await DB.getPettyConfig();
      await DB.savePettyConfig({ float: pettyCfg.float + (exp.pettyAmount||0), max: pettyCfg.max });
      DB.addAudit('petty_adjustment',`Petty float restored by ${fmt(exp.pettyAmount||0)} from deleted pending expense (${exp.id})`,state.user?.name);
    }
    await DB.deleteExpense(id);
    DB.addAudit('expense_deleted',`Expense deleted: ${exp.id} (${fmt(exp.amount)})`,state.user?.name);
    showAlert('Expense deleted.','warn');
    renderExpenses();
  } catch(err) {
    restore();
    showAlert(`Failed to delete expense: ${err.message||'Unknown error'}. Please try again.`,'danger');
  }
}

async function approveExpense(id, btn=null){
  if(!canAction('expense_approve_pending')){ alert('You are not allowed to approve expenses.'); return }
  const all = await DB.getExpenses();
  const exp = all.find(e=>e.id===id);
  if(!exp) return;
  if(exp.status==='approved'){ alert('Expense is already approved.'); return }
  const restore = setBtnLoading(btn, 'Approving…');
  try {
    await DB.updateExpense(id, { status:'approved' });
    DB.addAudit('expense_approved',`Expense approved: ${exp.id} (${fmt(exp.amount)})`,state.user?.name);
    showAlert('Expense approved.','success');
    renderExpenses();
  } catch(err) {
    restore();
    showAlert(`Failed to approve expense: ${err.message||'Unknown error'}. Please try again.`,'danger');
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

  if(!date||!amount){ alert('Please fill in the date and amount.'); return; }
  if(!isDirect && !description){ alert('Please fill in the purpose / description.'); return; }
  if(!auth){ alert('Please select at least one authorizing signatory.'); return; }
  if(isDirect && !expCat){ alert('Please select an expense category.'); return; }
  if(isDirect && !expSubcat){ alert('Please select a sub-category.'); return; }

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
  const [allCashTx, allExpenses, allIncome, allRemittances] = await Promise.all([
    DB.getCashTransactions(), DB.getExpenses(), DB.getIncome(), DB.getRemittances()
  ]);
  const remRates = (await getRemRates()).rates || DEFAULT_REMITTANCE_RATES;
  const tab = state.bankTab||'overview';

  // Calculate bank balance components
  const bankTransferIncome = allIncome.reduce((s,r) => s + (r.bankTransferAmount||0), 0);
  const cashDepositedToBank = allCashTx.filter(t=>t.type==='cash_deposit').reduce((s,t) => s+(t.amount||0), 0);
  const bankExpenses = allExpenses.filter(e=>e.status==='approved').reduce((sum,e)=>{
    if(e.paymentMethod==='bank_transfer') return sum+(e.amount||0);
    if(e.paymentMethod==='split') return sum+(e.bankAmount||0);
    return sum;
  }, 0);
  const paidRems = allRemittances.filter(r=>r.status==='paid').reduce((s,r) => s+(r.amount||0), 0);
  const bankWithdrawals = allCashTx.filter(t=>t.type==='withdrawal').reduce((s,t) => s+(t.amount||0), 0);
  // Petty top-ups paid via bank transfer must be deducted (same as calcChurchBalance)
  const pettyHistory = await DB.getPetty();
  const pettyBankTopups = pettyHistory.filter(h=>h.type==='refill'&&(h.paymentMethod==='bank_transfer'||(h.paymentMethod==='split'&&(h.bankAmount||0)>0)))
    .reduce((s,h)=>s+(h.paymentMethod==='split'?(h.bankAmount||0):(h.amount||0)),0);
  const bankBalance = bankTransferIncome + cashDepositedToBank - bankExpenses - paidRems - bankWithdrawals - pettyBankTopups;

  // Cash with Accountant (mirrors calcChurchBalance, using data already fetched above)
  const cashFromCollectionsRB = allIncome.reduce((s,r)=>{
    const isSunday = !r.source||r.source==='sunday_collection';
    if(isSunday) return s+getSundayCashWithAccountant(r, remRates);
    return s+Math.max(0,(r.totalCollection||0)-(r.bankTransferAmount||0)-(r.directPettyCash||0));
  },0);
  const bankToAccountantRB = allCashTx.filter(t=>t.type==='withdrawal'&&t.destination==='accountant_cash').reduce((s,t)=>s+(t.amount||0),0);
  const cashExpensesRB = allExpenses.filter(e=>e.status==='approved').reduce((s,e)=>{
    if(e.paymentMethod==='cash') return s+(e.amount||0);
    if(e.paymentMethod==='split') return s+(e.cashAmount||0);
    return s;
  },0);
  const pettyCashTopupsRB = pettyHistory.filter(h=>h.type==='refill'&&(h.status==='approved'||h.status==='settled')&&(h.paymentMethod==='cash_accountant'||(h.paymentMethod==='split'&&(h.cashAmount||0)>0)))
    .reduce((s,h)=>s+(h.paymentMethod==='split'?(h.cashAmount||0):(h.amount||0)),0);
  const cashWithAccountant = Math.max(0, cashFromCollectionsRB - cashDepositedToBank + bankToAccountantRB - cashExpensesRB - pettyCashTopupsRB);

  // Monthly bank charges
  const monthlyBankCharges = filterByMonth(allExpenses).filter(e=>e.category==='bank').reduce((s,e)=>s+(e.amount||0),0);

  // Monthly withdrawals / deposits
  const monthlyWithdrawals = filterByMonth(allCashTx).filter(t=>t.type==='withdrawal');
  const monthlyDeposits = filterByMonth(allCashTx).filter(t=>t.type==='cash_deposit');

  // Pending cash deposits (income records with undeposited cash — all time)
  const pendingDepItems = allIncome.filter(r=>{
    const isSunday = !r.source||r.source==='sunday_collection';
    const cashHeld = isSunday
      ? getSundayCashWithAccountant(r, remRates)
      : r.paymentMethod==='cash'?(r.totalCollection||0):0;
    if(cashHeld<=0) return false;
    const deposited = allCashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
    return deposited < cashHeld;
  });
  const pendingDepCount = pendingDepItems.length;
  const pendingDepTotal = pendingDepItems.reduce((s,r)=>{
    const isSunday = !r.source||r.source==='sunday_collection';
    const cashHeld = isSunday
      ? getSundayCashWithAccountant(r, remRates)
      : r.paymentMethod==='cash'?(r.totalCollection||0):0;
    const deposited = allCashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
    return s + Math.max(0, cashHeld - deposited);
  }, 0);

  // All bank transactions for reconciliation (combined view)
  const bankTxAll = [
    ...allCashTx.filter(t=>t.type==='withdrawal').map(t=>({...t, txType:'withdrawal', txLabel:'Withdrawal', txAmt: -(t.amount||0)})),
    ...allCashTx.filter(t=>t.type==='cash_deposit').map(t=>({...t, txType:'deposit', txLabel:'Cash Deposit', txAmt: (t.amount||0)})),
    ...allExpenses
      .filter(e=>e.paymentMethod==='bank_transfer'||(e.paymentMethod==='split'&&(e.bankAmount||0)>0))
      .map(e=>({
        ...e,
        txType:'expense',
        txLabel:`Expense: ${e.description||e.category}`,
        txAmt: -(e.paymentMethod==='split'?(e.bankAmount||0):(e.amount||0)),
        date:e.date||e.createdAt
      })),
    ...allRemittances.filter(r=>r.status==='paid').map(r=>({...r, txType:'remittance', txLabel:`Remittance: ${r.incomeType||'HQ'}`, txAmt: -(r.amount||0), date:r.date||r.createdAt})),
    ...allIncome.filter(r=>(r.bankTransferAmount||0)>0).map(r=>({...r, txType:'income', txLabel:`Income deposit (bank transfer)`, txAmt: (r.bankTransferAmount||0)})),
    ...pettyHistory.filter(h=>h.type==='refill'&&(h.paymentMethod==='bank_transfer'||(h.paymentMethod==='split'&&(h.bankAmount||0)>0)))
      .map(h=>({...h, txType:'petty-topup', txLabel:`Petty cash top-up (bank)`, txAmt:-(h.paymentMethod==='split'?(h.bankAmount||0):(h.amount||0))}))
  ].sort((a,b)=>new Date(b.date||b.createdAt||0)-new Date(a.date||a.createdAt||0));

  const monthBankTx = bankTxAll.filter(t=>{
    const d=new Date(t.date||t.createdAt||0);
    return d.getMonth()===state.month && d.getFullYear()===state.year;
  });

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Bank Account</div><div class="page-sub">Balance: ${fmt(bankBalance)}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${canAction('income_deposit')&&cashWithAccountant>0?`<button class="btn btn-amber" onclick="App.confirmBulkDeposit()">💰 Deposit Cash (${fmt(cashWithAccountant)})</button>`:''}
        ${canAction('bank_withdrawal')?`<button class="btn btn-primary" onclick="App.showBankWithdrawal()">🏦 Record Withdrawal</button>`:''}
        ${canAction('bank_charge')?`<button class="btn" onclick="App.showBankChargeForm()">💳 Bank Charge</button>`:''}
      </div>
    </div>
    ${cashWithAccountant>0&&canAction('income_deposit')?`<div class="alert alert-warn" style="margin-bottom:12px"><span class="alert-icon">⚠</span><span>Cash with Accountant: <strong>${fmt(cashWithAccountant)}</strong> not yet deposited to the bank account.${pendingDepCount>0?` (${pendingDepCount} income record(s) pending)`:''} <button class="btn btn-sm btn-amber" onclick="App.confirmBulkDeposit()" style="margin-left:8px">Deposit Now</button></span></div>`:''}

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
        <div class="kpi-label">Bank Charges (${MONTHS[state.month].slice(0,3)})</div>
        <div class="kpi-val">${fmt(monthlyBankCharges)}</div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab ${tab==='overview'?'active':''}" onclick="App.setBankTab('overview')">Overview</button>
      <button class="tab ${tab==='withdrawals'?'active':''}" onclick="App.setBankTab('withdrawals')">Withdrawals (${monthlyWithdrawals.length})</button>
      <button class="tab ${tab==='deposits'?'active':''}" onclick="App.setBankTab('deposits')">Deposits (${monthlyDeposits.length})</button>
      <button class="tab ${tab==='charges'?'active':''}" onclick="App.setBankTab('charges')">Bank Charges</button>
      <button class="tab ${tab==='reconciliation'?'active':''}" onclick="App.setBankTab('reconciliation')">Reconciliation</button>
    </div>

    ${tab==='overview'?renderBankOverview(monthBankTx,bankBalance):
      tab==='withdrawals'?renderBankWithdrawals(monthlyWithdrawals):
      tab==='deposits'?renderBankDeposits(monthlyDeposits):
      tab==='charges'?renderBankCharges(filterByMonth(allExpenses).filter(e=>e.category==='bank')):
      renderBankReconciliation(bankTxAll,bankBalance,bankTransferIncome,cashDepositedToBank,bankExpenses,paidRems,bankWithdrawals,pettyBankTopups)}`;
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
              <div style="font-size:11px;color:var(--text3);margin-top:2px">${fmtDate(t.date||t.createdAt)} &nbsp;·&nbsp; <span class="badge ${isCredit?'badge-success':'badge-danger'}" style="font-size:10px">${t.txType}</span></div>
            </div>
            <div style="text-align:right;flex-shrink:0;margin-left:4px">
              <div style="font-size:14px;font-weight:700;color:${color}">${sign}${fmt(Math.abs(t.txAmt))}</div>
            </div>
            <span style="font-size:9px;color:var(--text3);flex-shrink:0">▾</span>
          </div>
          <div class="bk-det" style="display:none;padding:8px 0 2px;font-size:11px;color:var(--text2);line-height:2">
            <div>Balance after this transaction: <strong style="color:${balColor}">${fmt(t.balAfter)}</strong></div>
            ${t.reference?`<div>Reference: <strong>${t.reference}</strong></div>`:''}
            ${t.photoData?`<div><a href="${t.photoData}" target="_blank" style="color:var(--primary);font-weight:600">📷 View Deposit Slip</a></div>`:''}
            <div>Time: ${fmtTime(t.createdAt||t.date)}</div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
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
      ${deposits.map(t=>`<div onclick="var d=this.querySelector('.bk-det');d.style.display=d.style.display==='none'?'block':'none'" style="cursor:pointer;border-bottom:1px solid var(--border-light,#f0f0f0);padding:10px 0">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.description||'Cash Deposit'}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">${fmtDate(t.date||t.createdAt)}${t.depositMethod?` &nbsp;·&nbsp; ${(t.depositMethod||'').replace(/_/g,' ')}`:''}${t.photoData?` &nbsp;·&nbsp; <span class="badge badge-info" style="font-size:10px">📷 Photo</span>`:''}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:4px">
            <div style="font-size:14px;font-weight:700;color:var(--success,#2e7d32)">+${fmt(t.amount)}</div>
          </div>
          <span style="font-size:9px;color:var(--text3);flex-shrink:0">▾</span>
        </div>
        <div class="bk-det" style="display:none;padding:8px 0 2px;font-size:11px;color:var(--text2);line-height:2">
          ${t.reference?`<div>Reference: <strong>${t.reference}</strong></div>`:''}
          ${t.recordedBy?`<div>Recorded By: <strong>${t.recordedBy}</strong></div>`:''}
          ${t.photoData?`<div><a href="${t.photoData}" target="_blank" style="color:var(--primary);font-weight:600">📷 View Deposit Slip</a></div>`:''}
          <div>Time: ${fmtTime(t.createdAt||t.date)}</div>
        </div>
      </div>`).join('')}
    </div>
  </div>`;
}

function renderBankCharges(charges){
  const total = charges.reduce((s,e)=>s+(e.amount||0),0);
  if(!charges.length) return '<div class="card"><div class="empty-table">No bank charges recorded this month.</div></div>';
  return `<div class="card">
    <div class="card-header"><span class="card-title">Bank Charges — ${monthLabel()}</span><span style="font-size:13px;font-weight:600;color:var(--danger)">${fmt(total)}</span></div>
    <div style="padding:0 4px">
      ${charges.map(e=>`<div onclick="var d=this.querySelector('.bk-det');d.style.display=d.style.display==='none'?'block':'none'" style="cursor:pointer;border-bottom:1px solid var(--border-light,#f0f0f0);padding:10px 0">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.subCategory||'Bank Charge'}</div>
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
      <p style="font-size:13px;color:var(--text2);margin-bottom:12px">Enter your actual bank statement balance to compare with the computed balance.</p>
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
  if(isNaN(stmtBal)){ alert('Please enter the bank statement balance.'); return }
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
  if(!date||!amount){ alert('Please fill date and amount.'); return }
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
  const approvedTopups = history.filter(h=>h.status==='approved'&&h.type==='topup_request'&&
    Math.max(0,(h.originalAmount||h.amount||0)-(h.actualAmount||0))>0.5);

  // Advances awaiting proof
  const advancesAwaitingProof = history.filter(h=>h.status==='approved'&&h.type==='advance'&&!h.receiptNo);
  const overdueReceipts = advancesAwaitingProof.filter(h=>isReceiptOverdue(h));

  // This month stats
  const monthTopups = monthHistory.filter(h=>h.type==='refill').reduce((s,h)=>s+(h.amount||0),0);
  const monthAdvancesDisbursed = monthHistory.filter(h=>h.type==='advance'&&(h.status==='approved'||h.status==='settled')).reduce((s,h)=>s+(h.amount||0),0);

  // Petty cash expenses since the last refill (for top-up request)
  // history is already newest-first from the API — find() without reverse picks the most recent
  const lastRefill = history.find(h=>h.type==='refill');
  const lastRefillDate = lastRefill ? new Date(lastRefill.createdAt||0) : new Date(0);
  // Exclude expenses already included in any pending or approved top-up request
  // Exclude expenses already in any active OR settled top-up request
  const alreadyClaimedExpIds = new Set(
    history
      .filter(h=>h.type==='topup_request'&&(h.status==='pending_approval'||h.status==='approved'||h.status==='settled'))
      .flatMap(h=>Array.isArray(h.expenseRefs)?h.expenseRefs:[])
  );
  const expensesSinceRefill = allExpenses.filter(e=>{
    if(e.status!=='approved' && e.status!=='pending_approval') return false;
    if(e.paymentMethod!=='petty_cash' && !(e.paymentMethod==='split' && (e.pettyAmount||0)>0)) return false;
    if(alreadyClaimedExpIds.has(e.id)) return false;
    // Use createdAt (record timestamp) for the refill cutoff — e.date is date-only
    // and would parse to midnight UTC, wrongly excluding same-day expenses logged
    // after a refill earlier in the day.
    const expTime = new Date(e.createdAt || e.date || 0);
    return expTime > lastRefillDate;
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
        ${canAction('petty_topup_payment')?`<button class="btn btn-amber" onclick="App.showPettyRefill()">📋 Record Top-Up Payment</button>`:''}
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
            <div style="font-size:11px;color:var(--text3);margin-bottom:2px">Spent since last top-up</div>
            <div style="font-size:16px;font-weight:700;color:var(--danger)">${fmt(expensesSinceRefillTotal)}</div>
            <div style="font-size:11px;color:var(--text3)">${expensesSinceRefill.length} expense(s) not yet refunded</div>
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
          The wallet has been used for ${fmt(expensesSinceRefillTotal)} in expenses since the last top-up.
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
        <span style="font-size:11px;color:var(--text3)">Total: ${fmt(approvedTopups.reduce((s,r)=>s+(r.amount||0),0))}</span>
      </div>
      <div class="topup-desktop-table">
        <div class="table-wrap"><table>
          <tr><th>Date Approved</th><th>Request</th><th>Requested By</th><th>Approved By</th><th class="td-right">Amount</th><th>Action</th></tr>
          ${approvedTopups.map(r=>`<tr>
            <td style="white-space:nowrap">${fmtDate(r.approvedAt||r.createdAt)}<div class="td-muted" style="font-size:11px">${fmtTime(r.approvedAt||r.createdAt)}</div></td>
            <td>
              <div style="font-size:13px;font-weight:500">${r.purpose||'Wallet top-up'}</div>
              ${r.expenseRefs?.length?`<div style="font-size:11px;color:var(--text3)">${r.expenseRefs.length} expense(s) included</div>`:''}
              ${(r.actualAmount||0)>0?`<div style="font-size:11px;color:var(--text3)">Paid so far: ${fmt(r.actualAmount||0)} · Remaining: ${fmt(Math.max(0,(r.originalAmount||r.amount||0)-(r.actualAmount||0)))}</div>`:''}
            </td>
            <td class="td-muted">${r.requestedBy||'—'}</td>
            <td class="td-muted">${r.approvedBy||'—'}</td>
            <td class="td-right td-bold" style="color:var(--primary)">
              <div>${fmt(r.originalAmount||r.amount)}</div>
              ${(r.actualAmount||0)>0?`<div style="font-size:11px;color:var(--success)">Paid: ${fmt(r.actualAmount)}</div>`:''}
              ${(r.actualAmount||0)>0?`<div style="font-size:11px;color:var(--amber)">Due: ${fmt(Math.max(0,(r.originalAmount||r.amount||0)-(r.actualAmount||0)))}</div>`:''}
            </td>
            <td><button class="btn btn-sm btn-primary" onclick="App.showPettyRefill(${Math.max(0,(r.originalAmount||r.amount||0)-(r.actualAmount||0))}, '${r.id}')">📋 Record Payment</button></td>
          </tr>`).join('')}
        </table></div>
      </div>
      <div class="topup-mobile-list">
        ${approvedTopups.map(r=>{
          const due=Math.max(0,(r.originalAmount||r.amount||0)-(r.actualAmount||0));
          return`<div class="topup-card">
            <div class="topup-card-header" onclick="toggleTopupCard(this)" role="button" tabindex="0" aria-expanded="false" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleTopupCard(this)}">
              <div class="topup-card-left">
                <div class="topup-card-date">${fmtDate(r.approvedAt||r.createdAt)}<span class="topup-card-time" style="margin-left:6px">${fmtTime(r.approvedAt||r.createdAt)}</span></div>
                <div class="topup-card-title">${r.purpose||'Wallet top-up'}</div>
                ${r.expenseRefs?.length?`<div class="topup-card-sub">${r.expenseRefs.length} expense(s) included</div>`:''}
              </div>
              <div class="topup-card-right">
                <div class="topup-card-amount">${fmt(r.originalAmount||r.amount)}</div>
                ${(r.actualAmount||0)>0?`<div style="font-size:11px;color:var(--amber)">Due: ${fmt(due)}</div>`:''}
              </div>
              <span class="topup-card-chevron">▼</span>
            </div>
            <div class="topup-card-body">
              <div class="topup-card-detail-row"><span class="topup-card-detail-label">Requested By</span><span class="topup-card-detail-val">${r.requestedBy||'—'}</span></div>
              <div class="topup-card-detail-row"><span class="topup-card-detail-label">Approved By</span><span class="topup-card-detail-val">${r.approvedBy||'—'}</span></div>
              ${(r.actualAmount||0)>0?`<div class="topup-card-detail-row"><span class="topup-card-detail-label">Paid So Far</span><span class="topup-card-detail-val" style="color:var(--success)">${fmt(r.actualAmount)}</span></div>`:''}
              ${(r.actualAmount||0)>0?`<div class="topup-card-detail-row"><span class="topup-card-detail-label">Remaining</span><span class="topup-card-detail-val" style="color:var(--amber)">${fmt(due)}</span></div>`:''}
              <div class="topup-card-action"><button class="btn btn-sm btn-primary btn-full" onclick="App.showPettyRefill(${due}, '${r.id}')">📋 Record Payment</button></div>
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

// ── TOP-UP REQUEST (Admin Officer: wallet is low, based on expenses already logged) ──
async function showTopUpRequest(){
  if(!canAction('petty_request')){ showAlert('You do not have permission to request petty cash top-up.','danger'); return; }
  const [pettyConfig, allExpenses, allPettyRaw] = await Promise.all([DB.getPettyConfig(), DB.getExpenses(), DB.getPetty()]);
  // allPettyRaw is newest-first from API — find() without reverse picks the most recent refill
  const lastRefill = allPettyRaw.find(h=>h.type==='refill');
  const lastRefillDate = lastRefill ? new Date(lastRefill.createdAt||0) : new Date(0);

  // Expenses paid from petty cash since last top-up — exclude those already in any request (including settled)
  const alreadyInRequest = new Set(
    allPettyRaw
      .filter(h=>h.type==='topup_request'&&(h.status==='pending_approval'||h.status==='approved'||h.status==='settled'))
      .flatMap(h=>Array.isArray(h.expenseRefs)?h.expenseRefs:[])
  );
  const unrecovered = allExpenses.filter(e=>{
    if(e.status!=='approved' && e.status!=='pending_approval') return false;
    if(e.paymentMethod!=='petty_cash' && !(e.paymentMethod==='split' && (e.pettyAmount||0)>0)) return false;
    if(alreadyInRequest.has(e.id)) return false;
    const expTime = new Date(e.createdAt || e.date || 0);
    return expTime > lastRefillDate;
  }).sort((a,b)=>new Date(a.createdAt||a.date||0)-new Date(b.createdAt||b.date||0));

  const totalAmt = unrecovered.reduce((s,e)=>s+(e.paymentMethod==='split'?(e.pettyAmount||0):(e.amount||0)),0);
  const cashOnHand = pettyConfig.float;

  const expRows = unrecovered.map(e=>{
    const c=EXPENSE_CATS.find(x=>x.key===e.category)||{icon:'💸',label:e.category||'Other'};
    const amt = e.paymentMethod==='split'?(e.pettyAmount||0):(e.amount||0);
    const detailBits = [e.subCategory, e.description&&e.description!==e.subCategory?e.description:'', e.notes?`Notes: ${e.notes}`:''].filter(Boolean);
    return `<tr>
      <td style="font-size:12px;white-space:nowrap">${fmtDate(e.date||e.createdAt)}<div class="td-muted" style="font-size:11px">${fmtTime(e.createdAt||e.date)}</div></td>
      <td><span class="badge badge-gray" style="font-size:11px">${c.icon} ${c.label}</span></td>
      <td style="font-size:12px">
        ${detailBits.map(d=>`<div>${esc(d)}</div>`).join('')||'—'}
        ${e.status!=='approved'?`<div><span class="badge badge-warn" style="font-size:10px;margin-top:3px">Pending approval</span></div>`:''}
      </td>
      <td class="td-right td-bold" style="font-size:13px;color:var(--danger)">${fmt(amt)}</td>
    </tr>`;
  }).join('');

  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">↺ Request Wallet Top-Up</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>This lists all petty cash expenses logged since the last top-up. The Accountant will verify these, then a Signatory approves before the cash is sent to you.</span></div>
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
  if(!amount){ alert('Please enter the top-up amount.'); return }
  if(override && !overrideReason){ alert('Please provide a reason for overriding the calculated amount.'); return }
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
  if(req.status!=='pending_approval'){ alert('Only pending top-up requests can be cancelled.'); return }
  const canCancel = canAction('topup_cancel', { request:req });
  if(!canCancel){ alert('You are not allowed to cancel this request.'); return }
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
  if(!purpose||!amount||!category){ alert('Please fill in the purpose, amount, and category.'); return }

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
      const c = EXPENSE_CATS.find(x=>x.key===e.category)||{icon:'💸',label:e.category||'Other'};
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
  if(!win){ alert('Please allow pop-ups for this site to print.'); return; }
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
    // Option B: approving a top-up request also marks linked expenses as approved
    if(Array.isArray(req.expenseRefs) && req.expenseRefs.length){
      const allExpenses = await DB.getExpenses();
      const linked = allExpenses.filter(e=>req.expenseRefs.includes(e.id) && e.status!=='approved');
      for(const exp of linked){
        await DB.updateExpense(exp.id, { status:'approved' });
      }
    }
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

  if(!noReceiptChecked && !no){ alert('Please enter the receipt number, or tick "No physical receipt" and give a reason.'); return }
  if(noReceiptChecked && !document.getElementById('rc_reason')?.value?.trim()){ alert('Please explain why there is no receipt.'); return }

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
  const [pettyHistory, pettyConfig, allUsers] = await Promise.all([DB.getPetty(), DB.getPettyConfig(), DB.getUsers()]);
  const petty = { history: pettyHistory, float: pettyConfig.float, max: pettyConfig.max };
  const settled = pettyMonthHistory(petty.history).filter(h=>h.status==='settled'&&h.type!=='refill');
  const settledTotal = settled.reduce((s,h)=>s+(h.actualAmount||h.amount||0),0);
  const spaceInFloat = petty.max - petty.float;
  const suggested = prefillAmount != null
    ? prefillAmount   // use the pre-filled amount from an approved request
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

    <div class="form-group"><label class="form-label">Top-Up Amount (₦) <span style="color:var(--danger)">*</span></label>
      <input type="number" id="ref_amt" class="form-input" placeholder="0" value="${suggested||''}" />
      <input type="hidden" id="ref_topup_id" value="${esc(topupRequestId||'')}" />
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

  if(!amt){ alert('Please enter a top-up amount.'); return }
  if(method!=='cash_accountant' && !ref){ alert('Please enter the bank transfer reference number.'); return }
  if(!auth){ alert('Please select or enter who is authorizing this top-up.'); return }

  const pettyConfig = await DB.getPettyConfig();
  const spaceAvailable = pettyConfig.max - pettyConfig.float;
  if(spaceAvailable <= 0){
    alert(`Petty cash is already at or above the approved max (${fmt(pettyConfig.max)}). Reduce current float before recording another top-up.`);
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
    alert(`Bank balance is insufficient for this top-up.\nAvailable bank balance: ${fmt(bankBal)}\nRequested: ${fmt(bankAmt)}`);
    return;
  }
  if(method==='cash_accountant' && cashAmt > cashBal + 0.5){
    alert(`Cash with Accountant is insufficient for this top-up.\nAvailable cash: ${fmt(cashBal)}\nRequested: ${fmt(cashAmt)}`);
    return;
  }
  if(method==='split'){
    const splitTotal = bankAmt + cashAmt;
    if(!bankAmt && !cashAmt){ alert('Enter split amounts for bank and cash.'); return }
    if(Math.abs(splitTotal-actualAdded)>0.5){ alert(`Split total (${fmt(splitTotal)}) must match top-up amount (${fmt(actualAdded)}).`); return }
    if(bankAmt > bankBal + 0.5){ alert(`Bank portion exceeds available bank balance (${fmt(bankBal)}).`); return }
    if(cashAmt > cashBal + 0.5){ alert(`Cash portion exceeds available cash with Accountant (${fmt(cashBal)}).`); return }
  }
  const methodLabel = method==='split' ? `Split — Bank: ${fmt(bankAmt)} + Cash: ${fmt(cashAmt)}` : method==='cash_accountant' ? 'Cash with Accountant' : 'Bank Transfer';

  let linkedTopup = null;
  if(topupRequestId){
    const pettyHistory = await DB.getPetty();
    linkedTopup = pettyHistory.find(h=>h.id===topupRequestId && h.type==='topup_request');
    if(!linkedTopup){ alert('Linked top-up request was not found. Please refresh and try again.'); return }
    if(linkedTopup.status!=='approved'){ alert('Only approved top-up requests can be settled from this screen.'); return }
    const remaining = linkedTopup.amount||0;
    if(actualAdded > remaining + 0.5){
      alert(`Recorded payment (${fmt(actualAdded)}) cannot exceed the remaining approved balance (${fmt(remaining)}).`);
      return;
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
      // Preserve original amount — do NOT mutate it. Track paid via actualAmount.
      const originalAmt = linkedTopup.originalAmount || linkedTopup.amount || 0;
      const paidSoFar = linkedTopup.actualAmount || 0;
      const totalPaid = paidSoFar + actualAdded;
      const remaining = Math.max(0, originalAmt - totalPaid);
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
    const _origAmt = linkedTopup ? (linkedTopup.originalAmount || linkedTopup.amount || 0) : 0;
    const _paidSoFar = linkedTopup ? (linkedTopup.actualAmount || 0) : 0;
    const _remaining = linkedTopup ? Math.max(0, _origAmt - (_paidSoFar + actualAdded)) : 0;
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
function openPrintableReport(title, bodyHTML){
  const html=`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>${esc(title)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#333;padding:30px 36px;line-height:1.5}
  .report-header{text-align:center;border-bottom:3px double #0F6E56;padding-bottom:16px;margin-bottom:20px}
  .report-header .church-name{font-size:20px;font-weight:700;color:#0F6E56;margin-bottom:2px;text-transform:uppercase;letter-spacing:1px}
  .report-header .church-address{font-size:11px;color:#666;margin-bottom:8px}
  .report-header .report-title{font-size:15px;font-weight:700;color:#333;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px}
  .report-header .report-period{font-size:12px;color:#555}
  .report-header .report-meta{font-size:11px;color:#777;margin-top:6px}
  .section-title{font-size:13px;font-weight:700;color:#0F6E56;margin:20px 0 8px;padding:4px 0;border-bottom:2px solid #0F6E56;text-transform:uppercase;letter-spacing:0.5px}
  .section-title span{font-weight:normal;font-size:11px;color:#666;margin-left:8px;text-transform:none;letter-spacing:0}
  table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:12px}
  th{background:#0F6E56;color:#fff;padding:7px 10px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.3px}
  td{padding:6px 10px;border-bottom:1px solid #e0e0e0}
  tr:nth-child(even) td{background:#fafafa}
  .summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:14px 0 18px;page-break-inside:avoid}
  .summary-box{border:1.5px solid #e0e0e0;border-radius:6px;padding:12px 14px;text-align:center}
  .summary-box .label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#777;margin-bottom:4px}
  .summary-box .value{font-size:18px;font-weight:700;color:#333}
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
  .note-box{background:#fff8e1;border:1px solid #f0c040;border-radius:4px;padding:10px 14px;font-size:11px;margin:12px 0;color:#7a5200;line-height:1.6}
  .sig-section{display:grid;grid-template-columns:1fr 1fr 1fr;gap:28px;margin-top:40px;page-break-inside:avoid}
  .sig-box{border-top:1.5px solid #333;padding-top:8px;font-size:11px;text-align:center;line-height:1.6}
  .sig-box .sig-name{font-weight:600;margin-top:4px}
  .footer-note{margin-top:24px;padding-top:12px;border-top:1px solid #ddd;font-size:10px;color:#999;text-align:center}
  .badge{display:inline-block;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px}
  .badge-success{background:#EAF3DE;color:#3B6D11}
  .badge-warn{background:#FAEEDA;color:#BA7517}
  .badge-danger{background:#FCEBEB;color:#A32D2D}
  .badge-info{background:#E6F1FB;color:#185FA5}
  .no-data{text-align:center;padding:30px;color:#999;font-style:italic}
  @media print{
    body{padding:15px 20px}
    .no-print{display:none!important}
    table{page-break-inside:auto}
    tr{page-break-inside:avoid}
  }
  .print-btn-bar{text-align:center;margin-bottom:20px}
  .print-btn{background:#0F6E56;color:#fff;border:none;padding:10px 28px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}
  .print-btn:hover{background:#085041}
</style>
</head>
<body>
  <div class="print-btn-bar no-print"><button class="print-btn" onclick="window.print()">🖨️ Print Report</button></div>
  ${bodyHTML}
</body></html>`;
  const w=window.open('','_blank');
  if(!w){ showAlert('Pop-up blocked. Please allow pop-ups for this site to print the report.','warn'); return }
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
    <div class="report-meta">Prepared by: ${esc(state.user?.name||'—')} &nbsp;|&nbsp; Date: ${fmtDate(new Date().toISOString())}</div>
  </div>`;
}

/** Shared signature section */
function reportSignatureHTML(pastorName='', reviewerLabel='Reviewed &amp; Approved by:'){
  const pastorDisplay = pastorName ? esc(pastorName) : '________________';
  return `<div class="sig-section">
    <div class="sig-box">Prepared by:<br><br><br><div class="sig-name">${esc(state.user?.name||'________________')}</div>Church Accountant</div>
    <div class="sig-box">${reviewerLabel}<br><br><br><div class="sig-name">${pastorDisplay}</div>Parish Pastor</div>
    <div class="sig-box">Date:<br><br><br><div class="sig-name">${fmtDate(new Date().toISOString())}</div></div>
  </div>
  <div class="footer-note">This is a computer-generated report from the RCCG Kingdom Parish Finance Portal. For enquiries, contact the Church Accountant or Admin Officer.</div>`;
}

async function renderReports(){
  const settings = await DB.getSettings();
  // Initialise report date range using same cut-off logic as remittances page
  const cutoffConfig = getRemCutoffDates(settings, state.year);
  const cutoffYear = cutoffConfig ? Number(cutoffConfig.year) : null;
  const cutoffDay = (cutoffConfig && cutoffYear===state.year && Number.isInteger(cutoffConfig.dates[state.month]))
    ? cutoffConfig.dates[state.month] : null;
  if(cutoffDay){
    state.reportToDate = ymdLocal(new Date(state.year, state.month, cutoffDay));
    const prevMonth = state.month===0 ? 11 : state.month-1;
    const prevYear  = state.month===0 ? state.year-1 : state.year;
    const prevCC = getRemCutoffDates(settings, prevYear);
    const prevCutoffDay = (prevCC && Number.isInteger(prevCC.dates[prevMonth]) && Number(prevCC.year)===prevYear)
      ? prevCC.dates[prevMonth] : null;
    if(prevCutoffDay){
      const d=new Date(prevYear,prevMonth,prevCutoffDay); d.setDate(d.getDate()+1);
      state.reportFromDate=ymdLocal(d);
    } else {
      state.reportFromDate=ymdLocal(new Date(state.year,state.month,1));
    }
  } else {
    if(!state.reportFromDate) state.reportFromDate=ymdLocal(new Date(state.year,state.month,1));
    if(!state.reportToDate)   state.reportToDate=ymdLocal(new Date());
  }
  const fromDate=state.reportFromDate;
  const toDate=state.reportToDate;
  document.getElementById('pageContent').innerHTML=`
    <div class="page-header"><div class="page-title">📊 Reports Centre</div><div class="page-sub">Generate comprehensive financial reports</div></div>
    <div class="card" style="margin-bottom:12px;padding:14px 16px">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">📅 Report Period</div>
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
        ${cutoffDay?'<span class="badge badge-info" style="font-size:11px">📅 Default from cut-off date</span>':''}
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px">
        ℹ️ All reports below will cover this period. ${cutoffDay?'Defaulted from HQ cut-off date — you can still edit. ':''}Adjust the dates before generating any report.
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
    <div id="reportOutput"></div>`;
}

function onReportDatesChange(){
  state.reportFromDate=document.getElementById('reportFromDate')?.value||null;
  state.reportToDate=document.getElementById('reportToDate')?.value||null;
  renderReports();
}

async function generateMonthlyReport(){
  const [allIncome, allExpenses, allRemittances, settings, allCashTx, remRatesData, users] = await Promise.all([
    DB.getIncome(), DB.getExpenses(), DB.getRemittances(), DB.getSettings(), DB.getCashTransactions(), getRemRates(), DB.getUsers()
  ]);
  const pastorName=(users||[]).find(u=>u.role==='pastor')?.name||'';
  const remRates=remRatesData.rates||DEFAULT_REMITTANCE_RATES;
  const depositMapM={};
  allCashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef).forEach(t=>{depositMapM[t.incomeRef]=(depositMapM[t.incomeRef]||0)+(t.amount||0)});
  function depositBadgeM(r){
    const cashHeld=getSundayCashWithAccountant(r,remRates);
    if(cashHeld===0) return '<span class="badge badge-info">No Cash</span>';
    const dep=depositMapM[r.id]||0;
    if(dep>=cashHeld) return '<span class="badge badge-success">Deposited</span>';
    if(dep>0) return '<span class="badge badge-warn">Partial</span>';
    return '<span class="badge badge-warn">Pending</span>';
  }
  const fromDate=state.reportFromDate||ymdLocal(new Date(state.year,state.month,1));
  const toDate=state.reportToDate||ymdLocal(new Date());
  const periodLabel=`${fmtDate(fromDate)} – ${fmtDate(toDate)}`;
  const income=filterByDateRange(allIncome,fromDate,toDate);
  const allMonthExpenses=filterByDateRange(allExpenses,fromDate,toDate);
  const expenses=allMonthExpenses.filter(e=>e.status==='approved');
  const pendingExpCount=allMonthExpenses.filter(e=>e.status==='pending_approval'||e.status==='pending').length;
  const paidRems=filterByDateRange(allRemittances,fromDate,toDate);
  const rem=await calcRemittancesFromRecords(income);
  const quotaList=getQuotaList(settings);
  const totalFixedQuotas=quotaList.reduce((s,q)=>s+(q.amount||0),0);
  const totalIncome=income.reduce((s,r)=>s+(r.totalCollection||0),0);
  const totalExpenses=expenses.reduce((s,r)=>s+(r.amount||0),0);
  const totalRemPaid=paidRems.reduce((s,r)=>s+(r.amount||0),0);
  const totalRemDue=rem.totalNatl+rem.totalArea+rem.totalPastor+rem.totalMinisters+(rem.totalSeed||0)+rem.provinceRebate+totalFixedQuotas;
  const trueNetLocal=rem.netLocal-totalFixedQuotas;
  const netPosition=totalIncome-totalExpenses-totalRemDue;

  // Income by type summary
  const incomeByType={};
  INCOME_TYPES.forEach(t=>{incomeByType[t.key]={label:t.label,total:0}});
  income.forEach(r=>{INCOME_TYPES.forEach(t=>{incomeByType[t.key].total+=(r[t.key]||0)})});
  const incomeTypeSummary=Object.values(incomeByType).filter(t=>t.total>0);

  // Expense by category summary
  const expByCat={};
  EXPENSE_CATS.forEach(c=>{expByCat[c.key]={label:c.label,icon:c.icon,total:0,count:0}});
  expenses.forEach(e=>{if(expByCat[e.category]){expByCat[e.category].total+=e.amount||0;expByCat[e.category].count++}});
  const expSorted=Object.values(expByCat).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);

  const body=`
    ${reportHeaderHTML('Monthly Financial Statement', periodLabel, settings)}

    <div class="summary-grid">
      <div class="summary-box"><div class="label">Total Income</div><div class="value green">${fmt(totalIncome)}</div></div>
      <div class="summary-box"><div class="label">Total Expenses</div><div class="value red">${fmt(totalExpenses)}</div></div>
      <div class="summary-box"><div class="label">Total Remittances Due</div><div class="value red">${fmt(totalRemDue)}</div></div>
      <div class="summary-box"><div class="label">Net Local Retained</div><div class="value green">${fmt(trueNetLocal)}</div></div>
      <div class="summary-box"><div class="label">Net Position</div><div class="value ${netPosition>=0?'green':'red'}">${fmt(netPosition)}</div></div>
      <div class="summary-box"><div class="label">No. of Sundays</div><div class="value blue">${income.length}</div></div>
    </div>

    <div class="section-title">Section A: Income Summary by Type</div>
    <table>
      <tr><th>Income Type</th><th class="td-r">Amount (₦)</th><th class="td-c">% of Total</th></tr>
      ${incomeTypeSummary.map(t=>`<tr><td>${t.label}</td><td class="td-r">${fmt(t.total)}</td><td class="td-c">${totalIncome?Math.round(t.total/totalIncome*100):0}%</td></tr>`).join('')}
      <tr class="total-row"><td>TOTAL INCOME</td><td class="td-r">${fmt(totalIncome)}</td><td class="td-c">100%</td></tr>
    </table>

    <div class="section-title">Section B: Weekly Collection Details</div>
    ${income.length?`<table>
      <tr><th>S/N</th><th>Date</th>${INCOME_TYPES.map(t=>`<th class="td-r">${t.label}</th>`).join('')}<th class="td-r">Total</th><th class="td-c">% of Month</th><th>Status</th></tr>
      ${income.map((r,i)=>`<tr><td>${i+1}</td><td>${fmtDate(r.date)}</td>${INCOME_TYPES.map(t=>`<td class="td-r">${r[t.key]?fmt(r[t.key]):'—'}</td>`).join('')}<td class="td-r td-bold">${fmt(r.totalCollection)}</td><td class="td-c">${totalIncome?Math.round((r.totalCollection||0)/totalIncome*100):0}%</td><td>${depositBadgeM(r)}</td></tr>`).join('')}
      <tr class="total-row"><td colspan="2">TOTAL COLLECTIONS</td>${INCOME_TYPES.map(t=>{const s=income.reduce((a,r)=>a+(r[t.key]||0),0);return `<td class="td-r">${s?fmt(s):'—'}</td>`}).join('')}<td class="td-r">${fmt(totalIncome)}</td><td class="td-c">100%</td><td></td></tr>
    </table>`:'<div class="no-data">No income records for this period.</div>'}

    <div class="section-title">Section C: Remittances Due to RCCG Authorities</div>
    <table>
      <tr><th>Description</th><th class="td-c">Rate / Basis</th><th class="td-r">Amount (₦)</th></tr>
      ${rem.lines.filter(l=>!l.isTg&&l.national>0).map(l=>`<tr><td>${l.label} → National HQ</td><td class="td-c">${l.total>0?Math.round(l.national/l.total*100)+'% of '+fmt(l.total):'% Based'}</td><td class="td-r">${fmt(l.national)}</td></tr>`).join('')}
      ${rem.lines.filter(l=>l.isTg&&l.national>0).map(l=>`<tr><td>Thanksgiving (TG) → National HQ</td><td class="td-c">${Math.round(remRatesData.tgNational*100)}% of ${fmt(l.total)}</td><td class="td-r">${fmt(l.national)}</td></tr>`).join('')}
      ${rem.provinceRebate>0?`<tr><td>Province Rebate (on local tithes)</td><td class="td-c">${rem.localTithe>0?Math.round(rem.provinceRebate/rem.localTithe*100)+'% of '+fmt(rem.localTithe):'% Based'}</td><td class="td-r">${fmt(rem.provinceRebate)}</td></tr>`:''}
      ${rem.totalArea>0?`<tr><td style="padding-left:16px">Thanksgiving → Area/Zonal Pastor</td><td class="td-c">${Math.round(remRatesData.tgArea*100)}% of TG</td><td class="td-r">${fmt(rem.totalArea)}</td></tr>`:''}
      ${rem.totalPastor>0?`<tr><td style="padding-left:16px">Thanksgiving → Parish Pastor's Share</td><td class="td-c">${Math.round(remRatesData.tgPastor*100)}% of TG</td><td class="td-r">${fmt(rem.totalPastor)}</td></tr>`:''}
      ${rem.totalMinisters>0?`<tr><td style="padding-left:16px">Thanksgiving → Ministers' Share</td><td class="td-c">${Math.round(remRatesData.tgMinisters*100)}% of TG</td><td class="td-r">${fmt(rem.totalMinisters)}</td></tr>`:''}
      ${(rem.totalSeed||0)>0?`<tr><td style="padding-left:16px">Thanksgiving → Seed (Pastor's Children)</td><td class="td-c">${Math.round((remRatesData.tgSeed||0)*100)}% of TG</td><td class="td-r">${fmt(rem.totalSeed)}</td></tr>`:''}
      ${quotaList.filter(q=>q.amount>0).map(q=>`<tr><td>${esc(q.label)}</td><td class="td-c">Fixed Quota</td><td class="td-r">${fmt(q.amount)}</td></tr>`).join('')}
      <tr class="total-row"><td colspan="2">TOTAL REMITTANCES DUE</td><td class="td-r">${fmt(totalRemDue)}</td></tr>
      ${totalRemPaid>0?`<tr style="background:#e8f4f0"><td colspan="2" style="font-weight:600;color:#0F6E56">Remittances Paid This Period</td><td class="td-r td-green">${fmt(totalRemPaid)}</td></tr>`:''}
      ${totalRemPaid<totalRemDue?`<tr><td colspan="2" style="padding-left:20px;color:var(--danger)">Outstanding Balance</td><td class="td-r td-red">− ${fmt(totalRemDue-totalRemPaid)}</td></tr>`:''}
      <tr style="background:#e8f4f0"><td colspan="2" style="font-weight:600;color:#0F6E56">NET LOCAL RETAINED (after all remittances)</td><td class="td-r td-green">${fmt(trueNetLocal)}</td></tr>
    </table>

    <div class="section-title">Section D: Approved Expenses <span>(${expenses.length} entries totalling ${fmt(totalExpenses)})${pendingExpCount>0?' — '+pendingExpCount+' pending approval not included':''}</span></div>
    ${expenses.length?`<table>
      <tr><th>S/N</th><th>Date</th><th>Category</th><th>Sub-category</th><th>Description</th><th>Method</th><th>Status</th><th>Receipt No.</th><th class="td-r">Amount (₦)</th></tr>
      ${expenses.map((e,i)=>{const cat=EXPENSE_CATS.find(c=>c.key===e.category)||{label:e.category||'—'};const methodLabel=e.paymentMethod==='bank_transfer'?'Bank Transfer':e.paymentMethod==='petty_cash'?'Petty Cash':e.paymentMethod==='split'?`Split (${[(e.bankAmount||0)>0?`Bank:${fmt(e.bankAmount)}`:'',(e.cashAmount||0)>0?`Cash:${fmt(e.cashAmount)}`:'',(e.pettyAmount||0)>0?`Petty:${fmt(e.pettyAmount)}`:''].filter(Boolean).join('+')})`:'Cash';const desc=e.description&&e.description.trim()&&e.description.trim()!==e.subCategory?esc(e.description):'—';return `<tr><td>${i+1}</td><td>${fmtDate(e.date||e.createdAt)}</td><td>${cat.label}</td><td>${esc(e.subCategory||'—')}</td><td>${desc}</td><td>${methodLabel}</td><td><span class="badge badge-success">Approved</span></td><td>${e.receiptNo||'—'}</td><td class="td-r">${fmt(e.amount)}</td></tr>`}).join('')}
      <tr class="total-row"><td colspan="8">TOTAL APPROVED EXPENSES</td><td class="td-r">${fmt(totalExpenses)}</td></tr>
    </table>`:'<div class="no-data">No approved expenses recorded for this period.</div>'}
    ${pendingExpCount>0?`<div class="note-box">ℹ️ ${pendingExpCount} expense(s) are pending approval and not included in the financial totals above.</div>`:''}

    ${expSorted.length?`<div class="section-title">Section E: Expense Summary by Category</div>
    <table>
      <tr><th>Category</th><th class="td-c">No. of Items</th><th class="td-r">Amount (₦)</th><th class="td-c">% of Total</th></tr>
      ${expSorted.map(c=>`<tr><td>${c.icon} ${c.label}</td><td class="td-c">${c.count}</td><td class="td-r">${fmt(c.total)}</td><td class="td-c">${totalExpenses?Math.round(c.total/totalExpenses*100):0}%</td></tr>`).join('')}
      <tr class="total-row"><td>TOTAL</td><td class="td-c">${expSorted.reduce((s,c)=>s+c.count,0)}</td><td class="td-r">${fmt(totalExpenses)}</td><td class="td-c">100%</td></tr>
    </table>`:''}

    <div class="section-title">Section F: Financial Position Summary</div>
    <table>
      <tr><td style="font-weight:600">Total Income for ${periodLabel}</td><td class="td-r td-green">${fmt(totalIncome)}</td></tr>
      <tr><td style="padding-left:20px;color:#555">Less: Remittances Due to RCCG</td><td class="td-r td-red">− ${fmt(totalRemDue)}</td></tr>
      <tr><td style="padding-left:20px;color:#555">Less: Local Expenses</td><td class="td-r td-red">− ${fmt(totalExpenses)}</td></tr>
      <tr class="total-row"><td>NET PARISH BALANCE</td><td class="td-r ${netPosition>=0?'td-green':'td-red'}">${fmt(netPosition)}</td></tr>
    </table>
    ${netPosition<0?'<div class="note-box">⚠️ The parish is in a deficit position this month. Expenses and remittances exceed total income. Please review with the Parish Pastor.</div>':''}

    ${reportSignatureHTML(pastorName)}`;

  openPrintableReport('Monthly Financial Statement — '+periodLabel, body);
}

async function generateWeeklyReport(){
  const [allIncome, settings, allCashTx, remRatesData, users] = await Promise.all([DB.getIncome(), DB.getSettings(), DB.getCashTransactions(), getRemRates(), DB.getUsers()]);
  const pastorName=(users||[]).find(u=>u.role==='pastor')?.name||'';
  const remRates=remRatesData.rates||DEFAULT_REMITTANCE_RATES;
  const fromDate=state.reportFromDate||ymdLocal(new Date(state.year,state.month,1));
  const toDate=state.reportToDate||ymdLocal(new Date());
  const periodLabel=`${fmtDate(fromDate)} – ${fmtDate(toDate)}`;
  const income=filterByDateRange(allIncome,fromDate,toDate);

  // Build deposit map from cash_transactions
  const depositMap={};
  allCashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef).forEach(t=>{depositMap[t.incomeRef]=(depositMap[t.incomeRef]||0)+(t.amount||0)});
  function depositBadge(r){
    const cashHeld=getSundayCashWithAccountant(r,remRates);
    if(cashHeld===0) return '<span class="badge badge-info">No Cash</span>';
    const dep=depositMap[r.id]||0;
    if(dep>=cashHeld) return '<span class="badge badge-success">✓ Deposited</span>';
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
  const avgPerSunday=income.length?Math.round(totalCollected/income.length):0;
  const deposited=income.filter(r=>{const c=getSundayCashWithAccountant(r,remRates);return c===0||(depositMap[r.id]||0)>=c}).length;
  const pending=income.length-deposited;

  // Highest and lowest
  const highestRecord=income.length?income.reduce((a,b)=>(b.totalCollection||0)>(a.totalCollection||0)?b:a,income[0]):null;
  const lowestRecord=income.length>1?income.reduce((a,b)=>(b.totalCollection||0)<(a.totalCollection||0)?b:a,income[0]):null;

  const body=`
    ${reportHeaderHTML('Weekly Collection Summary Report', periodLabel, settings)}

    <div class="summary-grid">
      <div class="summary-box"><div class="label">Total Collections</div><div class="value green">${fmt(totalCollected)}</div></div>
      <div class="summary-box"><div class="label">No. of Sundays</div><div class="value blue">${income.length}</div></div>
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

    ${reportSignatureHTML(pastorName)}`;

  openPrintableReport('Weekly Collection Summary — '+periodLabel, body);
}

function generateRemittanceReport(){ printRemittanceReport(state.reportFromDate, state.reportToDate); }

async function generateQuarterlyReport(){
  const [allIncome, allExpenses, settings, users] = await Promise.all([DB.getIncome(), DB.getExpenses(), DB.getSettings(), DB.getUsers()]);
  const pastorName=(users||[]).find(u=>u.role==='pastor')?.name||'';
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
    const totalRemDue=rem.totalNatl+rem.totalArea+rem.totalPastor+rem.totalMinisters+(rem.totalSeed||0)+rem.provinceRebate+quotasTotal;
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

    ${reportSignatureHTML(pastorName)}`;

  openPrintableReport('Quarterly Health Report — '+periodLabel, body);
}

async function generateExpenseReport(){
  const [allExpenses, settings, users] = await Promise.all([DB.getExpenses(), DB.getSettings(), DB.getUsers()]);
  const pastorName=(users||[]).find(u=>u.role==='pastor')?.name||'';
  const fromDate=state.reportFromDate||ymdLocal(new Date(state.year,state.month,1));
  const toDate=state.reportToDate||ymdLocal(new Date());
  const periodLabel=`${fmtDate(fromDate)} – ${fmtDate(toDate)}`;
  const expenses=filterByDateRange(allExpenses,fromDate,toDate);
  const totalExpenses=expenses.reduce((s,e)=>s+(e.amount||0),0);

  // By category
  const byCat={};
  EXPENSE_CATS.forEach(c=>{byCat[c.key]={label:c.label,icon:c.icon,total:0,count:0,items:[]}});
  expenses.forEach(e=>{if(byCat[e.category]){byCat[e.category].total+=e.amount||0;byCat[e.category].count++;byCat[e.category].items.push(e)}});
  const sorted=Object.values(byCat).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);

  // Approval status
  const approved=expenses.filter(e=>e.status==='approved').length;
  const pending=expenses.filter(e=>e.status==='pending_approval').length;
  const withReceipt=expenses.filter(e=>e.receiptNo).length;

  const body=`
    ${reportHeaderHTML('Expense Report', periodLabel, settings)}

    <div class="summary-grid">
      <div class="summary-box"><div class="label">Total Expenditure</div><div class="value red">${fmt(totalExpenses)}</div></div>
      <div class="summary-box"><div class="label">No. of Entries</div><div class="value blue">${expenses.length}</div></div>
      <div class="summary-box"><div class="label">Categories Used</div><div class="value">${sorted.length}</div></div>
      <div class="summary-box"><div class="label">With Receipts</div><div class="value green">${withReceipt}/${expenses.length}</div></div>
      <div class="summary-box"><div class="label">Approved</div><div class="value green">${approved}</div></div>
      ${pending>0?`<div class="summary-box"><div class="label">Pending Approval</div><div class="value amber">${pending}</div></div>`:''}
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
      ${expenses.map((e,i)=>{const cat=EXPENSE_CATS.find(c=>c.key===e.category)||{label:e.category||'—'};const mL=e.paymentMethod==='bank_transfer'?'Bank Transfer':e.paymentMethod==='petty_cash'?'Petty Cash':e.paymentMethod==='split'?`Split (${[(e.bankAmount||0)>0?`Bank:${fmt(e.bankAmount)}`:'',(e.cashAmount||0)>0?`Cash:${fmt(e.cashAmount)}`:'',(e.pettyAmount||0)>0?`Petty:${fmt(e.pettyAmount)}`:''].filter(Boolean).join('+')})`:'Cash';const sb=e.status==='approved'?'<span class="badge badge-success">Approved</span>':e.status==='rejected'?'<span class="badge badge-danger">Rejected</span>':'<span class="badge badge-warn">Pending</span>';const desc=e.description&&e.description.trim()&&e.description.trim()!==e.subCategory?esc(e.description):'—';return `<tr><td>${i+1}</td><td>${fmtDate(e.date||e.createdAt)}</td><td>${cat.label}</td><td>${esc(e.subCategory||'—')}</td><td>${desc}</td><td>${mL}</td><td>${sb}</td><td>${e.receiptNo||'—'}</td><td>${esc(e.recordedBy||e.createdByName||'—')}</td><td class="td-r">${fmt(e.amount)}</td></tr>`}).join('')}
      <tr class="total-row"><td colspan="9">TOTAL EXPENDITURE</td><td class="td-r">${fmt(totalExpenses)}</td></tr>
    </table>`:'<div class="no-data">No expenses recorded for this period.</div>'}

    ${withReceipt<expenses.length&&expenses.length>0?`<div class="note-box">⚠️ ${expenses.length-withReceipt} expense(s) do not have a receipt number attached. All expenditure should be supported by proper documentation.</div>`:''}

    ${reportSignatureHTML(pastorName)}`;

  openPrintableReport('Expense Report — '+periodLabel, body);
}

async function generatePettyCashReport(){
  const [pettyHistory, pettyConfig, settings, users] = await Promise.all([DB.getPetty(), DB.getPettyConfig(), DB.getSettings(), DB.getUsers()]);
  const pastorName=(users||[]).find(u=>u.role==='pastor')?.name||'';
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

    ${reportSignatureHTML(pastorName, 'Confirmed by (Admin Officer):')}`;

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

function setAdminTab(t){ state.adminTab=t; renderAdmin() }

function renderAdminUsers(users){
  function permSummary(role){
    const rp = state.rolePermissions?.[role];
    const perms = rp || PERMISSIONS[role] || [];
    if(perms.includes('all')) return '<span class="badge" style="background:#EEEDFE;color:#534AB7">Full Access</span>';
    const labels = PERMISSION_DEFS.filter(d=>perms.includes(d.key)).map(d=>`<span class="badge" style="background:#f0f0f0;color:#444;font-size:10px;margin:1px">${d.label}</span>`);
    return labels.length ? labels.join(' ') : '<span style="color:var(--text3);font-size:12px">No permissions</span>';
  }
  return `<div class="card">
    <div class="card-header"><span class="card-title">User Accounts</span><button class="btn btn-primary btn-sm" onclick="App.showAddUser()">+ Add User</button></div>
    <div class="table-wrap"><table>
      <tr><th>Name</th><th>Role</th><th>Access / Permissions</th><th>Email</th><th>Actions</th></tr>
      ${users.map(u=>{const r=ROLES[u.role]||{}; return`<tr>
        <td><strong>${u.name}</strong></td>
        <td><span class="badge" style="background:${r.bg};color:${r.color}">${r.label||u.role}</span></td>
        <td style="max-width:260px;white-space:normal;line-height:1.6">${permSummary(u.role)}</td>
        <td class="td-muted">${u.email||'—'}</td>
        <td><button class="btn btn-sm" onclick="App.editUser('${u.id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="App.deleteUser('${u.id}', this)" style="margin-left:4px">Delete</button></td>
      </tr>`}).join('')}
    </table></div></div>`;
}

function renderAdminSettings(s){
  const floatColor = s.pettyFloat < 0 ? 'var(--danger)' : 'var(--success)';
  return `<div class="card">
    <div class="modal-title" style="font-size:15px;margin-bottom:1rem">Church Information</div>
    <div class="form-group"><label class="form-label">Church Name</label><input type="text" id="set_name" class="form-input" value="${s.churchName||''}" /></div>
    <div class="form-group"><label class="form-label">Bank Name</label><input type="text" id="set_bank" class="form-input" value="${s.bankName||''}" /></div>
    <div class="form-group"><label class="form-label">Account Number</label><input type="text" id="set_acct" class="form-input" value="${s.accountNo||''}" /></div>
    <div class="form-group"><label class="form-label">Petty Cash Max Float (₦)</label><input type="number" id="set_petty" class="form-input" value="${s.pettyMax||50000}" /></div>
    <div style="margin-top:18px;margin-bottom:8px;font-size:13px;font-weight:700;color:var(--text2);border-top:1px solid var(--border);padding-top:14px">Available Balance Status Thresholds</div>
    <p style="font-size:12px;color:var(--text3);margin-bottom:12px">Control what status label appears on the Actual Balance card (Strong / Moderate / Low / Very Low / Deficit - Critical).</p>
    <div class="form-group"><label class="form-label">Strong threshold (₦)</label><input type="number" id="set_spendable_strong" class="form-input" value="${s.spendableStrong||40000}" /><div class="form-hint">Shows "Strong" when Actual Balance is at or above this amount. Default: ₦40,000.</div></div>
    <div class="form-group"><label class="form-label">Moderate threshold (₦)</label><input type="number" id="set_spendable_moderate" class="form-input" value="${s.spendableModerate||20000}" /><div class="form-hint">Shows "Moderate" when at or above this amount but below Strong. Default: ₦20,000.</div></div>
    <div class="form-group"><label class="form-label">Low threshold (₦)</label><input type="number" id="set_spendable_very_low" class="form-input" value="${s.spendableVeryLow||10000}" /><div class="form-hint">Shows "Low" when at or above this amount. Below this shows "Very Low". Default: ₦10,000.</div></div>
    <button class="btn btn-primary" onclick="App.saveSettings(this)">Save Settings</button>
  </div>
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
    <div id="quota-rows-container">${rows}</div>
    <button class="btn" style="margin-top:4px;margin-bottom:12px" onclick="App.addQuotaRow()">➕ Add Quota</button><br/>
    <button class="btn btn-primary" onclick="App.saveQuotas(this)">Save Quotas</button>
  </div>`;
}

function renderAdminRates(s){
  const r = s.remittanceRates || DEFAULT_REMITTANCE_RATES;
  const decToPct = v => Math.round((v??0)*1000)/10;
  const rateInput = (id, val) =>
    `<input type="number" id="${id}" class="form-input" value="${decToPct(val)}" min="0" max="100" step="0.1" style="width:80px;display:inline-block" /> %`;
  return `<div class="card">
    <div class="modal-title" style="font-size:15px;margin-bottom:8px">Remittance Percentage Rates</div>
    <p style="font-size:12px;color:var(--text3);margin-bottom:1rem">Configure what percentage of each income type goes to National HQ and what stays local. National + Local should sum to 100%. Changes take effect immediately for all new calculations.</p>
    <div class="table-wrap"><table>
      <tr><th>Income Type</th><th>→ National HQ %</th><th>→ Local Retained %</th></tr>
      ${INCOME_TYPES.filter(t=>!t.special).map(t=>{
        const rd = r[t.key] || DEFAULT_REMITTANCE_RATES[t.key] || { natl:0, local:0 };
        return `<tr><td>${t.label}</td>
          <td>${rateInput(`rate_${t.key}_natl`, rd.natl)}</td>
          <td>${rateInput(`rate_${t.key}_local`, rd.local)}</td></tr>`;
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
      <tr><td>TG → Seed — Pastor's Children</td><td>${rateInput('rate_tgSeed', r.tgSeed ?? DEFAULT_REMITTANCE_RATES.tgSeed)}</td></tr>
    </table></div>
    <hr class="divider">
    <div class="form-row" style="align-items:center;gap:12px">
      <label class="form-label" style="margin:0;flex:1">Province Rebate — % of Local Retained Tithes (Members' + Ministers' only):</label>
      ${rateInput('rate_provinceRebate', r.provinceRebate ?? DEFAULT_REMITTANCE_RATES.provinceRebate)}
    </div>
    <br>
    <button class="btn btn-primary" onclick="App.saveRates(this)">Save Remittance Rates</button>
  </div>`;
}

async function saveRates(btn=null){
  const s = await DB.getSettings();
  const r = s.remittanceRates || {};
  const pct2dec = id => { const el=document.getElementById(id); return el ? parseFloat(el.value||0)/100 : null; };
  const badRows = [];
  INCOME_TYPES.filter(t=>!t.special).forEach(t=>{
    if(!r[t.key]) r[t.key]={};
    const natl = pct2dec(`rate_${t.key}_natl`);
    const local = pct2dec(`rate_${t.key}_local`);
    if(natl!==null) r[t.key].natl = natl;
    if(local!==null) r[t.key].local = local;
    if(natl!==null && local!==null){
      const totalPct = Math.round((natl+local)*100);
      if(totalPct !== 100) badRows.push(`${t.label} (${totalPct}%)`);
    }
  });
  if(badRows.length){
    showAlert(`National + Local must equal 100% for: ${badRows.join(', ')}. Please correct before saving.`,'danger');
    return;
  }
  ['tgNational','tgArea','tgPastor','tgMinisters','tgSeed','provinceRebate'].forEach(k=>{
    const v = pct2dec(`rate_${k}`);
    if(v!==null) r[k] = v;
  });
  s.remittanceRates = r;
  const restore = setBtnLoading(btn, 'Saving…');
  try {
    await DB.saveSettings(s);
    showAlert('Remittance rates updated successfully!','success');
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
  if(!confirm('Reset all role permissions to factory defaults?')) return;
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
  const s=await DB.getSettings();
  s.churchName=document.getElementById('set_name')?.value;
  s.bankName=document.getElementById('set_bank')?.value;
  s.accountNo=document.getElementById('set_acct')?.value;
  const pettyMax = parseFloat(document.getElementById('set_petty')?.value)||50000;
  s.pettyMax=pettyMax;
  s.spendableStrong=parseFloat(document.getElementById('set_spendable_strong')?.value)||40000;
  s.spendableModerate=parseFloat(document.getElementById('set_spendable_moderate')?.value)||20000;
  s.spendableVeryLow=parseFloat(document.getElementById('set_spendable_very_low')?.value)||10000;
  const restore = setBtnLoading(btn, 'Saving…');
  try {
    await DB.saveSettings(s);
    const pettyCfg = await DB.getPettyConfig();
    const currentFloat = Number.isFinite(pettyCfg?.float) ? pettyCfg.float : 50000;
    await DB.savePettyConfig({ float: currentFloat, max: pettyMax });
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
  const name=document.getElementById('nu_name')?.value?.trim();
  const role=document.getElementById('nu_role')?.value;
  const email=document.getElementById('nu_email')?.value;
  const pin=document.getElementById('nu_pin')?.value;
  if(!name||!role||!pin||pin.length<4){ alert('Please fill name, role, and PIN (min 4 digits).'); return }
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
  const usersDelU=await DB.getUsers();
  const u=usersDelU.find(x=>x.id===id);
  if(!u||!confirm(`Delete user "${u.name}"? This cannot be undone.`)) return;
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
  const restore = setBtnLoading(btn, 'Exporting…');
  try {
    const [users,income,remittances,expenses,petty,auditLog,settings,cashTransactions] = await Promise.all([DB.getUsers(),DB.getIncome(),DB.getRemittances(),DB.getExpenses(),DB.getPetty(),DB.getAudit(),DB.getSettings(),DB.getCashTransactions()]);
    const data={ users,income,remittances,expenses,petty,audit:auditLog,settings,cashTransactions, exportedAt:new Date().toISOString(), exportedBy:state.user?.name };
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
  const input=document.createElement('input'); input.type='file'; input.accept='.json';
  input.onchange=async e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=async ev=>{
      try{
        const data=JSON.parse(ev.target.result);
        if(!confirm('This will overwrite all existing financial records (income, expenses, remittances, petty cash) with data from the backup.\n\nUser accounts and PINs will NOT be changed — any names or PINs you have updated will be preserved.\n\nAre you sure you want to proceed?')) return;
        await DB.importBackup(data);
        DB.addAudit('data_imported','Data restored from backup',state.user?.name);
        showAlert('Data restored successfully! Reloading…','success');
        setTimeout(()=>window.location.reload(), 600);
      }catch(e){ alert('Invalid backup file. Please use a valid JSON backup.') }
    };
    reader.readAsText(file);
  };
  input.click();
}

async function clearDataOnly(){
  if(!confirm(
    'This will permanently delete all financial records:\n\n' +
    '• Income records\n• Expenses\n• Remittances\n• Petty cash history\n• Bank transactions\n• Audit log\n• Notifications\n\n' +
    'Your users, church settings, remittance rates, quotas, and role permissions will be KEPT.\n\n' +
    'Export a backup first if you need to keep the test data.\n\nProceed?'
  )) return;
  if(!confirm('Last confirmation — this cannot be undone. Delete all financial data now?')) return;
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
  if(!confirm('⚠ This will permanently delete ALL church financial records. Type CONFIRM to proceed.')) return;
  const word=prompt('Type CONFIRM to delete everything:');
  if(word!=='CONFIRM'){ alert('Cancelled.'); return }
  try{
    await DB.clearAllData();
    showAlert('All data cleared. Reloading…','warn');
    setTimeout(()=>window.location.reload(), 600);
  }catch(e){
    alert(`Failed to clear data: ${e.message||'Unknown error'}`);
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
  const balance=totalIncome-rem.totalNatl-rem.totalArea-rem.provinceRebate-totalExp;
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">🔔 Alert KPSC — Emergency Support</div>
    <div class="alert alert-warn"><span class="alert-icon">⚠</span><span>Use this when the main account cannot cover necessary daily expenses after RCCG remittances. This follows proper procedure — no public announcements from the Pastor.</span></div>
    <div class="grid-2" style="margin:12px 0">
      <div style="background:var(--surface);padding:10px;border-radius:var(--r);text-align:center"><div class="amount-label">Current Balance</div><div style="font-size:18px;font-weight:700;color:${balance<0?'var(--danger)':'var(--primary)'}">${fmt(balance)}</div></div>
      <div style="background:var(--surface);padding:10px;border-radius:var(--r);text-align:center"><div class="amount-label">Remittances Pending</div><div style="font-size:18px;font-weight:700;color:var(--amber)">${fmt(rem.totalNatl+rem.totalArea+rem.provinceRebate)}</div></div>
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
  if(!amt||!desc){ alert('Please fill all fields.'); return }
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

function setDashPeriodMode(mode){
  state.dashPeriodMode = mode;
  navigate('dashboard');
}

// ──────────────────────────────────────────
// 9. PUBLIC API
// ──────────────────────────────────────────
return {
  onRoleChange, login, logout, showChangePinModal, submitChangePin, navigate, toggleSidebar, toggleNotifications,
  onMonthChange, setIncomeTab, showIncomeForm, updateIncomeTotal, updateIncomeCashBreakdown, submitIncome,
  showOtherIncomeForm, submitOtherIncome,
  viewIncome, confirmDeleteIncome, submitDeleteIncome, _previewDepPhoto, confirmDeposit, submitCashDeposit, confirmBulkDeposit, submitBulkDeposit, showRemittancePaymentModal, submitRemittance, showRemCutoffModal, saveRemCutoffDates, toggleRemCutoff, onRemDatesChange, onRemMethodChange, onRemSplitChange, printRemittanceReport, approveRemittance,
  updateExpenseSubcats, updateExpenseDescRequired,
  showExpenseForm, submitExpense, viewExpenseReceipt, editExpense, submitEditExpense, deleteExpense, approveExpense, showExpenseDetail, onExpMethodChange, onExpSplitChange, setExpCatFilter, setExpSearch, setExpMethodFilter, setExpRecordedBy, setExpSort, clearExpFilters,
  showBankWithdrawal, submitBankWithdrawal, onWdDestChange, onWdAmtChange, onWdCatChange,
  setBankTab, showBankChargeForm, submitBankCharge, compareBankBalance,
  setTxFilter, setTxPage, setTxPageSize, clearTxFilters, showTxDetail, exportTxCSV, exportTxPDF, saveTxView, loadTxView, deleteTxView,
  renderPettyCash, showPettyDetail, confirmDeletePetty, submitDeletePetty, showPettyRequest, showTopUpRequest, submitTopUpRequest, onTopupOverrideToggle, cancelTopUpRequest, showAdvanceRequest, submitAdvanceRequest, onReceiptToggle, setPettySearch, setPettyTypeFilter, setPettyStatusFilter, setPettySort, clearPettyFilters,
  approvePetty, confirmTopupApproval, printTopupReview, rejectPettyFromModal, rejectPetty, submitPettyReceipt, confirmPettyReceipt, showPettyRefill, submitRefill, onRefillMethodChange,
  generateMonthlyReport, generateWeeklyReport, generateRemittanceReport,
  generateQuarterlyReport, generateExpenseReport, generatePettyCashReport, onReportDatesChange,
  setAdminTab, saveSettings, confirmPettyFloatOverride, submitPettyFloatOverride, saveQuotas, addQuotaRow, removeQuotaRow, saveRates, saveRolePermissions, resetRolePermissions, showAddUser, addUser, editUser,
  updateUser, deleteUser, exportData, importData, clearDataOnly, clearAllData,
  setDashPeriodMode,
  showKPSCAlert, submitKPSCAlert, showChildrenTeacherModal, closeModal: closeModal, showAlert
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
