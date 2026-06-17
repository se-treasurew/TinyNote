export type ThemeMode =
  | 'system'
  | 'glass-blue'
  | 'glass-white'
  | 'glass-mint'
  | 'glass-violet'
  | 'light'
  | 'dark';

export interface AppSettings {
  visibleDays: 3 | 7 | 14;
  completeToArchive: boolean;
  autostart: boolean;
  showOnStartup: boolean;
  startMinimizedToTray: boolean;
  lockWindow: boolean;
  alwaysOnTop: boolean;
  opacity: number;
  theme: ThemeMode;
  fontSize: number;
  backgroundImageDataUrl: string | null;
}

export type AppSettingKey = keyof AppSettings;

export interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

export const defaultSettings: AppSettings = {
  visibleDays: 7,
  completeToArchive: false,
  autostart: false,
  showOnStartup: true,
  startMinimizedToTray: false,
  lockWindow: false,
  alwaysOnTop: false,
  opacity: 0.82,
  theme: 'glass-blue',
  fontSize: 13,
  backgroundImageDataUrl: null,
};
