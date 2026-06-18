import { Archive, Info, ListTodo, Lock, Minus, Pin, PinOff, Settings, Unlock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { useSettingsStore } from '../stores/settingsStore';
import { useUiStore } from '../stores/uiStore';
import { windowService } from '../services/windowService';

export function TitleBar() {
  const settings = useSettingsStore((state) => state.settings);
  const toggleLockWindow = useSettingsStore((state) => state.toggleLockWindow);
  const toggleTopmost = useSettingsStore((state) => state.toggleTopmost);
  const openPanel = useUiStore((state) => state.openPanel);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    let active = true;
    // getVersion reads from tauri.conf.json at runtime, so the title bar never
    // holds a hardcoded version that drifts from the configured one. Guarded so
    // non-Tauri environments (tests, browser) don't throw.
    getVersion()
      .then((version) => {
        if (active) setAppVersion(version);
      })
      .catch(() => {
        if (active) setAppVersion('');
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <header
      className="title-bar"
      onMouseDown={() => {
        void windowService.startDragIfUnlocked(settings.lockWindow);
      }}
    >
      <div className="title-copy">
        <strong>小笺</strong>
        {appVersion && <span>v{appVersion}</span>}
      </div>
      <nav className="title-actions" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" title="任务管理" aria-label="任务管理" onClick={() => openPanel('taskManage')}>
          <ListTodo size={16} />
        </button>
        <button type="button" title="归档" aria-label="归档" onClick={() => openPanel('archive')}>
          <Archive size={16} />
        </button>
        <button type="button" title="关于 TinyNote" aria-label="关于 TinyNote" onClick={() => openPanel('about')}>
          <Info size={16} />
        </button>
        <button type="button" title="固定桌面" aria-label="固定桌面" onClick={() => void toggleLockWindow()}>
          {settings.lockWindow ? <Lock size={16} /> : <Unlock size={16} />}
        </button>
        <button type="button" title="置顶" aria-label="置顶" onClick={() => void toggleTopmost()}>
          {settings.alwaysOnTop ? <Pin size={16} /> : <PinOff size={16} />}
        </button>
        <button type="button" title="设置" aria-label="设置" onClick={() => openPanel('settings')}>
          <Settings size={16} />
        </button>
        <button type="button" title="最小化" aria-label="最小化" onClick={() => void windowService.minimizeWindow()}>
          <Minus size={16} />
        </button>
      </nav>
    </header>
  );
}
