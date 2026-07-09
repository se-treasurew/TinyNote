import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  selectWithRetry: vi.fn(),
  executeWrite: vi.fn(),
  executeInTransaction: vi.fn(),
  runInTransaction: vi.fn(),
}));

vi.mock('./db', () => ({
  selectWithRetry: mocks.selectWithRetry,
  executeWrite: mocks.executeWrite,
  executeInTransaction: mocks.executeInTransaction,
  runInTransaction: mocks.runInTransaction,
}));

const { TaskRepository } = await import('./taskRepository');

describe('TaskRepository visible date query', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.selectWithRetry.mockResolvedValue([]);
  });

  it('loads a manual task when an active postponement target falls in the visible window', async () => {
    const repository = new TaskRepository();
    await repository.listByDateRange('2026-06-20', '2026-06-26');

    const [sql] = mocks.selectWithRetry.mock.calls[0] as [string];
    expect(sql).toContain('task_postponements');
    expect(sql).toContain('to_date >= $1');
    expect(sql).toContain('to_date <= $2');
    expect(sql).toContain('deleted_at IS NULL');
  });
});
