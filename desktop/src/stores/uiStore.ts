import { create } from 'zustand';

export type PanelName = 'main' | 'archive' | 'settings' | 'taskManage';

interface UiState {
  currentPanel: PanelName;
  isArchiveOpen: boolean;
  isSettingsOpen: boolean;
  isTaskManageOpen: boolean;
  openPanel: (panel: PanelName) => void;
  closePanel: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  currentPanel: 'main',
  isArchiveOpen: false,
  isSettingsOpen: false,
  isTaskManageOpen: false,
  openPanel: (panel) =>
    set({
      currentPanel: panel,
      isArchiveOpen: panel === 'archive',
      isSettingsOpen: panel === 'settings',
      isTaskManageOpen: panel === 'taskManage',
    }),
  closePanel: () =>
    set({
      currentPanel: 'main',
      isArchiveOpen: false,
      isSettingsOpen: false,
      isTaskManageOpen: false,
    }),
}));
