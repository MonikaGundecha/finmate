'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

export type PeriodKind = 'month' | 'quarter' | 'ytd';

interface PeriodSelectorProps {
  period: PeriodKind;
  date: string; // "YYYY-MM"
  onChange: (period: PeriodKind, date: string) => void;
}

// Local "YYYY-MM" — avoids UTC day-shift in IST/CET evenings.
export function getLocalYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function parseYM(date: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(date);
  if (!match) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year: parseInt(match[1], 10), month: parseInt(match[2], 10) };
}

function toYM(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getLabel(period: PeriodKind, date: string): string {
  const { year, month } = parseYM(date);
  const d = new Date(year, month - 1, 1);
  if (period === 'month') {
    return d.toLocaleString('default', { month: 'long', year: 'numeric' });
  }
  if (period === 'quarter') {
    const q = Math.floor((month - 1) / 3) + 1;
    return `Q${q} ${year}`;
  }
  return `YTD ${year}`;
}

function navigate(period: PeriodKind, date: string, direction: -1 | 1): string {
  const { year, month } = parseYM(date);
  const d = new Date(year, month - 1, 1);
  if (period === 'month') {
    d.setMonth(d.getMonth() + direction);
  } else if (period === 'quarter') {
    d.setMonth(d.getMonth() + direction * 3);
  } else {
    d.setFullYear(d.getFullYear() + direction);
  }
  return toYM(d.getFullYear(), d.getMonth() + 1);
}

export default function PeriodSelector({ period, date, onChange }: PeriodSelectorProps) {
  const currentYM = getLocalYearMonth();
  const isAtPresent = date >= currentYM;

  return (
    <div className="flex items-center gap-3">
      <div className="flex rounded-lg overflow-hidden border border-[#e8e8f0] dark:border-[#2a2a40] text-xs font-medium">
        {(['month', 'quarter', 'ytd'] as PeriodKind[]).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p, date)}
            className={`px-3 py-1.5 transition-colors ${
              period === p
                ? 'bg-fin-600 text-white'
                : 'bg-white dark:bg-[#1a1a2e] text-gray-600 dark:text-gray-300 hover:bg-fin-50 dark:hover:bg-[#2a2a40]'
            }`}
          >
            {p === 'month' ? 'Month' : p === 'quarter' ? 'Quarter' : 'YTD'}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous period"
          onClick={() => onChange(period, navigate(period, date, -1))}
          className="p-1 rounded-md text-gray-500 hover:bg-fin-50 dark:hover:bg-[#2a2a40] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 min-w-[120px] text-center">
          {getLabel(period, date)}
        </span>
        <button
          type="button"
          aria-label="Next period"
          onClick={() => onChange(period, navigate(period, date, 1))}
          disabled={isAtPresent}
          className="p-1 rounded-md text-gray-500 hover:bg-fin-50 dark:hover:bg-[#2a2a40] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
