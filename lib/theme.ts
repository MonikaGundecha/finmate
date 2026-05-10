export type Theme = 'light' | 'dark';

export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return (localStorage.getItem('finmate-theme') as Theme) || 'light';
}

export function setTheme(theme: Theme): void {
  localStorage.setItem('finmate-theme', theme);
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function initTheme(): void {
  const theme = getTheme();
  setTheme(theme);
}
