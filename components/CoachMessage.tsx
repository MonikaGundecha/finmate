'use client';

import { Sparkles, X } from 'lucide-react';

interface CoachNudge {
  id: number;
  message: string;
  trigger?: string | null;
}

interface CoachMessageProps {
  nudges: CoachNudge[];
  onDismissed: () => void;
  userName?: string;
}

export default function CoachMessage({ nudges, onDismissed, userName = 'there' }: CoachMessageProps) {
  const handleDismiss = async (id: number) => {
    await fetch(`/api/coach/${id}`, { method: 'PATCH' });
    onDismissed();
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-5 border border-blue-100 dark:border-blue-800">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Fin says</h2>
        </div>
      </div>

      {!nudges.length ? (
        <p className="text-sm text-slate-400">
          Hey {userName}! Personalized insights about your spending will show up here.
        </p>
      ) : (
        <div className="space-y-3">
          {nudges.slice(0, 3).map(nudge => (
            <div key={nudge.id} className="flex items-start gap-3">
              <p className="flex-1 text-sm text-slate-700 dark:text-slate-200">{nudge.message}</p>
              <button
                onClick={() => handleDismiss(nudge.id)}
                className="p-1 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 text-slate-300 hover:text-slate-500 transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
