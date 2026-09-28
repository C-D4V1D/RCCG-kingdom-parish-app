#!/usr/bin/env node
// Is an RRR paid? Read-only check on remita.net/pay/pay-rrr (monthclose-20260930).
// Opens the public page, types the RRR, presses Proceed (never anything saying "Pay") and reads Remita's own answer to
// the page's lookup (guestbridge-service/.../biller/lookup/<RRR>): status "23" / "Transaction already processed" = paid.
// Prints one JSON line: {"rrr", "paid": true|false|null, "status", "message"}; null = couldn't tell (try later).
// Usage: node remita-check.cjs <RRR>        Exit 0 always (except usage 2); the JSON says what happened.
'use strict';
function classify(body) {
  let j = null;
  try { j = typeof body === 'string' ? JSON.parse(body) : body; } catch { return { paid: null, status: null, message: 'unreadable answer' }; }
  if (!j || typeof j !== 'object') return { paid: null, status: null, message: 'empty answer' };
  const status = j.status == null ? null : String(j.status), message = String(j.message || '');
  if (status === '23' || /already\s+processed|already\s+paid/i.test(message)) return { paid: true, status, message };
  if ((status === '00' || status === '0' || /success|approved/i.test(message)) && j.data) return { paid: false, status, message };
  return { paid: null, status, message };
}
module.exports = { classify };
if (require.main === module) {
  const rrr = String(process.argv[2] || '').replace(/[^0-9]/g, '');
  if (rrr.length < 10) { console.error('usage: node remita-check.cjs <RRR>'); process.exit(2); }
  const out = o => { console.log(JSON.stringify({ rrr, ...o })); process.exit(0); };
  let chromium;
  for (const p of ['/workspace/tools/pw/node_modules/playwright', '/workspace/tools/pw/node_modules/playwright-core', 'playwright', 'playwright-core']) {
    try { ({ chromium } = require(p)); break; } catch { /* next */ }
  }
  if (!chromium) out({ paid: null, status: null, message: 'Playwright not found on this box' });
  (async () => {
    let res, browser;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      const lookup = page.waitForResponse(r => /\/biller\/lookup\/\d+/.test(r.url()), { timeout: 45000 });
      await page.goto('https://remita.net/pay/pay-rrr', { waitUntil: 'networkidle', timeout: 60000 });
      const input = page.locator('input:visible').first();
      await input.fill(rrr);
      await input.press('Enter');
      const btn = page.locator('button:visible').filter({ hasText: /proceed|continue|submit/i }).filter({ hasNotText: /pay/i }).first();
      if (await btn.count()) await btn.click().catch(() => {});
      const r = await lookup;
      res = classify(await r.text());
    } catch (e) {
      res = { paid: null, status: null, message: `could not check (${String(e.message || e).split('\n')[0].slice(0, 120)})` };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
    out(res);   // printed after the browser has closed
  })();
}
// monthclose-20260930
