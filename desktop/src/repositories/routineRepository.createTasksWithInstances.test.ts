import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../types/task';

const mocks = vi.hoisted(() => ({
  runInTransaction: vi.fn(),
  runBackgroundInTransaction: vi.fn(),
  executeInTransaction: vi.fn(),
  executeWrite: vi.fn(),
  selectWithRetry: vi.fn(),
}));

vi.mock('./db', () => ({
  runInTransaction: mocks.runInTransaction,
  runBackgroundInTransaction: mocks.runBackgroundInTransaction,
  executeInTransaction: mocks.executeInTransaction,
  executeWrite: mocks.executeWrite,
  selectWithRetry: mocks.selectWithRetry,
}));

const task = (id: string, date: string): Task => ({
  id,
  userId: null,
  deviceId: 'device-a',
  title: '阅读器PPT制作',
  content: null,
  taskDate: date,
  endDate: null,
  status: 'active',
  priority: 'none',
  sourceType: 'daily',
  routineId: 'routine-1',
  parentTaskId: null,
  sortOrder: 0,
  completedAt: null,
  completedOnDate: null,
  archivedAt: null,
  deletedAt: null,
  postponedAt: null,
  createdAt: '2026-06-17T00:00:00.000Z',
  updatedAt: '2026-06-17T00:00:00.000Z',
  syncStatus: 'local',
  version: 1,
});

describe('routine repository generated task insertion', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.runInTransaction.mockImplementation(async (callback: (db: unknown) => Promise<unknown>) =>
      callback({}),
    );
    mocks.runBackgroundInTransaction.mockImplementation(async (callback: (db: unknown) => Promise<unknown>) =>
      callback({}),
    );
  });

  it('returns and inserts only tasks whose routine instance was newly claimed', async () => {
    const insertedTaskIds: string[] = [];
    mocks.executeInTransaction.mockImplementation(async (_db: unknown, sql: string, bindValues?: unknown[]) => {
      if (sql.includes('INSERT INTO tasks')) {
        if (bindValues?.[23] === '2026-06-18') {
          return { rowsAffected: 0 };
        }
        insertedTaskIds.push(String(bindValues?.[0]));
      }

      return { rowsAffected: 1 };
    });
    const { RoutineRepository } = await import('./routineRepository');
    const repository = new RoutineRepository();

    const inserted = await repository.createTasksWithInstances([
      task('task-new', '2026-06-17'),
      task('task-duplicate', '2026-06-18'),
    ]);

    expect(inserted.map((item) => item.id)).toEqual(['task-new']);
    expect(insertedTaskIds).toEqual(['task-new']);
  });

  it('does not create a routine instance when the task insert was skipped', async () => {
    const routineInstanceInserts: string[] = [];
    mocks.executeInTransaction.mockImplementation(async (_db: unknown, sql: string) => {
      if (sql.includes('INSERT INTO tasks')) {
        return { rowsAffected: 0 };
      }
      if (sql.includes('routine_instances')) {
        routineInstanceInserts.push(sql);
      }
      return { rowsAffected: 1 };
    });
    const { RoutineRepository } = await import('./routineRepository');
    const repository = new RoutineRepository();

    const inserted = await repository.createTasksWithInstances([task('task-duplicate', '2026-06-18')]);

    expect(inserted).toEqual([]);
    expect(routineInstanceInserts).toEqual([]);
  });

  it('uses the background transaction queue for routine backfill when requested', async () => {
    mocks.executeInTransaction.mockResolvedValue({ rowsAffected: 1 });
    const { RoutineRepository } = await import('./routineRepository');
    const repository = new RoutineRepository();

    await repository.createTasksWithInstances([task('task-new', '2026-06-17')], { priority: 'background' });

    expect(mocks.runBackgroundInTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.runInTransaction).not.toHaveBeenCalled();
  });
});
