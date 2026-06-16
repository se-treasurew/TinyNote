import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { getCurrentWindow, LogicalPosition, LogicalSize } from '@tauri-apps/api/window';
import type { AppSettings } from '../types/settings';

export const windowService = {
  async applySettings(settings: AppSettings): Promise<void> {
    const win = getCurrentWindow();
    await Promise.all([
      win.setAlwaysOnTop(settings.alwaysOnTop),
      win.setResizable(!settings.lockWindow),
    ]);
    document.documentElement.style.setProperty('--window-opacity', String(settings.opacity));
    document.documentElement.style.setProperty('--app-font-size', `${settings.fontSize}px`);
    document.documentElement.dataset.theme = settings.theme;
  },

  async startDragIfUnlocked(locked: boolean): Promise<void> {
    if (!locked) {
      await getCurrentWindow().startDragging();
    }
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
    await win.setSize(new LogicalSize(360, 620));
    await win.setPosition(new LogicalPosition(80, 80));
  },
};
