import { create } from 'zustand';
import { defaultSettings, type AppSettings, type AppSettingKey } from '../types/settings';
import { settingsService } from '../services/settingsService';
import { windowService } from '../services/windowService';

interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  loadSettings: () => Promise<AppSettings>;
  updateSetting: <K extends AppSettingKey>(key: K, value: AppSettings[K]) => Promise<void>;
  toggleTopmost: () => Promise<void>;
  toggleLockWindow: () => Promise<void>;
  toggleAutostart: () => Promise<void>;
  resetWindow: () => Promise<void>;
}

let latestSettingsUpdateId = 0;

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  isLoading: false,

  async loadSettings() {
    set({ isLoading: true });
    const settings = await settingsService.loadSettings();
    const autostart = await windowService.readAutostart().catch(() => settings.autostart);
    const merged = { ...settings, autostart };
    await settingsService.applySettings(merged);
    set({ settings: merged, isLoading: false });
    return merged;
  },

  async updateSetting(key, value) {
    const updateId = ++latestSettingsUpdateId;
    set({ settings: { ...get().settings, [key]: value } });

    try {
      const settings = await settingsService.updateSetting(key, value);
      if (updateId === latestSettingsUpdateId) {
        set({ settings });
      }
    } catch (error) {
      if (updateId === latestSettingsUpdateId) {
        const dbSettings = await settingsService.loadSettings().catch(() => null);
        if (dbSettings) {
          set({ settings: dbSettings });
        }
      }
      throw error;
    }
  },

  async toggleTopmost() {
    const next = !get().settings.alwaysOnTop;
    await get().updateSetting('alwaysOnTop', next);
  },

  async toggleLockWindow() {
    const next = !get().settings.lockWindow;
    await get().updateSetting('lockWindow', next);
  },

  async toggleAutostart() {
    const next = !get().settings.autostart;
    await get().updateSetting('autostart', next);
  },

  async resetWindow() {
    await windowService.resetWindowBounds();
    const settings = await settingsService.resetWindowSettings();
    set({ settings });
  },
}));
