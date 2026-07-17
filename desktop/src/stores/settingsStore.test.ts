import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, type AppSettings } from '../types/settings';
import { useSettingsStore } from './settingsStore';

const mocks = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  updateSetting: vi.fn(),
  applySettings: vi.fn(),
  readAutostart: vi.fn(),
  ensureUsableWindowBounds: vi.fn(),
}));

vi.mock('../services/settingsService', () => ({
  settingsService: {
    loadSettings: mocks.loadSettings,
    updateSetting: mocks.updateSetting,
    applySettings: mocks.applySettings,
    resetWindowSettings: vi.fn(async () => defaultSettings),
  },
}));

vi.mock('../services/windowService', () => ({
  windowService: {
    readAutostart: mocks.readAutostart,
    ensureUsableWindowBounds: mocks.ensureUsableWindowBounds,
    resetWindowBounds: vi.fn(async () => undefined),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

describe('settings store persistence behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      settings: { ...defaultSettings },
      isLoading: false,
    });
    mocks.loadSettings.mockResolvedValue({ ...defaultSettings });
    mocks.applySettings.mockResolvedValue(undefined);
    mocks.readAutostart.mockResolvedValue(defaultSettings.autostart);
    mocks.ensureUsableWindowBounds.mockResolvedValue(undefined);
  });

  it('checks restored window bounds whenever startup settings load', async () => {
    await useSettingsStore.getState().loadSettings();

    expect(mocks.applySettings).toHaveBeenCalledTimes(1);
    expect(mocks.ensureUsableWindowBounds).toHaveBeenCalledTimes(1);
  });

  it('applies setting changes optimistically while persistence is pending', async () => {
    const save = deferred<AppSettings>();
    mocks.updateSetting.mockReturnValueOnce(save.promise);

    const update = useSettingsStore.getState().updateSetting('showOnStartup', false);

    expect(useSettingsStore.getState().settings.showOnStartup).toBe(false);
    save.resolve({ ...defaultSettings, showOnStartup: false });
    await update;
    expect(useSettingsStore.getState().settings.showOnStartup).toBe(false);
  });

  it('keeps the newest setting when an older save finishes later', async () => {
    const olderSave = deferred<AppSettings>();
    const newerSave = deferred<AppSettings>();
    mocks.updateSetting.mockImplementationOnce(() => olderSave.promise);
    mocks.updateSetting.mockImplementationOnce(() => newerSave.promise);

    const olderUpdate = useSettingsStore.getState().updateSetting('opacity', 0.6);
    const newerUpdate = useSettingsStore.getState().updateSetting('opacity', 0.8);

    expect(useSettingsStore.getState().settings.opacity).toBe(0.8);
    newerSave.resolve({ ...defaultSettings, opacity: 0.8 });
    await newerUpdate;
    olderSave.resolve({ ...defaultSettings, opacity: 0.6 });
    await olderUpdate;

    expect(useSettingsStore.getState().settings.opacity).toBe(0.8);
  });

  it('reloads settings from storage when the newest save fails', async () => {
    mocks.updateSetting.mockRejectedValueOnce(new Error('save failed'));
    mocks.loadSettings.mockResolvedValueOnce({ ...defaultSettings, opacity: 0.7 });

    const update = useSettingsStore.getState().updateSetting('opacity', 0.9);

    expect(useSettingsStore.getState().settings.opacity).toBe(0.9);
    await expect(update).rejects.toThrow('save failed');
    expect(mocks.loadSettings).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().settings.opacity).toBe(0.7);
  });
});
