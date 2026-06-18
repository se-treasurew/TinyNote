import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TitleBar } from './TitleBar';
import { defaultSettings } from '../types/settings';
import { useSettingsStore } from '../stores/settingsStore';
import { useUiStore } from '../stores/uiStore';

const mocks = vi.hoisted(() => ({
  getVersion: vi.fn(),
  minimizeWindow: vi.fn(),
  startDragIfUnlocked: vi.fn(),
}));

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: mocks.getVersion,
}));

vi.mock('../services/windowService', () => ({
  windowService: {
    startDragIfUnlocked: mocks.startDragIfUnlocked,
    minimizeWindow: mocks.minimizeWindow,
  },
}));

describe('TitleBar utility actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVersion.mockResolvedValue('1.0.0');
    mocks.minimizeWindow.mockResolvedValue(undefined);
    useSettingsStore.setState({
      settings: defaultSettings,
      toggleLockWindow: vi.fn(async () => undefined),
      toggleTopmost: vi.fn(async () => undefined),
    });
    useUiStore.setState({
      currentPanel: 'main',
      isArchiveOpen: false,
      isSettingsOpen: false,
      isTaskManageOpen: false,
      isAboutOpen: false,
      openPanel: useUiStore.getState().openPanel,
      closePanel: useUiStore.getState().closePanel,
    });
  });

  it('opens the about panel from the information button', async () => {
    render(<TitleBar />);

    fireEvent.click(screen.getByRole('button', { name: '关于 TinyNote' }));

    expect(useUiStore.getState().currentPanel).toBe('about');
    await waitFor(() => {
      expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    });
  });

  it('minimizes the current window from the title bar', async () => {
    render(<TitleBar />);
    await screen.findByText('v1.0.0');

    fireEvent.click(screen.getByRole('button', { name: '最小化' }));

    expect(mocks.minimizeWindow).toHaveBeenCalledTimes(1);
  });
});
