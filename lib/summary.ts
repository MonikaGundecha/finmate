import {
  getMonthSummary,
  getCategoryTotals,
  getOwed,
  getUpcomingRecurring,
  getGoals,
  getRecentCoachMessages,
  getNetWorth,
  getSpendable,
} from './db';

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function getLastMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

export async function buildDBSummary() {
  const month = getCurrentMonth();
  const lastMonth = getLastMonth();

  const current = await getMonthSummary(month);
  const last = await getMonthSummary(lastMonth);

  const expensesDeltaPct = last.expenses > 0
    ? Math.round(((current.expenses - last.expenses) / last.expenses) * 100)
    : 0;

  const topCategories = (await getCategoryTotals(month)).slice(0, 5).map(c => ({
    category: c.category,
    total_cents: c.total,
  }));

  const unsettledOwed = (await getOwed(false)).map(o => ({
    direction: o.direction,
    person: o.person,
    amount_cents: o.amount,
  }));

  const upcomingRecurring = (await getUpcomingRecurring(7)).map(r => ({
    name: r.name,
    amount_cents: r.amount,
    next_due: r.next_due,
  }));

  const goals = (await getGoals()).map(g => ({
    name: g.name,
    target_cents: g.target_amount,
    current_cents: g.current_amount,
    pct: g.target_amount > 0 ? Math.round((g.current_amount / g.target_amount) * 100) : 0,
  }));

  const recentCoachMessages = await getRecentCoachMessages(3);

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

export async function getKPIs(): Promise<KPIs> {
  const [netWorth, spendable, goals] = await Promise.all([
    getNetWorth(),
    getSpendable(),
    getGoals(),
  ]);

  const totalTarget = goals.reduce((s, g) => s + (g.target_amount || 0), 0);
  const totalCurrent = goals.reduce((s, g) => s + (g.current_amount || 0), 0);
  const goalAvgPct =
    goals.length > 0 && totalTarget > 0
      ? Math.round((totalCurrent / totalTarget) * 100)
      : 0;

  return {
    netWorth,
    spendable: Math.max(0, spendable),
    goals: {
      avgPct: goalAvgPct,
      count: goals.length,
      totalSaved: totalCurrent,
    },
  };
}
