const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

export function todayIsoDate(date = new Date()): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

export function getVisibleDateRange(startDate: string, days: number): string[] {
  return Array.from({ length: Math.max(days, 0) }, (_, index) => addDays(startDate, index));
}

export function isDateInRange(date: string, startDate: string, endDate?: string | null): boolean {
  return date >= startDate && (!endDate || date <= endDate);
}

export function formatChineseDate(isoDate: string): string {
  const date = parseIsoDate(isoDate);
  const weekday = WEEKDAYS[date.getUTCDay()];
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${weekday}`;
}

export function formatShortDate(isoDate: string): string {
  const date = parseIsoDate(isoDate);
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

export function compareIsoDate(a: string, b: string): number {
  return a.localeCompare(b);
}

function parseIsoDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
