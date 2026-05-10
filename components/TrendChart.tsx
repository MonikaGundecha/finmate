'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface TrendPoint {
  label: string;
  income: number; // cents
  expenses: number; // cents
}

interface TrendChartProps {
  data: TrendPoint[];
  period: 'month' | 'quarter' | 'ytd';
  monthlyBudget: number; // cents; 0 if unset
  currency: string;
}

function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$', INR: '₹', GBP: '£', EUR: '€', CAD: 'C$', AUD: 'A$',
  };
  return symbols[currency] || '$';
}

export default function TrendChart({ data, period, monthlyBudget, currency }: TrendChartProps) {
  const symbol = getCurrencySymbol(currency);
  const fmtAxis = (cents: number) => `${symbol}${Math.round(cents / 100)}`;
  const fmtTooltip = (cents: number) => `${symbol}${(cents / 100).toFixed(2)}`;
  const showBudgetLine = monthlyBudget > 0 && period !== 'month';

  const subtitle =
    period === 'month'
      ? 'Daily totals for the selected month'
      : period === 'quarter'
      ? 'Monthly totals for the selected quarter'
      : 'Monthly totals year-to-date';

  return (
    <div className="rounded-2xl bg-white dark:bg-[#1a1a2e] border border-[#e8e8f0] dark:border-[#2a2a40] p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Income vs Expenses
          </h2>
          <span className="text-xs text-slate-400">{subtitle}</span>
        </div>
        {showBudgetLine && (
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <span className="inline-block w-3 border-t-2 border-dashed border-amber-400" />
            Budget {symbol}
            {(monthlyBudget / 100).toFixed(0)}/mo
          </span>
        )}
      </div>
      {data.length === 0 ? (
        <div className="h-52 flex items-center justify-center text-slate-400 text-sm">
          No data for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e8f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={fmtAxis}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <Tooltip formatter={(v) => fmtTooltip(Number(v))} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            {showBudgetLine && (
              <ReferenceLine
                y={monthlyBudget}
                stroke="#e69f00"
                strokeDasharray="5 3"
                strokeWidth={1.5}
                label={{ value: 'Budget', position: 'right', fontSize: 10, fill: '#e69f00' }}
              />
            )}
            <Line
              type="monotone"
              dataKey="income"
              name="Income"
              stroke="#0077bb"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="expenses"
              name="Expenses"
              stroke="#cc3311"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
