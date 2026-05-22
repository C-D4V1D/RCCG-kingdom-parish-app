const FALLBACK_IMAGE = 'https://rccg-kingdom-parish-app.pages.dev/icons/og-partnership.png';
const DEFAULTS = {
  title: "God's Kingdom Partnership — RCCG Kingdom Parish, Aguleri",
  desc:  'A monthly pledge to build our church and carry our members — faithfully, transparently. Join our Kingdom Partners today.',
};

export async function onRequestGet(context) {
  const { env, request } = context;

  // Fetch the static partnership/index.html from the asset binding
  let response;
  try {
    response = await env.ASSETS.fetch(request);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
    return response;
  }

  // Read OG settings from D1
  let smap = {};
  try {
    const keys = ['partnership_og_title', 'partnership_og_description', 'partnership_og_image'];
    const ph   = keys.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT key, value FROM settings WHERE key IN (${ph})`
    ).bind(...keys).all();
    (results || []).forEach(r => { smap[r.key] = String(r.value || '').trim(); });
  } catch { /* fall through to defaults */ }

  const host  = new URL(request.url).origin;
  const title = smap.partnership_og_title        || DEFAULTS.title;
  const desc  = smap.partnership_og_description  || DEFAULTS.desc;
  const rawImg = smap.partnership_og_image || '';
  // data: URLs can't be used in OG tags — proxy them through the API endpoint
  const image = rawImg
    ? (rawImg.startsWith('data:') ? `${host}/api/partnership-og-image` : rawImg)
    : FALLBACK_IMAGE;

  return new HTMLRewriter()
    .on('meta[property="og:title"]',        { element: el => el.setAttribute('content', title) })
    .on('meta[property="og:description"]',  { element: el => el.setAttribute('content', desc)  })
    .on('meta[property="og:image"]',        { element: el => el.setAttribute('content', image) })
    .on('meta[property="og:url"]',          { element: el => el.setAttribute('content', `${host}/partnership/`) })
    .on('meta[name="twitter:title"]',       { element: el => el.setAttribute('content', title) })
    .on('meta[name="twitter:description"]', { element: el => el.setAttribute('content', desc)  })
    .on('meta[name="twitter:image"]',       { element: el => el.setAttribute('content', image) })
    .transform(response);
}
