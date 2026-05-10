import getDb, {
  getMonthSummary,
  getCategoryTotals,
  getOwed,
  getUpcomingRecurring,
  getGoals,
  getRecentCoachMessages,
  getAllSettings,
} from './db';

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function getLastMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

export function buildDBSummary() {
  const month = getCurrentMonth();
  const lastMonth = getLastMonth();

  const current = getMonthSummary(month);
  const last = getMonthSummary(lastMonth);

  const expensesDeltaPct = last.expenses > 0
    ? Math.round(((current.expenses - last.expenses) / last.expenses) * 100)
    : 0;

  const topCategories = getCategoryTotals(month).slice(0, 5).map(c => ({
    category: c.category,
    total_cents: c.total,
  }));

  const unsettledOwed = getOwed(false).map(o => ({
    direction: o.direction,
    person: o.person,
    amount_cents: o.amount,
  }));

  const upcomingRecurring = getUpcomingRecurring(7).map(r => ({
    name: r.name,
    amount_cents: r.amount,
    next_due: r.next_due,
  }));

  const goals = getGoals().map(g => ({
    name: g.name,
    target_cents: g.target_amount,
    current_cents: g.current_amount,
    pct: g.target_amount > 0 ? Math.round((g.current_amount / g.target_amount) * 100) : 0,
  }));

  const recentCoachMessages = getRecentCoachMessages(3);

  return {
    month,
    income_cents: current.income,
    expenses_cents: current.expenses,
    net_cents: current.net,
    top_categories: topCategories,
    vs_last_month: { expenses_delta_pct: expensesDeltaPct },
    unsettled_owed: unsettledOwed,
    upcoming_recurring: upcomingRecurring,
    goals,
    recent_coach_messages: recentCoachMessages,
  };
}

export interface KPIs {
  netWorth: number;
  spendable: number;
  goals: { avgPct: number; count: number; totalSaved: number };
}

export function getKPIs(): KPIs {
  const db = getDb();
  const settings = getAllSettings();
  const openingBalance =
    parseInt(settings.opening_savings || '0', 10) +
    parseInt(settings.opening_checking || '0', 10) +
    parseInt(settings.opening_cash || '0', 10);

  const allTime = db
    .prepare(`
      SELECT
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses
      FROM transactions
    `)
    .get() as { income: number | null; expenses: number | null };

  const totalIncome = allTime?.income || 0;
  const totalExpenses = allTime?.expenses || 0;

  const owedByMe = db
    .prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM owed WHERE direction = 'i_owe' AND settled = 0
    `)
    .get() as { total: number };

  const goalsData = db
    .prepare(`
      SELECT COALESCE(SUM(target_amount), 0) as total_target,
             COALESCE(SUM(current_amount), 0) as total_current,
             COUNT(*) as count
      FROM goals
    `)
    .get() as { total_target: number; total_current: number; count: number };

  const upcomingThisMonth = db
    .prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM recurring
      WHERE active = 1
        AND next_due <= date('now', 'start of month', '+1 month', '-1 day')
    `)
    .get() as { total: number };

  const netWorth = openingBalance + totalIncome - totalExpenses - owedByMe.total;
  // Spendable = NetWorth - SUM(goals.current_amount) - bills due this month - unsettled i_owe
  // (i_owe is already subtracted in netWorth, so don't subtract twice)
  const spendable =
    netWorth - goalsData.total_current - upcomingThisMonth.total;
  const goalAvgPct =
    goalsData.count > 0 && goalsData.total_target > 0
      ? Math.round((goalsData.total_current / goalsData.total_target) * 100)
      : 0;

  return {
    netWorth,
    spendable: Math.max(0, spendable),
    goals: {
      avgPct: goalAvgPct,
      count: goalsData.count,
      totalSaved: goalsData.total_current,
    },
  };
}
