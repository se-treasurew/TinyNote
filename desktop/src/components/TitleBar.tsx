import { Archive, Lock, Pin, PinOff, Settings, Unlock } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';
import { useUiStore } from '../stores/uiStore';
import { windowService } from '../services/windowService';

export function TitleBar() {
  const settings = useSettingsStore((state) => state.settings);
  const toggleLockWindow = useSettingsStore((state) => state.toggleLockWindow);
  const toggleTopmost = useSettingsStore((state) => state.toggleTopmost);
  const openPanel = useUiStore((state) => state.openPanel);

  return (
    <header
      className="title-bar"
      onMouseDown={() => {
        void windowService.startDragIfUnlocked(settings.lockWindow);
      }}
    >
      <div className="title-copy">
        <strong>小笺</strong>
        <span>v0.1.11</span>
      </div>
      <nav className="title-actions" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" title="归档" aria-label="归档" onClick={() => openPanel('archive')}>
          <Archive size={16} />
        </button>
        <button type="button" title="固定桌面" aria-label="固定桌面" onClick={() => void toggleLockWindow()}>
          {settings.lockWindow ? <Lock size={16} /> : <Unlock size={16} />}
        </button>
        <button type="button" title="置顶" aria-label="置顶" onClick={() => void toggleTopmost()}>
          {settings.alwaysOnTop ? <PinOff size={16} /> : <Pin size={16} />}
        </button>
        <button type="button" title="设置" aria-label="设置" onClick={() => openPanel('settings')}>
          <Settings size={16} />
        </button>
      </nav>
    </header>
  );
}
