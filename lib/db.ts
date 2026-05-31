import { Pool, type QueryResult, type QueryResultRow } from 'pg';

let _pool: Pool | null = null;
let _initPromise: Promise<void> | null = null;

function getPool(): Pool {
  if (_pool) return _pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  // ?sslmode=require (e.g. Neon, Supabase, Heroku) → enable TLS but skip CA
  // verification, which managed Postgres providers commonly require.
  const needsSsl =
    /[?&]sslmode=require\b/.test(connectionString) ||
    process.env.PGSSLMODE === 'require';
  _pool = new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  // A pooled client can be dropped by the server (idle timeout, restart, network
  // blip) while sitting idle in the pool. pg surfaces these as an 'error' event on
  // the pool; with no listener Node treats it as unhandled and crashes the process.
  _pool.on('error', err => {
    console.error('Unexpected pool error', err);
  });
  return _pool;
}

// Create every table if it doesn't already exist. Runs once per process,
// guarded by ensureInit(). Uses the pool directly (not q()) to avoid recursing
// through ensureInit().
export async function createTables(): Promise<void> {
  await getPool().query(SCHEMA_SQL);
}

// Lazily initialize the schema the first time any query runs, exactly once.
// _initPromise is assigned synchronously so concurrent callers share it.
function ensureInit(): Promise<void> {
  if (!_initPromise) {
    // Clear the cached promise on failure so the next query retries init
    // rather than reusing a permanently-rejected promise.
    _initPromise = createTables().catch(err => {
      _initPromise = null;
      throw err;
    });
  }
  return _initPromise;
}

// All exported helpers funnel through here so the schema is guaranteed to exist
// before the first real query, and so callers don't repeat the await/rows dance.
async function q<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<R>> {
  await ensureInit();
  return getPool().query<R>(text, params as unknown[]);
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('expense','income','transfer')),
    category TEXT NOT NULL,
    subcategory TEXT,
    merchant TEXT,
    notes TEXT,
    created_at TEXT DEFAULT now()::text
  );

  CREATE TABLE IF NOT EXISTS owed (
    id SERIAL PRIMARY KEY,
    direction TEXT NOT NULL CHECK (direction IN ('i_owe','they_owe')),
    person TEXT NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT,
    due_date TEXT,
    settled INTEGER NOT NULL DEFAULT 0,
    settled_at TEXT,
    created_at TEXT DEFAULT now()::text
  );

  CREATE TABLE IF NOT EXISTS recurring (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','biweekly','monthly','yearly')),
    next_due TEXT NOT NULL,
    category TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT now()::text
  );

  CREATE TABLE IF NOT EXISTS goals (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    target_amount INTEGER NOT NULL,
    current_amount INTEGER NOT NULL DEFAULT 0,
    deadline TEXT,
    category TEXT,
    created_at TEXT DEFAULT now()::text
  );

  CREATE TABLE IF NOT EXISTS coach_log (
    id SERIAL PRIMARY KEY,
    message TEXT NOT NULL,
    trigger TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT now()::text
  );

  CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    effective_from TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT now()::text
  );

  CREATE INDEX IF NOT EXISTS idx_settings_key_effective
    ON settings(key, effective_from DESC);
`;

export interface Transaction {
  id?: number;
  date: string;
  description: string;
  amount: number;
  type: 'expense' | 'income' | 'transfer';
  category: string;
  subcategory?: string | null;
  merchant?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface Owed {
  id?: number;
  direction: 'i_owe' | 'they_owe';
  person: string;
  amount: number;
  reason?: string | null;
  due_date?: string | null;
  settled?: number;
  settled_at?: string | null;
  created_at?: string;
}

export interface Recurring {
  id?: number;
  name: string;
  amount: number;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  next_due: string;
  category: string;
  active?: number;
  created_at?: string;
}

export interface Goal {
  id?: number;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline?: string | null;
  category?: string | null;
  created_at?: string;
}

export interface CoachLog {
  id?: number;
  message: string;
  trigger?: string | null;
  read?: number;
  created_at?: string;
}

export async function insertTransaction(
  t: Omit<Transaction, 'id' | 'created_at'>,
): Promise<Transaction> {
  const res = await q<{ id: number }>(
    `INSERT INTO transactions (date, description, amount, type, category, subcategory, merchant, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      t.date,
      t.description,
      t.amount,
      t.type,
      t.category,
      t.subcategory ?? null,
      t.merchant ?? null,
      t.notes ?? null,
    ],
  );
  return { ...t, id: res.rows[0].id };
}

