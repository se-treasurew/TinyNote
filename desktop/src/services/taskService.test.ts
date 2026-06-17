import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task, TaskProgressEntry } from '../types/task';

const mocks = vi.hoisted(() => ({
  listByDateRange: vi.fn(),
  listProgressEntries: vi.fn(),
  findById: vi.fn(),
  findProgressEntry: vi.fn(),
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
    findById: mocks.findById,
    findProgressEntry: mocks.findProgressEntry,
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

describe('task service occurrence and progress behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listByDateRange.mockResolvedValue([]);
    mocks.listProgressEntries.mockResolvedValue([]);
    mocks.findById.mockResolvedValue(null);
    mocks.findProgressEntry.mockResolvedValue(null);
    mocks.upsertProgressEntry.mockResolvedValue(undefined);
    mocks.save.mockResolvedValue(undefined);
    mocks.insert.mockResolvedValue(undefined);
    mocks.writeSyncLog.mockResolvedValue(undefined);
  });

  it('loads visible task occurrences from task definitions and progress entries', async () => {
    const task = baseTask({ sourceType: 'multi_day', taskDate: '2026-06-16', endDate: '2026-06-18' });
    mocks.listByDateRange.mockResolvedValue([task]);
    mocks.listProgressEntries.mockResolvedValue([progressEntry({ progressDate: '2026-06-16', percent: 55 })]);

    const occurrences = await taskService.loadVisibleTasks('2026-06-16', 3, true);

    expect(mocks.listByDateRange).toHaveBeenCalledWith('2026-06-16', '2026-06-18');
    expect(mocks.listProgressEntries).toHaveBeenCalledWith(['task-1'], '2026-06-18');
    expect(occurrences.map((item) => [item.taskDate, item.progressPercent])).toEqual([
      ['2026-06-16', 55],
      ['2026-06-17', 55],
      ['2026-06-18', 55],
    ]);
  });

  it('clamps progress updates and writes one per-date progress entry', async () => {
    const task = baseTask({ sourceType: 'daily' });
    mocks.findById.mockResolvedValue(task);

    const occurrence = await taskService.updateTaskProgress('task-1', '2026-06-18', 130, false);

    expect(mocks.upsertProgressEntry).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      progressDate: '2026-06-18',
      percent: 100,
      status: 'active',
    }));
    expect(occurrence.progressPercent).toBe(100);
    expect(occurrence.taskDate).toBe('2026-06-18');
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
});
