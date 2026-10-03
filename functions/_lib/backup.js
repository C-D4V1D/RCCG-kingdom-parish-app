// Full backups, restore from a backup file, and Cloudflare "Time Travel" restores.
//
// A full backup is every table of Kingdom's database AND of each satellite parish's database
// (bindings SAT_<code>), as plain rows:
//   { format: 'rccg-full-backup', version: 2, exportedAt, exportedBy,
//     databases: { main: { label, tables: { income: [...], ... } }, sat_659840: { ... } } }
// It deliberately leaves out sign-in secrets and sessions (BACKUP_SKIP_TABLES): those are
// recreated by the app, and restoring old ones would only sign people out or break logins.
//
// Restoring is done one table chunk per request (the browser loops), because a single request
// may only run a limited number of database queries. Login tables (BACKUP_MERGE_ONLY_TABLES) are
// never emptied and existing accounts are never changed (names, roles and PINs stay as they are now).
//
// Time Travel: Cloudflare keeps a minute-by-minute history of every D1 database (7 days on the
// free plan, 30 days on Workers Paid) and can put a database back to any moment in it. That needs
// a Cloudflare API token with D1 Edit permission, saved as the Pages secret CF_D1_API_TOKEN.

export const BACKUP_FORMAT = 'rccg-full-backup';
export const BACKUP_SKIP_TABLES = new Set(['_cf_KV', 'app_secrets', 'auth_throttle', 'kpsc_sessions', 'sqlite_sequence', 'd1_migrations']);
export const BACKUP_MERGE_ONLY_TABLES = new Set(['users', 'kpsc_accounts']);
// PIN hashes never leave the database in any export. A login missing from the database therefore can't be
// re-created from a backup (its PIN column is required, so INSERT OR IGNORE skips it): the IT admin re-adds it.
export const BACKUP_DROP_COLUMNS = { users: ['pin'], kpsc_accounts: ['pin'] };
// D1 allows at most 100 bound values in one statement.
const MAX_BOUND_PARAMS = 100;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const CF_ACCOUNT_ID = '63d7bbd4f912ddc7b6272dbda2881a82';
export const PRODUCTION_HOST = 'rccg-kingdom-parish-app.pages.dev';
// Database ids from wrangler.toml (tests/backup.test.js keeps these in step with it).
export const D1_DATABASE_IDS = {
  production: {
    main: 'dcc63f58-6079-44ba-900c-ff58bc81c4e8',
    sat_659840: 'f52b7118-0cbb-49ee-b47d-7b3cffd8a276',
    sat_597445: '82aca844-ca06-468f-9b4b-7be14139a9a4',
    sat_761516: 'a3ab2f3d-cd9a-45b7-b4b8-8decb2c02206',
  },
  preview: {
    main: 'eb14d315-57c2-4c13-ab9b-7115e7ae7580',
    sat_659840: '88008e7d-cd7f-42f5-a480-96f5be9da23d',
    sat_597445: '88008e7d-cd7f-42f5-a480-96f5be9da23d',
    sat_761516: '88008e7d-cd7f-42f5-a480-96f5be9da23d',
  },
};

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (error, status = 400) => json({ error }, status);

/** Kingdom's database first, then every satellite parish database bound to this deployment. */
export function backupDatabases(env, satNames = {}) {
  const out = [];
  if (env?.DB) out.push({ key: 'main', label: 'Kingdom Parish', db: env.DB });
  for (const name of Object.keys(env || {}).sort()) {
    const m = /^SAT_(\d{4,8})$/.exec(name);
    if (m && env[name]) out.push({ key: `sat_${m[1]}`, label: satNames[m[1]] ? `${satNames[m[1]]} (${m[1]})` : `Parish ${m[1]}`, db: env[name] });
  }
  return out;
}

async function listTables(db) {
  const { results } = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all();
  return (results || []).map(r => r.name)
    .filter(n => IDENT_RE.test(n) && !n.startsWith('sqlite_') && !n.startsWith('_cf_') && !BACKUP_SKIP_TABLES.has(n));
}

async function tableColumns(db, table) {
  const { results } = await db.prepare(`PRAGMA table_info(${table})`).all();
  return (results || []).map(r => r.name);
}

export async function buildFullBackup(env, { exportedBy = '', satNames = {} } = {}) {
  const databases = {};
  for (const { key, label, db } of backupDatabases(env, satNames)) {
    const tables = {};
    for (const t of await listTables(db)) {
      const { results } = await db.prepare(`SELECT * FROM ${t}`).all();
      const drop = BACKUP_DROP_COLUMNS[t] || [];
      tables[t] = (results || []).map(r => { const o = { ...r }; for (const c of drop) delete o[c]; return o; });
    }
    databases[key] = { label, tables };
  }
  return { format: BACKUP_FORMAT, version: 2, exportedAt: new Date().toISOString(), exportedBy, databases };
}

