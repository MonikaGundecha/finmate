'use client';

import { useState } from 'react';
import { AlertCircle, Calendar, X } from 'lucide-react';

interface RecurringItem {
  id: number;
  name: string;
  amount: number;
  frequency: string;
  next_due: string;
  category: string;
}

interface RecurringListProps {
  items: RecurringItem[];
  itemsMonth?: RecurringItem[];
  currency: string;
  onChanged?: () => void;
}

function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$', INR: '₹', GBP: '£', EUR: '€', CAD: 'C$', AUD: 'A$',
  };
  return symbols[currency] || '$';
}

function fmt(cents: number, currency: string): string {
  return `${getCurrencySymbol(currency)}${(Math.abs(cents) / 100).toFixed(2)}`;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function RecurringList({ items, itemsMonth, currency, onChanged }: RecurringListProps) {
  const [view, setView] = useState<'week' | 'month'>('week');
  const [confirmingCancelId, setConfirmingCancelId] = useState<number | null>(null);
  const monthList = itemsMonth ?? items;
  const visible = view === 'week' ? items : monthList;

  const handleCancel = async (id: number) => {
    await fetch(`/api/recurring/${id}`, { method: 'DELETE' });
    setConfirmingCancelId(null);
    onChanged?.();
  };

  return (
    <div className="bg-white dark:bg-[#1a1a2e] rounded-2xl p-5 border border-[#e8e8f0] dark:border-[#2a2a40]">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-500" />
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Upcoming Bills</h2>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-[#e8e8f0] dark:border-[#2a2a40]">
          <button
            type="button"
            onClick={() => setView('week')}
            className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
              view === 'week'
                ? 'bg-fin-600 text-white'
                : 'bg-white dark:bg-[#1a1a2e] text-gray-600 dark:text-gray-300 hover:bg-fin-50 dark:hover:bg-[#2a2a40]'
            }`}
          >
            7 days ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setView('month')}
            className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
              view === 'month'
                ? 'bg-fin-600 text-white'
                : 'bg-white dark:bg-[#1a1a2e] text-gray-600 dark:text-gray-300 hover:bg-fin-50 dark:hover:bg-[#2a2a40]'
            }`}
          >
            This month ({monthList.length})
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-slate-400">
          {view === 'week'
            ? 'No bills due in the next 7 days.'
            : 'No bills due this month. Try: "Netflix subscription $15.99 monthly due on the 15th"'}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map(item => {
            const days = daysUntil(item.next_due);
            const isUrgent = days <= 2;
            return (
              <div
                key={item.id}
                className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-700 last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isUrgent && <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{item.name}</p>
                    <p className="text-xs text-slate-400">
                      {days < 0
                        ? `Overdue ${-days}d`
                        : days === 0
                        ? 'Due today'
                        : days === 1
                        ? 'Due tomorrow'
                        : `Due in ${days} days`}
                      {' · '}
                      {item.frequency}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{fmt(item.amount, currency)}</span>
                  {confirmingCancelId === item.id ? (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Cancel this?</span>
                      <button
                        onClick={() => handleCancel(item.id)}
                        className="font-medium text-red-500 hover:text-red-600"
                      >
                        Yes
                      </button>
                      <span className="text-slate-300 dark:text-slate-600">/</span>
                      <button
                        onClick={() => setConfirmingCancelId(null)}
                        className="font-medium text-slate-400 hover:text-slate-500"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingCancelId(item.id)}
                      className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors"
                      aria-label={`Cancel ${item.name}`}
                      title="Cancel subscription"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
