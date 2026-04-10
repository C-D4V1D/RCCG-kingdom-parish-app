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
  pastor:        ['dashboard','income_view','remittances','expenses_view','petty_view','reports','signoff'],
  accountant:    ['dashboard','income','income_view','remittances','expenses','petty_view','reports'],
  admin_officer: ['dashboard','expenses','petty_request','petty_view','income_view'],
  signatory:     ['dashboard','income_view','remittances_view','petty_approve','expenses_view'],
  viewer:        ['dashboard','income_view','remittances_view','expenses_view','petty_view']
};

const NAV = [
  { id:'dashboard',    label:'Dashboard',     icon:'🏠', section:'Main',     minRole:['all'] },
  { id:'income',       label:'Record Income', icon:'📥', section:'Finance',  minRole:['it_admin','accountant'] },
  { id:'remittances',  label:'Remittances',   icon:'📤', section:'Finance',  minRole:['it_admin','pastor','accountant','signatory'] },
  { id:'expenses',     label:'Expenses',      icon:'💸', section:'Finance',  minRole:['it_admin','accountant','admin_officer'] },
  { id:'petty_cash',   label:'Petty Cash',    icon:'💳', section:'Finance',  minRole:['it_admin','accountant','admin_officer','signatory'] },
  { id:'reports',      label:'Reports',       icon:'📊', section:'Reports',  minRole:['it_admin','pastor','accountant'] },
  { id:'audit',        label:'Audit Log',     icon:'📋', section:'Reports',  minRole:['it_admin','pastor','accountant'] },
  { id:'admin',        label:'IT Admin',      icon:'⚙️',  section:'System',   minRole:['it_admin'] }
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const INCOME_TYPES = [
  { key:'membersTithe',    label:"Members' Tithe",         natl:0.58, local:0.42 },
  { key:'ministersTithe',  label:"Ministers' Tithe",       natl:0.62, local:0.38 },
  { key:'thanksgiving',    label:'Thanksgiving (TG)',      special:'tg' },
  { key:'sundaySchool',    label:'Sunday School',          natl:1.00, local:0 },
  { key:'slo',             label:'Sunday Love Offering',   natl:0.30, local:0.70 },
  { key:'crm',             label:'CRM (Weekly Activities)',natl:0.60, local:0.40 },
  { key:'workersOffering', label:"Workers' Offering",      natl:0.25, local:0.75 },
  { key:'childrenOffering',label:"Children's Offering",    natl:0.35, local:0.65 }
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

const DEFAULT_QUOTAS = { rmf:5000, csr:3000, edu:2000, camp:5000, mummy:8000, volunteer:2000, goFishing:10000 };

// Income source types used in the "Other Income" form
const OTHER_INCOME_SOURCES = [
  { key:'midweek_offering',   label:'Midweek / Programme Offering' },
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

// ──────────────────────────────────────────
// 2. DATA LAYER
// ──────────────────────────────────────────
const DB = {
  KEYS: { users:'kp_users', income:'kp_income', remittances:'kp_remittances',
          expenses:'kp_expenses', petty:'kp_petty', audit:'kp_audit',
          settings:'kp_settings', notifications:'kp_notifs',
          cashTx:'kp_cash_transactions' },

  load(k){ try{ return JSON.parse(localStorage.getItem(k)||'null') }catch(e){ return null } },
  save(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)) }catch(e){} },

  getUsers(){ return this.load(this.KEYS.users) || this.seedUsers() },
  seedUsers(){
    const users = [
      { id:'u1', name:'IT Administrator',    role:'it_admin',      pin:'0000', email:'it@kpaguleri.org' },
      { id:'u2', name:'Rev. Emmanuel Obi',   role:'pastor',        pin:'1111', email:'pastor@kpaguleri.org' },
      { id:'u3', name:'Bro. Chukwuemeka Nze',role:'accountant',    pin:'2222', email:'accounts@kpaguleri.org' },
      { id:'u4', name:'Sis. Adaeze Okonkwo', role:'admin_officer', pin:'3333', email:'admin@kpaguleri.org' },
      { id:'u5', name:'Elder Paul Okafor',   role:'signatory',     pin:'4444', email:'elder1@kpaguleri.org' },
      { id:'u6', name:'Elder James Eze',     role:'signatory',     pin:'4444', email:'elder2@kpaguleri.org' },
      { id:'u7', name:'Visitor Access',      role:'viewer',        pin:'9999', email:'' }
    ];
    this.save(this.KEYS.users, users);
    return users;
  },

  getIncome(){ return this.load(this.KEYS.income) || [] },
  saveIncome(v){ this.save(this.KEYS.income, v) },

  addIncome(rec){
    const arr = this.getIncome();
    rec.id = 'INC-' + Date.now();
    rec.createdAt = new Date().toISOString();
    arr.unshift(rec);
    this.saveIncome(arr);
    this.addAudit('income_recorded', `Income recorded: ${fmt(rec.totalCollection)} for ${rec.date}`, state.user?.name);
    return rec;
  },

  getRemittances(){ return this.load(this.KEYS.remittances) || [] },
  saveRemittances(v){ this.save(this.KEYS.remittances, v) },

  getExpenses(){ return this.load(this.KEYS.expenses) || [] },
  saveExpenses(v){ this.save(this.KEYS.expenses, v) },

  addExpense(rec){
    const arr = this.getExpenses();
    rec.id = 'EXP-' + Date.now();
    rec.createdAt = new Date().toISOString();
    arr.unshift(rec);
    this.saveExpenses(arr);
    this.addAudit('expense_logged', `Expense: ${rec.description} — ${fmt(rec.amount)}`, state.user?.name);
    return rec;
  },

  getPetty(){ return this.load(this.KEYS.petty) || { float:50000, max:50000, history:[] } },
  savePetty(v){ this.save(this.KEYS.petty, v) },

  getAudit(){ return this.load(this.KEYS.audit) || [] },
  addAudit(type, detail, by){
    const arr = this.getAudit();
    arr.unshift({ id:'A'+Date.now(), type, detail, by: by||'System', ts: new Date().toISOString() });
    if(arr.length>500) arr.splice(500);
    this.save(this.KEYS.audit, arr);
  },

  getSettings(){ return this.load(this.KEYS.settings) || { quotas: DEFAULT_QUOTAS, remittanceRates: DEFAULT_REMITTANCE_RATES, pettyMax:50000, churchName:'RCCG Kingdom Parish, Aguleri', bankName:'', accountNo:'' } },
  saveSettings(v){ this.save(this.KEYS.settings, v) },

  // Records a cash/bank transaction. rec should include: { type, date, amount, description, reference, authorizedBy, recordedBy }
  // type: 'withdrawal' (bank debit → destination: 'accountant_cash'|'admin_petty_cash'|'direct_expense')
  //       'cash_deposit' (accountant deposits cash to bank → depositMethod: 'bank_teller'|'pos_terminal'|'mobile_transfer', incomeRef: optional income record id)
  getCashTransactions(){ return this.load(this.KEYS.cashTx) || [] },
  addCashTransaction(rec){
    const arr = this.getCashTransactions();
    rec.id = 'CTX-' + Date.now();
    rec.createdAt = new Date().toISOString();
    arr.unshift(rec);
    this.save(this.KEYS.cashTx, arr);
    this.addAudit('cash_transaction', `${rec.type}: ${fmt(rec.amount)} — ${rec.description||''}`, state.user?.name);
    return rec;
  },

  getNotifications(){ return this.load(this.KEYS.notifications) || [] },
  addNotification(title, body, type='info'){
    const arr = this.getNotifications();
    arr.unshift({ id:'N'+Date.now(), title, body, type, read:false, ts:new Date().toISOString() });
    this.save(this.KEYS.notifications, arr);
    updateNotifBadge();
  },
  markAllRead(){
    const arr = this.getNotifications().map(n=>({...n,read:true}));
    this.save(this.KEYS.notifications, arr);
    updateNotifBadge();
  }
};

// ──────────────────────────────────────────
// 3. STATE
// ──────────────────────────────────────────
const state = {
  user: null,
  page: 'dashboard',
  month: new Date().getMonth(),
  year: new Date().getFullYear()
};

