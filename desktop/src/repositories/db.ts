import Database from '@tauri-apps/plugin-sql';
import { defaultSettings, type AppSettings } from '../types/settings';

export const DATABASE_URL = 'sqlite:tinynote.db';

export type TinyNoteDatabase = Awaited<ReturnType<typeof Database.load>>;

let database: TinyNoteDatabase | null = null;
let databasePromise: Promise<TinyNoteDatabase> | null = null;
type WritePriority = 'foreground' | 'background';

interface QueuedWrite<T = unknown> {
  operation: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

const foregroundWriteQueue: QueuedWrite[] = [];
const backgroundWriteQueue: QueuedWrite[] = [];
let isWriteQueueRunning = false;

export async function getDb(): Promise<TinyNoteDatabase> {
  if (database) {
    return database;
  }

  databasePromise ??= Database.load(DATABASE_URL)
    .then(async (loadedDatabase) => {
      await configureDatabase(loadedDatabase);
      database = loadedDatabase;
      return loadedDatabase;
    })
    .catch((error) => {
      databasePromise = null;
      throw error;
    });

  return databasePromise;
}

export async function initializeDatabase(): Promise<void> {
  await getDb();
  await initializeDefaultSettings();
}

const SQLITE_BUSY_PATTERN = /database is locked|SQLITE_BUSY|\(code:\s*5\)|code:\s*5/i;
const BUSY_RETRY_ATTEMPTS = 5;
const BUSY_RETRY_DELAY_MS = 100;

function isBusy(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return SQLITE_BUSY_PATTERN.test(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryOnBusy<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < BUSY_RETRY_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isBusy(error) || attempt === BUSY_RETRY_ATTEMPTS - 1) {
        throw error;
      }
      await delay(BUSY_RETRY_DELAY_MS);
    }
  }

  throw new Error('unreachable SQLite busy retry state');
}

async function configureDatabase(db: TinyNoteDatabase): Promise<void> {
  await retryOnBusy(() => db.execute('PRAGMA journal_mode=WAL'));
  await retryOnBusy(() => db.execute('PRAGMA busy_timeout=5000'));
}

function enqueueWrite<T>(operation: () => Promise<T>, priority: WritePriority): Promise<T> {
  const queue = priority === 'foreground' ? foregroundWriteQueue : backgroundWriteQueue;
  const promise = new Promise<T>((resolve, reject) => {
    queue.push({ operation, resolve, reject } as QueuedWrite);
  });

  void drainWriteQueue();
  return promise;
}

async function drainWriteQueue(): Promise<void> {
  if (isWriteQueueRunning) {
    return;
  }

  isWriteQueueRunning = true;
  try {
    while (foregroundWriteQueue.length > 0 || backgroundWriteQueue.length > 0) {
      const next = foregroundWriteQueue.shift() ?? backgroundWriteQueue.shift();
      if (!next) {
        continue;
      }

      try {
        const result = await next.operation();
        next.resolve(result);
      } catch (error) {
        next.reject(error);
      }
    }
  } finally {
    isWriteQueueRunning = false;
    if (foregroundWriteQueue.length > 0 || backgroundWriteQueue.length > 0) {
      void drainWriteQueue();
    }
  }
}

export async function executeWrite(sql: string, bindValues?: unknown[]): Promise<unknown> {
  const db = await getDb();
  return enqueueWrite(() => retryOnBusy(() => db.execute(sql, bindValues)), 'foreground');
}

export async function executeBackgroundWrite(sql: string, bindValues?: unknown[]): Promise<unknown> {
  const db = await getDb();
  return enqueueWrite(() => retryOnBusy(() => db.execute(sql, bindValues)), 'background');
}

// The Tauri SQL plugin executes commands through a pool, so manual BEGIN/COMMIT
// across separate invoke calls can land on different connections. Keep these
// batches serialized in JS instead of opening SQL transactions here.
export async function runInTransaction<T>(callback: (db: TinyNoteDatabase) => Promise<T>): Promise<T> {
  const db = await getDb();
  return enqueueWrite(() => callback(db), 'foreground');
}

export async function runBackgroundInTransaction<T>(callback: (db: TinyNoteDatabase) => Promise<T>): Promise<T> {
  const db = await getDb();
  return enqueueWrite(() => callback(db), 'background');
}

export async function initializeDefaultSettings(): Promise<void> {
  const now = new Date().toISOString();

  await runInTransaction(async (db) => {
    for (const [key, value] of Object.entries(defaultSettings)) {
      await retryOnBusy(() =>
        db.execute(
          `INSERT OR IGNORE INTO app_settings (key, value, updated_at)
           VALUES ($1, $2, $3)`,
          [key, JSON.stringify(value), now],
        ),
      );
    }
  });
}

export async function executeInTransaction(db: TinyNoteDatabase, sql: string, bindValues?: unknown[]): Promise<unknown> {
  return retryOnBusy(() => db.execute(sql, bindValues));
}

export async function selectWithRetry<T>(sql: string, bindValues?: unknown[]): Promise<T> {
  const db = await getDb();
  return retryOnBusy(() => db.select<T>(sql, bindValues));
}

export function parseSettingValue<K extends keyof AppSettings>(
  key: K,
  value: string,
): AppSettings[K] {
  try {
    return JSON.parse(value) as AppSettings[K];
  } catch {
    return defaultSettings[key];
  }
}
