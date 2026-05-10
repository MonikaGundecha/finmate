'use client';

import { useRef, useState } from 'react';
import { CheckCircle, HelpCircle, Loader2, Send } from 'lucide-react';

interface InputBarProps {
  onSaved: () => void | Promise<void>;
  currency?: string;
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

interface ClarifyContext {
  question: string;
  original: string;
}

interface SavedTransaction {
  type: 'expense' | 'income' | 'transfer';
  description: string;
  amount: number;
  category: string;
}
interface SavedOwed {
  direction: 'i_owe' | 'they_owe';
  person: string;
  amount: number;
  reason?: string | null;
}
interface SavedRecurring {
  name: string;
  amount: number;
  frequency: string;
}
interface SavedGoal {
  name: string;
  target_amount: number;
}
interface SavedGoalContribution {
  matched: boolean;
  name?: string;
  amount?: number;
  current_amount?: number;
  target_amount?: number;
  message?: string;
}
interface SavedDeletion {
  deleted: boolean;
  name?: string;
  description?: string;
  amount?: number;
  remaining?: number;
  message?: string;
}
interface SavedBudget {
  amount: number;
  effective_from: string;
  applies_now: boolean;
}
interface SavedSettleOwed {
  settled: boolean;
  person?: string;
  amount?: number;
  direction?: 'i_owe' | 'they_owe';
  message?: string;
}
type SavedData =
  | SavedTransaction
  | SavedOwed
  | SavedRecurring
  | SavedGoal
  | SavedGoalContribution
  | SavedDeletion
  | SavedBudget
  | SavedSettleOwed;

type ResponseState =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'clarify'; question: string; context: ClarifyContext }
  | { type: 'saved'; dataType: string; data: SavedData }
  | { type: 'error'; message: string };

export default function InputBar({ onSaved, currency = 'USD' }: InputBarProps) {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState<ResponseState>({ type: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (message: string, context?: ClarifyContext) => {
    if (!message.trim()) return;
    setResponse({ type: 'loading' });

    try {
      const res = await fetch('/api/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, context }),
      });
      const data = await res.json();

      if (data.action === 'clarify') {
        setResponse({ type: 'clarify', question: data.question, context: data.context });
        setInput('');
      } else if (data.action === 'saved') {
        setResponse({ type: 'saved', dataType: data.type, data: data.data });
        setInput('');
        await Promise.resolve(onSaved());
        setTimeout(() => setResponse({ type: 'idle' }), 3000);
      } else {
        setResponse({ type: 'error', message: data.error || 'Unknown error' });
      }
    } catch (err) {
      setResponse({ type: 'error', message: err instanceof Error ? err.message : 'Network error' });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (response.type === 'clarify') {
      submit(input, response.context);
    } else {
      submit(input);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setResponse({ type: 'idle' });
      setInput('');
    }
  };

  const formatSavedMessage = (dataType: string, data: SavedData): string => {
    if (dataType === 'transaction') {
      const t = data as SavedTransaction;
      return `Logged ${t.type}: ${t.description} — ${fmt(t.amount, currency)} (${t.category})`;
    }
    if (dataType === 'owed') {
      const o = data as SavedOwed;
      const dir = o.direction === 'i_owe' ? 'You owe' : `${o.person} owes you`;
      return `${dir} ${fmt(o.amount, currency)}${o.reason ? ` for ${o.reason}` : ''}`;
    }
    if (dataType === 'recurring') {
      const r = data as SavedRecurring;
      return `Added recurring: ${r.name} — ${fmt(r.amount, currency)}/${r.frequency}`;
    }
    if (dataType === 'goal') {
      const g = data as SavedGoal;
      return `Goal created: ${g.name} — target ${fmt(g.target_amount, currency)}`;
    }
    if (dataType === 'goal_contribution') {
      const c = data as SavedGoalContribution;
      if (!c.matched) return c.message || `I couldn't find that goal.`;
      const pct = c.target_amount && c.target_amount > 0
        ? Math.round(((c.current_amount || 0) / c.target_amount) * 100)
        : 0;
      return `Added ${fmt(c.amount || 0, currency)} to "${c.name}" — now ${fmt(c.current_amount || 0, currency)} of ${fmt(c.target_amount || 0, currency)} (${pct}%)`;
    }
    if (dataType === 'delete_goal') {
      const d = data as SavedDeletion;
      if (!d.deleted) return d.message || `I couldn't find that goal.`;
      const tail = d.remaining && d.remaining > 0
        ? ` (${d.remaining} other goal${d.remaining > 1 ? 's' : ''} with similar name remain).`
        : '';
      return `Deleted goal "${d.name}".${tail}`;
    }
    if (dataType === 'delete_transaction') {
      const d = data as SavedDeletion;
      if (!d.deleted) return d.message || `I couldn't find that transaction.`;
      return `Deleted transaction "${d.description}" — ${fmt(d.amount || 0, currency)}`;
    }
    if (dataType === 'set_budget') {
      const b = data as SavedBudget;
      const dollars = `${getCurrencySymbol(currency)}${(b.amount / 100).toFixed(0)}`;
      return b.applies_now
        ? `Got it — monthly budget set to ${dollars}, starting now.`
        : `Got it — monthly budget set to ${dollars}, effective from ${b.effective_from} so past months aren't affected.`;
    }
    if (dataType === 'settle_owed') {
      const s = data as SavedSettleOwed;
      if (!s.settled) return s.message || `I couldn't find an unsettled debt to settle.`;
      const amt = fmt(s.amount || 0, currency);
      return s.direction === 'i_owe'
        ? `Done — paid ${s.person} ${amt} and marked the debt settled.`
        : `Done — ${s.person} paid you back ${amt}, marked settled.`;
    }
    return 'Saved!';
  };

  return (
    <div className="w-full space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              response.type === 'clarify'
                ? 'Answer the question above...'
                : 'Tell me about a transaction, bill, debt, or goal...'
            }
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-fin-500 text-sm"
            disabled={response.type === 'loading'}
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={response.type === 'loading' || !input.trim()}
          className="px-4 py-3 bg-fin-600 hover:bg-fin-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-xl transition-colors flex items-center gap-2 text-sm font-medium"
        >
          {response.type === 'loading' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </form>

      {response.type === 'clarify' && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <HelpCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">{response.question}</p>
        </div>
      )}

      {response.type === 'saved' && (
        <div className="flex items-center gap-3 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
          <p className="text-sm text-green-800 dark:text-green-200">
            {formatSavedMessage(response.dataType, response.data)}
          </p>
        </div>
      )}

      {response.type === 'error' && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <p className="text-sm text-red-700 dark:text-red-300">{response.message}</p>
        </div>
      )}
    </div>
  );
}