// ──────────────────────────────────────────
// 4. UTILITIES
// ──────────────────────────────────────────
function fmt(n){ return '₦' + Math.round(n||0).toLocaleString('en-NG') }
function fmtDate(d){ if(!d) return '—'; const dt=new Date(d); return dt.toLocaleDateString('en-NG',{day:'2-digit',month:'short',year:'numeric'}) }
function fmtTime(d){ if(!d) return '—'; const dt=new Date(d); return dt.toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'}) }
function uid(){ return Date.now().toString(36) }
function hasPermission(p){
  if(!state.user) return false;
  const perms = PERMISSIONS[state.user.role]||[];
  return perms.includes('all') || perms.includes(p);
}
function can(...ps){ return ps.some(p=>hasPermission(p)) }
function monthLabel(){ return MONTHS[state.month]+' '+state.year }
function filterByMonth(arr){
  return (arr||[]).filter(r=>{
    const d = new Date(r.date||r.createdAt||r.ts||0);
    return d.getMonth()===state.month && d.getFullYear()===state.year;
  });
}

// Remittance engine
function getRemRates(){
  const s = DB.getSettings();
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

function calcRemittances(income){
  const rr = getRemRates();
  const res = { lines:[], totalNatl:0, totalArea:0, totalPastor:0, totalMinisters:0, totalSeed:0, localBefore:0, provinceRebate:0, netLocal:0 };
  INCOME_TYPES.forEach(t=>{
    const amt = income[t.key]||0;
    if(!amt) return;
    if(t.special==='tg'){
      const line = { label:t.label, total:amt, national: amt*rr.tgNational, area: amt*rr.tgArea,
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
    }
  });
  res.provinceRebate = res.localBefore * rr.provinceRebate;
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
function updateNotifBadge(){ const notifs=DB.getNotifications(); const unread=notifs.filter(n=>!n.read).length; const el=document.getElementById('notifCount'); if(el){ el.textContent=unread; el.style.display=unread?'flex':'none' } }

// ──────────────────────────────────────────
// 5. AUTH
// ──────────────────────────────────────────
function onRoleChange(){
  const role = document.getElementById('roleSelect').value;
  const wrap = document.getElementById('userSelectWrap');
  const sel = document.getElementById('userSelect');
  if(!role){ wrap.style.display='none'; return }
  const users = DB.getUsers().filter(u=>u.role===role);
  if(users.length>1){
    wrap.style.display='block';
    sel.innerHTML = users.map(u=>`<option value="${u.id}">${u.name}</option>`).join('');
  } else { wrap.style.display='none' }
}

function login(){
  const role = document.getElementById('roleSelect').value;
  const pin = document.getElementById('pinInput').value.trim();
  const errEl = document.getElementById('loginError');
  if(!role||!pin){ errEl.textContent='Please select a role and enter your PIN.'; errEl.style.display='block'; return }
  const users = DB.getUsers().filter(u=>u.role===role);
  let user = null;
  if(users.length>1){
    const uid = document.getElementById('userSelect').value;
    user = users.find(u=>u.id===uid&&u.pin===pin);
  } else {
    user = users.find(u=>u.pin===pin);
  }
  if(!user){ errEl.style.display='block'; document.getElementById('pinInput').value=''; return }
  errEl.style.display='none';
  state.user = user;
  DB.addAudit('login', `User logged in`, user.name);
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('appShell').style.display='flex';
  initApp();
}

function logout(){
  DB.addAudit('logout','User logged out', state.user?.name);
  state.user=null; state.page='dashboard';
  document.getElementById('appShell').style.display='none';
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('roleSelect').value='';
  document.getElementById('pinInput').value='';
  document.getElementById('userSelectWrap').style.display='none';
}

// ──────────────────────────────────────────
// 6. NAVIGATION & ROUTER
// ──────────────────────────────────────────
function initApp(){
  buildMonthSelector();
  buildSidebar();
  buildBottomNav();
  updateSidebarUser();
  updateNotifBadge();
  navigate('dashboard');
}

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
  navigate(state.page);
}

function buildSidebar(){
  let sections = {};
  NAV.forEach(item=>{
    if(!item.minRole.includes('all') && !item.minRole.includes(state.user?.role)) return;
    if(!sections[item.section]) sections[item.section]=[];
    sections[item.section].push(item);
  });
  const nav = document.getElementById('sidebarNav');
  let html='';
  Object.entries(sections).forEach(([sec,items])=>{
    html+=`<div class="nav-section">${sec}</div>`;
    items.forEach(item=>{
      const notifs = item.id==='petty_cash' ? getPettyCashPendingCount() : 0;
      html+=`<div class="nav-item${state.page===item.id?' active':''}" onclick="App.navigate('${item.id}')" data-page="${item.id}">
        <span class="nav-icon">${item.icon}</span>${item.label}
        ${notifs>0?`<span class="nav-badge">${notifs}</span>`:''}
      </div>`;
    });
  });
  nav.innerHTML=html;
}

function buildBottomNav(){
  const items = NAV.filter(n=> n.minRole.includes('all')||n.minRole.includes(state.user?.role)).slice(0,5);
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

function navigate(page){
  state.page=page;
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  document.querySelectorAll('.bn-item').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  const titles={dashboard:'Dashboard',income:'Record Income',remittances:'Remittances',
    expenses:'Expenses',petty_cash:'Petty Cash',reports:'Reports',audit:'Audit Log',admin:'IT Admin Panel'};
  document.getElementById('topBarTitle').textContent=titles[page]||page;
  const pc=document.getElementById('pageContent');
  pc.innerHTML='<div style="padding:40px;text-align:center;color:var(--text3)">Loading...</div>';
  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
  // Close notifications
  document.getElementById('notifPanel').style.display='none';
  setTimeout(()=>{ renderPage(page) },50);
}

function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('visible');
}

function toggleNotifications(){
  const panel=document.getElementById('notifPanel');
  const showing=panel.style.display==='block';
  panel.style.display=showing?'none':'block';
  if(!showing){
    const notifs=DB.getNotifications();
    const list=document.getElementById('notifList');
    if(!notifs.length){ list.innerHTML='<div class="notif-empty">No notifications</div>'; }
    else{ list.innerHTML=notifs.slice(0,15).map(n=>`<div class="notif-item" style="opacity:${n.read?0.6:1}"><div class="notif-item-title">${n.title}</div><div class="notif-item-body">${n.body}</div><div class="notif-item-time">${fmtDate(n.ts)} ${fmtTime(n.ts)}</div></div>`).join('') }
    DB.markAllRead();
  }
}

function getPettyCashPendingCount(){
  const p=DB.getPetty();
  return (p.history||[]).filter(h=>h.status==='pending_approval').length;
}

// ──────────────────────────────────────────
// 7. PAGE RENDERERS
// ──────────────────────────────────────────
function renderPage(page){
  const pages={dashboard:renderDashboard,income:renderIncome,remittances:renderRemittances,
    expenses:renderExpenses,petty_cash:renderPettyCash,reports:renderReports,
    audit:renderAudit,admin:renderAdmin};
  if(pages[page]) pages[page]();
  else document.getElementById('pageContent').innerHTML='<div class="card"><p>Page not found.</p></div>';
}

// ── DASHBOARD ────────────────────────────
function calcChurchBalance(){
  const allIncome = DB.getIncome();
  const allExpenses = DB.getExpenses();
  const allRemittances = DB.getRemittances();
  const cashTx = DB.getCashTransactions();
  const petty = DB.getPetty();

  // --- BANK BALANCE ---
  // 1. Income already in bank (bank-transfer portions of all income records)
  const bankTransferIncome = allIncome.reduce((s,r) => s + (r.bankTransferAmount||0), 0);
  // 2. Cash deposited by accountant to bank
  const cashDepositedToBank = cashTx.filter(t=>t.type==='cash_deposit').reduce((s,t) => s+(t.amount||0), 0);
  // 3. Outflows from bank: expenses paid via bank_transfer (incl. bank charges)
  const bankExpenses = allExpenses.filter(e=>e.paymentMethod==='bank_transfer').reduce((s,e) => s+(e.amount||0), 0);
  // 4. Paid remittances (all assumed to leave the bank)
  const paidRems = allRemittances.filter(r=>r.status==='paid').reduce((s,r) => s+(r.amount||0), 0);
  // 5. Bank withdrawals (all types reduce bank; destination tells where money went)
  const bankWithdrawals = cashTx.filter(t=>t.type==='withdrawal').reduce((s,t) => s+(t.amount||0), 0);
  const bankBalance = bankTransferIncome + cashDepositedToBank - bankExpenses - paidRems - bankWithdrawals;

  // --- CASH WITH ACCOUNTANT ---
  // Cash received = total collection - bank transfer portion - direct petty portion
  const cashFromCollections = allIncome.reduce((s,r) => {
    const btAmt = r.bankTransferAmount||0;
    const dpAmt = r.directPettyCash||0;
    return s + Math.max(0, (r.totalCollection||0) - btAmt - dpAmt);
  }, 0);
  // Cash returned from bank withdrawals directed to accountant
  const bankToAccountant = cashTx.filter(t=>t.type==='withdrawal' && t.destination==='accountant_cash').reduce((s,t) => s+(t.amount||0), 0);
  // Expenses paid from accountant's cash
  const cashExpenses = allExpenses.filter(e=>e.paymentMethod==='cash').reduce((s,e) => s+(e.amount||0), 0);
  const cashWithAccountant = cashFromCollections - cashDepositedToBank + bankToAccountant - cashExpenses;

  // --- PETTY CASH (with Admin Officer) ---
  const pettyFloat = petty.float;

  return {
    cashWithAccountant: Math.max(0, cashWithAccountant),
    bankBalance,
    pettyFloat,
    total: Math.max(0, cashWithAccountant) + bankBalance + pettyFloat
  };
}

function renderDashboard(){
  const income = filterByMonth(DB.getIncome());
  const expenses = filterByMonth(DB.getExpenses());
  const petty = DB.getPetty();
  const settings = DB.getSettings();
  const allIncome = DB.getIncome();
  const allExpenses = DB.getExpenses();

  const totalIncome = income.reduce((s,r)=>s+(r.totalCollection||0),0);
  const totalExpenses = expenses.reduce((s,r)=>s+(r.amount||0),0);
  const remittances = calcRemittancesFromRecords(income);
  const netLocal = remittances.netLocal;
  const churchBal = calcChurchBalance();
  const pendingPetty = getPettyCashPendingCount();
  const overdueRems = DB.getRemittances().filter(r=>r.status==='overdue').length;

  // Feed items
  const recentIncome = allIncome.slice(0,3);
  const recentExp = allExpenses.slice(0,3);
  const feedItems = [...recentIncome.map(r=>({type:'income',date:r.date,desc:`Sunday collections ${r.depositConfirmed?'deposited':'collected (cash)'}`,amt:r.totalCollection,icon:'📥',color:'#E1F5EE'})),
    ...recentExp.map(r=>({type:'expense',date:r.date||r.createdAt,desc:r.description,amt:r.amount,icon:'💸',color:'#FAEEDA'}))]
    .sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);

  const expByCat = {};
  expenses.forEach(e=>{ expByCat[e.category]=(expByCat[e.category]||0)+(e.amount||0) });
  const topCats = Object.entries(expByCat).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxCat = topCats[0]?.[1]||1;

  // Alerts
  let alerts='';
  if(overdueRems>0) alerts+=`<div class="alert alert-danger"><span class="alert-icon">⚠</span><span>${overdueRems} remittance(s) are <strong>overdue</strong>. Please process immediately.</span></div>`;
  if(pendingPetty>0) alerts+=`<div class="alert alert-warn"><span class="alert-icon">⏳</span><span>${pendingPetty} petty cash request(s) awaiting approval. <button class="btn btn-sm" onclick="App.navigate('petty_cash')" style="margin-left:8px">Review</button></span></div>`;
  if(churchBal.bankBalance<50000 && churchBal.bankBalance>0) alerts+=`<div class="alert alert-warn"><span class="alert-icon">💰</span><span>Bank balance is running low. Consider notifying the KPSC if remittances cannot be covered.</span></div>`;

  // Monthly trend (last 4 months)
  const trendData = [];
  for(let i=3;i>=0;i--){
    let m=state.month-i; let y=state.year;
    if(m<0){m+=12;y--;}
    const recs=DB.getIncome().filter(r=>{const d=new Date(r.date||r.createdAt);return d.getMonth()===m&&d.getFullYear()===y});
    trendData.push({label:MONTHS[m].slice(0,3),total:recs.reduce((s,r)=>s+(r.totalCollection||0),0)});
  }
  const maxTrend=Math.max(...trendData.map(t=>t.total),1);

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Welcome, ${state.user?.name?.split(' ')[0]||'User'} 👋</div><div class="page-sub">${monthLabel()} Financial Overview</div></div>
      ${can('income')?`<button class="btn btn-primary" onclick="App.navigate('income')">📥 Record Income</button>`:''}
    </div>

    ${alerts}

    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-icon" style="background:#E1F5EE">📥</div>
        <div class="kpi-label">Total Income</div>
        <div class="kpi-val">${fmt(totalIncome)}</div>
        <div class="kpi-delta up">↑ ${income.length} record(s) this month</div>
      </div>
      <div class="kpi">
        <div class="kpi-icon" style="background:#FCEBEB">📤</div>
        <div class="kpi-label">RCCG Remittances</div>
        <div class="kpi-val">${fmt(remittances.totalNatl+remittances.totalArea+remittances.provinceRebate)}</div>
        <div class="kpi-delta warn">↑ ${totalIncome?Math.round((remittances.totalNatl+remittances.totalArea+remittances.provinceRebate)/totalIncome*100):0}% of income</div>
      </div>
      <div class="kpi">
        <div class="kpi-icon" style="background:#E1F5EE">🏦</div>
        <div class="kpi-label">Net Local Retained</div>
        <div class="kpi-val">${fmt(netLocal)}</div>
        <div class="kpi-delta up">After province rebate</div>
      </div>
      <div class="kpi kpi-balance" style="grid-column:span 1">
        <div class="kpi-icon" style="background:#EAF3DE">🏛️</div>
        <div class="kpi-label">Total Church Balance</div>
        <div class="kpi-val" style="color:${churchBal.total<0?'var(--danger)':'var(--primary)'}">${fmt(churchBal.total)}</div>
        <div style="margin-top:6px;font-size:11px;color:var(--text3);line-height:1.6">
          <span style="display:inline-block;width:8px;height:8px;background:#185FA5;border-radius:50%;margin-right:4px"></span>Bank: ${fmt(churchBal.bankBalance)}<br>
          <span style="display:inline-block;width:8px;height:8px;background:#BA7517;border-radius:50%;margin-right:4px"></span>Cash with Accountant: ${fmt(churchBal.cashWithAccountant)}<br>
          <span style="display:inline-block;width:8px;height:8px;background:#1D9E75;border-radius:50%;margin-right:4px"></span>Petty Cash (Admin Officer): ${fmt(churchBal.pettyFloat)}
        </div>
      </div>
    </div>

    ${can('income','expenses','petty_request','reports')?`
    <div class="card">
      <div class="card-header"><span class="card-title">Quick Actions</span></div>
      <div class="qa-grid">
        ${can('income')?`<button class="qa-btn" onclick="App.navigate('income')"><div class="qa-icon" style="background:#E1F5EE">📥</div><div class="qa-label">Record Collections</div><div class="qa-sub">Log Sunday income</div></button>`:''}
        ${can('remittances','remittances_view')?`<button class="qa-btn" onclick="App.navigate('remittances')"><div class="qa-icon" style="background:#FCEBEB">📤</div><div class="qa-label">Remittances</div><div class="qa-sub">Calculate & pay HQ</div></button>`:''}
        ${can('expenses')?`<button class="qa-btn" onclick="App.navigate('expenses')"><div class="qa-icon" style="background:#FAEEDA">💸</div><div class="qa-label">Log Expense</div><div class="qa-sub">Record spending</div></button>`:''}
        ${can('petty_request','petty_view')?`<button class="qa-btn" onclick="App.navigate('petty_cash')"><div class="qa-icon" style="background:#EAF3DE">💳</div><div class="qa-label">Petty Cash</div><div class="qa-sub">${pendingPetty>0?pendingPetty+' pending':'Request / Approve'}</div></button>`:''}
        ${can('income')?`<button class="qa-btn" onclick="App.showBankWithdrawal()"><div class="qa-icon" style="background:#E6F1FB">🏦</div><div class="qa-label">Bank Withdrawal</div><div class="qa-sub">Record a bank debit</div></button>`:''}
        ${can('reports')?`<button class="qa-btn" onclick="App.navigate('reports')"><div class="qa-icon" style="background:#EEEDFE">📊</div><div class="qa-label">Reports</div><div class="qa-sub">Generate statements</div></button>`:''}
        <button class="qa-btn" onclick="App.showKPSCAlert()"><div class="qa-icon" style="background:#FAEEDA">🔔</div><div class="qa-label">Alert KPSC</div><div class="qa-sub">Emergency support</div></button>
      </div>
    </div>`:''}

    <div class="grid-6040">
      <div>
        <div class="card">
          <div class="card-header"><span class="card-title">Recent Activity</span></div>
          ${feedItems.length?feedItems.map(f=>`
            <div class="feed-item">
              <div class="feed-dot" style="background:${f.color}">${f.icon}</div>
              <div class="feed-body"><div class="feed-title">${f.desc}</div><div class="feed-time">${fmtDate(f.date)}</div></div>
              <div class="feed-right" style="color:${f.type==='income'?'var(--success)':'var(--danger)'}">${f.type==='income'?'+':'−'}${fmt(f.amt)}</div>
            </div>`).join(''):'<div class="empty-table">No activity this month yet.</div>'}
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Monthly Trend</span></div>
          <div style="display:flex;align-items:flex-end;gap:8px;height:100px;padding:8px 0">
            ${trendData.map(t=>`
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
                <div style="font-size:10px;color:var(--text3)">${t.total?fmt(t.total).replace('₦','').replace(/,\d{3}$/,'k'):'—'}</div>
                <div style="width:100%;background:var(--primary);border-radius:4px 4px 0 0;height:${Math.round((t.total/maxTrend)*72)+8}px;min-height:4px;transition:height 0.4s"></div>
                <div style="font-size:11px;color:var(--text2)">${t.label}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-header"><span class="card-title">Expense Breakdown</span></div>
          ${topCats.length?topCats.map(([cat,amt])=>{
            const c=EXPENSE_CATS.find(e=>e.key===cat)||{label:cat,color:'#888'};
            return `<div class="exp-row"><div class="exp-label">${c.icon||''} ${c.label}</div><div class="progress-bar"><div class="progress-fill" style="width:${Math.round(amt/maxCat*100)}%;background:${c.color}"></div></div><div class="exp-val">${fmt(amt)}</div></div>`;
          }).join(''):'<div style="font-size:13px;color:var(--text3);padding:20px 0;text-align:center">No expenses recorded this month.</div>'}
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Remittance Summary</span></div>
          <div class="status-row"><div><div class="status-row-label">National HQ</div></div><div class="status-row-right"><div class="status-row-amt">${fmt(remittances.totalNatl)}</div></div></div>
          <div class="status-row"><div><div class="status-row-label">Area</div></div><div class="status-row-right"><div class="status-row-amt">${fmt(remittances.totalArea)}</div></div></div>
          <div class="status-row"><div><div class="status-row-label">Pastor's Share (TG)</div></div><div class="status-row-right"><div class="status-row-amt">${fmt(remittances.totalPastor)}</div></div></div>
          <div class="status-row"><div><div class="status-row-label">Province Rebate (${Math.round((getRemRates().provinceRebate)*100)}%)</div></div><div class="status-row-right"><div class="status-row-amt">${fmt(remittances.provinceRebate)}</div></div></div>
          <div class="status-row" style="border-top:2px solid var(--border);margin-top:4px;padding-top:12px"><div><div class="status-row-label fw-bold">Net Local Retained</div></div><div class="status-row-right"><div class="status-row-amt" style="color:var(--primary);font-size:15px">${fmt(remittances.netLocal)}</div></div></div>
        </div>
      </div>
    </div>`;
}

function calcRemittancesFromRecords(records){
  const combined = {};
  INCOME_TYPES.forEach(t=>{ combined[t.key]=0 });
  records.forEach(r=>{ INCOME_TYPES.forEach(t=>{ combined[t.key]+=(r[t.key]||0) }) });
  return calcRemittances(combined);
}

// ── INCOME ────────────────────────────────
function renderIncome(){
  const records = filterByMonth(DB.getIncome());
  const sundayRecs = records.filter(r=>!r.source||r.source==='sunday_collection');
  const otherRecs  = records.filter(r=>r.source && r.source!=='sunday_collection');
  const tab = state.incomeTab||'list';
  // Compute pending records (cash not yet fully deposited) across ALL income types
  const _cashTx = DB.getCashTransactions();
  const pendingCount = records.filter(r=>{
    const isSunday = !r.source||r.source==='sunday_collection';
    const cashHeld = isSunday
      ? Math.max(0,(r.totalCollection||0)-(r.bankTransferAmount||0)-(r.directPettyCash||0))
      : r.paymentMethod==='cash' ? (r.totalCollection||0) : 0;
    const dep = _cashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
    return cashHeld>0 && dep<cashHeld;
  }).length;
  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Income Recording</div><div class="page-sub">${monthLabel()}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${can('income')?`<button class="btn btn-primary" onclick="App.showIncomeForm()">📥 Sunday Collections</button>`:''}
        ${can('income')?`<button class="btn btn-amber" onclick="App.showOtherIncomeForm()">➕ Other Income</button>`:''}
        ${can('income')&&pendingCount>=2?`<button class="btn btn-amber" onclick="App.confirmBulkDeposit()">💰 Deposit All Pending (${pendingCount})</button>`:''}
      </div>
    </div>
    <div class="tabs">
      <button class="tab ${tab==='list'?'active':''}" onclick="App.setIncomeTab('list')">Sunday Collections (${sundayRecs.length})</button>
      <button class="tab ${tab==='other'?'active':''}" onclick="App.setIncomeTab('other')">Other Income (${otherRecs.length})</button>
      <button class="tab ${tab==='summary'?'active':''}" onclick="App.setIncomeTab('summary')">Monthly Summary</button>
      <button class="tab ${tab==='all'?'active':''}" onclick="App.setIncomeTab('all')">All Records</button>
    </div>
    ${tab==='list'?renderIncomeList(sundayRecs):tab==='other'?renderOtherIncomeList(otherRecs):tab==='summary'?renderIncomeSummary(records):renderIncomeList(DB.getIncome())}`;
}

function setIncomeTab(t){ state.incomeTab=t; renderIncome() }

function renderIncomeList(records){
  if(!records.length) return '<div class="card"><div class="empty-table">No income records found. Click "Sunday Collections" to add one.</div></div>';
  return `<div class="card"><div class="table-wrap"><table>
    <tr><th>Date</th><th>Total Collection</th><th>Cash (Accountant)</th><th>Bank Transfer</th><th>Direct → Petty</th><th>Cash Status</th><th>Recorded By</th><th>Actions</th></tr>
    ${records.map(r=>{
      const btAmt = r.bankTransferAmount||0;
      const dpAmt = r.directPettyCash||0;
      const cashHeld = Math.max(0,(r.totalCollection||0) - btAmt - dpAmt);
      // determine deposit status
      const depositedAmt = (DB.getCashTransactions().filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0));
      const isFullyDeposited = cashHeld > 0 && depositedAmt >= cashHeld;
      const statusBadge = cashHeld===0
        ? `<span class="badge badge-info">No Cash (All Transfer)</span>`
        : isFullyDeposited
          ? `<span class="badge badge-success">Deposited</span>`
          : depositedAmt>0
            ? `<span class="badge badge-warn">Partial (${fmt(depositedAmt)} deposited)</span>`
            : `<span class="badge badge-warn">Cash Pending Deposit</span>`;
      return `<tr>
        <td><strong>${fmtDate(r.date)}</strong><div class="td-muted">${r.notes||''}</div></td>
        <td class="td-green td-bold">${fmt(r.totalCollection)}</td>
        <td class="td-muted">${cashHeld>0?fmt(cashHeld):'—'}</td>
        <td class="td-muted">${btAmt>0?fmt(btAmt):'—'}</td>
        <td class="td-muted">${dpAmt>0?fmt(dpAmt):'—'}</td>
        <td>${statusBadge}</td>
        <td class="td-muted">${r.recordedBy||'—'}</td>
        <td><button class="btn btn-sm" onclick="App.viewIncome('${r.id}')">View</button>
        ${can('income')&&cashHeld>0&&!isFullyDeposited?`<button class="btn btn-sm btn-primary" onclick="App.confirmDeposit('${r.id}')" style="margin-left:4px">Record Deposit</button>`:''}</td>
      </tr>`;}).join('')}
  </table></div></div>`;
}

function renderOtherIncomeList(records){
  if(!records.length) return '<div class="card"><div class="empty-table">No other income records found. Click "Other Income" to add one.</div></div>';
  return `<div class="card"><div class="table-wrap"><table>
    <tr><th>Date</th><th>Source Type</th><th>Donor / Notes</th><th>Amount</th><th>Payment Method</th><th>Status</th><th>Recorded By</th><th>Actions</th></tr>
    ${records.map(r=>{
      const src = OTHER_INCOME_SOURCES.find(s=>s.key===r.source)||{label:r.source||'Other'};
      const isCash = r.paymentMethod==='cash';
      const cashDep = DB.getCashTransactions().filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
      const statusBadge = !isCash
        ? `<span class="badge badge-info">Bank Transfer</span>`
        : cashDep>=(r.totalCollection||0)
          ? `<span class="badge badge-success">Deposited</span>`
          : `<span class="badge badge-warn">Cash Pending Deposit</span>`;
      return `<tr>
        <td><strong>${fmtDate(r.date)}</strong></td>
        <td><span class="badge badge-gray">${src.label}</span></td>
        <td class="td-muted">${r.donorName||r.notes||'—'}</td>
        <td class="td-green td-bold">${fmt(r.totalCollection)}</td>
        <td class="td-muted" style="font-size:11px">${(r.paymentMethod||'cash').replace('_',' ')}</td>
        <td>${statusBadge}</td>
        <td class="td-muted">${r.recordedBy||'—'}</td>
        <td><button class="btn btn-sm" onclick="App.viewIncome('${r.id}')">View</button>
        ${can('income')&&isCash&&cashDep<(r.totalCollection||0)?`<button class="btn btn-sm btn-primary" onclick="App.confirmDeposit('${r.id}')" style="margin-left:4px">Record Deposit</button>`:''}</td>
      </tr>`;}).join('')}
  </table></div></div>`;
}

function renderIncomeSummary(records){
  const totals = {};
  INCOME_TYPES.forEach(t=>{ totals[t.key]=0 });
  records.forEach(r=>{ INCOME_TYPES.forEach(t=>{ totals[t.key]+=(r[t.key]||0) }) });
  const grand = Object.values(totals).reduce((a,b)=>a+b,0);
  const rem = calcRemittances(totals);
  return `
    <div class="grid-2">
      <div class="card">
        <div class="card-header"><span class="card-title">Income by Type</span></div>
        ${INCOME_TYPES.map(t=>`
          <div class="status-row">
            <div class="status-row-label">${t.label}</div>
            <div class="status-row-amt">${fmt(totals[t.key])}</div>
          </div>`).join('')}
        <div class="status-row" style="border-top:2px solid var(--border);margin-top:4px"><div class="status-row-label fw-bold">Grand Total</div><div class="status-row-amt" style="color:var(--primary);font-size:16px">${fmt(grand)}</div></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Remittance Breakdown</span></div>
        ${rem.lines.map(l=>`
          <div class="status-row">
            <div><div class="status-row-label">${l.label} → HQ</div><div class="status-row-sub">From ${fmt(l.total)}</div></div>
            <div class="status-row-amt td-red">${fmt(l.national||0)}</div>
          </div>`).join('')}
        <div class="status-row" style="background:var(--amber-light);border-radius:var(--r);padding:8px 10px;border:none;margin-top:4px">
          <div class="status-row-label">Province Rebate (${Math.round(getRemRates().provinceRebate*100)}%)</div><div class="status-row-amt td-amber">${fmt(rem.provinceRebate)}</div>
        </div>
        <div class="status-row" style="border-top:2px solid var(--border);margin-top:4px"><div class="status-row-label fw-bold">Net Local Retained</div><div class="status-row-amt" style="color:var(--primary);font-size:16px">${fmt(rem.netLocal)}</div></div>
      </div>
    </div>`;
}

function showIncomeForm(){
  const today = new Date().toISOString().split('T')[0];
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">📥 Record Sunday Collections</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>Count cash together with the Head Usher before entering figures. Both must sign off.</span></div>
    <div class="form-group"><label class="form-label">Collection Date</label><input type="date" id="inc_date" class="form-input" value="${today}" max="${today}" /></div>
    <div class="form-group"><label class="form-label">Counted Together With (Usher Name)</label><input type="text" id="inc_usher" class="form-input" placeholder="Head Usher's name" /></div>
    <hr class="divider"><p style="font-size:12px;color:var(--text3);margin-bottom:12px">Enter amounts collected for each category (leave blank if nil):</p>
    ${INCOME_TYPES.map(t=>`<div class="form-group"><label class="form-label">${t.label}</label><input type="number" id="inc_${t.key}" class="form-input" placeholder="₦0" min="0" oninput="App.updateIncomeTotal()" /></div>`).join('')}
    <div class="card" style="background:var(--primary-light);border-color:var(--primary-mid);margin-top:8px">
      <div class="amount-label">Total Collection</div>
      <div class="amount-display" id="inc_total">₦0</div>
    </div>
    <hr class="divider">
    <p style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px">📋 Receipt Breakdown — How was this collected?</p>
    <p style="font-size:11px;color:var(--text3);margin-bottom:12px">Specify any portion received via bank transfer or given directly to the Admin Officer. The remainder is cash with the accountant.</p>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Via Bank Transfer (₦)</label>
        <input type="number" id="inc_bank_transfer" class="form-input" placeholder="0" min="0" oninput="App.updateIncomeCashBreakdown()" />
        <div class="form-hint">Members who paid tithe/offerings directly into the bank account</div>
      </div>
      <div class="form-group"><label class="form-label">Cash → Directly to Admin Officer (₦)</label>
        <input type="number" id="inc_direct_petty" class="form-input" placeholder="0" min="0" oninput="App.updateIncomeCashBreakdown()" />
        <div class="form-hint">Usher delivers this portion to the Admin Officer to top up petty cash</div>
      </div>
    </div>
    <div class="card" style="background:var(--surface);margin-top:4px" id="inc_breakdown_card">
      <div style="font-size:12px;color:var(--text2);line-height:2">
        <span style="color:var(--primary);font-weight:600">Cash with Accountant:</span> <span id="inc_cash_held">₦0</span>
        &nbsp;·&nbsp;Bank Transfer: <span id="inc_bank_lbl">₦0</span>
        &nbsp;·&nbsp;Direct to Petty: <span id="inc_petty_lbl">₦0</span>
      </div>
    </div>
    <div class="form-group mt-2"><label class="form-label">Notes (optional)</label><textarea id="inc_notes" class="form-textarea" placeholder="Special offerings, events, etc."></textarea></div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitIncome()">Save & Calculate Remittances</button>
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
  const cash = Math.max(0, total - bt - dp);
  const cashEl = document.getElementById('inc_cash_held');
  const btEl   = document.getElementById('inc_bank_lbl');
  const dpEl   = document.getElementById('inc_petty_lbl');
  if(cashEl) cashEl.textContent = fmt(cash);
  if(btEl)   btEl.textContent   = fmt(bt);
  if(dpEl)   dpEl.textContent   = fmt(dp);
}

function submitIncome(){
  const date=document.getElementById('inc_date')?.value;
  const usher=document.getElementById('inc_usher')?.value?.trim();
  if(!date){ alert('Please select a date.'); return }
  if(!usher){ alert('Please enter the Head Usher name for counter-signing.'); return }
  const rec={date,usher,source:'sunday_collection',recordedBy:state.user?.name,depositConfirmed:false};
  let total=0;
  INCOME_TYPES.forEach(t=>{ const v=parseFloat(document.getElementById('inc_'+t.key)?.value||0)||0; rec[t.key]=v; total+=v });
  if(!total){ alert('Please enter at least one income amount.'); return }
  rec.totalCollection=total;

  const bankTransferAmount = parseFloat(document.getElementById('inc_bank_transfer')?.value||0)||0;
  const directPettyCash    = parseFloat(document.getElementById('inc_direct_petty')?.value||0)||0;
  if(bankTransferAmount + directPettyCash > total){
    alert(`Bank transfer (${fmt(bankTransferAmount)}) + direct petty cash (${fmt(directPettyCash)}) cannot exceed the total collection (${fmt(total)}).`);
    return;
  }
  rec.bankTransferAmount = bankTransferAmount;
  rec.directPettyCash    = directPettyCash;
  rec.notes=document.getElementById('inc_notes')?.value||'';

  const saved = DB.addIncome(rec);

  // If some cash was given directly to the admin officer, auto-create a petty refill
  if(directPettyCash > 0){
    const petty = DB.getPetty();
    const newFloat = Math.min(petty.float + directPettyCash, petty.max);
    petty.history.unshift({ id:'RF-'+Date.now(), type:'refill', amount:directPettyCash, source:'collection_cash',
      reference:`From Sunday collection ${fmtDate(date)}`, authorizedBy:state.user?.name,
      requestedBy:state.user?.name, status:'settled', createdAt:new Date().toISOString(),
      purpose:`Cash from Sunday collection (${fmtDate(date)}) → Admin Officer Petty Cash`, incomeRef:saved.id });
    petty.float = newFloat;
    DB.savePetty(petty);
    DB.addAudit('petty_refilled',`${fmt(directPettyCash)} from Sunday collection credited to Admin Officer petty cash`,state.user?.name);
  }

  DB.addNotification('Income Recorded',`${fmt(total)} recorded for ${fmtDate(date)}${directPettyCash?` | ${fmt(directPettyCash)} → Petty Cash`:''}`,'success');
  closeModal();
  showAlert(`Income of ${fmt(total)} recorded. Cash with accountant: ${fmt(Math.max(0,total-bankTransferAmount-directPettyCash))}${bankTransferAmount?` | Bank: ${fmt(bankTransferAmount)}`:''}${directPettyCash?` | Petty: ${fmt(directPettyCash)}`:''}`, 'success');
  renderIncome();
  buildSidebar();
}

function viewIncome(id){
  const r=DB.getIncome().find(x=>x.id===id);
  if(!r) return;
  const isSunday = !r.source||r.source==='sunday_collection';
  const rem = isSunday ? calcRemittances(r) : null;
  const btAmt = r.bankTransferAmount||0;
  const dpAmt = r.directPettyCash||0;
  const cashHeld = Math.max(0,(r.totalCollection||0) - btAmt - dpAmt);
  const deposits = DB.getCashTransactions().filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id);
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
    <div class="status-row"><div class="status-row-label">Province Rebate (${Math.round(getRemRates().provinceRebate*100)}%)</div><div class="status-row-amt td-amber">${fmt(rem.provinceRebate)}</div></div>
    <div class="status-row" style="border-top:2px solid var(--border)"><div class="status-row-label fw-bold">Net Local Retained</div><div class="status-row-amt td-green" style="font-size:15px">${fmt(rem.netLocal)}</div></div>`:''}
    <hr class="divider">
    <div class="fs-12 text-muted">Recorded by: ${r.recordedBy||'—'} · ${isSunday?'Counted with: '+r.usher:'Donor: '+(r.donorName||'—')}</div>
    ${deposits.length?`<div class="fs-12 text-muted">Deposit records: ${deposits.map(d=>`${fmt(d.amount)} via ${d.depositMethod?.replace('_',' ')||'—'} on ${fmtDate(d.date)} (Ref: ${d.reference||'—'})`).join('; ')}</div>`:''}
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Close</button>
    ${can('income')&&cashHeld>depositedTotal?`<button class="btn btn-primary" onclick="App.confirmDeposit('${r.id}')">Record Cash Deposit</button>`:''}</div>`);
}

function confirmDeposit(id){
  const r = DB.getIncome().find(x=>x.id===id);
  if(!r) return;
  const btAmt = r.bankTransferAmount||0;
  const dpAmt = r.directPettyCash||0;
  const cashHeld = Math.max(0,(r.totalCollection||0) - btAmt - dpAmt);
  const alreadyDeposited = DB.getCashTransactions().filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
  const remaining = Math.max(0, cashHeld - alreadyDeposited);
  const today = new Date().toISOString().split('T')[0];
  closeModal();
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">💰 Record Cash Deposit — ${fmtDate(r.date)}</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>Record when you physically deposit the cash collected into the church bank account.</span></div>
    <div class="form-group"><label class="form-label">Cash Available from this Record</label>
      <div style="font-size:20px;font-weight:700;color:var(--primary);padding:8px 0">${fmt(remaining)}</div>
      ${alreadyDeposited?`<div class="form-hint">₦${alreadyDeposited.toLocaleString('en-NG')} already deposited previously from this record.</div>`:''}
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
    <div class="form-group"><label class="form-label">Teller / Reference Number *</label>
      <input type="text" id="dep_ref" class="form-input" placeholder="Bank teller number or transaction reference" />
    </div>
    <div class="form-group"><label class="form-label">Date of Deposit *</label>
      <input type="date" id="dep_date" class="form-input" value="${today}" max="${today}" />
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitCashDeposit('${id}')">Confirm Deposit</button>
    </div>`);
}

function submitCashDeposit(incomeId){
  const amount  = parseFloat(document.getElementById('dep_amount')?.value)||0;
  const method  = document.getElementById('dep_method')?.value;
  const ref     = document.getElementById('dep_ref')?.value?.trim();
  const date    = document.getElementById('dep_date')?.value;
  if(!amount||!ref||!date){ alert('Please fill all required fields.'); return }
  DB.addCashTransaction({ type:'cash_deposit', incomeRef:incomeId, amount, depositMethod:method, reference:ref, date, recordedBy:state.user?.name });
  DB.addAudit('cash_deposited',`Cash deposit: ${fmt(amount)} via ${method?.replace(/_/g,' ')||'—'} — Ref: ${ref}`,state.user?.name);
  DB.addNotification('Cash Deposited',`${fmt(amount)} deposited to bank (Ref: ${ref})`,'success');
  closeModal();
  showAlert(`${fmt(amount)} deposited to bank successfully! Ref: ${ref}`, 'success');
  renderIncome();
}

function confirmBulkDeposit(){
  const allIncome = filterByMonth(DB.getIncome());
  const cashTx = DB.getCashTransactions();
  const pending = allIncome.map(r=>{
    const isSunday = !r.source||r.source==='sunday_collection';
    const cashHeld = isSunday
      ? Math.max(0,(r.totalCollection||0)-(r.bankTransferAmount||0)-(r.directPettyCash||0))
      : r.paymentMethod==='cash' ? (r.totalCollection||0) : 0;
    const deposited = cashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
    const srcLabel = isSunday ? 'Sunday Collection' : (OTHER_INCOME_SOURCES.find(s=>s.key===r.source)||{label:r.source||'Other'}).label;
    return { id:r.id, date:r.date, cashHeld, deposited, remaining:cashHeld-deposited, source:srcLabel };
  }).filter(p=>p.cashHeld>0 && p.remaining>0);
  if(!pending.length){ showAlert('No pending cash deposits found.','warn'); return }
  state._bulkDepositPending = pending;
  const totalRemaining = pending.reduce((s,p)=>s+p.remaining,0);
  const today = new Date().toISOString().split('T')[0];
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">💰 Deposit All Pending Cash</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>This records one bank deposit covering all ${pending.length} pending cash record${pending.length>1?'s':''}.</span></div>
    <div class="table-wrap" style="margin-bottom:16px"><table>
      <tr><th>Date</th><th>Source</th><th>Cash Held</th><th>Already Deposited</th><th class="td-right">Remaining</th></tr>
      ${pending.map(p=>`<tr>
        <td><strong>${fmtDate(p.date)}</strong></td>
        <td class="td-muted">${p.source}</td>
        <td>${fmt(p.cashHeld)}</td>
        <td>${p.deposited>0?fmt(p.deposited):'—'}</td>
        <td class="td-right td-bold">${fmt(p.remaining)}</td>
      </tr>`).join('')}
      <tr style="border-top:2px solid var(--border);font-weight:700">
        <td colspan="4">TOTAL</td>
        <td class="td-right" style="color:var(--primary);font-size:15px">${fmt(totalRemaining)}</td>
      </tr>
    </table></div>
    <div class="form-group"><label class="form-label">Deposit Method *</label>
      <select id="bulk_dep_method" class="form-select">
        <option value="bank_teller">Bank Cash Teller</option>
        <option value="pos_terminal">POS Terminal</option>
        <option value="mobile_transfer">Mobile / Internet Banking Transfer</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Teller / Reference Number *</label>
      <input type="text" id="bulk_dep_ref" class="form-input" placeholder="Bank teller number or transaction reference" />
    </div>
    <div class="form-group"><label class="form-label">Date of Deposit *</label>
      <input type="date" id="bulk_dep_date" class="form-input" value="${today}" max="${today}" />
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitBulkDeposit()">Confirm Deposit — ${fmt(totalRemaining)}</button>
    </div>`);
}

function submitBulkDeposit(){
  const pending = state._bulkDepositPending || [];
  const method  = document.getElementById('bulk_dep_method')?.value;
  const ref     = document.getElementById('bulk_dep_ref')?.value?.trim();
  const date    = document.getElementById('bulk_dep_date')?.value;
  if(!ref||!date){ alert('Please fill all required fields.'); return }
  if(!pending.length){ closeModal(); return }
  const totalAmount = pending.reduce((s,p)=>s+p.remaining,0);
  pending.forEach(p=>{
    DB.addCashTransaction({ type:'cash_deposit', incomeRef:p.id, amount:p.remaining, depositMethod:method, reference:ref, date, recordedBy:state.user?.name });
  });
  DB.addAudit('cash_deposited',`Bulk cash deposit: ${fmt(totalAmount)} across ${pending.length} record(s) via ${method?.replace(/_/g,' ')||'—'} — Ref: ${ref}`,state.user?.name);
  DB.addNotification('Bulk Cash Deposited',`${fmt(totalAmount)} deposited to bank (${pending.length} records, Ref: ${ref})`,'success');
  delete state._bulkDepositPending;
  closeModal();
  showAlert(`${fmt(totalAmount)} deposited across ${pending.length} record(s). Ref: ${ref}`, 'success');
  renderIncome();
}

function showOtherIncomeForm(){
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
      <button class="btn btn-primary" onclick="App.submitOtherIncome()">Save Income</button>
    </div>`);
}

