import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task, TaskPostponement, TaskProgressEntry } from '../types/task';

const mocks = vi.hoisted(() => ({
  listByDateRange: vi.fn(),
  listProgressEntries: vi.fn(),
  listPostponements: vi.fn(),
  listAllPostponements: vi.fn(),
  findById: vi.fn(),
  findProgressEntry: vi.fn(),
  upsertPostponement: vi.fn(),
  softDeletePostponements: vi.fn(),
  upsertProgressEntry: vi.fn(),
  save: vi.fn(),
  insert: vi.fn(),
  listArchive: vi.fn(),
  listAll: vi.fn(),
  insertMany: vi.fn(),
  upsert: vi.fn(),
  listByParentId: vi.fn(),
  saveMany: vi.fn(),
  findActivePostponement: vi.fn(),
  writeSyncLog: vi.fn(),
}));

vi.mock('../repositories/taskRepository', () => ({
  TaskRepository: vi.fn(() => ({
    listByDateRange: mocks.listByDateRange,
    listProgressEntries: mocks.listProgressEntries,
    listPostponements: mocks.listPostponements,
    listAllPostponements: mocks.listAllPostponements,
    findById: mocks.findById,
    findProgressEntry: mocks.findProgressEntry,
    upsertPostponement: mocks.upsertPostponement,
    softDeletePostponements: mocks.softDeletePostponements,
    upsertProgressEntry: mocks.upsertProgressEntry,
    save: mocks.save,
    insert: mocks.insert,
    listArchive: mocks.listArchive,
    listAll: mocks.listAll,
    insertMany: mocks.insertMany,
    upsert: mocks.upsert,
    listByParentId: mocks.listByParentId,
    saveMany: mocks.saveMany,
    findActivePostponement: mocks.findActivePostponement,
  })),
}));

vi.mock('./syncLogService', () => ({
  writeSyncLog: mocks.writeSyncLog,
}));

vi.mock('../utils/id', () => ({
  getDeviceId: () => 'device-a',
  createId: (prefix: string) => `${prefix}-generated`,
}));

vi.mock('../utils/date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/date')>();
  return { ...actual, todayIsoDate: () => '2026-06-18' };
});

const { taskService } = await import('./taskService');

const baseTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  userId: null,
  deviceId: 'device-a',
  title: '阅读',
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
  percent: 30,
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

const taskPostponement = (overrides: Partial<TaskPostponement> = {}): TaskPostponement => ({
  id: 'postpone-1',
  taskId: 'task-1',
  fromDate: '2026-06-18',
  toDate: '2026-06-19',
  createdAt: '2026-06-18T01:00:00.000Z',
  updatedAt: '2026-06-18T01:00:00.000Z',
  deletedAt: null,
  syncStatus: 'local',
  version: 1,
  ...overrides,
});

