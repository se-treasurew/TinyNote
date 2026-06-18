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
  upsertProgressEntry: vi.fn(),
  save: vi.fn(),
  insert: vi.fn(),
  listArchive: vi.fn(),
  listAll: vi.fn(),
  insertMany: vi.fn(),
  upsert: vi.fn(),
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
    upsertProgressEntry: mocks.upsertProgressEntry,
    save: mocks.save,
    insert: mocks.insert,
    listArchive: mocks.listArchive,
    listAll: mocks.listAll,
    insertMany: mocks.insertMany,
    upsert: mocks.upsert,
  })),
}));

vi.mock('./syncLogService', () => ({
  writeSyncLog: mocks.writeSyncLog,
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
    mocks.upsertProgressEntry.mockResolvedValue(undefined);
    mocks.save.mockResolvedValue(undefined);
    mocks.insert.mockResolvedValue(undefined);
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

  it('completes daily occurrences by writing progress state instead of saving the task definition', async () => {
    const task = baseTask({ sourceType: 'daily' });
    mocks.findById.mockResolvedValue(task);

    const occurrence = await taskService.completeTask('task-1', false, '2026-06-18');

    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.upsertProgressEntry).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      progressDate: '2026-06-18',
      status: 'completed',
    }));
    expect(occurrence.status).toBe('completed');
    expect(occurrence.taskDate).toBe('2026-06-18');
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
});
