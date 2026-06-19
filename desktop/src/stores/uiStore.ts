import { create } from 'zustand';

export type PanelName = 'main' | 'settings' | 'taskManage' | 'about';

interface UiState {
  currentPanel: PanelName;
  isSettingsOpen: boolean;
  isTaskManageOpen: boolean;
  isAboutOpen: boolean;
  openPanel: (panel: PanelName) => void;
  closePanel: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  currentPanel: 'main',
  isSettingsOpen: false,
  isTaskManageOpen: false,
  isAboutOpen: false,
  openPanel: (panel) =>
    set({
      currentPanel: panel,
      isSettingsOpen: panel === 'settings',
      isTaskManageOpen: panel === 'taskManage',
      isAboutOpen: panel === 'about',
    }),
  closePanel: () =>
    set({
      currentPanel: 'main',
      isSettingsOpen: false,
      isTaskManageOpen: false,
      isAboutOpen: false,
    }),
}));
