// functions/api/settings.js
import { json, err, ok, handleOptions } from './_helpers.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();
  const DB = env.DB;

  if (request.method === 'GET') {
    const { results } = await DB.prepare('SELECT key, value FROM settings').all();
    const out = {};
    results.forEach(r => {
      try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
    });
    return json(out);
  }

  if (request.method === 'POST') {
    const body = await request.json();
    const stmts = Object.entries(body).map(([k, v]) =>
      DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .bind(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
    );
    await DB.batch(stmts);
    return ok();
  }

  return err('Method not allowed', 405);
}
