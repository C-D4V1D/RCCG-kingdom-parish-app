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
  { id:'bank',         label:'Bank',          icon:'🏦', section:'Finance',  minRole:['it_admin','accountant','signatory'] },
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
  getUsers()                   { return apiFetch('users'); },
  addUser(d)                   { return apiFetch('users','POST',d); },
  updateUser(id,d)             { return apiFetch(`users/${id}`,'PUT',d); },
  deleteUser(id)               { return apiFetch(`users/${id}`,'DELETE'); },

  getIncome()                  { return apiFetch('income'); },
  addIncome(d)                 { return apiFetch('income','POST',d); },
  updateIncome(id,d)           { return apiFetch(`income/${id}`,'PUT',d); },

  getExpenses()                { return apiFetch('expenses'); },
  addExpense(d)                { return apiFetch('expenses','POST',d); },

  getPetty()                   { return apiFetch('petty'); },
  getPettyConfig()             { return apiFetch('petty-config'); },
  savePettyConfig(d)           { return apiFetch('petty-config','POST',d); },
  addPettyEntry(d)             { return apiFetch('petty','POST',d); },
  updatePettyEntry(id,d)       { return apiFetch(`petty/${id}`,'PUT',d); },

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
    apiFetch('notifications/read','POST').catch(()=>{});
  },
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

function filterByDateRange(arr, fromDate, toDate){
  return (arr||[]).filter(r=>{
    const d = new Date(r.date||r.createdAt||0).toISOString().split('T')[0];
    return d >= fromDate && d <= toDate;
  });
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
  const allUsers = await DB.getUsers();
  const users = allUsers.filter(u=>u.role===role);
  if(users.length>1){
    wrap.style.display='block';
    sel.innerHTML = users.map(u=>`<option value="${u.id}">${u.name}</option>`).join('');
  } else { wrap.style.display='none' }
}

async function login(){
  const role = document.getElementById('roleSelect').value;
  const pin = document.getElementById('pinInput').value.trim();
  const errEl = document.getElementById('loginError');
  if(!role||!pin){ errEl.textContent='Please select a role and enter your PIN.'; errEl.style.display='block'; return }
  const btn = document.querySelector('#loginScreen .btn-primary');
  if(btn){ btn.textContent='Connecting…'; btn.disabled=true; }
  try {
    await apiFetch('init'); // creates tables + seeds users if first run
    const allUsers = await DB.getUsers();
    const users = allUsers.filter(u=>u.role===role);
    let user = null;
    if(users.length>1){
      const uid = document.getElementById('userSelect').value;
      user = users.find(u=>u.id===uid && String(u.pin)===String(pin));
    } else {
      user = users.find(u=>String(u.pin)===String(pin));
    }
    if(!user){
      errEl.textContent='Incorrect PIN. Please try again.';
      errEl.style.display='block';
      document.getElementById('pinInput').value='';
      if(btn){ btn.textContent='Sign In'; btn.disabled=false; }
      return;
    }
    errEl.style.display='none';
    state.user = user;
    DB.addAudit('login','User logged in',user.name);
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('appShell').style.display='flex';
    initApp();
  } catch(e) {
    errEl.textContent='Cannot connect to database: '+e.message;
    errEl.style.display='block';
    if(btn){ btn.textContent='Sign In'; btn.disabled=false; }
  }
}

function logout(){
  DB.addAudit('logout','User logged out', state.user?.name);
  state.user=null; state.page='dashboard';
  history.replaceState(null,'','/');
  document.getElementById('appShell').style.display='none';
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('roleSelect').value='';
  document.getElementById('pinInput').value='';
  document.getElementById('userSelectWrap').style.display='none';
}

// ──────────────────────────────────────────
// 6. NAVIGATION & ROUTER
// ──────────────────────────────────────────
const VALID_PAGES = ['dashboard','income','remittances','expenses','bank','petty_cash','reports','audit','admin'];

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
    if(!item.minRole.includes('all') && !item.minRole.includes(state.user?.role)) return;
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

function navigate(page, fromHistory){
  state.page=page;
  // Update URL — push new entry unless this was triggered by the browser's own back/forward
  const newPath = '/' + (page === 'dashboard' ? '' : page);
  if(!fromHistory && window.location.pathname !== newPath){
    history.pushState({page}, '', newPath);
  }
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  document.querySelectorAll('.bn-item').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  const titles={dashboard:'Dashboard',income:'Record Income',remittances:'Remittances',
    expenses:'Expenses',bank:'Bank',petty_cash:'Petty Cash',reports:'Reports',audit:'Audit Log',admin:'IT Admin Panel'};
  document.getElementById('topBarTitle').textContent=titles[page]||page;
  const pc=document.getElementById('pageContent');
  pc.innerHTML='<div style="padding:40px;text-align:center;color:var(--text3)">Loading...</div>';
  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
  // Close notifications
  document.getElementById('notifPanel').style.display='none';
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
    else{ list.innerHTML=notifs.slice(0,15).map(n=>`<div class="notif-item" style="opacity:${n.read?0.6:1}"><div class="notif-item-title">${n.title}</div><div class="notif-item-body">${n.body}</div><div class="notif-item-time">${fmtDate(n.ts)} ${fmtTime(n.ts)}</div></div>`).join('') }
    DB.markAllRead();
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
  const pages={dashboard:renderDashboard,income:renderIncome,remittances:renderRemittances,
    expenses:renderExpenses,bank:renderBank,petty_cash:renderPettyCash,reports:renderReports,
    audit:renderAudit,admin:renderAdmin};
  try{
    if(pages[page]) await pages[page]();
    else document.getElementById('pageContent').innerHTML='<div class="card"><p>Page not found.</p></div>';
  }catch(e){
    document.getElementById('pageContent').innerHTML=`<div class="card"><div class="alert alert-danger"><span class="alert-icon">✕</span><span>Error loading page: ${e.message}</span></div></div>`;
    console.error('renderPage error:',e);
  }
}

