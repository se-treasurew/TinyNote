import { describe, expect, it } from 'vitest';
import { addDays, formatChineseDate, getVisibleDateRange, isDateInRange, todayIsoDate } from './date';

describe('date utilities', () => {
  it('creates an inclusive visible date range from a start date', () => {
    expect(getVisibleDateRange('2026-06-16', 3)).toEqual([
      '2026-06-16',
      '2026-06-17',
      '2026-06-18',
    ]);
  });

  it('adds days without mutating the original date string', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01');
    expect(addDays('2026-06-30', -2)).toBe('2026-06-28');
  });

  it('checks open-ended and bounded date ranges', () => {
    expect(isDateInRange('2026-06-16', '2026-06-01')).toBe(true);
    expect(isDateInRange('2026-05-31', '2026-06-01')).toBe(false);
    expect(isDateInRange('2026-06-16', '2026-06-01', '2026-06-30')).toBe(true);
    expect(isDateInRange('2026-07-01', '2026-06-01', '2026-06-30')).toBe(false);
  });

  it('formats Chinese display dates with weekday', () => {
    expect(formatChineseDate('2026-06-16')).toBe('2026年6月16日 星期二');
  });

  it('returns today in ISO date format', () => {
    expect(todayIsoDate(new Date('2026-06-16T10:30:00+08:00'))).toBe('2026-06-16');
  });
});
