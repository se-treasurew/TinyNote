import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface CapabilityFile {
  permissions: string[];
}

describe('Tauri main capability ACL', () => {
  it('allows the SQL commands used by TinyNote repositories', () => {
    const capabilityPath = resolve(process.cwd(), 'src-tauri/capabilities/default.json');
    const capability = JSON.parse(readFileSync(capabilityPath, 'utf8')) as CapabilityFile;

    expect(capability.permissions).toContain('sql:default');
    expect(capability.permissions).toContain('sql:allow-execute');
  });
});
