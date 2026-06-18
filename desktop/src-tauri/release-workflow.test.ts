import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('GitHub release workflow', () => {
  it('builds Windows updater releases from the desktop Tauri project', () => {
    const workflow = readFileSync(resolve(process.cwd(), '../.github/workflows/release.yml'), 'utf8');

    expect(workflow).toContain('windows-latest');
    expect(workflow).toContain('tauri-apps/tauri-action@v1');
    expect(workflow).toContain('projectPath: desktop');
    expect(workflow).toContain('uploadUpdaterJson: true');
    expect(workflow).toContain('updaterJsonPreferNsis: true');
    expect(workflow).toContain('TAURI_SIGNING_PRIVATE_KEY');
    expect(workflow).toContain("tags:");
    expect(workflow).toContain("'v*'");
  });
});
