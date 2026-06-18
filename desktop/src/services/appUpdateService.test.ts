import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getVersion: vi.fn(),
  check: vi.fn(),
  relaunch: vi.fn(),
  openUrl: vi.fn(),
}));

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: mocks.getVersion,
}));

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: mocks.check,
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: mocks.relaunch,
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: mocks.openUrl,
}));

const { appUpdateService } = await import('./appUpdateService');

describe('app update service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVersion.mockResolvedValue('1.0.0');
    mocks.check.mockResolvedValue(null);
    mocks.relaunch.mockResolvedValue(undefined);
    mocks.openUrl.mockResolvedValue(undefined);
  });

  it('returns static about information with the configured app version', async () => {
    const info = await appUpdateService.getAboutInfo();

    expect(info).toEqual({
      productName: 'TinyNote',
      displayName: '小笺',
      version: '1.0.0',
      githubUrl: 'https://github.com/se-treasurew/TinyNote',
    });
  });

  it('opens the GitHub repository URL', async () => {
    await appUpdateService.openGitHub();

    expect(mocks.openUrl).toHaveBeenCalledWith('https://github.com/se-treasurew/TinyNote');
  });

  it('returns null when no update is available', async () => {
    await expect(appUpdateService.checkForUpdate()).resolves.toBeNull();
  });

  it('returns update metadata and installs the pending update with progress', async () => {
    const downloadAndInstall = vi.fn(async (onEvent: (event: unknown) => void) => {
      onEvent({ event: 'Started', data: { contentLength: 100 } });
      onEvent({ event: 'Progress', data: { chunkLength: 40 } });
      onEvent({ event: 'Finished' });
    });
    mocks.check.mockResolvedValue({
      version: '1.0.1',
      currentVersion: '1.0.0',
      body: '修复体验问题',
      date: '2026-06-19T00:00:00.000Z',
      downloadAndInstall,
    });
    const progress = vi.fn();

    const update = await appUpdateService.checkForUpdate();
    await appUpdateService.installUpdate(update!, progress);

    expect(update).toEqual({
      version: '1.0.1',
      currentVersion: '1.0.0',
      body: '修复体验问题',
      date: '2026-06-19T00:00:00.000Z',
    });
    expect(progress).toHaveBeenCalledWith({ phase: 'started', downloaded: 0, total: 100, percent: 0 });
    expect(progress).toHaveBeenCalledWith({ phase: 'progress', downloaded: 40, total: 100, percent: 40 });
    expect(progress).toHaveBeenCalledWith({ phase: 'finished', downloaded: 40, total: 100, percent: 40 });
    expect(mocks.relaunch).toHaveBeenCalledTimes(1);
  });

  it('rejects install when there is no matching pending update', async () => {
    await expect(appUpdateService.installUpdate({
      version: '1.0.2',
      currentVersion: '1.0.0',
      body: '',
      date: null,
    }, vi.fn())).rejects.toThrow('没有可安装的更新，请先检查更新');
  });
});
