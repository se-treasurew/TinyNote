import { create } from 'zustand';

export type PanelName = 'main' | 'archive' | 'settings' | 'taskManage' | 'about';

interface UiState {
  currentPanel: PanelName;
  isArchiveOpen: boolean;
  isSettingsOpen: boolean;
  isTaskManageOpen: boolean;
  isAboutOpen: boolean;
  openPanel: (panel: PanelName) => void;
  closePanel: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  currentPanel: 'main',
  isArchiveOpen: false,
  isSettingsOpen: false,
  isTaskManageOpen: false,
  isAboutOpen: false,
  openPanel: (panel) =>
    set({
      currentPanel: panel,
      isArchiveOpen: panel === 'archive',
      isSettingsOpen: panel === 'settings',
      isTaskManageOpen: panel === 'taskManage',
      isAboutOpen: panel === 'about',
    }),
  closePanel: () =>
    set({
      currentPanel: 'main',
      isArchiveOpen: false,
      isSettingsOpen: false,
      isTaskManageOpen: false,
      isAboutOpen: false,
    }),
}));
