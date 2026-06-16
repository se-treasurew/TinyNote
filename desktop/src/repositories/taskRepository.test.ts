import { describe, expect, it } from 'vitest';
import { taskToUpdateParams } from './taskRepository';
import type { Task } from '../types/task';

const task: Task = {
  id: 'task-1',
  userId: null,
  deviceId: 'device-a',
  title: '更新标题',
  content: '内容',
  taskDate: '2026-06-16',
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
});
