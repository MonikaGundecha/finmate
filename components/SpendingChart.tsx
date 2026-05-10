'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const CHART_COLORS = [
  '#6366f1', // indigo
  '#0077bb', // blue
  '#e69f00', // amber
  '#009988', // teal
  '#cc3311', // vermillion
  '#f0e442', // yellow
  '#cc79a7', // pink
  '#56b4e9', // sky blue
];

function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$', INR: '₹', GBP: '£', EUR: '€', CAD: 'C$', AUD: 'A$',
  };
  return symbols[currency] || '$';
}

interface SpendingChartProps {
  // Kept for backwards compatibility — currently unused
  currentMonth?: string;
  categoryTotals: { category: string; total: number }[];
  monthlyData?: unknown;
  currency: string;
}

export default function SpendingChart({ categoryTotals, currency }: SpendingChartProps) {
  const symbol = getCurrencySymbol(currency);
  const [chartType, setChartType] = useState<'bar' | 'donut'>('bar');

  const barData = useMemo(
    () =>
      categoryTotals
        .filter(c => c.total > 0)
        .map(c => ({ category: c.category, total: Math.round(c.total / 100), totalCents: c.total })),
    [categoryTotals],
  );

  const donutData = useMemo(() => {
    if (barData.length <= 6) {
      return barData.map(d => ({ name: d.category, value: d.totalCents }));
    }
    const top = barData.slice(0, 6);
    const otherCents = barData.slice(6).reduce((s, d) => s + d.totalCents, 0);
    return [
      ...top.map(d => ({ name: d.category, value: d.totalCents })),
      { name: 'Other', value: otherCents },
    ];
  }, [barData]);

  const hasData = barData.length > 0;

  return (
    <div className="bg-white dark:bg-[#1a1a2e] rounded-2xl p-5 border border-[#e8e8f0] dark:border-[#2a2a40] h-full">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Spending by Category
        </h2>
        <div className="flex rounded-lg overflow-hidden border border-[#e8e8f0] dark:border-[#2a2a40]">
          {(['bar', 'donut'] as const).map(t => (
            <button
              key={t}
              onClick={() => setChartType(t)}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                chartType === t
                  ? 'bg-fin-600 text-white'
                  : 'bg-white dark:bg-[#1a1a2e] text-gray-600 dark:text-gray-300 hover:bg-fin-50 dark:hover:bg-[#2a2a40]'
              }`}
            >
              {t === 'bar' ? 'Bar' : 'Donut'}
            </button>
          ))}
        </div>
      </div>

      <div className="h-60">
        {!hasData ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-slate-400">No spending recorded for this period.</p>
          </div>
        ) : chartType === 'bar' ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <XAxis
                dataKey="category"
                tick={{ fontSize: 10 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={50}
              />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${symbol}${v}`} />
              <Tooltip
                formatter={(v) => `${symbol}${Number(v).toFixed(2)}`}
                cursor={{ fill: 'rgba(99,102,241,0.08)' }}
              />
              <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                {barData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={2}
                dataKey="value"
              >
                {donutData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => `${symbol}${(Number(v) / 100).toFixed(2)}`} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
