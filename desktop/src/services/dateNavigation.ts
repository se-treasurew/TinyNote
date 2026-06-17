import { addDays, getVisibleDateRange } from '../utils/date';

export interface NavigateDateInput {
  direction: -1 | 1;
  selectedDate: string;
  visibleStartDate: string;
  visibleDays: number;
}

export interface DateWindowResult {
  selectedDate: string;
  visibleStartDate: string;
  visibleDates: string[];
}

export function navigateDate(input: NavigateDateInput): DateWindowResult {
  const selectedDate = addDays(input.selectedDate, input.direction);
  const currentVisibleDates = getVisibleDateRange(input.visibleStartDate, input.visibleDays);
  const firstVisibleDate = currentVisibleDates[0] ?? input.visibleStartDate;
  const lastVisibleDate = currentVisibleDates[currentVisibleDates.length - 1] ?? input.visibleStartDate;
  let visibleStartDate = input.visibleStartDate;

  if (selectedDate < firstVisibleDate) {
    visibleStartDate = addDays(input.visibleStartDate, -1);
  }

  if (selectedDate > lastVisibleDate) {
    visibleStartDate = addDays(input.visibleStartDate, 1);
  }

  return {
    selectedDate,
    visibleStartDate,
    visibleDates: getVisibleDateRange(visibleStartDate, input.visibleDays),
  };
}

export function resolveVisibleStartForDate(
  date: string,
  visibleStartDate: string,
  visibleDays: number,
): string {
  const visibleDates = getVisibleDateRange(visibleStartDate, visibleDays);

  if (visibleDates.includes(date)) {
    return visibleStartDate;
  }

  return date;
}
