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

  it('creates a subtask that inherits the parent schedule and rejects nesting beyond one level', async () => {
    const parent = baseTask({
      id: 'parent',
      sourceType: 'multi_day',
      taskDate: '2026-06-16',
      endDate: '2026-06-20',
    });
    mocks.findById.mockResolvedValue(parent);

    const occurrence = await taskService.addTask({ title: '子项', parentTaskId: 'parent', taskDate: '2026-06-18' });

    // The stored definition inherits the parent's range start (06-16)...
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      parentTaskId: 'parent',
      sourceType: 'multi_day',
      taskDate: '2026-06-16',
      endDate: '2026-06-20',
    }));
    // ...but the returned occurrence lands on the caller's viewing date so the
    // optimistic merge shows it immediately under the parent (no reload needed).
    expect(occurrence.taskDate).toBe('2026-06-18');
    expect(occurrence.definitionTaskDate).toBe('2026-06-16');

    // A subtask (parentTaskId set) cannot itself have children.
    const subParent = baseTask({ id: 'child', parentTaskId: 'parent' });
    mocks.findById.mockResolvedValue(subParent);
    await expect(
      taskService.addTask({ title: '孙项', parentTaskId: 'child', taskDate: '2026-06-18' }),
    ).rejects.toThrow('one level only');
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