// ── DASHBOARD ────────────────────────────
async function calcChurchBalance(){
  const [allIncome,allExpenses,allRemittances,cashTx,pettyHistory,pettyConfig] = await Promise.all([DB.getIncome(),DB.getExpenses(),DB.getRemittances(),DB.getCashTransactions(),DB.getPetty(),DB.getPettyConfig()]);
  const petty = { history: pettyHistory, float: pettyConfig.float, max: pettyConfig.max };

  // --- BANK BALANCE ---
  // 1. Income already in bank (bank-transfer portions of all income records)
  const bankTransferIncome = allIncome.reduce((s,r) => s + (r.bankTransferAmount||0), 0);
  // 2. Cash deposited by accountant to bank
  const cashDepositedToBank = cashTx.filter(t=>t.type==='cash_deposit').reduce((s,t) => s+(t.amount||0), 0);
  // Outflows from bank: bank_transfer expenses + bank portion of split expenses
  const bankExpenses = allExpenses.reduce((s,e)=>{
    if(e.paymentMethod==='bank_transfer') return s+(e.amount||0);
    if(e.paymentMethod==='split') return s+(e.bankAmount||0);
    return s;
  }, 0);
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
  // Expenses paid from accountant's cash (cash portion only)
  const cashExpenses = allExpenses.reduce((s,e)=>{
    if(e.paymentMethod==='cash') return s+(e.amount||0);
    if(e.paymentMethod==='split') return s+(e.cashAmount||0);
    return s;
  }, 0);
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

async function renderDashboard(){
  const [allIncomeDash,allExpensesDash,pettyHistDash,settingsDash,allRemsDash,pettyConfigDash] = await Promise.all([DB.getIncome(),DB.getExpenses(),DB.getPetty(),DB.getSettings(),DB.getRemittances(),DB.getPettyConfig()]);
  const income = filterByMonth(allIncomeDash);
  const expenses = filterByMonth(allExpensesDash);
  const petty = { history: pettyHistDash, float: pettyConfigDash.float, max: pettyConfigDash.max };
  const settings = settingsDash;
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
  const churchBal = await calcChurchBalance();
  const pendingPetty = await getPettyCashPendingCount();
  const overdueRems = allRemsDash.filter(r=>r.status==='overdue').length;

  // Feed items — richer detail for Recent Transactions card
  const recentIncome = allIncome.slice(0,4);
  const recentExp = allExpenses.slice(0,4);
  const recentRems = allRemsDash.filter(r=>r.status==='paid').slice(0,3);
  const recentPetty = pettyHistDash.filter(h=>h.type==='disbursement'&&h.status==='approved').slice(0,2);
  const feedItems = [
    ...recentIncome.map(r=>{
      const deposited = r.depositConfirmed;
      return {type:'income',date:r.date,
        title: deposited ? 'Sunday collections deposited' : 'Sunday collections collected (cash)',
        sub: `${fmtDate(r.date)} · ${deposited?'Deposited by Accountant':'Cash held by Accountant'}`,
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
      amt:r.amount, icon:'✓', color:'#534AB7', bg:'rgba(83,74,183,0.12)'}))
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
  if(churchBal.bankBalance<50000 && churchBal.bankBalance>0) alerts+=`<div class="alert alert-warn"><span class="alert-icon">💰</span><span>Bank balance is running low. Consider notifying the KPSC if remittances cannot be covered.</span></div>`;

  // Monthly trend (last 4 months) — income AND expenses
  const trendData = [];
  for(let i=3;i>=0;i--){
    let m=state.month-i; let y=state.year;
    if(m<0){m+=12;y--;}
    const mIncome=(allIncomeDash).filter(r=>{const d=new Date(r.date||r.createdAt);return d.getMonth()===m&&d.getFullYear()===y});
    const mExpenses=(allExpensesDash).filter(r=>{const d=new Date(r.date||r.createdAt);return d.getMonth()===m&&d.getFullYear()===y});
    trendData.push({label:MONTHS[m].slice(0,3),income:mIncome.reduce((s,r)=>s+(r.totalCollection||0),0),expenses:mExpenses.reduce((s,r)=>s+(r.amount||0),0)});
  }
  const maxTrend=Math.max(...trendData.map(t=>Math.max(t.income,t.expenses)),1);

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Welcome, ${state.user?.name?.split(' ')[0]||'User'} 👋</div><div class="page-sub">${monthLabel()} Financial Overview</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${can('income')?`<button class="btn btn-primary" onclick="App.navigate('income')">📥 Record Income</button>`:''}
        ${!can('income')&&can('expenses')?`<button class="btn btn-primary" onclick="App.navigate('expenses')">💸 Log Expenses</button>`:''}
      </div>
    </div>

    ${alerts}

    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-icon" style="background:#E1F5EE">📥</div>
        <div class="kpi-label">Total Income (${MONTHS[state.month].slice(0,3)})</div>
        <div class="kpi-val">${fmt(totalIncome)}</div>
        <div class="kpi-delta up">↑ ${income.length} record(s) this month</div>
      </div>
      <div class="kpi">
        <div class="kpi-icon" style="background:#FCEBEB">📤</div>
        <div class="kpi-label">RCCG Remittances Due</div>
        <div class="kpi-val">${fmt(remittances.totalNatl+dashNatlQuotasAmt+dashRegionalAmt+remittances.provinceRebate+(remittances.totalPastor||0)+(remittances.totalSeed||0)+(remittances.totalArea||0)+dashMummyAmt+(remittances.totalMinisters||0))}</div>
        <div class="kpi-delta warn">↑ ${totalIncome?Math.round((remittances.totalNatl+dashNatlQuotasAmt+dashRegionalAmt+remittances.provinceRebate+(remittances.totalPastor||0)+(remittances.totalSeed||0)+(remittances.totalArea||0)+dashMummyAmt+(remittances.totalMinisters||0))/totalIncome*100):0}% of income</div>
      </div>
      <div class="kpi">
        <div class="kpi-icon" style="background:#E1F5EE">🏦</div>
        <div class="kpi-label">Local Retained Funds</div>
        <div class="kpi-val">${fmt(netLocal)}</div>
        <div class="kpi-delta up">After all remittances</div>
      </div>
      <div class="kpi kpi-balance" style="grid-column:span 1">
        <div class="kpi-icon" style="background:#EAF3DE">🏛️</div>
        <div class="kpi-label">Total Church Balance</div>
        <div class="kpi-val" style="color:${churchBal.total<0?'var(--danger)':'var(--primary)'}">${fmt(churchBal.total)}</div>
        <div style="margin-top:6px;font-size:11px;color:var(--text3);line-height:1.6">
          <a onclick="App.navigate('bank')" style="cursor:pointer;text-decoration:none;color:inherit;display:block"><span style="display:inline-block;width:8px;height:8px;background:#185FA5;border-radius:50%;margin-right:4px"></span>Bank: ${fmt(churchBal.bankBalance)}</a>
          <a onclick="App.setIncomeTab('all');App.navigate('income')" style="cursor:pointer;text-decoration:none;color:inherit;display:block"><span style="display:inline-block;width:8px;height:8px;background:#BA7517;border-radius:50%;margin-right:4px"></span>Cash with Accountant (undeposited): ${fmt(churchBal.cashWithAccountant)}</a>
          <a onclick="App.navigate('petty_cash')" style="cursor:pointer;text-decoration:none;color:inherit;display:block"><span style="display:inline-block;width:8px;height:8px;background:#1D9E75;border-radius:50%;margin-right:4px"></span>Petty Cash (Admin Officer): ${fmt(churchBal.pettyFloat)}</a>
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
          <div class="card-header"><span class="card-title">RECENT TRANSACTIONS</span><button class="btn btn-sm" onclick="App.navigate('income')">See all ↗</button></div>
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
            <span><span style="display:inline-block;width:10px;height:10px;background:var(--danger);border-radius:2px;margin-right:4px"></span>Expenses</span>
          </div>
          <div style="display:flex;align-items:flex-end;gap:12px;height:130px;padding:8px 0">
            ${trendData.map(t=>`
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
                <div style="display:flex;gap:3px;align-items:flex-end;width:100%;justify-content:center;height:100px">
                  <div style="width:45%;display:flex;flex-direction:column;align-items:center">
                    <div style="font-size:9px;color:var(--text3);margin-bottom:2px;white-space:nowrap">${t.income?fmtShort(t.income).replace('₦',''):'—'}</div>
                    <div style="width:100%;background:var(--primary);border-radius:4px 4px 0 0;height:${Math.max(4,Math.round((t.income/maxTrend)*72)+4)}px;transition:height 0.4s"></div>
                  </div>
                  <div style="width:45%;display:flex;flex-direction:column;align-items:center">
                    <div style="font-size:9px;color:var(--text3);margin-bottom:2px;white-space:nowrap">${t.expenses?fmtShort(t.expenses).replace('₦',''):'—'}</div>
                    <div style="width:100%;background:var(--danger);border-radius:4px 4px 0 0;height:${Math.max(4,Math.round((t.expenses/maxTrend)*72)+4)}px;transition:height 0.4s"></div>
                  </div>
                </div>
                <div style="font-size:11px;color:var(--text2)">${t.label}</div>
              </div>`).join('')}
          </div>
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
  const allIncomeRecs = await DB.getIncome();
  const records = filterByMonth(allIncomeRecs);
  const sundayRecs = records.filter(r=>!r.source||r.source==='sunday_collection');
  const otherRecs  = records.filter(r=>r.source && r.source!=='sunday_collection');
  const tab = state.incomeTab||'list';
  // Compute pending records (cash not yet fully deposited) across ALL income types
  const _cashTx = await DB.getCashTransactions();
  const pendingItems = records.map(r=>{
    const isSunday = !r.source||r.source==='sunday_collection';
    const cashHeld = isSunday
      ? Math.max(0,(r.totalCollection||0)-(r.bankTransferAmount||0)-(r.directPettyCash||0))
      : r.paymentMethod==='cash' ? (r.totalCollection||0) : 0;
    const dep = _cashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
    return { cashHeld, dep };
  }).filter(p=>p.cashHeld>0 && p.dep<p.cashHeld);
  const pendingCount = pendingItems.length;
  const pendingCashTotal = pendingItems.reduce((s,p)=>s+(p.cashHeld-p.dep),0);
  const totalCollected = records.reduce((s,r)=>s+(r.totalCollection||0),0);
  // Only count deposits linked to this month's income records (scoped correctly to the month view)
  const currentMonthRecordIds = new Set(records.map(r=>r.id));
  const totalDeposited = _cashTx.filter(t=>t.type==='cash_deposit'&&currentMonthRecordIds.has(t.incomeRef)).reduce((s,t)=>s+(t.amount||0),0)
    + records.reduce((s,r)=>s+(r.bankTransferAmount||0),0);

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Income Recording</div><div class="page-sub">${monthLabel()}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${can('income')?`<button class="btn btn-primary" onclick="App.showIncomeForm()">📥 Sunday Collections</button>`:''}
        ${can('income')?`<button class="btn btn-amber" onclick="App.showOtherIncomeForm()">➕ Other Income</button>`:''}
        ${can('income')&&pendingCount>=1?`<button class="btn btn-amber" onclick="App.confirmBulkDeposit()">💰 Deposit Cash (${pendingCount} pending)</button>`:''}
      </div>
    </div>
    <div class="kpi-grid" style="margin-bottom:16px">
      <div class="kpi"><div class="kpi-icon" style="background:#E1F5EE">📥</div><div class="kpi-label">Total Collected</div><div class="kpi-val">${fmt(totalCollected)}</div><div class="kpi-delta up">${records.length} record(s)</div></div>
      <div class="kpi"><div class="kpi-icon" style="background:#FAEEDA">💵</div><div class="kpi-label">Cash Pending Deposit</div><div class="kpi-val" style="color:${pendingCashTotal>0?'var(--amber)':'var(--primary)'}">${fmt(pendingCashTotal)}</div><div class="kpi-delta ${pendingCashTotal>0?'warn':'up'}">${pendingCount>0?pendingCount+' record(s) awaiting deposit':'All cash deposited ✓'}</div></div>
      <div class="kpi"><div class="kpi-icon" style="background:#EAF3DE">🏦</div><div class="kpi-label">In Bank (this month)</div><div class="kpi-val">${fmt(totalDeposited)}</div><div class="kpi-delta up">Transfers + deposits</div></div>
    </div>
    ${pendingCount>0&&can('income')?`<div class="alert alert-warn" style="margin-bottom:12px"><span class="alert-icon">⚠</span><span><strong>${pendingCount} cash record(s)</strong> totalling <strong>${fmt(pendingCashTotal)}</strong> still held by accountant and not yet deposited to the bank. <button class="btn btn-sm btn-amber" onclick="App.confirmBulkDeposit()" style="margin-left:8px">Record Deposit Now</button></span></div>`:''}
    <div class="tabs">
      <button class="tab ${tab==='list'?'active':''}" onclick="App.setIncomeTab('list')">Sunday Collections (${sundayRecs.length})</button>
      <button class="tab ${tab==='other'?'active':''}" onclick="App.setIncomeTab('other')">Other Income (${otherRecs.length})</button>
      <button class="tab ${tab==='summary'?'active':''}" onclick="App.setIncomeTab('summary')">Monthly Summary</button>
      <button class="tab ${tab==='all'?'active':''}" onclick="App.setIncomeTab('all')">All Records</button>
    </div>
    ${await (tab==='list'?renderIncomeList(sundayRecs):tab==='other'?renderOtherIncomeList(otherRecs):tab==='summary'?renderIncomeSummary(records):renderAllIncomeList(allIncomeRecs, _cashTx))}`;
}

function setIncomeTab(t){ state.incomeTab=t; renderIncome() }

async function renderIncomeList(records, cashTxOverride){
  if(!records.length) return '<div class="card"><div class="empty-table">No Sunday collection records found for this month. Click "📥 Sunday Collections" above to add one.</div></div>';
  const allCashTxList = cashTxOverride || await DB.getCashTransactions();
  return `<div class="card"><div class="table-wrap"><table>
    <tr><th>Date</th><th>Total Collection</th><th>Cash (Accountant)</th><th>Bank Transfer</th><th>Direct → Petty</th><th>Cash Status</th><th>Recorded By</th><th>Actions</th></tr>
    ${records.map(r=>{
      const btAmt = r.bankTransferAmount||0;
      const dpAmt = r.directPettyCash||0;
      const cashHeld = Math.max(0,(r.totalCollection||0) - btAmt - dpAmt);
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
        <td><strong>${fmtDate(r.date)}</strong>${r.notes?`<div class="td-muted">${r.notes}</div>`:''}</td>
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

async function renderOtherIncomeList(records){
  if(!records.length) return '<div class="card"><div class="empty-table">No other income records found for this month. Click "➕ Other Income" above to add one.</div></div>';
  const allCashTxList = await DB.getCashTransactions();
  return `<div class="card"><div class="table-wrap"><table>
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
        ${rem.lines.length?rem.lines.map(l=>`
          <div class="status-row">
            <div><div class="status-row-label">${l.label} → HQ</div><div class="status-row-sub">From ${fmt(l.total)}</div></div>
            <div class="status-row-amt td-red">${fmt(l.national||0)}</div>
          </div>`).join(''):'<div class="empty-table">No Sunday collections recorded yet.</div>'}
        ${rem.lines.length?`
        <div class="status-row" style="background:var(--amber-light);border-radius:var(--r);padding:8px 10px;border:none;margin-top:4px">
          <div class="status-row-label">Province Rebate (20%)</div><div class="status-row-amt td-amber">${fmt(rem.provinceRebate)}</div>
        </div>
        <div class="status-row" style="border-top:2px solid var(--border);margin-top:4px"><div class="status-row-label fw-bold">Net Local Retained</div><div class="status-row-amt" style="color:var(--primary);font-size:16px">${fmt(rem.netLocal)}</div></div>`:''}
      </div>
    </div>`;
}

async function renderAllIncomeList(records, cashTxOverride){
  if(!records.length) return '<div class="card"><div class="empty-table">No income records found across all months.</div></div>';
  const allCashTxList = cashTxOverride || await DB.getCashTransactions();
  const sorted = [...records].sort((a,b)=> new Date(b.date||b.createdAt||0) - new Date(a.date||a.createdAt||0));
  return `<div class="card"><div class="table-wrap"><table>
    <tr><th>Date</th><th>Source / Type</th><th>Amount</th><th>Cash (Accountant)</th><th>Bank Transfer</th><th>Cash Status</th><th>Recorded By</th><th>Actions</th></tr>
    ${sorted.map(r=>{
      const isSunday = !r.source||r.source==='sunday_collection';
      const btAmt = r.bankTransferAmount||0;
      const dpAmt = r.directPettyCash||0;
      const cashHeld = isSunday
        ? Math.max(0,(r.totalCollection||0) - btAmt - dpAmt)
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
        <td><strong>${fmtDate(r.date)}</strong>${r.notes?`<div class="td-muted">${r.notes}</div>`:''}</td>
        <td><span class="badge badge-gray" style="font-size:11px">${srcLabel}</span>${r.donorName?`<div class="td-muted">${r.donorName}</div>`:''}</td>
        <td class="td-green td-bold">${fmt(r.totalCollection)}</td>
        <td class="td-muted">${cashHeld>0?fmt(cashHeld):'—'}</td>
        <td class="td-muted">${btAmt>0?fmt(btAmt):'—'}</td>
        <td>${statusBadge}</td>
        <td class="td-muted">${r.recordedBy||'—'}</td>
        <td><button class="btn btn-sm" onclick="App.viewIncome('${r.id}')">View</button>
        ${can('income')&&cashHeld>0&&!isFullyDeposited?`<button class="btn btn-sm btn-primary" onclick="App.confirmDeposit('${r.id}')" style="margin-left:4px">Record Deposit</button>`:''}</td>
      </tr>`;}).join('')}
  </table></div></div>`;
}

function showIncomeForm(){
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
    <p style="font-size:11px;color:var(--text3);margin-bottom:12px">If part of the total was paid directly to the bank or given to the Admin Officer, record those portions below. The rest is cash held by the accountant awaiting deposit.</p>
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
      </div>
      <div id="inc_overalloc_warn" style="display:none;color:var(--danger);font-size:12px;margin-top:4px;font-weight:600">⚠ Bank transfer + petty cash amount exceeds the total collection. Please check the figures.</div>
    </div>
    <div class="form-group mt-2"><label class="form-label">Notes (optional)</label><textarea id="inc_notes" class="form-textarea" placeholder="e.g. Special thanksgiving offering, harvest Sunday, etc."></textarea></div>
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
  const overalloc = bt + dp > total && total > 0;
  const cash = Math.max(0, total - bt - dp);
  const cashEl = document.getElementById('inc_cash_held');
  const btEl   = document.getElementById('inc_bank_lbl');
  const dpEl   = document.getElementById('inc_petty_lbl');
  const warnEl = document.getElementById('inc_overalloc_warn');
  if(cashEl) cashEl.textContent = fmt(cash);
  if(btEl)   btEl.textContent   = fmt(bt);
  if(dpEl)   dpEl.textContent   = fmt(dp);
  if(warnEl) warnEl.style.display = overalloc ? 'block' : 'none';
  const btInput = document.getElementById('inc_bank_transfer');
  const dpInput = document.getElementById('inc_direct_petty');
  if(btInput) btInput.style.borderColor = overalloc ? 'var(--danger)' : '';
  if(dpInput) dpInput.style.borderColor = overalloc ? 'var(--danger)' : '';
}

async function submitIncome(){
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

  const saved = await DB.addIncome(rec);
  const cashWithAccountant = Math.max(0, total - bankTransferAmount - directPettyCash);
  DB.addAudit('income_recorded',`Sunday collection ${fmt(total)} for ${fmtDate(date)} — Cash: ${fmt(cashWithAccountant)}, Bank Transfer: ${fmt(bankTransferAmount)}, Direct Petty: ${fmt(directPettyCash)}. Counted with: ${usher}`,state.user?.name);

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

  DB.addNotification('Income Recorded',`${fmt(total)} recorded for ${fmtDate(date)}${directPettyCash?` | ${fmt(directPettyCash)} → Petty Cash`:''}`,'success');
  closeModal();
  showAlert(`Income of ${fmt(total)} recorded. Cash with accountant: ${fmt(cashWithAccountant)}${bankTransferAmount?` | Bank: ${fmt(bankTransferAmount)}`:''}${directPettyCash?` | Petty: ${fmt(directPettyCash)}`:''}`, 'success');
  renderIncome();
  buildSidebar();
}

async function viewIncome(id){
  const allIncVI = await DB.getIncome();
  const r=allIncVI.find(x=>x.id===id);
  if(!r) return;
  const isSunday = !r.source||r.source==='sunday_collection';
  const rem = isSunday ? await calcRemittances(r) : null;
  const btAmt = r.bankTransferAmount||0;
  const dpAmt = r.directPettyCash||0;
  const cashHeld = Math.max(0,(r.totalCollection||0) - btAmt - dpAmt);
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
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Close</button>
    ${can('income')&&cashHeld>depositedTotal?`<button class="btn btn-primary" onclick="App.confirmDeposit('${r.id}')">Record Cash Deposit</button>`:''}</div>`);
}

async function confirmDeposit(id){
  const allIncCD = await DB.getIncome();
  const r = allIncCD.find(x=>x.id===id);
  if(!r) return;
  const btAmt = r.bankTransferAmount||0;
  const dpAmt = r.directPettyCash||0;
  const cashHeld = Math.max(0,(r.totalCollection||0) - btAmt - dpAmt);
  const allCashCD = await DB.getCashTransactions();
  const alreadyDeposited = allCashCD.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
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

async function submitCashDeposit(incomeId){
  const amount  = parseFloat(document.getElementById('dep_amount')?.value)||0;
  const method  = document.getElementById('dep_method')?.value;
  const ref     = document.getElementById('dep_ref')?.value?.trim();
  const date    = document.getElementById('dep_date')?.value;
  if(!amount||!ref||!date){ alert('Please fill all required fields.'); return }
  await DB.addCashTransaction({ type:'cash_deposit', incomeRef:incomeId, amount, depositMethod:method, reference:ref, date, recordedBy:state.user?.name });
  DB.addAudit('cash_deposited',`Cash deposit: ${fmt(amount)} via ${method?.replace(/_/g,' ')||'—'} — Ref: ${ref}`,state.user?.name);
  DB.addNotification('Cash Deposited',`${fmt(amount)} deposited to bank (Ref: ${ref})`,'success');
  closeModal();
  showAlert(`${fmt(amount)} deposited to bank successfully! Ref: ${ref}`, 'success');
  renderIncome();
}

async function confirmBulkDeposit(){
  const allIncome = await DB.getIncome(); // all months — accountant may have old pending cash
  const cashTx = await DB.getCashTransactions();
  const pending = allIncome.map(r=>{
    const isSunday = !r.source||r.source==='sunday_collection';
    const cashHeld = isSunday
      ? Math.max(0,(r.totalCollection||0)-(r.bankTransferAmount||0)-(r.directPettyCash||0))
      : r.paymentMethod==='cash' ? (r.totalCollection||0) : 0;
    const deposited = cashTx.filter(t=>t.type==='cash_deposit'&&t.incomeRef===r.id).reduce((s,t)=>s+(t.amount||0),0);
    const srcLabel = isSunday ? '📅 Sunday Collection' : (OTHER_INCOME_SOURCES.find(s=>s.key===r.source)||{label:r.source||'Other'}).label;
    return { id:r.id, date:r.date, cashHeld, deposited, remaining:cashHeld-deposited, source:srcLabel };
  }).filter(p=>p.cashHeld>0 && p.remaining>0).sort((a,b)=>new Date(a.date)-new Date(b.date));
  if(!pending.length){ showAlert('No pending cash deposits found.','warn'); return }
  state._bulkDepositPending = pending;
  const totalRemaining = pending.reduce((s,p)=>s+p.remaining,0);
  const today = new Date().toISOString().split('T')[0];
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">💰 Record Cash Deposit</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>Tick the records you are depositing in this single trip to the bank. You can deposit all at once or just some of them.</span></div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span style="font-size:13px;font-weight:600;color:var(--text2)">${pending.length} record(s) with outstanding cash:</span>
      <button class="btn btn-sm" onclick="App.toggleBulkSelectAll(true)" style="margin-left:auto">Select All</button>
      <button class="btn btn-sm" onclick="App.toggleBulkSelectAll(false)">Deselect All</button>
    </div>
    <div class="table-wrap" style="margin-bottom:16px"><table>
      <tr><th style="width:36px;text-align:center">✓</th><th>Date</th><th>Source</th><th>Cash Held</th><th>Prev. Deposited</th><th class="td-right">Remaining</th></tr>
      ${pending.map((p,i)=>`<tr>
        <td style="text-align:center"><input type="checkbox" id="bulk_chk_${i}" data-remaining="${p.remaining}" checked onchange="App.updateBulkDepositTotal()" style="width:16px;height:16px;cursor:pointer;accent-color:var(--primary)" /></td>
        <td><strong>${fmtDate(p.date)}</strong></td>
        <td class="td-muted" style="font-size:12px">${p.source}</td>
        <td>${fmt(p.cashHeld)}</td>
        <td>${p.deposited>0?fmt(p.deposited):'—'}</td>
        <td class="td-right td-bold">${fmt(p.remaining)}</td>
      </tr>`).join('')}
      <tr style="border-top:2px solid var(--border);background:var(--primary-light)">
        <td colspan="5" style="font-weight:700;padding:8px 10px">SELECTED TOTAL TO DEPOSIT</td>
        <td class="td-right" id="bulk_selected_total" style="color:var(--primary);font-size:15px;font-weight:700;padding:8px 10px">${fmt(totalRemaining)}</td>
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
      <button class="btn btn-primary" id="bulk_confirm_btn" onclick="App.submitBulkDeposit()">Confirm Deposit — ${fmt(totalRemaining)}</button>
    </div>`);
}

function updateBulkDepositTotal(){
  const pending = state._bulkDepositPending || [];
  let total = 0;
  pending.forEach((_,i)=>{
    const chk = document.getElementById(`bulk_chk_${i}`);
    if(chk?.checked) total += pending[i].remaining;
  });
  const el  = document.getElementById('bulk_selected_total');
  const btn = document.getElementById('bulk_confirm_btn');
  if(el)  el.textContent = fmt(total);
  if(btn) btn.textContent = `Confirm Deposit — ${fmt(total)}`;
  if(btn) btn.disabled = total <= 0;
}

function toggleBulkSelectAll(checked){
  const pending = state._bulkDepositPending || [];
  pending.forEach((_,i)=>{ const c=document.getElementById(`bulk_chk_${i}`); if(c) c.checked=checked; });
  updateBulkDepositTotal();
}

async function submitBulkDeposit(){
  const pending = state._bulkDepositPending || [];
  const method  = document.getElementById('bulk_dep_method')?.value;
  const ref     = document.getElementById('bulk_dep_ref')?.value?.trim();
  const date    = document.getElementById('bulk_dep_date')?.value;
  if(!ref||!date){ alert('Please fill all required fields (reference number and deposit date).'); return }
  const selected = pending.filter((_,i)=>{ const c=document.getElementById(`bulk_chk_${i}`); return c?.checked; });
  if(!selected.length){ alert('Please tick at least one record to deposit.'); return }
  const totalAmount = selected.reduce((s,p)=>s+p.remaining,0);
  for(const p of selected){
    await DB.addCashTransaction({ type:'cash_deposit', incomeRef:p.id, amount:p.remaining, depositMethod:method, reference:ref, date, recordedBy:state.user?.name });
  }
  DB.addAudit('cash_deposited',`Bulk cash deposit: ${fmt(totalAmount)} across ${selected.length} record(s) via ${method?.replace(/_/g,' ')||'—'} — Ref: ${ref}`,state.user?.name);
  DB.addNotification('Cash Deposited',`${fmt(totalAmount)} deposited to bank (${selected.length} record(s), Ref: ${ref})`,'success');
  delete state._bulkDepositPending;
  closeModal();
  showAlert(`${fmt(totalAmount)} deposited across ${selected.length} record(s). Bank ref: ${ref}`, 'success');
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

async function submitOtherIncome(){
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

  await DB.addIncome(rec);
  DB.addNotification('Other Income Recorded',`${fmt(amount)} recorded (${source}) from ${donorName||'unnamed'}`,'success');
  closeModal();
  showAlert(`${fmt(amount)} recorded as ${OTHER_INCOME_SOURCES.find(s=>s.key===source)?.label||source}. Method: ${method.replace('_',' ')}.`,'success');
  renderIncome();
  buildSidebar();
}

// ── REMITTANCES ───────────────────────────
async function renderRemittances(){
  const [allIncome, allRems, settings, allUsers] = await Promise.all([
    DB.getIncome(), DB.getRemittances(), DB.getSettings(), DB.getUsers()
  ]);
  const quotas = getQuotaList(settings);
  const rr = await getRemRates();

  // --- Determine period defaults ---
  const todayStr = new Date().toISOString().split('T')[0];
  if(!state.remFromDate){
    // Day after last paid remittance, or start of current month
    const lastPaid = allRems.filter(r=>r.status==='paid')
      .sort((a,b)=>new Date(b.paidDate||b.createdAt||0)-new Date(a.paidDate||a.createdAt||0))[0];
    if(lastPaid){
      const d=new Date(lastPaid.paidDate||lastPaid.createdAt||0);
      if(isNaN(d.getTime())){
        state.remFromDate=new Date(state.year,state.month,1).toISOString().split('T')[0];
      } else {
        d.setDate(d.getDate()+1);
        state.remFromDate=d.toISOString().split('T')[0];
      }
    } else {
      state.remFromDate=new Date(state.year,state.month,1).toISOString().split('T')[0];
    }
  }
  if(!state.remToDate) state.remToDate=todayStr;

  const fromDate=state.remFromDate;
  const toDate=state.remToDate;

  // --- Income for selected period ---
  const income=filterByDateRange(allIncome, fromDate, toDate);
  const rem=await calcRemittancesFromRecords(income);

  // --- Build remittance lines (No Go-A-Fishing — not an HQ remittance) ---
  const incomeLines=rem.lines.map(l=>({
    label:l.label+' → National HQ', amount:l.national||0, section:'income', from:l
  })).filter(l=>l.amount>0);

  const tgLines=[
    { label:`Thanksgiving → Area / Zonal Pastor (${Math.round(rr.tgArea*100)}%)`,      amount:rem.totalArea,     section:'tg' },
    { label:`Thanksgiving → Pastor's Share (${Math.round(rr.tgPastor*100)}%)`,         amount:rem.totalPastor,   section:'tg' },
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
  const isPaid=totalPaid>0&&totalPaid>=totalDue*0.99;
  const isPartial=totalPaid>0&&!isPaid;

  const allPaidRems=allRems.filter(r=>r.status==='paid')
    .sort((a,b)=>new Date(b.paidDate||b.createdAt||0)-new Date(a.paidDate||a.createdAt||0));

  const pendingApprovals=allRems.filter(r=>r.status==='pending_approval')
    .sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));

  const renderSection=(rows,sectionLabel)=>rows.length?`
    <tr style="background:var(--surface)">
      <td colspan="3" style="font-size:10px;font-weight:700;color:var(--text3);padding:5px 12px;letter-spacing:0.6px;text-transform:uppercase">${sectionLabel}</td>
    </tr>
    ${rows.map(l=>`<tr>
      <td style="padding:7px 12px"><strong>${l.label}</strong></td>
      <td style="padding:7px 8px"><span class="badge ${l.section==='quota'?'badge-info':'badge-purple'}">${l.section==='quota'?'Fixed Quota':'% Based'}</span></td>
      <td class="td-right td-bold td-red" style="padding:7px 12px">${fmt(l.amount)}</td>
    </tr>`).join('')}`:'';

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div>
        <div class="page-title">Remittances</div>
        <div class="page-sub">All amounts due to RCCG National & Provincial authorities</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${can('income')?`<button class="btn btn-primary" onclick="App.showRemittancePaymentModal()">📤 Record Payment</button>`:''}
        <button class="btn btn-amber" onclick="App.printRemittanceReport()">📄 Download Report</button>
      </div>
    </div>

    <!-- Period Selector -->
    <div class="card" style="margin-bottom:12px;padding:14px 16px">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">📅 Remittance Period</div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:6px">
          <label style="font-size:12px;color:var(--text2);white-space:nowrap">From</label>
          <input type="date" id="remFromDate" class="form-input" value="${fromDate}" style="width:auto;padding:6px 10px;font-size:13px" onchange="App.onRemDatesChange()" />
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <label style="font-size:12px;color:var(--text2);white-space:nowrap">To</label>
          <input type="date" id="remToDate" class="form-input" value="${toDate}" style="width:auto;padding:6px 10px;font-size:13px" onchange="App.onRemDatesChange()" />
        </div>
        ${isPaid?`<span class="badge badge-success" style="font-size:11px">✅ PAID for this period</span>`:isPartial?`<span class="badge badge-warn" style="font-size:11px">⏳ Partially paid</span>`:''}
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:8px">
        ℹ️ Set <strong>From</strong> to the day after your last remittance payment, and <strong>To</strong> to the date of this month's remittance (e.g. last Sunday of the month).
        Showing <strong>${income.length}</strong> income record(s) in this period.
      </div>
    </div>

    <!-- KPI Summary -->
    <div class="kpi-grid" style="margin-bottom:12px">
      <div class="kpi"><div class="kpi-icon" style="background:#E8F4FD">💰</div><div class="kpi-label">Total Collection</div><div class="kpi-val">${fmt(totalCollection)}</div></div>
      <div class="kpi"><div class="kpi-icon" style="background:#FCEBEB">📤</div><div class="kpi-label">Total Remittance Due</div><div class="kpi-val">${fmt(totalDue)}</div></div>
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
          ${renderSection(incomeLines,'Income-Based Remittances (% of collections)')}
          ${renderSection(tgLines,'Thanksgiving Offering Distribution')}
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
          ${can('income')?`<button class="btn btn-primary" onclick="App.showRemittancePaymentModal()">📤 Record Bulk Payment (${fmt(totalDue)})</button>`:''}
          <button class="btn btn-amber" onclick="App.printRemittanceReport()">📄 Print / Download Report</button>
        </div>
      </div>

      <!-- RIGHT: History + Local Share -->
      <div>
        ${pendingApprovals.length&&['it_admin','pastor','signatory'].includes(state.user?.role)?`
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
                ${['it_admin','pastor','signatory'].includes(state.user?.role)?`<button class="btn btn-sm btn-primary" onclick="App.approveRemittance('${r.id}')">✅ Approve</button>`:''}
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

        <!-- Pastor's Share card -->
        ${(rem.totalPastor||0)+(rem.totalArea||0)+(rem.totalSeed||0)>0?`
        <div class="card" style="margin-top:12px">
          <div class="card-header"><span class="card-title">👨‍💼 Pastor's Share</span></div>
          <p style="font-size:11px;color:var(--text3);margin-bottom:10px">Thanksgiving portions due to the Pastor (as Zonal / Area Pastor).</p>
          ${(rem.totalArea||0)>0?`
          <div class="status-row">
            <div class="status-row-label">TG → Area / Zonal Pastor (${Math.round(rr.tgArea*100)}%)</div>
            <div class="status-row-amt" style="color:var(--primary)">${fmt(rem.totalArea)}</div>
          </div>`:''}
          ${(rem.totalPastor||0)>0?`
          <div class="status-row">
            <div class="status-row-label">TG → Pastor's Share (${Math.round(rr.tgPastor*100)}%)</div>
            <div class="status-row-amt" style="color:var(--primary)">${fmt(rem.totalPastor)}</div>
          </div>`:''}
          ${(rem.totalSeed||0)>0?`
          <div class="status-row">
            <div class="status-row-label">TG → Seed — Pastor's Children (${Math.round(rr.tgSeed*100)}%)</div>
            <div class="status-row-amt" style="color:var(--primary)">${fmt(rem.totalSeed)}</div>
          </div>`:''}
          <div class="status-row" style="border-top:2px solid var(--border);margin-top:4px">
            <div class="status-row-label fw-bold">TOTAL PASTOR'S SHARE</div>
            <div class="status-row-amt" style="color:var(--primary);font-size:15px">${fmt((rem.totalArea||0)+(rem.totalPastor||0)+(rem.totalSeed||0))}</div>
          </div>
        </div>`:''}
      </div>
    </div>`;
}

async function showRemittancePaymentModal(){
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
    { label:`Thanksgiving → Pastor's Share (${Math.round(rr.tgPastor*100)}%)`,         amount:rem.totalPastor },
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

  const isCan=can('income'); // for role-aware submit label
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
      <button class="btn btn-primary" onclick="App.submitRemittance()">📤 Submit for Approval</button>
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

async function submitRemittance(){
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

  // Encode receipt file if provided
  let receiptData='', receiptFileName='';
  const receiptFile=document.getElementById('rem_receipt')?.files?.[0];
  if(receiptFile){
    receiptData=await new Promise(res=>{ const fr=new FileReader(); fr.onload=e=>res(e.target.result); fr.readAsDataURL(receiptFile) });
    receiptFileName=receiptFile.name;
  }

  const fromDate=state.remFromDate||new Date(state.year,state.month,1).toISOString().split('T')[0];
  const toDate=state.remToDate||new Date().toISOString().split('T')[0];

  const isSuperUser=['it_admin','pastor'].includes(state.user?.role);
  const status=isSuperUser?'paid':'pending_approval';

  // Build a clear description of how payment was split
  const methodLabel=isSplit
    ? `Split — Bank: ${fmt(bankAmount)} + Cash: ${fmt(cashAmount)}`
    : method==='bank_transfer'?'Bank Transfer':'Cash';

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
}

async function approveRemittance(id){
  if(!confirm('Approve this remittance payment?')) return;
  await DB.updateRemittance(id,{
    status:'paid',
    approvedBy:state.user?.name||'',
    approvedAt:new Date().toISOString().split('T')[0]
  });
  DB.addAudit('remittance_approved',`Remittance ${id} approved by ${state.user?.name||'—'}`,state.user?.name);
  DB.addNotification('Remittance Approved',`Remittance payment approved by ${state.user?.name||'—'} and marked as paid.`,'success');
  showAlert('Remittance approved and marked as paid!','success');
  renderRemittances();
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
    { desc:`Thanksgiving → Pastor's Share (${Math.round(rr.tgPastor*100)}%)`,          type:'% Based', amount:rem.totalPastor||0 },
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
  @media print{body{padding:10px}.no-print{display:none}}
</style>
</head>
<body>
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
  // Brief delay to ensure the document is fully rendered before triggering print
  setTimeout(()=>w.print(),400);
}

// ── EXPENSES ──────────────────────────────
async function renderExpenses(){
  const allExp = await DB.getExpenses();
  const expenses = filterByMonth(allExp);
  const total = expenses.reduce((s,r)=>s+(r.amount||0),0);

  // Category totals for breakdown
  const catTotals = {};
  EXPENSE_CATS.forEach(c=>{ catTotals[c.key]=expenses.filter(e=>e.category===c.key).reduce((s,e)=>s+(e.amount||0),0); });

  // Active category filter (stored on state)
  const activeFilter = state.expCatFilter || null;
  const searchTerm   = state.expSearch   || '';
  const sortField    = state.expSort     || 'date';
  const sortDir      = state.expSortDir  || 'desc';

  // Apply filters to log
  let filtered = expenses.filter(e=>{
    if(activeFilter && e.category!==activeFilter) return false;
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
      ${can('expenses')?`<button class="btn btn-primary" onclick="App.showExpenseForm()">+ Log Expense</button>`:''}
    </div>

    <!-- Category Breakdown -->
    <div class="card" style="margin-bottom:1rem">
      <div class="card-header">
        <span class="card-title">Category Breakdown</span>
        ${activeFilter?`<button class="btn btn-sm" onclick="App.setExpCatFilter(null)">✕ Clear filter</button>`:can('expenses')?'<span style="font-size:11px;color:var(--text3)">Tap a category to log an expense</span>':''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">
        ${EXPENSE_CATS.map(c=>{
          const amt  = catTotals[c.key]||0;
          const pct  = total>0 ? (amt/total*100) : 0;
          const hasAmt = amt>0;
          return `
          <button onclick="${can('expenses')?`App.showExpenseForm('${c.key}')`:``}" style="
            all:unset;display:flex;flex-direction:column;gap:6px;
            background:${isActive?'var(--primary)':'var(--surface)'};
            border:1.5px solid ${isActive?'var(--primary)':hasAmt?'var(--border2)':'var(--border)'};
            border-radius:var(--rl);padding:12px 14px;cursor:pointer;
            transition:all 0.15s;opacity:${hasAmt?1:0.45};
            box-shadow:${isActive?'0 2px 8px rgba(15,110,86,0.2)':'none'};
            text-align:left;width:100%;box-sizing:border-box
          " >
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <span style="font-size:22px;line-height:1">${c.icon}</span>
              ${pct>0?`<span style="font-size:11px;font-weight:700;padding:2px 6px;border-radius:10px;background:${isActive?'rgba(255,255,255,0.25)':'var(--primary-light)'};color:${isActive?'#fff':'var(--primary)'}">${pct<1?'<1':Math.round(pct)}%</span>`:''}
            </div>
            <div style="font-size:12px;font-weight:600;color:${isActive?'#fff':'var(--text)'};line-height:1.3;margin-top:2px">${c.label}</div>
            <div style="font-size:13px;font-weight:700;color:${isActive?'rgba(255,255,255,0.9)':hasAmt?'var(--danger)':'var(--text3)'}">
              ${hasAmt?fmt(amt):'—'}
            </div>
            ${pct>0?`<div style="height:3px;background:${isActive?'rgba(255,255,255,0.3)':'var(--border)'};border-radius:2px;overflow:hidden;margin-top:2px">
              <div style="height:3px;width:${Math.min(100,pct)}%;background:${isActive?'#fff':'var(--primary)'};border-radius:2px"></div>
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
        ${(activeFilter||searchTerm)?`<button class="btn btn-sm" onclick="App.clearExpFilters()" style="white-space:nowrap;flex-shrink:0">✕ Clear all</button>`:''}
      </div>

      ${filtered.length?`<div class="table-wrap"><table>
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
          const c=EXPENSE_CATS.find(x=>x.key===e.category)||{icon:'',label:e.category||'—'};
          const methodLabel = e.paymentMethod==='petty_cash'?'💳 Petty Cash'
            :e.paymentMethod==='bank_transfer'?'🏦 Bank'
            :e.paymentMethod==='split'?`🏦+💵 Split`
            :'💵 Cash';
          const splitDetail = e.paymentMethod==='split'&&(e.bankAmount||e.cashAmount)
            ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">Bank: ${fmt(e.bankAmount||0)} · Cash: ${fmt(e.cashAmount||0)}</div>` : '';
          return `<tr>
            <td style="white-space:nowrap">${fmtDate(e.date||e.createdAt)}</td>
            <td><span class="badge badge-gray">${c.icon} ${c.label}</span></td>
            <td>
              <div style="font-size:13px;font-weight:500">${e.subCategory||e.description||'—'}</div>
              ${e.subCategory&&e.description&&e.description!==e.subCategory?`<div style="font-size:11px;color:var(--text3)">${e.description}</div>`:''}
            </td>
            <td class="td-right td-red td-bold">${fmt(e.amount)}</td>
            <td class="td-muted" style="font-size:12px">${methodLabel}${splitDetail}</td>
            <td class="td-muted" style="font-size:12px">${e.recordedBy||'—'}</td>
            <td>${e.receiptImage?`<button class="btn btn-sm" onclick="App.viewExpenseReceipt('${e.id}')">🧾 View</button>`:e.receiptNo?`<span class="badge badge-gray">#${e.receiptNo}</span>`:'<span style="color:var(--text3);font-size:12px">—</span>'}</td>
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
function setExpSort(field){
  if(state.expSort===field){ state.expSortDir = state.expSortDir==='asc'?'desc':'asc'; }
  else { state.expSort=field; state.expSortDir='desc'; }
  renderExpenses();
}
function clearExpFilters(){
  state.expCatFilter=null; state.expSearch=''; renderExpenses();
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

function showExpenseForm(preselectedCat){
  const today=new Date().toISOString().split('T')[0];
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
    <div class="form-group"><label class="form-label">Total Amount (₦) *</label><input type="number" id="exp_amt" class="form-input" placeholder="0" min="0" oninput="App.onExpMethodChange()" /></div>

    <!-- Payment Method -->
    <div class="form-group">
      <label class="form-label">Payment Method *</label>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px">
        ${(state.user?.role==='admin_officer'||state.user?.role==='it_admin'||state.user?.role==='accountant')?`
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="exp_method" value="petty_cash" checked onchange="App.onExpMethodChange()" /> 💳 Petty Cash
        </label>`:''}
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="exp_method" value="bank_transfer" ${state.user?.role==='pastor'||state.user?.role==='signatory'?'checked':''} onchange="App.onExpMethodChange()" /> 🏦 Bank Transfer
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="exp_method" value="cash" onchange="App.onExpMethodChange()" /> 💵 Cash (Accountant)
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="radio" name="exp_method" value="split" onchange="App.onExpMethodChange()" /> 🏦💵 Split
        </label>
      </div>
    </div>

    <!-- Split payment fields -->
    <div id="exp_split_group" style="display:none">
      <div style="background:var(--surface);border-radius:var(--r);padding:12px;margin-bottom:12px">
        <div style="font-size:12px;color:var(--text2);margin-bottom:10px">Enter how much was paid by each method. They must add up to the total amount above.</div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">🏦 Bank Transfer (₦)</label>
            <input type="number" id="exp_bank_amt" class="form-input" placeholder="0" min="0" oninput="App.onExpSplitChange()" />
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">💵 Cash (₦)</label>
            <input type="number" id="exp_cash_amt" class="form-input" placeholder="0" min="0" oninput="App.onExpSplitChange()" />
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
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.submitExpense()">Save Expense</button></div>`);
  // If a category was pre-selected, populate subcategories immediately
  if(preselectedCat){ setTimeout(()=>App.updateExpenseSubcats(), 30); }
}

function onExpMethodChange(){
  const method = document.querySelector('input[name="exp_method"]:checked')?.value || 'petty_cash';
  const splitGrp = document.getElementById('exp_split_group');
  if(splitGrp) splitGrp.style.display = method==='split' ? '' : 'none';
  if(method==='split') onExpSplitChange();
  // Lock bank_transfer for bank category
  const cat = document.getElementById('exp_cat')?.value;
  if(cat==='bank'){
    const bankRadio = document.querySelector('input[name="exp_method"][value="bank_transfer"]');
    if(bankRadio){ bankRadio.checked=true; if(splitGrp) splitGrp.style.display='none'; }
  }
}

function onExpSplitChange(){
  const total = parseFloat(document.getElementById('exp_amt')?.value)||0;
  const bank  = parseFloat(document.getElementById('exp_bank_amt')?.value)||0;
  const cash  = parseFloat(document.getElementById('exp_cash_amt')?.value)||0;
  const sum   = bank+cash;
  const statusEl = document.getElementById('exp_split_status');
  if(!statusEl) return;
  if(!total){ statusEl.textContent='Enter the total amount above first.'; statusEl.style.color='var(--text3)'; return; }
  if(Math.abs(sum-total)<1){ statusEl.textContent=`✓ Total matches: ${fmt(sum)}`; statusEl.style.color='var(--success)'; }
  else if(sum>total){ statusEl.textContent=`Over by ${fmt(sum-total)}. Reduce one of the amounts.`; statusEl.style.color='var(--danger)'; }
  else if(sum>0){ statusEl.textContent=`${fmt(total-sum)} still unaccounted for.`; statusEl.style.color='var(--amber)'; }
  else { statusEl.textContent=''; }
}

async function submitExpense(){
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

  const method = document.querySelector('input[name="exp_method"]:checked')?.value || 'petty_cash';
  const isSplit = method==='split';

  // Resolve split amounts
  let bankAmount=0, cashAmount=0, pettyAmount=0;
  if(isSplit){
    bankAmount=parseFloat(document.getElementById('exp_bank_amt')?.value)||0;
    cashAmount=parseFloat(document.getElementById('exp_cash_amt')?.value)||0;
    if(!bankAmount&&!cashAmount){ alert('Please enter at least one split amount.'); return }
    if(bankAmount+cashAmount>amount+0.5){ alert(`Split total (${fmt(bankAmount+cashAmount)}) exceeds the expense amount (${fmt(amount)}). Please correct.`); return }
  } else if(method==='petty_cash'){
    pettyAmount=amount;
  } else if(method==='bank_transfer'){
    bankAmount=amount;
  } else {
    cashAmount=amount; // cash (accountant)
  }

  const fileEl = document.getElementById('exp_receipt_file');
  const file = fileEl?.files?.[0];

  async function saveExpenseRecord(receiptDataUrl, receiptFileName){
    try {
      await DB.addExpense({ date, category, subCategory, description: description || subCategory, amount,
        receiptNo: document.getElementById('exp_receipt')?.value,
        receiptImage: receiptDataUrl||null, receiptFileName: receiptFileName||null,
        paymentMethod: method,
        bankAmount: isSplit?bankAmount:method==='bank_transfer'?amount:0,
        cashAmount: isSplit?cashAmount:method==='cash'?amount:0,
        pettyAmount: method==='petty_cash'?amount:0,
        notes: document.getElementById('exp_notes')?.value, recordedBy:state.user?.name, status:'approved' });

      // Deduct from petty cash float if any portion is petty_cash
      if(method==='petty_cash'){
        const pettyCfg = await DB.getPettyConfig();
        await DB.savePettyConfig({ float: Math.max(0, pettyCfg.float - amount), max: pettyCfg.max });
      }
      closeModal();
      showAlert(`Expense of ${fmt(amount)} logged${isSplit?` (Bank: ${fmt(bankAmount)} + Cash: ${fmt(cashAmount)})`:''}.`,'success');
      await renderExpenses();
    } catch(err) {
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

async function submitBankWithdrawal(){
  const date        = document.getElementById('wd_date')?.value;
  const amount      = parseFloat(document.getElementById('wd_amt')?.value)||0;
  const destination = document.getElementById('wd_dest')?.value||'accountant_cash';
  const description = document.getElementById('wd_desc')?.value?.trim();
  const reference   = document.getElementById('wd_ref')?.value;
  const auth        = document.getElementById('wd_auth')?.value;
  if(!date||!amount||!description){ alert('Please fill all required fields.'); return }

  await DB.addCashTransaction({ type:'withdrawal', destination, date, amount, description, reference, authorizedBy:auth, recordedBy:state.user?.name });

  // If withdrawn to admin officer petty cash, auto-create a petty refill
  if(destination === 'admin_petty_cash'){
    const pettyConfigBW = await DB.getPettyConfig();
    const newFloat = Math.min(pettyConfigBW.float + amount, pettyConfigBW.max);
    await DB.addPettyEntry({ type:'refill', amount, source:'bank_withdrawal',
      reference, authorizedBy:auth, requestedBy:state.user?.name, status:'settled',
      createdAt:new Date().toISOString(), purpose:`Bank withdrawal → Admin Officer Petty Cash: ${description}` });
    await DB.savePettyConfig({ float: newFloat, max: pettyConfigBW.max });
    DB.addAudit('petty_refilled',`${fmt(amount)} from bank withdrawal credited to Admin Officer petty cash (${description})`,state.user?.name);
    closeModal();
    showAlert(`${fmt(amount)} withdrawn from bank and credited to Admin Officer petty cash. New float: ${fmt(newFloat)}.`,'success');
  } else {
    closeModal();
    showAlert(`Bank withdrawal of ${fmt(amount)} recorded. Destination: ${destination.replace(/_/g,' ')}.`,'success');
  }
  navigate(state.page);
}

// ── BANK ────────────────────────────────
function setBankTab(t){ state.bankTab=t; renderBank() }

async function renderBank(){
  const [allCashTx, allExpenses, allIncome, allRemittances] = await Promise.all([
    DB.getCashTransactions(), DB.getExpenses(), DB.getIncome(), DB.getRemittances()
  ]);
  const tab = state.bankTab||'overview';

  // Calculate bank balance components
  const bankTransferIncome = allIncome.reduce((s,r) => s + (r.bankTransferAmount||0), 0);
  const cashDepositedToBank = allCashTx.filter(t=>t.type==='cash_deposit').reduce((s,t) => s+(t.amount||0), 0);
  const bankExpenses = allExpenses.filter(e=>e.paymentMethod==='bank_transfer').reduce((s,e) => s+(e.amount||0), 0);
  const paidRems = allRemittances.filter(r=>r.status==='paid').reduce((s,r) => s+(r.amount||0), 0);
  const bankWithdrawals = allCashTx.filter(t=>t.type==='withdrawal').reduce((s,t) => s+(t.amount||0), 0);
  const bankBalance = bankTransferIncome + cashDepositedToBank - bankExpenses - paidRems - bankWithdrawals;

  // Monthly bank charges
  const monthlyBankCharges = filterByMonth(allExpenses).filter(e=>e.category==='bank').reduce((s,e)=>s+(e.amount||0),0);

  // Monthly withdrawals
  const monthlyWithdrawals = filterByMonth(allCashTx).filter(t=>t.type==='withdrawal');
  const monthlyDeposits = filterByMonth(allCashTx).filter(t=>t.type==='cash_deposit');

  // All bank transactions for reconciliation (combined view)
  const bankTxAll = [
    ...allCashTx.filter(t=>t.type==='withdrawal').map(t=>({...t, txType:'withdrawal', txLabel:'Withdrawal', txAmt: -(t.amount||0)})),
    ...allCashTx.filter(t=>t.type==='cash_deposit').map(t=>({...t, txType:'deposit', txLabel:'Cash Deposit', txAmt: (t.amount||0)})),
    ...allExpenses.filter(e=>e.paymentMethod==='bank_transfer').map(e=>({...e, txType:'expense', txLabel:`Expense: ${e.description||e.category}`, txAmt: -(e.amount||0), date:e.date||e.createdAt})),
    ...allRemittances.filter(r=>r.status==='paid').map(r=>({...r, txType:'remittance', txLabel:`Remittance: ${r.incomeType||'HQ'}`, txAmt: -(r.amount||0), date:r.date||r.createdAt})),
    ...allIncome.filter(r=>(r.bankTransferAmount||0)>0).map(r=>({...r, txType:'income', txLabel:`Income deposit (bank transfer)`, txAmt: (r.bankTransferAmount||0)}))
  ].sort((a,b)=>new Date(b.date||b.createdAt||0)-new Date(a.date||a.createdAt||0));

  const monthBankTx = bankTxAll.filter(t=>{
    const d=new Date(t.date||t.createdAt||0);
    return d.getMonth()===state.month && d.getFullYear()===state.year;
  });

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Bank Account</div><div class="page-sub">Balance: ${fmt(bankBalance)}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${can('income')?`<button class="btn btn-primary" onclick="App.showBankWithdrawal()">🏦 Record Withdrawal</button>`:''}
        ${can('expenses')?`<button class="btn btn-amber" onclick="App.showBankChargeForm()">💳 Record Bank Charge</button>`:''}
      </div>
    </div>

    <div class="kpi-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
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
        <div class="kpi-val">${fmt(bankExpenses + paidRems + bankWithdrawals)}</div>
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
      renderBankReconciliation(bankTxAll,bankBalance,bankTransferIncome,cashDepositedToBank,bankExpenses,paidRems,bankWithdrawals)}`;
}

function renderBankOverview(monthBankTx,bankBalance){
  if(!monthBankTx.length) return '<div class="card"><div class="empty-table">No bank transactions this month.</div></div>';
  return `<div class="card">
    <div class="card-header"><span class="card-title">Bank Transactions — ${monthLabel()}</span></div>
    <div class="table-wrap"><table>
      <tr><th>Date</th><th>Type</th><th>Description</th><th class="td-right">Amount</th><th>Reference</th></tr>
      ${monthBankTx.map(t=>{
        const isCredit = t.txAmt > 0;
        return `<tr>
          <td>${fmtDate(t.date||t.createdAt)}</td>
          <td><span class="badge ${isCredit?'badge-success':'badge-danger'}">${t.txType}</span></td>
          <td>${t.txLabel}</td>
          <td class="td-right ${isCredit?'td-green':'td-red'} td-bold">${isCredit?'+':''}${fmt(Math.abs(t.txAmt))}</td>
          <td class="td-muted">${t.reference||'—'}</td>
        </tr>`}).join('')}
    </table></div>
  </div>`;
}

function renderBankWithdrawals(withdrawals){
  if(!withdrawals.length) return '<div class="card"><div class="empty-table">No bank withdrawals this month.</div></div>';
  return `<div class="card">
    <div class="card-header"><span class="card-title">Bank Withdrawals — ${monthLabel()}</span></div>
    <div class="table-wrap"><table>
      <tr><th>Date</th><th>Amount</th><th>Destination</th><th>Description</th><th>Reference</th><th>Authorized By</th></tr>
      ${withdrawals.map(t=>`<tr>
        <td>${fmtDate(t.date)}</td>
        <td class="td-red td-bold">${fmt(t.amount)}</td>
        <td><span class="badge badge-info">${(t.destination||'').replace(/_/g,' ')}</span></td>
        <td>${t.description||'—'}</td>
        <td class="td-muted">${t.reference||'—'}</td>
        <td class="td-muted">${t.authorizedBy||'—'}</td>
      </tr>`).join('')}
    </table></div>
  </div>`;
}

function renderBankDeposits(deposits){
  if(!deposits.length) return '<div class="card"><div class="empty-table">No cash deposits to bank this month.</div></div>';
  return `<div class="card">
    <div class="card-header"><span class="card-title">Cash Deposits to Bank — ${monthLabel()}</span></div>
    <div class="table-wrap"><table>
      <tr><th>Date</th><th>Amount</th><th>Description</th><th>Reference</th><th>Recorded By</th></tr>
      ${deposits.map(t=>`<tr>
        <td>${fmtDate(t.date)}</td>
        <td class="td-green td-bold">${fmt(t.amount)}</td>
        <td>${t.description||'Cash deposit'}</td>
        <td class="td-muted">${t.reference||'—'}</td>
        <td class="td-muted">${t.recordedBy||'—'}</td>
      </tr>`).join('')}
    </table></div>
  </div>`;
}

function renderBankCharges(charges){
  const total = charges.reduce((s,e)=>s+(e.amount||0),0);
  if(!charges.length) return '<div class="card"><div class="empty-table">No bank charges recorded this month.</div></div>';
  return `<div class="card">
    <div class="card-header"><span class="card-title">Bank Charges — ${monthLabel()}</span><span style="font-size:13px;font-weight:600;color:var(--danger)">${fmt(total)}</span></div>
    <div class="table-wrap"><table>
      <tr><th>Date</th><th>Sub-category</th><th>Description</th><th class="td-right">Amount</th><th>Receipt</th></tr>
      ${charges.map(e=>`<tr>
        <td>${fmtDate(e.date||e.createdAt)}</td>
        <td>${e.subCategory||'—'}</td>
        <td>${e.description||'—'}</td>
        <td class="td-right td-red td-bold">${fmt(e.amount)}</td>
        <td class="td-muted">${e.receiptNo||'—'}</td>
      </tr>`).join('')}
    </table></div>
  </div>`;
}

function renderBankReconciliation(bankTxAll,bankBalance,bankTransferIncome,cashDepositedToBank,bankExpenses,paidRems,bankWithdrawals){
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
        ${bankTxAll.slice(0,50).map(t=>{
          const isCredit = t.txAmt > 0;
          return `<tr>
            <td>${fmtDate(t.date||t.createdAt)}</td>
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
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.submitBankCharge()">Save Bank Charge</button></div>`);
}

async function submitBankCharge(){
  const date = document.getElementById('bc_date')?.value;
  const subCategory = document.getElementById('bc_subcat')?.value;
  const description = document.getElementById('bc_desc')?.value?.trim() || subCategory;
  const amount = parseFloat(document.getElementById('bc_amt')?.value)||0;
  const receiptNo = document.getElementById('bc_ref')?.value;
  if(!date||!amount){ alert('Please fill date and amount.'); return }
  await DB.addExpense({
    date, category:'bank', subCategory, description, amount,
    paymentMethod:'bank_transfer', receiptNo,
    recordedBy: state.user?.name,
    createdAt: new Date().toISOString()
  });
  DB.addAudit('bank_charge',`Bank charge: ${description} — ${fmt(amount)}`,state.user?.name);
  closeModal();
  showAlert(`Bank charge of ${fmt(amount)} recorded.`,'success');
  navigate('bank');
}

// ── PETTY CASH ────────────────────────────
// Helper: filter petty history by selected month (fixed — was passing object to filterByMonth)
function pettyMonthHistory(history){
  return (history||[]).filter(h=>{
    const d=new Date(h.createdAt||h.date||0);
    return d.getMonth()===state.month && d.getFullYear()===state.year;
  });
}

// Helper: check if an approved item's receipt is overdue (>48 hours since approval)
function isReceiptOverdue(req){
  if(req.status!=='approved'||req.receiptNo) return false;
  const hrs=(Date.now()-new Date(req.approvedAt||req.createdAt).getTime())/3600000;
  return hrs>48;
}

async function renderPettyCash(){
  const [pettyHistory, pettyConfig] = await Promise.all([DB.getPetty(), DB.getPettyConfig()]);
  const petty = { history: pettyHistory, float: pettyConfig.float, max: pettyConfig.max };
  const history=petty.history||[];
  // BUG FIX 1: was passing plain object to filterByMonth — now uses dedicated helper
  const monthHistory=pettyMonthHistory(history);
  const pct=Math.min(100,Math.round((petty.float/petty.max)*100));
  // Pending = all unresolved requests across all months (correct — approvals aren't monthly-scoped)
  const pending=history.filter(h=>h.status==='pending_approval');
  // BUG FIX 4: detect approved items where receipt is overdue (>48 hours)
  const overdueReceipts=history.filter(h=>isReceiptOverdue(h));

  // Reconciliation figures for current month
  const monthDisbursed=monthHistory.filter(h=>h.type!=='refill'&&(h.status==='approved'||h.status==='settled')).reduce((s,h)=>s+(h.amount||0),0);
  const monthSettled=monthHistory.filter(h=>h.status==='settled'&&h.type!=='refill').reduce((s,h)=>s+(h.amount||0),0);
  const monthRefilled=monthHistory.filter(h=>h.type==='refill').reduce((s,h)=>s+(h.amount||0),0);
  const awaitingReceipts=monthHistory.filter(h=>h.status==='approved'&&!h.receiptNo&&h.type!=='refill');

  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Petty Cash (Imprest)</div><div class="page-sub">Current float balance — ${monthLabel()}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${can('petty_request')?`<button class="btn btn-primary" onclick="App.showPettyRequest()">+ Submit Request</button>`:''}
        ${can('income')?`<button class="btn btn-amber" onclick="App.showPettyRefill()">↺ Refill Float</button>`:''}
      </div>
    </div>

    ${overdueReceipts.length?`<div class="alert alert-danger"><span class="alert-icon">⚠</span><span><strong>${overdueReceipts.length} receipt(s) overdue!</strong> The following approved requests have not had receipts submitted within 48 hours: ${overdueReceipts.map(r=>r.purpose).join(', ')}. Please follow up with the Admin Officer immediately.</span></div>`:''}

    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-icon" style="background:${petty.float<10000?'var(--danger-light)':petty.float<20000?'var(--amber-light)':'var(--primary-light)'}">💳</div>
        <div class="kpi-label">Available Float</div>
        <div class="kpi-val" style="color:${petty.float<10000?'var(--danger)':petty.float<20000?'var(--amber)':'var(--primary)'}">${fmt(petty.float)}</div>
        <div class="kpi-delta ${pct<20?'down':pct<50?'warn':'up'}">${pct}% of ${fmt(petty.max)} max</div>
      </div>
      <div class="kpi">
        <div class="kpi-icon" style="background:#FCEBEB">📤</div>
        <div class="kpi-label">Disbursed (${monthLabel().split(' ')[0]})</div>
        <div class="kpi-val">${fmt(monthDisbursed)}</div>
        <div class="kpi-delta warn">Cash released this month</div>
      </div>
      <div class="kpi">
        <div class="kpi-icon" style="background:#EAF3DE">🧾</div>
        <div class="kpi-label">Receipts Settled</div>
        <div class="kpi-val">${fmt(monthSettled)}</div>
        <div class="kpi-delta up">Accounted & linked to expenses</div>
      </div>
      <div class="kpi">
        <div class="kpi-icon" style="background:#FAEEDA">⏳</div>
        <div class="kpi-label">Awaiting Receipts</div>
        <div class="kpi-val ${awaitingReceipts.length?'td-amber':''}">${fmt(monthDisbursed-monthSettled)}</div>
        <div class="kpi-delta ${awaitingReceipts.length?'warn':'up'}">${awaitingReceipts.length} item(s) outstanding</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header">
          <span class="card-title">Float Gauge</span>
          ${can('income')?`<button class="btn btn-sm btn-amber" onclick="App.showPettyRefill()">↺ Refill</button>`:''}
        </div>
        <div style="text-align:center;padding:0.5rem 0 1rem">
          <div class="amount-display" style="color:${petty.float<10000?'var(--danger)':petty.float<20000?'var(--amber)':'var(--primary)'}">${fmt(petty.float)}</div>
          <div class="progress-bar" style="margin:12px auto;max-width:240px;height:12px;border-radius:6px">
            <div class="progress-fill" style="width:${pct}%;background:${pct<20?'var(--danger)':pct<50?'var(--amber)':'var(--primary)'};border-radius:6px"></div>
          </div>
          <div class="amount-label">${pct}% of ${fmt(petty.max)} approved max float</div>
        </div>
        ${petty.float<10000?`<div class="alert alert-danger"><span class="alert-icon">⚠</span><span>Critically low. Request refill now.</span></div>`:''}
        <hr class="divider">
        <div class="section-hdr"><span class="section-title">Month Reconciliation</span></div>
        <div class="status-row"><div class="status-row-label">Cash disbursed</div><div class="status-row-amt td-red">${fmt(monthDisbursed)}</div></div>
        <div class="status-row"><div class="status-row-label">Receipts submitted & settled</div><div class="status-row-amt td-green">${fmt(monthSettled)}</div></div>
        <div class="status-row"><div class="status-row-label" style="font-weight:600">Unaccounted (no receipt yet)</div><div class="status-row-amt ${monthDisbursed-monthSettled>0?'td-amber':'td-green'}" style="font-weight:700">${fmt(monthDisbursed-monthSettled)}</div></div>
        <div class="status-row"><div class="status-row-label">Float refilled this month</div><div class="status-row-amt td-green">${fmt(monthRefilled)}</div></div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Pending Approval (${pending.length})</span></div>
        ${pending.length?pending.map(r=>`
          <div class="status-row">
            <div style="flex:1;min-width:0">
              <div class="status-row-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.purpose}</div>
              <div class="status-row-sub">By: ${r.requestedBy} · ${fmtDate(r.createdAt)}</div>
              ${r.notes?`<div class="status-row-sub" style="color:var(--text3)">"${r.notes}"</div>`:''}
            </div>
            <div class="status-row-right" style="flex-shrink:0;gap:6px">
              <div class="status-row-amt td-amber" style="white-space:nowrap">${fmt(r.amount)}</div>
              ${can('income','petty_approve')?`
                <button class="btn btn-sm btn-primary" onclick="App.approvePetty('${r.id}')">Approve</button>
                <button class="btn btn-sm btn-danger" onclick="App.rejectPetty('${r.id}')">Reject</button>`:''
              }
            </div>
          </div>`).join(''):'<div class="empty-table">No pending requests.</div>'}
      </div>
    </div>

    ${awaitingReceipts.length?`
    <div class="card">
      <div class="card-header"><span class="card-title">Approved — Receipt Still Outstanding (${awaitingReceipts.length})</span></div>
      <div class="table-wrap"><table>
        <tr><th>Approved On</th><th>Purpose</th><th>Approved By</th><th>Hours Since Approval</th><th class="td-right">Amount</th><th>Action</th></tr>
        ${awaitingReceipts.map(r=>{
          const hrs=Math.round((Date.now()-new Date(r.approvedAt||r.createdAt).getTime())/3600000);
          return`<tr>
            <td>${fmtDate(r.approvedAt||r.createdAt)}</td>
            <td>${r.purpose}</td>
            <td class="td-muted">${r.approvedBy||'—'}</td>
            <td><span class="badge ${hrs>48?'badge-danger':hrs>24?'badge-warn':'badge-info'}">${hrs}h ago${hrs>48?' ⚠ OVERDUE':''}</span></td>
            <td class="td-right td-bold td-amber">${fmt(r.amount)}</td>
            <td><button class="btn btn-sm btn-primary" onclick="App.submitPettyReceipt('${r.id}')">Submit Receipt</button></td>
          </tr>`;}).join('')}
      </table></div>
    </div>`:''}

    <div class="card">
      <div class="card-header"><span class="card-title">Full History — ${monthLabel()}</span></div>
      ${monthHistory.length?`<div class="table-wrap"><table>
        <tr><th>Date</th><th>Purpose / Type</th><th>Requested By</th><th>Approved By</th><th>Status</th><th class="td-right">Amount</th><th>Receipt / Ref</th></tr>
        ${monthHistory.map(r=>{
          const overdue=isReceiptOverdue(r);
          return`<tr style="${overdue?'background:var(--danger-light)':''}">
            <td>${fmtDate(r.createdAt)}</td>
            <td>${r.type==='refill'?`<span class="badge badge-info">↺ Refill</span> ${r.purpose}`:r.purpose}</td>
            <td class="td-muted">${r.requestedBy||'—'}</td>
            <td class="td-muted">${r.approvedBy||r.authorizedBy||'—'}</td>
            <td>
              <span class="badge ${r.status==='settled'?'badge-success':r.status==='approved'?'badge-info':r.status==='rejected'?'badge-danger':'badge-warn'}">
                ${r.status?.replace('_',' ')||'pending'}
              </span>
              ${overdue?'<span class="badge badge-danger" style="margin-left:4px">Receipt overdue</span>':''}
            </td>
            <td class="td-right td-bold ${r.type==='refill'?'td-green':'td-amber'}">${r.type==='refill'?'+':''}${fmt(r.amount)}</td>
            <td>${r.receiptNo?`<span class="badge badge-success">✓ ${r.receiptNo}</span>`:r.rejectionReason?`<span class="td-muted">${r.rejectionReason}</span>`:'—'}</td>
          </tr>`;}).join('')}
      </table></div>`:'<div class="empty-table">No petty cash activity this month.</div>'}
    </div>`;
}

async function showPettyRequest(){
  const pettyConfig = await DB.getPettyConfig();
  const petty = pettyConfig;
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">💳 Submit Petty Cash Request</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>Your request goes to the Accountant for verification, then to a Signatory for final approval before any cash is released. You must return a receipt within <strong>48 hours</strong> of receiving the money.</span></div>
    <div style="background:var(--surface);border-radius:var(--r);padding:10px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:12px;color:var(--text2)">Available float</span>
      <span style="font-size:16px;font-weight:700;color:${petty.float<10000?'var(--danger)':'var(--primary)'}">${fmt(petty.float)}</span>
    </div>
    <div class="form-group"><label class="form-label">Purpose — what is the money for? <span style="color:var(--danger)">*</span></label><input type="text" id="pet_purpose" class="form-input" placeholder="e.g. Diesel for generator — Sunday 27 Apr" /></div>
    <div class="form-group"><label class="form-label">Amount Needed (₦) <span style="color:var(--danger)">*</span></label><input type="number" id="pet_amt" class="form-input" placeholder="0" min="0" /></div>
    <div class="form-group"><label class="form-label">Category <span style="color:var(--danger)">*</span></label>
      <select id="pet_cat" class="form-select">
        <option value="">— Select category —</option>
        ${EXPENSE_CATS.map(c=>`<option value="${c.key}">${c.icon} ${c.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label class="form-label">Date Needed By</label><input type="date" id="pet_date" class="form-input" value="${new Date().toISOString().split('T')[0]}" /></div>
    <div class="form-group"><label class="form-label">Notes (helps with approval)</label><textarea id="pet_notes" class="form-textarea" placeholder="Any context that explains the urgency or details..."></textarea></div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.submitPettyRequest()">Submit Request</button></div>`);
}

async function submitPettyRequest(){
  const purpose=document.getElementById('pet_purpose')?.value?.trim();
  const amount=parseFloat(document.getElementById('pet_amt')?.value)||0;
  const category=document.getElementById('pet_cat')?.value;
  if(!purpose||!amount||!category){ alert('Please fill in the purpose, amount, and category.'); return }
  const [pettyHistGPCR, pettyConfigGPCR] = await Promise.all([DB.getPetty(), DB.getPettyConfig()]);
  const petty = { history: pettyHistGPCR, float: pettyConfigGPCR.float, max: pettyConfigGPCR.max };
  if(amount>petty.float){
    if(!confirm(`The requested amount (${fmt(amount)}) exceeds the current float (${fmt(petty.float)}). Submit anyway for the Accountant to review?`)) return;
  }
  const req={
    id:'PC-'+Date.now(), purpose, amount, category,
    dateNeeded:document.getElementById('pet_date')?.value,
    notes:document.getElementById('pet_notes')?.value,
    requestedBy:state.user?.name, status:'pending_approval',
    createdAt:new Date().toISOString()
  };
  await DB.addPettyEntry(req);
  DB.addAudit('petty_requested',`Petty cash requested: ${purpose} — ${fmt(amount)}`,state.user?.name);
  DB.addNotification('Petty Cash Request',`${state.user?.name} requested ${fmt(amount)} for "${purpose}". Awaiting approval.`,'warn');
  closeModal();
  showAlert('Request submitted! The Accountant and a Signatory will review and approve.','success');
  renderPettyCash();
  buildSidebar();
}

async function approvePetty(id){
  const [pettyHistory, pettyConfig] = await Promise.all([DB.getPetty(), DB.getPettyConfig()]);
  const req=pettyHistory.find(h=>h.id===id);
  if(!req) return;
  if(req.amount>pettyConfig.float){
    alert(`Cannot approve: Insufficient float.\nRequired: ${fmt(req.amount)}\nAvailable: ${fmt(pettyConfig.float)}\n\nPlease refill the float first, then approve this request.`);
    return;
  }
  const approvedAt=new Date().toISOString();
  await DB.updatePettyEntry(id, { status:'approved', approvedBy:state.user?.name, approvedAt });
  await DB.savePettyConfig({ float: pettyConfig.float - req.amount, max: pettyConfig.max });
  DB.addAudit('petty_approved',`Petty cash approved: "${req.purpose}" — ${fmt(req.amount)} (approved by ${state.user?.name})`,state.user?.name);
  DB.addNotification('Petty Cash Approved',`"${req.purpose}" — ${fmt(req.amount)} approved by ${state.user?.name}. Receipt due within 48 hours.`,'success');
  showAlert(`Approved. ${fmt(req.amount)} deducted from float. Remind ${req.requestedBy} to return receipt within 48 hours.`,'success');
  renderPettyCash();
  buildSidebar();
}

async function rejectPetty(id){
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

// BUG FIX 2: settling a petty cash request now auto-creates a matching Expense record
// so it appears in all expense reports and the monthly financial statement
function submitPettyReceipt(id){
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">🧾 Submit Receipt</div>
    <div class="alert alert-info"><span class="alert-icon">ℹ</span><span>Enter the receipt details below. This will mark the petty cash as settled and <strong>automatically record it as an expense</strong> in the main expense log.</span></div>
    <div class="form-group"><label class="form-label">Receipt Number <span style="color:var(--danger)">*</span></label><input type="text" id="rc_no" class="form-input" placeholder="e.g. REC-001 or vendor receipt number" /></div>
    <div class="form-group"><label class="form-label">Actual Amount Spent (₦)</label><input type="number" id="rc_amt" class="form-input" placeholder="Leave blank if same as requested" /></div>
    <div class="form-group"><label class="form-label">Vendor / Purchased From</label><input type="text" id="rc_vendor" class="form-input" placeholder="e.g. Total Petrol Station, Onitsha" /></div>
    <div class="form-group"><label class="form-label">Notes</label><textarea id="rc_notes" class="form-textarea" placeholder="Any change returned, additional detail..."></textarea></div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.confirmPettyReceipt('${id}')">Submit & Settle</button></div>`);
}

async function confirmPettyReceipt(id){
  const no=document.getElementById('rc_no')?.value?.trim();
  if(!no){ alert('Please enter the receipt number.'); return }
  const [pettyHistory, pettyConfig] = await Promise.all([DB.getPetty(), DB.getPettyConfig()]);
  const req=pettyHistory.find(h=>h.id===id);
  if(!req){ closeModal(); return }

  const actualAmt=parseFloat(document.getElementById('rc_amt')?.value)||req.amount;
  const vendor=document.getElementById('rc_vendor')?.value||'';
  const notes=document.getElementById('rc_notes')?.value||'';

  // Mark petty cash item as settled
  const updateData = { receiptNo:no, status:'settled', settledAt:new Date().toISOString(), settledBy:state.user?.name, actualAmount:actualAmt, vendor };

  // If actual amount differs from approved, return difference to float
  let changeReturned=0;
  if(actualAmt<req.amount){
    changeReturned=req.amount-actualAmt;
    updateData.changeReturned=changeReturned;
    await DB.savePettyConfig({ float: pettyConfig.float + changeReturned, max: pettyConfig.max });
    DB.addNotification('Petty Cash Change Returned',`${fmt(changeReturned)} returned to float from "${req.purpose}" (spent ${fmt(actualAmt)} of approved ${fmt(req.amount)}).`,'info');
  }

  await DB.updatePettyEntry(id, updateData);

  // Auto-create expense record so it shows in expense module & reports
  await DB.addExpense({
    date:new Date().toISOString().split('T')[0],
    category:req.category||'power',
    description:req.purpose+(vendor?` — ${vendor}`:''),
    amount:actualAmt,
    receiptNo:no,
    paymentMethod:'petty_cash',
    notes:`Petty cash ref: ${req.id}. ${notes}`,
    recordedBy:state.user?.name,
    pettyRef:req.id,
    status:'approved'
  });

  DB.addAudit('petty_settled',`Petty cash settled: "${req.purpose}" — ${fmt(actualAmt)}, Receipt: ${no}. Expense record auto-created.`,state.user?.name);
  closeModal();
  showAlert(`Receipt submitted. ${fmt(actualAmt)} recorded as expense.${changeReturned?` ${fmt(changeReturned)} change returned to float.`:''}`, 'success');
  renderPettyCash();
}

async function showPettyRefill(){
  const [pettyHistory, pettyConfig] = await Promise.all([DB.getPetty(), DB.getPettyConfig()]);
  const petty = { history: pettyHistory, float: pettyConfig.float, max: pettyConfig.max };
  // Show amount of settled-but-not-yet-refilled receipts as a suggested refill amount
  const settled=pettyMonthHistory(petty.history).filter(h=>h.status==='settled'&&h.type!=='refill');
  const settledTotal=settled.reduce((s,h)=>s+(h.actualAmount||h.amount||0),0);
  const spaceInFloat=petty.max-petty.float;
  const suggested=Math.min(settledTotal,spaceInFloat);

  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">↺ Refill Petty Cash Float</div>
    <div class="alert alert-warn"><span class="alert-icon">⚠</span><span>Refill only the exact total of receipts submitted. Signatories must authorize the bank transfer before you process this.</span></div>
    <div style="background:var(--surface);border-radius:var(--r);padding:10px 14px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:12px;color:var(--text2)">Current float</span><span style="font-weight:600">${fmt(petty.float)}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:12px;color:var(--text2)">Max float</span><span style="font-weight:600">${fmt(petty.max)}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:12px;color:var(--text2)">Room available</span><span style="font-weight:600;color:var(--primary)">${fmt(spaceInFloat)}</span></div>
      ${suggested>0?`<div style="display:flex;justify-content:space-between"><span style="font-size:12px;color:var(--text2)">Suggested refill (total settled receipts)</span><span style="font-weight:600;color:var(--amber)">${fmt(suggested)}</span></div>`:''}
    </div>
    <div class="form-group"><label class="form-label">Refill Amount (₦) <span style="color:var(--danger)">*</span></label>
      <input type="number" id="ref_amt" class="form-input" placeholder="0" value="${suggested||''}" max="${spaceInFloat}" />
      <div class="form-hint">Maximum: ${fmt(spaceInFloat)} (cannot exceed max float of ${fmt(petty.max)})</div>
    </div>
    <div class="form-group"><label class="form-label">Bank Transfer Reference <span style="color:var(--danger)">*</span></label><input type="text" id="ref_ref" class="form-input" placeholder="Reference number from bank" /></div>
    <div class="form-group"><label class="form-label">Authorized By (Signatory names) <span style="color:var(--danger)">*</span></label><input type="text" id="ref_auth" class="form-input" placeholder="e.g. Elder Paul Okafor + Elder James Eze" /></div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.submitRefill()">Refill Float</button></div>`);
}

async function submitRefill(){
  const amt=parseFloat(document.getElementById('ref_amt')?.value)||0;
  const ref=document.getElementById('ref_ref')?.value?.trim();
  const auth=document.getElementById('ref_auth')?.value?.trim();
  if(!amt||!ref||!auth){ alert('Please fill in all required fields: amount, bank reference, and authorizing signatories.'); return }
  const pettyConfig=await DB.getPettyConfig();
  const spaceAvailable=pettyConfig.max-pettyConfig.float;
  if(amt>spaceAvailable){
    if(!confirm(`The entered amount (${fmt(amt)}) exceeds available float space (${fmt(spaceAvailable)}).\n\nOnly ${fmt(spaceAvailable)} will be added to bring the float to its maximum of ${fmt(pettyConfig.max)}.\n\nProceed?`)) return;
  }
  const actualAdded=Math.min(amt,spaceAvailable);
  const newFloat=pettyConfig.float+actualAdded;
  await DB.addPettyEntry({
    type:'refill', amount:actualAdded,
    requestedBy:state.user?.name, status:'settled',
    createdAt:new Date().toISOString(), purpose:'Float Refill',
    reference:ref, authorizedBy:auth
  });
  await DB.savePettyConfig({ float: newFloat, max: pettyConfig.max });
  DB.addAudit('petty_refilled',`Float refilled: ${fmt(actualAdded)} (authorized by ${auth}, ref: ${ref})`,state.user?.name);
  DB.addNotification('Float Refilled',`Petty cash float refilled by ${fmt(actualAdded)}. New balance: ${fmt(newFloat)}. Authorized by: ${auth}.`,'success');
  closeModal();
  showAlert(`Float refilled by ${fmt(actualAdded)}. New balance: ${fmt(newFloat)}.${actualAdded<amt?` Note: only ${fmt(actualAdded)} added (float max reached).`:''}`, 'success');
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

async function generateMonthlyReport(){
  const income=filterByMonth(await DB.getIncome());
  const expenses=filterByMonth(await DB.getExpenses());
  const paidRems=filterByMonth(await DB.getRemittances());
  const rem=await calcRemittancesFromRecords(income);
  const totalIncome=income.reduce((s,r)=>s+(r.totalCollection||0),0);
  const totalExpenses=expenses.reduce((s,r)=>s+(r.amount||0),0);
  const totalRem=paidRems.reduce((s,r)=>s+(r.amount||0),0);
  const settings=await DB.getSettings();

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
        <tr><td>Province Rebate (20%)</td><td class="td-right">${fmt(rem.provinceRebate)}</td></tr>
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

async function generateWeeklyReport(){
  const income=filterByMonth(await DB.getIncome());
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

function generateRemittanceReport(){ printRemittanceReport(); }

async function generateQuarterlyReport(){
  let rows='';
  for(let i=2;i>=0;i--){
    let m=state.month-i; let y=state.year; if(m<0){m+=12;y--;}
    const recs=(await DB.getIncome()).filter(r=>{const d=new Date(r.date||r.createdAt);return d.getMonth()===m&&d.getFullYear()===y});
    const exps=(await DB.getExpenses()).filter(r=>{const d=new Date(r.date||r.createdAt);return d.getMonth()===m&&d.getFullYear()===y});
    const total=recs.reduce((s,r)=>s+(r.totalCollection||0),0);
    const exp=exps.reduce((s,e)=>s+(e.amount||0),0);
    const rem=await calcRemittancesFromRecords(recs);
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

async function generateExpenseReport(){
  const expenses=filterByMonth(await DB.getExpenses());
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

async function generatePettyCashReport(){
  const [pettyHistory, pettyConfig] = await Promise.all([DB.getPetty(), DB.getPettyConfig()]);
  // BUG FIX: use pettyMonthHistory() helper — old code was passing a plain object to filterByMonth(), returning ALL history instead of current month
  const history=pettyMonthHistory(pettyHistory);
  const disbursed=history.filter(h=>h.type!=='refill'&&(h.status==='approved'||h.status==='settled')).reduce((s,h)=>s+(h.actualAmount||h.amount||0),0);
  const settled=history.filter(h=>h.status==='settled'&&h.type!=='refill').reduce((s,h)=>s+(h.actualAmount||h.amount||0),0);
  const refilled=history.filter(h=>h.type==='refill').reduce((s,h)=>s+(h.amount||0),0);
  const unaccounted=disbursed-settled;
  document.getElementById('reportOutput').innerHTML=`
    <div class="card">
      <div class="card-header"><span class="card-title">Petty Cash Reconciliation — ${monthLabel()}</span><button class="btn btn-sm btn-primary" onclick="window.print()">🖨 Print</button></div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Current Float Balance</div><div class="kpi-val">${fmt(pettyConfig.float)}</div></div>
        <div class="kpi"><div class="kpi-label">Disbursed This Month</div><div class="kpi-val td-red">${fmt(disbursed)}</div></div>
        <div class="kpi"><div class="kpi-label">Receipts Settled</div><div class="kpi-val td-green">${fmt(settled)}</div></div>
        <div class="kpi"><div class="kpi-label">Unaccounted (No Receipt)</div><div class="kpi-val ${'td-amber'}">${fmt(unaccounted)}</div></div>
      </div>
      ${unaccounted>0?'<div class="alert alert-warn"><span class="alert-icon">⚠</span><span>'+fmt(unaccounted)+' disbursed but no receipt yet. Follow up with Admin Officer.</span></div>':''}
      <div class="table-wrap"><table>
        <tr><th>Date</th><th>Purpose</th><th>Requested By</th><th>Approved By</th><th>Status</th><th class="td-right">Approved</th><th class="td-right">Actual Spent</th><th>Receipt</th></tr>
        ${history.map(h=>`<tr>
          <td>${fmtDate(h.createdAt)}</td>
          <td>${h.type==='refill'?'[Float Refill]':h.purpose}</td>
          <td class="td-muted">${h.requestedBy||'—'}</td>
          <td class="td-muted">${h.approvedBy||h.authorizedBy||'—'}</td>
          <td><span class="badge ${h.status==='settled'?'badge-success':h.status==='approved'?'badge-info':h.status==='rejected'?'badge-danger':'badge-warn'}">${h.status?.replace('_',' ')||'—'}</span></td>
          <td class="td-right">${fmt(h.amount)}</td>
          <td class="td-right td-bold">${h.actualAmount!=null?fmt(h.actualAmount):h.status==='settled'?fmt(h.amount):'—'}</td>
          <td>${h.receiptNo||'—'}</td>
        </tr>`).join('')}
        <tr style="border-top:2px solid var(--border);font-weight:700">
          <td colspan="5">TOTALS</td>
          <td class="td-right">${fmt(history.filter(h=>h.type!=='refill').reduce((s,h)=>s+(h.amount||0),0))}</td>
          <td class="td-right">${fmt(settled)}</td>
          <td>${history.filter(h=>h.receiptNo).length} receipts</td>
        </tr>
      </table></div>
      <div class="print-signature">
        <div class="print-sig-box">Prepared by (Accountant)<br><br><br>${state.user?.name}</div>
        <div class="print-sig-box">Admin Officer Confirmation<br><br><br>_________________</div>
        <div class="print-sig-box">Date<br><br><br>${fmtDate(new Date().toISOString())}</div>
      </div>
    </div>`;
  document.getElementById('reportOutput').scrollIntoView({behavior:'smooth'});
}

// ── AUDIT LOG ─────────────────────────────
async function renderAudit(){
  const log=(await DB.getAudit()).slice(0,100);
  document.getElementById('pageContent').innerHTML=`
    <div class="page-header"><div class="page-title">Audit Log</div><div class="page-sub">Last 100 actions in the system</div></div>
    <div class="card"><div class="table-wrap"><table>
      <tr><th>Time</th><th>Action</th><th>Details</th><th>User</th></tr>
      ${log.length?log.map(l=>`<tr><td class="td-muted" style="white-space:nowrap">${fmtDate(l.ts)} ${fmtTime(l.ts)}</td><td><span class="badge badge-gray">${l.type?.replace(/_/g,' ')}</span></td><td>${l.detail}</td><td class="td-muted">${l.by||'—'}</td></tr>`).join(''):'<tr><td colspan="4" class="empty-table">No audit entries yet.</td></tr>'}
    </table></div></div>`;
}

// ── IT ADMIN ──────────────────────────────
async function renderAdmin(){
  if(state.user?.role!=='it_admin'){ document.getElementById('pageContent').innerHTML='<div class="card"><p style="color:var(--danger)">Access denied. IT Administrators only.</p></div>'; return }
  const users=await DB.getUsers();
  const settings=await DB.getSettings();
  const auditLog=await DB.getAudit();
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
  const list=getQuotaList(s);
  const rows=list.map((q,i)=>`
    <div class="form-group" style="display:flex;gap:8px;align-items:flex-end" id="quota-row-${i}">
      <div style="flex:2"><label class="form-label">Label</label><input type="text" class="form-input" id="ql_${i}" value="${esc(q.label)}" placeholder="e.g. Building Fund" /></div>
      <div style="flex:1"><label class="form-label">Amount (₦)</label><input type="number" class="form-input" id="qa_${i}" value="${q.amount||0}" min="0" /></div>
      <button class="btn" style="padding:8px 10px;color:var(--danger);margin-bottom:0" onclick="App.removeQuotaRow(${i})" title="Remove">✕</button>
    </div>`).join('');
  return `<div class="card">
    <div class="modal-title" style="font-size:15px;margin-bottom:8px">Monthly Fixed Quotas</div>
    <p style="font-size:12px;color:var(--text3);margin-bottom:1rem">These flat amounts are remitted monthly regardless of income fluctuations. They are included in the bulk remittance payment each month.</p>
    <div id="quota-rows-container">${rows}</div>
    <button class="btn" style="margin-top:4px;margin-bottom:12px" onclick="App.addQuotaRow()">➕ Add Quota</button><br/>
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
      <tr><td>TG → Seed — Pastor's Children</td><td>${rateInput('rate_tgSeed', r.tgSeed ?? DEFAULT_REMITTANCE_RATES.tgSeed)}</td></tr>
    </table></div>
    <hr class="divider">
    <div class="form-row" style="align-items:center;gap:12px">
      <label class="form-label" style="margin:0;flex:1">Province Rebate — % of Local Retained Tithes (Members' + Ministers' only):</label>
      ${rateInput('rate_provinceRebate', r.provinceRebate ?? DEFAULT_REMITTANCE_RATES.provinceRebate)}
    </div>
    <br>
    <button class="btn btn-primary" onclick="App.saveRates()">Save Remittance Rates</button>
  </div>`;
}

async function saveRates(){
  const s = await DB.getSettings();
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
  await DB.saveSettings(s);
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

async function saveSettings(){
  const s=await DB.getSettings();
  s.churchName=document.getElementById('set_name')?.value;
  s.bankName=document.getElementById('set_bank')?.value;
  s.accountNo=document.getElementById('set_acct')?.value;
  s.pettyMax=parseFloat(document.getElementById('set_petty')?.value)||50000;
  await DB.saveSettings(s);
  showAlert('Settings saved!','success');
}

function addQuotaRow(){
  const container=document.getElementById('quota-rows-container');
  if(!container) return;
  const i=container.querySelectorAll('.form-group').length;
  const div=document.createElement('div');
  div.className='form-group';
  div.id=`quota-row-${i}`;
  div.style.cssText='display:flex;gap:8px;align-items:flex-end';
  div.innerHTML=`<div style="flex:2"><label class="form-label">Label</label><input type="text" class="form-input" id="ql_${i}" value="" placeholder="e.g. Building Fund" /></div><div style="flex:1"><label class="form-label">Amount (₦)</label><input type="number" class="form-input" id="qa_${i}" value="0" min="0" /></div><button class="btn" style="padding:8px 10px;color:var(--danger);margin-bottom:0" onclick="App.removeQuotaRow(${i})" title="Remove">✕</button>`;
  container.appendChild(div);
}

function removeQuotaRow(i){
  const row=document.getElementById(`quota-row-${i}`);
  if(row) row.remove();
}

async function saveQuotas(){
  const container=document.getElementById('quota-rows-container');
  const list=[];
  if(container){
    container.querySelectorAll('.form-group').forEach((row,i)=>{
      const label=(document.getElementById(`ql_${i}`)?.value||'').trim();
      const amount=parseFloat(document.getElementById(`qa_${i}`)?.value)||0;
      if(label) list.push({ label, amount });
    });
  }
  const s=await DB.getSettings();
  s.quotaList=list;
  delete s.quotas; // remove legacy format
  await DB.saveSettings(s);
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

async function addUser(){
  const name=document.getElementById('nu_name')?.value?.trim();
  const role=document.getElementById('nu_role')?.value;
  const email=document.getElementById('nu_email')?.value;
  const pin=document.getElementById('nu_pin')?.value;
  if(!name||!role||!pin||pin.length<4){ alert('Please fill name, role, and PIN (min 4 digits).'); return }
  await DB.addUser({ name, role, email, pin });
  DB.addAudit('user_added',`New user added: ${name} (${role})`,state.user?.name);
  closeModal();
  showAlert(`User ${name} added successfully!`,'success');
  renderAdmin();
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
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.updateUser('${id}')">Update</button></div>`);
}

async function updateUser(id){
  const updateData = { name:document.getElementById('eu_name')?.value, role:document.getElementById('eu_role')?.value, email:document.getElementById('eu_email')?.value, pin:document.getElementById('eu_pin')?.value };
  await DB.updateUser(id, updateData);
  DB.addAudit('user_updated',`User updated: ${updateData.name}`,state.user?.name);
  closeModal();
  showAlert('User updated!','success');
  renderAdmin();
}

async function deleteUser(id){
  const usersDelU=await DB.getUsers();
  const u=usersDelU.find(x=>x.id===id);
  if(!u||!confirm(`Delete user "${u.name}"? This cannot be undone.`)) return;
  await DB.deleteUser(id);
  DB.addAudit('user_deleted',`User deleted: ${u.name}`,state.user?.name);
  showAlert('User deleted.','warn');
  renderAdmin();
}

async function exportData(){
  const [users,income,remittances,expenses,petty,auditLog,settings,cashTransactions] = await Promise.all([DB.getUsers(),DB.getIncome(),DB.getRemittances(),DB.getExpenses(),DB.getPetty(),DB.getAudit(),DB.getSettings(),DB.getCashTransactions()]);
  const data={ users,income,remittances,expenses,petty,audit:auditLog,settings,cashTransactions, exportedAt:new Date().toISOString(), exportedBy:state.user?.name };
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
// 8. PUBLIC API
// ──────────────────────────────────────────
return {
  onRoleChange, login, logout, navigate, toggleSidebar, toggleNotifications,
  onMonthChange, setIncomeTab, showIncomeForm, updateIncomeTotal, updateIncomeCashBreakdown, submitIncome,
  showOtherIncomeForm, submitOtherIncome,
  viewIncome, confirmDeposit, submitCashDeposit, confirmBulkDeposit, submitBulkDeposit, updateBulkDepositTotal, toggleBulkSelectAll, showRemittancePaymentModal, submitRemittance, onRemDatesChange, onRemMethodChange, onRemSplitChange, printRemittanceReport, approveRemittance,
  updateExpenseSubcats, updateExpenseDescRequired,
  showExpenseForm, submitExpense, viewExpenseReceipt, onExpMethodChange, onExpSplitChange, setExpCatFilter, setExpSearch, setExpSort, clearExpFilters, updateExpenseSubcats, updateExpenseDescRequired,
  showBankWithdrawal, submitBankWithdrawal,
  setBankTab, showBankChargeForm, submitBankCharge, compareBankBalance,
  renderPettyCash, showPettyRequest, submitPettyRequest,
  approvePetty, rejectPetty, submitPettyReceipt, confirmPettyReceipt, showPettyRefill, submitRefill,
  generateMonthlyReport, generateWeeklyReport, generateRemittanceReport,
  generateQuarterlyReport, generateExpenseReport, generatePettyCashReport,
  setAdminTab, saveSettings, saveQuotas, addQuotaRow, removeQuotaRow, saveRates, showAddUser, addUser, editUser,
  updateUser, deleteUser, exportData, importData, clearAllData,
  showKPSCAlert, submitKPSCAlert, closeModal: closeModal
};

})();

// Global helpers
function closeModal(){ const o=document.getElementById('modalOverlay'); if(o) o.remove() }
