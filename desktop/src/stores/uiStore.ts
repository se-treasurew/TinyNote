import { create } from 'zustand';

export type PanelName = 'main' | 'archive' | 'routine' | 'settings';

interface UiState {
  currentPanel: PanelName;
  isArchiveOpen: boolean;
  isRoutineOpen: boolean;
  isSettingsOpen: boolean;
  openPanel: (panel: PanelName) => void;
  closePanel: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  currentPanel: 'main',
  isArchiveOpen: false,
  isRoutineOpen: false,
  isSettingsOpen: false,
  openPanel: (panel) =>
    set({
      currentPanel: panel,
      isArchiveOpen: panel === 'archive',
      isRoutineOpen: panel === 'routine',
      isSettingsOpen: panel === 'settings',
    }),
  closePanel: () =>
    set({
      currentPanel: 'main',
      isArchiveOpen: false,
      isRoutineOpen: false,
      isSettingsOpen: false,
    }),
}));