function submitOtherIncome(){
  const date       = document.getElementById('oi_date')?.value;
  const source     = document.getElementById('oi_source')?.value;
  const donorName  = document.getElementById('oi_donor')?.value?.trim();
  const category   = document.getElementById('oi_category')?.value;
  const amount     = parseFloat(document.getElementById('oi_amount')?.value)||0;
  const method     = document.getElementById('oi_method')?.value;
  const notes      = document.getElementById('oi_notes')?.value||'';
  if(!date||!source){ alert('Please select a date and source type.'); return }
  if(!amount){ alert('Please enter an amount.'); return }

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

  DB.addIncome(rec);
  DB.addNotification('Other Income Recorded',`${fmt(amount)} recorded (${source}) from ${donorName||'unnamed'}`,'success');
  closeModal();
  showAlert(`${fmt(amount)} recorded as ${OTHER_INCOME_SOURCES.find(s=>s.key===source)?.label||source}. Method: ${method.replace('_',' ')}.`,'success');
  renderIncome();
  buildSidebar();
}

// ── REMITTANCES ───────────────────────────
function renderRemittances(){
  const income = filterByMonth(DB.getIncome());
  const rem = calcRemittancesFromRecords(income);
  const paidRems = filterByMonth(DB.getRemittances());
  const settings = DB.getSettings();
  const quotas = settings.quotas||DEFAULT_QUOTAS;
  const totalPaid = paidRems.filter(r=>r.status==='paid').reduce((s,r)=>s+(r.amount||0),0);

  const rr = getRemRates();
  const lines = [
    ...rem.lines.map(l=>({ label:l.label+' → National HQ', amount:l.national||0, type:'percentage' })),
    { label:`Area (Thanksgiving ${Math.round(rr.tgArea*100)}%)`, amount:rem.totalArea, type:'percentage' },
    { label:`Pastor's Share (TG ${Math.round(rr.tgPastor*100)}%)`, amount:rem.totalPastor, type:'percentage' },
    { label:`Ministers' Share (TG ${Math.round(rr.tgMinisters*100)}%)`, amount:rem.totalMinisters, type:'percentage' },
    { label:`Pastors' Seed (TG ${Math.round(rr.tgSeed*100)}%)`, amount:rem.totalSeed||0, type:'percentage' },
    { label:`Province Rebate (${Math.round(rr.provinceRebate*100)}% of local)`, amount:rem.provinceRebate, type:'percentage' },
    { label:'Go-A-Fishing', amount:quotas.goFishing||0, type:'quota' },
    { label:'RMF (Camp Clearing)', amount:quotas.rmf||0, type:'quota' },
    { label:'CSR (Christian Social Responsibility)', amount:quotas.csr||0, type:'quota' },
    { label:'Education Fund', amount:quotas.edu||0, type:'quota' },
    { label:'Zonal Mummy Stipend', amount:quotas.mummy||0, type:'quota' },
    { label:'Volunteer', amount:quotas.volunteer||0, type:'quota' },
  ].filter(l=>l.amount>0);

  const totalDue = lines.reduce((s,l)=>s+l.amount,0);
  const paidMap = {};
  paidRems.forEach(r=>{ paidMap[r.label]=(paidMap[r.label]||0)+r.amount });

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Remittances</div><div class="page-sub">${monthLabel()} — All amounts due to RCCG authorities</div></div>
      ${can('income')?`<button class="btn btn-primary" onclick="App.markRemittancePaid()">+ Record Payment</button>`:''}
    </div>

    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-icon" style="background:#FCEBEB">📤</div><div class="kpi-label">Total Due</div><div class="kpi-val">${fmt(totalDue)}</div></div>
      <div class="kpi"><div class="kpi-icon" style="background:#EAF3DE">✓</div><div class="kpi-label">Total Paid</div><div class="kpi-val">${fmt(totalPaid)}</div></div>
      <div class="kpi"><div class="kpi-icon" style="background:#FAEEDA">⏳</div><div class="kpi-label">Outstanding</div><div class="kpi-val">${fmt(Math.max(0,totalDue-totalPaid))}</div></div>
      <div class="kpi"><div class="kpi-icon" style="background:#E1F5EE">🏠</div><div class="kpi-label">Net Local Retained</div><div class="kpi-val">${fmt(rem.netLocal)}</div></div>
    </div>

    <div class="grid-6040">
      <div class="card">
        <div class="card-header"><span class="card-title">Full Remittance Breakdown — ${monthLabel()}</span></div>
        <div class="table-wrap"><table>
          <tr><th>Description</th><th>Type</th><th class="td-right">Amount Due</th><th>Status</th></tr>
          ${lines.map(l=>{
            const paid=(paidMap[l.label]||0)>=l.amount;
            return `<tr>
              <td><strong>${l.label}</strong></td>
              <td><span class="badge ${l.type==='quota'?'badge-info':'badge-purple'}">${l.type==='quota'?'Fixed Quota':'% Based'}</span></td>
              <td class="td-right td-bold td-red">${fmt(l.amount)}</td>
              <td><span class="badge ${paid?'badge-success':'badge-warn'}">${paid?'Paid':'Unpaid'}</span></td>
            </tr>`;}).join('')}
          <tr style="border-top:2px solid var(--border)">
            <td colspan="2" class="td-bold">TOTAL REMITTANCES DUE</td>
            <td class="td-right td-bold" style="font-size:15px;color:var(--danger)">${fmt(totalDue)}</td>
            <td></td>
          </tr>
        </table></div>
      </div>

      <div>
        <div class="card">
          <div class="card-header"><span class="card-title">Payment History</span></div>
          ${paidRems.length?paidRems.map(r=>`
            <div class="feed-item">
              <div class="feed-dot" style="background:var(--success-light)">✓</div>
              <div class="feed-body"><div class="feed-title">${r.label}</div><div class="feed-sub">Ref: ${r.reference||'—'} · ${r.authorizedBy||'—'}</div><div class="feed-time">${fmtDate(r.paidDate)}</div></div>
              <div class="feed-right td-green">${fmt(r.amount)}</div>
            </div>`).join(''):'<div class="empty-table">No payments recorded this month.</div>'}
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Monthly Quotas</span></div>
          ${can('it_admin')?`<p style="font-size:12px;color:var(--text3);margin-bottom:10px">Edit quotas in IT Admin → Settings</p>`:''}
          ${Object.entries(quotas).map(([k,v])=>`<div class="status-row"><div class="status-row-label">${k.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}</div><div class="status-row-amt">${fmt(v)}</div></div>`).join('')}
        </div>
      </div>
    </div>`;
}

function markRemittancePaid(){
  const income = filterByMonth(DB.getIncome());
  const rem = calcRemittancesFromRecords(income);
  const settings = DB.getSettings();
  const quotas = settings.quotas||DEFAULT_QUOTAS;
  const lines=[
    ...rem.lines.map(l=>({ label:l.label+' → National HQ', amount:l.national||0 })),
    { label:`Province Rebate (${Math.round(getRemRates().provinceRebate*100)}% of local)`, amount:rem.provinceRebate },
    ...Object.entries(quotas).map(([k,v])=>({label:k.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase()), amount:v}))
  ].filter(l=>l.amount>0);

  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">Record Remittance Payment</div>
    <div class="form-group"><label class="form-label">Remittance Line Item</label>
      <select id="rem_label" class="form-select" onchange="App.setRemAmt()">
        <option value="">— Select line —</option>
        ${lines.map(l=>`<option value="${l.label}" data-amt="${l.amount}">${l.label} (${fmt(l.amount)})</option>`).join('')}
        <option value="Other">Other (enter manually)</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Amount Paid (₦)</label><input type="number" id="rem_amount" class="form-input" placeholder="0" /></div>
    <div class="form-group"><label class="form-label">Payment Date</label><input type="date" id="rem_date" class="form-input" value="${new Date().toISOString().split('T')[0]}" /></div>
    <div class="form-group"><label class="form-label">Bank Reference / Transfer ID</label><input type="text" id="rem_ref" class="form-input" placeholder="Reference number" /></div>
    <div class="form-group"><label class="form-label">Authorized By</label><input type="text" id="rem_auth" class="form-input" placeholder="Signatory names" value="${state.user?.name}" /></div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.submitRemittance()">Record Payment</button></div>`);
}

