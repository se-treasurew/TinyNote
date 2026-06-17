import { create } from 'zustand';
import type { CreateTaskInput, Task, TaskOccurrence, TasksByDate, UpdateTaskInput } from '../types/task';
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

let latestTaskLoadId = 0;
let pendingNavigationLoad: ReturnType<typeof setTimeout> | undefined;
const NAVIGATION_LOAD_DELAY_MS = 120;

interface TaskState {
  tasks: TaskOccurrence[];
  archiveTasks: Task[];
  tasksByDate: TasksByDate;
  visibleDates: string[];
  visibleStartDate: string;
  visibleDays: number;
  carryProgressForward: boolean;
  selectedDate: string;
  isLoading: boolean;
  loadTasks: (
    visibleDays?: number,
    startDate?: string,
    selectedDate?: string,
    carryProgressForward?: boolean,
  ) => Promise<void>;
  loadArchive: () => Promise<void>;
  navigateDate: (direction: -1 | 1, visibleDays?: number, carryProgressForward?: boolean) => Promise<void>;
  goToToday: (visibleDays?: number, carryProgressForward?: boolean) => Promise<void>;
  addTask: (input: CreateTaskInput) => Promise<TaskOccurrence>;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<void>;
  updateTaskProgress: (id: string, progressDate: string, percent: number) => Promise<void>;
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

function taskCollectionPatch(tasks: TaskOccurrence[]) {
  return {
    tasks,
    tasksByDate: groupDateDisplayTasksByDate(tasks),
  };
}

function mergeVisibleTask(tasks: TaskOccurrence[], task: TaskOccurrence, visibleDates: string[]): TaskOccurrence[] {
  const withoutTask = tasks.filter((item) => !(item.id === task.id && item.taskDate === task.taskDate));
  if (task.status === 'deleted' || !visibleDates.includes(task.taskDate)) {
    return withoutTask;
  }

  return [...withoutTask, task];
}

function removeTask(tasks: TaskOccurrence[], id: string): TaskOccurrence[] {
  return tasks.filter((task) => task.id !== id);
}

function invalidatePendingLoads() {
  cancelPendingNavigationLoad();
  latestTaskLoadId += 1;
}

function findCurrentOccurrence(tasks: TaskOccurrence[], id: string, selectedDate: string): TaskOccurrence | undefined {
  return tasks.find((task) => task.id === id && task.taskDate === selectedDate) ?? tasks.find((task) => task.id === id);
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  archiveTasks: [],
  tasksByDate: {},
  visibleDates: getVisibleDateRange(todayIsoDate(), 7),
  visibleStartDate: todayIsoDate(),
  visibleDays: 7,
  carryProgressForward: false,
  selectedDate: todayIsoDate(),
  isLoading: false,

  async loadTasks(
    visibleDays = get().visibleDays,
    startDate = get().visibleStartDate,
    selectedDate = get().selectedDate,
    carryProgressForward = get().carryProgressForward,
  ) {
    cancelPendingNavigationLoad();
    const dateWindow = buildDateWindow(visibleDays, startDate, selectedDate);
    const loadId = ++latestTaskLoadId;
    set({ ...dateWindow, carryProgressForward, isLoading: true });

    try {
      const tasks = carryProgressForward
        ? await taskService.loadVisibleTasks(dateWindow.visibleStartDate, visibleDays, carryProgressForward)
        : await taskService.loadVisibleTasks(dateWindow.visibleStartDate, visibleDays);
      if (loadId !== latestTaskLoadId) {
        return;
      }

      set({
        ...dateWindow,
        carryProgressForward,
        tasks,
        tasksByDate: groupDateDisplayTasksByDate(tasks),
        isLoading: false,
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

  async navigateDate(direction, visibleDays = get().visibleDays, carryProgressForward = get().carryProgressForward) {
    const next = calculateDateNavigation({
      direction,
      selectedDate: get().selectedDate,
      visibleStartDate: get().visibleStartDate,
      visibleDays,
    });
    const dateWindow = buildDateWindow(visibleDays, next.visibleStartDate, next.selectedDate);
    latestTaskLoadId += 1;
    set({ ...dateWindow, carryProgressForward, isLoading: false });
    scheduleNavigationLoad(async () => {
      await get().loadTasks(visibleDays, dateWindow.visibleStartDate, dateWindow.selectedDate, carryProgressForward);
    });
  },

  async goToToday(visibleDays = get().visibleDays, carryProgressForward = get().carryProgressForward) {
    const today = todayIsoDate();
    const startDate = resolveVisibleStartForDate(today, get().visibleStartDate, visibleDays);
    await get().loadTasks(visibleDays, startDate, today, carryProgressForward);
  },

  async addTask(input) {
    invalidatePendingLoads();
    set({ isLoading: false });
    const task = await taskService.addTask(input);
    const startDate = resolveVisibleStartForDate(input.taskDate, get().visibleStartDate, get().visibleDays);
    if (startDate !== get().visibleStartDate) {
      await get().loadTasks(get().visibleDays, startDate, input.taskDate, get().carryProgressForward);
      return task;
    }

    set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, task, state.visibleDates)));
    return task;
  },

  async updateTask(id, input) {
    invalidatePendingLoads();
    set({ isLoading: false });
    const current = get().tasks.find((task) => task.id === id);
    if (current) {
      const optimistic: TaskOccurrence = {
        ...current,
        ...input,
        title: input.title ?? current.title,
        content: input.content === undefined ? current.content : input.content,
        taskDate: input.taskDate ?? current.taskDate,
        endDate: input.endDate === undefined ? current.endDate : input.endDate,
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
      await get().loadTasks(get().visibleDays, startDate, selectedDate, get().carryProgressForward);
      return;
    }

    set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, updated, state.visibleDates)));
  },

