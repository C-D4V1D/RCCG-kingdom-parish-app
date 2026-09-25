// Public "Share to WhatsApp" pages for the Budget: /budget/<slug> (HTML with
// Open Graph tags) and /budget/<slug>.png (the preview image). No login, no
// app JavaScript — everything here is server-rendered from the snapshot the
// Budget page posted via POST /api/budget/share (see functions/api/[[route]].js).
//
// Deliberately not shown: individual expense descriptions, the "how is this
// worked out" internal balances, settings, and the AI note. Only the fields
// on the share-contract snapshot are ever rendered.

const SLUG_RE = /^[a-z]+-\d{4}$/;
const BRAND_GREEN = '#0F6E56';
const NOINDEX_HEADERS = { 'X-Robots-Tag': 'noindex' };

export async function onRequest(context) {
  const { params, env, request } = context;
  const rawSlug = String(params?.slug || '');
  const DB = env.DB;

  if (rawSlug.endsWith('.png')) {
    return await servePreviewImage(DB, rawSlug.slice(0, -4));
  }
  return await servePage(DB, rawSlug, request);
}

async function servePreviewImage(DB, slug) {
  if (!SLUG_RE.test(slug) || !DB) return new Response('Not found', { status: 404 });
  let row;
  try {
    row = await DB.prepare(`SELECT image_png FROM budget_shares WHERE slug=?`).bind(slug).first();
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const b64 = row?.image_png ? String(row.image_png) : '';
  if (!b64) return new Response('Not found', { status: 404 });

  let bytes;
  try {
    bytes = base64ToBytes(b64);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
      ...NOINDEX_HEADERS,
    },
  });
}

async function servePage(DB, slug, request) {
  if (!SLUG_RE.test(slug) || !DB) {
    return new Response(render404Page(), {
      status: 404,
      headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-cache', ...NOINDEX_HEADERS },
    });
  }

  let row;
  try {
    row = await DB.prepare(
      `SELECT data_json, updated_at, created_by FROM budget_shares WHERE slug=?`
    ).bind(slug).first();
  } catch {
    row = null;
  }
  if (!row) {
    return new Response(render404Page(), {
      status: 404,
      headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-cache', ...NOINDEX_HEADERS },
    });
  }

  let snapshot;
  try {
    snapshot = JSON.parse(row.data_json);
  } catch {
    snapshot = {};
  }
  const origin = new URL(request.url).origin;
  const version = String(row.updated_at || '').replace(/\D/g, '') || '0';
  const html = renderBudgetSharePage(snapshot, { origin, slug, version });

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'no-cache', ...NOINDEX_HEADERS },
  });
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ── Rendering (pure — exported for tests) ──────────────────────────────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(n) {
  const r = Math.round(Number(n) || 0);
  const abs = Math.abs(r).toLocaleString('en-NG');
  return r < 0 ? `−₦${abs}` : `₦${abs}`;
}

function pct(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
}

function clampPct(n) {
  return Math.min(100, Math.max(0, pct(n)));
}

const PACE_META = {
  on_track: { label: 'On track', cls: 'ontrack' },
  watch:    { label: 'Watch',    cls: 'watch' },
  over:     { label: 'Over',     cls: 'over' },
};
function paceChip(pace) {
  const meta = PACE_META[pace] || PACE_META.on_track;
  return `<span class="chip chip-${meta.cls}">${esc(meta.label)}</span>`;
}

const STATUS_META = {
  enough: { cls: 'enough' },
  tight:  { cls: 'tight' },
  short:  { cls: 'short' },
};

