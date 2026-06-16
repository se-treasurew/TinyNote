import { describe, expect, it } from 'vitest';
import {
  applyArchive,
  applyComplete,
  applyDelete,
  applyRestore,
  groupActiveTasksByDate,
  hasActiveTaskOnDate,
} from './taskWorkflow';
import type { Task } from '../types/task';

const baseTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  userId: null,
  deviceId: 'device-a',
  title: '写计划',
  content: null,
  taskDate: '2026-06-16',
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

describe('task workflow rules', () => {
  it('completes active tasks without triggering archive by default', () => {
    const task = applyComplete(baseTask(), false, '2026-06-16T01:00:00.000Z');

    expect(task.status).toBe('completed');
    expect(task.completedAt).toBe('2026-06-16T01:00:00.000Z');
    expect(task.archivedAt).toBeNull();
    expect(task.version).toBe(2);
  });

  it('archives immediately when the setting is enabled', () => {
    const task = applyComplete(baseTask(), true, '2026-06-16T01:00:00.000Z');

    expect(task.status).toBe('archived');
    expect(task.completedAt).toBe('2026-06-16T01:00:00.000Z');
    expect(task.archivedAt).toBe('2026-06-16T01:00:00.000Z');
  });

  it('archives, restores, and soft deletes without physical removal', () => {
    const archived = applyArchive(baseTask(), '2026-06-16T02:00:00.000Z');
    expect(archived.status).toBe('archived');
    expect(archived.archivedAt).toBe('2026-06-16T02:00:00.000Z');

    const restored = applyRestore(archived, '2026-06-16T03:00:00.000Z');
    expect(restored.status).toBe('active');
    expect(restored.completedAt).toBeNull();
    expect(restored.archivedAt).toBeNull();

    const deleted = applyDelete(restored, '2026-06-16T04:00:00.000Z');
    expect(deleted.status).toBe('deleted');
    expect(deleted.deletedAt).toBe('2026-06-16T04:00:00.000Z');
  });

  it('groups only active tasks by date and calculates red dot state', () => {
    const tasks = [
      baseTask({ id: 'a', taskDate: '2026-06-16', status: 'active' }),
      baseTask({ id: 'b', taskDate: '2026-06-16', status: 'completed' }),
      baseTask({ id: 'c', taskDate: '2026-06-17', status: 'archived' }),
      baseTask({ id: 'd', taskDate: '2026-06-18', status: 'deleted' }),
    ];

    const grouped = groupActiveTasksByDate(tasks);

    expect(grouped).toEqual({
      '2026-06-16': [tasks[0]],
    });
    expect(hasActiveTaskOnDate(tasks, '2026-06-16')).toBe(true);
    expect(hasActiveTaskOnDate(tasks, '2026-06-17')).toBe(false);
  });
});
