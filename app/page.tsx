'use client';

import { useCallback, useEffect, useState } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import Link from 'next/link';
import InputBar from '@/components/InputBar';
import Logo from '@/components/Logo';
import MonthSummary from '@/components/MonthSummary';
import SpendingChart from '@/components/SpendingChart';
import GoalTracker from '@/components/GoalTracker';
import OwedLedger from '@/components/OwedLedger';
import RecurringList from '@/components/RecurringList';
import CoachMessage from '@/components/CoachMessage';
import KPIBar from '@/components/KPIBar';
import PeriodSelector, { PeriodKind, getLocalYearMonth } from '@/components/PeriodSelector';
import TransactionHistory from '@/components/TransactionHistory';
import TopCategories from '@/components/TopCategories';
import TrendChart from '@/components/TrendChart';

interface OwedItem {
  id: number;
  direction: 'i_owe' | 'they_owe';
  person: string;
  amount: number;
  reason?: string | null;
  due_date?: string | null;
  settled?: number;
  settled_at?: string | null;
}

interface RecurringItem {
  id: number;
  name: string;
  amount: number;
  frequency: string;
  next_due: string;
  category: string;
}

interface GoalItem {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline?: string | null;
}

interface CoachNudge {
  id: number;
  message: string;
  trigger?: string | null;
}

interface TrendPoint {
  label: string;
  income: number;
  expenses: number;
}

interface DashboardData {
  period: PeriodKind;
  date: string;
  periodLabel: string;
  previousLabel: string;
  summary: {
    spent: number;
    income: number;
    net: number;
    previousSpent: number;
    previousIncome: number;
    previousNet: number;
  };
  categoryBreakdown: { category: string; total: number }[];
  trendData: TrendPoint[];
  goals: GoalItem[];
  owedUnsettled: OwedItem[];
  owedHistory: OwedItem[];
  upcomingBills: RecurringItem[];
  upcomingBillsMonth: RecurringItem[];
  coachMessages: CoachNudge[];
  spendable: number;
  netWorth: number;
  monthlyBudget: number;
  budgetPeriodLabel?: string;
  rawMonthlyBudget?: number;
  kpis: {
    netWorth: number;
    spendable: number;
    goals: { avgPct: number; count: number; totalSaved: number };
  };
  settings: Record<string, string>;
}

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKind>('month');
  const [date, setDate] = useState<string>(getLocalYearMonth);

  const fetchDashboard = useCallback(
    async (p: PeriodKind = period, d: string = date) => {
      try {
        const res = await fetch(`/api/dashboard?period=${p}&date=${d}`);
        const json = await res.json();
        if (!res.ok || json?.error) {
          const msg = json?.error || `Dashboard fetch failed (${res.status})`;
          console.error('Dashboard API error:', msg);
          setFetchError(msg);
          return;
        }
        setFetchError(null);
        setData(json as DashboardData);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
        setFetchError(err instanceof Error ? err.message : 'Network error');
      } finally {
        setLoading(false);
      }
    },
    [period, date],
  );

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handlePeriodChange = (newPeriod: PeriodKind, newDate: string) => {
    setPeriod(newPeriod);
    setDate(newDate);
    fetchDashboard(newPeriod, newDate);
  };

  const userName = data?.settings?.name || 'there';
  const currency = data?.settings?.currency || 'USD';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f8ff] dark:bg-[#13131f]">
        <div className="text-slate-400 text-sm">Loading FinMate...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f8ff] dark:bg-[#13131f]">
      <header className="bg-white dark:bg-[#1a1a2e] border-b border-[#e8e8f0] dark:border-[#2a2a40] px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <Logo />
        <div className="flex items-center gap-3">
          <PeriodSelector period={period} date={date} onChange={handlePeriodChange} />
          <Link href="/settings">
            <button className="p-2 rounded-xl hover:bg-fin-50 dark:hover:bg-[#2a2a40] transition-colors">
              <SettingsIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </button>
          </Link>
        </div>
      </header>

      <div className="flex h-[calc(100vh-53px)]">
        <div className="w-80 shrink-0 border-r border-[#e8e8f0] dark:border-[#2a2a40] bg-white dark:bg-[#1a1a2e] flex flex-col overflow-hidden">
          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            <CoachMessage
              nudges={data?.coachMessages ?? []}
              onDismissed={() => fetchDashboard()}
              userName={userName}
            />
            <RecurringList
              items={data?.upcomingBills ?? []}
              itemsMonth={data?.upcomingBillsMonth ?? []}
              currency={currency}
            />
            <OwedLedger
              items={data?.owedUnsettled ?? []}
              settledItems={data?.owedHistory ?? []}
              onSettled={() => fetchDashboard()}
              currency={currency}
            />
          </div>
          <div className="p-4 border-t border-[#e8e8f0] dark:border-[#2a2a40] bg-white dark:bg-[#1a1a2e]">
            <p className="text-xs text-slate-400 mb-2">Hey {userName}! Tell Fin anything...</p>
            <InputBar onSaved={() => fetchDashboard()} currency={currency} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">
            {fetchError && !data && (
              <div className="rounded-2xl border border-[#cc3311]/30 bg-[#fdeae6] dark:bg-[#3a0d05]/40 p-4 text-sm text-[#cc3311]">
                Couldn&apos;t load dashboard: {fetchError}
              </div>
            )}

            {data && (
              <KPIBar
                netWorth={data.netWorth ?? data.kpis?.netWorth ?? 0}
                spendable={data.spendable ?? data.kpis?.spendable ?? 0}
                goals={data.kpis?.goals ?? { avgPct: 0, count: 0, totalSaved: 0 }}
                monthlyBudget={data.monthlyBudget ?? 0}
                budgetPeriodLabel={data.budgetPeriodLabel ?? 'Monthly Budget'}
                currentSpent={data.summary?.spent ?? 0}
                currency={currency}
              />
            )}

            {data?.summary && (
              <MonthSummary
                month={data.periodLabel ?? ''}
                income={data.summary.income ?? 0}
                expenses={data.summary.spent ?? 0}
                net={data.summary.net ?? 0}
                previousIncome={data.summary.previousIncome ?? 0}
                previousExpenses={data.summary.previousSpent ?? 0}
                previousNet={data.summary.previousNet ?? 0}
                previousLabel={data.previousLabel}
                currency={currency}
              />
            )}

            {data && (
              <TrendChart
                data={data.trendData ?? []}
                period={data.period ?? 'month'}
                monthlyBudget={data.monthlyBudget ?? 0}
                currency={currency}
              />
            )}

            {data && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <SpendingChart
                    currentMonth={data.periodLabel ?? ''}
                    categoryTotals={data.categoryBreakdown ?? []}
                    monthlyData={[]}
                    currency={currency}
                  />
                </div>
                <div>
                  <TopCategories data={data.categoryBreakdown ?? []} currency={currency} />
                </div>
              </div>
            )}

            {data && <GoalTracker goals={data.goals ?? []} currency={currency} />}

            <TransactionHistory currency={currency} />
          </div>
        </div>
      </div>
    </div>
  );
}
