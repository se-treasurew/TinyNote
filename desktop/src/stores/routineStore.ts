import { create } from 'zustand';
import type { CreateDailyRoutineInput, CreateMultiDayRoutineInput, Routine } from '../types/routine';
import { routineService } from '../services/routineService';
import { useTaskStore } from './taskStore';

interface RoutineState {
  routines: Routine[];
  isLoading: boolean;
  loadRoutines: () => Promise<void>;
  createDailyRoutine: (input: CreateDailyRoutineInput) => Promise<void>;
  createMultiDayRoutine: (input: CreateMultiDayRoutineInput) => Promise<void>;
  enableRoutine: (id: string) => Promise<void>;
  disableRoutine: (id: string) => Promise<void>;
  deleteRoutine: (id: string) => Promise<void>;
  generateTodayRoutineTasks: () => Promise<void>;
}

export const useRoutineStore = create<RoutineState>((set, get) => ({
  routines: [],
  isLoading: false,

  async loadRoutines() {
    set({ isLoading: true });
    const routines = await routineService.loadRoutines();
    set({ routines, isLoading: false });
  },

  async createDailyRoutine(input) {
    await routineService.createDailyRoutine(input);
    await get().loadRoutines();
    await useTaskStore.getState().loadTasks();
  },

  async createMultiDayRoutine(input) {
    await routineService.createMultiDayRoutine(input);
    await get().loadRoutines();
    await useTaskStore.getState().loadTasks();
  },

  async enableRoutine(id) {
    await routineService.setEnabled(id, true);
    await get().loadRoutines();
    await useTaskStore.getState().loadTasks();
  },

  async disableRoutine(id) {
    await routineService.setEnabled(id, false);
    await get().loadRoutines();
  },

  async deleteRoutine(id) {
    await routineService.deleteRoutine(id);
    await get().loadRoutines();
  },

  async generateTodayRoutineTasks() {
    await useTaskStore.getState().loadTasks();
  },
}));
