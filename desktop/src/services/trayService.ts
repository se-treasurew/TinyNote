import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

type TrayEvent = 'show' | 'hide' | 'add-today-task' | 'toggle-lock' | 'toggle-topmost' | 'toggle-autostart';

export function registerTrayEvents(handler: (event: TrayEvent) => void): Promise<() => void> {
  return listen<TrayEvent>('tinynote://tray-event', (event) => {
    handler(event.payload);
  });
}

export const trayService = {
  async showWindow(): Promise<void> {
    const win = getCurrentWindow();
    await win.show();
    await win.setFocus();
  },

  async hideWindow(): Promise<void> {
    await getCurrentWindow().hide();
  },
};
