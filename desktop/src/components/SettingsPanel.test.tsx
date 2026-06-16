import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPanel } from './SettingsPanel';
import { defaultSettings } from '../types/settings';
import { useRoutineStore } from '../stores/routineStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useTaskStore } from '../stores/taskStore';
import { useUiStore } from '../stores/uiStore';

vi.mock('../services/dataPortabilityService', () => ({
  dataPortabilityService: {
    exportData: vi.fn(),
    importData: vi.fn(),
  },
}));

describe('SettingsPanel theme choices', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: { ...defaultSettings, theme: 'glass-blue' },
      isLoading: false,
      updateSetting: vi.fn(async () => undefined),
      resetWindow: vi.fn(async () => undefined),
      loadSettings: vi.fn(async () => ({ ...defaultSettings, theme: 'glass-blue' })),
    });
    useTaskStore.setState({
      loadTasks: vi.fn(async () => undefined),
    });
    useRoutineStore.setState({
      loadRoutines: vi.fn(async () => undefined),
    });
    useUiStore.setState({
      closePanel: vi.fn(),
    });
  });

  it('offers multiple glass theme variants', () => {
    render(<SettingsPanel />);

    const themeSelect = screen.getByLabelText('主题');
    const options = within(themeSelect).getAllByRole('option').map((option) => option.textContent);

    expect(options).toEqual(expect.arrayContaining(['玻璃蓝', '玻璃白', '薄荷玻璃', '暮紫玻璃']));
  });
});
