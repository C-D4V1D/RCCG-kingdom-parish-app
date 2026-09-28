#!/usr/bin/env node
// One-off, READ-ONLY probe (2026-09-28): what does remita.net/pay/pay-rrr show for an RRR?
// It opens the page, types the RRR, presses Enter (or a Submit/Continue/Proceed/Check button - never one saying "Pay"),
// waits, and saves what the page shows plus the web requests the page made (to find a status lookup the box can use).
// Nothing is paid and nothing is logged in to.   Usage:  node remita-probe.js <RRR>
// Output: /tmp/remita-probe/{page.png, page.txt, requests.json}
'use strict';
const fs = require('fs'), path = require('path');
const OUT = '/tmp/remita-probe';
const rrr = String(process.argv[2] || '').replace(/[^0-9]/g, '');
if (rrr.length < 10) { console.error('usage: node remita-probe.js <RRR, e.g. 1234-5678-9012>'); process.exit(2); }
let chromium;
for (const p of ['/workspace/tools/pw/node_modules/playwright', '/workspace/tools/pw/node_modules/playwright-core', 'playwright', 'playwright-core']) {
  try { ({ chromium } = require(p)); break; } catch (e) { /* try the next place */ }
}
if (!chromium) { console.error('Playwright not found on this box (looked in /workspace/tools/pw).'); process.exit(3); }
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1800 } });
  const reqs = [];
  page.on('response', async (r) => {
    const ct = r.headers()['content-type'] || '';
    const rec = { url: r.url(), status: r.status(), method: r.request().method(), type: ct.split(';')[0] };
    if (/json|text\/plain/.test(ct)) { try { rec.body = (await r.text()).slice(0, 1500); } catch { /* ignore */ } }
    if (r.request().method() !== 'GET') { try { rec.sent = (r.request().postData() || '').slice(0, 500); } catch { /* ignore */ } }
    reqs.push(rec);
  });
  await page.goto('https://remita.net/pay/pay-rrr', { waitUntil: 'networkidle', timeout: 60000 });
  const input = page.locator('input:visible').first();
  await input.fill(rrr);
  await input.press('Enter');
  await page.waitForTimeout(4000);
  const btn = page.locator('button:visible, input[type=submit]:visible').filter({ hasText: /submit|continue|proceed|check|verify|validate|search/i })
    .filter({ hasNotText: /pay/i }).first();
  if (await btn.count()) { await btn.click().catch(() => {}); }
  await page.waitForTimeout(8000);
  await page.screenshot({ path: path.join(OUT, 'page.png'), fullPage: true });
  fs.writeFileSync(path.join(OUT, 'page.txt'), await page.innerText('body'));
  fs.writeFileSync(path.join(OUT, 'requests.json'), JSON.stringify(reqs.filter(x => !/\.(png|jpe?g|svg|gif|woff2?|ttf|css)(\?|$)/i.test(x.url)), null, 1));
  await browser.close();
  const text = fs.readFileSync(path.join(OUT, 'page.txt'), 'utf8');
  console.log('--- what the page says (first 1500 characters) ---\n' + text.replace(/\n{3,}/g, '\n\n').slice(0, 1500));
  console.log('\n--- data requests the page made ---');
  for (const r of reqs) if (/json/.test(r.type || '')) console.log(r.status, r.method, r.url.slice(0, 140));
  console.log(`\nSaved: ${OUT}/page.png (screenshot), page.txt, requests.json`);
})().catch(e => { console.error('probe failed:', e.message); process.exit(1); });
