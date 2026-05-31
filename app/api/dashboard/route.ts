import { NextRequest, NextResponse } from 'next/server';
import {
  getPeriodTotals,
  getSpendingByCategory,
  getTrendData,
  getGoals,
  getOwed,
  getUpcomingRecurring,
  getRecurringThisMonth,
  getUnreadCoachLogs,
  getSpendable,
  getNetWorth,
  getMonthlyBudget,
  getAllSettings,
} from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type PeriodKind = 'month' | 'quarter' | 'ytd';

function getLocalYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

interface DateRanges {
  current: { start: string; end: string };
  previous: { start: string; end: string };
  label: string;
  previousLabel: string;
}

function getDateRanges(period: PeriodKind, yearMonth: string): DateRanges {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  const today = new Date();
  const year = match ? parseInt(match[1], 10) : today.getFullYear();
  const month = match ? parseInt(match[2], 10) : today.getMonth() + 1;
  const d = new Date(year, month - 1, 1);

  if (period === 'quarter') {
    const quarter = Math.floor(d.getMonth() / 3);
    const qStart = new Date(year, quarter * 3, 1);
    const qEnd = new Date(year, quarter * 3 + 3, 0);
    const pqStart = new Date(year, (quarter - 1) * 3, 1);
    const pqEnd = new Date(year, quarter * 3, 0);
    const q = quarter + 1;
    const prevQ = q === 1 ? 4 : q - 1;
    const prevQYear = q === 1 ? year - 1 : year;
    return {
      current: { start: ymd(qStart), end: ymd(qEnd) },
      previous: { start: ymd(pqStart), end: ymd(pqEnd) },
      label: `Q${q} ${year}`,
      previousLabel: `Q${prevQ} ${prevQYear}`,
    };
  }

  if (period === 'ytd') {
    const isCurrentYear = year === today.getFullYear();
    const end = isCurrentYear ? ymd(today) : `${year}-12-31`;
    return {
      current: { start: `${year}-01-01`, end },
      previous: { start: `${year - 1}-01-01`, end: `${year - 1}-12-31` },
      label: `YTD ${year}`,
      previousLabel: `${year - 1}`,
    };
  }

  // month
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const prevMonth = new Date(year, month - 2, 1);
  const prevEnd = new Date(year, month - 1, 0);
  return {
    current: { start: ymd(start), end: ymd(end) },
    previous: { start: ymd(prevMonth), end: ymd(prevEnd) },
    label: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
    previousLabel: prevMonth.toLocaleString('default', { month: 'short', year: 'numeric' }),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const periodRaw = searchParams.get('period') || 'month';
    const period = (['month', 'quarter', 'ytd'].includes(periodRaw) ? periodRaw : 'month') as PeriodKind;
    const date = searchParams.get('date') || getLocalYearMonth();

    const ranges = getDateRanges(period, date);
    const currentTotals = await getPeriodTotals(ranges.current.start, ranges.current.end);
    const previousTotals = await getPeriodTotals(ranges.previous.start, ranges.previous.end);

    const categoryBreakdown = await getSpendingByCategory(ranges.current.start, ranges.current.end);
    const trendData = await getTrendData(period, ranges.current.start, ranges.current.end);
    const goals = await getGoals();
    const owedUnsettled = await getOwed(false);
    const owedHistory = await getOwed(true);
    const upcomingBills = await getUpcomingRecurring(7);
    const upcomingBillsMonth = await getRecurringThisMonth();
    const coachMessages = await getUnreadCoachLogs(3);
    const spendable = await getSpendable();
    const netWorth = await getNetWorth();
    const settings = await getAllSettings();

    // Scale budget by period: month=1x, quarter=3x, ytd=months-covered.
    // For YTD viewing the current year this is months-elapsed-so-far; for prior
    // years it's 12. We derive it from the actual range so both cases work.
    const rawBudget = await getMonthlyBudget(ranges.current.start);
    let monthlyBudget = rawBudget;
    let budgetPeriodLabel: 'Monthly Budget' | 'Quarterly Budget' | 'YTD Budget' =
      'Monthly Budget';
    if (period === 'quarter') {
      monthlyBudget = rawBudget * 3;
      budgetPeriodLabel = 'Quarterly Budget';
    } else if (period === 'ytd') {
      const startD = new Date(ranges.current.start);
      const endD = new Date(ranges.current.end);
      const monthsCovered =
        (endD.getFullYear() - startD.getFullYear()) * 12 +
        (endD.getMonth() - startD.getMonth()) +
        1;
      monthlyBudget = rawBudget * Math.max(1, monthsCovered);
      budgetPeriodLabel = 'YTD Budget';
    }

    const goalsTotalCurrent = goals.reduce((s, g) => s + (g.current_amount || 0), 0);
    const goalsTotalTarget = goals.reduce((s, g) => s + (g.target_amount || 0), 0);
    const goalsAvgPct =
      goals.length > 0 && goalsTotalTarget > 0
        ? Math.round((goalsTotalCurrent / goalsTotalTarget) * 100)
        : 0;

    return NextResponse.json({
      period,
      date,
      periodLabel: ranges.label,
      previousLabel: ranges.previousLabel,
      ranges,
      summary: {
        spent: currentTotals.spent,
        income: currentTotals.income,
        net: currentTotals.income - currentTotals.spent,
        previousSpent: previousTotals.spent,
        previousIncome: previousTotals.income,
        previousNet: previousTotals.income - previousTotals.spent,
      },
      categoryBreakdown,
      trendData,
      goals,
      owedUnsettled,
      owedHistory,
      upcomingBills,
      upcomingBillsMonth,
      coachMessages,
      spendable,
      netWorth,
      monthlyBudget,
      budgetPeriodLabel,
      rawMonthlyBudget: rawBudget,
      kpis: {
        netWorth,
        spendable,
        goals: {
          avgPct: goalsAvgPct,
          count: goals.length,
          totalSaved: goalsTotalCurrent,
        },
      },
      settings,
    });
  } catch (err) {
    console.error('Dashboard API error:', err);
    const msg = err instanceof Error ? err.message : 'Failed to load dashboard';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
