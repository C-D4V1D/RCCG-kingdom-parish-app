import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, renderBudgetSharePage, render404Page } from '../functions/budget/[slug].js';

// A realistic October 2026 snapshot matching the share-contract numbers.
const OCTOBER_SNAPSHOT = {
  v: 1,
  monthKey: '2026-10',
  monthLabel: 'October 2026',
  periodFrom: '2026-09-21',
  periodTo: '2026-10-18',
  periodLabel: '21 Sep – 18 Oct',
  dayOf: 'Day 5 of 28',
  churchName: 'RCCG Kingdom Parish',
  asOf: '2026-09-25T14:13:00.000Z',
  status: 'enough',
  statusText: 'Enough',
  isCurrent: true,
  available: { free: 41836, freeEnd: 79600, riseBy: '18 Oct', status: 'yes' },
  totalBudget: 116819,
  spent: 5100,
  pctSpent: 4,
  periodPct: 18,
  normal: 100000,
  cushion: 16819,
  cushionLabel: 'Safety cushion',
  expectedIncome: 400000,
  knownBillsMonthly: 10684,
  lines: [
    { label: 'RCCG demands (besides remittance)', kind: 'rccg', budgeted: 33220, saved: 0, usable: 33220, spent: 0, left: 33220, pace: 'on_track', saves: false },
    { label: 'Power & Energy', kind: 'running', budgeted: 23900, saved: 2000, usable: 25900, spent: 1500, left: 24400, pace: 'on_track', saves: true },
    { label: 'Hospitality', kind: 'running', budgeted: 18000, saved: 0, usable: 18000, spent: 3600, left: 14400, pace: 'watch', saves: false },
  ],
  cushionCard: { used: 0, amount: 16819, left: 16819, pace: 'on_track' },
  knownBills: [
    { name: 'Church rent', amount: 203000, dueLabel: 'Due 1 Feb 2028', saved: 40000, monthly: 7250 },
    { name: 'DSTV subscription', amount: 24500, dueLabel: 'Due 5 Oct', saved: 0, monthly: 24500 },
  ],
  sharedBy: 'Jane Doe',
};

const RENDER_OPTS = { origin: 'https://rccg-kingdom-parish-app.pages.dev', slug: 'october-2026', version: '20260925141300' };

function createDBMock(rows) {
  return {
    prepare(sql) {
      const statement = {
        _bound: [],
        bind(...args) { statement._bound = args; return statement; },
        async first() {
          const slug = statement._bound[0];
          const row = rows[slug];
          if (!row) return null;
          if (/SELECT image_png FROM budget_shares/.test(sql)) return { image_png: row.image_png };
          if (/SELECT data_json, updated_at, created_by FROM budget_shares/.test(sql)) {
            return { data_json: row.data_json, updated_at: row.updated_at, created_by: row.created_by };
          }
          return null;
        },
      };
      return statement;
    },
  };
}

