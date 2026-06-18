import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { initializeDatabase } from '../repositories/db';
import { useSettingsStore } from '../stores/settingsStore';
import { useTaskStore } from '../stores/taskStore';
import { useUiStore } from '../stores/uiStore';
import { registerTrayEvents, trayService } from '../services/trayService';
import { todayIsoDate } from '../utils/date';
import { MainPage } from '../pages/MainPage';

export function App() {
  const [startupError, setStartupError] = useState<string | null>(null);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const toggleAutostart = useSettingsStore((state) => state.toggleAutostart);
  const toggleLockWindow = useSettingsStore((state) => state.toggleLockWindow);
  const toggleTopmost = useSettingsStore((state) => state.toggleTopmost);
  const loadTasks = useTaskStore((state) => state.loadTasks);
  const setSelectedDate = useTaskStore((state) => state.setSelectedDate);
  const openPanel = useUiStore((state) => state.openPanel);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function boot() {
      try {
        if (!isTauri()) {
          setStartupError('请在 Tauri 桌面应用中打开 TinyNote，普通浏览器无法访问本地 SQLite 和窗口能力。');
          return;
        }

        await initializeDatabase();
        const settings = await loadSettings();
        await loadTasks(settings.visibleDays, undefined, undefined, settings.carryProgressForward);
        if (settings.startMinimizedToTray || !settings.showOnStartup) {
          await trayService.hideWindow();
        }
        unlisten = await registerTrayEvents(async (event) => {
          if (event === 'show') await trayService.showWindow();
          if (event === 'hide') await trayService.hideWindow();
          if (event === 'add-today-task') {
            setSelectedDate(todayIsoDate());
            openPanel('main');
            await trayService.showWindow();
          }
          if (event === 'toggle-autostart') await toggleAutostart();
          if (event === 'toggle-lock') await toggleLockWindow();
          if (event === 'toggle-topmost') await toggleTopmost();
        });
      } catch (error) {
        setStartupError(error instanceof Error ? error.message : String(error));
      }
    }

    void boot();

    return () => {
      unlisten?.();
    };
  }, [loadSettings, loadTasks, openPanel, setSelectedDate, toggleAutostart, toggleLockWindow, toggleTopmost]);

  if (startupError) {
    return (
      <main className="startup-error">
        <strong>TinyNote 启动失败</strong>
        <span>{startupError}</span>
      </main>
    );
  }

  return <MainPage />;
}
