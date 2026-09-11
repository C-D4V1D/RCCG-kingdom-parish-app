/**
 * Regenerates docs/screenshots/ from the local demo server.
 *
 *   node scripts/demo/seed.mjs                 # build the demo database
 *   node scripts/demo/serve.mjs &              # start it on :8788
 *   npx playwright install chromium            # once
 *   node scripts/demo/capture-screenshots.mjs  # capture + optimise
 *
 * Playwright and sharp are resolved at run time so neither is a hard dependency
 * of the app itself; sharp already ships as a devDependency for icon generation.
 *
 * Desktop screens are captured at 1440px and downscaled to 1280px; the committee
 * portal is captured at phone width because that is what it is designed for.
 * Very long pages are cropped to a readable height rather than shipped whole.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const RAW = path.join(HERE, '.shots');
const OUT = path.join(ROOT, 'docs/screenshots');
const BASE = process.env.DEMO_URL || 'http://localhost:8788';

// Playwright is usually a global install rather than a project dependency, so try
// the plain specifier first and fall back to an explicit path via PLAYWRIGHT_MODULE.
async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean);
  for (const spec of candidates) {
    try { return await import(spec); } catch { /* try the next one */ }
  }
  throw new Error(
    'Playwright not found. Install it with `npm i -D playwright && npx playwright install chromium`, ' +
    'or point PLAYWRIGHT_MODULE at an existing install (e.g. ' +
    'PLAYWRIGHT_MODULE=/usr/lib/node_modules/playwright/index.mjs).',
  );
}
const { chromium } = await loadPlaywright();
const sharp = (await import('sharp')).default;

fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const shot = (page, name, fullPage = true) => page.screenshot({ path: path.join(RAW, name), fullPage });

// ── Finance portal (desktop) ───────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const hideBanner = () => p.addStyleTag({ content: '#updateBanner{display:none!important}' }).catch(() => {});

  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await hideBanner();
  await shot(p, '01-login.png', false);

  await p.selectOption('#roleSelect', 'it_admin');
  await p.fill('#pinInput', '0000');
  await p.click('#loginScreen .hp-signin-btn');
  await p.waitForTimeout(6000);

  // A full calendar month reads better than a part-period.
  await p.evaluate(() => window.App.setPeriodMode('calendar'));
  await p.waitForTimeout(2500);
  await p.selectOption('#globalMonth', '2026-7');
  await p.waitForTimeout(3500);

  const pages = ['dashboard', 'transactions', 'income', 'remittances', 'expenses',
    'bank', 'petty_cash', 'reports', 'audit', 'admin'];
  let n = 2;
  for (const pg of pages) {
    await p.evaluate(x => window.App.navigate(x), pg);
    await p.waitForTimeout(3500);
    await hideBanner();
    await shot(p, `${String(n++).padStart(2, '0')}-${pg}.png`);
  }
  await ctx.close();
}

// ── Committee portal (phone) ───────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 950 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/kpsc/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await shot(p, '20-kpsc-login.png', false);

  await p.selectOption('#kpsc-account-select', 'ka1');
  await p.fill('#kpsc-pin-input', '1234');
  await p.click('#kpsc-login-screen button');
  await p.waitForTimeout(6000);
  await shot(p, '21-kpsc-dashboard.png');

  const pages = ['archive', 'reports', 'projects', 'action_items', 'agenda_builder', 'finance',
    'partners', 'partner-progress', 'sms_logs', 'reminders', 'members', 'member_sms', 'settings', 'inbox'];
  let n = 22;
  for (const pg of pages) {
    await p.evaluate(x => window.Kpsc.navigate(x), pg);
    await p.waitForTimeout(3500);
    await shot(p, `${n++}-kpsc-${pg}.png`);
  }

  // Open an archived meeting to capture the meeting room.
  await p.evaluate(() => window.Kpsc.navigate('archive'));
  await p.waitForTimeout(3000);
  const card = await p.$('.k-meeting-card, .ka-card, [onclick*="openMeeting"]');
  if (card) { await card.click(); await p.waitForTimeout(4000); await shot(p, '43-kpsc-meeting.png'); }
  await ctx.close();
}

