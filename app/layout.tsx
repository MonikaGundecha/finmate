import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FinMate',
  description: 'Your personal AI finance companion',
};

const themeBootstrap = `(function(){try{var t=localStorage.getItem('finmate-theme')||'light';if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
        {children}
      </body>
    </html>
  );
}
