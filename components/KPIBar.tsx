import { Gauge, PiggyBank, Target, Wallet } from 'lucide-react';

interface KPIBarProps {
  netWorth: number;
  spendable: number;
  goals: { avgPct: number; count: number; totalSaved: number };
  monthlyBudget: number; // cents, scaled to the active period (0 if unset)
  budgetPeriodLabel?: string; // e.g. "Monthly Budget" / "Quarterly Budget" / "YTD Budget"
  currentSpent: number;  // cents — spent in current period
  currency: string;
}

function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$', INR: '₹', GBP: '£', EUR: '€', CAD: 'C$', AUD: 'A$',
  };
  return symbols[currency] || '$';
}

function formatAmount(cents: number, currency: string): string {
  const symbol = getCurrencySymbol(currency);
  const abs = Math.abs(cents);
  const formatted = (abs / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${cents < 0 ? '-' : ''}${symbol}${formatted}`;
}

function formatWhole(cents: number, currency: string): string {
  return `${getCurrencySymbol(currency)}${Math.round(cents / 100).toLocaleString('en-US')}`;
}

function getProgressColor(pct: number): string {
  if (pct >= 80) return 'text-[#009988]';
  if (pct >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-[#cc3311]';
}

export default function KPIBar({
  netWorth,
  spendable,
  goals,
  monthlyBudget,
  budgetPeriodLabel = 'Monthly Budget',
  currentSpent,
  currency,
}: KPIBarProps) {
  const pctUsed = monthlyBudget > 0 ? Math.round((currentSpent / monthlyBudget) * 100) : 0;
  const overBudget = monthlyBudget > 0 && currentSpent > monthlyBudget;
  const budgetBarColor =
    pctUsed >= 100 ? 'bg-[#cc3311]' : pctUsed >= 75 ? 'bg-amber-400' : 'bg-[#009988]';
  const budgetTextColor =
    pctUsed >= 100 ? 'text-[#cc3311]' : pctUsed >= 75 ? 'text-amber-500' : 'text-[#009988]';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="bg-white dark:bg-[#1a1a2e] rounded-2xl p-4 border border-[#e8e8f0] dark:border-[#2a2a40] shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 bg-fin-50 dark:bg-fin-900/30 rounded-lg">
            <Wallet className="w-3.5 h-3.5 text-fin-600 dark:text-fin-400" />
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Net Worth</span>
        </div>
        <p
          className={`text-xl font-bold ${
            netWorth >= 0 ? 'text-slate-900 dark:text-slate-100' : 'text-[#cc3311]'
          }`}
        >
          {formatAmount(netWorth, currency)}
        </p>
        <p className="text-xs text-slate-400 mt-1">opening + income − expenses − owed</p>
      </div>

      <div className="bg-white dark:bg-[#1a1a2e] rounded-2xl p-4 border border-[#e8e8f0] dark:border-[#2a2a40] shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 bg-[#e6f7f4] dark:bg-[#012a26] rounded-lg">
            <PiggyBank className="w-3.5 h-3.5 text-[#009988]" />
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total Spendable
          </span>
        </div>
        <p className={`text-xl font-bold ${spendable >= 0 ? 'text-[#009988]' : 'text-[#cc3311]'}`}>
          {formatAmount(spendable, currency)}
        </p>
        <p className="text-xs text-slate-400 mt-1">after goals saved &amp; bills due</p>
      </div>

      <div className="bg-white dark:bg-[#1a1a2e] rounded-2xl p-4 border border-[#e8e8f0] dark:border-[#2a2a40] shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 bg-fin-50 dark:bg-fin-900/30 rounded-lg">
            <Target className="w-3.5 h-3.5 text-fin-600 dark:text-fin-400" />
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Goals</span>
        </div>
        <p className={`text-xl font-bold ${getProgressColor(goals.avgPct)}`}>{goals.avgPct}%</p>
        <p className="text-xs text-slate-400 mt-1">
          {goals.count} active · {formatAmount(goals.totalSaved, currency)} saved
        </p>
      </div>

      <div className="bg-white dark:bg-[#1a1a2e] rounded-2xl p-4 border border-[#e8e8f0] dark:border-[#2a2a40] shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 bg-fin-50 dark:bg-fin-900/30 rounded-lg">
            <Gauge className="w-3.5 h-3.5 text-fin-600 dark:text-fin-400" />
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {budgetPeriodLabel}
          </span>
        </div>
        {monthlyBudget === 0 ? (
          <p className="text-sm text-slate-400 mt-2 leading-snug">
            Type &quot;set my monthly budget to $2000&quot; to track spending
          </p>
        ) : (
          <>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {formatWhole(currentSpent, currency)}
              <span className="text-sm font-normal text-slate-400 ml-1">
                / {formatWhole(monthlyBudget, currency)}
              </span>
            </p>
            <div className="w-full bg-slate-100 dark:bg-[#2a2a40] rounded-full h-1.5 mt-2 mb-1">
              <div
                className={`h-1.5 rounded-full transition-all ${budgetBarColor}`}
                style={{ width: `${Math.min(100, pctUsed)}%` }}
              />
            </div>
            <p className={`text-xs ${budgetTextColor}`}>
              {overBudget
                ? `Over budget by ${formatWhole(currentSpent - monthlyBudget, currency)}`
                : `${formatWhole(monthlyBudget - currentSpent, currency)} remaining`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