// ── Public site (desktop) ──────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  // The landing page reveals sections on scroll; force them visible and walk the page
  // so a full-page capture is not mostly blank.
  const settle = async () => {
    await p.addStyleTag({ content: '.reveal{opacity:1!important;transform:none!important}' });
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 90));
      }
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(2500);
  };
  for (const [url, name] of [['/partnership/', '40-partnership-landing.png'],
    ['/partnership/progress/', '41-partnership-progress.png']]) {
    await p.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(3000);
    await settle();
    await shot(p, name);
  }
  await ctx.close();
}

await browser.close();

// ── Optimise: downscale, crop over-long pages, recompress ──────────────────
const MAP = {
  '01-login.png':                ['01-portal-homepage.png', 1280, 1400],
  '02-dashboard.png':            ['02-finance-dashboard.png', 1280, 4200],
  '03-transactions.png':         ['03-transactions-ledger.png', 1280, 2600],
  '04-income.png':               ['04-income-recording.png', 1280, 2600],
  '05-remittances.png':          ['05-remittance-calculator.png', 1280, 3400],
  '06-expenses.png':             ['06-expenses.png', 1280, 2600],
  '07-bank.png':                 ['07-bank-reconciliation.png', 1280, 2600],
  '08-petty_cash.png':           ['08-petty-cash.png', 1280, 2600],
  '09-reports.png':              ['09-reports-centre.png', 1280, 2200],
  '10-audit.png':                ['10-audit-log.png', 1280, 1600],
  '11-admin.png':                ['11-it-admin-panel.png', 1280, 2400],
  '20-kpsc-login.png':           ['20-kpsc-login.png', 430, 950],
  '21-kpsc-dashboard.png':       ['21-kpsc-home.png', 430, 1400],
  '22-kpsc-archive.png':         ['22-kpsc-meeting-archive.png', 430, 1800],
  '24-kpsc-projects.png':        ['24-kpsc-projects.png', 430, 1900],
  '25-kpsc-action_items.png':    ['25-kpsc-action-items.png', 430, 1900],
  '26-kpsc-agenda_builder.png':  ['26-kpsc-agenda-builder.png', 430, 1800],
  '27-kpsc-finance.png':         ['27-kpsc-finance.png', 430, 1900],
  '28-kpsc-partners.png':        ['28-kpsc-partners.png', 430, 1900],
  '29-kpsc-partner-progress.png':['29-kpsc-partner-progress.png', 430, 2400],
  '30-kpsc-sms_logs.png':        ['30-kpsc-sms-logs.png', 430, 2200],
  '31-kpsc-reminders.png':       ['31-kpsc-reminders.png', 430, 1800],
  '32-kpsc-members.png':         ['32-kpsc-committee-roster.png', 430, 1900],
  '33-kpsc-member_sms.png':      ['33-kpsc-committee-sms.png', 430, 1800],
  '43-kpsc-meeting.png':         ['43-kpsc-meeting-room.png', 430, 2200],
  '40-partnership-landing.png':  ['40-partnership-landing.png', 1100, 5200],
  '41-partnership-progress.png': ['41-partnership-progress.png', 1100, 3200],
};

for (const [src, [out, width, maxHeight]] of Object.entries(MAP)) {
  const file = path.join(RAW, src);
  if (!fs.existsSync(file)) { console.warn(`skipped (not captured): ${src}`); continue; }
  const { width: w0, height: h0 } = await sharp(file).metadata();
  const scaledHeight = Math.round(h0 * (width / w0));
  let pipeline = sharp(file).resize({ width });
  if (scaledHeight > maxHeight) pipeline = pipeline.extract({ left: 0, top: 0, width, height: maxHeight });
  await pipeline.png({ compressionLevel: 9, palette: true, quality: 88 }).toFile(path.join(OUT, out));
  console.log(`${out}  ${width}x${Math.min(scaledHeight, maxHeight)}`);
}

console.log(`\nWrote ${Object.keys(MAP).length} screenshots to docs/screenshots/`);
