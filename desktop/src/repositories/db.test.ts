import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  load: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: mocks.load,
  },
}));

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

async function importDbModule() {
  return import('./db');
}

describe('database connection and write coordination', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(undefined);
    mocks.select.mockResolvedValue([]);
    mocks.load.mockResolvedValue({
      execute: mocks.execute,
      select: mocks.select,
    });
  });

  it('configures WAL and busy timeout on the active database connection', async () => {
    const { getDb } = await importDbModule();

    await getDb();

    expect(mocks.load).toHaveBeenCalledWith('sqlite:tinynote.db');
    expect(mocks.execute).toHaveBeenNthCalledWith(1, 'PRAGMA journal_mode=WAL');
    expect(mocks.execute).toHaveBeenNthCalledWith(2, 'PRAGMA busy_timeout=5000');
  });

  it('shares one pending database load across concurrent callers', async () => {
    const connection = {
      execute: mocks.execute,
      select: mocks.select,
    };
    const pendingLoad = deferred<typeof connection>();
    mocks.load.mockReturnValueOnce(pendingLoad.promise);
    const { getDb } = await importDbModule();

    const first = getDb();
    const second = getDb();

    expect(mocks.load).toHaveBeenCalledTimes(1);
    pendingLoad.resolve(connection);
    await expect(Promise.all([first, second])).resolves.toEqual([connection, connection]);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it('retries ordinary writes when SQLite reports the database is locked', async () => {
    vi.useFakeTimers();
    mocks.execute
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('error returned from database: (code: 5) database is locked'))
      .mockResolvedValueOnce(undefined);
    const { executeWrite } = await importDbModule();

    const write = executeWrite('INSERT INTO sync_log (id) VALUES ($1)', ['log-1']);
    await vi.advanceTimersByTimeAsync(100);
    await write;

    expect(mocks.execute).toHaveBeenCalledTimes(4);
    expect(mocks.execute).toHaveBeenLastCalledWith('INSERT INTO sync_log (id) VALUES ($1)', ['log-1']);
  });

  it('serializes ordinary writes so only one execute runs at a time', async () => {
    const firstWrite = deferred();
    const secondWrite = deferred();
    const started: string[] = [];
    mocks.execute.mockImplementation((sql: string) => {
      if (sql.startsWith('PRAGMA')) {
        return Promise.resolve(undefined);
      }

      started.push(sql);
      return sql.includes('first') ? firstWrite.promise : secondWrite.promise;
    });
    const { executeWrite } = await importDbModule();

    const first = executeWrite('INSERT first');
    await vi.waitFor(() => expect(started).toEqual(['INSERT first']));
    const second = executeWrite('INSERT second');
    await Promise.resolve();

    expect(started).toEqual(['INSERT first']);

    firstWrite.resolve();
    await vi.waitFor(() => expect(started).toEqual(['INSERT first', 'INSERT second']));
    secondWrite.resolve();
    await Promise.all([first, second]);
  });

  it('runs foreground writes before queued background writes', async () => {
    const runningBackground = deferred();
    const queuedBackground = deferred();
    const foregroundWrite = deferred();
    const started: string[] = [];
    mocks.execute.mockImplementation((sql: string) => {
      if (sql.startsWith('PRAGMA')) {
        return Promise.resolve(undefined);
      }

      started.push(sql);
      if (sql === 'INSERT background running') {
        return runningBackground.promise;
      }
      if (sql === 'INSERT background queued') {
        return queuedBackground.promise;
      }
      if (sql === 'INSERT foreground') {
        return foregroundWrite.promise;
      }
      return Promise.resolve(undefined);
    });
    const { executeBackgroundWrite, executeWrite } = await importDbModule();

    const first = executeBackgroundWrite('INSERT background running');
    await vi.waitFor(() => expect(started).toEqual(['INSERT background running']));
    const second = executeBackgroundWrite('INSERT background queued');
    const foreground = executeWrite('INSERT foreground');
    await Promise.resolve();

    expect(started).toEqual(['INSERT background running']);

    runningBackground.resolve();
    await vi.waitFor(() => expect(started).toEqual(['INSERT background running', 'INSERT foreground']));
    foregroundWrite.resolve();
    await vi.waitFor(() =>
      expect(started).toEqual(['INSERT background running', 'INSERT foreground', 'INSERT background queued']),
    );
    queuedBackground.resolve();
    await Promise.all([first, second, foreground]);
  });

  it('continues processing foreground writes after a background write fails', async () => {
    const started: string[] = [];
    mocks.execute.mockImplementation((sql: string) => {
      if (sql.startsWith('PRAGMA')) {
        return Promise.resolve(undefined);
      }

      started.push(sql);
      if (sql === 'INSERT background fail') {
        return Promise.reject(new Error('background failed'));
      }
      return Promise.resolve(undefined);
    });
    const { executeBackgroundWrite, executeWrite } = await importDbModule();

    await expect(executeBackgroundWrite('INSERT background fail')).rejects.toThrow('background failed');
    await executeWrite('INSERT foreground after failure');

    expect(started).toEqual(['INSERT background fail', 'INSERT foreground after failure']);
  });

  it('does not issue manual transaction statements through the pooled sql plugin connection', async () => {
    const order: string[] = [];
    mocks.execute.mockImplementation((sql: string) => {
      if (sql.startsWith('PRAGMA')) {
        return Promise.resolve(undefined);
      }

      order.push(sql);
      return Promise.resolve(undefined);
    });
    const { runInTransaction } = await importDbModule();

    await runInTransaction(async (db) => {
      await db.execute('INSERT first');
      await db.execute('INSERT second');
    });

    expect(order).toEqual(['INSERT first', 'INSERT second']);
  });

  it('runs foreground writes before queued background write batches', async () => {
    const runningBackground = deferred();
    const queuedBackgroundTransaction = deferred();
    const foregroundWrite = deferred();
    const started: string[] = [];
    mocks.execute.mockImplementation((sql: string) => {
      if (sql.startsWith('PRAGMA')) {
        return Promise.resolve(undefined);
      }

      started.push(sql);
      if (sql === 'INSERT background running') {
        return runningBackground.promise;
      }
      if (sql === 'INSERT background transaction') {
        return queuedBackgroundTransaction.promise;
      }
      if (sql === 'INSERT foreground') {
        return foregroundWrite.promise;
      }
      return Promise.resolve(undefined);
    });
    const { executeBackgroundWrite, executeWrite, runBackgroundInTransaction } = await importDbModule();

    const first = executeBackgroundWrite('INSERT background running');
    await vi.waitFor(() => expect(started).toEqual(['INSERT background running']));
    const backgroundTransaction = runBackgroundInTransaction(async (db) => {
      await db.execute('INSERT background transaction');
    });
    const foreground = executeWrite('INSERT foreground');
    await Promise.resolve();

    expect(started).toEqual(['INSERT background running']);

    runningBackground.resolve();
    await vi.waitFor(() => expect(started).toEqual(['INSERT background running', 'INSERT foreground']));
    foregroundWrite.resolve();
    await vi.waitFor(() =>
      expect(started).toEqual([
        'INSERT background running',
        'INSERT foreground',
        'INSERT background transaction',
      ]),
    );
    queuedBackgroundTransaction.resolve();
    await Promise.all([first, backgroundTransaction, foreground]);
  });

  it('keeps a serialized write batch exclusive until the callback finishes', async () => {
    const firstInsert = deferred();
    const outsideWrite = deferred();
    const order: string[] = [];
    mocks.execute.mockImplementation((sql: string) => {
      if (sql.startsWith('PRAGMA')) {
        return Promise.resolve(undefined);
      }

      order.push(sql);
      if (sql === 'INSERT first') {
        return firstInsert.promise;
      }
      if (sql === 'INSERT outside') {
        return outsideWrite.promise;
      }
      return Promise.resolve(undefined);
    });
    const { executeWrite, runInTransaction } = await importDbModule();

    const batch = runInTransaction(async (db) => {
      await db.execute('INSERT first');
      await db.execute('INSERT second');
    });
    await vi.waitFor(() => expect(order).toEqual(['INSERT first']));

    const outside = executeWrite('INSERT outside');
    await Promise.resolve();
    expect(order).toEqual(['INSERT first']);

    firstInsert.resolve();
    await vi.waitFor(() =>
      expect(order).toEqual(['INSERT first', 'INSERT second', 'INSERT outside']),
    );
    outsideWrite.resolve();
    await Promise.all([batch, outside]);
  });
});
