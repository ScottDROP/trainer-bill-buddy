export function formatGBP(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(amount);
}

export function formatMonth(month: number, year: number): string {
  const date = new Date(year, month - 1);
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
