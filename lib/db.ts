import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';

let _db: DatabaseType | null = null;

function getDb(): DatabaseType {
  if (_db) return _db;
  const DB_PATH = path.resolve(process.cwd(), process.env.DATABASE_PATH || 'finance.db');
  const instance = new Database(DB_PATH, { timeout: 5000 });
  instance.pragma('journal_mode = WAL');
  instance.exec(SCHEMA_SQL);
  // Belt-and-suspenders: guarantee the settings table exists in its current shape
  // before any migration logic inspects it.
  instance.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      effective_from TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Idempotent migration: add settled_at to owed if it doesn't exist.
  try {
    instance.exec('ALTER TABLE owed ADD COLUMN settled_at TEXT');
  } catch {
    // column already exists
  }
  // Idempotent migration: settings table from (key PRIMARY KEY, value) to history shape
  try {
    const cols = instance.prepare("PRAGMA table_info(settings)").all() as { name: string }[];
    const hasEffectiveFrom = cols.some(c => c.name === 'effective_from');
    if (cols.length > 0 && !hasEffectiveFrom) {
      instance.exec(`
        ALTER TABLE settings RENAME TO _settings_legacy;
        CREATE TABLE settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          effective_from TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO settings (key, value, effective_from)
          SELECT key, value, '1970-01-01' FROM _settings_legacy;
        DROP TABLE _settings_legacy;
      `);
    }
  } catch {
    // first run — schema didn't exist before
  }
  _db = instance;
  return instance;
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('expense','income','transfer')),
    category TEXT NOT NULL,
    subcategory TEXT,
    merchant TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS owed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    direction TEXT NOT NULL CHECK(direction IN ('i_owe','they_owe')),
    person TEXT NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT,
    due_date TEXT,
    settled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS recurring (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    frequency TEXT NOT NULL CHECK(frequency IN ('daily','weekly','biweekly','monthly','yearly')),
    next_due TEXT NOT NULL,
    category TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    target_amount INTEGER NOT NULL,
    current_amount INTEGER NOT NULL DEFAULT 0,
    deadline TEXT,
    category TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS coach_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    trigger TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    effective_from TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

export function insertTransaction(t: Omit<Transaction, 'id' | 'created_at'>): Transaction {
  const stmt = getDb().prepare(`
    INSERT INTO transactions (date, description, amount, type, category, subcategory, merchant, notes)
    VALUES (@date, @description, @amount, @type, @category, @subcategory, @merchant, @notes)
  `);
  const payload = {
    date: t.date,
    description: t.description,
    amount: t.amount,
    type: t.type,
    category: t.category,
    subcategory: t.subcategory ?? null,
    merchant: t.merchant ?? null,
    notes: t.notes ?? null,
  };
  const result = stmt.run(payload);
  return { ...t, id: result.lastInsertRowid as number };
}

export function getTransactions(filters?: { month?: string; category?: string }): Transaction[] {
  let query = 'SELECT * FROM transactions WHERE 1=1';
  const params: Record<string, string> = {};
  if (filters?.month) {
    query += " AND strftime('%Y-%m', date) = @month";
    params.month = filters.month;
  }
  if (filters?.category) {
    query += ' AND category = @category';
    params.category = filters.category;
  }
  query += ' ORDER BY date DESC, created_at DESC';
  return getDb().prepare(query).all(params) as Transaction[];
}

export function updateTransaction(id: number, updates: Partial<Transaction>): void {
  const allowed = ['date', 'description', 'amount', 'type', 'category', 'subcategory', 'merchant', 'notes'];
  const entries = Object.entries(updates).filter(([k]) => allowed.includes(k));
  if (entries.length === 0) return;
  const fields = entries.map(([k]) => `${k} = @${k}`).join(', ');
  const payload: Record<string, unknown> = { id };
  for (const [k, v] of entries) payload[k] = v;
  getDb().prepare(`UPDATE transactions SET ${fields} WHERE id = @id`).run(payload);
}

export function deleteTransaction(id: number): void {
  getDb().prepare('DELETE FROM transactions WHERE id = ?').run(id);
}

export function getMonthSummary(month: string): { income: number; expenses: number; net: number } {
  const row = getDb().prepare(`
    SELECT
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
      SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses
    FROM transactions
    WHERE strftime('%Y-%m', date) = ?
  `).get(month) as { income: number | null; expenses: number | null };
  const income = row?.income || 0;
  const expenses = row?.expenses || 0;
  return { income, expenses, net: income - expenses };
}

export function getCategoryTotals(month: string): { category: string; total: number }[] {
  return getDb().prepare(`
    SELECT category, SUM(amount) as total
    FROM transactions
    WHERE type = 'expense' AND strftime('%Y-%m', date) = ?
    GROUP BY category
    ORDER BY total DESC
  `).all(month) as { category: string; total: number }[];
}

export function insertOwed(o: Omit<Owed, 'id' | 'created_at'>): Owed {
  const stmt = getDb().prepare(`
    INSERT INTO owed (direction, person, amount, reason, due_date, settled)
    VALUES (@direction, @person, @amount, @reason, @due_date, @settled)
  `);
  const payload = {
    direction: o.direction,
    person: o.person,
    amount: o.amount,
    reason: o.reason ?? null,
    due_date: o.due_date ?? null,
    settled: o.settled ?? 0,
  };
  const result = stmt.run(payload);
  return { ...o, id: result.lastInsertRowid as number };
}

// settledFilter:
//   undefined → all rows
//   false     → unsettled only
//   true      → settled only
export function getOwed(settledFilter?: boolean): Owed[] {
  const db = getDb();
  if (settledFilter === undefined) {
    return db.prepare('SELECT * FROM owed ORDER BY created_at DESC').all() as Owed[];
  }
  return db
    .prepare('SELECT * FROM owed WHERE settled = ? ORDER BY created_at DESC')
    .all(settledFilter ? 1 : 0) as Owed[];
}

export function settleOwed(id: number): void {
  getDb()
    .prepare("UPDATE owed SET settled = 1, settled_at = datetime('now') WHERE id = ?")
    .run(id);
}

export function getOwedById(id: number): Owed | null {
  const row = getDb().prepare('SELECT * FROM owed WHERE id = ?').get(id) as Owed | undefined;
  return row ?? null;
}

export function getSettledOwed(): Owed[] {
  return getDb()
    .prepare('SELECT * FROM owed WHERE settled = 1 ORDER BY settled_at DESC')
    .all() as Owed[];
}

export function insertRecurring(r: Omit<Recurring, 'id' | 'created_at'>): Recurring {
  const stmt = getDb().prepare(`
    INSERT INTO recurring (name, amount, frequency, next_due, category, active)
    VALUES (@name, @amount, @frequency, @next_due, @category, @active)
  `);
  const payload = {
    name: r.name,
    amount: r.amount,
    frequency: r.frequency,
    next_due: r.next_due,
    category: r.category,
    active: r.active ?? 1,
  };
  const result = stmt.run(payload);
  return { ...r, id: result.lastInsertRowid as number };
}

export function getRecurring(activeOnly = true): Recurring[] {
  const query = activeOnly
    ? 'SELECT * FROM recurring WHERE active = 1 ORDER BY next_due ASC'
    : 'SELECT * FROM recurring ORDER BY next_due ASC';
  return getDb().prepare(query).all() as Recurring[];
}

export function getUpcomingRecurring(days = 7): Recurring[] {
  return getDb().prepare(`
    SELECT * FROM recurring
    WHERE active = 1 AND next_due <= date('now', '+' || ? || ' days')
    ORDER BY next_due ASC
  `).all(days) as Recurring[];
}

export function getRecurringThisMonth(): Recurring[] {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  return getDb().prepare(`
    SELECT * FROM recurring
    WHERE active = 1 AND next_due <= ?
    ORDER BY next_due ASC
  `).all(endOfMonth) as Recurring[];
}

export function insertGoal(g: Omit<Goal, 'id' | 'created_at'>): Goal {
  const stmt = getDb().prepare(`
    INSERT INTO goals (name, target_amount, current_amount, deadline, category)
    VALUES (@name, @target_amount, @current_amount, @deadline, @category)
  `);
  const payload = {
    name: g.name,
    target_amount: g.target_amount,
    current_amount: g.current_amount ?? 0,
    deadline: g.deadline ?? null,
    category: g.category ?? null,
  };
  const result = stmt.run(payload);
  return { ...g, id: result.lastInsertRowid as number };
}

export function getGoals(): Goal[] {
  return getDb().prepare('SELECT * FROM goals ORDER BY created_at DESC').all() as Goal[];
}

export function updateGoal(id: number, updates: Partial<Goal>): void {
  const allowed = ['name', 'target_amount', 'current_amount', 'deadline', 'category'];
  const entries = Object.entries(updates).filter(([k]) => allowed.includes(k));
  if (entries.length === 0) return;
  const fields = entries.map(([k]) => `${k} = @${k}`).join(', ');
  const payload: Record<string, unknown> = { id };
  for (const [k, v] of entries) payload[k] = v;
  getDb().prepare(`UPDATE goals SET ${fields} WHERE id = @id`).run(payload);
}

export function updateGoalProgress(id: number, newCurrent: number): void {
  getDb().prepare('UPDATE goals SET current_amount = ? WHERE id = ?').run(newCurrent, id);
}

export function deleteGoal(id: number): void {
  getDb().prepare('DELETE FROM goals WHERE id = ?').run(id);
}

export function findGoalsByHint(titleHint: string): Goal[] {
  const goals = getDb().prepare('SELECT * FROM goals').all() as Goal[];
  const hint = (titleHint || '').toLowerCase().trim();
  if (!hint) return [];
  return goals.filter(g => {
    const name = g.name.toLowerCase();
    return name.includes(hint) || hint.includes(name);
  });
}

export function findTransactionsByHint(descHint: string): Transaction[] {
  const all = getDb()
    .prepare('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 200')
    .all() as Transaction[];
  const hint = (descHint || '').toLowerCase().trim();
  if (!hint) return [];
  return all.filter(t => {
    const desc = (t.description || '').toLowerCase();
    const merchant = (t.merchant || '').toLowerCase();
    return desc.includes(hint) || hint.includes(desc) || merchant.includes(hint);
  });
}

export function insertCoachLog(c: Omit<CoachLog, 'id' | 'created_at'>): CoachLog {
  const stmt = getDb().prepare(`
    INSERT INTO coach_log (message, trigger, read)
    VALUES (@message, @trigger, @read)
  `);
  const payload = {
    message: c.message,
    trigger: c.trigger ?? null,
    read: c.read ?? 0,
  };
  const result = stmt.run(payload);
  return { ...c, id: result.lastInsertRowid as number };
}

export function getUnreadCoachLogs(limit?: number): CoachLog[] {
  if (typeof limit === 'number' && limit > 0) {
    return getDb()
      .prepare('SELECT * FROM coach_log WHERE read = 0 ORDER BY created_at DESC LIMIT ?')
      .all(limit) as CoachLog[];
  }
  return getDb()
    .prepare('SELECT * FROM coach_log WHERE read = 0 ORDER BY created_at DESC')
    .all() as CoachLog[];
}

export function markCoachLogRead(id: number): void {
  getDb().prepare('UPDATE coach_log SET read = 1 WHERE id = ?').run(id);
}

export function getRecentCoachMessages(limit = 3): string[] {
  const rows = getDb().prepare('SELECT message FROM coach_log ORDER BY created_at DESC LIMIT ?').all(limit) as { message: string }[];
  return rows.map(r => r.message);
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
export function getSetting(key: string, asOfDate?: string): string | null {
  try {
    const db = getDb();
    if (asOfDate) {
      const row = db.prepare(`
        SELECT value FROM settings
        WHERE key = ? AND effective_from <= ?
        ORDER BY effective_from DESC, id DESC
        LIMIT 1
      `).get(key, asOfDate) as { value: string } | undefined;
      return row?.value ?? null;
    }
    const row = db.prepare(`
      SELECT value FROM settings
      WHERE key = ?
      ORDER BY effective_from DESC, id DESC
      LIMIT 1
    `).get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

// Insert a new value with effective_from (default = today).
export function setSetting(key: string, value: string, effectiveFrom?: string): void {
  const from = effectiveFrom || new Date().toISOString().slice(0, 10);
  getDb()
    .prepare('INSERT INTO settings (key, value, effective_from) VALUES (?, ?, ?)')
    .run(key, value, from);
}

// Returns the latest value for every distinct key (back-compat shape).
export function getAllSettings(): Record<string, string> {
  const rows = getDb().prepare(`
    SELECT s.key, s.value
    FROM settings s
    WHERE s.id = (
      SELECT id FROM settings
      WHERE key = s.key
      ORDER BY effective_from DESC, id DESC
      LIMIT 1
    )
  `).all() as { key: string; value: string }[];
  const defaults: Record<string, string> = {
    name: '',
    currency: 'USD',
    opening_balance: '0',
    opening_savings: '0',
    opening_checking: '0',
    opening_cash: '0',
  };
  const result: Record<string, string> = { ...defaults };
  for (const r of rows) result[r.key] = r.value;
  return result;
}

// Monthly budget (in cents) effective on a given date. Returns 0 if unset.
export function getMonthlyBudget(asOfDate?: string): number {
  const val = getSetting('monthly_budget', asOfDate);
  return val ? parseInt(val, 10) || 0 : 0;
}

// Spendable = NetWorth - SUM(goals.current_amount) - bills due this month.
// NetWorth = opening_balance + income - expenses - unsettled i_owe.
export function getSpendable(asOfDate?: string): number {
  const db = getDb();
  const date = asOfDate || new Date().toISOString().slice(0, 10);

  const income = (db
    .prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE type='income'`)
    .get() as { t: number }).t;
  const expenses = (db
    .prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE type='expense'`)
    .get() as { t: number }).t;
  const iOweUnsettled = (db
    .prepare(`SELECT COALESCE(SUM(amount),0) as t FROM owed WHERE direction='i_owe' AND settled=0`)
    .get() as { t: number }).t;

  // Prefer modern single opening_balance; fall back to legacy three-bucket layout.
  let openingBalance = 0;
  const openingVal = getSetting('opening_balance', date);
  if (openingVal !== null) {
    openingBalance = parseInt(openingVal, 10) || 0;
  } else {
    const all = getAllSettings();
    openingBalance =
      (parseInt(all.opening_savings || '0', 10) || 0) +
      (parseInt(all.opening_checking || '0', 10) || 0) +
      (parseInt(all.opening_cash || '0', 10) || 0);
  }

  const netWorth = openingBalance + income - expenses - iOweUnsettled;

  const goalsSaved = (db
    .prepare(`SELECT COALESCE(SUM(current_amount),0) as t FROM goals`)
    .get() as { t: number }).t;

  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  const billsDueMonth = (db
    .prepare(`SELECT COALESCE(SUM(amount),0) as t FROM recurring WHERE active=1 AND next_due <= ?`)
    .get(endOfMonth) as { t: number }).t;

  return Math.max(0, netWorth - goalsSaved - billsDueMonth);
}

// Net worth: opening + income - expenses - unsettled i_owe.
export function getNetWorth(asOfDate?: string): number {
  const db = getDb();
  const date = asOfDate || new Date().toISOString().slice(0, 10);
  const income = (db
    .prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE type='income'`)
    .get() as { t: number }).t;
  const expenses = (db
    .prepare(`SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE type='expense'`)
    .get() as { t: number }).t;
  const iOweUnsettled = (db
    .prepare(`SELECT COALESCE(SUM(amount),0) as t FROM owed WHERE direction='i_owe' AND settled=0`)
    .get() as { t: number }).t;

  let openingBalance = 0;
  const openingVal = getSetting('opening_balance', date);
  if (openingVal !== null) {
    openingBalance = parseInt(openingVal, 10) || 0;
  } else {
    const all = getAllSettings();
    openingBalance =
      (parseInt(all.opening_savings || '0', 10) || 0) +
      (parseInt(all.opening_checking || '0', 10) || 0) +
      (parseInt(all.opening_cash || '0', 10) || 0);
  }
  return openingBalance + income - expenses - iOweUnsettled;
}

export function getPeriodTotals(startDate: string, endDate: string): { spent: number; income: number } {
  const db = getDb();
  const spent = (db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM transactions
    WHERE type = 'expense' AND date >= ? AND date <= ?
  `).get(startDate, endDate) as { total: number }).total;
  const income = (db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM transactions
    WHERE type = 'income' AND date >= ? AND date <= ?
  `).get(startDate, endDate) as { total: number }).total;
  return { spent, income };
}

export function getSpendingByCategory(
  startDate: string,
  endDate: string,
): { category: string; total: number }[] {
  const db = getDb();
  const excluded = ['Income', 'Investment', 'Investments', 'Savings', 'Lending', 'Housing'];
  const placeholders = excluded.map(() => '?').join(',');
  return db.prepare(`
    SELECT category, SUM(amount) as total
    FROM transactions
    WHERE type = 'expense'
      AND date >= ? AND date <= ?
      AND category NOT IN (${placeholders})
    GROUP BY category
    ORDER BY total DESC
  `).all(startDate, endDate, ...excluded) as { category: string; total: number }[];
}

export function getTrendData(
  period: 'month' | 'quarter' | 'ytd',
  startDate: string,
  endDate: string,
): { label: string; income: number; expenses: number }[] {
  const db = getDb();
  if (period === 'month') {
    return db.prepare(`
      SELECT strftime('%d', date) as label,
        SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expenses
      FROM transactions
      WHERE date >= ? AND date <= ?
      GROUP BY strftime('%d', date)
      ORDER BY date ASC
    `).all(startDate, endDate) as { label: string; income: number; expenses: number }[];
  }
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', date) as ym,
      SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income,
      SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expenses
    FROM transactions
    WHERE date >= ? AND date <= ?
    GROUP BY strftime('%Y-%m', date)
    ORDER BY ym ASC
  `).all(startDate, endDate) as { ym: string; income: number; expenses: number }[];
  return rows.map(r => ({
    label: new Date(r.ym + '-01').toLocaleString('default', { month: 'short' }),
    income: r.income,
    expenses: r.expenses,
  }));
}

export function getRangeSummary(start: string, end: string): { income: number; expenses: number; net: number } {
  const row = getDb()
    .prepare(`
      SELECT
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses
      FROM transactions
      WHERE date >= ? AND date <= ?
    `)
    .get(start, end) as { income: number | null; expenses: number | null };
  const income = row?.income || 0;
  const expenses = row?.expenses || 0;
  return { income, expenses, net: income - expenses };
}

export function getCategoryTotalsRange(start: string, end: string): { category: string; total: number }[] {
  return getDb()
    .prepare(`
      SELECT category, SUM(amount) as total
      FROM transactions
      WHERE type = 'expense' AND date >= ? AND date <= ?
      GROUP BY category
      ORDER BY total DESC
    `)
    .all(start, end) as { category: string; total: number }[];
}

export function getTransactionsRange(filters: { start: string; end: string; category?: string }): Transaction[] {
  let query = 'SELECT * FROM transactions WHERE date >= @start AND date <= @end';
  const params: Record<string, string> = { start: filters.start, end: filters.end };
  if (filters.category) {
    query += ' AND category = @category';
    params.category = filters.category;
  }
  query += ' ORDER BY date DESC, created_at DESC';
  return getDb().prepare(query).all(params) as Transaction[];
}

export default getDb;