describe('task service occurrence and progress behavior', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.listByDateRange.mockResolvedValue([]);
    mocks.listProgressEntries.mockResolvedValue([]);
    mocks.listPostponements.mockResolvedValue([]);
    mocks.listAllPostponements.mockResolvedValue([]);
    mocks.findById.mockResolvedValue(null);
    mocks.findProgressEntry.mockResolvedValue(null);
    mocks.upsertPostponement.mockResolvedValue(undefined);
    mocks.softDeletePostponements.mockResolvedValue([]);
    mocks.upsertProgressEntry.mockResolvedValue(undefined);
    mocks.save.mockResolvedValue(undefined);
    mocks.insert.mockResolvedValue(undefined);
    mocks.listByParentId.mockResolvedValue([]);
    mocks.saveMany.mockResolvedValue(undefined);
    mocks.findActivePostponement.mockResolvedValue(null);
    mocks.writeSyncLog.mockResolvedValue(undefined);
  });

  it('loads visible task occurrences from task definitions and progress entries', async () => {
    const task = baseTask({ sourceType: 'multi_day', taskDate: '2026-06-16', endDate: '2026-06-18' });
    mocks.listByDateRange.mockResolvedValue([task]);
    mocks.listProgressEntries.mockResolvedValue([progressEntry({ progressDate: '2026-06-16', percent: 55 })]);

    const occurrences = await taskService.loadVisibleTasks('2026-06-16', 3);

    expect(mocks.listByDateRange).toHaveBeenCalledWith('2026-06-16', '2026-06-18');
    expect(mocks.listProgressEntries).toHaveBeenCalledWith(['task-1'], '2026-06-18');
    expect(mocks.listPostponements).toHaveBeenCalledWith(['task-1']);
    // Multi-day progress carries forward to today-and-before (today is 2026-06-18).
    expect(occurrences.map((item) => [item.taskDate, item.progressPercent])).toEqual([
      ['2026-06-16', 55],
      ['2026-06-17', 55],
      ['2026-06-18', 55],
    ]);
  });

  it('clamps progress updates and writes one per-date progress entry', async () => {
    const task = baseTask({ sourceType: 'daily' });
    mocks.findById.mockResolvedValue(task);

    const occurrence = await taskService.updateTaskProgress('task-1', '2026-06-18', 130);

    expect(mocks.upsertProgressEntry).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      progressDate: '2026-06-18',
      percent: 100,
      status: 'active',
    }));
    expect(occurrence.progressPercent).toBe(100);
    expect(occurrence.taskDate).toBe('2026-06-18');
  });

  it('returns updated progress for a postponed manual occurrence outside the original date', async () => {
    const task = baseTask({ sourceType: 'manual', taskDate: '2026-06-18' });
    mocks.findById.mockResolvedValue(task);

    const occurrence = await taskService.updateTaskProgress('task-1', '2026-06-20', 41);

    expect(mocks.upsertProgressEntry).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      progressDate: '2026-06-20',
      percent: 41,
    }));
    expect(occurrence.taskDate).toBe('2026-06-20');
    expect(occurrence.progressPercent).toBe(41);
  });

  it('preserves postponement history when updating progress on a postponed occurrence', async () => {
    const task = baseTask({
      sourceType: 'manual',
      taskDate: '2026-06-18',
      postponedAt: '2026-06-18T01:00:00.000Z',
    });
    const history = taskPostponement({
      fromDate: '2026-06-18',
      toDate: '2026-06-20',
    });
    mocks.findById.mockResolvedValue(task);
    mocks.listPostponements.mockResolvedValue([history]);

    const occurrence = await taskService.updateTaskProgress('task-1', '2026-06-20', 41);

    expect(mocks.listPostponements).toHaveBeenCalledWith(['task-1']);
    expect(occurrence.taskDate).toBe('2026-06-20');
    expect(occurrence.postponedFromDate).toBe('2026-06-18');
    expect(occurrence.postponedToDate).toBe('2026-06-20');
    expect(occurrence.postponementHistory).toEqual([history]);
  });

  it('preserves postponement history when updating task definitions', async () => {
    const task = baseTask({
      sourceType: 'manual',
      taskDate: '2026-06-18',
      postponedAt: '2026-06-18T01:00:00.000Z',
    });
    const history = taskPostponement({
      fromDate: '2026-06-18',
      toDate: '2026-06-20',
    });
    mocks.findById.mockResolvedValue(task);
    mocks.listPostponements.mockResolvedValue([history]);

    const occurrence = await taskService.updateTask('task-1', { title: '阅读新版' });

    expect(mocks.listPostponements).toHaveBeenCalledWith(['task-1']);
    expect(occurrence.title).toBe('阅读新版');
    expect(occurrence.postponedFromDate).toBe('2026-06-18');
    expect(occurrence.postponedToDate).toBe('2026-06-20');
    expect(occurrence.postponementHistory).toEqual([history]);
  });

  it('completes daily occurrences by writing progress state instead of saving the task definition', async () => {
    const task = baseTask({ sourceType: 'daily' });
    mocks.findById.mockResolvedValue(task);

    const occurrence = await taskService.completeTask('task-1', '2026-06-18');

    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.upsertProgressEntry).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      progressDate: '2026-06-18',
      status: 'completed',
    }));
    expect(occurrence.status).toBe('completed');
    expect(occurrence.taskDate).toBe('2026-06-18');
  });

  it('completes a multi-day task globally from any occurrence date', async () => {
    const task = baseTask({
      sourceType: 'multi_day',
      taskDate: '2026-06-16',
      endDate: '2026-06-20',
    });
    mocks.findById.mockResolvedValue(task);

    await taskService.completeTask('task-1', '2026-06-18');

    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-1',
      status: 'completed',
    }));
    expect(mocks.upsertProgressEntry).not.toHaveBeenCalled();
  });

  it('restores a globally completed multi-day task from any occurrence date', async () => {
    const task = baseTask({
      sourceType: 'multi_day',
      taskDate: '2026-06-16',
      endDate: '2026-06-20',
      status: 'completed',
      completedAt: '2026-06-17T01:00:00.000Z',
    });
    mocks.findById.mockResolvedValue(task);

    await taskService.restoreTask('task-1', '2026-06-19');

    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-1',
      status: 'active',
      completedAt: null,
    }));
    expect(mocks.upsertProgressEntry).not.toHaveBeenCalled();
  });

  it('rejects completing a parent with an unfinished direct child', async () => {
    const parent = baseTask({ id: 'parent' });
    const child = baseTask({ id: 'child', parentTaskId: 'parent', status: 'active' });
    mocks.findById.mockResolvedValue(parent);
    mocks.listByParentId.mockResolvedValue([child]);

    await expect(taskService.completeTask('parent', '2026-06-16'))
      .rejects.toThrow('Cannot complete task with unfinished subtasks');
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('treats a globally completed multi-day child as complete despite a stale direct progress entry', async () => {
    const parent = baseTask({
      id: 'parent',
      sourceType: 'multi_day',
      taskDate: '2026-06-16',
      endDate: '2026-06-20',
    });
    const child = baseTask({
      id: 'child',
      parentTaskId: 'parent',
      sourceType: 'multi_day',
      taskDate: '2026-06-16',
      endDate: '2026-06-20',
      status: 'completed',
      completedAt: '2026-06-17T01:00:00.000Z',
    });
    mocks.findById.mockResolvedValue(parent);
    mocks.listByParentId.mockResolvedValue([child]);
    mocks.listProgressEntries.mockResolvedValue([
      progressEntry({ taskId: 'child', progressDate: '2026-06-18', percent: 50, status: 'active' }),
    ]);

    await taskService.completeTask('parent', '2026-06-18');

    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'parent',
      status: 'completed',
    }));
  });

  it('treats a completed manual child as complete on its definition date despite a stale direct progress entry', async () => {
    const parent = baseTask({ id: 'parent', taskDate: '2026-06-18' });
    const child = baseTask({
      id: 'child',
      parentTaskId: 'parent',
      taskDate: '2026-06-18',
      status: 'completed',
      completedAt: '2026-06-17T01:00:00.000Z',
    });
    mocks.findById.mockResolvedValue(parent);
    mocks.listByParentId.mockResolvedValue([child]);
    mocks.listProgressEntries.mockResolvedValue([
      progressEntry({ taskId: 'child', progressDate: '2026-06-18', percent: 100, status: 'active' }),
    ]);

    await taskService.completeTask('parent', '2026-06-18');

    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'parent',
      status: 'completed',
    }));
  });

  it('preserves postponement history when completing a postponed occurrence', async () => {
    const task = baseTask({
      sourceType: 'daily',
      taskDate: '2026-06-18',
      postponedAt: '2026-06-18T01:00:00.000Z',
    });
    const history = taskPostponement({
      fromDate: '2026-06-18',
      toDate: '2026-06-20',
    });
    mocks.findById.mockResolvedValue(task);
    mocks.listPostponements.mockResolvedValue([history]);

    const occurrence = await taskService.completeTask('task-1', '2026-06-20');

    expect(mocks.listPostponements).toHaveBeenCalledWith(['task-1']);
    expect(occurrence.status).toBe('completed');
    expect(occurrence.postponementHistory).toEqual([history]);
  });

  it('completes a postponed manual occurrence by writing a target-date progress entry', async () => {
    const task = baseTask({
      sourceType: 'manual',
      taskDate: '2026-06-26',
      postponedAt: '2026-06-26T01:00:00.000Z',
    });
    const history = taskPostponement({
      fromDate: '2026-06-26',
      toDate: '2026-06-27',
    });
    mocks.findById.mockResolvedValue(task);
    mocks.listPostponements.mockResolvedValue([history]);
    mocks.findProgressEntry.mockResolvedValue(null);

    const occurrence = await taskService.completeTask('task-1', '2026-06-27');

    expect(mocks.save).not.toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-1',
      status: 'completed',
    }));
    expect(mocks.upsertProgressEntry).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      progressDate: '2026-06-27',
      percent: 100,
      status: 'completed',
    }));
    expect(occurrence.taskDate).toBe('2026-06-27');
    expect(occurrence.status).toBe('completed');
    expect(occurrence.postponementHistory).toEqual([history]);
  });

  it('keeps original manual completion behavior on the definition date without a direct progress entry', async () => {
    const task = baseTask({ sourceType: 'manual', taskDate: '2026-06-26' });
    mocks.findById.mockResolvedValue(task);
    mocks.findProgressEntry.mockResolvedValue(null);

    const occurrence = await taskService.completeTask('task-1', '2026-06-26');

    expect(mocks.upsertProgressEntry).not.toHaveBeenCalled();
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-1',
      status: 'completed',
      taskDate: '2026-06-26',
    }));
    expect(occurrence.status).toBe('completed');
  });

  it('updates an existing manual progress entry instead of the task definition', async () => {
    const task = baseTask({ sourceType: 'manual', taskDate: '2026-06-26' });
    mocks.findById.mockResolvedValue(task);
    mocks.findProgressEntry.mockResolvedValue(progressEntry({
      id: 'progress-target',
      progressDate: '2026-06-27',
      percent: 35,
      status: 'active',
    }));

    await taskService.completeTask('task-1', '2026-06-27');
    await taskService.restoreTask('task-1', '2026-06-27');

    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.upsertProgressEntry).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id: 'progress-target',
      progressDate: '2026-06-27',
      percent: 100,
      status: 'completed',
    }));
    expect(mocks.upsertProgressEntry).toHaveBeenNthCalledWith(2, expect.objectContaining({
      id: 'progress-target',
      progressDate: '2026-06-27',
      percent: 0,
      status: 'active',
    }));
  });

  it('recomputes a postponed manual subtask parent on the target occurrence date', async () => {
    const parent = baseTask({
      id: 'parent',
      sourceType: 'manual',
      taskDate: '2026-06-26',
    });
    const child = baseTask({
      id: 'child',
      parentTaskId: 'parent',
      sourceType: 'manual',
      taskDate: '2026-06-26',
    });
    mocks.findById.mockImplementation(async (id: string) => {
      if (id === 'child') return child;
      if (id === 'parent') return parent;
      return null;
    });
    mocks.findProgressEntry.mockResolvedValue(null);
    mocks.listByParentId.mockImplementation(async (id: string) => (id === 'parent' ? [child] : []));
    mocks.listProgressEntries.mockResolvedValue([
      progressEntry({
        taskId: 'child',
        progressDate: '2026-06-27',
        percent: 100,
        status: 'completed',
      }),
    ]);

    await taskService.completeTask('child', '2026-06-27');

    expect(mocks.save).not.toHaveBeenCalledWith(expect.objectContaining({
      id: 'parent',
      status: 'completed',
    }));
    expect(mocks.upsertProgressEntry).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'parent',
      progressDate: '2026-06-27',
      percent: 100,
      status: 'completed',
    }));
  });

  it('clears all postponement history without changing dates or progress', async () => {
    const task = baseTask({
      sourceType: 'multi_day',
      taskDate: '2026-06-18',
      endDate: '2026-06-24',
      postponedAt: '2026-06-18T01:00:00.000Z',
    });
    const history = [
      taskPostponement({ id: 'postpone-1', toDate: '2026-06-20' }),
      taskPostponement({ id: 'postpone-2', fromDate: '2026-06-20', toDate: '2026-06-24' }),
    ];
    mocks.findById.mockResolvedValue(task);
    mocks.softDeletePostponements.mockResolvedValue(history.map((item) => ({
      ...item,
      deletedAt: '2026-06-19T00:00:00.000Z',
      syncStatus: 'pending',
      version: item.version + 1,
    })));

    const occurrence = await taskService.clearTaskPostponements('task-1');

    expect(mocks.softDeletePostponements).toHaveBeenCalledWith('task-1', expect.any(String));
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-1',
      taskDate: '2026-06-18',
      endDate: '2026-06-24',
      postponedAt: null,
    }));
    expect(mocks.upsertProgressEntry).not.toHaveBeenCalled();
    expect(mocks.writeSyncLog).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'task_postponement',
      operation: 'delete',
    }));
    expect(occurrence.postponementHistory).toEqual([]);
    expect(occurrence.endDate).toBe('2026-06-24');
  });

  it('preserves postponement history when restoring a postponed occurrence', async () => {
    const task = baseTask({
      sourceType: 'daily',
      taskDate: '2026-06-18',
      status: 'completed',
      postponedAt: '2026-06-18T01:00:00.000Z',
    });
    const history = taskPostponement({
      fromDate: '2026-06-18',
      toDate: '2026-06-20',
    });
    mocks.findById.mockResolvedValue(task);
    mocks.listPostponements.mockResolvedValue([history]);

    const occurrence = await taskService.restoreTask('task-1', '2026-06-20');

    expect(mocks.listPostponements).toHaveBeenCalledWith(['task-1']);
    expect(occurrence.status).toBe('active');
    expect(occurrence.postponementHistory).toEqual([history]);
  });

  it('preserves existing target-date progress instead of overwriting it on postpone', async () => {
    const task = baseTask({ sourceType: 'manual', taskDate: '2026-06-18' });
    mocks.findById.mockResolvedValue(task);
    // first findProgressEntry -> source date progress (45); second -> target date
    // already has 75% which must NOT be clobbered by the source date's 45%.
    mocks.findProgressEntry
      .mockResolvedValueOnce(progressEntry({ progressDate: '2026-06-18', percent: 45 }))
      .mockResolvedValueOnce(progressEntry({ id: 'existing-target', progressDate: '2026-06-20', percent: 75 }));

    await taskService.postponeTask('task-1', '2026-06-18', '2026-06-20');

    expect(mocks.upsertProgressEntry).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      progressDate: '2026-06-20',
      percent: 75,
      status: 'active',
    }));
  });

  it('postpones a manual task without removing the original date and copies direct progress', async () => {
    const task = baseTask({ sourceType: 'manual', taskDate: '2026-06-18' });
    mocks.findById.mockResolvedValue(task);
    mocks.findProgressEntry
      .mockResolvedValueOnce(progressEntry({ progressDate: '2026-06-18', percent: 45 }))
      .mockResolvedValueOnce(null);

    const occurrence = await taskService.postponeTask('task-1', '2026-06-18', '2026-06-20');

    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      taskDate: '2026-06-18',
      postponedAt: expect.any(String),
    }));
    expect(mocks.upsertPostponement).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      fromDate: '2026-06-18',
      toDate: '2026-06-20',
    }));
    expect(mocks.upsertProgressEntry).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      progressDate: '2026-06-20',
      percent: 45,
      status: 'active',
    }));
    expect(occurrence.taskDate).toBe('2026-06-20');
    expect(occurrence.postponedFromDate).toBe('2026-06-18');
    expect(occurrence.postponedToDate).toBe('2026-06-20');
    expect(occurrence.progressPercent).toBe(45);
  });

  it('postpones a manual task by copying visible progress when no direct progress entry exists', async () => {
    const task = baseTask({ sourceType: 'manual', taskDate: '2026-06-18' });
    mocks.findById.mockResolvedValue(task);
    mocks.findProgressEntry
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const occurrence = await taskService.postponeTask('task-1', '2026-06-18', '2026-06-20', 65);

    expect(mocks.upsertProgressEntry).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      progressDate: '2026-06-20',
      percent: 65,
      status: 'active',
    }));
    expect(occurrence.progressPercent).toBe(65);
  });

  it('postpones every task in a parent-child batch only once', async () => {
    const parent = baseTask({ id: 'parent', taskDate: '2026-06-18' });
    const child = baseTask({ id: 'child', parentTaskId: 'parent', taskDate: '2026-06-18' });
    mocks.findById.mockImplementation(async (id: string) => {
      if (id === 'parent') return parent;
      if (id === 'child') return child;
      return null;
    });
    mocks.listByParentId.mockImplementation(async (id: string) => id === 'parent' ? [child] : []);

    await taskService.postponeTasksForDate([
      { id: 'parent', progressPercent: 10 },
      { id: 'child', progressPercent: 20 },
    ], '2026-06-18', '2026-06-19');

    expect(mocks.upsertPostponement).toHaveBeenCalledTimes(2);
    expect(mocks.upsertPostponement).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'parent' }));
    expect(mocks.upsertPostponement).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'child' }));
  });

  it('treats an existing active postponement as idempotent', async () => {
    const task = baseTask({ taskDate: '2026-06-18' });
    mocks.findById.mockResolvedValue(task);
    mocks.findActivePostponement.mockResolvedValue(taskPostponement({
      fromDate: '2026-06-18',
      toDate: '2026-06-20',
    }));

    await taskService.postponeTask('task-1', '2026-06-18', '2026-06-20');

    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.upsertPostponement).not.toHaveBeenCalled();
    expect(mocks.upsertProgressEntry).not.toHaveBeenCalled();
  });

  it('does not carry a previous daily completion into parent progress for the next date', async () => {
    const parent = baseTask({
      id: 'parent',
      sourceType: 'multi_day',
      taskDate: '2026-06-16',
      endDate: '2026-06-20',
    });
    const child = baseTask({
      id: 'child',
      parentTaskId: 'parent',
      sourceType: 'daily',
      taskDate: '2026-06-16',
      endDate: '2026-06-20',
    });
    mocks.findById.mockImplementation(async (id: string) => id === 'child' ? child : id === 'parent' ? parent : null);
    mocks.listByParentId.mockImplementation(async (id: string) => id === 'parent' ? [child] : []);
    mocks.listProgressEntries.mockResolvedValue([
      progressEntry({ taskId: 'child', progressDate: '2026-06-17', percent: 100, status: 'completed' }),
    ]);

    await taskService.restoreTask('child', '2026-06-18');

    expect(mocks.upsertProgressEntry).toHaveBeenLastCalledWith(expect.objectContaining({
      taskId: 'parent',
      progressDate: '2026-06-18',
      percent: 0,
      status: 'active',
    }));
  });

  it('postpones multi-day tasks and extends the deadline only when needed', async () => {
    const task = baseTask({ sourceType: 'multi_day', taskDate: '2026-06-16', endDate: '2026-06-18' });
    mocks.findById.mockResolvedValue(task);
    mocks.findProgressEntry
      .mockResolvedValueOnce(progressEntry({ progressDate: '2026-06-18', percent: 70 }))
      .mockResolvedValueOnce(null);

    const occurrence = await taskService.postponeTask('task-1', '2026-06-18', '2026-06-20');

    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      taskDate: '2026-06-16',
      endDate: '2026-06-20',
      postponedAt: expect.any(String),
    }));
    expect(mocks.upsertPostponement).toHaveBeenCalledWith(expect.objectContaining({
      fromDate: '2026-06-18',
      toDate: '2026-06-20',
    }));
    expect(occurrence.taskDate).toBe('2026-06-20');
    expect(occurrence.progressPercent).toBe(70);
  });

  it('postpones multi-day tasks by copying inherited progress when no direct entry exists', async () => {
    const task = baseTask({ sourceType: 'multi_day', taskDate: '2026-06-16', endDate: '2026-06-18' });
    mocks.findById.mockResolvedValue(task);
    mocks.findProgressEntry
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mocks.listProgressEntries.mockResolvedValue([
      progressEntry({ progressDate: '2026-06-17', percent: 55, updatedAt: '2026-06-17T02:00:00.000Z' }),
    ]);

    const occurrence = await taskService.postponeTask('task-1', '2026-06-18', '2026-06-20');

    expect(mocks.upsertProgressEntry).toHaveBeenCalledWith(expect.objectContaining({
      progressDate: '2026-06-20',
      percent: 55,
      status: 'active',
    }));
    expect(occurrence.progressPercent).toBe(55);
  });

  it('rejects postpone for daily tasks and invalid target dates', async () => {
    mocks.findById.mockResolvedValueOnce(baseTask({ sourceType: 'daily', taskDate: '2026-06-18' }));
    await expect(taskService.postponeTask('task-1', '2026-06-18', '2026-06-19')).rejects.toThrow('Task cannot be postponed');

    mocks.findById.mockResolvedValueOnce(baseTask({ sourceType: 'manual', taskDate: '2026-06-18' }));
    await expect(taskService.postponeTask('task-1', '2026-06-18', '2026-06-18')).rejects.toThrow('Postpone target date must be after source date');
  });

  it('allows subtasks up to three levels and rejects a fourth', async () => {
    const parent = baseTask({
      id: 'parent',
      sourceType: 'multi_day',
      taskDate: '2026-06-16',
      endDate: '2026-06-20',
    });
    const child = baseTask({ id: 'child', parentTaskId: 'parent', sourceType: 'multi_day', taskDate: '2026-06-16', endDate: '2026-06-20' });
    const grandchild = baseTask({ id: 'grandchild', parentTaskId: 'child', sourceType: 'multi_day', taskDate: '2026-06-16', endDate: '2026-06-20' });
    // findById returns the right ancestor for each id so depthOf can walk up.
    mocks.findById.mockImplementation(async (id: string) => {
      if (id === 'parent') return parent;
      if (id === 'child') return child;
      if (id === 'grandchild') return grandchild;
      return null;
    });

    // Level 1: child under parent — inherits parent schedule.
    const childOccurrence = await taskService.addTask({ title: '子项', parentTaskId: 'parent', taskDate: '2026-06-18' });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      parentTaskId: 'parent',
      sourceType: 'multi_day',
      taskDate: '2026-06-16',
      endDate: '2026-06-20',
    }));
    expect(childOccurrence.taskDate).toBe('2026-06-18');

    // Level 2: grandchild under child — allowed.
    mocks.insert.mockClear();
    await taskService.addTask({ title: '孙项', parentTaskId: 'child', taskDate: '2026-06-18' });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ parentTaskId: 'child' }));

    // Level 3: great-grandchild under grandchild — rejected (max 3 levels).
    await expect(
      taskService.addTask({ title: '曾孙', parentTaskId: 'grandchild', taskDate: '2026-06-18' }),
    ).rejects.toThrow('three levels');
  });

  it('rejects creating a subtask when the parent does not exist', async () => {
    mocks.findById.mockResolvedValue(null);
    await expect(
      taskService.addTask({ title: '子项', parentTaskId: 'ghost', taskDate: '2026-06-18' }),
    ).rejects.toThrow('Parent task not found');
  });

  it('cascades soft-delete to subtasks when deleting a parent', async () => {
    const parent = baseTask({ id: 'parent', sourceType: 'manual' });
    const child = baseTask({ id: 'child', parentTaskId: 'parent', sourceType: 'manual' });
    mocks.findById.mockResolvedValue(parent);
    mocks.listByParentId.mockResolvedValue([child]);

    await taskService.deleteTask('parent');

    expect(mocks.saveMany).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'parent', status: 'deleted' }),
      expect.objectContaining({ id: 'child', status: 'deleted' }),
    ]);
  });

  it('cascades postpone to active subtasks but skips completed ones', async () => {
    const parent = baseTask({ id: 'parent', sourceType: 'manual', taskDate: '2026-06-18' });
    const activeChild = baseTask({
      id: 'child-active',
      parentTaskId: 'parent',
      sourceType: 'manual',
      taskDate: '2026-06-18',
    });
    const doneChild = baseTask({
      id: 'child-done',
      parentTaskId: 'parent',
      sourceType: 'manual',
      taskDate: '2026-06-18',
      status: 'completed',
    });
    mocks.findById.mockResolvedValue(parent);
    mocks.listByParentId.mockResolvedValue([activeChild, doneChild]);
    // findProgressEntry is called per postponeSingle: parent source, parent target,
    // active child source, active child target. Completed child is never reached.
    mocks.findProgressEntry.mockResolvedValue(null);

    await taskService.postponeTask('parent', '2026-06-18', '2026-06-20');

    expect(mocks.save).toHaveBeenCalledTimes(2); // parent + active child
    expect(mocks.upsertPostponement).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'child-active' }));
    expect(mocks.upsertPostponement).not.toHaveBeenCalledWith(expect.objectContaining({ taskId: 'child-done' }));
  });

  it('cascades postpone up to ancestors when postponing a subtask', async () => {
    const grandparent = baseTask({ id: 'grandparent', sourceType: 'manual', taskDate: '2026-06-18' });
    const parent = baseTask({ id: 'parent', parentTaskId: 'grandparent', sourceType: 'manual', taskDate: '2026-06-18' });
    const child = baseTask({ id: 'child', parentTaskId: 'parent', sourceType: 'manual', taskDate: '2026-06-18' });
    // findById walks the ancestor chain: child first, then parent, then grandparent.
    mocks.findById.mockImplementation(async (id: string) => {
      if (id === 'child') return child;
      if (id === 'parent') return parent;
      if (id === 'grandparent') return grandparent;
      return null;
    });
    mocks.findProgressEntry.mockResolvedValue(null);

    await taskService.postponeTask('child', '2026-06-18', '2026-06-20');

    // The child itself plus its parent and grandparent are all postponed.
    expect(mocks.upsertPostponement).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'child' }));
    expect(mocks.upsertPostponement).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'parent' }));
    expect(mocks.upsertPostponement).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'grandparent' }));
  });

  it('propagates schedule changes to subtasks but skips non-schedule updates', async () => {
    const parent = baseTask({ id: 'parent', sourceType: 'manual', taskDate: '2026-06-18' });
    const child = baseTask({ id: 'child', parentTaskId: 'parent', sourceType: 'manual', taskDate: '2026-06-18' });
    mocks.findById.mockResolvedValue(parent);
    mocks.listByParentId.mockResolvedValue([child]);

    await taskService.updateTask('parent', { sourceType: 'daily', taskDate: '2026-06-16', endDate: '2026-06-20' });

    expect(mocks.saveMany).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'child', sourceType: 'daily', taskDate: '2026-06-16', endDate: '2026-06-20' }),
    ]);

    // A non-schedule update (title only) must not touch children.
    mocks.saveMany.mockClear();
    await taskService.updateTask('parent', { title: '改名' });
    expect(mocks.saveMany).not.toHaveBeenCalled();
  });
});
