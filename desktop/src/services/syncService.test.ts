import { describe, expect, it } from 'vitest';
import { chooseMergedRecord } from './syncService';

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
});
