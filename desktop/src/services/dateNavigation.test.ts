import { describe, expect, it } from 'vitest';
import { navigateDate } from './dateNavigation';

describe('date navigation', () => {
  it('moves the visible window forward when selecting the day after the last visible date', () => {
    const result = navigateDate({
      direction: 1,
      selectedDate: '2026-06-17',
      visibleStartDate: '2026-06-16',
      visibleDays: 2,
    });

    expect(result.selectedDate).toBe('2026-06-18');
    expect(result.visibleStartDate).toBe('2026-06-17');
    expect(result.visibleDates).toEqual(['2026-06-17', '2026-06-18']);
  });

  it('moves the visible window backward when selecting the day before the first visible date', () => {
    const result = navigateDate({
      direction: -1,
      selectedDate: '2026-06-16',
      visibleStartDate: '2026-06-16',
      visibleDays: 2,
    });

    expect(result.selectedDate).toBe('2026-06-15');
    expect(result.visibleStartDate).toBe('2026-06-15');
    expect(result.visibleDates).toEqual(['2026-06-15', '2026-06-16']);
  });

  it('keeps the window fixed when the next selected date is already visible', () => {
    const result = navigateDate({
      direction: 1,
      selectedDate: '2026-06-16',
      visibleStartDate: '2026-06-16',
      visibleDays: 3,
    });

    expect(result.selectedDate).toBe('2026-06-17');
    expect(result.visibleStartDate).toBe('2026-06-16');
    expect(result.visibleDates).toEqual(['2026-06-16', '2026-06-17', '2026-06-18']);
  });
});