function setRemAmt(){
  const sel=document.getElementById('rem_label');
  const opt=sel.options[sel.selectedIndex];
  const amt=opt?.dataset?.amt;
  if(amt) document.getElementById('rem_amount').value=amt;
}

function submitRemittance(){
  const label=document.getElementById('rem_label')?.value;
  const amount=parseFloat(document.getElementById('rem_amount')?.value)||0;
  const date=document.getElementById('rem_date')?.value;
  const reference=document.getElementById('rem_ref')?.value;
  const auth=document.getElementById('rem_auth')?.value;
  if(!label||!amount||!date){ alert('Please fill all required fields.'); return }
  const arr=DB.getRemittances();
  arr.unshift({ id:'REM-'+Date.now(), label, amount, paidDate:date, reference, authorizedBy:auth, status:'paid', createdAt:new Date().toISOString() });
  DB.saveRemittances(arr);
  DB.addAudit('remittance_paid',`Remittance paid: ${label} — ${fmt(amount)}`,state.user?.name);
  DB.addNotification('Remittance Recorded',`${label}: ${fmt(amount)} paid on ${fmtDate(date)}`,'success');
  closeModal();
  showAlert('Remittance payment recorded!','success');
  renderRemittances();
}

// ── EXPENSES ──────────────────────────────
function renderExpenses(){
  const expenses=filterByMonth(DB.getExpenses());
  const total=expenses.reduce((s,r)=>s+(r.amount||0),0);
  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Expenses</div><div class="page-sub">${monthLabel()} — ${fmt(total)} spent</div></div>
      ${can('expenses')?`<button class="btn btn-primary" onclick="App.showExpenseForm()">+ Log Expense</button>`:''}
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Category Breakdown</span></div>
      <div class="grid-3">
        ${EXPENSE_CATS.map(c=>{
          const amt=expenses.filter(e=>e.category===c.key).reduce((s,e)=>s+(e.amount||0),0);
          return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0">
            <span style="font-size:20px">${c.icon}</span>
            <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.label}</div>
            <div style="font-size:12px;color:var(--text2)">${fmt(amt)}</div></div>
          </div>`;}).join('')}
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Expense Log</span></div>
      ${expenses.length?`<div class="table-wrap"><table>
        <tr><th>Date</th><th>Category</th><th>Sub-category</th><th>Description</th><th class="td-right">Amount</th><th>Method</th><th>Recorded By</th><th>Receipt</th></tr>
        ${expenses.map(e=>{const c=EXPENSE_CATS.find(x=>x.key===e.category)||{};return`<tr>
          <td>${fmtDate(e.date||e.createdAt)}</td>
          <td><span class="badge badge-gray">${c.icon||''} ${c.label||e.category}</span></td>
          <td style="font-size:12px;color:var(--text2)">${e.subCategory||'—'}</td>
          <td>${e.description||'—'}</td>
          <td class="td-right td-red td-bold">${fmt(e.amount)}</td>
          <td class="td-muted" style="font-size:11px">${e.paymentMethod?.replace('_',' ')||'—'}</td>
          <td class="td-muted">${e.recordedBy||'—'}</td>
          <td class="td-muted">${e.receiptImage?`<button class="btn btn-sm" onclick="App.viewExpenseReceipt('${e.id}')">View</button>`:e.receiptNo||'—'}</td>
        </tr>`}).join('')}
      </table></div>`:'<div class="empty-table">No expenses recorded this month.</div>'}
    </div>`;
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

function showExpenseForm(){
  const today=new Date().toISOString().split('T')[0];
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">💸 Log Expense</div>
    <div class="form-group"><label class="form-label">Date</label><input type="date" id="exp_date" class="form-input" value="${today}" max="${today}" /></div>
    <div class="form-group"><label class="form-label">Category *</label>
      <select id="exp_cat" class="form-select" onchange="App.updateExpenseSubcats()">
        <option value="">— Select category —</option>
        ${EXPENSE_CATS.map(c=>`<option value="${c.key}">${c.icon} ${c.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" id="exp_subcat_group" style="display:none"><label class="form-label">Sub-category *</label>
      <select id="exp_subcat" class="form-select" onchange="App.updateExpenseDescRequired()">
        <option value="">— Select sub-category —</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label" id="exp_desc_label">Description (optional)</label>
      <input type="text" id="exp_desc" class="form-input" placeholder="What was purchased / paid for?" />
      <div id="exp_desc_hint" class="form-hint" style="display:none;color:var(--danger);font-size:11px;margin-top:4px">Description is required when "Others..." is selected.</div>
    </div>
    <div class="form-group"><label class="form-label">Amount (₦) *</label><input type="number" id="exp_amt" class="form-input" placeholder="0" min="0" /></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Payment Method</label>
        <select id="exp_method" class="form-select">
          ${(state.user?.role==='admin_officer'||state.user?.role==='it_admin')?`<option value="petty_cash">Petty Cash (Admin Officer)</option>`:''}
          <option value="bank_transfer">Bank Transfer</option>
          <option value="cash">Cash (Accountant)</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Receipt / Invoice No. (optional)</label><input type="text" id="exp_receipt" class="form-input" placeholder="Optional" /></div>
    </div>
    <div class="form-group"><label class="form-label">Upload Receipt Image (optional)</label>
      <input type="file" id="exp_receipt_file" class="form-input" accept="image/*,application/pdf" style="padding:6px" />
    </div>
    <div class="form-group"><label class="form-label">Notes (optional)</label><textarea id="exp_notes" class="form-textarea" placeholder="Additional details..."></textarea></div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.submitExpense()">Save Expense</button></div>`);
}

function submitExpense(){
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

  const fileEl = document.getElementById('exp_receipt_file');
  const file = fileEl?.files?.[0];

  function saveExpenseRecord(receiptDataUrl, receiptFileName){
    DB.addExpense({ date, category, subCategory, description: description || subCategory, amount,
      receiptNo: document.getElementById('exp_receipt')?.value,
      receiptImage: receiptDataUrl||null, receiptFileName: receiptFileName||null,
      paymentMethod: document.getElementById('exp_method')?.value,
      notes: document.getElementById('exp_notes')?.value, recordedBy:state.user?.name, status:'approved' });
    closeModal();
    showAlert('Expense logged successfully!','success');
    renderExpenses();
  }

  if(file){
    const reader = new FileReader();
    reader.onload = ev => saveExpenseRecord(ev.target.result, file.name);
    reader.onerror = () => { showAlert('Failed to read receipt file. Saving expense without image.','warn'); saveExpenseRecord(null, null); };
    reader.readAsDataURL(file);
  } else {
    saveExpenseRecord(null, null);
  }
}

function viewExpenseReceipt(id){
  const exp = DB.getExpenses().find(e=>e.id===id);
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

function showBankWithdrawal(){
  const today=new Date().toISOString().split('T')[0];
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">🏦 Record Bank Withdrawal</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>Record cash withdrawn from the church bank account. Select where the withdrawn cash is going — this determines how the church balance is updated.</span></div>
    <div class="form-group"><label class="form-label">Date *</label><input type="date" id="wd_date" class="form-input" value="${today}" max="${today}" /></div>
    <div class="form-group"><label class="form-label">Amount Withdrawn (₦) *</label><input type="number" id="wd_amt" class="form-input" placeholder="0" min="0" /></div>
    <div class="form-group"><label class="form-label">Destination of Cash *</label>
      <select id="wd_dest" class="form-select">
        <option value="accountant_cash">→ Accountant's Cash (for payment of expenses, etc.)</option>
        <option value="admin_petty_cash">→ Admin Officer's Petty Cash (to refill the imprest float)</option>
        <option value="direct_expense">→ Direct Expense Payment (e.g. vendor paid immediately)</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Purpose / Description *</label><input type="text" id="wd_desc" class="form-input" placeholder="e.g. Petty cash refill, Payment for generator repair, etc." /></div>
    <div class="form-group"><label class="form-label">Bank Reference / Teller No.</label><input type="text" id="wd_ref" class="form-input" placeholder="Optional reference number" /></div>
    <div class="form-group"><label class="form-label">Authorized By</label><input type="text" id="wd_auth" class="form-input" placeholder="Signatory names" value="${state.user?.name||''}" /></div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.submitBankWithdrawal()">Record Withdrawal</button></div>`);
}

function submitBankWithdrawal(){
  const date        = document.getElementById('wd_date')?.value;
  const amount      = parseFloat(document.getElementById('wd_amt')?.value)||0;
  const destination = document.getElementById('wd_dest')?.value||'accountant_cash';
  const description = document.getElementById('wd_desc')?.value?.trim();
  const reference   = document.getElementById('wd_ref')?.value;
  const auth        = document.getElementById('wd_auth')?.value;
  if(!date||!amount||!description){ alert('Please fill all required fields.'); return }

  DB.addCashTransaction({ type:'withdrawal', destination, date, amount, description, reference, authorizedBy:auth, recordedBy:state.user?.name });

  // If withdrawn to admin officer petty cash, auto-create a petty refill
  if(destination === 'admin_petty_cash'){
    const petty = DB.getPetty();
    const newFloat = Math.min(petty.float + amount, petty.max);
    petty.history.unshift({ id:'RF-'+Date.now(), type:'refill', amount, source:'bank_withdrawal',
      reference, authorizedBy:auth, requestedBy:state.user?.name, status:'settled',
      createdAt:new Date().toISOString(), purpose:`Bank withdrawal → Admin Officer Petty Cash: ${description}` });
    petty.float = newFloat;
    DB.savePetty(petty);
    DB.addAudit('petty_refilled',`${fmt(amount)} from bank withdrawal credited to Admin Officer petty cash (${description})`,state.user?.name);
    closeModal();
    showAlert(`${fmt(amount)} withdrawn from bank and credited to Admin Officer petty cash. New float: ${fmt(newFloat)}.`,'success');
  } else {
    closeModal();
    showAlert(`Bank withdrawal of ${fmt(amount)} recorded. Destination: ${destination.replace(/_/g,' ')}.`,'success');
  }
  navigate(state.page);
}

// ── PETTY CASH ────────────────────────────
function renderPettyCash(){
  const petty=DB.getPetty();
  const history=petty.history||[];
  const monthHistory=history.filter(h=>{const d=new Date(h.createdAt||h.date||0);return d.getMonth()===state.month&&d.getFullYear()===state.year});
  const pct=Math.round((petty.float/petty.max)*100);
  const pending=history.filter(h=>h.status==='pending_approval');

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Petty Cash (Imprest)</div><div class="page-sub">Current float balance</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${can('petty_request','admin_officer')?`<button class="btn btn-primary" onclick="App.showPettyRequest()">+ Submit Request</button>`:''}
        ${can('income','accountant')?`<button class="btn btn-amber" onclick="App.showPettyRefill()">↺ Refill Float</button>`:''}
      </div>
    </div>

    <div class="grid-2">
      <div class="card" style="text-align:center;padding:1.5rem">
        <div class="amount-label">Available Float</div>
        <div class="amount-display" style="font-size:32px;color:${petty.float<10000?'var(--danger)':petty.float<20000?'var(--amber)':'var(--primary)'}">${fmt(petty.float)}</div>
        <div class="progress-bar" style="margin:12px auto;max-width:200px;height:10px">
          <div class="progress-fill" style="width:${pct}%;background:${pct<20?'var(--danger)':pct<50?'var(--amber)':'var(--primary)'}"></div>
        </div>
        <div class="amount-label">${pct}% of ${fmt(petty.max)} max float</div>
        ${petty.float<10000?`<div class="alert alert-danger" style="margin-top:12px;text-align:left"><span class="alert-icon">⚠</span><span>Float is critically low. Request a refill immediately.</span></div>`:''}
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Pending Approval (${pending.length})</span></div>
        ${pending.length?pending.map(r=>`
          <div class="status-row">
            <div><div class="status-row-label">${r.purpose}</div><div class="status-row-sub">By: ${r.requestedBy} · ${fmtDate(r.createdAt)}</div></div>
            <div class="status-row-right">
              <div class="status-row-amt td-amber">${fmt(r.amount)}</div>
              ${can('income','signatory','petty_approve')?`<button class="btn btn-sm btn-primary" onclick="App.approvePetty('${r.id}')">Approve</button><button class="btn btn-sm btn-danger" onclick="App.rejectPetty('${r.id}')" style="margin-left:4px">Reject</button>`:'' }
            </div>
          </div>`).join(''):'<div class="empty-table">No pending requests.</div>'}
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Petty Cash History — ${monthLabel()}</span></div>
      ${monthHistory.length?`<div class="table-wrap"><table>
        <tr><th>Date</th><th>Purpose</th><th>Requested By</th><th>Status</th><th class="td-right">Amount</th><th>Receipt</th></tr>
        ${monthHistory.map(r=>`<tr>
          <td>${fmtDate(r.createdAt)}</td>
          <td>${r.purpose}</td>
          <td class="td-muted">${r.requestedBy||'—'}</td>
          <td><span class="badge ${r.status==='approved'?'badge-success':r.status==='rejected'?'badge-danger':r.status==='settled'?'badge-info':'badge-warn'}">${r.status?.replace('_',' ')||'pending'}</span></td>
          <td class="td-right td-bold td-amber">${fmt(r.amount)}</td>
          <td>${r.receiptNo?`<span class="badge badge-success">✓ ${r.receiptNo}</span>`:`${r.status==='approved'?`<button class="btn btn-sm" onclick="App.submitPettyReceipt('${r.id}')">Submit Receipt</button>`:'—'}`}</td>
        </tr>`).join('')}
      </table></div>`:'<div class="empty-table">No petty cash activity this month.</div>'}
    </div>`;
}

function showPettyRequest(){
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">💳 Petty Cash Request</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>Submit your request here. The Accountant will verify funds and Signatories will approve before release.</span></div>
    <div class="form-group"><label class="form-label">Purpose / What is it for?</label><input type="text" id="pet_purpose" class="form-input" placeholder="e.g. Diesel for generator — Sunday 27 Apr" /></div>
    <div class="form-group"><label class="form-label">Amount Needed (₦)</label><input type="number" id="pet_amt" class="form-input" placeholder="0" min="0" /></div>
    <div class="form-group"><label class="form-label">Category</label>
      <select id="pet_cat" class="form-select">
        ${EXPENSE_CATS.map(c=>`<option value="${c.key}">${c.icon} ${c.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label class="form-label">Date Needed By</label><input type="date" id="pet_date" class="form-input" value="${new Date().toISOString().split('T')[0]}" /></div>
    <div class="form-group"><label class="form-label">Additional Notes</label><textarea id="pet_notes" class="form-textarea" placeholder="Any details that help with approval..."></textarea></div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.submitPettyRequest()">Submit Request</button></div>`);
}

function submitPettyRequest(){
  const purpose=document.getElementById('pet_purpose')?.value?.trim();
  const amount=parseFloat(document.getElementById('pet_amt')?.value)||0;
  const category=document.getElementById('pet_cat')?.value;
  if(!purpose||!amount){ alert('Please fill all required fields.'); return }
  const petty=DB.getPetty();
  if(amount>petty.float){ if(!confirm(`Requested amount (${fmt(amount)}) exceeds current float (${fmt(petty.float)}). Submit anyway for review?`)) return }
  const req={ id:'PC-'+Date.now(), purpose, amount, category, dateNeeded:document.getElementById('pet_date')?.value, notes:document.getElementById('pet_notes')?.value, requestedBy:state.user?.name, status:'pending_approval', createdAt:new Date().toISOString() };
  petty.history.unshift(req);
  DB.savePetty(petty);
  DB.addAudit('petty_requested',`Petty cash requested: ${purpose} — ${fmt(amount)}`,state.user?.name);
  DB.addNotification('Petty Cash Request',`${state.user?.name} requested ${fmt(amount)} for ${purpose}`,'warn');
  closeModal();
  showAlert('Request submitted! Awaiting Accountant & Signatory approval.','success');
  renderPettyCash();
  buildSidebar();
}

function approvePetty(id){
  const petty=DB.getPetty();
  const req=petty.history.find(h=>h.id===id);
  if(!req) return;
  if(req.amount>petty.float){ alert(`Insufficient float. Current: ${fmt(petty.float)}, Required: ${fmt(req.amount)}. Please refill the float first.`); return }
  req.status='approved'; req.approvedBy=state.user?.name; req.approvedAt=new Date().toISOString();
  petty.float-=req.amount;
  DB.savePetty(petty);
  DB.addAudit('petty_approved',`Petty cash approved: ${req.purpose} — ${fmt(req.amount)}`,state.user?.name);
  DB.addNotification('Petty Cash Approved',`Your request for ${fmt(req.amount)} (${req.purpose}) has been approved.`,'success');
  showAlert('Petty cash request approved. Float updated.','success');
  renderPettyCash();
  buildSidebar();
}

function rejectPetty(id){
  const reason=prompt('Reason for rejection (optional):');
  const petty=DB.getPetty();
  const req=petty.history.find(h=>h.id===id);
  if(!req) return;
  req.status='rejected'; req.rejectedBy=state.user?.name; req.rejectionReason=reason||''; req.rejectedAt=new Date().toISOString();
  DB.savePetty(petty);
  DB.addAudit('petty_rejected',`Petty cash rejected: ${req.purpose}`,state.user?.name);
  showAlert('Request rejected.','warn');
  renderPettyCash();
  buildSidebar();
}

function submitPettyReceipt(id){
  const no=prompt('Enter receipt number:');
  if(!no) return;
  const petty=DB.getPetty();
  const req=petty.history.find(h=>h.id===id);
  if(req){ req.receiptNo=no; req.status='settled'; req.settledAt=new Date().toISOString(); DB.savePetty(petty); }
  DB.addAudit('petty_receipt',`Receipt submitted for ${id}: ${no}`,state.user?.name);
  showAlert('Receipt recorded. Transaction settled.','success');
  renderPettyCash();
}

function showPettyRefill(){
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">↺ Refill Petty Cash Float</div>
    <div class="alert alert-warn"><span class="alert-icon">⚠</span><span>Only refill the exact amount of receipts submitted. If refilling from bank, signatories must authorize the transfer first.</span></div>
    <div class="form-group"><label class="form-label">Refill Amount (₦)</label><input type="number" id="ref_amt" class="form-input" placeholder="0" /></div>
    <div class="form-group"><label class="form-label">Source of Funds</label>
      <select id="ref_source" class="form-select">
        <option value="bank_transfer">Bank Transfer</option>
        <option value="cash">Cash (from Accountant)</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Reference / Description</label><input type="text" id="ref_ref" class="form-input" placeholder="Bank transfer reference or cash handover note" /></div>
    <div class="form-group"><label class="form-label">Authorized By</label><input type="text" id="ref_auth" class="form-input" placeholder="Signatory or Accountant names" /></div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.submitRefill()">Refill Float</button></div>`);
}

function submitRefill(){
  const amt=parseFloat(document.getElementById('ref_amt')?.value)||0;
  const ref=document.getElementById('ref_ref')?.value;
  const auth=document.getElementById('ref_auth')?.value;
  const source=document.getElementById('ref_source')?.value||'bank_transfer';
  if(!amt||!auth){ alert('Please enter amount and authorizing signatory.'); return }
  const petty=DB.getPetty();
  petty.float=Math.min(petty.float+amt, petty.max);
  petty.history.unshift({ id:'RF-'+Date.now(), type:'refill', amount:amt, reference:ref, source, authorizedBy:auth, requestedBy:state.user?.name, status:'settled', createdAt:new Date().toISOString(), purpose:'Float Refill' });
  DB.savePetty(petty);
  DB.addAudit('petty_refilled',`Float refilled: ${fmt(amt)} via ${source}`,state.user?.name);
  closeModal();
  showAlert(`Float refilled by ${fmt(amt)} (${source.replace('_',' ')}). New balance: ${fmt(petty.float)}`,'success');
  renderPettyCash();
}

// ── REPORTS ────────────────────────────────
function renderReports(){
  document.getElementById('pageContent').innerHTML=`
    <div class="page-header"><div class="page-title">Reports</div><div class="page-sub">${monthLabel()}</div></div>
    <div class="grid-3" style="margin-bottom:1rem">
      <button class="qa-btn" onclick="App.generateWeeklyReport()"><div class="qa-icon" style="background:#E1F5EE">📋</div><div class="qa-label">Weekly Summary</div><div class="qa-sub">Sunday collections breakdown</div></button>
      <button class="qa-btn" onclick="App.generateMonthlyReport()"><div class="qa-icon" style="background:#E6F1FB">📊</div><div class="qa-label">Monthly Statement</div><div class="qa-sub">Full income & expenses</div></button>
      <button class="qa-btn" onclick="App.generateRemittanceReport()"><div class="qa-icon" style="background:#FCEBEB">📤</div><div class="qa-label">Remittance Report</div><div class="qa-sub">For RCCG submission</div></button>
      <button class="qa-btn" onclick="App.generateQuarterlyReport()"><div class="qa-icon" style="background:#FAEEDA">📈</div><div class="qa-label">Quarterly Review</div><div class="qa-sub">3-month health check</div></button>
      <button class="qa-btn" onclick="App.generateExpenseReport()"><div class="qa-icon" style="background:#EAF3DE">💸</div><div class="qa-label">Expense Report</div><div class="qa-sub">By category</div></button>
      <button class="qa-btn" onclick="App.generatePettyCashReport()"><div class="qa-icon" style="background:#EEEDFE">💳</div><div class="qa-label">Petty Cash Report</div><div class="qa-sub">Imprest reconciliation</div></button>
    </div>
    <div id="reportOutput"></div>`;
}

function generateMonthlyReport(){
  const income=filterByMonth(DB.getIncome());
  const expenses=filterByMonth(DB.getExpenses());
  const paidRems=filterByMonth(DB.getRemittances());
  const rem=calcRemittancesFromRecords(income);
  const totalIncome=income.reduce((s,r)=>s+(r.totalCollection||0),0);
  const totalExpenses=expenses.reduce((s,r)=>s+(r.amount||0),0);
  const totalRem=paidRems.reduce((s,r)=>s+(r.amount||0),0);
  const settings=DB.getSettings();

  const html=`
    <div class="card" id="printReport">
      <div class="card-header"><span class="card-title">Monthly Financial Statement — ${monthLabel()}</span>
        <div><button class="btn btn-primary btn-sm no-print" onclick="window.print()">🖨 Print</button></div>
      </div>
      <div class="print-header">
        <h1>${settings.churchName||'RCCG Kingdom Parish, Aguleri'}</h1>
        <p>Monthly Financial Statement — ${monthLabel()}</p>
        <p>Prepared by: ${state.user?.name} on ${fmtDate(new Date().toISOString())}</p>
      </div>
      <div class="grid-2" style="margin:1rem 0">
        <div style="background:var(--success-light);padding:1rem;border-radius:var(--r);text-align:center"><div class="amount-label">Total Income</div><div class="amount-display" style="color:var(--success)">${fmt(totalIncome)}</div></div>
        <div style="background:var(--danger-light);padding:1rem;border-radius:var(--r);text-align:center"><div class="amount-label">Total Outflow</div><div class="amount-display" style="color:var(--danger)">${fmt(totalExpenses+totalRem)}</div></div>
      </div>
      <p class="card-title" style="margin-bottom:8px">Income Details</p>
      <div class="table-wrap"><table class="print-table">
        <tr><th>Date</th><th>Members Tithe</th><th>Ministers Tithe</th><th>Thanksgiving</th><th>SLO</th><th>Total</th><th>Deposited</th></tr>
        ${income.map(r=>`<tr><td>${fmtDate(r.date)}</td><td>${fmt(r.membersTithe||0)}</td><td>${fmt(r.ministersTithe||0)}</td><td>${fmt(r.thanksgiving||0)}</td><td>${fmt(r.slo||0)}</td><td class="td-bold">${fmt(r.totalCollection)}</td><td>${r.depositConfirmed?'✓ '+r.tellerNo:'Pending'}</td></tr>`).join('')}
        <tr style="font-weight:700"><td colspan="5">TOTAL</td><td>${fmt(totalIncome)}</td><td></td></tr>
      </table></div>
      <p class="card-title" style="margin:1rem 0 8px">Remittances</p>
      <div class="table-wrap"><table class="print-table">
        <tr><th>Description</th><th class="td-right">Amount Due</th></tr>
        ${rem.lines.map(l=>`<tr><td>${l.label}</td><td class="td-right">${fmt(l.national||0)}</td></tr>`).join('')}
        <tr><td>Province Rebate (${Math.round(getRemRates().provinceRebate*100)}%)</td><td class="td-right">${fmt(rem.provinceRebate)}</td></tr>
        <tr style="font-weight:700"><td>TOTAL REMITTANCES</td><td class="td-right">${fmt(rem.totalNatl+rem.totalArea+rem.provinceRebate)}</td></tr>
        <tr style="font-weight:700;color:var(--primary)"><td>NET LOCAL RETAINED</td><td class="td-right">${fmt(rem.netLocal)}</td></tr>
      </table></div>
      <p class="card-title" style="margin:1rem 0 8px">Expenses</p>
      <div class="table-wrap"><table class="print-table">
        <tr><th>Date</th><th>Category</th><th>Description</th><th>Receipt</th><th class="td-right">Amount</th></tr>
        ${expenses.map(e=>`<tr><td>${fmtDate(e.date||e.createdAt)}</td><td>${EXPENSE_CATS.find(c=>c.key===e.category)?.label||e.category}</td><td>${e.description}</td><td>${e.receiptNo||'—'}</td><td class="td-right">${fmt(e.amount)}</td></tr>`).join('')}
        <tr style="font-weight:700"><td colspan="4">TOTAL EXPENSES</td><td class="td-right">${fmt(totalExpenses)}</td></tr>
      </table></div>
      <div class="print-signature">
        <div class="print-sig-box">Prepared by (Accountant)<br><br><br>${state.user?.name}</div>
        <div class="print-sig-box">Reviewed & Approved<br>(Parish Pastor)<br><br>_________________</div>
        <div class="print-sig-box">Date<br><br><br>${fmtDate(new Date().toISOString())}</div>
      </div>
    </div>`;
  document.getElementById('reportOutput').innerHTML=html;
  document.getElementById('reportOutput').scrollIntoView({behavior:'smooth'});
}

function generateWeeklyReport(){
  const income=filterByMonth(DB.getIncome());
  document.getElementById('reportOutput').innerHTML=`
    <div class="card">
      <div class="card-header"><span class="card-title">Weekly Collection Summary — ${monthLabel()}</span><button class="btn btn-sm btn-primary no-print" onclick="window.print()">🖨 Print</button></div>
      ${income.length?`<div class="table-wrap"><table>
        <tr><th>Date</th>${INCOME_TYPES.map(t=>`<th>${t.label.split(' ').slice(0,2).join(' ')}</th>`).join('')}<th>Total</th><th>Status</th></tr>
        ${income.map(r=>`<tr><td><strong>${fmtDate(r.date)}</strong></td>${INCOME_TYPES.map(t=>`<td>${r[t.key]?fmt(r[t.key]):'—'}</td>`).join('')}<td class="td-bold td-green">${fmt(r.totalCollection)}</td><td><span class="badge ${r.depositConfirmed?'badge-success':'badge-warn'}">${r.depositConfirmed?'Deposited':'Pending'}</span></td></tr>`).join('')}
      </table></div>`:'<div class="empty-table">No collections this month.</div>'}
    </div>`;
  document.getElementById('reportOutput').scrollIntoView({behavior:'smooth'});
}

function generateRemittanceReport(){ renderRemittances(); showAlert('Remittance report displayed above.','info') }

function generateQuarterlyReport(){
  let rows='';
  for(let i=2;i>=0;i--){
    let m=state.month-i; let y=state.year; if(m<0){m+=12;y--;}
    const recs=DB.getIncome().filter(r=>{const d=new Date(r.date||r.createdAt);return d.getMonth()===m&&d.getFullYear()===y});
    const exps=DB.getExpenses().filter(r=>{const d=new Date(r.date||r.createdAt);return d.getMonth()===m&&d.getFullYear()===y});
    const total=recs.reduce((s,r)=>s+(r.totalCollection||0),0);
    const exp=exps.reduce((s,e)=>s+(e.amount||0),0);
    const rem=calcRemittancesFromRecords(recs);
    rows+=`<tr><td>${MONTHS[m]} ${y}</td><td class="td-green">${fmt(total)}</td><td class="td-red">${fmt(rem.totalNatl+rem.totalArea+rem.provinceRebate)}</td><td class="td-amber">${fmt(exp)}</td><td class="td-bold">${fmt(rem.netLocal-exp)}</td></tr>`;
  }
  document.getElementById('reportOutput').innerHTML=`
    <div class="card">
      <div class="card-header"><span class="card-title">Quarterly Health Report</span><button class="btn btn-sm btn-primary" onclick="window.print()">🖨 Print</button></div>
      <div class="table-wrap"><table>
        <tr><th>Month</th><th>Total Income</th><th>Remittances</th><th>Expenses</th><th>Net Surplus</th></tr>
        ${rows}
      </table></div>
    </div>`;
  document.getElementById('reportOutput').scrollIntoView({behavior:'smooth'});
}

function generateExpenseReport(){
  const expenses=filterByMonth(DB.getExpenses());
  const byCat={};
  EXPENSE_CATS.forEach(c=>{ byCat[c.key]={ label:c.label, icon:c.icon, total:0, count:0 } });
  expenses.forEach(e=>{ if(byCat[e.category]){ byCat[e.category].total+=e.amount||0; byCat[e.category].count++ } });
  const sorted=Object.values(byCat).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);
  document.getElementById('reportOutput').innerHTML=`
    <div class="card">
      <div class="card-header"><span class="card-title">Expense Report by Category — ${monthLabel()}</span><button class="btn btn-sm btn-primary" onclick="window.print()">🖨 Print</button></div>
      <div class="table-wrap"><table>
        <tr><th>Category</th><th>No. of Entries</th><th class="td-right">Total Spent</th></tr>
        ${sorted.map(c=>`<tr><td>${c.icon} ${c.label}</td><td>${c.count}</td><td class="td-right td-red td-bold">${fmt(c.total)}</td></tr>`).join('')}
        <tr style="border-top:2px solid var(--border)"><td class="td-bold">TOTAL</td><td class="td-bold">${sorted.reduce((s,c)=>s+c.count,0)}</td><td class="td-right td-bold">${fmt(sorted.reduce((s,c)=>s+c.total,0))}</td></tr>
      </table></div>
    </div>`;
  document.getElementById('reportOutput').scrollIntoView({behavior:'smooth'});
}

function generatePettyCashReport(){
  const petty=DB.getPetty();
  const history=filterByMonth({filter:()=>petty.history})||petty.history.filter(h=>{const d=new Date(h.createdAt||0);return d.getMonth()===state.month&&d.getFullYear()===state.year});
  document.getElementById('reportOutput').innerHTML=`
    <div class="card">
      <div class="card-header"><span class="card-title">Petty Cash Reconciliation — ${monthLabel()}</span><button class="btn btn-sm btn-primary" onclick="window.print()">🖨 Print</button></div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Current Float</div><div class="kpi-val">${fmt(petty.float)}</div></div>
        <div class="kpi"><div class="kpi-label">Max Float</div><div class="kpi-val">${fmt(petty.max)}</div></div>
        <div class="kpi"><div class="kpi-label">Disbursed (Month)</div><div class="kpi-val td-red">${fmt(history.filter(h=>h.status!=='refill').reduce((s,h)=>s+(h.amount||0),0))}</div></div>
        <div class="kpi"><div class="kpi-label">Refilled (Month)</div><div class="kpi-val td-green">${fmt(history.filter(h=>h.type==='refill').reduce((s,h)=>s+(h.amount||0),0))}</div></div>
      </div>
      <div class="table-wrap"><table>
        <tr><th>Date</th><th>Purpose</th><th>By</th><th>Status</th><th class="td-right">Amount</th><th>Receipt</th></tr>
        ${history.map(h=>`<tr><td>${fmtDate(h.createdAt)}</td><td>${h.purpose}</td><td class="td-muted">${h.requestedBy||'—'}</td><td><span class="badge ${h.status==='settled'?'badge-success':h.status==='approved'?'badge-info':h.status==='rejected'?'badge-danger':'badge-warn'}">${h.status?.replace('_',' ')||'—'}</span></td><td class="td-right td-bold">${fmt(h.amount)}</td><td>${h.receiptNo||'—'}</td></tr>`).join('')}
      </table></div>
    </div>`;
  document.getElementById('reportOutput').scrollIntoView({behavior:'smooth'});
}

// ── AUDIT LOG ─────────────────────────────
function renderAudit(){
  const log=DB.getAudit().slice(0,100);
  document.getElementById('pageContent').innerHTML=`
    <div class="page-header"><div class="page-title">Audit Log</div><div class="page-sub">Last 100 actions in the system</div></div>
    <div class="card"><div class="table-wrap"><table>
      <tr><th>Time</th><th>Action</th><th>Details</th><th>User</th></tr>
      ${log.length?log.map(l=>`<tr><td class="td-muted" style="white-space:nowrap">${fmtDate(l.ts)} ${fmtTime(l.ts)}</td><td><span class="badge badge-gray">${l.type?.replace(/_/g,' ')}</span></td><td>${l.detail}</td><td class="td-muted">${l.by||'—'}</td></tr>`).join(''):'<tr><td colspan="4" class="empty-table">No audit entries yet.</td></tr>'}
    </table></div></div>`;
}

// ── IT ADMIN ──────────────────────────────
function renderAdmin(){
  if(state.user?.role!=='it_admin'){ document.getElementById('pageContent').innerHTML='<div class="card"><p style="color:var(--danger)">Access denied. IT Administrators only.</p></div>'; return }
  const users=DB.getUsers();
  const settings=DB.getSettings();
  const tab=state.adminTab||'users';

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header"><div class="page-title">IT Admin Panel</div><div class="page-sub">System management — full access</div></div>
    <div class="admin-grid" style="margin-bottom:1rem">
      <div class="admin-stat"><div class="admin-stat-val">${users.length}</div><div class="admin-stat-label">Total Users</div></div>
      <div class="admin-stat"><div class="admin-stat-val">${DB.getIncome().length}</div><div class="admin-stat-label">Income Records</div></div>
      <div class="admin-stat"><div class="admin-stat-val">${DB.getAudit().length}</div><div class="admin-stat-label">Audit Events</div></div>
    </div>
    <div class="tabs">
      <button class="tab ${tab==='users'?'active':''}" onclick="App.setAdminTab('users')">Users & Roles</button>
      <button class="tab ${tab==='settings'?'active':''}" onclick="App.setAdminTab('settings')">Church Settings</button>
      <button class="tab ${tab==='quotas'?'active':''}" onclick="App.setAdminTab('quotas')">Monthly Quotas</button>
      <button class="tab ${tab==='rates'?'active':''}" onclick="App.setAdminTab('rates')">Remittance Rates</button>
      <button class="tab ${tab==='backup'?'active':''}" onclick="App.setAdminTab('backup')">Backup & Restore</button>
    </div>
    ${tab==='users'?renderAdminUsers(users):tab==='settings'?renderAdminSettings(settings):tab==='quotas'?renderAdminQuotas(settings):tab==='rates'?renderAdminRates(settings):renderAdminBackup()}`;
}

function setAdminTab(t){ state.adminTab=t; renderAdmin() }

function renderAdminUsers(users){
  return `<div class="card">
    <div class="card-header"><span class="card-title">User Accounts</span><button class="btn btn-primary btn-sm" onclick="App.showAddUser()">+ Add User</button></div>
    <div class="table-wrap"><table>
      <tr><th>Name</th><th>Role</th><th>Email</th><th>PIN</th><th>Actions</th></tr>
      ${users.map(u=>{const r=ROLES[u.role]||{}; return`<tr>
        <td><strong>${u.name}</strong></td>
        <td><span class="badge" style="background:${r.bg};color:${r.color}">${r.label||u.role}</span></td>
        <td class="td-muted">${u.email||'—'}</td>
        <td class="td-muted">••••</td>
        <td><button class="btn btn-sm" onclick="App.editUser('${u.id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="App.deleteUser('${u.id}')" style="margin-left:4px">Delete</button></td>
      </tr>`}).join('')}
    </table></div></div>`;
}

function renderAdminSettings(s){
  return `<div class="card">
    <div class="modal-title" style="font-size:15px;margin-bottom:1rem">Church Information</div>
    <div class="form-group"><label class="form-label">Church Name</label><input type="text" id="set_name" class="form-input" value="${s.churchName||''}" /></div>
    <div class="form-group"><label class="form-label">Bank Name</label><input type="text" id="set_bank" class="form-input" value="${s.bankName||''}" /></div>
    <div class="form-group"><label class="form-label">Account Number</label><input type="text" id="set_acct" class="form-input" value="${s.accountNo||''}" /></div>
    <div class="form-group"><label class="form-label">Petty Cash Max Float (₦)</label><input type="number" id="set_petty" class="form-input" value="${s.pettyMax||50000}" /></div>
    <button class="btn btn-primary" onclick="App.saveSettings()">Save Settings</button>
  </div>`;
}

function renderAdminQuotas(s){
  const q=s.quotas||DEFAULT_QUOTAS;
  return `<div class="card">
    <div class="modal-title" style="font-size:15px;margin-bottom:8px">Monthly Fixed Quotas</div>
    <p style="font-size:12px;color:var(--text3);margin-bottom:1rem">These flat amounts are remitted monthly regardless of income fluctuations.</p>
    ${Object.entries(q).map(([k,v])=>`<div class="form-group"><label class="form-label">${k.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}</label><input type="number" id="q_${k}" class="form-input" value="${v}" /></div>`).join('')}
    <button class="btn btn-primary" onclick="App.saveQuotas()">Save Quotas</button>
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
      <tr><td>TG → Pastor's Share</td><td>${rateInput('rate_tgPastor', r.tgPastor ?? DEFAULT_REMITTANCE_RATES.tgPastor)}</td></tr>
      <tr><td>TG → Ministers' Share</td><td>${rateInput('rate_tgMinisters', r.tgMinisters ?? DEFAULT_REMITTANCE_RATES.tgMinisters)}</td></tr>
      <tr><td>TG → Seed (Carried Forward)</td><td>${rateInput('rate_tgSeed', r.tgSeed ?? DEFAULT_REMITTANCE_RATES.tgSeed)}</td></tr>
    </table></div>
    <hr class="divider">
    <div class="form-row" style="align-items:center;gap:12px">
      <label class="form-label" style="margin:0;flex:1">Province Rebate (% of local):</label>
      ${rateInput('rate_provinceRebate', r.provinceRebate ?? DEFAULT_REMITTANCE_RATES.provinceRebate)}
    </div>
    <br>
    <button class="btn btn-primary" onclick="App.saveRates()">Save Remittance Rates</button>
  </div>`;
}

function saveRates(){
  const s = DB.getSettings();
  const r = s.remittanceRates || {};
  const pct2dec = id => { const el=document.getElementById(id); return el ? parseFloat(el.value||0)/100 : null; };
  INCOME_TYPES.filter(t=>!t.special).forEach(t=>{
    if(!r[t.key]) r[t.key]={};
    const natl = pct2dec(`rate_${t.key}_natl`);
    const local = pct2dec(`rate_${t.key}_local`);
    if(natl!==null) r[t.key].natl = natl;
    if(local!==null) r[t.key].local = local;
  });
  ['tgNational','tgArea','tgPastor','tgMinisters','tgSeed','provinceRebate'].forEach(k=>{
    const v = pct2dec(`rate_${k}`);
    if(v!==null) r[k] = v;
  });
  s.remittanceRates = r;
  DB.saveSettings(s);
  showAlert('Remittance rates updated successfully!','success');
}

function renderAdminBackup(){
  return `<div class="card">
    <div class="card-header"><span class="card-title">Data Backup & Restore</span></div>
    <p style="font-size:13px;color:var(--text2);margin-bottom:1rem">Export all church financial data as a JSON backup file. Store it securely.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="App.exportData()">⬇ Export Backup</button>
      <button class="btn" onclick="App.importData()">⬆ Import / Restore</button>
      <button class="btn btn-danger" onclick="App.clearAllData()">🗑 Clear All Data</button>
    </div>
    <hr class="divider">
    <div class="alert alert-warn"><span class="alert-icon">⚠</span><span>Clearing data is irreversible. Always export a backup first.</span></div>
  </div>`;
}

function saveSettings(){
  const s=DB.getSettings();
  s.churchName=document.getElementById('set_name')?.value;
  s.bankName=document.getElementById('set_bank')?.value;
  s.accountNo=document.getElementById('set_acct')?.value;
  s.pettyMax=parseFloat(document.getElementById('set_petty')?.value)||50000;
  DB.saveSettings(s);
  showAlert('Settings saved!','success');
}

function saveQuotas(){
  const s=DB.getSettings();
  const q=s.quotas||{};
  Object.keys(DEFAULT_QUOTAS).forEach(k=>{ const el=document.getElementById('q_'+k); if(el) q[k]=parseFloat(el.value)||0 });
  s.quotas=q; DB.saveSettings(s);
  showAlert('Monthly quotas updated!','success');
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
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.addUser()">Add User</button></div>`);
}

function addUser(){
  const name=document.getElementById('nu_name')?.value?.trim();
  const role=document.getElementById('nu_role')?.value;
  const email=document.getElementById('nu_email')?.value;
  const pin=document.getElementById('nu_pin')?.value;
  if(!name||!role||!pin||pin.length<4){ alert('Please fill name, role, and PIN (min 4 digits).'); return }
  const users=DB.getUsers();
  users.push({ id:'u'+Date.now(), name, role, email, pin });
  DB.save(DB.KEYS.users, users);
  DB.addAudit('user_added',`New user added: ${name} (${role})`,state.user?.name);
  closeModal();
  showAlert(`User ${name} added successfully!`,'success');
  renderAdmin();
}

function editUser(id){
  const users=DB.getUsers();
  const u=users.find(x=>x.id===id);
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
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.updateUser('${id}')">Update</button></div>`);
}

function updateUser(id){
  const users=DB.getUsers();
  const idx=users.findIndex(u=>u.id===id);
  if(idx<0) return;
  users[idx].name=document.getElementById('eu_name')?.value||users[idx].name;
  users[idx].role=document.getElementById('eu_role')?.value||users[idx].role;
  users[idx].email=document.getElementById('eu_email')?.value||users[idx].email;
  const newPin=document.getElementById('eu_pin')?.value;
  if(newPin&&newPin.length>=4) users[idx].pin=newPin;
  DB.save(DB.KEYS.users, users);
  DB.addAudit('user_updated',`User updated: ${users[idx].name}`,state.user?.name);
  closeModal();
  showAlert('User updated!','success');
  renderAdmin();
}

function deleteUser(id){
  const users=DB.getUsers();
  const u=users.find(x=>x.id===id);
  if(!u||!confirm(`Delete user "${u.name}"? This cannot be undone.`)) return;
  DB.save(DB.KEYS.users, users.filter(x=>x.id!==id));
  DB.addAudit('user_deleted',`User deleted: ${u.name}`,state.user?.name);
  showAlert('User deleted.','warn');
  renderAdmin();
}

function exportData(){
  const data={ users:DB.getUsers(), income:DB.getIncome(), remittances:DB.getRemittances(), expenses:DB.getExpenses(), petty:DB.getPetty(), audit:DB.getAudit(), settings:DB.getSettings(), cashTransactions:DB.getCashTransactions(), exportedAt:new Date().toISOString(), exportedBy:state.user?.name };
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`rccg-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click(); URL.revokeObjectURL(a.href);
  DB.addAudit('data_exported','Full data export performed',state.user?.name);
  showAlert('Backup exported successfully!','success');
}

function importData(){
  const input=document.createElement('input'); input.type='file'; input.accept='.json';
  input.onchange=e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const data=JSON.parse(ev.target.result);
        if(!confirm('This will overwrite all existing data. Are you sure?')) return;
        if(data.users) DB.save(DB.KEYS.users,data.users);
        if(data.income) DB.save(DB.KEYS.income,data.income);
        if(data.remittances) DB.save(DB.KEYS.remittances,data.remittances);
        if(data.expenses) DB.save(DB.KEYS.expenses,data.expenses);
        if(data.petty) DB.save(DB.KEYS.petty,data.petty);
        if(data.settings) DB.save(DB.KEYS.settings,data.settings);
        if(data.cashTransactions) DB.save(DB.KEYS.cashTx,data.cashTransactions);
        DB.addAudit('data_imported','Data restored from backup',state.user?.name);
        showAlert('Data restored successfully! Please refresh.','success');
      }catch(e){ alert('Invalid backup file. Please use a valid JSON backup.') }
    };
    reader.readAsText(file);
  };
  input.click();
}

function clearAllData(){
  if(!confirm('⚠ This will permanently delete ALL church financial records. Type CONFIRM to proceed.')) return;
  const word=prompt('Type CONFIRM to delete everything:');
  if(word!=='CONFIRM'){ alert('Cancelled.'); return }
  Object.values(DB.KEYS).forEach(k=>localStorage.removeItem(k));
  logout();
}

// ── KPSC ALERT ────────────────────────────
function showKPSCAlert(){
  const income=filterByMonth(DB.getIncome());
  const totalIncome=income.reduce((s,r)=>s+(r.totalCollection||0),0);
  const rem=calcRemittancesFromRecords(income);
  const expenses=filterByMonth(DB.getExpenses());
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
// 8. PUBLIC API
// ──────────────────────────────────────────
return {
  onRoleChange, login, logout, navigate, toggleSidebar, toggleNotifications,
  onMonthChange, setIncomeTab, showIncomeForm, updateIncomeTotal, updateIncomeCashBreakdown, submitIncome,
  showOtherIncomeForm, submitOtherIncome,
  viewIncome, confirmDeposit, submitCashDeposit, confirmBulkDeposit, submitBulkDeposit, markRemittancePaid, setRemAmt, submitRemittance,
  updateExpenseSubcats, updateExpenseDescRequired,
  showExpenseForm, submitExpense, viewExpenseReceipt,
  showBankWithdrawal, submitBankWithdrawal,
  renderPettyCash, showPettyRequest, submitPettyRequest,
  approvePetty, rejectPetty, submitPettyReceipt, showPettyRefill, submitRefill,
  generateMonthlyReport, generateWeeklyReport, generateRemittanceReport,
  generateQuarterlyReport, generateExpenseReport, generatePettyCashReport,
  setAdminTab, saveSettings, saveQuotas, saveRates, showAddUser, addUser, editUser,
  updateUser, deleteUser, exportData, importData, clearAllData,
  showKPSCAlert, submitKPSCAlert, closeModal: closeModal
};

})();

// Global helpers
function closeModal(){ const o=document.getElementById('modalOverlay'); if(o) o.remove() }
