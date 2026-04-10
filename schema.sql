-- RCCG Kingdom Parish — D1 Database Schema
-- Run this in Cloudflare Dashboard → D1 → rccg-parish-db → Console

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  pin TEXT NOT NULL,
  email TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS income (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  members_tithe REAL DEFAULT 0,
  ministers_tithe REAL DEFAULT 0,
  thanksgiving REAL DEFAULT 0,
  sunday_school REAL DEFAULT 0,
  slo REAL DEFAULT 0,
  crm REAL DEFAULT 0,
  workers_offering REAL DEFAULT 0,
  children_offering REAL DEFAULT 0,
  total_collection REAL DEFAULT 0,
  usher TEXT DEFAULT '',
  recorded_by TEXT DEFAULT '',
  deposit_confirmed INTEGER DEFAULT 0,
  teller_no TEXT DEFAULT '',
  deposited_by TEXT DEFAULT '',
  deposit_date TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  receipt_no TEXT DEFAULT '',
  payment_method TEXT DEFAULT 'petty_cash',
  notes TEXT DEFAULT '',
  recorded_by TEXT DEFAULT '',
  petty_ref TEXT DEFAULT '',
  status TEXT DEFAULT 'approved',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS remittances (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  amount REAL NOT NULL,
  paid_date TEXT DEFAULT '',
  reference TEXT DEFAULT '',
  authorized_by TEXT DEFAULT '',
  status TEXT DEFAULT 'paid',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS petty_cash (
  id TEXT PRIMARY KEY,
  type TEXT DEFAULT 'request',
  purpose TEXT DEFAULT '',
  amount REAL DEFAULT 0,
  actual_amount REAL,
  category TEXT DEFAULT '',
  date_needed TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  requested_by TEXT DEFAULT '',
  approved_by TEXT DEFAULT '',
  approved_at TEXT DEFAULT '',
  rejected_by TEXT DEFAULT '',
  rejection_reason TEXT DEFAULT '',
  rejected_at TEXT DEFAULT '',
  settled_by TEXT DEFAULT '',
  settled_at TEXT DEFAULT '',
  receipt_no TEXT DEFAULT '',
  vendor TEXT DEFAULT '',
  change_returned REAL DEFAULT 0,
  reference TEXT DEFAULT '',
  authorized_by TEXT DEFAULT '',
  status TEXT DEFAULT 'pending_approval',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS petty_float (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  float_amount REAL DEFAULT 50000,
  max_amount REAL DEFAULT 50000
);

INSERT OR IGNORE INTO petty_float (id, float_amount, max_amount) VALUES (1, 50000, 50000);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  type TEXT DEFAULT '',
  detail TEXT DEFAULT '',
  by_user TEXT DEFAULT 'System',
  ts TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('churchName', 'RCCG Kingdom Parish, Aguleri'),
  ('bankName', ''),
  ('accountNo', ''),
  ('pettyMax', '50000'),
  ('quotas', '{"rmf":5000,"csr":3000,"edu":2000,"camp":5000,"mummy":8000,"volunteer":2000,"goFishing":10000}');

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  title TEXT DEFAULT '',
  body TEXT DEFAULT '',
  type TEXT DEFAULT 'info',
  read INTEGER DEFAULT 0,
  ts TEXT DEFAULT (datetime('now'))
);

-- Default users (change PINs after first login!)
INSERT OR IGNORE INTO users (id, name, role, pin, email) VALUES
  ('u1', 'IT Administrator',       'it_admin',      '0000', 'it@kpaguleri.org'),
  ('u2', 'Rev. Emmanuel Obi',      'pastor',        '1111', 'pastor@kpaguleri.org'),
  ('u3', 'Bro. Chukwuemeka Nze',  'accountant',    '2222', 'accounts@kpaguleri.org'),
  ('u4', 'Sis. Adaeze Okonkwo',   'admin_officer', '3333', 'admin@kpaguleri.org'),
  ('u5', 'Elder Paul Okafor',      'signatory',     '4444', 'elder1@kpaguleri.org'),
  ('u6', 'Elder James Eze',        'signatory',     '4444', 'elder2@kpaguleri.org'),
  ('u7', 'Visitor Access',         'viewer',        '9999', '');
