import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  innerSize: vi.fn(),
  scaleFactor: vi.fn(),
  setSize: vi.fn(),
  unminimize: vi.fn(),
  hide: vi.fn(),
  saveWindowState: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => {
  class LogicalSize {
    constructor(public width: number, public height: number) {}
  }

  class LogicalPosition {
    constructor(public x: number, public y: number) {}
  }

  return {
    getCurrentWindow: () => ({
      innerSize: mocks.innerSize,
      scaleFactor: mocks.scaleFactor,
      setSize: mocks.setSize,
      unminimize: mocks.unminimize,
      hide: mocks.hide,
    }),
    LogicalSize,
    LogicalPosition,
  };
});

vi.mock('@tauri-apps/plugin-window-state', () => ({
  StateFlags: { ALL: 63 },
  saveWindowState: mocks.saveWindowState,
}));

const { windowService } = await import('./windowService');

describe('window service bounds recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.innerSize.mockResolvedValue({ width: 540, height: 930 });
    mocks.scaleFactor.mockResolvedValue(1.5);
    mocks.setSize.mockResolvedValue(undefined);
    mocks.unminimize.mockResolvedValue(undefined);
    mocks.hide.mockResolvedValue(undefined);
    mocks.saveWindowState.mockResolvedValue(undefined);
  });

  it('hides the window to the tray (no taskbar) when minimized', async () => {
    await windowService.minimizeWindow();

    expect(mocks.hide).toHaveBeenCalledTimes(1);
  });

  it('restores a minimized Windows size to the default logical bounds', async () => {
    mocks.innerSize.mockResolvedValue({ width: 237, height: 39 });

    await windowService.ensureUsableWindowBounds();

    expect(mocks.setSize).toHaveBeenCalledWith(expect.objectContaining({
      width: 360,
      height: 620,
    }));
  });

  it('keeps valid high-DPI bounds unchanged', async () => {
    await windowService.ensureUsableWindowBounds();

    expect(mocks.setSize).not.toHaveBeenCalled();
  });

  it('unminimizes and saves usable bounds before an update relaunch', async () => {
    await windowService.prepareForUpdateRelaunch();

    expect(mocks.unminimize).toHaveBeenCalledTimes(1);
    expect(mocks.saveWindowState).toHaveBeenCalledWith(63);
    expect(mocks.unminimize.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.innerSize.mock.invocationCallOrder[0]);
    expect(mocks.innerSize.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.saveWindowState.mock.invocationCallOrder[0]);
  });
});
