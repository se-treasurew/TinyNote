import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { getCurrentWindow, LogicalPosition, LogicalSize } from '@tauri-apps/api/window';
import { saveWindowState, StateFlags } from '@tauri-apps/plugin-window-state';
import type { AppSettings } from '../types/settings';

const MIN_WINDOW_WIDTH = 320;
const MIN_WINDOW_HEIGHT = 520;
const DEFAULT_WINDOW_WIDTH = 360;
const DEFAULT_WINDOW_HEIGHT = 620;

async function ensureUsableWindowBounds(): Promise<boolean> {
  const win = getCurrentWindow();
  const [size, rawScaleFactor] = await Promise.all([
    win.innerSize(),
    win.scaleFactor(),
  ]);
  const scaleFactor = Number.isFinite(rawScaleFactor) && rawScaleFactor > 0
    ? rawScaleFactor
    : 1;
  const logicalWidth = size.width / scaleFactor;
  const logicalHeight = size.height / scaleFactor;

  if (logicalWidth >= MIN_WINDOW_WIDTH && logicalHeight >= MIN_WINDOW_HEIGHT) {
    return false;
  }

  await win.setSize(new LogicalSize(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT));
  return true;
}

export const windowService = {
  async applySettings(settings: AppSettings): Promise<void> {
    const win = getCurrentWindow();
    await Promise.all([
      win.setAlwaysOnTop(settings.alwaysOnTop),
      win.setResizable(!settings.lockWindow),
    ]);
    document.documentElement.style.setProperty('--window-opacity', String(settings.opacity));
    document.documentElement.style.setProperty('--app-font-size', `${settings.fontSize}px`);
    document.documentElement.style.setProperty(
      '--custom-background-image',
      settings.backgroundImageDataUrl ? `url("${settings.backgroundImageDataUrl}")` : 'none',
    );
    document.documentElement.dataset.theme = settings.theme;
  },

  async startDragIfUnlocked(locked: boolean): Promise<void> {
    if (!locked) {
      await getCurrentWindow().startDragging();
    }
  },

  async minimizeWindow(): Promise<void> {
    await getCurrentWindow().minimize();
  },

  ensureUsableWindowBounds,

  async prepareForUpdateRelaunch(): Promise<void> {
    await getCurrentWindow().unminimize();
    await ensureUsableWindowBounds();
    await saveWindowState(StateFlags.ALL);
  },

  async setAutostart(enabled: boolean): Promise<void> {
    if (enabled) {
      await enable();
    } else {
      await disable();
    }
  },

  async readAutostart(): Promise<boolean> {
    return isEnabled();
  },

  async resetWindowBounds(): Promise<void> {
    const win = getCurrentWindow();
    await win.setSize(new LogicalSize(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT));
    await win.setPosition(new LogicalPosition(80, 80));
  },
};
