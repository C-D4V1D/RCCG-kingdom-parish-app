/**
 * Seeds scripts/demo/demo.sqlite with synthetic demonstration data — the data
 * behind the screenshots in docs/screenshots/.
 *
 * Every name, phone number, amount and reference below is invented. No real
 * member, partner, financial or bank data is committed to this repository.
 *
 *   node scripts/demo/seed.mjs
 *
 * The schema itself is created by the application: the script starts the worker's
 * own /api/init handler first, so the demo database always matches production.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createD1 } from './d1-sqlite-adapter.mjs';
import { onRequest } from '../../functions/api/[[route]].js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = process.env.DEMO_DB || path.join(HERE, 'demo.sqlite');
fs.rmSync(DB_FILE, { force: true });

// Build the schema through the application's own initialisation endpoint.
const init = await onRequest({
  request: new Request('http://localhost/api/init'),
  env: { DB: createD1(DB_FILE) },
  waitUntil: () => {},
});
if (init.status !== 200) throw new Error(`init failed: ${await init.text()}`);

const db = new DatabaseSync(DB_FILE);
const run = (sql, ...a) => db.prepare(sql).run(...a);
const rnd = (min, max, step = 500) => Math.round((min + Math.random() * (max - min)) / step) * step;

// ── Sunday collections: every Sunday from 2026-06-07 to 2026-09-06 ──────────
const sundays = [];
for (let d = new Date(Date.UTC(2026, 5, 7)); d <= new Date(Date.UTC(2026, 8, 6)); d.setUTCDate(d.getUTCDate() + 7)) {
  sundays.push(d.toISOString().slice(0, 10));
}
const ushers = ['Sis. Ngozi Ile', 'Bro. Uche Anene', 'Sis. Chinwe Obi', 'Bro. Tochukwu Eze'];
let i = 0;
for (const date of sundays) {
  const mt = rnd(180000, 320000), mnt = rnd(20000, 45000), tg = rnd(60000, 130000);
  const ss = rnd(6000, 14000), slo = rnd(40000, 90000), crm = rnd(15000, 32000);
  const wo = rnd(12000, 28000), ff = i % 4 === 0 ? rnd(20000, 60000) : 0;
  const co = rnd(4000, 11000), wknd = i % 6 === 0 ? rnd(8000, 20000) : 0;
  const hc = i % 4 === 1 ? rnd(15000, 35000) : 0;
  const total = mt + mnt + tg + ss + slo + crm + wo + ff + co + wknd + hc;
  const bank = Math.round(total * 0.72 / 1000) * 1000;
  const petty = i % 3 === 0 ? 10000 : 0;
  run(`INSERT INTO income (id,date,members_tithe,ministers_tithe,thanksgiving,sunday_school,slo,crm,workers_offering,first_fruit,children_offering,weekend_offering,holy_communion_offering,total_collection,bank_transfer_amount,direct_petty_cash,source,usher,recorded_by,deposit_confirmed,teller_no,deposited_by,deposit_date,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'sunday_collection',?,?,?,?,?,?,?)`,
    `INC-S${i}`, date, mt, mnt, tg, ss, slo, crm, wo, ff, co, wknd, hc, total, bank, petty,
    ushers[i % 4], 'Bro. Chukwuemeka Nze', i < sundays.length - 1 ? 1 : 0,
    i < sundays.length - 1 ? `TL-${20450 + i}` : '', i < sundays.length - 1 ? 'Bro. Chukwuemeka Nze' : '',
    i < sundays.length - 1 ? date : '', `${date}T14:1${i % 10}:00Z`);
  if (i < sundays.length - 1) {
    run(`INSERT INTO cash_transactions (id,type,date,amount,description,reference,recorded_by,deposit_method,income_ref,created_at)
         VALUES (?,'deposit',?,?,?,?,?,'bank_teller',?,?)`,
      `CT-D${i}`, date, bank, `Sunday collection banking — ${date}`, `TL-${20450 + i}`, 'Bro. Chukwuemeka Nze', `INC-S${i}`, `${date}T16:00:00Z`);
  }
  i++;
}

// ── Other income ───────────────────────────────────────────────────────────
const other = [
  ['2026-06-11', 'Midweek Service Offering', 42000, 'midweek_offering'],
  ['2026-06-25', 'Building Fund Donation — Anonymous', 250000, 'donation'],
  ['2026-07-09', 'Midweek Service Offering', 38500, 'midweek_offering'],
  ['2026-07-23', 'Harvest Pledge Redemption', 175000, 'donation'],
  ['2026-08-06', 'Midweek Service Offering', 45000, 'midweek_offering'],
  ['2026-08-20', 'Bank Transfer — Diaspora Member', 320000, 'bank_transfer'],
  ['2026-09-03', 'Midweek Service Offering', 41000, 'midweek_offering'],
];
other.forEach(([date, note, amt, src], n) => {
  run(`INSERT INTO income (id,date,total_collection,bank_transfer_amount,source,payment_method,donor_name,recorded_by,notes,deposit_confirmed,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,1,?)`,
    `INC-O${n}`, date, amt, amt, src, 'bank_transfer', '', 'Bro. Chukwuemeka Nze', note, `${date}T10:00:00Z`);
});

// ── Expenses ───────────────────────────────────────────────────────────────
const exp = [
  ['2026-06-08', 'Power & Energy', 'PHCN Bill', 'June electricity bill — parish premises', 68000, 'bank_transfer'],
  ['2026-06-08', 'Power & Energy', 'Generator Fuel', 'Diesel for standby generator (80 litres)', 96000, 'petty_cash'],
  ['2026-06-14', 'Facility & Cleaning', 'Cleaning Supplies', 'Disinfectant, brooms, refuse bags', 18500, 'petty_cash'],
  ['2026-06-20', 'Sound & Media', 'Equipment Repair', 'Repair of main mixer channel 4', 45000, 'bank_transfer'],
  ['2026-06-28', 'Communication', 'Internet Subscription', 'Monthly office internet', 22000, 'bank_transfer'],
  ['2026-07-02', 'Office & Stationery', 'Printing', 'Offering envelopes and receipt booklets', 34000, 'petty_cash'],
  ['2026-07-05', 'Power & Energy', 'PHCN Bill', 'July electricity bill — parish premises', 71500, 'bank_transfer'],
  ['2026-07-12', 'Repairs & Maintenance', 'Plumbing', 'Replace overhead tank float valve', 27500, 'petty_cash'],
  ['2026-07-19', 'Church Welfare', 'Member Support', 'Welfare support — bereaved family', 80000, 'bank_transfer'],
  ['2026-07-26', 'Transportation', 'Fuel', 'Fuel — provincial meeting trip', 30000, 'petty_cash'],
  ['2026-08-03', 'Power & Energy', 'PHCN Bill', 'August electricity bill — parish premises', 74000, 'bank_transfer'],
  ['2026-08-09', 'Security', 'Security Personnel', 'Night guard stipend — August', 45000, 'cash'],
  ['2026-08-16', 'Events & Departments', 'Youth Programme', 'Teens retreat refreshments', 62000, 'bank_transfer'],
  ['2026-08-23', 'Bank Charges', 'Transfer Charges', 'Bank transfer and SMS alert charges', 4850, 'bank_transfer'],
  ['2026-08-30', 'Property & Projects', 'Church Building', 'Sand and cement — perimeter wall phase 2', 420000, 'bank_transfer'],
  ['2026-09-04', 'Hospitality', 'Guest Minister', 'Honorarium and hospitality — guest minister', 100000, 'bank_transfer'],
];
exp.forEach(([date, cat, sub, desc, amt, method], n) => {
  const bankAmt = method === 'bank_transfer' ? amt : 0;
  const pettyAmt = method === 'petty_cash' ? amt : 0;
  const cashAmt = method === 'cash' ? amt : 0;
  run(`INSERT INTO expenses (id,date,category,subcategory,description,amount,receipt_no,payment_method,recorded_by,status,bank_amount,cash_amount,petty_amount,created_at)
       VALUES (?,?,?,?,?,?,?,?,?, 'approved',?,?,?,?)`,
    `EXP-${n}`, date, cat, sub, desc, amt, `RCP-${3200 + n}`, method, 'Sis. Adaeze Okonkwo', bankAmt, cashAmt, pettyAmt, `${date}T09:30:00Z`);
});

// ── Petty cash ─────────────────────────────────────────────────────────────
run(`UPDATE petty_config SET float_amount=?, max_float=? WHERE id='main'`, 68500, 150000);
const petty = [
  ['2026-08-12', 'advance', 'Fuel for generator — Sunday service', 40000, 'settled', 'Sis. Adaeze Okonkwo', 'Bro. Chukwuemeka Nze'],
  ['2026-08-25', 'request', 'Cleaning materials restock', 22000, 'approved', 'Sis. Adaeze Okonkwo', 'Elder Paul Okafor'],
  ['2026-09-01', 'refill', 'Petty cash top-up from bank', 100000, 'approved', 'Bro. Chukwuemeka Nze', 'Elder Paul Okafor'],
  ['2026-09-08', 'request', 'Stationery for September', 18000, 'pending_approval', 'Sis. Adaeze Okonkwo', ''],
];
petty.forEach(([date, type, purpose, amt, status, req, appr], n) => {
  run(`INSERT INTO petty_cash (id,type,purpose,amount,category,date_needed,requested_by,approved_by,approved_at,status,payment_method,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,'cash',?)`,
    `PC-${n}`, type, purpose, amt, 'Operations', date, req, appr, appr ? `${date}T11:00:00Z` : '', status, `${date}T08:00:00Z`);
});

// ── Remittances ────────────────────────────────────────────────────────────
const rems = [
  ['June 2026 — Part A: RCCG Authorities', 986400, '2026-07-08', '2026-06-01', '2026-06-30', 'A'],
  ['June 2026 — Part B: TG & Pastoral', 214800, '2026-07-08', '2026-06-01', '2026-06-30', 'B'],
  ['July 2026 — Part A: RCCG Authorities', 1042300, '2026-08-07', '2026-07-01', '2026-07-31', 'A'],
  ['July 2026 — Part B: TG & Pastoral', 228500, '2026-08-07', '2026-07-01', '2026-07-31', 'B'],
  ['August 2026 — Part A: RCCG Authorities', 1118900, '2026-09-05', '2026-08-01', '2026-08-31', 'A'],
];
rems.forEach(([label, amt, paid, from, to, part], n) => {
  run(`INSERT INTO remittances (id,label,amount,paid_date,reference,authorized_by,status,period_from,period_to,payment_method,submitted_by,bank_amount,part,created_at)
       VALUES (?,?,?,?,?,?,'paid',?,?,'bank_transfer',?,?,?,?)`,
    `REM-${n}`, label, amt, paid, `PRV/${2026}/${700 + n}`, 'Elder Paul Okafor', from, to, 'Bro. Chukwuemeka Nze', amt, part, `${paid}T12:00:00Z`);
});

// ── Satellite / zone pass-through pool ─────────────────────────────────────
[['2026-07-04', 'in', 180000, 'province_remittance', 'Satellite Parish A — July province contribution'],
 ['2026-07-04', 'in', 145000, 'province_remittance', 'Satellite Parish B — July province contribution'],
 ['2026-07-08', 'out', 325000, 'province_remittance', 'Onward payment to Province — July'],
 ['2026-08-05', 'in', 190000, 'province_remittance', 'Satellite Parish A — August province contribution'],
 ['2026-08-05', 'in', 150000, 'province_remittance', 'Satellite Parish C — August province contribution'],
].forEach(([date, dir, amt, purpose, note], n) => {
  run(`INSERT INTO satellite_funds (id,date,direction,amount,purpose,note,reference,recorded_by,channel,created_at)
       VALUES (?,?,?,?,?,?,?,?,'bank',?)`, `SF-${n}`, date, dir, amt, purpose, note, `SF/${900 + n}`, 'Bro. Chukwuemeka Nze', `${date}T10:00:00Z`);
});

// ── Bank balance + charges ────────────────────────────────────────────────
run(`INSERT INTO bank_balance_snapshots (id,date,balance,narration) VALUES (?,?,?,?)`,
  'BBS-1', '2026-09-06', 4238750, 'Alert balance after Sunday banking');

// ── Audit log ─────────────────────────────────────────────────────────────
const audits = [
  ['income', 'Recorded Sunday collection for 2026-09-06 (₦612,500)', 'Bro. Chukwuemeka Nze'],
  ['remittance', 'Submitted August 2026 Part A remittance (₦1,118,900)', 'Bro. Chukwuemeka Nze'],
  ['petty_cash', 'Approved petty cash refill of ₦100,000', 'Elder Paul Okafor'],
  ['expense', 'Logged expense: Church Building — ₦420,000', 'Sis. Adaeze Okonkwo'],
  ['report', 'Signed off August 2026 monthly financial statement', 'Rev. Emmanuel Obi'],
  ['settings', 'Updated fixed quota: RMF ₦5,000 → ₦6,000', 'IT Administrator'],
  ['login', 'User logged in', 'Elder James Eze'],
];
audits.forEach(([type, detail, by], n) =>
  run(`INSERT INTO audit_log (id,type,detail,by_user,ts) VALUES (?,?,?,?,?)`,
    `AUD-${n}`, type, detail, by, `2026-09-0${(n % 8) + 1}T${9 + n}:15:00Z`));

// ── Notifications ─────────────────────────────────────────────────────────
[['Remittance due in 4 days', 'August 2026 Part B remittance is due on 15 September.', 'warning'],
 ['Monthly statement ready', 'August 2026 financial statement is awaiting Pastor sign-off.', 'info'],
 ['Petty cash low', 'Petty cash float is at 46% of the approved maximum.', 'warning'],
].forEach(([t, b, ty], n) => run(`INSERT INTO notifications (id,title,body,type,is_read,ts) VALUES (?,?,?,?,?,?)`,
  `NT-${n}`, t, b, ty, 0, `2026-09-0${n + 5}T08:00:00Z`));




// ── Committee members (12: 3 men, 3 women, 3 youth, 2 ministers, 1 pastor) ──
const members = [
  ['Elder Paul Okafor', 'men', 'Acting Chairman'], ['Bro. Chukwuemeka Nze', 'men', 'Treasurer'],
  ['Bro. Ifeanyi Udeh', 'men', 'Member'],
  ['Sis. Adaeze Okonkwo', 'women', 'General Secretary'], ['Sis. Ngozi Ile', 'women', 'Financial Secretary'],
  ['Sis. Chinwe Obi', 'women', 'Member'],
  ['Bro. Tochukwu Eze', 'youth', 'Member'], ['Sis. Amaka Nwosu', 'youth', 'Member'],
  ['Bro. Kelechi Ani', 'youth', 'Member'],
  ['Min. Samuel Agu', 'ministers', 'Member'], ['Min. Grace Nnaji', 'ministers', 'Member'],
  ['Rev. Emmanuel Obi', 'pastor', 'Parish Pastor'],
];
members.forEach(([name, grp, pos], n) =>
  run(`INSERT INTO kpsc_members (id,name,grp,position) VALUES (?,?,?,?)`, `KM-${n}`, name, grp, pos));

// ── Partners ───────────────────────────────────────────────────────────────
const partners = [
  ['Bro. Ifeanyi Udeh', '2348031110001', 20000, '2026-01-05', 'Aguleri', 1],
  ['Sis. Amaka Nwosu', '2348031110002', 5000, '2026-01-12', 'Onitsha', 1],
  ['Bro. Kelechi Ani', '2348031110003', 10000, '2026-02-02', 'Awka', 0],
  ['Sis. Chinwe Obi', '2348031110004', 5000, '2026-02-14', 'Aguleri', 1],
  ['Bro. Tochukwu Eze', '2348031110005', 20000, '2026-03-01', 'Lagos', 1],
  ['Sis. Ngozi Ile', '2348031110006', 10000, '2026-03-08', 'Aguleri', 0],
  ['Bro. Emeka Okoye', '2348031110007', 50000, '2026-03-22', 'London, UK', 1],
  ['Sis. Uche Nnamdi', '2348031110008', 5000, '2026-04-05', 'Enugu', 0],
  ['Bro. Obinna Eze', '2348031110009', 10000, '2026-04-19', 'Abuja', 1],
  ['Sis. Chidinma Ogu', '2348031110010', 20000, '2026-05-03', 'Houston, USA', 1],
  ['Bro. Nnamdi Ilo', '2348031110011', 5000, '2026-05-17', 'Aguleri', 0],
  ['Sis. Blessing Agu', '2348031110012', 10000, '2026-06-07', 'Onitsha', 1],
  ['Bro. Chinedu Mba', '2348031110013', 5000, '2026-06-21', 'Aguleri', 0],
  ['Sis. Ifeoma Nweke', '2348031110014', 20000, '2026-07-05', 'Toronto, Canada', 1],
  ['Bro. Arinze Obi', '2348031110015', 10000, '2026-07-19', 'Awka', 0],
  ['Sis. Chika Umeh', '2348031110016', 5000, '2026-08-02', 'Aguleri', 1],
  ['Bro. Somto Eze', '2348031110017', 10000, '2026-08-16', 'Lagos', 0],
  ['Sis. Ada Nwachukwu', '2348031110018', 5000, '2026-09-06', 'Aguleri', 1],
];
partners.forEach(([name, phone, pledge, start, loc, pub], n) => {
  run(`INSERT INTO kpsc_partners (id,full_name,phone,partnership_type,start_date,monthly_pledge,status,reminder_preference,created_by,created_at,location,public_listing)
       VALUES (?,?,?,'gods_kingdom_partner',?,?,'active','sms','Sis. Ngozi Ile',?,?,?)`,
    `KP-${n}`, name, phone, start, pledge, `${start}T09:00:00Z`, loc, pub);
  // Payments from start month to Aug 2026, with a few gaps
  const [sy, sm] = start.split('-').map(Number);
  let pid = 0;
  for (let m = sm; m <= 8; m++) {
    const skip = (n + m) % 7 === 0; // realistic non-payment gaps
    if (skip) continue;
    const amt = (n % 5 === 0 && m % 3 === 0) ? pledge * 2 : pledge;
    run(`INSERT INTO kpsc_partner_payments (id,partner_id,year,month,amount,expected_amount,payment_type,source,paid,paid_at,reference,recorded_by,created_at)
         VALUES (?,?,?,?,?,?,'monthly_pledge','partnership',1,?,?,?,?)`,
      `KPP-${n}-${m}`, `KP-${n}`, 2026, m, amt, pledge,
      `2026-${String(m).padStart(2, '0')}-1${pid % 8}`, `TRF/${n}${m}`, 'Sis. Ngozi Ile',
      `2026-${String(m).padStart(2, '0')}-1${pid % 8}T10:00:00Z`);
    pid++;
  }
});

// ── KPSC finance ledger ────────────────────────────────────────────────────
const fin = [
  ['2026-06-30', 'income', 'partnership_payment', 'June partnership receipts', 245000],
  ['2026-07-04', 'expense', 'welfare', 'Welfare support — medical bill (approved case #14)', 120000],
  ['2026-07-15', 'income', 'one_time_donation', 'One-time donation — diaspora member', 300000],
  ['2026-07-31', 'income', 'partnership_payment', 'July partnership receipts', 265000],
  ['2026-08-06', 'expense', 'projects', 'Perimeter wall phase 2 — materials', 420000],
  ['2026-08-12', 'expense', 'rent', 'Pastor accommodation rent support', 150000],
  ['2026-08-20', 'income', 'wealth_development_offering', 'Wealth development offering — August', 85000],
  ['2026-08-31', 'income', 'partnership_payment', 'August partnership receipts', 285000],
  ['2026-09-02', 'expense', 'committee_operations', 'Committee meeting logistics', 18000],
  ['2026-09-05', 'expense', 'church_support', 'Church support — sound equipment contribution', 90000],
];
fin.forEach(([date, type, cat, narration, amt], n) =>
  run(`INSERT INTO kpsc_finance_entries (id,date,entry_type,category,amount,payment_method,reference,narration,recorded_by,approval_status,created_at)
       VALUES (?,?,?,?,?,'bank_transfer',?,?,?, 'recorded',?)`,
    `KF-${n}`, date, type, cat, amt, `KF/${400 + n}`, narration, 'Sis. Ngozi Ile', `${date}T12:00:00Z`));

// ── Projects ───────────────────────────────────────────────────────────────
const projects = [
  ['Perimeter Wall — Phase 2', 'Complete the block work and gate on the eastern boundary.', 1800000, 980000, 'active', 'high', '2026-11-30'],
  ['Church Generator Replacement', 'Replace the 15KVA generator; current unit fails under full load.', 2400000, 0, 'proposed', 'high', '2027-02-28'],
  ['Children Church Renovation', 'Repaint, re-roof and re-furnish the children church annexe.', 950000, 950000, 'completed', 'medium', '2026-06-30'],
  ['Borehole & Water Storage', 'Drill borehole and install 2,500L overhead storage for the parish.', 1600000, 240000, 'active', 'medium', '2027-01-31'],
  ['Welfare Emergency Reserve', 'Build a standing reserve so welfare cases are never funded by ad-hoc levies.', 1000000, 310000, 'active', 'high', '2026-12-31'],
  ['Parish Van Fund', 'Contribution fund toward a parish bus for outreach and pickups.', 6500000, 0, 'proposed', 'low', '2027-12-31'],
];
projects.forEach(([title, desc, est, raised, status, pri, target], n) =>
  run(`INSERT INTO kpsc_projects (id,title,description,estimated_cost,actual_cost,status,priority,target_date,source,created_by,created_at,raised_amount)
       VALUES (?,?,?,?,?,?,?,?, 'manual','Elder Paul Okafor',?,?)`,
    `KJ-${n}`, title, desc, est, status === 'completed' ? raised : 0, status, pri, target, '2026-05-01T10:00:00Z', raised));

// ── Meetings (AI Secretary archive) ────────────────────────────────────────
const meetings = [
  ['KPSC Monthly Meeting — August 2026', '2026-08-23', 'routine', 'reviewed'],
  ['KPSC Emergency Meeting — Wall Contract', '2026-08-09', 'emergency', 'reviewed'],
  ['KPSC Monthly Meeting — July 2026', '2026-07-26', 'routine', 'reviewed'],
  ['KPSC Monthly Meeting — June 2026', '2026-06-28', 'routine', 'reviewed'],
  ['KPSC Mid-Year Review', '2026-06-14', 'special', 'reviewed'],
];
meetings.forEach(([title, date, type, status], n) => {
  const participants = members.slice(0, 10 - (n % 3)).map(m => m[0]);
  const resolutions = [
    { text: 'Perimeter wall phase 2 approved at a ceiling of ₦1.8m, contractor to be selected by three quotes.', vote: 'unanimous' },
    { text: 'Welfare reserve to be funded at ₦100,000 per month before any new project commitment.', vote: 'carried' },
    { text: 'Partnership reminders to go out on the 10th of each month by SMS.', vote: 'unanimous' },
  ];
  const actions = [
    { task: 'Obtain three quotes for the wall contract', assignee: 'Bro. Ifeanyi Udeh', due: '2026-09-05' },
    { task: 'Publish the half-year financial summary to the congregation', assignee: 'Sis. Ngozi Ile', due: '2026-09-20' },
    { task: 'Review partner non-payment list and follow up personally', assignee: 'Bro. Chukwuemeka Nze', due: '2026-09-15' },
  ];
  const flags = n === 1 ? [{ level: 'warning', text: 'Project value exceeds the ₦1m byelaw threshold — requires full committee ratification and Pastor sign-off.' }] : [];
  run(`INSERT INTO ai_secretary_meetings (id,title,meeting_type,meeting_date,status,participants_json,transcript_text,summary_short,summary_long,minutes_markdown,resolutions_json,action_items_json,policy_flags_json,created_by,started_at,ended_at,reviewed_at,reviewed_by,venue,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    `AM-${n}`, title, type, date, status, JSON.stringify(participants),
    'Transcript captured live in the meeting room and processed into minutes.',
    'Committee approved the wall contract ceiling, ring-fenced the welfare reserve, and agreed a fixed monthly partner reminder date.',
    'The committee reviewed the month\'s partnership receipts, welfare caseload and project pipeline. Quorum was confirmed with representation from all five constituencies. The treasurer presented the ledger position and the financial secretary reported on partner payment health.',
    `# Minutes — ${title}\n\n**Date:** ${date}  \n**Venue:** Parish Committee Room  \n**Quorum:** Confirmed\n\n## 1. Opening\nOpened in prayer by the Parish Pastor.\n\n## 2. Treasurer's Report\nLedger position presented and accepted.\n\n## 3. Projects\nWall phase 2 progress reviewed.\n\n## 4. Welfare\nOne case approved under the welfare policy.\n\n## 5. Resolutions\nSee resolutions register.\n`,
    JSON.stringify(resolutions), JSON.stringify(actions), JSON.stringify(flags),
    'Sis. Adaeze Okonkwo', `${date}T17:00:00Z`, `${date}T19:10:00Z`, `${date}T20:00:00Z`, 'Elder Paul Okafor',
    'Parish Committee Room', `${date}T17:00:00Z`);
});

// ── Action items ───────────────────────────────────────────────────────────
const items = [
  ['Obtain three quotes for the wall contract', 'Bro. Ifeanyi Udeh', '2026-09-05', 'pending', 'high'],
  ['Publish half-year financial summary to the congregation', 'Sis. Ngozi Ile', '2026-09-20', 'in_progress', 'high'],
  ['Review partner non-payment list and follow up personally', 'Bro. Chukwuemeka Nze', '2026-09-15', 'pending', 'medium'],
  ['Draft welfare policy amendment on emergency disbursement', 'Sis. Adaeze Okonkwo', '2026-08-30', 'pending', 'high'],
  ['Confirm borehole site survey', 'Bro. Kelechi Ani', '2026-09-28', 'pending', 'low'],
  ['Circulate August minutes to all members', 'Sis. Adaeze Okonkwo', '2026-08-28', 'done', 'medium'],
];
items.forEach(([task, who, due, status, pri], n) =>
  run(`INSERT INTO kpsc_action_items (id,task,assignee,created_by,meeting_id,due_date,status,priority,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    `AI-${n}`, task, who, 'Sis. Adaeze Okonkwo', 'AM-0', due, status, pri, '2026-08-23T19:00:00Z'));

// ── SMS log (kpsc_reminders) ───────────────────────────────────────────────
let s = 0;
partners.forEach(([name, phone], n) => {
  [['2026-09-01', 'newmonth', `Happy New Month, ${name.split(' ').slice(1).join(' ')}! May September bring you divine favour. — RCCG Kingdom Parish`, 'sent', 'delivered'],
   ['2026-09-10', 'reminder', `Dear ${name.split(' ').slice(1).join(' ')}, this is a reminder to pay your September partnership pledge. God bless you.`, 'sent', n % 9 === 0 ? 'dnd' : 'delivered'],
  ].forEach(([date, type, msg, status, delivery]) => {
    run(`INSERT INTO kpsc_reminders (id,partner_id,channel,message,status,year,month,sent_by,sent_at,created_at,delivery_status,reminder_type,phone)
         VALUES (?,?,'sms',?,?,2026,9,'cron',?,?,?,?,?)`,
      `SMS-${s++}`, `KP-${n}`, msg, status, `${date}T08:0${n % 6}:00Z`, `${date}T08:00:00Z`, delivery, type, phone);
  });
});
run(`INSERT INTO kpsc_reminders (id,partner_id,channel,message,status,year,month,sent_by,sent_at,created_at,delivery_status,reminder_type,phone)
     VALUES (?,'', 'sms',?, 'sent',2026,9,'Sis. Adaeze Okonkwo',?,?, 'delivered','committee','2348031110001')`,
  `SMS-C1`, 'KPSC meeting reminder: Saturday 27 Sept, 5pm, Parish Committee Room. Agenda circulated. Please be punctual.', '2026-09-08T09:00:00Z', '2026-09-08T09:00:00Z');

// ── Cron run log ───────────────────────────────────────────────────────────
[['run-monthly-sms', '2026-09-01T08:00:00Z', 18, 0, 0],
 ['run-reminder-sms', '2026-09-10T08:00:00Z', 17, 1, 0],
 ['run-anniversary-sms', '2026-09-06T08:00:00Z', 1, 0, 17],
].forEach(([job, ran, sent, failed, skipped], n) =>
  run(`INSERT INTO kpsc_cron_runs (id,job,ran_at,is_send_day,window_ok,sent,failed,skipped,total,trigger,reason)
       VALUES (?,?,?,1,1,?,?,?,?, 'cron','')`, `CR-${n}`, job, ran, sent, failed, skipped, sent + failed + skipped));

// ── Public pledges + feedback ──────────────────────────────────────────────
[['Bro. Chidi Nwafor', '2348031119001', 'Aguleri', 10000, 1],
 ['Sis. Nkechi Obi', '2348031119002', 'Onitsha', 5000, 0],
 ['Bro. Ugochukwu Eze', '2348031119003', 'Dublin, Ireland', 20000, 1],
].forEach(([name, phone, loc, amt, pub], n) =>
  run(`INSERT INTO kpsc_partnership_pledges (id,full_name,phone,location,amount,public_listing,created_at)
       VALUES (?,?,?,?,?,?,?)`, `PL-${n}`, name, phone, loc, amt, pub, '2026-09-0' + (n + 2) + 'T10:00:00Z'));



// ── Committee roster (stored as a settings blob, as the app does) ──────────
const rosterSetting = members.map(([name, group, position], n) => ({
  id: `KM-${n}`, name, group, position, phone: `23480311100${String(60 + n).slice(-2)}`,
}));
run(`INSERT INTO settings (key,value) VALUES ('kpsc_members',?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`, JSON.stringify(rosterSetting));

// ── Demo accounts ──────────────────────────────────────────────────────────
// The application seeds generic placeholder KPSC accounts; give them the same
// demo names as the roster so the screenshots read as one consistent parish.
const demoAccounts = {
  ka1: 'Elder Paul Okafor', ka2: 'Sis. Adaeze Okonkwo', ka3: 'Sis. Ngozi Ile',
  ka4: 'Bro. Chukwuemeka Nze', ka5: 'Bro. Kelechi Ani', ka6: 'IT Administrator',
};
for (const [id, name] of Object.entries(demoAccounts)) {
  run(`UPDATE kpsc_accounts SET name=?, must_change_pin=0 WHERE id=?`, name, id);
}

console.log(`Seeded ${DB_FILE}`);
console.log('Finance portal sign-in: IT Administrator / PIN 0000');
console.log('KPSC portal sign-in:    Elder Paul Okafor / PIN 1234');
