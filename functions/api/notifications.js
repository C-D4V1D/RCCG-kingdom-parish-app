// functions/api/notifications.js
import { json, err, ok, handleOptions, uid, now } from './_helpers.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();
  const DB = env.DB;

  if (request.method === 'GET') {
    const { results } = await DB.prepare(
      'SELECT * FROM notifications ORDER BY ts DESC LIMIT 50'
    ).all();
    return json(results.map(r => ({
      id: r.id, title: r.title, body: r.body,
      type: r.type, read: r.read === 1, ts: r.ts
    })));
  }

  if (request.method === 'POST') {
    const b = await request.json();
    if (b.action === 'mark_read') {
      await DB.prepare('UPDATE notifications SET read = 1').run();
      return ok();
    }
    await DB.prepare(
      'INSERT INTO notifications (id, title, body, type, ts) VALUES (?, ?, ?, ?, ?)'
    ).bind(uid(), b.title || '', b.body || '', b.type || 'info', now()).run();
    return ok();
  }

  return err('Method not allowed', 405);
}
