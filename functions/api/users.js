// functions/api/users.js
// GET    /api/users      -> list all users (no PINs)
// POST   /api/users      -> create user
// PATCH  /api/users/:id  -> update user
// DELETE /api/users/:id  -> delete user

import { json, err, ok, handleOptions, uid, now } from './_helpers.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return handleOptions();
  const DB = env.DB;

  if (request.method === 'GET') {
    const { results } = await DB.prepare(
      'SELECT id, name, role, email, created_at FROM users ORDER BY role, name'
    ).all();
    return json(results);
  }

  if (request.method === 'POST') {
    const body = await request.json();
    const { name, role, pin, email } = body;
    if (!name || !role || !pin || pin.length < 4)
      return err('Name, role, and PIN (min 4 digits) are required.');
    const id = 'u' + uid();
    await DB.prepare(
      'INSERT INTO users (id, name, role, pin, email, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, name, role, pin, email || '', now()).run();
    await DB.prepare(
      'INSERT INTO audit_log (id, type, detail, by_user, ts) VALUES (?, ?, ?, ?, ?)'
    ).bind(uid(), 'user_added', `New user: ${name} (${role})`, 'System', now()).run();
    return ok({ id });
  }

  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const userId = parts[parts.length - 1];

  if (request.method === 'PATCH') {
    const body = await request.json();
    const sets = [];
    const vals = [];
    if (body.name)  { sets.push('name = ?');  vals.push(body.name); }
    if (body.role)  { sets.push('role = ?');  vals.push(body.role); }
    if (body.email !== undefined) { sets.push('email = ?'); vals.push(body.email); }
    if (body.pin && body.pin.length >= 4) { sets.push('pin = ?'); vals.push(body.pin); }
    if (!sets.length) return err('Nothing to update.');
    vals.push(userId);
    await DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    return ok();
  }

  if (request.method === 'DELETE') {
    await DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
    return ok();
  }

  return err('Method not allowed', 405);
}
