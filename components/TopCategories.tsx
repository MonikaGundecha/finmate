interface TopCategoriesProps {
  data: { category: string; total: number }[];
  currency: string;
}

function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$', INR: '₹', GBP: '£', EUR: '€', CAD: 'C$', AUD: 'A$',
  };
  return symbols[currency] || '$';
}

export default function TopCategories({ data, currency }: TopCategoriesProps) {
  const symbol = getCurrencySymbol(currency);
  const filtered = data.filter(d => d.total > 0);
  const top3 = filtered.slice(0, 3);
  const grandTotal = filtered.reduce((sum, d) => sum + d.total, 0) || 1;

  const colors = [
    { bar: 'bg-[#6366f1]', text: 'text-[#6366f1]' },
    { bar: 'bg-[#0077bb]', text: 'text-[#0077bb]' },
    { bar: 'bg-[#e69f00]', text: 'text-[#e69f00]' },
  ];

  return (
    <div className="rounded-2xl bg-white dark:bg-[#1a1a2e] border border-[#e8e8f0] dark:border-[#2a2a40] p-5 shadow-sm h-full">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Top Spenders</h2>
      {top3.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">No spending data yet</p>
      ) : (
        <div className="space-y-5">
          {top3.map((item, i) => {
            const pct = Math.round((item.total / grandTotal) * 100);
            return (
              <div key={item.category}>
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {item.category}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-xs font-semibold ${colors[i].text}`}>{pct}%</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {symbol}
                      {(item.total / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 dark:bg-[#2a2a40] rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full ${colors[i].bar} transition-all`}
                    style={{ width: `${Math.max(4, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
          {filtered.length > 3 && (
            <p className="text-xs text-slate-400 text-center">
              +{filtered.length - 3} more categor{filtered.length - 3 === 1 ? 'y' : 'ies'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
