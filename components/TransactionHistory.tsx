'use client';

import { useEffect, useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';

interface TransactionHistoryProps {
  currency: string;
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

const CATEGORIES = [
  'All', 'Housing', 'Utilities', 'Groceries', 'Dining', 'Transport', 'Health',
  'Insurance', 'Entertainment', 'Shopping', 'Personal Care', 'Education',
  'Travel', 'Subscriptions', 'Savings', 'Investment', 'Income', 'Transfer',
  'Debt Payment', 'Other',
];

function getLastNMonths(n: number): string[] {
  const months: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  return months;
}

interface Transaction {
  id: number;
  date: string;
  description: string;
  amount: number;
  type: 'expense' | 'income' | 'transfer';
  category: string;
  merchant?: string | null;
}

export default function TransactionHistory({ currency }: TransactionHistoryProps) {
  const months = getLastNMonths(6);
  const [selectedMonth, setSelectedMonth] = useState(months[0]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<Transaction>>({});

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ month: selectedMonth });
        if (selectedCategory !== 'All') params.set('category', selectedCategory);
        const res = await fetch(`/api/transactions?${params}`);
        const data = await res.json();
        if (active) setTransactions(data.transactions || []);
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [selectedMonth, selectedCategory]);

  const refetch = async () => {
    const params = new URLSearchParams({ month: selectedMonth });
    if (selectedCategory !== 'All') params.set('category', selectedCategory);
    const res = await fetch(`/api/transactions?${params}`);
    const data = await res.json();
    setTransactions(data.transactions || []);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this transaction?')) return;
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    refetch();
  };

  const startEdit = (t: Transaction) => {
    setEditingId(t.id);
    setEditValues({ description: t.description, amount: t.amount, category: t.category });
  };

  const saveEdit = async (id: number) => {
    await fetch(`/api/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editValues),
    });
    setEditingId(null);
    refetch();
  };

  return (
    <div className="bg-white dark:bg-[#1a1a2e] rounded-2xl p-5 border border-[#e8e8f0] dark:border-[#2a2a40]">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Transaction History</h2>

      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
        >
          {months.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
        >
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : !transactions.length ? (
        <p className="text-sm text-slate-400">No transactions found.</p>
      ) : (
        <div className="space-y-1">
          {transactions.map(t => (
            <div key={t.id} className="group flex items-center gap-3 py-2.5 border-b border-slate-50 dark:border-slate-700 last:border-0">
              {editingId === t.id ? (
                <div className="flex-1 flex gap-2 items-center">
                  <input
                    value={editValues.description || ''}
                    onChange={e => setEditValues(v => ({ ...v, description: e.target.value }))}
                    className="flex-1 text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                  />
                  <input
                    type="number"
                    value={editValues.amount !== undefined ? (editValues.amount as number) / 100 : ''}
                    onChange={e =>
                      setEditValues(v => ({
                        ...v,
                        amount: Math.round(parseFloat(e.target.value) * 100),
                      }))
                    }
                    className="w-20 text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                  />
                  <button onClick={() => saveEdit(t.id)} className="text-green-500 hover:text-green-600">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{t.description}</p>
                    <p className="text-xs text-slate-400">{t.date} · {t.category}</p>
                  </div>
                  <span
                    className={`text-sm font-medium shrink-0 ${
                      t.type === 'income'
                        ? 'text-[#0077bb]'
                        : 'text-[#cc3311]'
                    }`}
                  >
                    {t.type === 'income' ? '+' : '-'}
                    {fmt(t.amount, currency)}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => startEdit(t)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleDelete(t.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
