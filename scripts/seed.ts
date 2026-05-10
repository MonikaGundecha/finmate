/**
 * Seed FinMate's SQLite database with 5 months of realistic data.
 *
 *   npx tsx scripts/seed.ts
 *   # or: npx ts-node --transpile-only scripts/seed.ts
 *
 * Idempotent: if transactions > 10 rows already exist, the script exits without writing.
 * Adapted to the actual schema in lib/db.ts:
 *   - goals.name (not "title"), no "type" column
 *   - owed has direction/person/amount/reason/due_date/settled (no "date")
 *   - coach_log has message/trigger/read (no "type")
 *   - settings is history-aware: (id, key, value, effective_from, created_at)
 */
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DATABASE_PATH || 'finance.db';
const db = new Database(path.resolve(process.cwd(), DB_PATH), { timeout: 5000 });
db.pragma('journal_mode = WAL');

// ── 1) Ensure schema (mirrors lib/db.ts SCHEMA_SQL) ─────────────────────────
db.exec(`
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
`);

// Idempotent settled_at column on owed
try {
  db.exec('ALTER TABLE owed ADD COLUMN settled_at TEXT');
} catch {
  /* column exists */
}

// Idempotent migration: legacy settings (key PRIMARY KEY) → history shape.
try {
  const cols = db.prepare('PRAGMA table_info(settings)').all() as { name: string }[];
  const hasEffective = cols.some(c => c.name === 'effective_from');
  if (cols.length > 0 && !hasEffective) {
    db.exec(`
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
  /* fresh db, nothing to migrate */
}

// ── 2) Idempotency check ───────────────────────────────────────────────────
const existing = db.prepare('SELECT COUNT(*) as c FROM transactions').get() as { c: number };
if (existing.c > 10) {
  console.log(`Database already has ${existing.c} transactions — skipping seed to avoid duplicates.`);
  db.close();
  process.exit(0);
}

console.log('Seeding database with historical data...');

// ── 3) Reset auxiliary tables (transactions are appended) ──────────────────
db.prepare('DELETE FROM owed').run();
db.prepare('DELETE FROM goals').run();
db.prepare('DELETE FROM recurring').run();
db.prepare('DELETE FROM coach_log').run();
db.prepare('DELETE FROM settings').run();

// ── 4) SETTINGS (history-aware) ────────────────────────────────────────────
const insertSetting = db.prepare(
  'INSERT INTO settings (key, value, effective_from) VALUES (?, ?, ?)',
);
insertSetting.run('monthly_budget', '200000', '2026-01-01'); // $2,000
insertSetting.run('opening_balance', '500000', '2026-01-01'); // $5,000

// ── 5) TRANSACTIONS ────────────────────────────────────────────────────────
type SeedTx = {
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string;
  merchant: string | null;
  date: string;
};

const incomeEntries: SeedTx[] = [
  { type: 'income', amount: 420000, category: 'Income', description: 'Monthly salary',     merchant: 'Employer', date: '2026-01-01' },
  { type: 'income', amount: 420000, category: 'Income', description: 'Monthly salary',     merchant: 'Employer', date: '2026-02-01' },
  { type: 'income', amount: 80000,  category: 'Income', description: 'Tax return',         merchant: 'IRS',      date: '2026-02-14' },
  { type: 'income', amount: 420000, category: 'Income', description: 'Monthly salary',     merchant: 'Employer', date: '2026-03-01' },
  { type: 'income', amount: 60000,  category: 'Income', description: 'Overtime pay',       merchant: 'Employer', date: '2026-03-28' },
  { type: 'income', amount: 420000, category: 'Income', description: 'Monthly salary',     merchant: 'Employer', date: '2026-04-01' },
  { type: 'income', amount: 420000, category: 'Income', description: 'Monthly salary',     merchant: 'Employer', date: '2026-05-01' },
  { type: 'income', amount: 40000,  category: 'Income', description: 'Freelance project',  merchant: 'Client',   date: '2026-05-07' },
];

const expenseEntries: SeedTx[] = [
  // January — quiet
  { type: 'expense', amount: 120000, category: 'Housing',      description: 'Rent',            merchant: 'Landlord',     date: '2026-01-01' },
  { type: 'expense', amount: 8500,   category: 'Groceries',    description: 'Weekly shop',     merchant: 'Trader Joes',  date: '2026-01-05' },
  { type: 'expense', amount: 7200,   category: 'Groceries',    description: 'Weekly shop',     merchant: 'Whole Foods',  date: '2026-01-12' },
  { type: 'expense', amount: 4500,   category: 'Dining',       description: 'Dinner',          merchant: 'Zuni Cafe',    date: '2026-01-15' },
  { type: 'expense', amount: 1600,   category: 'Subscriptions',description: 'Netflix',         merchant: 'Netflix',      date: '2026-01-18' },
  { type: 'expense', amount: 1000,   category: 'Subscriptions',description: 'Spotify',         merchant: 'Spotify',      date: '2026-01-18' },
  { type: 'expense', amount: 4500,   category: 'Health',       description: 'Gym membership',  merchant: 'Equinox',      date: '2026-01-20' },
  { type: 'expense', amount: 3200,   category: 'Transport',    description: 'Uber rides',      merchant: 'Uber',         date: '2026-01-22' },
  { type: 'expense', amount: 8000,   category: 'Utilities',    description: 'Electricity bill',merchant: 'PG&E',         date: '2026-01-25' },
  { type: 'expense', amount: 2800,   category: 'Health',       description: 'Pharmacy',        merchant: 'CVS',          date: '2026-01-28' },

  // February — spike
  { type: 'expense', amount: 120000, category: 'Housing',      description: 'Rent',                merchant: 'Landlord',     date: '2026-02-01' },
  { type: 'expense', amount: 18500,  category: 'Health',       description: 'Urgent care visit',   merchant: 'City Clinic',  date: '2026-02-03' },
  { type: 'expense', amount: 7800,   category: 'Groceries',    description: 'Weekly shop',         merchant: 'Whole Foods',  date: '2026-02-08' },
  { type: 'expense', amount: 12000,  category: 'Dining',       description: "Valentine's dinner",  merchant: 'Acme',         date: '2026-02-14' },
  { type: 'expense', amount: 6500,   category: 'Personal Care',description: 'Spa day',             merchant: 'Bliss Spa',    date: '2026-02-15' },
  { type: 'expense', amount: 1600,   category: 'Subscriptions',description: 'Netflix',             merchant: 'Netflix',      date: '2026-02-18' },
  { type: 'expense', amount: 1000,   category: 'Subscriptions',description: 'Spotify',             merchant: 'Spotify',      date: '2026-02-18' },
  { type: 'expense', amount: 4500,   category: 'Health',       description: 'Gym',                 merchant: 'Equinox',      date: '2026-02-20' },
  { type: 'expense', amount: 8500,   category: 'Groceries',    description: 'Weekly shop',         merchant: 'Trader Joes',  date: '2026-02-22' },
  { type: 'expense', amount: 8000,   category: 'Utilities',    description: 'Electricity',         merchant: 'PG&E',         date: '2026-02-25' },
  { type: 'expense', amount: 4200,   category: 'Entertainment',description: 'Concert tickets',     merchant: 'Ticketmaster', date: '2026-02-27' },

  // March — good month
  { type: 'expense', amount: 120000, category: 'Housing',      description: 'Rent',            merchant: 'Landlord',     date: '2026-03-01' },
  { type: 'expense', amount: 7500,   category: 'Groceries',    description: 'Weekly shop',     merchant: 'Trader Joes',  date: '2026-03-07' },
  { type: 'expense', amount: 3200,   category: 'Dining',       description: 'Lunch with team', merchant: 'Chipotle',     date: '2026-03-11' },
  { type: 'expense', amount: 1600,   category: 'Subscriptions',description: 'Netflix',         merchant: 'Netflix',      date: '2026-03-18' },
  { type: 'expense', amount: 1000,   category: 'Subscriptions',description: 'Spotify',         merchant: 'Spotify',      date: '2026-03-18' },
  { type: 'expense', amount: 4500,   category: 'Health',       description: 'Gym',             merchant: 'Equinox',      date: '2026-03-20' },
  { type: 'expense', amount: 6800,   category: 'Groceries',    description: 'Weekly shop',     merchant: 'Whole Foods',  date: '2026-03-21' },
  { type: 'expense', amount: 8000,   category: 'Utilities',    description: 'Electricity',     merchant: 'PG&E',         date: '2026-03-25' },
  { type: 'expense', amount: 2400,   category: 'Transport',    description: 'Monthly transit', merchant: 'BART',         date: '2026-03-28' },

  // April — slight overspend
  { type: 'expense', amount: 120000, category: 'Housing',      description: 'Rent',                merchant: 'Landlord',     date: '2026-04-01' },
  { type: 'expense', amount: 35000,  category: 'Travel',       description: 'Weekend trip flights',merchant: 'Delta',        date: '2026-04-03' },
  { type: 'expense', amount: 8200,   category: 'Groceries',    description: 'Weekly shop',         merchant: 'Whole Foods',  date: '2026-04-06' },
  { type: 'expense', amount: 5500,   category: 'Dining',       description: 'Dinner out',          merchant: 'Nopalito',     date: '2026-04-09' },
  { type: 'expense', amount: 12000,  category: 'Shopping',     description: 'Spring wardrobe',     merchant: 'Zara',         date: '2026-04-12' },
  { type: 'expense', amount: 1600,   category: 'Subscriptions',description: 'Netflix',             merchant: 'Netflix',      date: '2026-04-18' },
  { type: 'expense', amount: 1000,   category: 'Subscriptions',description: 'Spotify',             merchant: 'Spotify',      date: '2026-04-18' },
  { type: 'expense', amount: 4500,   category: 'Health',       description: 'Gym',                 merchant: 'Equinox',      date: '2026-04-20' },
  { type: 'expense', amount: 8000,   category: 'Utilities',    description: 'Electricity',         merchant: 'PG&E',         date: '2026-04-25' },
  { type: 'expense', amount: 4200,   category: 'Entertainment',description: 'Movie nights',        merchant: 'AMC',          date: '2026-04-28' },

  // May — partial month
  { type: 'expense', amount: 120000, category: 'Housing',      description: 'Rent',            merchant: 'Landlord',     date: '2026-05-01' },
  { type: 'expense', amount: 7800,   category: 'Groceries',    description: 'Weekly shop',     merchant: 'Trader Joes',  date: '2026-05-04' },
  { type: 'expense', amount: 3500,   category: 'Dining',       description: 'Brunch',          merchant: 'Tartine',      date: '2026-05-06' },
  { type: 'expense', amount: 1600,   category: 'Subscriptions',description: 'Netflix',         merchant: 'Netflix',      date: '2026-05-08' },
  { type: 'expense', amount: 1000,   category: 'Subscriptions',description: 'Spotify',         merchant: 'Spotify',      date: '2026-05-08' },
];

const insertTx = db.prepare(`
  INSERT INTO transactions (type, amount, category, description, merchant, date)
  VALUES (@type, @amount, @category, @description, @merchant, @date)
`);
const insertAllTx = db.transaction((entries: SeedTx[]) => {
  for (const e of entries) insertTx.run(e);
});
insertAllTx([...incomeEntries, ...expenseEntries]);

// ── 6) GOALS ───────────────────────────────────────────────────────────────
const insertGoal = db.prepare(`
  INSERT INTO goals (name, target_amount, current_amount, deadline, category)
  VALUES (?, ?, ?, ?, ?)
`);
insertGoal.run('Car Fund',      1000000, 180000, '2027-01-01', 'Savings'); // $10k / $1,800
insertGoal.run('Vacation Fund',  300000,  65000, '2026-12-01', 'Savings'); // $3k / $650

// ── 7) RECURRING BILLS ─────────────────────────────────────────────────────
const bills = [
  { name: 'Rent',        amount: 120000, frequency: 'monthly', next_due: '2026-06-01', category: 'Housing',       active: 1 },
  { name: 'Netflix',     amount: 1600,   frequency: 'monthly', next_due: '2026-05-18', category: 'Subscriptions', active: 1 },
  { name: 'Spotify',     amount: 1000,   frequency: 'monthly', next_due: '2026-05-18', category: 'Subscriptions', active: 1 },
  { name: 'Gym',         amount: 4500,   frequency: 'monthly', next_due: '2026-05-20', category: 'Health',        active: 1 },
  { name: 'Electricity', amount: 8000,   frequency: 'monthly', next_due: '2026-05-25', category: 'Utilities',     active: 1 },
];
const insertBill = db.prepare(`
  INSERT INTO recurring (name, amount, frequency, next_due, category, active)
  VALUES (@name, @amount, @frequency, @next_due, @category, @active)
`);
for (const b of bills) insertBill.run(b);

// ── 8) OWED (clean, no duplicates) ─────────────────────────────────────────
const owedEntries = [
  { direction: 'they_owe', person: 'Poorva',  amount: 400,  reason: 'Wee order',    due_date: null, settled: 0 },
  { direction: 'they_owe', person: 'Lakshmi', amount: 5594, reason: 'Monthly wifi', due_date: null, settled: 0 },
  { direction: 'i_owe',    person: 'Tanvi',   amount: 3500, reason: 'Train ticket', due_date: null, settled: 0 },
];
const insertOwed = db.prepare(`
  INSERT INTO owed (direction, person, amount, reason, due_date, settled)
  VALUES (@direction, @person, @amount, @reason, @due_date, @settled)
`);
for (const o of owedEntries) insertOwed.run(o);

// ── 9) COACH LOG ───────────────────────────────────────────────────────────
const coachMessages = [
  { message: "March was your best month — you came in $400 under budget. That discipline is paying off!", trigger: 'celebration' },
  { message: "Heads up — your February medical expenses pushed you 20% over budget. Building a small health fund could help absorb surprises like that.", trigger: 'insight' },
];
const insertCoach = db.prepare('INSERT INTO coach_log (message, trigger) VALUES (@message, @trigger)');
for (const c of coachMessages) insertCoach.run(c);

const txCount = incomeEntries.length + expenseEntries.length;
console.log('✅ Seed complete!');
console.log(`   Transactions:  ${txCount}`);
console.log('   Goals:         2 (Car Fund, Vacation Fund)');
console.log('   Recurring:     5');
console.log('   Owed:          3');
console.log('   Budget:        $2,000/mo from 2026-01-01');
console.log('   Opening bal:   $5,000');

db.close();
