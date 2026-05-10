export default function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        width="34"
        height="34"
        viewBox="0 0 34 34"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="finGrad" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
        <rect width="34" height="34" rx="10" fill="url(#finGrad)" />
        <circle cx="17" cy="17" r="9" stroke="white" strokeWidth="2" fill="none" />
        <path
          d="M17 12v10M14.5 14.5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5c0 2.5-5 2.5-5 5 0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <div>
        <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Fin</span>
        <span className="text-xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">Mate</span>
      </div>
    </div>
  );
}
