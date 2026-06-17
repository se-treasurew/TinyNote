import { describe, expect, it } from 'vitest';
import { mapTaskProgressEntryRow, taskProgressEntryToParams, taskToUpdateParams } from './taskRepository';
import type { Task, TaskProgressEntry, TaskProgressEntryRow } from '../types/task';

const task: Task = {
  id: 'task-1',
  userId: null,
  deviceId: 'device-a',
  title: '更新标题',
  content: '内容',
  taskDate: '2026-06-16',
  endDate: null,
  status: 'completed',
  priority: 'none',
  sourceType: 'manual',
  routineId: null,
  parentTaskId: null,
  sortOrder: 7,
  completedAt: '2026-06-16T01:00:00.000Z',
  archivedAt: null,
  deletedAt: null,
  createdAt: '2026-06-16T00:00:00.000Z',
  updatedAt: '2026-06-16T01:00:00.000Z',
  syncStatus: 'pending',
  version: 2,
};

describe('task repository parameter mapping', () => {
  it('maps update parameters to the placeholders used by UPDATE tasks', () => {
    expect(taskToUpdateParams(task)).toEqual([
      'task-1',
      null,
      'device-a',
      '更新标题',
      '内容',
      '2026-06-16',
      null,
      'completed',
      'none',
      'manual',
      null,
      null,
      7,
      '2026-06-16T01:00:00.000Z',
      null,
      null,
      '2026-06-16T01:00:00.000Z',
      'pending',
      2,
    ]);
  });

  it('maps progress entries to database rows and insert parameters', () => {
    const entry: TaskProgressEntry = {
      id: 'progress-1',
      taskId: 'task-1',
      progressDate: '2026-06-17',
      percent: 45,
      status: 'completed',
      completedAt: '2026-06-17T01:00:00.000Z',
      archivedAt: null,
      deletedAt: null,
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-17T01:00:00.000Z',
      syncStatus: 'pending',
      version: 2,
    };
    const row: TaskProgressEntryRow = {
      id: 'progress-1',
      task_id: 'task-1',
      progress_date: '2026-06-17',
      percent: 45,
      status: 'completed',
      completed_at: '2026-06-17T01:00:00.000Z',
      archived_at: null,
      deleted_at: null,
      created_at: '2026-06-17T00:00:00.000Z',
      updated_at: '2026-06-17T01:00:00.000Z',
      sync_status: 'pending',
      version: 2,
    };

    expect(mapTaskProgressEntryRow(row)).toEqual(entry);
    expect(taskProgressEntryToParams(entry)).toEqual([
      'progress-1',
      'task-1',
      '2026-06-17',
      45,
      'completed',
      '2026-06-17T01:00:00.000Z',
      null,
      null,
      '2026-06-17T00:00:00.000Z',
      '2026-06-17T01:00:00.000Z',
      'pending',
      2,
    ]);
  });
});
