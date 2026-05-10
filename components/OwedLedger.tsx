'use client';

import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check } from 'lucide-react';

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

interface OwedLedgerProps {
  items: OwedItem[];
  settledItems: OwedItem[];
  onSettled: () => void;
  currency: string;
}

function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$', INR: '₹', GBP: '£', EUR: '€', CAD: 'C$', AUD: 'A$',
  };
  return symbols[currency] || '$';
}

function formatAmount(cents: number, currency: string): string {
  return `${getCurrencySymbol(currency)}${(cents / 100).toFixed(2)}`;
}

export default function OwedLedger({ items, settledItems, onSettled, currency }: OwedLedgerProps) {
  const [tab, setTab] = useState<'active' | 'settled'>('active');
  const [settling, setSettling] = useState<number | null>(null);
  const [pendingSettle, setPendingSettle] = useState<{
    id: number;
    person: string;
    suggested: string;
    categories: string[];
  } | null>(null);

  const activeItems = items.filter(i => !i.settled);
  const iOwe = activeItems.filter(i => i.direction === 'i_owe');
  const theyOwe = activeItems.filter(i => i.direction === 'they_owe');
  const totalIOwe = iOwe.reduce((sum, i) => sum + i.amount, 0);
  const totalTheyOwe = theyOwe.reduce((sum, i) => sum + i.amount, 0);

  const handleSettle = async (id: number, person: string) => {
    setSettling(id);
    try {
      const res = await fetch(`/api/owed/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (data.needs_confirmation) {
        setPendingSettle({
          id,
          person,
          suggested: data.suggested_category,
          categories: data.categories || [],
        });
      } else {
        onSettled();
      }
    } finally {
      setSettling(null);
    }
  };

  const confirmSettle = async (id: number, category: string) => {
    setSettling(id);
    try {
      await fetch(`/api/owed/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed_category: category }),
      });
      setPendingSettle(null);
      onSettled();
    } finally {
      setSettling(null);
    }
  };

  return (
    <div className="bg-white dark:bg-[#1a1a2e] rounded-2xl p-4 border border-[#e8e8f0] dark:border-[#2a2a40]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Owed</h2>
        <div className="flex rounded-lg overflow-hidden border border-[#e8e8f0] dark:border-[#2a2a40]">
          {(['active', 'settled'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                tab === t
                  ? 'bg-fin-600 text-white'
                  : 'bg-white dark:bg-[#1a1a2e] text-gray-600 dark:text-gray-300 hover:bg-fin-50 dark:hover:bg-[#2a2a40]'
              }`}
            >
              {t === 'active' ? 'Active' : 'History'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'active' ? (
        <div className="space-y-3">
          {pendingSettle && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-2">
                What category should the payment to {pendingSettle.person} go under?
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {pendingSettle.categories.map(cat => {
                  const isSuggested = cat === pendingSettle.suggested;
                  return (
                    <button
                      key={cat}
                      onClick={() => confirmSettle(pendingSettle.id, cat)}
                      disabled={settling === pendingSettle.id}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                        isSuggested
                          ? 'bg-fin-600 text-white'
                          : 'bg-white dark:bg-[#1a1a2e] border border-[#e8e8f0] dark:border-[#2a2a40] text-gray-700 dark:text-gray-300 hover:border-fin-400'
                      }`}
                    >
                      {isSuggested ? `✓ ${cat}` : cat}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setPendingSettle(null)}
                className="text-[11px] text-slate-400 hover:text-slate-600"
              >
                Cancel
              </button>
            </div>
          )}
          {!activeItems.length ? (
            <p className="text-xs text-slate-400">
              No outstanding debts. Try: &quot;John owes me $50 for dinner&quot;
            </p>
          ) : (
            <>
              {theyOwe.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-[#009988] uppercase tracking-wide">
                      They owe you
                    </p>
                    <p className="text-xs font-bold text-[#009988]">
                      +{formatAmount(totalTheyOwe, currency)}
                    </p>
                  </div>
                  {theyOwe.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-700 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <ArrowDownLeft className="w-3.5 h-3.5 text-[#009988] shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.person}</p>
                          {item.reason && <p className="text-xs text-slate-400">{item.reason}</p>}
                          {item.due_date && <p className="text-xs text-amber-500">Due {item.due_date}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#009988]">
                          +{formatAmount(item.amount, currency)}
                        </span>
                        <button
                          onClick={() => handleSettle(item.id, item.person)}
                          disabled={settling === item.id}
                          className="p-1.5 rounded-lg hover:bg-[#e6f7f4] dark:hover:bg-[#012a26] text-slate-300 hover:text-[#009988] transition-colors"
                          title="Mark settled"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {iOwe.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-[#cc3311] uppercase tracking-wide">You owe</p>
                    <p className="text-xs font-bold text-[#cc3311]">-{formatAmount(totalIOwe, currency)}</p>
                  </div>
                  {iOwe.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-700 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <ArrowUpRight className="w-3.5 h-3.5 text-[#cc3311] shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.person}</p>
                          {item.reason && <p className="text-xs text-slate-400">{item.reason}</p>}
                          {item.due_date && <p className="text-xs text-amber-500">Due {item.due_date}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#cc3311]">
                          -{formatAmount(item.amount, currency)}
                        </span>
                        <button
                          onClick={() => handleSettle(item.id, item.person)}
                          disabled={settling === item.id}
                          className="p-1.5 rounded-lg hover:bg-[#fdeae6] dark:hover:bg-[#3a0d05] text-slate-300 hover:text-[#cc3311] transition-colors"
                          title="Mark settled"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {!settledItems.length ? (
            <p className="text-xs text-slate-400">No settled debts yet.</p>
          ) : (
            settledItems.map(item => (
              <div
                key={item.id}
                className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-700 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{item.person}</p>
                    {item.reason && <p className="text-xs text-slate-400">{item.reason}</p>}
                    {item.settled_at && (
                      <p className="text-xs text-slate-300 dark:text-slate-500">
                        Settled {new Date(item.settled_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-sm font-medium text-slate-400">
                  {item.direction === 'i_owe' ? '-' : '+'}
                  {formatAmount(item.amount, currency)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
