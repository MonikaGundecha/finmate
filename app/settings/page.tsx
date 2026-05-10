'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Moon, Save, Sun } from 'lucide-react';
import { getTheme, setTheme, Theme } from '@/lib/theme';

const CURRENCIES = [
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'INR', label: 'Indian Rupee (₹)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'CAD', label: 'Canadian Dollar (C$)' },
  { code: 'AUD', label: 'Australian Dollar (A$)' },
];

const inputClass =
  'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

interface Form {
  name: string;
  currency: string;
  opening_savings: string;
  opening_checking: string;
  opening_cash: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [theme, setThemeState] = useState<Theme>('light');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<Form>({
    name: '',
    currency: 'USD',
    opening_savings: '',
    opening_checking: '',
    opening_cash: '',
  });

  useEffect(() => {
    setThemeState(getTheme());
    fetch('/api/settings')
      .then(r => r.json())
      .then((data: Record<string, string>) => {
        const cents = (raw: string | undefined) =>
          raw && raw !== '0' ? (parseInt(raw, 10) / 100).toString() : '';
        setForm({
          name: data.name || '',
          currency: data.currency || 'USD',
          opening_savings: cents(data.opening_savings),
          opening_checking: cents(data.opening_checking),
          opening_cash: cents(data.opening_cash),
        });
      });
  }, []);

  const handleThemeToggle = () => {
    const newTheme: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    setThemeState(newTheme);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          currency: form.currency,
          opening_savings: String(Math.round(parseFloat(form.opening_savings || '0') * 100)),
          opening_checking: String(Math.round(parseFloat(form.opening_checking || '0') * 100)),
          opening_cash: String(Math.round(parseFloat(form.opening_cash || '0') * 100)),
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 md:p-6">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push('/')}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </button>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Settings</h1>
        </div>

        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Appearance</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-700 dark:text-slate-200">Theme</p>
                <p className="text-xs text-slate-400">{theme === 'dark' ? 'Dark mode on' : 'Light mode on'}</p>
              </div>
              <button
                onClick={handleThemeToggle}
                className={`relative w-12 h-6 rounded-full transition-colors ${theme === 'dark' ? 'bg-blue-600' : 'bg-slate-200'}`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform flex items-center justify-center ${
                    theme === 'dark' ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                >
                  {theme === 'dark' ? (
                    <Moon className="w-3 h-3 text-blue-600" />
                  ) : (
                    <Sun className="w-3 h-3 text-amber-500" />
                  )}
                </div>
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Profile</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Your name</label>
                <input
                  type="text"
                  placeholder="e.g. Monika"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Currency</label>
                <select
                  value={form.currency}
                  onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                  className={inputClass}
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Opening Balances</h2>
            <p className="text-xs text-slate-400 mb-4">
              Enter money you already had before using FinMate. This sets your starting net worth.
            </p>
            <div className="space-y-3">
              {(
                [
                  { key: 'opening_savings', label: 'Savings account' },
                  { key: 'opening_checking', label: 'Checking account' },
                  { key: 'opening_cash', label: 'Cash on hand' },
                ] as const
              ).map(field => (
                <div key={field.key}>
                  <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">{field.label}</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={form[field.key]}
                    onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
