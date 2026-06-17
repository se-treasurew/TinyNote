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
});
