// "Fix alignment" for a satellite parish's remittance check: the safe part of making the app match the portal.
//
// Only one kind of difference is ever fixed by script: the portal charges a fixed monthly quota the parish's own
// quota list does not have yet (e.g. Open Heavens) and the app shows nothing for it. The fix adds that line to the
// parish's quota list (settings.satQuotas[code]) at the portal's amount. Everything else goes to a person.
// This file never touches the portal or any payment. No handler is exported, so Pages does not route it.

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const num = v => (v === null || v === undefined || v === '' || !isFinite(Number(v))) ? null : Math.round(Number(v) * 100) / 100;

/**
 * lines        [{ item, portal, app }] from the check (portal/app null when the line is absent on that side)
 * kingdomList  Kingdom's quota list [{label, amount}]
 * parishList   this parish's quota list [{label, amount}]
 * Returns { changes: [{label, amount, item}], noops: [{item, reason}], human: [{item, portal, app, reason}] }.
 */
export function planSatAlign(lines, kingdomList, parishList) {
  const changes = [], noops = [], human = [];
  const k = Array.isArray(kingdomList) ? kingdomList : [];
  const p = Array.isArray(parishList) ? parishList : [];
  const seen = new Set();
  for (const ln of (Array.isArray(lines) ? lines : [])) {
    const item = String(ln?.item || '').trim();
    const portal = num(ln?.portal), app = num(ln?.app);
    if (!item) { human.push({ item: '(unnamed line)', portal, app, reason: 'the line has no name' }); continue; }
    if (portal !== null && app !== null && Math.abs(portal - app) < 1) continue;       // already aligned
    if ((portal === null || portal === 0) && (app === null || app === 0)) { noops.push({ item, reason: 'both sides are 0 or empty' }); continue; }
    if (!(portal > 0) || (app !== null && app !== 0)) {
      human.push({ item, portal, app, reason: portal > 0 ? 'the app already has a different amount for this line' : 'the app has an amount the portal does not have' });
      continue;
    }
    const kq = k.find(q => q && norm(q.label) === norm(item));
    if (!kq) { human.push({ item, portal, app, reason: 'not a known fixed quota' }); continue; }
    if (p.some(q => q && norm(q.label) === norm(item))) { human.push({ item, portal, app, reason: 'the parish already has this quota but the app shows nothing for the period' }); continue; }
    const kAmt = num(kq.amount) || 0;
    if (!(portal <= kAmt)) { human.push({ item, portal, app, reason: `the portal amount is above Kingdom's own ${item} quota, which looks wrong` }); continue; }
    if (seen.has(norm(item))) continue;
    seen.add(norm(item));
    changes.push({ label: String(kq.label), amount: portal, item });
  }
  return { changes, noops, human };
}

/** The parish's quota list with the planned lines added (the same order, new lines at the end). */
export function applyPlanToList(parishList, changes) {
  const out = (Array.isArray(parishList) ? parishList : []).map(x => ({ ...x }));
  for (const c of changes) out.push({ label: c.label, amount: c.amount });
  return out;
}

/** Undo: take back only the lines this change added, and only while they still hold the amount we set. */
export function undoFromList(parishList, added) {
  const list = (Array.isArray(parishList) ? parishList : []).map(x => ({ ...x }));
  const removed = [], kept = [];
  for (const a of added) {
    const i = list.findIndex(q => q && norm(q.label) === norm(a.label));
    if (i >= 0 && num(list[i].amount) === num(a.amount)) { list.splice(i, 1); removed.push(a); }
    else kept.push({ ...a, reason: i < 0 ? 'the line is already gone' : 'the amount was changed since' });
  }
  return { list, removed, kept };
}
