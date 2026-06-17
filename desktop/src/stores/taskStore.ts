import { create } from 'zustand';
import type { CreateTaskInput, Task, TasksByDate, UpdateTaskInput } from '../types/task';
import { taskService } from '../services/taskService';
import { navigateDate as calculateDateNavigation, resolveVisibleStartForDate } from '../services/dateNavigation';
import { getActiveCountByDate, groupDateDisplayTasksByDate } from '../services/taskWorkflow';
import { getVisibleDateRange, todayIsoDate } from '../utils/date';
import { routineService } from '../services/routineService';

let latestTaskLoadId = 0;
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

function scheduleNavigationLoad(load: () => void) {
  cancelPendingNavigationLoad();
  pendingNavigationLoad = setTimeout(() => {
    pendingNavigationLoad = undefined;
    load();
  }, NAVIGATION_LOAD_DELAY_MS);
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
      let tasks = await taskService.loadVisibleTasks(dateWindow.visibleStartDate, visibleDays);
      if (loadId !== latestTaskLoadId) {
        return;
      }

      const generated = await routineService.generateVisibleRoutineTasks(dateWindow.visibleDates, tasks);
      if (loadId !== latestTaskLoadId) {
        return;
      }

      if (generated.length > 0) {
        tasks = await taskService.loadVisibleTasks(dateWindow.visibleStartDate, visibleDays);
        if (loadId !== latestTaskLoadId) {
          return;
        }
      }

      set({
        ...dateWindow,
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

  async navigateDate(direction, visibleDays = get().visibleDays) {
    const next = calculateDateNavigation({
      direction,
      selectedDate: get().selectedDate,
      visibleStartDate: get().visibleStartDate,
      visibleDays,
    });
    latestTaskLoadId += 1;
    const dateWindow = buildDateWindow(visibleDays, next.visibleStartDate, next.selectedDate);
    set({ ...dateWindow, isLoading: false });
    scheduleNavigationLoad(() => {
      void get().loadTasks(visibleDays, dateWindow.visibleStartDate, dateWindow.selectedDate);
    });
  },

  async addTask(input) {
    await taskService.addTask(input);
    const startDate = resolveVisibleStartForDate(input.taskDate, get().visibleStartDate, get().visibleDays);
    await get().loadTasks(get().visibleDays, startDate, input.taskDate);
  },

  async updateTask(id, input) {
    const updated = await taskService.updateTask(id, input);
    const selectedDate = input.taskDate ?? get().selectedDate;
    const startDate = resolveVisibleStartForDate(
      input.taskDate ?? updated.taskDate,
      get().visibleStartDate,
      get().visibleDays,
    );
    await get().loadTasks(get().visibleDays, startDate, selectedDate);
  },

  async completeTask(id, completeToArchive) {
    await taskService.completeTask(id, completeToArchive);
    await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
    await get().loadArchive();
  },

  async archiveTask(id) {
    await taskService.archiveTask(id);
    await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
    await get().loadArchive();
  },

  async restoreTask(id) {
    await taskService.restoreTask(id);
    await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
    await get().loadArchive();
  },

  async deleteTask(id) {
    await taskService.deleteTask(id);
    await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
    await get().loadArchive();
  },

  setSelectedDate(date) {
    set({ selectedDate: date });
  },

  getActiveCountByDate(date) {
    return getActiveCountByDate(get().tasks, date);
  },
}));
