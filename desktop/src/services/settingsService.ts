import { SettingsRepository } from '../repositories/settingsRepository';
import { defaultSettings, type AppSettings, type AppSettingKey } from '../types/settings';
import { writeSyncLog } from './syncLogService';
import { windowService } from './windowService';

const settingsRepository = new SettingsRepository();

export class SettingsService {
  async loadSettings(): Promise<AppSettings> {
    return settingsRepository.load();
  }

  async updateSetting<K extends AppSettingKey>(key: K, value: AppSettings[K]): Promise<AppSettings> {
    await settingsRepository.set(key, value);
    await writeSyncLog({ entityType: 'setting', entityId: key, operation: 'update', payload: { key, value } });
    const settings = await settingsRepository.load();
    await this.applyNativeSetting(key, value);
    return settings;
  }

  async resetWindowSettings(): Promise<AppSettings> {
    await settingsRepository.setMany({
      lockWindow: defaultSettings.lockWindow,
      alwaysOnTop: defaultSettings.alwaysOnTop,
      opacity: defaultSettings.opacity,
    });
    await windowService.applySettings(defaultSettings);
    return settingsRepository.load();
  }

  async applySettings(settings: AppSettings): Promise<void> {
    await windowService.applySettings(settings);
  }

  private async applyNativeSetting<K extends AppSettingKey>(key: K, value: AppSettings[K]): Promise<void> {
    if (key === 'lockWindow' || key === 'alwaysOnTop' || key === 'opacity') {
      const settings = await settingsRepository.load();
      await windowService.applySettings(settings);
    }

    if (key === 'autostart') {
      await windowService.setAutostart(Boolean(value));
    }
  }
}

export const settingsService = new SettingsService();
