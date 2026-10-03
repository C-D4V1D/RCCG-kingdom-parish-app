#!/usr/bin/env node
// Read-only: one parish's month on the RCCG portal, for /month (srcdocinfo-20261003). GET requests only, plus the sign-in.
// Never uploads, files or changes anything; never prints the password, tokens or file links' contents.
//   node portal-month.cjs <parish code> <YYYY-MM>
// Prints ONE JSON line: {ok, parish, month, admin:{uploaded, at, open, closes}, finance:{uploaded, at, open, report},
//                        attendance:{rows, weeks, stored_at, monthly:{completed, at} | null}}
// Each part is null when the portal didn't answer it (the caller then uses the bot's own records).
'use strict';
const api = require(process.env.PORTAL_API || '/workspace/rccg-portal/portal-api.js');
const H = api.H, FIN = api.FIN, ADM = 'https://eu-admin-api-01.rccgportal.org';
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const out = o => { process.stdout.write(JSON.stringify(o) + '\n'); };
const hier = p => `cont_code=${H.continentCode}&sub_cont_code=${H.subContinentCode}&reg_code=${H.regionCode}&prov_code=${H.provinceCode}&zone_code=${H.zoneCode}&area_code=${H.areaCode}&parish_code=${p}`;
const safe = async f => { try { return await f(); } catch { return null; } };
// The finance file name carries the upload time (milliseconds since 1970), e.g. ".../1790526007984_602757-...jpg".
const msTime = url => { const m = /\/(\d{13})_[^/]*$/.exec(String(url || '')); return m ? new Date(Number(m[1])).toISOString() : null; };

async function admin(p, m, y) {
  const l = await api.getAbs(`${ADM}/admin_settings/lock-status?rem_type=scan&rem_month=${m}&rem_year=${y}&${hier(p)}`);
  const r = await api.getAbs(`${ADM}/attendance/source_doc/?year=${y}&month=${m}&type=parish&typeCode=${p}&type_code=${p}`);
  const b = r.body || {};
  let files = null;
  if (r.status === 200 && Array.isArray(b.data)) files = b.data.filter(d => String(d.parish_code) === p && d.month === m && String(d.year) === String(y));
  else if (r.status === 404 && /no data/i.test(b.message || '')) files = [];
  if (files === null) return null;
  const at = files.map(f => f.created_at).filter(Boolean).sort()[0] || null;
  const open = l.status === 200 && !!l.body && l.body.status === 'success';
  return { uploaded: files.length > 0, at, open, closes: (l.body && l.body.end_date) || null };
}

async function finance(p, m, y) {
  const q = new URLSearchParams({ continentCode: H.continentCode, subContinentCode: H.subContinentCode, regionCode: H.regionCode, provinceCode: H.provinceCode, zoneCode: H.zoneCode, areaCode: H.areaCode, parishCode: p, month: m, year: y });
  const l = await api.getAbs(`${FIN}/financialReport/checkLockStatus?${q}`);
  const r = await api.getAbs(`${FIN}/financialReport/sourcedoc?type=parish&typeCode=${p}&month=${m}&year=${y}`);
  const b = r.body || {};
  let uploaded = null, at = null;
  if (r.status === 200 && b.data && b.data.imageLink) { uploaded = true; at = msTime(b.data.imageLink); }
  else if ((r.status === 200 || r.status === 404) && b.error === true && /no record/i.test(b.message || '')) uploaded = false;
  else if (r.status === 200 && b.data && !b.data.imageLink && b.error === false) uploaded = false;
  if (uploaded === null) return null;
  const rq = new URLSearchParams({ type: 'parish', typeCode: p, month: m, year: y, pageNum: 1, pageSize: 1 });
  const rr = await safe(() => api.getAbs(`${FIN}/financialReport/performance/monthly?${rq}`));
  const d = rr && rr.body && Array.isArray(rr.body.data) ? rr.body.data[0] : null;
  const report = d && String(d.parishCode || d.typeCode) === p ? true : false;
  return { uploaded, at, open: l.status === 200 && !!(l.body && l.body.data && l.body.data.scan === true), report };
}

async function attendance(p, m, y) {
  const r = await api.getAbs(`${ADM}/attendance?type=parish&typeCode=${p}&month=${m}&year=${y}`);
  const b = r.body || {};
  let rows = null;
  if (b && Array.isArray(b.data) && (r.status === 200 || /no data/i.test(b.message || ''))) rows = b.data.filter(x => String(x.parish_code) === p && x.month === m && String(x.year) === String(y));
  else if (r.status === 404 && /no data/i.test(b.message || '')) rows = [];
  if (rows === null) return null;
  const times = rows.map(x => x.updated_at || x.created_at).filter(Boolean).sort();
  const mr = await safe(() => api.getAbs(`${ADM}/attendance/parish_att/?parish_code=${p}&year=${y}`));
  const mo = mr && mr.status === 200 && mr.body ? (mr.body.monthlyReport || []).find(x => x.month === m && String(x.year) === String(y)) : null;
  return { rows: rows.length, weeks: [...new Set(rows.map(x => x.week))].length, stored_at: times[times.length - 1] || null,
           monthly: mo ? { completed: !!mo.parish_completed, at: mo.updated_at || mo.created_at || null } : null };
}

(async () => {
  const [p, ym] = process.argv.slice(2);
  if (!/^\d{4,8}$/.test(p || '') || !/^\d{4}-\d{2}$/.test(ym || '')) { out({ ok: false, error: 'usage: portal-month.cjs <parish> <YYYY-MM>' }); process.exit(2); }
  const m = MON[Number(ym.slice(5)) - 1], y = ym.slice(0, 4);
  try { await api.login(); } catch (e) { out({ ok: false, error: 'portal sign-in failed' }); return; }
  out({ ok: true, parish: p, month: ym, admin: await safe(() => admin(p, m, y)), finance: await safe(() => finance(p, m, y)),
        attendance: await safe(() => attendance(p, m, y)) });
})();