/**
 * POST /api/admin/restore-table  { db, table, rows, first }
 * `first` empties the table before inserting (except login tables, which are only topped up).
 */
export async function restoreTableChunk(env, body) {
  const key = String(body?.db || '');
  const table = String(body?.table || '');
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) return fail('rows must be a list');
  const target = backupDatabases(env).find(d => d.key === key);
  if (!target) return fail(`Unknown database "${key}" for this deployment.`);
  if (!(await listTables(target.db)).includes(table)) {
    // A table this version of the app no longer has (or never backs up): skip it, don't fail.
    return json({ ok: true, skipped: true, table, inserted: 0 });
  }
  const columns = new Set(await tableColumns(target.db, table));
  const mergeOnly = BACKUP_MERGE_ONLY_TABLES.has(table);
  const verb = mergeOnly ? 'INSERT OR IGNORE' : 'INSERT OR REPLACE';
  const stmts = [];
  if (body.first && !mergeOnly) stmts.push(target.db.prepare(`DELETE FROM ${table}`));

  // Rows read with SELECT * share one shape, but group by shape anyway (an older backup may lack columns).
  const groups = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const cols = Object.keys(row).filter(c => columns.has(c)).sort();
    if (!cols.length) continue;
    const sig = cols.join(',');
    if (!groups.has(sig)) groups.set(sig, { cols, rows: [] });
    groups.get(sig).rows.push(row);
  }
  let inserted = 0;
  for (const { cols, rows: grp } of groups.values()) {
    const per = Math.max(1, Math.floor(MAX_BOUND_PARAMS / cols.length));
    const tuple = `(${cols.map(() => '?').join(',')})`;
    for (let i = 0; i < grp.length; i += per) {
      const part = grp.slice(i, i + per);
      const values = part.flatMap(r => cols.map(c => (r[c] === undefined ? null : r[c])));
      stmts.push(target.db.prepare(`${verb} INTO ${table} (${cols.join(',')}) VALUES ${part.map(() => tuple).join(',')}`).bind(...values));
      inserted += part.length;
    }
  }
  if (stmts.length) await target.db.batch(stmts);
  return json({ ok: true, table, inserted });
}

// ── Time Travel ──────────────────────────────────────────────────────────

export function timeTravelDatabaseIds(requestUrl) {
  let host = '';
  try { host = new URL(requestUrl).hostname; } catch { /* not a URL */ }
  return host === PRODUCTION_HOST ? D1_DATABASE_IDS.production : D1_DATABASE_IDS.preview;
}

export function timeTravelConfigured(env) {
  return !!String(env?.CF_D1_API_TOKEN || '').trim();
}

/** Restore one database to a moment ({ timestamp }) or a saved bookmark ({ bookmark }). */
export async function timeTravelRestore(env, requestUrl, dbKey, { timestamp, bookmark } = {}) {
  const id = timeTravelDatabaseIds(requestUrl)[dbKey];
  if (!id) return { error: `Unknown database "${dbKey}".`, status: 400 };
  const token = String(env?.CF_D1_API_TOKEN || '').trim();
  if (!token) return { error: 'Cloudflare restore is not set up yet (CF_D1_API_TOKEN is missing).', status: 503 };
  const q = bookmark ? `bookmark=${encodeURIComponent(bookmark)}` : `timestamp=${encodeURIComponent(timestamp)}`;
  let res, data = null;
  try {
    res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${id}/time_travel/restore?${q}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    data = await res.json().catch(() => null);
  } catch (e) {
    return { error: 'Could not reach Cloudflare. Try again in a minute.', status: 502 };
  }
  if (!res.ok || !data?.success) {
    const msg = (data?.errors || []).map(e => e.message).filter(Boolean).join('; ') || `Cloudflare answered ${res.status}`;
    return { error: `Cloudflare could not restore: ${msg}`, status: 502 };
  }
  return { ok: true, bookmark: data.result?.bookmark || '', previousBookmark: data.result?.previous_bookmark || '', message: data.result?.message || '' };
}

/** The current bookmark of a database (the point to come back to if a restore goes wrong). */
export async function timeTravelBookmark(env, requestUrl, dbKey) {
  const id = timeTravelDatabaseIds(requestUrl)[dbKey];
  const token = String(env?.CF_D1_API_TOKEN || '').trim();
  if (!id || !token) return '';
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${id}/time_travel/bookmark`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => null);
    return (res.ok && data?.success && data.result?.bookmark) || '';
  } catch { return ''; }
}
