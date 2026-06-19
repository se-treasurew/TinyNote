import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AboutPanel } from './AboutPanel';
import { useUiStore } from '../stores/uiStore';

const mocks = vi.hoisted(() => ({
  getAboutInfo: vi.fn(),
  openGitHub: vi.fn(),
  checkForUpdate: vi.fn(),
  installUpdate: vi.fn(),
}));

vi.mock('../services/appUpdateService', () => ({
  appUpdateService: {
    getAboutInfo: mocks.getAboutInfo,
    openGitHub: mocks.openGitHub,
    checkForUpdate: mocks.checkForUpdate,
    installUpdate: mocks.installUpdate,
  },
}));

describe('AboutPanel update workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAboutInfo.mockResolvedValue({
      productName: 'TinyNote',
      displayName: '小笺',
      version: '1.0.1',
      githubUrl: 'https://github.com/se-treasurew/TinyNote',
    });
    mocks.checkForUpdate.mockResolvedValue(null);
    mocks.installUpdate.mockResolvedValue(undefined);
    useUiStore.setState({
      closePanel: vi.fn(),
    });
  });

  it('shows app introduction, version, GitHub link, and update actions', async () => {
    render(<AboutPanel />);

    expect(await screen.findByText('小笺')).toBeInTheDocument();
    expect(screen.getByText('TinyNote')).toBeInTheDocument();
    expect(screen.getByText('当前版本 v1.0.1')).toBeInTheDocument();
    expect(screen.getByText('轻量的桌面任务便签，用来安放今天、每日和多日事项。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开 GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '检查更新' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更新' })).toBeDisabled();
  });

  it('opens the GitHub repository from the panel', async () => {
    render(<AboutPanel />);

    fireEvent.click(await screen.findByRole('button', { name: '打开 GitHub' }));

    expect(mocks.openGitHub).toHaveBeenCalledTimes(1);
  });

  it('reports when no update is available', async () => {
    render(<AboutPanel />);

    fireEvent.click(await screen.findByRole('button', { name: '检查更新' }));

    expect(await screen.findByText('当前已是最新版本')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更新' })).toBeDisabled();
  });

  it('enables install after finding an update and shows download progress', async () => {
    const update = {
      version: '1.0.1',
      currentVersion: '1.0.0',
      body: '修复体验问题',
      date: '2026-06-19T00:00:00.000Z',
    };
    mocks.checkForUpdate.mockResolvedValue(update);
    mocks.installUpdate.mockImplementation(async (_pendingUpdate, onProgress) => {
      onProgress({ phase: 'progress', downloaded: 50, total: 100, percent: 50 });
    });

    render(<AboutPanel />);

    fireEvent.click(await screen.findByRole('button', { name: '检查更新' }));
    expect(await screen.findByText('发现新版本 v1.0.1')).toBeInTheDocument();
    expect(screen.getByText('修复体验问题')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '更新' }));

    await waitFor(() => {
      expect(mocks.installUpdate).toHaveBeenCalledWith(update, expect.any(Function));
    });
    expect(await screen.findByText('正在下载更新 50%')).toBeInTheDocument();
  });

  it('shows a readable error when update check fails', async () => {
    mocks.checkForUpdate.mockRejectedValue(new Error('network down'));

    render(<AboutPanel />);
    fireEvent.click(await screen.findByRole('button', { name: '检查更新' }));

    expect(await screen.findByText('更新失败：network down')).toBeInTheDocument();
  });
});
