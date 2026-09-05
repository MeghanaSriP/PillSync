import { format, parseISO, isToday, isPast, differenceInDays } from 'date-fns';

export function fmtDate(date: string | Date | null, pattern = 'MMM d, yyyy'): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, pattern);
}

export function fmtTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return format(date, 'h:mm a');
}

export function fmtDateTime(date: string | Date | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy h:mm a');
}

export function isDateToday(date: string | Date): boolean {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return isToday(d);
}

export function isDatePast(date: string | Date): boolean {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return isPast(d);
}

export function daysUntil(date: string | Date | null): number | null {
  if (!date) return null;
  const d = typeof date === 'string' ? parseISO(date) : date;
  return differenceInDays(d, new Date());
}

export function relativeDays(n: number | null): string {
  if (n === null) return '—';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 0) return `In ${n} days`;
  return `${Math.abs(n)} days ago`;
}
