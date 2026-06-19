import { describe, expect, it, vi } from 'vitest';
import { buildTaskOccurrences, clampProgressPercent } from './taskOccurrence';
import type { Task, TaskPostponement, TaskProgressEntry } from '../types/task';

vi.mock('../utils/date', () => ({
  todayIsoDate: () => '2026-06-17',
}));

const baseTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  userId: null,
  deviceId: 'device-a',
  title: '写计划',
  content: null,
  taskDate: '2026-06-16',
  endDate: null,
  status: 'active',
  priority: 'none',
  sourceType: 'manual',
  routineId: null,
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
  ...overrides,
});

const progressEntry = (overrides: Partial<TaskProgressEntry> = {}): TaskProgressEntry => ({
  id: 'progress-1',
  taskId: 'task-1',
  progressDate: '2026-06-16',
  percent: 0,
  status: 'active',
  completedAt: null,
  archivedAt: null,
  deletedAt: null,
  createdAt: '2026-06-16T00:00:00.000Z',
  updatedAt: '2026-06-16T00:00:00.000Z',
  syncStatus: 'local',
  version: 1,
  ...overrides,
});

const postponement = (overrides: Partial<TaskPostponement> = {}): TaskPostponement => ({
  id: 'postpone-1',
  taskId: 'task-1',
  fromDate: '2026-06-16',
  toDate: '2026-06-17',
  createdAt: '2026-06-16T01:00:00.000Z',
  updatedAt: '2026-06-16T01:00:00.000Z',
  deletedAt: null,
  syncStatus: 'local',
  version: 1,
  ...overrides,
});

describe('task occurrences', () => {
  it('shows daily tasks on future dates and resets progress each day', () => {
    const task = baseTask({ sourceType: 'daily', taskDate: '2026-06-16', endDate: null });
    const occurrences = buildTaskOccurrences({
      tasks: [task],
      progressEntries: [progressEntry({ progressDate: '2026-06-16', percent: 80 })],
      postponements: [],
      visibleDates: ['2026-06-16', '2026-06-17', '2026-06-18'],
    });

    expect(occurrences.map((item) => item.taskDate)).toEqual(['2026-06-16', '2026-06-17', '2026-06-18']);
    expect(occurrences.map((item) => item.progressPercent)).toEqual([80, 0, 0]);
    expect(occurrences.every((item) => item.id === task.id)).toBe(true);
  });

  it('shows multi-day tasks only inside the date range', () => {
    const task = baseTask({ sourceType: 'multi_day', taskDate: '2026-06-16', endDate: '2026-06-18' });

    const withoutCarry = buildTaskOccurrences({
      tasks: [task],
      progressEntries: [progressEntry({ progressDate: '2026-06-16', percent: 35 })],
      postponements: [],
      visibleDates: ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19'],
    });
    // today is 2026-06-17: 06-16 inherits (past), 06-17 inherits (today),
    // 06-18 is future -> no carry -> 0.
    expect(withoutCarry.map((item) => [item.taskDate, item.progressPercent])).toEqual([
      ['2026-06-16', 35],
      ['2026-06-17', 35],
      ['2026-06-18', 0],
    ]);
  });

  it('carries multi-day progress forward while direct entries override inherited progress', () => {
    const task = baseTask({ sourceType: 'multi_day', taskDate: '2026-06-16', endDate: '2026-06-19' });

    const occurrences = buildTaskOccurrences({
      tasks: [task],
      progressEntries: [
        progressEntry({ id: 'progress-1', progressDate: '2026-06-16', percent: 35 }),
        progressEntry({ id: 'progress-2', progressDate: '2026-06-18', percent: 60 }),
      ],
      postponements: [],
      visibleDates: ['2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19'],
    });
    // today is 2026-06-17: 06-16 direct 35, 06-17 inherits 35 (today),
    // 06-18 direct 60, 06-19 is future -> no carry -> 0.
    expect(occurrences.map((item) => [item.taskDate, item.progressPercent])).toEqual([
      ['2026-06-16', 35],
      ['2026-06-17', 35],
      ['2026-06-18', 60],
      ['2026-06-19', 0],
    ]);
  });

  it('manual tasks show only on their own date', () => {
    const task = baseTask({ sourceType: 'manual', taskDate: '2026-06-16' });
    const entries = [progressEntry({ progressDate: '2026-06-16', percent: 20 })];

    const occurrences = buildTaskOccurrences({
      tasks: [task],
      progressEntries: entries,
      postponements: [],
      visibleDates: ['2026-06-16', '2026-06-17'],
    });
    expect(occurrences.map((item) => item.taskDate)).toEqual(['2026-06-16']);
    expect(occurrences[0].progressPercent).toBe(20);
  });

  it('keeps a manual task on its original date and adds the postponed target date', () => {
    const task = baseTask({
      sourceType: 'manual',
      taskDate: '2026-06-16',
      postponedAt: '2026-06-16T01:00:00.000Z',
    });

    const occurrences = buildTaskOccurrences({
      tasks: [task],
      progressEntries: [progressEntry({ progressDate: '2026-06-17', percent: 25 })],
      postponements: [postponement({ fromDate: '2026-06-16', toDate: '2026-06-17' })],
      visibleDates: ['2026-06-16', '2026-06-17'],
    });

    expect(occurrences.map((item) => [item.taskDate, item.postponedFromDate, item.postponedToDate])).toEqual([
      ['2026-06-16', '2026-06-16', '2026-06-17'],
      ['2026-06-17', '2026-06-16', '2026-06-17'],
    ]);
    expect(occurrences[1].postponementId).toBe('postpone-1');
    expect(occurrences[1].postponementHistory).toHaveLength(1);
    expect(occurrences[1].progressPercent).toBe(25);
  });

  it('removes the postponed target occurrence after its history is soft-deleted', () => {
    const task = baseTask({ sourceType: 'manual', taskDate: '2026-06-16', postponedAt: null });
    const occurrences = buildTaskOccurrences({
      tasks: [task],
      progressEntries: [progressEntry({ progressDate: '2026-06-17', percent: 25 })],
      postponements: [postponement({
        fromDate: '2026-06-16',
        toDate: '2026-06-17',
        deletedAt: '2026-06-19T00:00:00.000Z',
      })],
      visibleDates: ['2026-06-16', '2026-06-17'],
    });

    expect(occurrences.map((item) => item.taskDate)).toEqual(['2026-06-16']);
  });

  it('uses per-date completion for recurring task occurrences', () => {
    const task = baseTask({ sourceType: 'daily', taskDate: '2026-06-16' });
    const occurrences = buildTaskOccurrences({
      tasks: [task],
      progressEntries: [progressEntry({ progressDate: '2026-06-17', status: 'completed', percent: 100 })],
      postponements: [],
      visibleDates: ['2026-06-16', '2026-06-17'],
    });

    expect(occurrences.map((item) => [item.taskDate, item.status, item.progressPercent])).toEqual([
      ['2026-06-16', 'active', 0],
      ['2026-06-17', 'completed', 100],
    ]);
  });

  it('clamps progress to the supported percentage range', () => {
    expect(clampProgressPercent(-10)).toBe(0);
    expect(clampProgressPercent(45.8)).toBe(46);
    expect(clampProgressPercent(160)).toBe(100);
  });
});
