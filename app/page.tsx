'use client';

import { useCallback, useEffect, useState } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import Link from 'next/link';
import InputBar from '@/components/InputBar';
import Logo from '@/components/Logo';
import SpendingChart from '@/components/SpendingChart';
import GoalTracker from '@/components/GoalTracker';
import OwedLedger from '@/components/OwedLedger';
import RecurringList from '@/components/RecurringList';
import CoachMessage from '@/components/CoachMessage';
import KPIBar from '@/components/KPIBar';
import PeriodSelector, { PeriodKind, getLocalYearMonth } from '@/components/PeriodSelector';
import TransactionHistory from '@/components/TransactionHistory';
import TopCategories from '@/components/TopCategories';

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

const EXAMPLE_PROMPTS = [
  'spent $45 at Trader Joes',
  'I owe Poorva $30 for dinner',
  'save $10,000 for a car',
];

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKind>('month');
  const [date, setDate] = useState<string>(getLocalYearMonth);
  const [prefillText, setPrefillText] = useState<string | undefined>(undefined);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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
        <Link href="/settings">
          <button className="p-2 rounded-xl hover:bg-fin-50 dark:hover:bg-[#2a2a40] transition-colors">
            <SettingsIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </button>
        </Link>
      </header>

      <main className="space-y-10 pb-10">
        {/* SECTION 1 — HERO */}
        <section className="bg-gradient-to-b from-indigo-50 to-white dark:from-[#1a1a2e] dark:to-[#13131f] py-16 px-6">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100">
              Hi there 👋
            </h1>
            <p className="text-base text-gray-500 dark:text-slate-400 mt-2">
              Tell Fin anything — log expenses, set goals, track what you owe
            </p>
            <div className="max-w-2xl mx-auto mt-6">
              <InputBar
                onSaved={() => {
                  fetchDashboard();
                  setRefreshTrigger(prev => prev + 1);
                }}
                currency={currency}
                prefillText={prefillText}
              />
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {EXAMPLE_PROMPTS.map(text => (
                <button
                  key={text}
                  type="button"
                  onClick={() => setPrefillText(text)}
                  className="rounded-full border border-gray-200 dark:border-slate-700 text-sm text-gray-500 dark:text-slate-400 px-3 py-1 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        </section>

        {fetchError && !data && (
          <div className="max-w-7xl mx-auto px-6">
            <div className="rounded-2xl border border-[#cc3311]/30 bg-[#fdeae6] dark:bg-[#3a0d05]/40 p-4 text-sm text-[#cc3311]">
              Couldn&apos;t load dashboard: {fetchError}
            </div>
          </div>
        )}

        {/* SECTION 2 — FIN SAYS */}
        <section className="max-w-4xl mx-auto px-6 w-full">
          <CoachMessage
            nudges={data?.coachMessages ?? []}
            onDismissed={() => fetchDashboard()}
            userName={userName}
          />
        </section>

        {/* SECTION 3 — PERIOD SELECTOR + KPIs */}
        <section className="max-w-7xl mx-auto px-6 space-y-4">
          <div className="flex">
            <PeriodSelector period={period} date={date} onChange={handlePeriodChange} />
          </div>
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
        </section>

        {/* SECTION 4 — CHARTS ROW */}
        {data && (
          <section className="max-w-7xl mx-auto px-6">
            <div className="grid lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <SpendingChart
                  currentMonth={data.periodLabel ?? ''}
                  categoryTotals={data.categoryBreakdown ?? []}
                  monthlyData={[]}
                  currency={currency}
                />
              </div>
              <div className="lg:col-span-1">
                <TopCategories data={data.categoryBreakdown ?? []} currency={currency} />
              </div>
            </div>
          </section>
        )}

        {/* SECTION 5 — BOTTOM ROW */}
        {data && (
          <section className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <GoalTracker goals={data.goals ?? []} currency={currency} />
              <OwedLedger
                items={data.owedUnsettled ?? []}
                settledItems={data.owedHistory ?? []}
                onSettled={() => fetchDashboard()}
                currency={currency}
              />
              <RecurringList
                items={data.upcomingBills ?? []}
                itemsMonth={data.upcomingBillsMonth ?? []}
                currency={currency}
                onChanged={() => fetchDashboard()}
              />
            </div>
          </section>
        )}

        {/* SECTION 6 — TRANSACTION HISTORY */}
        <section className="max-w-7xl mx-auto px-6">
          <TransactionHistory currency={currency} refreshTrigger={refreshTrigger} />
        </section>
      </main>
    </div>
  );
}
