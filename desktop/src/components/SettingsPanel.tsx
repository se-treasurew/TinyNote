import { Download, RotateCcw, Upload, X } from 'lucide-react';
import { ChangeEvent } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { useTaskStore } from '../stores/taskStore';
import { useRoutineStore } from '../stores/routineStore';
import { useUiStore } from '../stores/uiStore';
import { dataPortabilityService } from '../services/dataPortabilityService';
import type { TinyNoteExport } from '../services/syncService';
import type { ThemeMode } from '../types/settings';

export function SettingsPanel() {
  const settings = useSettingsStore((state) => state.settings);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const resetWindow = useSettingsStore((state) => state.resetWindow);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const loadTasks = useTaskStore((state) => state.loadTasks);
  const loadRoutines = useRoutineStore((state) => state.loadRoutines);
  const closePanel = useUiStore((state) => state.closePanel);

  async function exportJson() {
    const payload = await dataPortabilityService.exportData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tinynote-${payload.exportedAt.slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const payload = JSON.parse(text) as TinyNoteExport;
    await dataPortabilityService.importData(payload);
    await loadSettings();
    await loadRoutines();
    await loadTasks();
  }

  return (
    <aside className="panel">
      <header className="panel-header">
        <strong>设置</strong>
        <button type="button" aria-label="关闭" onClick={closePanel}>
          <X size={16} />
        </button>
      </header>
      <div className="settings-grid">
        <label>
          <span>展示天数</span>
          <select
            value={settings.visibleDays}
            onChange={(event) => void updateSetting('visibleDays', Number(event.target.value) as 3 | 7 | 14)}
          >
            <option value={3}>3</option>
            <option value={7}>7</option>
            <option value={14}>14</option>
          </select>
        </label>
        <label>
          <span>完成归档</span>
          <input
            type="checkbox"
            checked={settings.completeToArchive}
            onChange={(event) => void updateSetting('completeToArchive', event.target.checked)}
          />
        </label>
        <label>
          <span>开机启动</span>
          <input
            type="checkbox"
            checked={settings.autostart}
            onChange={(event) => void updateSetting('autostart', event.target.checked)}
          />
        </label>
        <label>
          <span>启动显示</span>
          <input
            type="checkbox"
            checked={settings.showOnStartup}
            onChange={(event) => void updateSetting('showOnStartup', event.target.checked)}
          />
        </label>
        <label>
          <span>固定桌面</span>
          <input
            type="checkbox"
            checked={settings.lockWindow}
            onChange={(event) => void updateSetting('lockWindow', event.target.checked)}
          />
        </label>
        <label>
          <span>置顶</span>
          <input
            type="checkbox"
            checked={settings.alwaysOnTop}
            onChange={(event) => void updateSetting('alwaysOnTop', event.target.checked)}
          />
        </label>
        <label>
          <span>透明度</span>
          <input
            type="range"
            min="0.62"
            max="1"
            step="0.02"
            value={settings.opacity}
            onChange={(event) => void updateSetting('opacity', Number(event.target.value))}
          />
        </label>
        <label>
          <span>主题</span>
          <select
            aria-label="主题"
            value={settings.theme}
            onChange={(event) => void updateSetting('theme', event.target.value as ThemeMode)}
          >
            <option value="system">跟随系统</option>
            <option value="glass-blue">玻璃蓝</option>
            <option value="glass-white">玻璃白</option>
            <option value="glass-mint">薄荷玻璃</option>
            <option value="glass-violet">暮紫玻璃</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </label>
        <label>
          <span>字号</span>
          <input
            type="number"
            min="12"
            max="18"
            value={settings.fontSize}
            onChange={(event) => void updateSetting('fontSize', Number(event.target.value))}
          />
        </label>
      </div>
      <div className="panel-toolbar">
        <button type="button" aria-label="恢复窗口" onClick={() => void resetWindow()}>
          <RotateCcw size={15} />
        </button>
        <button type="button" aria-label="导出 JSON" onClick={() => void exportJson()}>
          <Download size={15} />
        </button>
        <label className="icon-upload">
          <Upload size={15} />
          <input type="file" accept="application/json" onChange={(event) => void importJson(event)} />
        </label>
      </div>
    </aside>
  );
}
