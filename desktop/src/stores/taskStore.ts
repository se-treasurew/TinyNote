import { create } from 'zustand';
import type { CreateTaskInput, Task, TasksByDate, UpdateTaskInput } from '../types/task';
import { taskService } from '../services/taskService';
import { navigateDate as calculateDateNavigation, resolveVisibleStartForDate } from '../services/dateNavigation';
import {
  applyArchive,
  applyComplete,
  applyRestore,
  getActiveCountByDate,
  groupDateDisplayTasksByDate,
} from '../services/taskWorkflow';
import { getVisibleDateRange, todayIsoDate } from '../utils/date';
import { routineService } from '../services/routineService';

let latestTaskLoadId = 0;
let latestRoutineGenerationId = 0;
let pendingNavigationLoad: ReturnType<typeof setTimeout> | undefined;
const NAVIGATION_LOAD_DELAY_MS = 120;

interface TaskState {
  tasks: Task[];
  archiveTasks: Task[];
  tasksByDate: TasksByDate;
  visibleDates: string[];
  visibleStartDate: string;
  visibleDays: number;
  selectedDate: string;
  isLoading: boolean;
  loadTasks: (visibleDays?: number, startDate?: string, selectedDate?: string) => Promise<void>;
  loadArchive: () => Promise<void>;
  navigateDate: (direction: -1 | 1, visibleDays?: number) => Promise<void>;
  addTask: (input: CreateTaskInput) => Promise<void>;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<void>;
  completeTask: (id: string, completeToArchive: boolean) => Promise<void>;
  archiveTask: (id: string) => Promise<void>;
  restoreTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  setSelectedDate: (date: string) => void;
  getActiveCountByDate: (date: string) => number;
}

function buildDateWindow(visibleDays: number, startDate: string, selectedDate: string) {
  const visibleStartDate = startDate || todayIsoDate();
  const visibleDates = getVisibleDateRange(visibleStartDate, visibleDays);

  return {
    visibleDates,
    visibleStartDate,
    visibleDays,
    selectedDate: visibleDates.includes(selectedDate) ? selectedDate : visibleStartDate,
  };
}

function cancelPendingNavigationLoad() {
  if (pendingNavigationLoad !== undefined) {
    clearTimeout(pendingNavigationLoad);
    pendingNavigationLoad = undefined;
  }
}

function scheduleNavigationLoad(load: () => Promise<void>) {
  cancelPendingNavigationLoad();
  pendingNavigationLoad = setTimeout(() => {
    pendingNavigationLoad = undefined;
    load().catch(() => { /* error already handled in loadTasks */ });
  }, NAVIGATION_LOAD_DELAY_MS);
}

function taskCollectionPatch(tasks: Task[]) {
  return {
    tasks,
    tasksByDate: groupDateDisplayTasksByDate(tasks),
  };
}

function mergeVisibleTask(tasks: Task[], task: Task, visibleDates: string[]): Task[] {
  const withoutTask = tasks.filter((item) => item.id !== task.id);
  if (task.status === 'deleted' || !visibleDates.includes(task.taskDate)) {
    return withoutTask;
  }

  return [...withoutTask, task];
}

function removeTask(tasks: Task[], id: string): Task[] {
  return tasks.filter((task) => task.id !== id);
}

