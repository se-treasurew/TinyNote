import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeBackgroundWrite: vi.fn(),
}));

vi.mock('../repositories/db', () => ({
  executeBackgroundWrite: mocks.executeBackgroundWrite,
}));

describe('sync log service', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.executeBackgroundWrite.mockResolvedValue({ rowsAffected: 1 });
  });

  it('does not block the caller when background sync log writing fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.executeBackgroundWrite.mockRejectedValueOnce(new Error('sync log write failed'));
    const { writeSyncLog } = await import('./syncLogService');

    await expect(writeSyncLog({
      entityType: 'task',
      entityId: 'task-1',
      operation: 'update',
      payload: { id: 'task-1' },
    })).resolves.toBeUndefined();
    await Promise.resolve();

    expect(consoleError).toHaveBeenCalledWith('Failed to write sync log', expect.any(Error));
    consoleError.mockRestore();
  });

  it('can still be awaited explicitly when a caller needs sync log persistence', async () => {
    const { writeSyncLog } = await import('./syncLogService');

    await writeSyncLog({
      entityType: 'task',
      entityId: 'task-1',
      operation: 'create',
      payload: { id: 'task-1' },
    }, { awaitWrite: true });

    expect(mocks.executeBackgroundWrite).toHaveBeenCalledTimes(1);
  });
});
