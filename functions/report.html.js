// Intercepts /report.html to inject dynamic <title> and OG meta tags
// before the page is served, so WhatsApp/Telegram/etc. link previews
// show the actual period details rather than the generic static title.
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('t') || '';

  let pageTitle = 'RCCG Remittance Report';
  let ogDescription = 'View the RCCG Kingdom Parish monthly remittance report';

  if (token && env.DB) {
    try {
      const row = await env.DB.prepare(
        `SELECT period_from, period_to, church_name FROM shared_reports WHERE token=?`
      ).bind(token).first();
      if (row) {
        const from = fmtShort(row.period_from);
        const to   = fmtShort(row.period_to);
        const month = fmtMonth(row.period_from);
        pageTitle   = `RCCG Remittance Report (${month}): ${from} — ${to}`;
        ogDescription = `${row.church_name || 'RCCG Kingdom Parish'} · ${from} — ${to}`;
      }
    } catch { /* fall through to defaults */ }
  }

  // Serve the static report.html with dynamic tags injected
  const staticResp = await env.ASSETS.fetch(
    new Request(new URL('/report.html', request.url))
  );
  let html = await staticResp.text();
  html = html.replace(
    '<title>RCCG Remittance Report</title>',
    `<title>${esc(pageTitle)}</title>
<meta property="og:title" content="${esc(pageTitle)}" />
<meta property="og:description" content="${esc(ogDescription)}" />
<meta name="description" content="${esc(ogDescription)}" />
<meta property="og:type" content="article" />`
  );

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'no-cache, no-store',
    },
  });
}

function fmtShort(d) {
  if (!d) return '';
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
function fmtMonth(d) {
  if (!d) return '';
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
