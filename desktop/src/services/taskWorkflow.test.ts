import { describe, expect, it } from 'vitest';
import {
  applyComplete,
  applyDelete,
  applyRestore,
  groupActiveTasksByDate,
  groupDateDisplayTasksByDate,
  groupTasksWithSubtasks,
  hasActiveTaskOnDate,
  subtaskBadge,
} from './taskWorkflow';
import type { Task, TaskOccurrence } from '../types/task';

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

const occurrence = (overrides: Partial<TaskOccurrence> = {}): TaskOccurrence => ({
  ...baseTask(),
  definitionTaskDate: '2026-06-16',
  occurrenceDate: '2026-06-16',
  progressPercent: 0,
  progressEntryId: null,
  postponementId: null,
  postponedFromDate: null,
  postponedToDate: null,
  postponementHistory: [],
  ...overrides,
});

describe('task workflow rules', () => {
  it('completes active tasks without triggering archive by default', () => {
    const task = applyComplete(baseTask(), '2026-06-16T01:00:00.000Z');

    expect(task.status).toBe('completed');
    expect(task.completedAt).toBe('2026-06-16T01:00:00.000Z');
    expect(task.archivedAt).toBeNull();
    expect(task.version).toBe(2);
  });

  it('restores completed tasks and soft deletes without physical removal', () => {
    const completed = applyComplete(baseTask(), '2026-06-16T02:00:00.000Z');
    const restored = applyRestore(completed, '2026-06-16T03:00:00.000Z');
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

  it('groups active, completed, and archived tasks for the main date display', () => {
    const tasks = [
      baseTask({ id: 'active', taskDate: '2026-06-16', status: 'active', sortOrder: 1 }),
      baseTask({ id: 'completed', taskDate: '2026-06-16', status: 'completed', sortOrder: 0 }),
      baseTask({ id: 'archived', taskDate: '2026-06-16', status: 'archived' }),
      baseTask({ id: 'deleted', taskDate: '2026-06-16', status: 'deleted' }),
    ];

    const grouped = groupDateDisplayTasksByDate(tasks);

    expect(grouped).toEqual({
      '2026-06-16': [tasks[0], tasks[1], tasks[2]],
    });
  });

  it('groups parents with their subtasks and keeps orphans as top-level', () => {
    const parent = occurrence({ id: 'parent', sortOrder: 0 });
    const childActive = occurrence({
      id: 'child-a',
      parentTaskId: 'parent',
      sortOrder: 1,
      createdAt: '2026-06-16T01:00:00.000Z',
    });
    const childDone = occurrence({
      id: 'child-b',
      parentTaskId: 'parent',
      status: 'completed',
      sortOrder: 0,
      createdAt: '2026-06-16T00:30:00.000Z',
    });
    const orphan = occurrence({ id: 'orphan', parentTaskId: 'missing-parent', sortOrder: 5 });

    const trees = groupTasksWithSubtasks([parent, childActive, childDone, orphan]);

    expect(trees).toHaveLength(2);
    expect(trees[0].task.id).toBe('parent');
    // Active subtasks sort above completed ones, matching the active-first rule.
    expect(trees[0].subtasks.map((s) => s.id)).toEqual(['child-a', 'child-b']);
    expect(trees[1].task.id).toBe('orphan');
    expect(trees[1].subtasks).toEqual([]);
  });

  it('sorts top-level tasks active-first then by sortOrder/createdAt', () => {
    const trees = groupTasksWithSubtasks([
      occurrence({ id: 'done', status: 'completed', sortOrder: 0 }),
      occurrence({ id: 'active-late', status: 'active', sortOrder: 5 }),
      occurrence({ id: 'active-early', status: 'active', sortOrder: 1 }),
    ]);

    expect(trees.map((t) => t.task.id)).toEqual(['active-early', 'active-late', 'done']);
  });

  it('computes the subtask completion badge', () => {
    expect(subtaskBadge([])).toEqual({ done: 0, total: 0 });
    expect(
      subtaskBadge([
        occurrence({ id: 'a', status: 'active' }),
        occurrence({ id: 'b', status: 'active' }),
      ]),
    ).toEqual({ done: 0, total: 2 });
    expect(
      subtaskBadge([
        occurrence({ id: 'a', status: 'completed' }),
        occurrence({ id: 'b', status: 'archived' }),
      ]),
    ).toEqual({ done: 2, total: 2 });
    expect(
      subtaskBadge([
        occurrence({ id: 'a', status: 'completed' }),
        occurrence({ id: 'b', status: 'active' }),
      ]),
    ).toEqual({ done: 1, total: 2 });
  });
});
