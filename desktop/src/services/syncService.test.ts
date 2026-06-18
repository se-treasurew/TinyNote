import { describe, expect, it } from 'vitest';
import { chooseMergedRecord, createExportPayload } from './syncService';
import { defaultSettings } from '../types/settings';

type RecordShape = {
  id: string;
  status?: string;
  version: number;
  updatedAt: string;
  deletedAt: string | null;
};

describe('sync/import merge rules', () => {
  it('keeps deleted records over newer active records', () => {
    const deleted: RecordShape = {
      id: 'task-1',
      status: 'deleted',
      version: 2,
      updatedAt: '2026-06-16T01:00:00.000Z',
      deletedAt: '2026-06-16T01:00:00.000Z',
    };
    const active: RecordShape = {
      id: 'task-1',
      status: 'active',
      version: 3,
      updatedAt: '2026-06-16T02:00:00.000Z',
      deletedAt: null,
    };

    expect(chooseMergedRecord(deleted, active)).toBe(deleted);
  });

  it('prefers higher version and then newer updatedAt', () => {
    const oldRecord: RecordShape = {
      id: 'task-1',
      version: 1,
      updatedAt: '2026-06-16T02:00:00.000Z',
      deletedAt: null,
    };
    const newRecord: RecordShape = {
      id: 'task-1',
      version: 2,
      updatedAt: '2026-06-16T01:00:00.000Z',
      deletedAt: null,
    };
    const sameVersionNewer: RecordShape = {
      id: 'task-1',
      version: 2,
      updatedAt: '2026-06-16T03:00:00.000Z',
      deletedAt: null,
    };

    expect(chooseMergedRecord(oldRecord, newRecord)).toBe(newRecord);
    expect(chooseMergedRecord(newRecord, sameVersionNewer)).toBe(sameVersionNewer);
  });

  it('exports schema version 3 with task progress entries and postponements', () => {
    const payload = createExportPayload({
      tasks: [],
      routines: [],
      routineInstances: [],
      taskProgressEntries: [{
        id: 'progress-1',
        taskId: 'task-1',
        progressDate: '2026-06-18',
        percent: 45,
        status: 'active',
        completedAt: null,
        archivedAt: null,
        deletedAt: null,
        createdAt: '2026-06-18T00:00:00.000Z',
        updatedAt: '2026-06-18T00:00:00.000Z',
        syncStatus: 'local',
        version: 1,
      }],
      taskPostponements: [{
        id: 'postpone-1',
        taskId: 'task-1',
        fromDate: '2026-06-18',
        toDate: '2026-06-19',
        createdAt: '2026-06-18T01:00:00.000Z',
        updatedAt: '2026-06-18T01:00:00.000Z',
        deletedAt: null,
        syncStatus: 'local',
        version: 1,
      }],
      settings: defaultSettings,
      now: '2026-06-18T00:00:00.000Z',
    });

    expect(payload.schemaVersion).toBe(3);
    expect(payload.taskProgressEntries).toHaveLength(1);
    expect(payload.taskPostponements).toHaveLength(1);
  });
});