function invalidatePendingLoads() {
  cancelPendingNavigationLoad();
  latestTaskLoadId += 1;
  latestRoutineGenerationId += 1;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  archiveTasks: [],
  tasksByDate: {},
  visibleDates: getVisibleDateRange(todayIsoDate(), 7),
  visibleStartDate: todayIsoDate(),
  visibleDays: 7,
  selectedDate: todayIsoDate(),
  isLoading: false,

  async loadTasks(
    visibleDays = get().visibleDays,
    startDate = get().visibleStartDate,
    selectedDate = get().selectedDate,
  ) {
    cancelPendingNavigationLoad();
    const dateWindow = buildDateWindow(visibleDays, startDate, selectedDate);
    const loadId = ++latestTaskLoadId;
    set({ ...dateWindow, isLoading: true });

    try {
      const tasks = await taskService.loadVisibleTasks(dateWindow.visibleStartDate, visibleDays);
      if (loadId !== latestTaskLoadId) {
        return;
      }

      set({
        ...dateWindow,
        tasks,
        tasksByDate: groupDateDisplayTasksByDate(tasks),
        isLoading: false,
      });
      const routineGenerationId = ++latestRoutineGenerationId;
      routineService.generateVisibleRoutineTasks(dateWindow.visibleDates, tasks)
        .then(async (generated) => {
          if (generated.length === 0) {
            return;
          }
          if (loadId !== latestTaskLoadId || routineGenerationId !== latestRoutineGenerationId) {
            return;
          }

          const refreshedTasks = await taskService.loadVisibleTasks(dateWindow.visibleStartDate, visibleDays);
          if (loadId !== latestTaskLoadId || routineGenerationId !== latestRoutineGenerationId) {
            return;
          }

          set({
            ...dateWindow,
            tasks: refreshedTasks,
            tasksByDate: groupDateDisplayTasksByDate(refreshedTasks),
            isLoading: false,
          });
        })
        .catch((error) => {
          console.error('Failed to generate routine tasks', error);
        });
    } catch (error) {
      if (loadId === latestTaskLoadId) {
        set({ isLoading: false });
      }
      throw error;
    }
  },

  async loadArchive() {
    const archiveTasks = await taskService.loadArchive();
    set({ archiveTasks });
  },

  async navigateDate(direction, visibleDays = get().visibleDays) {
    const next = calculateDateNavigation({
      direction,
      selectedDate: get().selectedDate,
      visibleStartDate: get().visibleStartDate,
      visibleDays,
    });
    const dateWindow = buildDateWindow(visibleDays, next.visibleStartDate, next.selectedDate);
    latestTaskLoadId += 1;
    latestRoutineGenerationId += 1;
    set({ ...dateWindow, isLoading: false });
    scheduleNavigationLoad(async () => {
      await get().loadTasks(visibleDays, dateWindow.visibleStartDate, dateWindow.selectedDate);
    });
  },

  async addTask(input) {
    invalidatePendingLoads();
    set({ isLoading: false });
    const task = await taskService.addTask(input);
    const startDate = resolveVisibleStartForDate(input.taskDate, get().visibleStartDate, get().visibleDays);
    if (startDate !== get().visibleStartDate) {
      await get().loadTasks(get().visibleDays, startDate, input.taskDate);
      return;
    }

    set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, task, state.visibleDates)));
  },

  async updateTask(id, input) {
    invalidatePendingLoads();
    set({ isLoading: false });
    const current = get().tasks.find((task) => task.id === id);
    if (current) {
      const optimistic: Task = {
        ...current,
        ...input,
        title: input.title ?? current.title,
        content: input.content === undefined ? current.content : input.content,
        taskDate: input.taskDate ?? current.taskDate,
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
        version: current.version + 1,
      };
      set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, optimistic, state.visibleDates)));
    }

    const updated = await taskService.updateTask(id, input);
    const selectedDate = input.taskDate ?? get().selectedDate;
    const startDate = resolveVisibleStartForDate(
      input.taskDate ?? updated.taskDate,
      get().visibleStartDate,
      get().visibleDays,
    );
    if (startDate !== get().visibleStartDate) {
      await get().loadTasks(get().visibleDays, startDate, selectedDate);
      return;
    }

    set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, updated, state.visibleDates)));
  },

  async completeTask(id, completeToArchive) {
    invalidatePendingLoads();
    set({ isLoading: false });
    const current = get().tasks.find((task) => task.id === id);
    if (current) {
      const optimistic = applyComplete(current, completeToArchive, new Date().toISOString());
      set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, optimistic, state.visibleDates)));
    }

    try {
      const updated = await taskService.completeTask(id, completeToArchive);
      set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, updated, state.visibleDates)));
      void get().loadArchive().catch((error) => console.error('Failed to load archive', error));
    } catch (error) {
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
      throw error;
    }
  },

  async archiveTask(id) {
    invalidatePendingLoads();
    set({ isLoading: false });
    const current = get().tasks.find((task) => task.id === id);
    if (current) {
      const optimistic = applyArchive(current, new Date().toISOString());
      set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, optimistic, state.visibleDates)));
    }

    try {
      const updated = await taskService.archiveTask(id);
      set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, updated, state.visibleDates)));
      void get().loadArchive().catch((error) => console.error('Failed to load archive', error));
    } catch (error) {
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
      throw error;
    }
  },

  async restoreTask(id) {
    invalidatePendingLoads();
    set({ isLoading: false });
    const current = get().tasks.find((task) => task.id === id);
    if (current) {
      const optimistic = applyRestore(current, new Date().toISOString());
      set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, optimistic, state.visibleDates)));
    }

    try {
      const updated = await taskService.restoreTask(id);
      set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, updated, state.visibleDates)));
      void get().loadArchive().catch((error) => console.error('Failed to load archive', error));
    } catch (error) {
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
      throw error;
    }
  },

  async deleteTask(id) {
    invalidatePendingLoads();
    set({ isLoading: false });
    const current = get().tasks.find((task) => task.id === id);
    if (current) {
      set((state) => taskCollectionPatch(removeTask(state.tasks, id)));
    }

    try {
      await taskService.deleteTask(id);
      set((state) => taskCollectionPatch(removeTask(state.tasks, id)));
      void get().loadArchive().catch((error) => console.error('Failed to load archive', error));
    } catch (error) {
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
      throw error;
    }
  },

  setSelectedDate(date) {
    set({ selectedDate: date });
  },

  getActiveCountByDate(date) {
    return getActiveCountByDate(get().tasks, date);
  },
}));
