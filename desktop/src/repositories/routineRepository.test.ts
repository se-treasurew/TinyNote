import { describe, expect, it } from 'vitest';
import { routineToUpdateParams } from './routineRepository';
import type { Routine } from '../types/routine';

const routine: Routine = {
  id: 'routine-1',
  userId: null,
  title: '喝水',
  description: '每日',
  routineType: 'daily',
  startDate: '2026-06-16',
  endDate: null,
  repeatRule: 'daily',
  activeDays: null,
  isEnabled: false,
  progressMode: 'daily_instance',
  createdAt: '2026-06-16T00:00:00.000Z',
  updatedAt: '2026-06-16T02:00:00.000Z',
  deletedAt: '2026-06-16T02:00:00.000Z',
  syncStatus: 'pending',
  version: 3,
};

describe('routine repository parameter mapping', () => {
  it('maps update parameters to the placeholders used by UPDATE routines', () => {
    expect(routineToUpdateParams(routine)).toEqual([
      'routine-1',
      null,
      '喝水',
      '每日',
      'daily',
      '2026-06-16',
      null,
      'daily',
      null,
      0,
      'daily_instance',
      '2026-06-16T02:00:00.000Z',
      '2026-06-16T02:00:00.000Z',
      'pending',
      3,
    ]);
  });
});
