import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function migrationSql(libRs: string, version: number): string {
  const marker = `version: ${version},`;
  const start = libRs.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const sqlStart = libRs.indexOf('sql: r#"', start);
  expect(sqlStart).toBeGreaterThanOrEqual(0);
  const bodyStart = sqlStart + 'sql: r#"'.length;
  const bodyEnd = libRs.indexOf('"#', bodyStart);
  expect(bodyEnd).toBeGreaterThan(bodyStart);

  return libRs.slice(bodyStart, bodyEnd);
}

describe('Tauri SQL migrations', () => {
  it('does not modify the already published version 1 migration', () => {
    const libRs = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');

    expect(migrationSql(libRs, 1)).not.toContain('PRAGMA');
  });

  it('keeps WAL setup in a newer migration for existing databases', () => {
    const libRs = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');

    expect(migrationSql(libRs, 2)).toContain('PRAGMA journal_mode=WAL');
  });

  it('adds task progress support and clears legacy routine-generated data in migration 3', () => {
    const libRs = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');
    const migration = migrationSql(libRs, 3);

    expect(migration).toContain('ALTER TABLE tasks ADD COLUMN end_date TEXT');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS task_progress_entries');
    expect(migration).toContain('UNIQUE(task_id, progress_date)');
    expect(migration).toContain("DELETE FROM tasks WHERE routine_id IS NOT NULL OR source_type = 'routine_daily'");
    expect(migration).toContain('DELETE FROM routine_instances');
    expect(migration).toContain('DELETE FROM routines');
  });

  it('adds explicit postpone metadata in migration 4', () => {
    const libRs = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');
    const migration = migrationSql(libRs, 4);

    expect(migration).toContain('ALTER TABLE tasks ADD COLUMN postponed_at TEXT');
  });

  it('adds task postponement history in migration 5', () => {
    const libRs = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');
    const migration = migrationSql(libRs, 5);

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS task_postponements');
    expect(migration).toContain('from_date TEXT NOT NULL');
    expect(migration).toContain('to_date TEXT NOT NULL');
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS idx_task_postponements_task_id');
  });

  it('converts archived records to completed and removes the archive setting in migration 6', () => {
    const libRs = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');
    const migration = migrationSql(libRs, 6);

    expect(migration).toContain("UPDATE tasks");
    expect(migration).toContain("status = 'completed'");
    expect(migration).toContain("WHERE status = 'archived'");
    expect(migration).toContain('UPDATE task_progress_entries');
    expect(migration).toContain("DELETE FROM app_settings WHERE key = 'completeToArchive'");
  });

  it('adds an index on parent_task_id to support subtask cascades in migration 7', () => {
    const libRs = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');
    const migration = migrationSql(libRs, 7);

    expect(migration).toContain('CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id)');
  });
});
