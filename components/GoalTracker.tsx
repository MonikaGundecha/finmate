import { Target } from 'lucide-react';

interface Goal {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline?: string | null;
}

interface GoalTrackerProps {
  goals: Goal[];
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

function getProgressColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500';
  if (pct >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function getProgressTextColor(pct: number): string {
  if (pct >= 80) return 'text-green-600 dark:text-green-400';
  if (pct >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-500 dark:text-red-400';
}

export default function GoalTracker({ goals, currency }: GoalTrackerProps) {
  if (!goals.length) {
    return (
      <div className="bg-white dark:bg-[#1a1a2e] rounded-2xl p-5 border border-[#e8e8f0] dark:border-[#2a2a40]">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Goals</h2>
        <p className="text-sm text-slate-400">
          No goals yet. Try: &quot;I want to save $5000 for a vacation by December&quot;
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#1a1a2e] rounded-2xl p-5 border border-[#e8e8f0] dark:border-[#2a2a40]">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4 text-fin-500" />
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Goals</h2>
      </div>
      <div className="space-y-4">
        {goals.map(goal => {
          const pct = goal.target_amount > 0
            ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100))
            : 0;
          return (
            <div key={goal.id}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-slate-700 dark:text-slate-200 font-medium">{goal.name}</span>
                <span className={`text-xs font-semibold ${getProgressTextColor(pct)}`}>{pct}%</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${getProgressColor(pct)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-slate-400">{fmt(goal.current_amount, currency)} saved</span>
                <span className="text-xs text-slate-400">target: {fmt(goal.target_amount, currency)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
