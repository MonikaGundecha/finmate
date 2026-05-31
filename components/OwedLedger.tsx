'use client';

import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, ChevronRight } from 'lucide-react';

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

interface PersonGroup {
  key: string;
  displayName: string;
  theyOweTotal: number;
  iOweTotal: number;
  net: number;
  entries: OwedItem[];
}

export default function OwedLedger({ items, settledItems, onSettled, currency }: OwedLedgerProps) {
  const [tab, setTab] = useState<'active' | 'settled'>('active');
  const [settling, setSettling] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingSettle, setPendingSettle] = useState<{
    id: number;
    person: string;
    suggested: string;
    categories: string[];
  } | null>(null);

  const activeItems = items.filter(i => !i.settled);

  const groups: PersonGroup[] = [];
  const groupMap = new Map<string, PersonGroup>();
  for (const item of activeItems) {
    const key = item.person.toLowerCase().trim();
    let g = groupMap.get(key);
    if (!g) {
      g = {
        key,
        displayName: item.person.trim(),
        theyOweTotal: 0,
        iOweTotal: 0,
        net: 0,
        entries: [],
      };
      groupMap.set(key, g);
      groups.push(g);
    }
    if (item.direction === 'they_owe') g.theyOweTotal += item.amount;
    else g.iOweTotal += item.amount;
    g.entries.push(item);
  }
  for (const g of groups) g.net = g.theyOweTotal - g.iOweTotal;

  const toggleExpanded = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
            <div className="space-y-1">
              {groups.map(g => {
                const isOpen = expanded.has(g.key);
                const netColor =
                  g.net > 0 ? 'text-[#009988]' : g.net < 0 ? 'text-[#cc3311]' : 'text-slate-400';
                const summary =
                  g.net > 0
                    ? `${g.displayName} owes you ${formatAmount(g.net, currency)}`
                    : g.net < 0
                    ? `You owe ${g.displayName} ${formatAmount(Math.abs(g.net), currency)}`
                    : `You're even with ${g.displayName}`;
                return (
                  <div key={g.key} className="border-b border-slate-50 dark:border-slate-700 last:border-0">
                    <div className="flex items-center justify-between py-2">
                      <p className={`text-sm font-medium ${netColor}`}>{summary}</p>
                      <button
                        type="button"
                        onClick={() => toggleExpanded(g.key)}
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        aria-expanded={isOpen}
                      >
                        details
                        {isOpen ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    {isOpen && (
                      <div className="pb-2 pl-2 space-y-1">
                        {g.entries.map(item => {
                          const isTheyOwe = item.direction === 'they_owe';
                          return (
                            <div
                              key={item.id}
                              className="flex items-center justify-between py-1.5"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {isTheyOwe ? (
                                  <ArrowDownLeft className="w-3.5 h-3.5 text-[#009988] shrink-0" />
                                ) : (
                                  <ArrowUpRight className="w-3.5 h-3.5 text-[#cc3311] shrink-0" />
                                )}
                                <div className="min-w-0">
                                  {item.reason && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                      {item.reason}
                                    </p>
                                  )}
                                  {item.due_date && (
                                    <p className="text-[11px] text-amber-500">Due {item.due_date}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className={`text-xs font-semibold ${
                                    isTheyOwe ? 'text-[#009988]' : 'text-[#cc3311]'
                                  }`}
                                >
                                  {isTheyOwe ? '+' : '-'}
                                  {formatAmount(item.amount, currency)}
                                </span>
                                <button
                                  onClick={() => handleSettle(item.id, item.person)}
                                  disabled={settling === item.id}
                                  className={`p-1 rounded-lg transition-colors text-slate-300 ${
                                    isTheyOwe
                                      ? 'hover:bg-[#e6f7f4] dark:hover:bg-[#012a26] hover:text-[#009988]'
                                      : 'hover:bg-[#fdeae6] dark:hover:bg-[#3a0d05] hover:text-[#cc3311]'
                                  }`}
                                  title="Mark settled"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
