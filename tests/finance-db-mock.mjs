// Minimal in-memory stand-in for the D1 binding, covering exactly the SQL shapes
// createIncome()/mergeIntoIncome()/mergeDuplicateSundayCollections()/getIncome()
// issue against the income, cash_transactions, expenses and settings tables.
// Lives outside *.test.js so importing it never re-runs another file's tests.
const INCOME_COLUMNS = [
  'id', 'date', 'members_tithe', 'ministers_tithe', 'thanksgiving', 'sunday_school', 'slo', 'crm',
  'workers_offering', 'first_fruit', 'children_offering', 'weekend_offering', 'holy_communion_offering',
  'total_collection', 'bank_transfer_amount', 'direct_petty_cash', 'source', 'payment_method', 'donor_name',
  'usher', 'recorded_by', 'deposit_confirmed', 'teller_no', 'deposited_by', 'deposit_date', 'notes',
  'created_at', 'bank_transfer_details', 'custom_collections',
];

export function createFinanceDBMock(seed = {}) {
  // seed.noCustomColumn reproduces a database that never ran the /api/init migration:
  // any read/write of income.custom_collections fails the way D1 fails, until an
  // ALTER TABLE adds it.
  let hasCustomColumn = !seed.noCustomColumn;
  const tables = {
    income: [...(seed.income || [])],
    cash_transactions: [...(seed.cash_transactions || [])],
    expenses: [...(seed.expenses || [])],
    audit_log: [...(seed.audit_log || [])],
  };
  let seq = 0;

  function insertIncome(binds) {
    const cols = [
      'id', 'date', 'members_tithe', 'ministers_tithe', 'thanksgiving', 'sunday_school',
      'slo', 'crm', 'workers_offering', 'first_fruit', 'children_offering', 'weekend_offering',
      'holy_communion_offering', 'total_collection', 'bank_transfer_amount', 'direct_petty_cash',
      'source', 'payment_method', 'donor_name', 'usher', 'recorded_by', 'notes',
    ];
    const row = {};
    cols.forEach((c, i) => { row[c] = binds[i]; });
    row.created_at = new Date(2026, 0, 1, 0, 0, seq++).toISOString();
    row.bank_transfer_details = '';
    row.custom_collections = '';
    row.deposit_confirmed = 0;
    row.teller_no = ''; row.deposited_by = ''; row.deposit_date = '';
    tables.income.push(row);
  }

  function execute(sql, binds) {
    if (sql.includes('PRAGMA table_info(income)')) {
      return INCOME_COLUMNS.map(name => ({ name }));
    }
    if (sql.includes('INSERT INTO income')) {
      insertIncome(binds);
      return null;
    }
    if (sql.includes('UPDATE income SET bank_transfer_details=?')) {
      const [details, id] = binds;
      const row = tables.income.find(r => r.id === id);
      if (row) row.bank_transfer_details = details;
      return null;
    }
    if (sql.includes('ALTER TABLE income ADD COLUMN custom_collections')) {
      if (hasCustomColumn) throw new Error('duplicate column name: custom_collections');
      hasCustomColumn = true;
      return null;
    }
    if (sql.includes('UPDATE income SET custom_collections=?')) {
      if (!hasCustomColumn) throw new Error('no such column: custom_collections');
      const [json, id] = binds;
      const row = tables.income.find(r => r.id === id);
      if (row) row.custom_collections = json;
      return null;
    }
    if (sql.includes("LIKE '%merged in by%'")) {
      return tables.income
        .filter(r => String(r.notes || '').includes('merged in by'))
        .map(r => ({ ...r }));
    }
    if (sql.includes('INSERT INTO audit_log')) {
      tables.audit_log.push({ id: binds[0], type: binds[1], detail: binds[2] });
      return null;
    }
    if (sql.includes("SELECT value FROM settings WHERE key='customIncomeTypes'")) {
      return seed.customIncomeTypes === undefined
        ? []
        : [{ value: JSON.stringify(seed.customIncomeTypes) }];
    }
    if (sql.includes('UPDATE income SET') && sql.includes('members_tithe=?')) {
      const [
        members_tithe, ministers_tithe, thanksgiving, sunday_school, slo, crm, workers_offering,
        first_fruit, children_offering, weekend_offering, holy_communion_offering, total_collection,
        bank_transfer_amount, direct_petty_cash, bank_transfer_details, notes, id,
      ] = binds;
      const row = tables.income.find(r => r.id === id);
      if (row) Object.assign(row, {
        members_tithe, ministers_tithe, thanksgiving, sunday_school, slo, crm, workers_offering,
        first_fruit, children_offering, weekend_offering, holy_communion_offering, total_collection,
        bank_transfer_amount, direct_petty_cash, bank_transfer_details, notes,
      });
      return null;
    }
    if (sql.includes('SELECT * FROM income WHERE date=?') && sql.includes('LIMIT 1')) {
      const [date] = binds;
      const rows = tables.income
        .filter(r => r.date === date && (r.source === 'sunday_collection' || !r.source))
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      // Real D1 rows are snapshots, not live references — copy so a later UPDATE to the
      // stored row can't retroactively mutate a value already read from this result.
      return rows.length ? [{ ...rows[0] }] : [];
    }
    if (sql.includes('SELECT * FROM income WHERE date=?') && sql.includes('ORDER BY created_at ASC, id ASC')) {
      const [date] = binds;
      return tables.income
        .filter(r => r.date === date && (r.source === 'sunday_collection' || !r.source))
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
        .map(r => ({ ...r }));
    }
    if (sql.includes('GROUP BY date HAVING COUNT(*) > 1')) {
      const counts = new Map();
      for (const r of tables.income) {
        if (r.source === 'sunday_collection' || !r.source) counts.set(r.date, (counts.get(r.date) || 0) + 1);
      }
      return [...counts.entries()].filter(([, c]) => c > 1).map(([date]) => ({ date }));
    }
    if (sql.includes('UPDATE cash_transactions SET income_ref=?')) {
      const [newRef, ...oldRefs] = binds;
      for (const t of tables.cash_transactions) {
        if (oldRefs.includes(t.income_ref)) t.income_ref = newRef;
      }
      return null;
    }
    if (sql.includes('UPDATE expenses SET income_ref=?')) {
      const [newRef, ...oldRefs] = binds;
      for (const e of tables.expenses) {
        if (oldRefs.includes(e.income_ref)) e.income_ref = newRef;
      }
      return null;
    }
    if (sql.includes('DELETE FROM income WHERE id IN')) {
      tables.income = tables.income.filter(r => !binds.includes(r.id));
      return null;
    }
    if (sql.includes('SELECT * FROM income ORDER BY date DESC')) {
      return tables.income.map(r => {
        const row = { ...r };
        if (!hasCustomColumn) delete row.custom_collections;
        return row;
      });
    }
    throw new Error(`Unhandled SQL in test mock: ${sql}`);
  }

  return {
    tables,
    prepare(sql) {
      const statement = {
        _binds: [],
        bind(...args) { statement._binds = args; return statement; },
        async run() { execute(sql, statement._binds); return { success: true }; },
        async all() { return { results: execute(sql, statement._binds) || [] }; },
        async first() { const r = execute(sql, statement._binds); return (r && r[0]) || null; },
      };
      return statement;
    },
  };
}

