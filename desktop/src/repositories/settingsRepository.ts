import { defaultSettings, type AppSettings, type AppSettingKey, type SettingRow } from '../types/settings';
import { executeWrite, parseSettingValue, selectWithRetry } from './db';

export class SettingsRepository {
  async load(): Promise<AppSettings> {
    const rows = await selectWithRetry<SettingRow[]>('SELECT key, value, updated_at FROM app_settings');
    const settings = { ...defaultSettings };

    for (const row of rows) {
      if (row.key in defaultSettings) {
        const key = row.key as AppSettingKey;
        settings[key] = parseSettingValue(key, row.value) as never;
      }
    }

    return settings;
  }

  async set<K extends AppSettingKey>(key: K, value: AppSettings[K]): Promise<void> {
    await executeWrite(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), new Date().toISOString()],
    );
  }

  async setMany(settings: Partial<AppSettings>): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.set(key as AppSettingKey, value as never);
    }
  }
}
