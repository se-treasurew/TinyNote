import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { defaultSettings } from '../types/settings';
import { useSettingsStore } from '../stores/settingsStore';
import { useTaskStore } from '../stores/taskStore';

const mocks = vi.hoisted(() => ({
  initializeDatabase: vi.fn(),
  isTauri: vi.fn(),
  registerTrayEvents: vi.fn(),
  hideWindow: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: mocks.isTauri,
}));

vi.mock('../repositories/db', () => ({
  initializeDatabase: mocks.initializeDatabase,
}));

vi.mock('../services/trayService', () => ({
  registerTrayEvents: mocks.registerTrayEvents,
  trayService: {
    hideWindow: mocks.hideWindow,
    showWindow: vi.fn(),
  },
}));

vi.mock('../pages/MainPage', () => ({
  MainPage: () => <main>主界面</main>,
}));

describe('App startup environment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.initializeDatabase.mockResolvedValue(undefined);
    mocks.isTauri.mockReturnValue(true);
    mocks.registerTrayEvents.mockResolvedValue(vi.fn());
    useSettingsStore.setState({
      settings: defaultSettings,
      isLoading: false,
      loadSettings: vi.fn(async () => defaultSettings),
      toggleAutostart: vi.fn(async () => undefined),
      toggleLockWindow: vi.fn(async () => undefined),
      toggleTopmost: vi.fn(async () => undefined),
    });
    useTaskStore.setState({
      loadTasks: vi.fn(async () => undefined),
      setSelectedDate: vi.fn(),
    });
  });

  it('stops before database initialization outside the Tauri runtime', async () => {
    mocks.isTauri.mockReturnValue(false);

    render(<App />);

    expect(await screen.findByText('TinyNote 启动失败')).toBeInTheDocument();
    expect(screen.getByText('请在 Tauri 桌面应用中打开 TinyNote，普通浏览器无法访问本地 SQLite 和窗口能力。')).toBeInTheDocument();
    expect(mocks.initializeDatabase).not.toHaveBeenCalled();
  });

  it('boots the main page inside the Tauri runtime', async () => {
    render(<App />);

    await waitFor(() => {
      expect(mocks.initializeDatabase).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('主界面')).toBeInTheDocument();
  });
});
