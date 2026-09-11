/**
 * Minimal D1-compatible adapter over node:sqlite.
 *
 * Implements the slice of the D1 binding surface the API worker actually uses:
 * prepare().bind().all()/first()/run()/raw(), batch() and exec(). Enough to run
 * functions/api/[[route]].js unmodified in Node against a local SQLite file.
 */
import { DatabaseSync } from 'node:sqlite';

class Stmt {
  constructor(db, sql, binds = []) { this.db = db; this.sql = sql; this.binds = binds; }
  bind(...vals) { return new Stmt(this.db, this.sql, vals); }
  _prep() {
    const s = this.db.prepare(this.sql);
    return s;
  }
  _args() {
    return this.binds.map(v => {
      if (v === undefined || v === null) return null;
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (v instanceof Uint8Array) return v;
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });
  }
  async all() {
    const rows = this._prep().all(...this._args());
    return { results: rows, success: true, meta: {} };
  }
  async first(col) {
    const row = this._prep().get(...this._args());
    if (row === undefined) return null;
    return col ? row[col] : row;
  }
  async run() {
    const info = this._prep().run(...this._args());
    return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid, rows_written: info.changes } };
  }
  async raw() {
    const rows = this._prep().all(...this._args());
    return rows.map(r => Object.values(r));
  }
}

export function createD1(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  return {
    prepare(sql) { return new Stmt(db, sql); },
    async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
    async exec(sql) { db.exec(sql); return { count: 1, duration: 0 }; },
    _raw: db,
  };
}
