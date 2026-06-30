import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('GitHub release workflow', () => {
  it('builds Windows updater releases from the desktop Tauri project', () => {
    const workflow = readFileSync(resolve(process.cwd(), '../.github/workflows/release.yml'), 'utf8');

    expect(workflow).toContain('windows-latest');
    expect(workflow).toContain('tauri-apps/tauri-action@v0.6.2');
    expect(workflow).toContain('projectPath: desktop');
    expect(workflow).toContain('uploadUpdaterJson: true');
    expect(workflow).toContain('updaterJsonPreferNsis: true');
    expect(workflow).toContain('releaseBody: ${{ steps.release_notes.outputs.body }}');
    expect(workflow).toContain('id: tauri_build');
    expect(workflow).toContain('release-notes.md');
    expect(workflow).toContain('gh release edit');
    expect(workflow).toContain('--target $env:RELEASE_COMMIT');
    expect(workflow).toContain('RELEASE_COMMIT: ${{ github.sha }}');
    expect(workflow).toContain('steps.tauri_build.outputs.appVersion');
    expect(workflow).toContain('TAURI_SIGNING_PRIVATE_KEY');
    expect(workflow).toContain("tags:");
    expect(workflow).toContain("'v*'");
  });

  it('extracts the current version notes from the changelog for GitHub releases', () => {
    const changelog = readFileSync(resolve(process.cwd(), '../CHANGELOG.md'), 'utf8');
    const notes = execFileSync(process.execPath, [resolve(process.cwd(), '../.github/scripts/extract-release-notes.mjs')], {
      cwd: resolve(process.cwd(), '..'),
      encoding: 'utf8',
    });

    expect(changelog).toContain('## [1.2.1]');
    expect(changelog).toContain('## [1.2.0]');
    expect(changelog).toContain('## [1.1.0]');
    expect(changelog).toContain('## [1.0.0]');
    expect(notes).toContain('进度达到 100%');
    expect(notes).toContain('截止 6月30日');
    expect(notes).toContain('应用图标');
    expect(notes).not.toContain('## [1.2.0]');
    expect(notes).not.toContain('## [1.1.0]');
    expect(notes).not.toContain('## [1.0.0]');
  });
});