  async updateTaskProgress(id, progressDate, percent) {
    invalidatePendingLoads();
    set({ isLoading: false });
    const current = findCurrentOccurrence(get().tasks, id, progressDate);
    if (current) {
      set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, {
        ...current,
        progressPercent: Math.max(0, Math.min(100, Math.round(percent))),
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
      }, state.visibleDates)));
    }

    try {
      const updated = await taskService.updateTaskProgress(id, progressDate, percent, get().carryProgressForward);
      set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, updated, state.visibleDates)));
    } catch (error) {
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate, get().carryProgressForward);
      throw error;
    }
  },

  async completeTask(id, completeToArchive) {
    invalidatePendingLoads();
    set({ isLoading: false });
    const current = findCurrentOccurrence(get().tasks, id, get().selectedDate);
    if (current) {
      const optimistic = applyComplete(current, completeToArchive, new Date().toISOString());
      set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, optimistic, state.visibleDates)));
    }

    try {
      const updated = await taskService.completeTask(id, completeToArchive, current?.taskDate ?? get().selectedDate);
      set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, updated, state.visibleDates)));
      void get().loadArchive().catch((error) => console.error('Failed to load archive', error));
    } catch (error) {
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate, get().carryProgressForward);
      throw error;
    }
  },

  async archiveTask(id) {
    invalidatePendingLoads();
    set({ isLoading: false });
    const current = findCurrentOccurrence(get().tasks, id, get().selectedDate);
    if (current) {
      const optimistic = applyArchive(current, new Date().toISOString());
      set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, optimistic, state.visibleDates)));
    }

    try {
      const updated = await taskService.archiveTask(id);
      set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, updated, state.visibleDates)));
      void get().loadArchive().catch((error) => console.error('Failed to load archive', error));
    } catch (error) {
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate, get().carryProgressForward);
      throw error;
    }
  },

  async restoreTask(id) {
    invalidatePendingLoads();
    set({ isLoading: false });
    const current = findCurrentOccurrence(get().tasks, id, get().selectedDate);
    if (current) {
      const optimistic = applyRestore(current, new Date().toISOString());
      set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, optimistic, state.visibleDates)));
    }

    try {
      const updated = await taskService.restoreTask(id, current?.taskDate ?? get().selectedDate);
      set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, updated, state.visibleDates)));
      void get().loadArchive().catch((error) => console.error('Failed to load archive', error));
    } catch (error) {
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate, get().carryProgressForward);
      throw error;
    }
  },

  async deleteTask(id) {
    invalidatePendingLoads();
    set({ isLoading: false });
    const current = findCurrentOccurrence(get().tasks, id, get().selectedDate);
    if (current) {
      set((state) => taskCollectionPatch(removeTask(state.tasks, id)));
    }

    try {
      await taskService.deleteTask(id);
      set((state) => taskCollectionPatch(removeTask(state.tasks, id)));
      void get().loadArchive().catch((error) => console.error('Failed to load archive', error));
    } catch (error) {
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate, get().carryProgressForward);
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