export async function getTransactions(filters?: {
  month?: string;
  category?: string;
}): Promise<Transaction[]> {
  let query = 'SELECT * FROM transactions WHERE 1=1';
  const params: unknown[] = [];
  if (filters?.month) {
    params.push(filters.month);
    query += ` AND TO_CHAR(date::date, 'YYYY-MM') = $${params.length}`;
  }
  if (filters?.category) {
    params.push(filters.category);
    query += ` AND category = $${params.length}`;
  }
  query += ' ORDER BY date DESC, created_at DESC';
  const res = await q<Transaction>(query, params);
  return res.rows;
}

export async function updateTransaction(
  id: number,
  updates: Partial<Transaction>,
): Promise<void> {
  const allowed = ['date', 'description', 'amount', 'type', 'category', 'subcategory', 'merchant', 'notes'];
  const entries = Object.entries(updates).filter(([k]) => allowed.includes(k));
  if (entries.length === 0) return;
  const params: unknown[] = [];
  const fields = entries
    .map(([k, v]) => {
      params.push(v);
      return `${k} = $${params.length}`;
    })
    .join(', ');
  params.push(id);
  await q(`UPDATE transactions SET ${fields} WHERE id = $${params.length}`, params);
}

export async function deleteTransaction(id: number): Promise<void> {
  await q('DELETE FROM transactions WHERE id = $1', [id]);
}

export async function getMonthSummary(
  month: string,
): Promise<{ income: number; expenses: number; net: number }> {
  const res = await q<{ income: number | null; expenses: number | null }>(
    `SELECT
       SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END)::int as income,
       SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END)::int as expenses
     FROM transactions
     WHERE TO_CHAR(date::date, 'YYYY-MM') = $1`,
    [month],
  );
  const row = res.rows[0];
  const income = row?.income || 0;
  const expenses = row?.expenses || 0;
  return { income, expenses, net: income - expenses };
}

export async function getCategoryTotals(
  month: string,
): Promise<{ category: string; total: number }[]> {
  const res = await q<{ category: string; total: number }>(
    `SELECT category, SUM(amount)::int as total
     FROM transactions
     WHERE type = 'expense' AND TO_CHAR(date::date, 'YYYY-MM') = $1
     GROUP BY category
     ORDER BY total DESC`,
    [month],
  );
  return res.rows;
}

