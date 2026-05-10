export const toDollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
export const toCents = (dollars: number): number => Math.round(dollars * 100);

export function formatMonth(ym: string): string {
  const [year, month] = ym.split('-');
  return new Date(parseInt(year, 10), parseInt(month, 10) - 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
