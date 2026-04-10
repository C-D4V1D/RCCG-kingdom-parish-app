// functions/api/auth.js
// POST /api/auth  -> login (verify role + PIN, return user)
// GET  /api/auth  -> list users by role for login dropdown

import { json, err, ok, handleOptions, uid, now } from './_helpers.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return handleOptions();

  const DB = env.DB;

  // GET — return users grouped by role (for login dropdown, PINs hidden)
  if (request.method === 'GET') {
    const { results } = await DB.prepare(
      'SELECT id, name, role, email FROM users ORDER BY role, name'
    ).all();
    return json(results);
  }

  // POST — login: verify pin, return user object
  if (request.method === 'POST') {
    const body = await request.json();
    const { role, userId, pin } = body;
    if (!role || !pin) return err('Role and PIN are required.');

    let query, params;
    if (userId) {
      query = 'SELECT * FROM users WHERE id = ? AND pin = ?';
      params = [userId, pin];
    } else {
      query = 'SELECT * FROM users WHERE role = ? AND pin = ? LIMIT 1';
      params = [role, pin];
    }

    const user = await DB.prepare(query).bind(...params).first();
    if (!user) return err('Incorrect PIN. Please try again.', 401);

    // Log the login in audit
    await DB.prepare(
      'INSERT INTO audit_log (id, type, detail, by_user, ts) VALUES (?, ?, ?, ?, ?)'
    ).bind(uid(), 'login', 'User logged in', user.name, now()).run();

    // Return user without PIN
    const { pin: _p, ...safeUser } = user;
    return ok({ user: safeUser });
  }

  return err('Method not allowed', 405);
}
