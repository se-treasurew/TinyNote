import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../types/settings';
import type { Task } from '../types/task';

const mocks = vi.hoisted(() => ({
  listAllTasks: vi.fn(),
  listArchive: vi.fn(),
  listAllProgressEntries: vi.fn(),
  listAllPostponements: vi.fn(),
  upsertTask: vi.fn(),
  upsertPostponement: vi.fn(),
  listRoutines: vi.fn(),
  listInstances: vi.fn(),
  upsertRoutine: vi.fn(),
  upsertRoutineInstance: vi.fn(),
  loadSettings: vi.fn(),
  setMany: vi.fn(),
  writeSyncLog: vi.fn(),
}));

vi.mock('../repositories/taskRepository', () => ({
  TaskRepository: vi.fn(() => ({
    listAll: mocks.listAllTasks,
    listArchive: mocks.listArchive,
    listAllProgressEntries: mocks.listAllProgressEntries,
    listAllPostponements: mocks.listAllPostponements,
    upsert: mocks.upsertTask,
    upsertPostponement: mocks.upsertPostponement,
  })),
}));

vi.mock('../repositories/routineRepository', () => ({
  RoutineRepository: vi.fn(() => ({
    listRoutines: mocks.listRoutines,
    listInstances: mocks.listInstances,
    upsertRoutine: mocks.upsertRoutine,
    upsertRoutineInstance: mocks.upsertRoutineInstance,
  })),
}));

vi.mock('../repositories/settingsRepository', () => ({
  SettingsRepository: vi.fn(() => ({
    load: mocks.loadSettings,
    setMany: mocks.setMany,
  })),
}));

vi.mock('./syncLogService', () => ({
  writeSyncLog: mocks.writeSyncLog,
}));

const { dataPortabilityService } = await import('./dataPortabilityService');

const legacyTaskWithoutPostponedAt = {
  id: 'task-1',
  userId: null,
  deviceId: 'device-a',
  title: '旧备份任务',
  content: null,
  taskDate: '2026-06-18',
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
  createdAt: '2026-06-18T00:00:00.000Z',
  updatedAt: '2026-06-18T00:00:00.000Z',
  syncStatus: 'local',
  version: 1,
} as unknown as Task;

describe('data portability compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAllTasks.mockResolvedValue([]);
    mocks.listRoutines.mockResolvedValue([]);
    mocks.listAllProgressEntries.mockResolvedValue([]);
    mocks.listAllPostponements.mockResolvedValue([]);
    mocks.upsertTask.mockResolvedValue(undefined);
    mocks.upsertPostponement.mockResolvedValue(undefined);
    mocks.writeSyncLog.mockResolvedValue(undefined);
    mocks.setMany.mockResolvedValue(undefined);
  });

  it('normalizes imported tasks without postpone metadata', async () => {
    await dataPortabilityService.importData({
      schemaVersion: 2,
      exportedAt: '2026-06-18T00:00:00.000Z',
      tasks: [legacyTaskWithoutPostponedAt],
      routines: [],
      routineInstances: [],
      taskProgressEntries: [],
      settings: defaultSettings,
    });

    expect(mocks.upsertTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-1',
      postponedAt: null,
    }));
    expect(mocks.upsertPostponement).not.toHaveBeenCalled();
  });

  it('imports schema version 3 postponement history', async () => {
    await dataPortabilityService.importData({
      schemaVersion: 3,
      exportedAt: '2026-06-18T00:00:00.000Z',
      tasks: [legacyTaskWithoutPostponedAt],
      routines: [],
      routineInstances: [],
      taskProgressEntries: [],
      taskPostponements: [{
        id: 'postpone-1',
        taskId: 'task-1',
        fromDate: '2026-06-18',
        toDate: '2026-06-20',
        createdAt: '2026-06-18T01:00:00.000Z',
        updatedAt: '2026-06-18T01:00:00.000Z',
        deletedAt: null,
        syncStatus: 'local',
        version: 1,
      }],
      settings: defaultSettings,
    });

    expect(mocks.upsertPostponement).toHaveBeenCalledWith(expect.objectContaining({
      id: 'postpone-1',
      taskId: 'task-1',
      fromDate: '2026-06-18',
      toDate: '2026-06-20',
    }));
  });
});
