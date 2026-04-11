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

const TG_SPLIT = { national:0.75, area:0.05, pastor:0.10, ministers:0.09, seed:0.01 };
const PROVINCE_REBATE = 0.20;

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

const DEFAULT_QUOTAS = { rmf:5000, csr:3000, edu:2000, camp:5000, mummy:8000, volunteer:2000, goFishing:10000 };

// ──────────────────────────────────────────
// 2. DATA LAYER — Cloudflare D1 via API
// All methods are async (fetch to /api/*)
// ──────────────────────────────────────────

// In-memory cache so we don't re-fetch on every render within a session
const cache = {};

async function apiFetch(path, method='GET', body=null){
  const opts = { method, headers:{'Content-Type':'application/json'} };
  if(body) opts.body = JSON.stringify(body);
  const res = await fetch('/api/'+path, opts);
  if(!res.ok){
    const e = await res.json().catch(()=>({error:'Network error'}));
    throw new Error(e.error||`API error ${res.status}`);
  }
  return res.json();
}

const DB = {
  // ── Auth ──
  async getLoginUsers(){ return apiFetch('auth') },
  async login(role, pin, userId){
    return apiFetch('auth','POST',{ role, pin, userId: userId || '' });
  },

  // ── Users ──
  async getUsers(){ return apiFetch('users') },
  async addUser(data){ cache.users=null; return apiFetch('users','POST',data) },
  async updateUser(id,data){ cache.users=null; return apiFetch(`users/${id}`,'PUT',data) },
  async deleteUser(id){ cache.users=null; return apiFetch(`users/${id}`,'DELETE') },

  // ── Income ──
  async getIncome(){ return apiFetch('income') },
  async addIncome(rec){
    await this.addAudit('income_recorded',`Income recorded: ${fmt(rec.totalCollection)} for ${rec.date}`,state.user?.name);
    return apiFetch('income','POST',rec);
  },
  async updateIncome(id,data){ return apiFetch(`income/${id}`,'PUT',data) },

  // ── Expenses ──
  async getExpenses(){ return apiFetch('expenses') },
  async addExpense(rec){
    await this.addAudit('expense_logged',`Expense: ${rec.description} — ${fmt(rec.amount)}`,state.user?.name);
    return apiFetch('expenses','POST',rec);
  },

  // ── Petty Cash ──
  async getPettyConfig(){ return apiFetch('petty-config') },
  async savePettyConfig(data){ return apiFetch('petty-config','POST',data) },
  async getPetty(){ return apiFetch('petty') },
  async addPettyEntry(data){ return apiFetch('petty','POST',data) },
  async updatePettyEntry(id,data){ return apiFetch(`petty/${id}`,'PUT',data) },

  // ── Remittances ──
  async getRemittances(){ return apiFetch('remittances') },
  async addRemittance(data){ return apiFetch('remittances','POST',data) },

  // ── Audit ──
  async getAudit(){ return apiFetch('audit') },
  async addAudit(type,detail,by){
    return apiFetch('audit','POST',{type,detail,by:by||'System'}).catch(()=>{});
  },

  // ── Settings ──
  async getSettings(){ return apiFetch('settings') },
  async saveSettings(data){ return apiFetch('settings','POST',data) },

  // ── Notifications ──
  async getNotifications(){ return apiFetch('notifications') },
  async addNotification(title,body,type='info'){
    const r = await apiFetch('notifications','POST',{title,body,type}).catch(()=>{});
    updateNotifBadge();
    return r;
  },
  async markAllRead(){
    await apiFetch('notifications/read','POST').catch(()=>{});
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
function calcRemittances(income){
  const res = { lines:[], totalNatl:0, totalArea:0, totalPastor:0, totalMinisters:0, localBefore:0, provinceRebate:0, netLocal:0 };
  INCOME_TYPES.forEach(t=>{
    const amt = income[t.key]||0;
    if(!amt) return;
    if(t.special==='tg'){
      const line = { label:t.label, total:amt, national: amt*TG_SPLIT.national, area: amt*TG_SPLIT.area,
        pastor: amt*TG_SPLIT.pastor, ministers: amt*TG_SPLIT.ministers, seed: amt*TG_SPLIT.seed, local:0 };
      res.lines.push(line);
      res.totalNatl+=line.national; res.totalArea+=line.area;
      res.totalPastor+=line.pastor; res.totalMinisters+=line.ministers;
    } else {
      const local = amt*(t.local||0);
      const natl = amt*(t.natl||0);
      res.lines.push({ label:t.label, total:amt, national:natl, local });
      res.totalNatl+=natl; res.localBefore+=local;
    }
  });
  res.provinceRebate = res.localBefore * PROVINCE_REBATE;
  res.netLocal = res.localBefore - res.provinceRebate;
  return res;
}

function showModal(html){ const o=document.createElement('div'); o.className='modal-overlay'; o.id='modalOverlay'; o.innerHTML=`<div class="modal">${html}</div>`; document.body.appendChild(o) }
function closeModal(){ const o=document.getElementById('modalOverlay'); if(o) o.remove() }
function showAlert(msg,type='success'){ const a=document.createElement('div'); a.className=`alert alert-${type}`; a.innerHTML=`<span class="alert-icon">${type==='success'?'✓':type==='danger'?'✕':'⚠'}</span><span>${msg}</span>`; const pc=document.getElementById('pageContent'); if(pc){ pc.insertBefore(a,pc.firstChild); setTimeout(()=>a.remove(),4000) } }
async function updateNotifBadge(){
  try {
    const notifs = await DB.getNotifications();
    const unread = notifs.filter(n=>!n.read).length;
    const el = document.getElementById('notifCount');
    if(el){ el.textContent=unread; el.style.display=unread?'flex':'none'; }
  } catch(e) {}
}

// ──────────────────────────────────────────
// 5. AUTH
// ──────────────────────────────────────────
async function onRoleChange(){
  const role = document.getElementById('roleSelect').value;
  const wrap = document.getElementById('userSelectWrap');
  const sel = document.getElementById('userSelect');
  if(!role){ wrap.style.display='none'; return }
  // Fetch users for the selector via auth endpoint (PINs are never returned)
  let users = [];
  try {
    await apiFetch('init').catch(()=>{});
    const all = await DB.getLoginUsers();
    users = all.filter(u=>u.role===role);
  } catch(e) { users = [] }
  if(users.length>1){
    wrap.style.display='block';
    sel.innerHTML = users.map(u=>`<option value="${u.id}">${u.name}</option>`).join('');
  } else { wrap.style.display='none' }
}

async function login(){
  const role = document.getElementById('roleSelect').value;
  const pin = document.getElementById('pinInput').value.trim();
  const selectedUserId = document.getElementById('userSelect')?.value;
  const errEl = document.getElementById('loginError');
  if(!role||!pin){ errEl.textContent='Please select a role and enter your PIN.'; errEl.style.display='block'; return }
  const btn = document.querySelector('#loginScreen .btn-primary');
  if(btn){ btn.textContent='Connecting…'; btn.disabled=true; }
  try {
    // Init DB — creates tables and seeds users if first time
    const initRes = await apiFetch('init').catch(e=>({ error: e.message }));
    if(initRes?.error){ console.warn('Init warning:', initRes.error); }

    const loginUsers = await DB.getLoginUsers();

    // Debug: show count if no users found
    if(!loginUsers || loginUsers.length === 0){
      errEl.textContent = 'No users found in database. Visit /api/init to set up the database first.';
      errEl.style.display='block';
      if(btn){ btn.textContent='Sign In'; btn.disabled=false; }
      return;
    }

    const users = loginUsers.filter(u => u.role === role);
    if(!users.length){
      errEl.textContent = `No users found for role "${role}". Check IT Admin panel.`;
      errEl.style.display='block';
      if(btn){ btn.textContent='Sign In'; btn.disabled=false; }
      return;
    }

    const authRes = await DB.login(role, pin, users.length > 1 ? selectedUserId : '');
    const user = authRes?.user;
    if(!user) throw new Error('Incorrect PIN. Please try again.');
    state.allUsers = await DB.getUsers();

    errEl.style.display='none';
    state.user = user;
    DB.addAudit('login','User logged in',user.name);
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('appShell').style.display='flex';
    initApp();
  } catch(e) {
    const msg = e?.message || 'Could not reach database.';
    errEl.textContent = /incorrect pin|required|no users/i.test(msg) ? msg : ('Connection error: ' + msg);
    errEl.style.display='block';
    if(btn){ btn.textContent='Sign In'; btn.disabled=false; }
  }
}

function logout(){
  DB.addAudit('logout','User logged out',state.user?.name);
  state.user=null; state.page='dashboard'; state.allUsers=[];
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

async function onMonthChange(){
  const [y,m] = document.getElementById('globalMonth').value.split('-').map(Number);
  state.year=y; state.month=m;
  navigate(state.page);
}

async function buildSidebar(){
  let sections = {};
  NAV.forEach(item=>{
    if(!item.minRole.includes('all') && !item.minRole.includes(state.user?.role)) return;
    if(!sections[item.section]) sections[item.section]=[];
    sections[item.section].push(item);
  });
  const nav = document.getElementById('sidebarNav');
  let html='';
  const pendingCount = await getPettyCashPendingCount();
  for(const [sec,items] of Object.entries(sections)){
    html+=`<div class="nav-section">${sec}</div>`;
    for(const item of items){
      const notifs = item.id==='petty_cash' ? pendingCount : 0;
      html+=`<div class="nav-item${state.page===item.id?' active':''}" onclick="App.navigate('${item.id}')" data-page="${item.id}">
        <span class="nav-icon">${item.icon}</span>${item.label}
        ${notifs>0?`<span class="nav-badge">${notifs}</span>`:''}
      </div>`;
    }
  }
  nav.innerHTML=html;
}

async function buildBottomNav(){
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

async function updateSidebarUser(){
  const u = state.user;
  if(!u) return;
  const r = ROLES[u.role];
  document.getElementById('sidebarUser').innerHTML=`
    <strong>${u.name}</strong>
    <span style="display:inline-block;margin-top:4px;font-size:11px;padding:2px 8px;border-radius:10px;background:${r.bg};color:${r.color};font-weight:600">${r.label}</span>`;
}

async function navigate(page){
  state.page=page;
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  document.querySelectorAll('.bn-item').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  const titles={dashboard:'Dashboard',income:'Record Income',remittances:'Remittances',
    expenses:'Expenses',petty_cash:'Petty Cash',reports:'Reports',audit:'Audit Log',admin:'IT Admin Panel'};
  document.getElementById('topBarTitle').textContent=titles[page]||page;
  const pc=document.getElementById('pageContent');
  pc.innerHTML='<div style="padding:48px;text-align:center;color:var(--text3)"><div style="font-size:28px;margin-bottom:8px">⏳</div>Loading…</div>';
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
  document.getElementById('notifPanel').style.display='none';
  renderPage(page);
}

async function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('visible');
}

async function toggleNotifications(){
  const panel=document.getElementById('notifPanel');
  const showing=panel.style.display==='block';
  panel.style.display=showing?'none':'block';
  if(!showing){
    const list=document.getElementById('notifList');
    list.innerHTML='<div class="notif-empty">Loading…</div>';
    try {
      const notifs = await DB.getNotifications();
      if(!notifs.length){ list.innerHTML='<div class="notif-empty">No notifications</div>'; }
      else { list.innerHTML=notifs.slice(0,15).map(n=>`<div class="notif-item" style="opacity:${n.read?0.6:1}"><div class="notif-item-title">${n.title}</div><div class="notif-item-body">${n.body}</div><div class="notif-item-time">${fmtDate(n.ts)} ${fmtTime(n.ts)}</div></div>`).join('') }
      DB.markAllRead();
    } catch(e) { list.innerHTML='<div class="notif-empty">Could not load notifications.</div>'; }
  }
}

async function getPettyCashPendingCount(){
  try {
    const history = await DB.getPetty();
    return (history||[]).filter(h=>h.status==='pending_approval').length;
  } catch(e){ return 0; }
}

// ──────────────────────────────────────────
// 7. PAGE RENDERERS
// ──────────────────────────────────────────
async function renderPage(page){
  const pages={dashboard:renderDashboard,income:renderIncome,remittances:renderRemittances,
    expenses:renderExpenses,petty_cash:renderPettyCash,reports:renderReports,
    audit:renderAudit,admin:renderAdmin};
  try {
    if(pages[page]) await pages[page]();
    else document.getElementById('pageContent').innerHTML='<div class="card"><p>Page not found.</p></div>';
  } catch(e) {
    document.getElementById('pageContent').innerHTML=`<div class="card"><div class="alert alert-danger"><span class="alert-icon">✕</span><span>Could not load this page: ${e.message}</span></div></div>`;
  }
}

// ── DASHBOARD ────────────────────────────
async function renderDashboard(){
  const income = filterByMonth(await DB.getIncome());
  const expenses = filterByMonth(await DB.getExpenses());
  const [pettyHistory, pettyConfig] = await Promise.all([DB.getPetty(), DB.getPettyConfig()]);
  const petty = { history: pettyHistory, ...pettyConfig };
  const settings = await DB.getSettings();
  const allIncome = await DB.getIncome();
  const allExpenses = await DB.getExpenses();

  const totalIncome = income.reduce((s,r)=>s+(r.totalCollection||0),0);
  const totalExpenses = expenses.reduce((s,r)=>s+(r.amount||0),0);
  const remittances = calcRemittancesFromRecords(income);
  const netLocal = remittances.netLocal;
  const bankBalance = totalIncome - totalExpenses - remittances.totalNatl - remittances.totalArea - remittances.provinceRebate;
  const pendingPetty = getPettyCashPendingCount();
  const allRemittances = await DB.getRemittances();
  const overdueRems = allRemittances.filter(r=>r.status==='overdue').length;

  // Feed items
  const recentIncome = allIncome.slice(0,3);
  const recentExp = allExpenses.slice(0,3);
  const feedItems = [...recentIncome.map(r=>({type:'income',date:r.date,desc:`Sunday collections deposited`,amt:r.totalCollection,icon:'📥',color:'#E1F5EE'})),
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
  if(bankBalance<50000 && bankBalance>0) alerts+=`<div class="alert alert-warn"><span class="alert-icon">💰</span><span>Bank balance is running low. Consider notifying the KPSC if remittances cannot be covered.</span></div>`;

  // Monthly trend (last 4 months) — use already-fetched allIncome, no extra DB call
  const trendData = [];
  for(let i=3;i>=0;i--){
    let m=state.month-i; let y=state.year;
    if(m<0){m+=12;y--;}
    const recs=allIncome.filter(r=>{const d=new Date(r.date||r.createdAt);return d.getMonth()===m&&d.getFullYear()===y});
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
      <div class="kpi">
        <div class="kpi-icon" style="background:#EAF3DE">💰</div>
        <div class="kpi-label">Petty Cash Float</div>
        <div class="kpi-val">${fmt(petty.float)}</div>
        <div class="kpi-delta ${petty.float<10000?'down':'up'}">of ${fmt(petty.max)} max float</div>
      </div>
    </div>

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
          <div class="status-row"><div><div class="status-row-label">Province Rebate (20%)</div></div><div class="status-row-right"><div class="status-row-amt">${fmt(remittances.provinceRebate)}</div></div></div>
          <div class="status-row" style="border-top:2px solid var(--border);margin-top:4px;padding-top:12px"><div><div class="status-row-label fw-bold">Net Local Retained</div></div><div class="status-row-right"><div class="status-row-amt" style="color:var(--primary);font-size:15px">${fmt(remittances.netLocal)}</div></div></div>
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
        ${can('reports')?`<button class="qa-btn" onclick="App.navigate('reports')"><div class="qa-icon" style="background:#EEEDFE">📊</div><div class="qa-label">Reports</div><div class="qa-sub">Generate statements</div></button>`:''}
        <button class="qa-btn" onclick="App.showKPSCAlert()"><div class="qa-icon" style="background:#FAEEDA">🔔</div><div class="qa-label">Alert KPSC</div><div class="qa-sub">Emergency support</div></button>
      </div>
    </div>`:''}`;
}

function calcRemittancesFromRecords(records){
  const combined = {};
  INCOME_TYPES.forEach(t=>{ combined[t.key]=0 });
  records.forEach(r=>{ INCOME_TYPES.forEach(t=>{ combined[t.key]+=(r[t.key]||0) }) });
  return calcRemittances(combined);
}

// ── INCOME ────────────────────────────────
async function renderIncome(){
  const allRecords = await DB.getIncome();
  const records = filterByMonth(allRecords);
  const tab = state.incomeTab||'list';
  document.getElementById('pageContent').innerHTML=`
    <div class="page-header">
      <div><div class="page-title">Income Recording</div><div class="page-sub">${monthLabel()}</div></div>
      ${can('income')?`<button class="btn btn-primary" onclick="App.showIncomeForm()">+ Record Sunday Collections</button>`:''}
    </div>
    <div class="tabs">
      <button class="tab ${tab==='list'?'active':''}" onclick="App.setIncomeTab('list')">Collection History</button>
      <button class="tab ${tab==='summary'?'active':''}" onclick="App.setIncomeTab('summary')">Monthly Summary</button>
      <button class="tab ${tab==='all'?'active':''}" onclick="App.setIncomeTab('all')">All Records</button>
    </div>
    ${tab==='list'?renderIncomeList(records):tab==='summary'?renderIncomeSummary(records):renderIncomeList(allRecords)}`;
}

function setIncomeTab(t){ state.incomeTab=t; renderIncome() }

function renderIncomeList(records){
  if(!records.length) return '<div class="card"><div class="empty-table">No income records found. Click "Record Sunday Collections" to add one.</div></div>';
  return `<div class="card"><div class="table-wrap"><table>
    <tr><th>Date</th><th>Total Collection</th><th>Deposit Status</th><th>Recorded By</th><th>Actions</th></tr>
    ${records.map(r=>`<tr>
      <td><strong>${fmtDate(r.date)}</strong><div class="td-muted">${r.notes||''}</div></td>
      <td class="td-green td-bold">${fmt(r.totalCollection)}</td>
      <td><span class="badge ${r.depositConfirmed?'badge-success':'badge-warn'}">${r.depositConfirmed?'Deposited':'Pending Deposit'}</span></td>
      <td class="td-muted">${r.recordedBy||'—'}</td>
      <td><button class="btn btn-sm" onclick="App.viewIncome('${r.id}')">View</button>
      ${can('income')&&!r.depositConfirmed?`<button class="btn btn-sm btn-primary" onclick="App.confirmDeposit('${r.id}')" style="margin-left:4px">Confirm Deposit</button>`:''}</td>
    </tr>`).join('')}
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
          <div class="status-row-label">Province Rebate (20%)</div><div class="status-row-amt td-amber">${fmt(rem.provinceRebate)}</div>
        </div>
        <div class="status-row" style="border-top:2px solid var(--border);margin-top:4px"><div class="status-row-label fw-bold">Net Local Retained</div><div class="status-row-amt" style="color:var(--primary);font-size:16px">${fmt(rem.netLocal)}</div></div>
      </div>
    </div>`;
}

async function showIncomeForm(){
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
    <div class="form-group mt-2"><label class="form-label">Notes (optional)</label><textarea id="inc_notes" class="form-textarea" placeholder="Special offerings, events, etc."></textarea></div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="App.submitIncome()">Save & Calculate Remittances</button>
    </div>`);
}

async function updateIncomeTotal(){
  let total=0;
  INCOME_TYPES.forEach(t=>{ total+=parseFloat(document.getElementById('inc_'+t.key)?.value||0)||0 });
  const el=document.getElementById('inc_total');
  if(el) el.textContent=fmt(total);
}

async function submitIncome(){
  const date=document.getElementById('inc_date')?.value;
  const usher=document.getElementById('inc_usher')?.value?.trim();
  if(!date){ alert('Please select a date.'); return }
  if(!usher){ alert('Please enter the Head Usher name for counter-signing.'); return }
  const rec={date,usher,recordedBy:state.user?.name,depositConfirmed:false};
  let total=0;
  INCOME_TYPES.forEach(t=>{ const v=parseFloat(document.getElementById('inc_'+t.key)?.value||0)||0; rec[t.key]=v; total+=v });
  if(!total){ alert('Please enter at least one income amount.'); return }
  rec.totalCollection=total;
  rec.notes=document.getElementById('inc_notes')?.value||'';
  await DB.addIncome(rec);
  await DB.addNotification('Income Recorded',`${fmt(total)} recorded for ${fmtDate(date)}`,'success');
  closeModal();
  showAlert(`Income of ${fmt(total)} recorded successfully!`,'success');
  renderIncome();
  buildSidebar();
}

async function viewIncome(id){
  const allIncome = await DB.getIncome();
  const r=allIncome.find(x=>x.id===id);
  if(!r) return;
  const rem=calcRemittances(r);
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">Income Details — ${fmtDate(r.date)}</div>
    <div class="grid-2">
      <div><div class="amount-label">Total Collection</div><div class="amount-display">${fmt(r.totalCollection)}</div></div>
      <div><div class="amount-label">To National HQ</div><div class="amount-display" style="color:var(--danger)">${fmt(rem.totalNatl)}</div></div>
    </div>
    <hr class="divider">
    <p class="card-title">Income Breakdown</p>
    ${INCOME_TYPES.filter(t=>r[t.key]).map(t=>`<div class="status-row"><div class="status-row-label">${t.label}</div><div class="status-row-amt">${fmt(r[t.key])}</div></div>`).join('')}
    <hr class="divider">
    <p class="card-title">Remittances Due</p>
    ${rem.lines.map(l=>`<div class="status-row"><div class="status-row-label">${l.label} → HQ</div><div class="status-row-amt td-red">${fmt(l.national||0)}</div></div>`).join('')}
    <div class="status-row"><div class="status-row-label">Province Rebate (20%)</div><div class="status-row-amt td-amber">${fmt(rem.provinceRebate)}</div></div>
    <div class="status-row" style="border-top:2px solid var(--border)"><div class="status-row-label fw-bold">Net Local Retained</div><div class="status-row-amt td-green" style="font-size:15px">${fmt(rem.netLocal)}</div></div>
    <hr class="divider">
    <div class="fs-12 text-muted">Recorded by: ${r.recordedBy||'—'} · Counted with: ${r.usher||'—'}</div>
    <div class="fs-12 text-muted">Status: <span class="badge ${r.depositConfirmed?'badge-success':'badge-warn'}">${r.depositConfirmed?'Deposited ('+r.tellerNo+')':'Pending Deposit'}</span></div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Close</button>
    ${can('income')&&!r.depositConfirmed?`<button class="btn btn-primary" onclick="App.confirmDeposit('${r.id}')">Confirm Bank Deposit</button>`:''}</div>`);
}

async function confirmDeposit(id){
  const teller=prompt('Enter bank teller/reference number:');
  if(!teller) return;
  await DB.updateIncome(id, { depositConfirmed:true, tellerNo:teller, depositedBy:state.user?.name, depositDate:new Date().toISOString() });
  await DB.addAudit('deposit_confirmed',`Deposit confirmed for ${id} — Teller: ${teller}`,state.user?.name);
  closeModal();
  showAlert('Bank deposit confirmed!','success');
  renderIncome();
}

// ── REMITTANCES ───────────────────────────
async function renderRemittances(){
  const income = filterByMonth(await DB.getIncome());
  const rem = calcRemittancesFromRecords(income);
  const paidRems = filterByMonth(await DB.getRemittances());
  const settings = await DB.getSettings();
  const quotas = settings.quotas||DEFAULT_QUOTAS;
  const totalPaid = paidRems.filter(r=>r.status==='paid').reduce((s,r)=>s+(r.amount||0),0);

  const lines = [
    ...rem.lines.map(l=>({ label:l.label+' → National HQ', amount:l.national||0, type:'percentage' })),
    { label:'Area (Thanksgiving 5%)', amount:rem.totalArea, type:'percentage' },
    { label:"Pastor's Share (TG 10%)", amount:rem.totalPastor, type:'percentage' },
    { label:"Ministers' Share (TG 9%)", amount:rem.totalMinisters, type:'percentage' },
    { label:"Pastors' Seed (TG 1%)", amount:rem.totalMinisters/9, type:'percentage' },
    { label:'Province Rebate (20% of local)', amount:rem.provinceRebate, type:'percentage' },
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

async function markRemittancePaid(){
  const income = filterByMonth(await DB.getIncome());
  const rem = calcRemittancesFromRecords(income);
  const settings = await DB.getSettings();
  const quotas = settings.quotas||DEFAULT_QUOTAS;
  const lines=[
    ...rem.lines.map(l=>({ label:l.label+' → National HQ', amount:l.national||0 })),
    { label:'Province Rebate (20% of local)', amount:rem.provinceRebate },
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

async function setRemAmt(){
  const sel=document.getElementById('rem_label');
  const opt=sel.options[sel.selectedIndex];
  const amt=opt?.dataset?.amt;
  if(amt) document.getElementById('rem_amount').value=amt;
}

async function submitRemittance(){
  const label=document.getElementById('rem_label')?.value;
  const amount=parseFloat(document.getElementById('rem_amount')?.value)||0;
  const date=document.getElementById('rem_date')?.value;
  const reference=document.getElementById('rem_ref')?.value;
  const auth=document.getElementById('rem_auth')?.value;
  if(!label||!amount||!date){ alert('Please fill all required fields.'); return }
  const remData = { label, amount, paidDate:date, reference, authorizedBy:auth, status:'paid' };
  await DB.addRemittance(remData);
  await DB.addAudit('remittance_paid',`Remittance paid: ${label} — ${fmt(amount)}`,state.user?.name);
  await DB.addNotification('Remittance Recorded',`${label}: ${fmt(amount)} paid on ${fmtDate(date)}`,'success');
  closeModal();
  showAlert('Remittance payment recorded!','success');
  renderRemittances();
}

// ── EXPENSES ──────────────────────────────
async function renderExpenses(){
  const expenses=filterByMonth(await DB.getExpenses());
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
        <tr><th>Date</th><th>Category</th><th>Description</th><th class="td-right">Amount</th><th>Recorded By</th><th>Receipt</th></tr>
        ${expenses.map(e=>{const c=EXPENSE_CATS.find(x=>x.key===e.category)||{};return`<tr>
          <td>${fmtDate(e.date||e.createdAt)}</td>
          <td><span class="badge badge-gray">${c.icon||''} ${c.label||e.category}</span></td>
          <td>${e.description}</td>
          <td class="td-right td-red td-bold">${fmt(e.amount)}</td>
          <td class="td-muted">${e.recordedBy||'—'}</td>
          <td class="td-muted">${e.receiptNo||'—'}</td>
        </tr>`}).join('')}
      </table></div>`:'<div class="empty-table">No expenses recorded this month.</div>'}
    </div>`;
}

async function showExpenseForm(){
  const today=new Date().toISOString().split('T')[0];
  showModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">💸 Log Expense</div>
    <div class="form-group"><label class="form-label">Date</label><input type="date" id="exp_date" class="form-input" value="${today}" max="${today}" /></div>
    <div class="form-group"><label class="form-label">Category</label>
      <select id="exp_cat" class="form-select">
        <option value="">— Select category —</option>
        ${EXPENSE_CATS.map(c=>`<option value="${c.key}">${c.icon} ${c.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label class="form-label">Description</label><input type="text" id="exp_desc" class="form-input" placeholder="What was purchased / paid for?" /></div>
    <div class="form-group"><label class="form-label">Amount (₦)</label><input type="number" id="exp_amt" class="form-input" placeholder="0" min="0" /></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Receipt / Invoice No.</label><input type="text" id="exp_receipt" class="form-input" placeholder="Optional" /></div>
      <div class="form-group"><label class="form-label">Payment Method</label>
        <select id="exp_method" class="form-select"><option value="petty_cash">Petty Cash</option><option value="bank_transfer">Bank Transfer</option></select>
      </div>
    </div>
    <div class="form-group"><label class="form-label">Notes</label><textarea id="exp_notes" class="form-textarea" placeholder="Additional details..."></textarea></div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="App.submitExpense()">Save Expense</button></div>`);
}

async function submitExpense(){
  const date=document.getElementById('exp_date')?.value;
  const category=document.getElementById('exp_cat')?.value;
  const description=document.getElementById('exp_desc')?.value?.trim();
  const amount=parseFloat(document.getElementById('exp_amt')?.value)||0;
  if(!date||!category||!description||!amount){ alert('Please fill all required fields.'); return }
  await DB.addExpense({ date, category, description, amount, receiptNo:document.getElementById('exp_receipt')?.value, paymentMethod:document.getElementById('exp_method')?.value, notes:document.getElementById('exp_notes')?.value, recordedBy:state.user?.name, status:'approved' });
  closeModal();
  showAlert('Expense logged successfully!','success');
  renderExpenses();
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
  const petty = { history: pettyHistory, ...pettyConfig };
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
  const petty = await DB.getPettyConfig();
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
  const pettyConfig = await DB.getPettyConfig();
  if(amount>pettyConfig.float){
    if(!confirm(`The requested amount (${fmt(amount)}) exceeds the current float (${fmt(pettyConfig.float)}). Submit anyway for the Accountant to review?`)) return;
  }
  const req={
    id:'PC-'+Date.now(), purpose, amount, category,
    dateNeeded:document.getElementById('pet_date')?.value,
    notes:document.getElementById('pet_notes')?.value,
    requestedBy:state.user?.name, status:'pending_approval',
    createdAt:new Date().toISOString()
  };
  await DB.addPettyEntry(req);
  await DB.addAudit('petty_requested',`Petty cash requested: ${purpose} — ${fmt(amount)}`,state.user?.name);
  await DB.addNotification('Petty Cash Request',`${state.user?.name} requested ${fmt(amount)} for "${purpose}". Awaiting approval.`,'warn');
  closeModal();
  showAlert('Request submitted! The Accountant and a Signatory will review and approve.','success');
  renderPettyCash();
  buildSidebar();
}

async function approvePetty(id){
  const [history, cfg] = await Promise.all([DB.getPetty(), DB.getPettyConfig()]);
  const req=history.find(h=>h.id===id);
  if(!req) return;
  if(req.amount>cfg.float){
    alert(`Cannot approve: Insufficient float.\nRequired: ${fmt(req.amount)}\nAvailable: ${fmt(cfg.float)}\n\nPlease refill the float first, then approve this request.`);
    return;
  }
  // BUG FIX 5 & NEW: record approver name and approval timestamp explicitly
  const newFloat = cfg.float - req.amount;
  await DB.updatePettyEntry(req.id, { status:'approved', approvedBy:state.user?.name, approvedAt:new Date().toISOString() });
  await DB.savePettyConfig({ float:newFloat, max:cfg.max });
  await DB.addAudit('petty_approved',`Petty cash approved: "${req.purpose}" — ${fmt(req.amount)} (approved by ${state.user?.name})`,state.user?.name);
  await DB.addNotification('Petty Cash Approved',`"${req.purpose}" — ${fmt(req.amount)} approved by ${state.user?.name}. Receipt due within 48 hours.`,'success');
  showAlert(`Approved. ${fmt(req.amount)} deducted from float. Remind ${req.requestedBy} to return receipt within 48 hours.`,'success');
  renderPettyCash();
  buildSidebar();
}

async function rejectPetty(id){
  const reason=prompt('Reason for rejection (the requester will see this):');
  const [pettyHistory, pettyConfig] = await Promise.all([DB.getPetty(), DB.getPettyConfig()]);
  const petty = { history: pettyHistory, ...pettyConfig };
  const req=petty.history.find(h=>h.id===id);
  if(!req) return;
  await DB.updatePettyEntry(req.id, { status:'rejected', rejectedBy:state.user?.name, rejectionReason:reason||'No reason given', rejectedAt:new Date().toISOString() });
  await DB.addAudit('petty_rejected',`Petty cash rejected: "${req.purpose}" — Reason: ${req.rejectionReason}`,state.user?.name);
  await DB.addNotification('Petty Cash Rejected',`"${req.purpose}" was rejected by ${state.user?.name}. Reason: ${req.rejectionReason}`,'warn');
  showAlert('Request rejected and requester notified.','warn');
  renderPettyCash();
  buildSidebar();
}

// BUG FIX 2: settling a petty cash request now auto-creates a matching Expense record
// so it appears in all expense reports and the monthly financial statement
async function submitPettyReceipt(id){
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
  const [history, cfg] = await Promise.all([DB.getPetty(), DB.getPettyConfig()]);
  const req=history.find(h=>h.id===id);
  if(!req){ closeModal(); return }

  const actualAmt=parseFloat(document.getElementById('rc_amt')?.value)||req.amount;
  const vendor=document.getElementById('rc_vendor')?.value||'';
  const notes=document.getElementById('rc_notes')?.value||'';

  // Mark petty cash item as settled
  req.receiptNo=no;
  req.status='settled';
  req.settledAt=new Date().toISOString();
  req.settledBy=state.user?.name;
  req.actualAmount=actualAmt;
  req.vendor=vendor;

  // BUG FIX 2 CORE: if actual amount differs from approved, return difference to float
  let newFloat = cfg.float;
  if(actualAmt<req.amount){
    const change=req.amount-actualAmt;
    newFloat += change; // return unspent change to float
    await DB.addNotification('Petty Cash Change Returned',`${fmt(change)} returned to float from "${req.purpose}" (spent ${fmt(actualAmt)} of approved ${fmt(req.amount)}).`,'info');
  }

  await DB.savePettyConfig({ float:newFloat, max:cfg.max });
  await DB.updatePettyEntry(req.id, {
    status:'settled', receiptNo:no, settledAt:new Date().toISOString(),
    settledBy:state.user?.name, actualAmount:actualAmt,
    changeReturned:req.amount-actualAmt>0?req.amount-actualAmt:0, vendor
  });

  // auto-create expense record so it shows in expense module & reports
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

  await DB.addAudit('petty_settled',`Petty cash settled: "${req.purpose}" — ${fmt(actualAmt)}, Receipt: ${no}. Expense record auto-created.`,state.user?.name);
  closeModal();
  showAlert(`Receipt submitted. ${fmt(actualAmt)} recorded as expense.${req.changeReturned?` ${fmt(req.changeReturned)} change returned to float.`:''}`, 'success');
  renderPettyCash();
}

async function showPettyRefill(){
  const [history, petty] = await Promise.all([DB.getPetty(), DB.getPettyConfig()]);
  // Show amount of settled-but-not-yet-refilled receipts as a suggested refill amount
  const settled=pettyMonthHistory(history).filter(h=>h.status==='settled'&&h.type!=='refill');
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
  const petty = await DB.getPettyConfig();
  const spaceAvailable=petty.max-petty.float;
  // BUG FIX 3: warn user clearly if refill is capped — don't silently shortchange them
  if(amt>spaceAvailable){
    if(!confirm(`The entered amount (${fmt(amt)}) exceeds available float space (${fmt(spaceAvailable)}).\n\nOnly ${fmt(spaceAvailable)} will be added to bring the float to its maximum of ${fmt(petty.max)}.\n\nProceed?`)) return;
  }
  const actualAdded=Math.min(amt,spaceAvailable);
  await DB.savePettyConfig({ float:petty.float+actualAdded, max:petty.max });
  await DB.addPettyEntry({
    id:'RF-'+Date.now(), type:'refill', amount:actualAdded,
    reference:ref, authorizedBy:auth, requestedBy:state.user?.name,
    status:'settled', purpose:'Float Refill'
  });
  await DB.addAudit('petty_refilled',`Float refilled: ${fmt(actualAdded)} (authorized by ${auth}, ref: ${ref})`,state.user?.name);
  await DB.addNotification('Float Refilled',`Petty cash float refilled by ${fmt(actualAdded)}. New balance: ${fmt(petty.float)}. Authorized by: ${auth}.`,'success');
  closeModal();
  showAlert(`Float refilled by ${fmt(actualAdded)}. New balance: ${fmt(petty.float)}.${actualAdded<amt?` Note: only ${fmt(actualAdded)} added (float max reached).`:''}`, 'success');
  renderPettyCash();
}

// ── REPORTS ────────────────────────────────
async function renderReports(){
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
  const rem=calcRemittancesFromRecords(income);
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

async function generateRemittanceReport(){ renderRemittances(); showAlert('Remittance report displayed above.','info') }

async function generateQuarterlyReport(){
  const allIncome = await DB.getIncome();
  const allExpenses = await DB.getExpenses();
  let rows='';
  for(let i=2;i>=0;i--){
    let m=state.month-i; let y=state.year; if(m<0){m+=12;y--;}
    const recs=allIncome.filter(r=>{const d=new Date(r.date||r.createdAt);return d.getMonth()===m&&d.getFullYear()===y});
    const exps=allExpenses.filter(r=>{const d=new Date(r.date||r.createdAt);return d.getMonth()===m&&d.getFullYear()===y});
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
  const petty = { history: pettyHistory, ...pettyConfig };
  // BUG FIX: use pettyMonthHistory() helper — old code was passing a plain object to filterByMonth(), returning ALL history instead of current month
  const history=pettyMonthHistory(pettyAll||[]);
  const disbursed=history.filter(h=>h.type!=='refill'&&(h.status==='approved'||h.status==='settled')).reduce((s,h)=>s+(h.actualAmount||h.amount||0),0);
  const settled=history.filter(h=>h.status==='settled'&&h.type!=='refill').reduce((s,h)=>s+(h.actualAmount||h.amount||0),0);
  const refilled=history.filter(h=>h.type==='refill').reduce((s,h)=>s+(h.amount||0),0);
  const unaccounted=disbursed-settled;
  document.getElementById('reportOutput').innerHTML=`
    <div class="card">
      <div class="card-header"><span class="card-title">Petty Cash Reconciliation — ${monthLabel()}</span><button class="btn btn-sm btn-primary" onclick="window.print()">🖨 Print</button></div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Current Float Balance</div><div class="kpi-val">${fmt(pettyC.float)}</div></div>
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
  const tab=state.adminTab||'users';

  const [allIncome2, allAudit] = await Promise.all([DB.getIncome(), DB.getAudit()]);
  document.getElementById('pageContent').innerHTML=`
    <div class="page-header"><div class="page-title">IT Admin Panel</div><div class="page-sub">System management — full access</div></div>
    <div class="admin-grid" style="margin-bottom:1rem">
      <div class="admin-stat"><div class="admin-stat-val">${users.length}</div><div class="admin-stat-label">Total Users</div></div>
      <div class="admin-stat"><div class="admin-stat-val">${allIncome2.length}</div><div class="admin-stat-label">Income Records</div></div>
      <div class="admin-stat"><div class="admin-stat-val">${allAudit.length}</div><div class="admin-stat-label">Audit Events</div></div>
    </div>
    <div class="tabs">
      <button class="tab ${tab==='users'?'active':''}" onclick="App.setAdminTab('users')">Users & Roles</button>
      <button class="tab ${tab==='settings'?'active':''}" onclick="App.setAdminTab('settings')">Church Settings</button>
      <button class="tab ${tab==='quotas'?'active':''}" onclick="App.setAdminTab('quotas')">Monthly Quotas</button>
      <button class="tab ${tab==='backup'?'active':''}" onclick="App.setAdminTab('backup')">Backup & Restore</button>
    </div>
    ${tab==='users'?renderAdminUsers(users):tab==='settings'?renderAdminSettings(settings):tab==='quotas'?renderAdminQuotas(settings):renderAdminBackup()}`;
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
  const s = {
    churchName:document.getElementById('set_name')?.value||'',
    bankName:document.getElementById('set_bank')?.value||'',
    accountNo:document.getElementById('set_acct')?.value||'',
    pettyMax:parseFloat(document.getElementById('set_petty')?.value)||50000
  };
  await DB.saveSettings(s);
  // Also update petty max float in config
  const pc = await DB.getPettyConfig();
  await DB.savePettyConfig({ float:pc.float, max:s.pettyMax });
  showAlert('Settings saved!','success');
}

async function saveQuotas(){
  const q={};
  Object.keys(DEFAULT_QUOTAS).forEach(k=>{ const el=document.getElementById('q_'+k); if(el) q[k]=parseFloat(el.value)||0 });
  await DB.saveSettings({ quotas:q });
  showAlert('Monthly quotas updated!','success');
}

async function showAddUser(){
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
  await DB.addAudit('user_added',`New user added: ${name} (${role})`,state.user?.name);
  closeModal();
  showAlert(`User ${name} added successfully!`,'success');
  renderAdmin();
}

async function editUser(id){
  const users=await DB.getUsers();
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

async function updateUser(id){
  const updateData = {
    name:document.getElementById('eu_name')?.value,
    role:document.getElementById('eu_role')?.value,
    email:document.getElementById('eu_email')?.value,
    pin:document.getElementById('eu_pin')?.value
  };
  await DB.updateUser(id, updateData);
  await DB.addAudit('user_updated',`User updated`,state.user?.name);
  closeModal();
  showAlert('User updated!','success');
  renderAdmin();
}

async function deleteUser(id){
  const users=await DB.getUsers();
  const u=users.find(x=>x.id===id);
  if(!u||!confirm(`Delete user "${u.name}"? This cannot be undone.`)) return;
  await DB.deleteUser(id);
  await DB.addAudit('user_deleted',`User deleted: ${u.name}`,state.user?.name);
  showAlert('User deleted.','warn');
  renderAdmin();
}

async function exportData(){
  const [users,income,remittances,expenses,pettyH,pettyC,audit,settings] = await Promise.all([DB.getUsers(),DB.getIncome(),DB.getRemittances(),DB.getExpenses(),DB.getPetty(),DB.getPettyConfig(),DB.getAudit(),DB.getSettings()]);
  const data={ users,income,remittances,expenses,petty:{history:pettyH,...pettyC},audit,settings, exportedAt:new Date().toISOString(), exportedBy:state.user?.name };
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`rccg-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click(); URL.revokeObjectURL(a.href);
  await DB.addAudit('data_exported','Full data export performed',state.user?.name);
  showAlert('Backup exported successfully!','success');
}

async function importData(){
  const input=document.createElement('input'); input.type='file'; input.accept='.json';
  input.onchange=async e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=async ev=>{
      try{
        const data=JSON.parse(ev.target.result);
        if(!confirm('This will restore data from the backup file. Existing records will be kept. Are you sure?')) return;
        showAlert('Importing data — this may take a moment…','info');
        // Restore users
        if(data.users) for(const u of data.users){ await DB.addUser(u).catch(()=>{}) }
        // Restore income
        if(data.income) for(const r of data.income){ await DB.addIncome(r).catch(()=>{}) }
        // Restore expenses
        if(data.expenses) for(const e of data.expenses){ await DB.addExpense(e).catch(()=>{}) }
        // Restore remittances
        if(data.remittances) for(const r of data.remittances){ await DB.addRemittance(r).catch(()=>{}) }
        // Restore settings
        if(data.settings) await DB.saveSettings(data.settings).catch(()=>{});
        await DB.addAudit('data_imported','Data restored from backup',state.user?.name);
        showAlert('Data restored successfully!','success');
        navigate('dashboard');
      }catch(e){ alert('Invalid backup file. Please use a valid JSON backup.') }
    };
    reader.readAsText(file);
  };
  input.click();
}

async function clearAllData(){
  if(!confirm('⚠ This will permanently delete ALL church financial records from the database. This cannot be undone.')) return;
  const word=prompt('Type CONFIRM to delete everything:');
  if(word!=='CONFIRM'){ alert('Cancelled.'); return }
  // With D1 we can't drop tables from the frontend — direct the IT admin to Cloudflare dashboard
  alert('To clear all data, go to:\nCloudflare Dashboard → Workers & Pages → D1 → rccg-parish-db → Console\nRun: DELETE FROM income; DELETE FROM expenses; DELETE FROM petty_cash; DELETE FROM remittances; DELETE FROM audit_log; DELETE FROM notifications;\n\nThis keeps your user accounts and settings intact.');
}

// ── KPSC ALERT ────────────────────────────
async function showKPSCAlert(){
  const income=filterByMonth(await DB.getIncome());
  const totalIncome=income.reduce((s,r)=>s+(r.totalCollection||0),0);
  const rem=calcRemittancesFromRecords(income);
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

async function submitKPSCAlert(){
  const type=document.getElementById('kpsc_type')?.value;
  const amt=parseFloat(document.getElementById('kpsc_amt')?.value)||0;
  const desc=document.getElementById('kpsc_desc')?.value;
  if(!amt||!desc){ alert('Please fill all fields.'); return }
  await DB.addAudit('kpsc_alert',`KPSC Alert sent: ${type} — ${fmt(amt)}`,state.user?.name);
  await DB.addNotification('KPSC Alert Sent',`Emergency request: ${type} — ${fmt(amt)} needed`,'warn');
  closeModal();
  showAlert('KPSC alert recorded and logged. Present this request formally to the KPSC at the next available opportunity.','warn');
}

// ──────────────────────────────────────────
// 8. PUBLIC API
// ──────────────────────────────────────────
return {
  onRoleChange, login, logout, navigate, toggleSidebar, toggleNotifications,
  onMonthChange, setIncomeTab, showIncomeForm, updateIncomeTotal, submitIncome,
  viewIncome, confirmDeposit, markRemittancePaid, setRemAmt, submitRemittance,
  showExpenseForm, submitExpense, renderPettyCash, showPettyRequest, submitPettyRequest,
  approvePetty, rejectPetty, submitPettyReceipt, confirmPettyReceipt, showPettyRefill, submitRefill,
  generateMonthlyReport, generateWeeklyReport, generateRemittanceReport,
  generateQuarterlyReport, generateExpenseReport, generatePettyCashReport,
  setAdminTab, saveSettings, saveQuotas, showAddUser, addUser, editUser,
  updateUser, deleteUser, exportData, importData, clearAllData,
  showKPSCAlert, submitKPSCAlert, closeModal: closeModal
};

})();

// Global helpers
function closeModal(){ const o=document.getElementById('modalOverlay'); if(o) o.remove() }
