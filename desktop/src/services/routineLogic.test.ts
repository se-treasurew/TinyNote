import { describe, expect, it } from 'vitest';
import { buildDailyRoutineInstances, buildMultiDayTaskDrafts } from './routineLogic';
import type { Routine } from '../types/routine';
import type { Task } from '../types/task';

const dailyRoutine = (overrides: Partial<Routine> = {}): Routine => ({
  id: 'routine-1',
  userId: null,
  title: '喝水',
  description: null,
  routineType: 'daily',
  startDate: '2026-06-16',
  endDate: null,
  repeatRule: 'daily',
  activeDays: null,
  isEnabled: true,
  progressMode: 'daily_instance',
  createdAt: '2026-06-16T00:00:00.000Z',
  updatedAt: '2026-06-16T00:00:00.000Z',
  deletedAt: null,
  syncStatus: 'local',
  version: 1,
  ...overrides,
});

const existingTask = (date: string): Task => ({
  id: `task-${date}`,
  userId: null,
  deviceId: 'device-a',
  title: '喝水',
  content: null,
  taskDate: date,
  endDate: null,
  status: 'active',
  priority: 'none',
  sourceType: 'daily',
  routineId: 'routine-1',
  parentTaskId: null,
  sortOrder: 0,
  completedAt: null,
  archivedAt: null,
  deletedAt: null,
  postponedAt: null,
  createdAt: '2026-06-16T00:00:00.000Z',
  updatedAt: '2026-06-16T00:00:00.000Z',
  syncStatus: 'local',
  version: 1,
});

describe('routine generation logic', () => {
  it('generates daily routine instances only for visible dates in range', () => {
    const drafts = buildDailyRoutineInstances({
      routines: [dailyRoutine({ startDate: '2026-06-17', endDate: '2026-06-18' })],
      visibleDates: ['2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19'],
      existingTasks: [],
      now: '2026-06-16T01:00:00.000Z',
      deviceId: 'device-a',
    });

    expect(drafts.map((draft) => draft.taskDate)).toEqual(['2026-06-17', '2026-06-18']);
    expect(drafts.every((draft) => draft.sourceType === 'daily')).toBe(true);
  });

  it('does not duplicate an existing routine instance for the same date', () => {
    const drafts = buildDailyRoutineInstances({
      routines: [dailyRoutine()],
      visibleDates: ['2026-06-16', '2026-06-17'],
      existingTasks: [existingTask('2026-06-16')],
      now: '2026-06-16T01:00:00.000Z',
      deviceId: 'device-a',
    });

    expect(drafts.map((draft) => draft.taskDate)).toEqual(['2026-06-17']);
  });

  it('builds one multi-day task draft per date in the range', () => {
    const drafts = buildMultiDayTaskDrafts({
      title: '写论文',
      content: '每天推进一点',
      startDate: '2026-06-16',
      endDate: '2026-06-18',
      routineId: 'routine-multi',
      deviceId: 'device-a',
      now: '2026-06-16T01:00:00.000Z',
    });

    expect(drafts.map((draft) => draft.taskDate)).toEqual([
      '2026-06-16',
      '2026-06-17',
      '2026-06-18',
    ]);
    expect(drafts.every((draft) => draft.sourceType === 'multi_day')).toBe(true);
  });
});
