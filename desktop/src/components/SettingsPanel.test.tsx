import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPanel } from './SettingsPanel';
import { defaultSettings, type AppSettings } from '../types/settings';
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
  const updateSetting = vi.fn(async () => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    const settings: AppSettings = { ...defaultSettings, theme: 'glass-blue', backgroundImageDataUrl: null };

    useSettingsStore.setState({
      settings,
      isLoading: false,
      updateSetting,
      resetWindow: vi.fn(async () => undefined),
      loadSettings: vi.fn(async () => settings),
    });
    useTaskStore.setState({
      loadTasks: vi.fn(async () => undefined),
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

  it('stores a valid custom background image as a data URL', async () => {
    render(<SettingsPanel />);

    const file = new File(['tiny-image'], 'background.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('背景图片'), { target: { files: [file] } });

    await waitFor(() => {
      expect(updateSetting).toHaveBeenCalledWith(
        'backgroundImageDataUrl',
        expect.stringMatching(/^data:image\/png;base64,/),
      );
    });
  });

  it('rejects unsupported or oversized background images without changing settings', async () => {
    render(<SettingsPanel />);

    fireEvent.change(screen.getByLabelText('背景图片'), {
      target: { files: [new File(['text'], 'note.txt', { type: 'text/plain' })] },
    });

    expect(await screen.findByText('请选择 PNG、JPG 或 WebP 图片')).toBeInTheDocument();
    expect(updateSetting).not.toHaveBeenCalledWith('backgroundImageDataUrl', expect.any(String));

    const largeFile = new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('背景图片'), { target: { files: [largeFile] } });

    expect(await screen.findByText('背景图片不能超过 3 MB')).toBeInTheDocument();
    expect(updateSetting).not.toHaveBeenCalledWith('backgroundImageDataUrl', expect.any(String));
  });

  it('clears the custom background image', () => {
    render(<SettingsPanel />);

    fireEvent.click(screen.getByRole('button', { name: '清除背景图片' }));

    expect(updateSetting).toHaveBeenCalledWith('backgroundImageDataUrl', null);
  });

  it('does not show the removed carry-progress setting', () => {
    render(<SettingsPanel />);

    expect(screen.queryByLabelText('进度顺延')).not.toBeInTheDocument();
  });

  it('does not show the removed complete-to-archive setting', () => {
    render(<SettingsPanel />);

    expect(screen.queryByText('完成归档')).not.toBeInTheDocument();
  });
});
