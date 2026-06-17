import { create } from 'zustand';

export type PanelName = 'main' | 'archive' | 'settings';

interface UiState {
  currentPanel: PanelName;
  isArchiveOpen: boolean;
  isSettingsOpen: boolean;
  openPanel: (panel: PanelName) => void;
  closePanel: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  currentPanel: 'main',
  isArchiveOpen: false,
  isSettingsOpen: false,
  openPanel: (panel) =>
    set({
      currentPanel: panel,
      isArchiveOpen: panel === 'archive',
      isSettingsOpen: panel === 'settings',
    }),
  closePanel: () =>
    set({
      currentPanel: 'main',
      isArchiveOpen: false,
      isSettingsOpen: false,
    }),
}));
