import { ArrowDown, ArrowRight, ArrowUp, DollarSign, TrendingDown, TrendingUp } from 'lucide-react';

interface MonthSummaryProps {
  month: string;
  income: number;
  expenses: number;
  net: number;
  previousIncome?: number;
  previousExpenses?: number;
  previousNet?: number;
  previousLabel?: string;
  currency: string;
}

function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$', INR: '₹', GBP: '£', EUR: '€', CAD: 'C$', AUD: 'A$',
  };
  return symbols[currency] || '$';
}

function formatAmount(cents: number, currency: string): string {
  return `${getCurrencySymbol(currency)}${(Math.abs(cents) / 100).toFixed(2)}`;
}

interface Delta {
  hasComparison: boolean;
  direction: 'up' | 'down' | 'flat';
  dollars: string;
  pct: string;
}

function computeDelta(current: number, previous: number, currency: string): Delta {
  if (previous === 0 && current === 0) {
    return { hasComparison: false, direction: 'flat', dollars: '', pct: '' };
  }
  if (previous === 0) {
    const sign = current >= 0 ? '+' : '-';
    return {
      hasComparison: true,
      direction: current > 0 ? 'up' : current < 0 ? 'down' : 'flat',
      dollars: `${sign}${formatAmount(current, currency)}`,
      pct: 'new',
    };
  }
  const diff = current - previous;
  const pct = Math.round((Math.abs(diff) / Math.abs(previous)) * 100);
  const sign = diff >= 0 ? '+' : '-';
  return {
    hasComparison: true,
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
    dollars: `${sign}${formatAmount(diff, currency)}`,
    pct: `${pct}%`,
  };
}

interface DeltaBadgeProps {
  delta: Delta;
  invert?: boolean;
  previousLabel?: string;
}

function DeltaBadge({ delta, invert = false, previousLabel }: DeltaBadgeProps) {
  if (!delta.hasComparison || delta.direction === 'flat') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 mt-1">
        <ArrowRight className="w-3 h-3" /> no change
      </span>
    );
  }
  const isGood = invert ? delta.direction === 'down' : delta.direction === 'up';
  const color = isGood ? 'text-[#009988]' : 'text-[#cc3311]';
  const Icon = delta.direction === 'up' ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium mt-1 ${color}`}>
      <Icon className="w-3 h-3" />
      {delta.dollars} · {delta.pct}
      {previousLabel ? <span className="text-slate-400 font-normal ml-0.5">vs {previousLabel}</span> : null}
    </span>
  );
}

export default function MonthSummary({
  month,
  income,
  expenses,
  net,
  previousIncome,
  previousExpenses,
  previousNet,
  previousLabel,
  currency,
}: MonthSummaryProps) {
  const isPositive = net >= 0;
  const incomeDelta = computeDelta(income, previousIncome ?? 0, currency);
  const expensesDelta = computeDelta(expenses, previousExpenses ?? 0, currency);
  const netDelta = computeDelta(net, previousNet ?? 0, currency);

  return (
    <div className="bg-white dark:bg-[#1a1a2e] rounded-2xl p-5 border border-[#e8e8f0] dark:border-[#2a2a40]">
      <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4">{month}</h2>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-[#0077bb]" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Income</span>
          </div>
          <p className="text-lg font-semibold text-[#0077bb]">{formatAmount(income, currency)}</p>
          <DeltaBadge delta={incomeDelta} previousLabel={previousLabel} />
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown className="w-3.5 h-3.5 text-[#cc3311]" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Expenses</span>
          </div>
          <p className="text-lg font-semibold text-[#cc3311]">{formatAmount(expenses, currency)}</p>
          <DeltaBadge delta={expensesDelta} invert previousLabel={previousLabel} />
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-[#009988]" />
            <span className="text-xs text-slate-500 dark:text-slate-400">Net</span>
          </div>
          <p
            className={`text-lg font-semibold ${
              isPositive ? 'text-[#009988]' : 'text-[#cc3311]'
            }`}
          >
            {isPositive ? '+' : '-'}
            {formatAmount(net, currency)}
          </p>
          <DeltaBadge delta={netDelta} previousLabel={previousLabel} />
        </div>
      </div>
    </div>
  );
}
