import { describe, expect, it } from 'vitest';
import { buildTaskOccurrences, clampProgressPercent } from './taskOccurrence';
import type { Task, TaskProgressEntry } from '../types/task';

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

describe('task occurrences', () => {
  it('shows daily tasks on future dates without generating task records and resets progress each day', () => {
    const task = baseTask({ sourceType: 'daily', taskDate: '2026-06-16', endDate: null });
    const occurrences = buildTaskOccurrences({
      tasks: [task],
      progressEntries: [progressEntry({ progressDate: '2026-06-16', percent: 80 })],
      visibleDates: ['2026-06-16', '2026-06-17', '2026-06-18'],
      carryProgressForward: true,
    });

    expect(occurrences.map((item) => item.taskDate)).toEqual(['2026-06-16', '2026-06-17', '2026-06-18']);
    expect(occurrences.map((item) => item.progressPercent)).toEqual([80, 0, 0]);
    expect(occurrences.every((item) => item.id === task.id)).toBe(true);
  });

  it('shows multi-day tasks only inside the date range and can carry progress forward', () => {
    const task = baseTask({ sourceType: 'multi_day', taskDate: '2026-06-16', endDate: '2026-06-18' });

    const withoutCarry = buildTaskOccurrences({
      tasks: [task],
      progressEntries: [progressEntry({ progressDate: '2026-06-16', percent: 35 })],
      visibleDates: ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19'],
      carryProgressForward: false,
    });
    expect(withoutCarry.map((item) => [item.taskDate, item.progressPercent])).toEqual([
      ['2026-06-16', 35],
      ['2026-06-17', 0],
      ['2026-06-18', 0],
    ]);

    const withCarry = buildTaskOccurrences({
      tasks: [task],
      progressEntries: [progressEntry({ progressDate: '2026-06-16', percent: 35 })],
      visibleDates: ['2026-06-16', '2026-06-17', '2026-06-18'],
      carryProgressForward: true,
    });
    expect(withCarry.map((item) => [item.taskDate, item.progressPercent])).toEqual([
      ['2026-06-16', 35],
      ['2026-06-17', 35],
      ['2026-06-18', 35],
    ]);
  });

  it('carries active manual tasks to later dates only when the setting is enabled', () => {
    const task = baseTask({ sourceType: 'manual', taskDate: '2026-06-16' });
    const entries = [progressEntry({ progressDate: '2026-06-16', percent: 20 })];

    const withoutCarry = buildTaskOccurrences({
      tasks: [task],
      progressEntries: entries,
      visibleDates: ['2026-06-16', '2026-06-17'],
      carryProgressForward: false,
    });
    expect(withoutCarry.map((item) => item.taskDate)).toEqual(['2026-06-16']);

    const withCarry = buildTaskOccurrences({
      tasks: [task],
      progressEntries: entries,
      visibleDates: ['2026-06-16', '2026-06-17'],
      carryProgressForward: true,
    });
    expect(withCarry.map((item) => [item.taskDate, item.progressPercent])).toEqual([
      ['2026-06-16', 20],
      ['2026-06-17', 20],
    ]);
  });

  it('uses per-date completion for recurring task occurrences', () => {
    const task = baseTask({ sourceType: 'daily', taskDate: '2026-06-16' });
    const occurrences = buildTaskOccurrences({
      tasks: [task],
      progressEntries: [progressEntry({ progressDate: '2026-06-17', status: 'completed', percent: 100 })],
      visibleDates: ['2026-06-16', '2026-06-17'],
      carryProgressForward: false,
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
