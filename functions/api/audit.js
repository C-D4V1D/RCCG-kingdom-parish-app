// functions/api/audit.js
import { json, err, handleOptions } from './_helpers.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();
  const DB = env.DB;
  if (request.method === 'GET') {
    const { results } = await DB.prepare(
      'SELECT * FROM audit_log ORDER BY ts DESC LIMIT 200'
    ).all();
    return json(results.map(r => ({
      id: r.id, type: r.type, detail: r.detail, by: r.by_user, ts: r.ts
    })));
  }
  return err('Method not allowed', 405);
}
