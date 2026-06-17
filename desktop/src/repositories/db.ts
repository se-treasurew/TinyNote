import Database from '@tauri-apps/plugin-sql';
import { defaultSettings, type AppSettings } from '../types/settings';

export const DATABASE_URL = 'sqlite:tinynote.db';

export type TinyNoteDatabase = Awaited<ReturnType<typeof Database.load>>;

let database: TinyNoteDatabase | null = null;

export async function getDb(): Promise<TinyNoteDatabase> {
  if (!database) {
    database = await Database.load(DATABASE_URL);
  }

  return database;
}

export async function initializeDatabase(): Promise<void> {
  await getDb();
  await initializeDefaultSettings();
}

const SQLITE_BUSY_CODE = '(code: 5)';

function isBusy(error: unknown): boolean {
  return error instanceof Error && error.message.includes(SQLITE_BUSY_CODE);
}

async function beginTransaction(db: TinyNoteDatabase): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.execute('BEGIN IMMEDIATE');
      return;
    } catch (error) {
      if (isBusy(error) && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      throw error;
    }
  }
}

export async function runInTransaction<T>(callback: (db: TinyNoteDatabase) => Promise<T>): Promise<T> {
  const db = await getDb();
  await beginTransaction(db);
  try {
    const result = await callback(db);
    await db.execute('COMMIT');
    return result;
  } catch (error) {
    try {
      await db.execute('ROLLBACK');
    } catch {
      /* preserve original error */
    }
    throw error;
  }
}

export async function initializeDefaultSettings(): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  await Promise.all(
    Object.entries(defaultSettings).map(([key, value]) =>
      db.execute(
        `INSERT OR IGNORE INTO app_settings (key, value, updated_at)
         VALUES ($1, $2, $3)`,
        [key, JSON.stringify(value), now],
      ),
    ),
  );
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