function fmtAsOf(asOf) {
  if (!asOf) return '';
  const d = new Date(asOf);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'Africa/Lagos',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function barMarker(periodPct) {
  const p = clampPct(periodPct);
  return `<div class="marker" style="left:${p}%" title="Day ${p}% of the period elapsed"></div>`;
}

function lineBarClass(pace) {
  if (pace === 'watch') return ' bar-watch';
  if (pace === 'over') return ' bar-over';
  return '';
}

function fmtDay(ymd) {
  const d = new Date(`${String(ymd || '').slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// "Show expenses" — native <details>, so it works with no JavaScript.
function renderExpenses(list, emptyText = 'No expenses yet this period.') {
  if (!Array.isArray(list)) return ''; // v1 snapshots carry no expense rows
  const rows = list.length
    ? list.map(e => `<div class="exp-row"><span>${esc(fmtDay(e?.date))}${e?.date ? ' · ' : ''}${esc(e?.label || 'Expense')}</span><strong>${money(e?.amount)}</strong></div>`).join('')
    : `<div class="exp-empty">${esc(emptyText)}</div>`;
  return `<details class="exp"><summary>Show expenses</summary><div class="exp-list">${rows}</div></details>`;
}

// "How is this worked out?" — the same two blocks as the Budget page.
function renderWorkings(w) {
  if (!w || typeof w !== 'object') return '';
  const row = (label, value, cls = '') => `<div class="w-row${cls}"><span>${esc(label)}</span><strong>${value}</strong></div>`;
  const minus = n => `−${money(Math.abs(Number(n || 0)))}`;
  const bills = (Array.isArray(w.bills) ? w.bills : [])
    .map(b => row(`${b?.name || 'Bill'} — saved`, money(b?.saved), ' w-small')).join('');
  const held = (Array.isArray(w.heldBack) ? w.heldBack : [])
    .map(h => row(`− Held back — ${h?.label || ''}`, minus(h?.held))).join('');
  return `<details class="workings"><summary>How is this worked out?</summary>
      <div class="w-title">Now</div>
      ${row('Available fund after all deductions', money(w.availableNow))}
      ${row("− Next period's spending + safety cushion", minus(w.holdForNext))}
      ${row('− Known bills saved', minus(w.knownBillsSaved))}
      ${bills}
      ${held}
      ${row('= Now', money(w.now), ' w-total')}
      <div class="w-title">By end of period</div>
      ${row('+ Parish money still expected this period', money(w.stillExpected))}
      ${row('− Normal spending still to come this period', minus(w.stillToCome))}
      ${Number(w.floatAboveTarget) > 0 ? row('+ Petty float above target', money(w.floatAboveTarget)) : ''}
      ${row('= Expected by end of period', money(w.endOfPeriod), ' w-total')}
    </details>`;
}

function renderLine(line) {
  const budgeted = Number(line?.budgeted || 0);
  const usable = Number(line?.usable ?? budgeted);
  const spent = Number(line?.spent || 0);
  const left = Number(line?.left ?? (usable - spent));
  const spentPct = usable > 0 ? clampPct((spent / usable) * 100) : 0;
  const savedLine = line?.saves && Number(line?.saved) > 0
    ? `<div class="line-sub">Saved from earlier: ${money(line.saved)}</div>`
    : '';
  return `
    <div class="line-card">
      <div class="line-top">
        <div class="line-label">${esc(line?.label || '')}</div>
        ${paceChip(line?.pace)}
      </div>
      <div class="line-figs">
        <span>Budget ${money(budgeted)}</span>
        <span>Spent ${money(spent)}</span>
        <span>Left ${money(left)}</span>
      </div>
      ${savedLine}
      <div class="bar${lineBarClass(line?.pace)}"><div class="bar-fill" style="width:${spentPct}%"></div></div>
      ${renderExpenses(line?.expenses)}
    </div>`;
}

function renderCushionCard(cushionCard, cushionLabel, cushionAmount) {
  if (!cushionCard) return '';
  const amount = Number(cushionCard.amount ?? cushionAmount ?? 0);
  if (!amount) return '';
  const used = Number(cushionCard.used || 0);
  const left = Number(cushionCard.left ?? (amount - used));
  const usedPct = amount > 0 ? clampPct((used / amount) * 100) : 0;
  return `
    <div class="line-card cushion-card">
      <div class="line-top">
        <div class="line-label">Safety cushion</div>
        ${paceChip(cushionCard.pace)}
      </div>
      <div class="line-sub">${esc(/^Covers /.test(cushionLabel || '') ? cushionLabel : 'Covers unplanned costs and any line that runs over.')}</div>
      <div class="line-figs">
        <span>Set aside ${money(amount)}</span>
        <span>Used ${money(used)}</span>
        <span>Left ${money(left)}</span>
      </div>
      <div class="bar${lineBarClass(cushionCard.pace)}"><div class="bar-fill" style="width:${usedPct}%"></div></div>
      ${renderExpenses(cushionCard.expenses, 'No unplanned spending this period.')}
    </div>`;
}

function renderBill(bill) {
  const saved = Number(bill?.saved || 0);
  const amount = Number(bill?.amount || 0);
  const savedNote = saved > 0 ? `<div class="bill-saved">Saved so far: ${money(saved)}</div>` : '';
  return `
    <div class="bill-row">
      <div class="bill-top">
        <span class="bill-name">${esc(bill?.name || '')}</span>
        <span class="bill-amount">${money(amount)}</span>
      </div>
      <div class="bill-due">${esc(bill?.dueLabel || '')}</div>
      ${savedNote}
    </div>`;
}

export function renderBudgetSharePage(snapshot, { origin = '', slug = '', version = '' } = {}) {
  const s = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const churchName = s.churchName || 'RCCG Kingdom Parish';
  const monthLabel = s.monthLabel || '';
  const statusMeta = STATUS_META[s.status] || STATUS_META.enough;
  const statusText = s.statusText || 'Enough';

  const pageTitle = `${monthLabel} Budget — ${churchName}`;
  const totalBudget = Number(s.totalBudget || 0);
  const spent = Number(s.spent || 0);
  const pctSpent = clampPct(s.pctSpent ?? (totalBudget > 0 ? (spent / totalBudget) * 100 : 0));
  const periodPct = clampPct(s.periodPct || 0);

  const available = s.available && typeof s.available === 'object' ? s.available : null;
  const descParts = [
    `Total ${money(totalBudget)}`,
    `Spent ${money(spent)} (${pctSpent}%)`,
  ];
  if (available) descParts.push(`Available for new spending ${money(available.free)}`);
  descParts.push(`Status: ${statusText}`);
  const ogDescription = descParts.join(' · ');

  const imageUrl = `${origin}/budget/${slug}.png?v=${encodeURIComponent(version)}`;
  const pageUrl = `${origin}/budget/${slug}`;

  const lines = Array.isArray(s.lines) ? s.lines : [];
  const rccgLines = lines.filter(l => l?.kind === 'rccg');
  const runningLines = lines.filter(l => l?.kind !== 'rccg');
  const linesHtml = [...rccgLines, ...runningLines].map(renderLine).join('');
  const cushionHtml = renderCushionCard(s.cushionCard, s.cushionLabel, s.cushion);

  const knownBills = Array.isArray(s.knownBills) ? s.knownBills : [];
  const billsSection = knownBills.length ? `
    <section class="card">
      <div class="section-title">Known upcoming bills</div>
      ${knownBills.map(renderBill).join('')}
    </section>` : '';

  const availableSection = available ? `
    <section class="card hero-card">
      <div class="eyebrow">Available for new spending</div>
      <div class="hero-amount${Number(available.free) < 0 ? ' hero-short' : ''}">${Number(available.free) < 0 ? `${money(Math.abs(available.free))} short` : money(available.free)}</div>
      ${Number(available.freeEnd) > Number(available.free) && Number(available.freeEnd) > 0 && available.riseBy
        ? `<div class="hero-sub">Could rise to ${money(available.freeEnd)} by ${esc(available.riseBy)}</div>`
        : ''}
      ${renderWorkings(s.workings)}
    </section>` : '';

  const asOfLine = fmtAsOf(s.asOf);
  const footerBits = [asOfLine ? `Figures as of ${esc(asOfLine)}` : '', s.sharedBy ? `Shared by ${esc(s.sharedBy)}` : '']
    .filter(Boolean).join(' · ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(ogDescription)}">
<meta name="robots" content="noindex">
<meta property="og:title" content="${esc(pageTitle)}">
<meta property="og:description" content="${esc(ogDescription)}">
<meta property="og:image" content="${esc(imageUrl)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(pageUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(pageTitle)}">
<meta name="twitter:description" content="${esc(ogDescription)}">
<meta name="twitter:image" content="${esc(imageUrl)}">
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="wrap">
  <header class="top-hero">
    <div class="top-hero-row">
      <div class="church">${esc(churchName)}</div>
      <span class="status-pill status-${statusMeta.cls}">${esc(statusText)}</span>
    </div>
    <h1>${esc(monthLabel)} Budget</h1>
    <div class="period">${esc(s.periodLabel || '')}${s.dayOf ? ` · ${esc(s.dayOf)}` : ''}</div>
  </header>

  ${availableSection}

  <section class="card">
    <div class="section-title">Total period budget</div>
    <div class="total-amount">${money(totalBudget)}</div>
    <div class="spend-line">Spent ${money(spent)} <strong>(${pctSpent}%)</strong></div>
    <div class="bar">
      <div class="bar-fill" style="width:${pctSpent}%"></div>
      ${barMarker(periodPct)}
    </div>
    <div class="bar-caption">Marker shows how far the period has run</div>
  </section>

  <section class="card">
    <div class="section-title">Budget breakdown</div>
    <div class="lines">
      ${linesHtml}
      ${cushionHtml}
    </div>
  </section>

  ${billsSection}

  <footer>${footerBits}</footer>
</div>
</body>
</html>`;
}

export function render404Page() {
  const title = 'Budget link not available';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="robots" content="noindex">
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="wrap">
  <section class="card notfound-card">
    <div class="notfound-icon" aria-hidden="true">&#128274;</div>
    <h1>This budget link is not available</h1>
    <p>It may have been stopped, or never existed. Ask whoever shared it for a fresh link.</p>
  </section>
</div>
</body>
</html>`;
}

// Self-contained CSS — matches src/css/styles.css budget-* tokens (brand
// green, card radii, pace colours) but never loads the app stylesheet: this
// page has no app JS and must render fast on a weak signal.
const PAGE_CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#F6F4EF;color:#1a1a1a;font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
.wrap{max-width:560px;margin:0 auto;padding:20px 16px 40px}
.card{background:#fff;border-radius:14px;padding:18px 18px;margin-bottom:14px;box-shadow:0 1px 2px rgba(0,0,0,0.04);border:1px solid rgba(0,0,0,0.06)}
.top-hero{background:linear-gradient(160deg,${BRAND_GREEN},#0B5443);color:#fff;border-radius:16px;padding:22px 20px 20px;margin-bottom:16px;box-shadow:0 4px 14px rgba(15,110,86,0.25)}
.top-hero-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}
.church{font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;opacity:0.85}
.top-hero h1{margin:2px 0 4px;font-size:22px;font-weight:800;letter-spacing:-0.3px}
.period{font-size:13px;opacity:0.9}
.status-pill{font-size:11px;font-weight:700;letter-spacing:0.3px;padding:5px 10px;border-radius:999px;background:rgba(255,255,255,0.18);white-space:nowrap}
.status-enough{background:rgba(255,255,255,0.22)}
.status-tight{background:#F5A623;color:#3a2a00}
.status-short{background:#E24545;color:#fff}
.hero-card{border:1.5px solid ${BRAND_GREEN};background:linear-gradient(180deg,rgba(15,110,86,0.07),#fff 65%)}
.eyebrow{font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:#555}
.hero-amount{font-size:34px;font-weight:800;color:${BRAND_GREEN};line-height:1.15;margin:2px 0 4px;font-variant-numeric:tabular-nums}
.hero-sub{font-size:13px;color:#555}
.section-title{font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:#888;margin-bottom:6px}
.total-amount{font-size:28px;font-weight:800;letter-spacing:-0.5px;margin:2px 0 6px;font-variant-numeric:tabular-nums}
.spend-line{font-size:13px;color:#555;margin-bottom:10px}
.spend-line strong{color:#1a1a1a}
.bar{position:relative;height:10px;background:#eceae4;border-radius:999px;margin-bottom:4px}
.bar-fill{height:10px;background:linear-gradient(90deg,${BRAND_GREEN},#1D9E75);border-radius:999px}
.bar-watch .bar-fill{background:linear-gradient(90deg,#D97706,#F5A623)}
.bar-over .bar-fill{background:linear-gradient(90deg,#A32D2D,#c62828)}
.bar .marker{position:absolute;top:-3px;bottom:-3px;width:2px;background:#1a1a1a;opacity:0.55;border-radius:1px}
.bar-caption{font-size:11px;color:#888}
.lines{display:flex;flex-direction:column;gap:10px}
.line-card{background:#f8f8f6;border:1px solid rgba(0,0,0,0.09);border-radius:12px;padding:12px}
.line-top{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px}
.line-label{font-size:14px;font-weight:700}
.line-figs{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:#555;margin-bottom:8px}
.exp{margin-top:10px;border-top:1px dashed #E3DED3;padding-top:8px}
.exp>summary,.workings>summary{cursor:pointer;font-size:13px;font-weight:600;color:#0F6E56;list-style:none;min-height:32px;display:flex;align-items:center}
.exp>summary::-webkit-details-marker,.workings>summary::-webkit-details-marker{display:none}
.exp>summary::after,.workings>summary::after{content:'▾';margin-left:6px;transition:transform .2s}
.exp[open]>summary::after,.workings[open]>summary::after{transform:rotate(180deg)}
.exp-list{display:flex;flex-direction:column;gap:4px;margin-top:4px}
.exp-row{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;color:#444;padding:4px 0;border-bottom:1px solid #F0ECE3}
.exp-row strong{white-space:nowrap;color:#1A2E27}
.exp-empty{font-size:12px;color:#888;padding:4px 0}
.workings{margin-top:14px;border-top:1px solid rgba(15,110,86,.18);padding-top:8px}
.w-title{font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#6B7A75;margin:12px 0 4px}
.w-row{display:flex;justify-content:space-between;gap:10px;font-size:13px;color:#3A4A45;padding:4px 0}
.w-row strong{white-space:nowrap}
.w-small{font-size:12px;color:#888;padding-left:12px}
.w-total{border-top:1px solid #E3DED3;margin-top:4px;padding-top:8px;font-weight:700;color:#1A2E27}
.hero-short{color:#C0392B}
.line-sub{font-size:12px;color:#888;margin:-4px 0 8px}
.cushion-card{border-style:dashed}
.chip{font-size:11px;font-weight:700;padding:4px 9px;border-radius:999px;white-space:nowrap}
.chip-ontrack{background:rgba(15,110,86,0.12);color:${BRAND_GREEN}}
.chip-watch{background:#FAEEDA;color:#BA7517}
.chip-over{background:rgba(163,45,45,0.12);color:#A32D2D}
.bill-row{padding:10px 0;border-top:1px solid rgba(0,0,0,0.08)}
.bill-row:first-child{border-top:none;padding-top:0}
.bill-top{display:flex;justify-content:space-between;gap:10px;font-size:14px;font-weight:600}
.bill-due{font-size:12px;color:#888;margin-top:2px}
.bill-saved{font-size:12px;color:#555;margin-top:2px}
footer{text-align:center;font-size:11px;color:#888;padding:10px 4px 0}
.notfound-card{text-align:center;padding:44px 20px}
.notfound-icon{font-size:34px;margin-bottom:10px}
.notfound-card h1{font-size:18px;margin:0 0 8px}
.notfound-card p{font-size:13px;color:#555;margin:0}
@media (max-width:380px){.hero-amount{font-size:28px}.total-amount{font-size:24px}}
`;