export async function insertOwed(o: Omit<Owed, 'id' | 'created_at'>): Promise<Owed> {
  const res = await q<{ id: number }>(
    `INSERT INTO owed (direction, person, amount, reason, due_date, settled)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [o.direction, o.person, o.amount, o.reason ?? null, o.due_date ?? null, o.settled ?? 0],
  );
  return { ...o, id: res.rows[0].id };
}

// settledFilter:
//   undefined → all rows
//   false     → unsettled only
//   true      → settled only
export async function getOwed(settledFilter?: boolean): Promise<Owed[]> {
  if (settledFilter === undefined) {
    const res = await q<Owed>('SELECT * FROM owed ORDER BY created_at DESC');
    return res.rows;
  }
  const res = await q<Owed>(
    'SELECT * FROM owed WHERE settled = $1 ORDER BY created_at DESC',
    [settledFilter ? 1 : 0],
  );
  return res.rows;
}

export async function settleOwed(id: number): Promise<void> {
  await q("UPDATE owed SET settled = 1, settled_at = now()::text WHERE id = $1", [id]);
}

export async function getOwedById(id: number): Promise<Owed | null> {
  const res = await q<Owed>('SELECT * FROM owed WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

export async function getSettledOwed(): Promise<Owed[]> {
  const res = await q<Owed>('SELECT * FROM owed WHERE settled = 1 ORDER BY settled_at DESC');
  return res.rows;
}

export async function insertRecurring(
  r: Omit<Recurring, 'id' | 'created_at'>,
): Promise<Recurring> {
  const res = await q<{ id: number }>(
    `INSERT INTO recurring (name, amount, frequency, next_due, category, active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [r.name, r.amount, r.frequency, r.next_due, r.category, r.active ?? 1],
  );
  return { ...r, id: res.rows[0].id };
}

export async function getRecurring(activeOnly = true): Promise<Recurring[]> {
  const query = activeOnly
    ? 'SELECT * FROM recurring WHERE active = 1 ORDER BY next_due ASC'
    : 'SELECT * FROM recurring ORDER BY next_due ASC';
  const res = await q<Recurring>(query);
  return res.rows;
}

export async function getUpcomingRecurring(days = 7): Promise<Recurring[]> {
  const res = await q<Recurring>(
    `SELECT * FROM recurring
     WHERE active = 1 AND next_due::date <= CURRENT_DATE + $1::int
     ORDER BY next_due ASC`,
    [days],
  );
  return res.rows;
}

export async function getRecurringThisMonth(): Promise<Recurring[]> {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  const res = await q<Recurring>(
    `SELECT * FROM recurring
     WHERE active = 1 AND next_due <= $1
     ORDER BY next_due ASC`,
    [endOfMonth],
  );
  return res.rows;
}

export async function findRecurringByName(name: string): Promise<Recurring[]> {
  const hint = (name || '').toLowerCase().trim();
  if (!hint) return [];
  const res = await q<Recurring>('SELECT * FROM recurring WHERE active = 1');
  return res.rows.filter(r => {
    const n = r.name.toLowerCase();
    return n.includes(hint) || hint.includes(n);
  });
}

export async function advanceRecurringDue(id: number): Promise<string | null> {
  const res = await q<{ next_due: string; frequency: string }>(
    'SELECT next_due, frequency FROM recurring WHERE id = $1',
    [id],
  );
  const row = res.rows[0];
  if (!row) return null;
  const d = new Date(`${row.next_due}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  switch (row.frequency) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'biweekly':
      d.setDate(d.getDate() + 14);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      return null;
  }
  const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await q('UPDATE recurring SET next_due = $1 WHERE id = $2', [next, id]);
  return next;
}

export async function reverseRecurringDue(id: number): Promise<void> {
  const res = await q<Recurring>('SELECT * FROM recurring WHERE id = $1', [id]);
  const entry = res.rows[0];
  if (!entry) return;
  const d = new Date(entry.next_due);
  if (entry.frequency === 'monthly') {
    d.setMonth(d.getMonth() - 1);
  } else if (entry.frequency === 'weekly') {
    d.setDate(d.getDate() - 7);
  } else if (entry.frequency === 'yearly') {
    d.setFullYear(d.getFullYear() - 1);
  } else if (entry.frequency === 'daily') {
    d.setDate(d.getDate() - 1);
  } else if (entry.frequency === 'biweekly') {
    d.setDate(d.getDate() - 14);
  } else {
    return;
  }
  const newDate = d.toISOString().slice(0, 10);
  await q('UPDATE recurring SET next_due = $1 WHERE id = $2', [newDate, id]);
}

export async function deactivateRecurring(id: number): Promise<void> {
  await q('UPDATE recurring SET active = 0 WHERE id = $1', [id]);
}

export async function getRecurringById(id: number): Promise<Recurring | null> {
  const res = await q<Recurring>('SELECT * FROM recurring WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

export async function getTransactionById(id: number): Promise<Transaction | null> {
  const res = await q<Transaction>('SELECT * FROM transactions WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

export async function insertGoal(g: Omit<Goal, 'id' | 'created_at'>): Promise<Goal> {
  const res = await q<{ id: number }>(
    `INSERT INTO goals (name, target_amount, current_amount, deadline, category)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [g.name, g.target_amount, g.current_amount ?? 0, g.deadline ?? null, g.category ?? null],
  );
  return { ...g, id: res.rows[0].id };
}

export async function getGoals(): Promise<Goal[]> {
  const res = await q<Goal>('SELECT * FROM goals ORDER BY created_at DESC');
  return res.rows;
}

export async function updateGoal(id: number, updates: Partial<Goal>): Promise<void> {
  const allowed = ['name', 'target_amount', 'current_amount', 'deadline', 'category'];
  const entries = Object.entries(updates).filter(([k]) => allowed.includes(k));
  if (entries.length === 0) return;
  const params: unknown[] = [];
  const fields = entries
    .map(([k, v]) => {
      params.push(v);
      return `${k} = $${params.length}`;
    })
    .join(', ');
  params.push(id);
  await q(`UPDATE goals SET ${fields} WHERE id = $${params.length}`, params);
}

export async function updateGoalProgress(id: number, newCurrent: number): Promise<void> {
  await q('UPDATE goals SET current_amount = $1 WHERE id = $2', [newCurrent, id]);
}

export async function deleteGoal(id: number): Promise<void> {
  await q('DELETE FROM goals WHERE id = $1', [id]);
}

export async function findGoalsByHint(titleHint: string): Promise<Goal[]> {
  const res = await q<Goal>('SELECT * FROM goals');
  const hint = (titleHint || '').toLowerCase().trim();
  if (!hint) return [];
  return res.rows.filter(g => {
    const name = g.name.toLowerCase();
    return name.includes(hint) || hint.includes(name);
  });
}

export async function findTransactionsByHint(descHint: string): Promise<Transaction[]> {
  const res = await q<Transaction>(
    'SELECT * FROM transactions ORDER BY created_at DESC LIMIT 200',
  );
  const hint = (descHint || '').toLowerCase().trim();
  if (!hint) return [];
  return res.rows.filter(t => {
    const desc = (t.description || '').toLowerCase();
    const merchant = (t.merchant || '').toLowerCase();
    return desc.includes(hint) || hint.includes(desc) || merchant.includes(hint);
  });
}

export async function insertCoachLog(
  c: Omit<CoachLog, 'id' | 'created_at'>,
): Promise<CoachLog> {
  const res = await q<{ id: number }>(
    `INSERT INTO coach_log (message, trigger, read)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [c.message, c.trigger ?? null, c.read ?? 0],
  );
  return { ...c, id: res.rows[0].id };
}

export async function getUnreadCoachLogs(limit?: number): Promise<CoachLog[]> {
  if (typeof limit === 'number' && limit > 0) {
    const res = await q<CoachLog>(
      'SELECT * FROM coach_log WHERE read = 0 ORDER BY created_at DESC LIMIT $1',
      [limit],
    );
    return res.rows;
  }
  const res = await q<CoachLog>('SELECT * FROM coach_log WHERE read = 0 ORDER BY created_at DESC');
  return res.rows;
}

export async function markCoachLogRead(id: number): Promise<void> {
  await q('UPDATE coach_log SET read = 1 WHERE id = $1', [id]);
}

export async function getRecentCoachMessages(limit = 3): Promise<string[]> {
  const res = await q<{ message: string }>(
    'SELECT message FROM coach_log ORDER BY created_at DESC LIMIT $1',
    [limit],
  );
  return res.rows.map(r => r.message);
}

export interface Setting {
  id: number;
  key: string;
  value: string;
  effective_from: string;
  created_at: string;
}

// Most recent value effective on or before asOfDate. If no date is given,
// returns the absolute most recent value for the key.
export async function getSetting(key: string, asOfDate?: string): Promise<string | null> {
  try {
    if (asOfDate) {
      const res = await q<{ value: string }>(
        `SELECT value FROM settings
         WHERE key = $1 AND effective_from <= $2
         ORDER BY effective_from DESC, id DESC
         LIMIT 1`,
        [key, asOfDate],
      );
      return res.rows[0]?.value ?? null;
    }
    const res = await q<{ value: string }>(
      `SELECT value FROM settings
       WHERE key = $1
       ORDER BY effective_from DESC, id DESC
       LIMIT 1`,
      [key],
    );
    return res.rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

// Insert a new value with effective_from (default = today).
export async function setSetting(
  key: string,
  value: string,
  effectiveFrom?: string,
): Promise<void> {
  const from = effectiveFrom || new Date().toISOString().slice(0, 10);
  await q('INSERT INTO settings (key, value, effective_from) VALUES ($1, $2, $3)', [
    key,
    value,
    from,
  ]);
}

// Returns the latest value for every distinct key (back-compat shape).
export async function getAllSettings(): Promise<Record<string, string>> {
  const res = await q<{ key: string; value: string }>(`
    SELECT s.key, s.value
    FROM settings s
    WHERE s.id = (
      SELECT id FROM settings
      WHERE key = s.key
      ORDER BY effective_from DESC, id DESC
      LIMIT 1
    )
  `);
  const defaults: Record<string, string> = {
    name: '',
    currency: 'USD',
    opening_balance: '0',
    opening_savings: '0',
    opening_checking: '0',
    opening_cash: '0',
  };
  const result: Record<string, string> = { ...defaults };
  for (const r of res.rows) result[r.key] = r.value;
  return result;
}

// Monthly budget (in cents) effective on a given date. Returns 0 if unset.
export async function getMonthlyBudget(asOfDate?: string): Promise<number> {
  const val = await getSetting('monthly_budget', asOfDate);
  return val ? parseInt(val, 10) || 0 : 0;
}

// Spendable = NetWorth - SUM(goals.current_amount) - bills due this month.
// NetWorth = opening_balance + income - expenses - unsettled i_owe.
export async function getSpendable(asOfDate?: string): Promise<number> {
  const date = asOfDate || new Date().toISOString().slice(0, 10);

  const income = (
    await q<{ t: number }>(
      `SELECT COALESCE(SUM(amount),0)::int as t FROM transactions WHERE type='income'`,
    )
  ).rows[0].t;
  const expenses = (
    await q<{ t: number }>(
      `SELECT COALESCE(SUM(amount),0)::int as t FROM transactions WHERE type='expense'`,
    )
  ).rows[0].t;
  const iOweUnsettled = (
    await q<{ t: number }>(
      `SELECT COALESCE(SUM(amount),0)::int as t FROM owed WHERE direction='i_owe' AND settled=0`,
    )
  ).rows[0].t;

  // Prefer modern single opening_balance; fall back to legacy three-bucket layout.
  let openingBalance = 0;
  const openingVal = await getSetting('opening_balance', date);
  if (openingVal !== null) {
    openingBalance = parseInt(openingVal, 10) || 0;
  } else {
    const all = await getAllSettings();
    openingBalance =
      (parseInt(all.opening_savings || '0', 10) || 0) +
      (parseInt(all.opening_checking || '0', 10) || 0) +
      (parseInt(all.opening_cash || '0', 10) || 0);
  }

  const netWorth = openingBalance + income - expenses - iOweUnsettled;

  const goalsSaved = (
    await q<{ t: number }>(`SELECT COALESCE(SUM(current_amount),0)::int as t FROM goals`)
  ).rows[0].t;

  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  const billsDueMonth = (
    await q<{ t: number }>(
      `SELECT COALESCE(SUM(amount),0)::int as t FROM recurring WHERE active=1 AND next_due <= $1`,
      [endOfMonth],
    )
  ).rows[0].t;

  return Math.max(0, netWorth - goalsSaved - billsDueMonth);
}

// Net worth: opening + income - expenses - unsettled i_owe.
export async function getNetWorth(asOfDate?: string): Promise<number> {
  const date = asOfDate || new Date().toISOString().slice(0, 10);
  const income = (
    await q<{ t: number }>(
      `SELECT COALESCE(SUM(amount),0)::int as t FROM transactions WHERE type='income'`,
    )
  ).rows[0].t;
  const expenses = (
    await q<{ t: number }>(
      `SELECT COALESCE(SUM(amount),0)::int as t FROM transactions WHERE type='expense'`,
    )
  ).rows[0].t;
  const iOweUnsettled = (
    await q<{ t: number }>(
      `SELECT COALESCE(SUM(amount),0)::int as t FROM owed WHERE direction='i_owe' AND settled=0`,
    )
  ).rows[0].t;

  let openingBalance = 0;
  const openingVal = await getSetting('opening_balance', date);
  if (openingVal !== null) {
    openingBalance = parseInt(openingVal, 10) || 0;
  } else {
    const all = await getAllSettings();
    openingBalance =
      (parseInt(all.opening_savings || '0', 10) || 0) +
      (parseInt(all.opening_checking || '0', 10) || 0) +
      (parseInt(all.opening_cash || '0', 10) || 0);
  }
  return openingBalance + income - expenses - iOweUnsettled;
}

export async function getPeriodTotals(
  startDate: string,
  endDate: string,
): Promise<{ spent: number; income: number }> {
  const spent = (
    await q<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0)::int as total FROM transactions
       WHERE type = 'expense' AND date >= $1 AND date <= $2`,
      [startDate, endDate],
    )
  ).rows[0].total;
  const income = (
    await q<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0)::int as total FROM transactions
       WHERE type = 'income' AND date >= $1 AND date <= $2`,
      [startDate, endDate],
    )
  ).rows[0].total;
  return { spent, income };
}

export async function getSpendingByCategory(
  startDate: string,
  endDate: string,
): Promise<{ category: string; total: number }[]> {
  const excluded = ['Income', 'Investment', 'Investments', 'Savings', 'Lending', 'Housing'];
  const placeholders = excluded.map((_, i) => `$${i + 3}`).join(',');
  const res = await q<{ category: string; total: number }>(
    `SELECT category, SUM(amount)::int as total
     FROM transactions
     WHERE type = 'expense'
       AND date >= $1 AND date <= $2
       AND category NOT IN (${placeholders})
     GROUP BY category
     ORDER BY total DESC`,
    [startDate, endDate, ...excluded],
  );
  return res.rows;
}

export async function getTrendData(
  period: 'month' | 'quarter' | 'ytd',
  startDate: string,
  endDate: string,
): Promise<{ label: string; income: number; expenses: number }[]> {
  if (period === 'month') {
    const res = await q<{ label: string; income: number; expenses: number }>(
      `SELECT TO_CHAR(date::date, 'DD') as label,
        SUM(CASE WHEN type='income' THEN amount ELSE 0 END)::int as income,
        SUM(CASE WHEN type='expense' THEN amount ELSE 0 END)::int as expenses
      FROM transactions
      WHERE date >= $1 AND date <= $2
      GROUP BY TO_CHAR(date::date, 'DD')
      ORDER BY label ASC`,
      [startDate, endDate],
    );
    return res.rows;
  }
  const res = await q<{ ym: string; income: number; expenses: number }>(
    `SELECT TO_CHAR(date::date, 'YYYY-MM') as ym,
      SUM(CASE WHEN type='income' THEN amount ELSE 0 END)::int as income,
      SUM(CASE WHEN type='expense' THEN amount ELSE 0 END)::int as expenses
    FROM transactions
    WHERE date >= $1 AND date <= $2
    GROUP BY TO_CHAR(date::date, 'YYYY-MM')
    ORDER BY ym ASC`,
    [startDate, endDate],
  );
  return res.rows.map(r => ({
    label: new Date(r.ym + '-01').toLocaleString('default', { month: 'short' }),
    income: r.income,
    expenses: r.expenses,
  }));
}

export async function getRangeSummary(
  start: string,
  end: string,
): Promise<{ income: number; expenses: number; net: number }> {
  const res = await q<{ income: number | null; expenses: number | null }>(
    `SELECT
       SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END)::int as income,
       SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END)::int as expenses
     FROM transactions
     WHERE date >= $1 AND date <= $2`,
    [start, end],
  );
  const row = res.rows[0];
  const income = row?.income || 0;
  const expenses = row?.expenses || 0;
  return { income, expenses, net: income - expenses };
}

export async function getCategoryTotalsRange(
  start: string,
  end: string,
): Promise<{ category: string; total: number }[]> {
  const res = await q<{ category: string; total: number }>(
    `SELECT category, SUM(amount)::int as total
     FROM transactions
     WHERE type = 'expense' AND date >= $1 AND date <= $2
     GROUP BY category
     ORDER BY total DESC`,
    [start, end],
  );
  return res.rows;
}

export async function getTransactionsRange(filters: {
  start: string;
  end: string;
  category?: string;
}): Promise<Transaction[]> {
  let query = 'SELECT * FROM transactions WHERE date >= $1 AND date <= $2';
  const params: unknown[] = [filters.start, filters.end];
  if (filters.category) {
    params.push(filters.category);
    query += ` AND category = $${params.length}`;
  }
  query += ' ORDER BY date DESC, created_at DESC';
  const res = await q<Transaction>(query, params);
  return res.rows;
}

export default getPool;