// A minimal-but-valid 1x1 PNG, base64-encoded, for the image-route tests.
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('renderBudgetSharePage: Open Graph tags are present with the right figures', () => {
  const html = renderBudgetSharePage(OCTOBER_SNAPSHOT, RENDER_OPTS);
  assert.match(html, /<title>October 2026 Budget — RCCG Kingdom Parish<\/title>/);
  assert.match(html, /<meta property="og:title" content="October 2026 Budget — RCCG Kingdom Parish">/);
  assert.match(html, /<meta property="og:description" content="Total ₦116,819 · Spent ₦5,100 \(4%\) · Available for new spending ₦41,836 · Status: Enough">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/rccg-kingdom-parish-app\.pages\.dev\/budget\/october-2026\.png\?v=20260925141300">/);
  assert.match(html, /<meta property="og:image:width" content="1200">/);
  assert.match(html, /<meta property="og:image:height" content="630">/);
  assert.match(html, /<meta property="og:type" content="website">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/rccg-kingdom-parish-app\.pages\.dev\/budget\/october-2026">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<meta name="robots" content="noindex">/);
});

test('renderBudgetSharePage: og:description omits the Available part when available is null', () => {
  const html = renderBudgetSharePage({ ...OCTOBER_SNAPSHOT, available: null }, RENDER_OPTS);
  assert.match(html, /<meta property="og:description" content="Total ₦116,819 · Spent ₦5,100 \(4%\) · Status: Enough">/);
  assert.doesNotMatch(html, /Available for new spending/);
});

test('renderBudgetSharePage: escapes church name, sharedBy, and other free-text fields', () => {
  const html = renderBudgetSharePage({
    ...OCTOBER_SNAPSHOT,
    churchName: 'RCCG "Kingdom" <Parish>',
    sharedBy: 'Jane <script>alert(1)</script>',
    lines: [{ label: 'Power & <b>Energy</b>', kind: 'running', budgeted: 1000, usable: 1000, spent: 0, left: 1000, pace: 'on_track' }],
  }, RENDER_OPTS);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /RCCG &quot;Kingdom&quot; &lt;Parish&gt;/);
  assert.match(html, /Jane &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Power &amp; &lt;b&gt;Energy&lt;\/b&gt;/);
});

test('renderBudgetSharePage: renders money, pace chips, the period-elapsed marker, and known bills', () => {
  const html = renderBudgetSharePage(OCTOBER_SNAPSHOT, RENDER_OPTS);
  assert.match(html, /₦41,836/); // available hero
  assert.match(html, /Could rise to ₦79,600 by 18 Oct/);
  assert.match(html, /₦116,819/); // total budget
  assert.match(html, /Spent ₦5,100/);
  assert.match(html, /style="width:4%"/); // spend bar fill
  assert.match(html, /class="marker" style="left:18%"/); // period-elapsed marker
  assert.match(html, /On track/);
  assert.match(html, /Watch/);
  assert.match(html, /Church rent/);
  assert.match(html, /DSTV subscription/);
  assert.match(html, /₦203,000/);
  assert.match(html, /Jane Doe/); // footer "Shared by"
});

test('renderBudgetSharePage: negative figures render with the minus-naira glyph', () => {
  const html = renderBudgetSharePage({
    ...OCTOBER_SNAPSHOT,
    lines: [{ label: 'Overspent line', kind: 'running', budgeted: 1000, usable: 1000, spent: 1500, left: -500, pace: 'over' }],
  }, RENDER_OPTS);
  assert.match(html, /−₦1,500|Left −₦500/); // left is negative
});

test('render404Page: friendly copy, no OG tags, noindex', () => {
  const html = render404Page();
  assert.match(html, /This budget link is not available/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(html, /og:title/);
});

test('onRequest: HTML route serves the rendered page for a known slug', async () => {
  const DB = createDBMock({
    'october-2026': { data_json: JSON.stringify(OCTOBER_SNAPSHOT), updated_at: '2026-09-25T14:13:00.000Z', created_by: 'Jane Doe' },
  });
  const response = await onRequest({
    params: { slug: 'october-2026' },
    env: { DB },
    request: new Request('https://rccg-kingdom-parish-app.pages.dev/budget/october-2026'),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/html;charset=UTF-8');
  assert.equal(response.headers.get('Cache-Control'), 'no-cache');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
  const html = await response.text();
  assert.match(html, /October 2026 Budget/);
  assert.match(html, /₦116,819/);
});

test('onRequest: HTML route 404s for an unknown slug, with noindex', async () => {
  const DB = createDBMock({});
  const response = await onRequest({
    params: { slug: 'not-a-real-month-9999' },
    env: { DB },
    request: new Request('https://rccg-kingdom-parish-app.pages.dev/budget/not-a-real-month-9999'),
  });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
  const html = await response.text();
  assert.match(html, /This budget link is not available/);
});

test('onRequest: a syntactically invalid slug 404s without querying the DB', async () => {
  let queried = false;
  const DB = { prepare() { queried = true; return { bind() { return this; }, async first() { return null; } }; } };
  const response = await onRequest({
    params: { slug: 'DROP TABLE;--' },
    env: { DB },
    request: new Request('https://rccg-kingdom-parish-app.pages.dev/budget/DROP%20TABLE%3B--'),
  });
  assert.equal(response.status, 404);
  assert.equal(queried, false);
});

test('onRequest: PNG route returns image/png bytes with a 1-day cache and noindex', async () => {
  const DB = createDBMock({
    'october-2026': { image_png: TINY_PNG_BASE64 },
  });
  const response = await onRequest({
    params: { slug: 'october-2026.png' },
    env: { DB },
    request: new Request('https://rccg-kingdom-parish-app.pages.dev/budget/october-2026.png'),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=86400');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
  const bytes = new Uint8Array(await response.arrayBuffer());
  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  assert.deepEqual(Array.from(bytes.slice(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test('onRequest: PNG route 404s when the slug has no stored image', async () => {
  const DB = createDBMock({
    'october-2026': { image_png: '' },
  });
  const response = await onRequest({
    params: { slug: 'october-2026.png' },
    env: { DB },
    request: new Request('https://rccg-kingdom-parish-app.pages.dev/budget/october-2026.png'),
  });
  assert.equal(response.status, 404);
});

test('onRequest: PNG route 404s for an unknown slug', async () => {
  const DB = createDBMock({});
  const response = await onRequest({
    params: { slug: 'never-shared-2099.png' },
    env: { DB },
    request: new Request('https://rccg-kingdom-parish-app.pages.dev/budget/never-shared-2099.png'),
  });
  assert.equal(response.status, 404);
});
