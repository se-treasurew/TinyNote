import { create } from 'zustand';
import type { CreateTaskInput, Task, TaskOccurrence, TasksByDate, UpdateTaskInput } from '../types/task';
import { taskService } from '../services/taskService';
import { navigateDate as calculateDateNavigation, resolveVisibleStartForDate } from '../services/dateNavigation';
import { isBatchPostponeEligibleTask } from '../services/taskScheduling';
import {
  applyArchive,
  applyComplete,
  applyRestore,
  getActiveCountByDate,
  groupDateDisplayTasksByDate,
} from '../services/taskWorkflow';
import { addDays, getVisibleDateRange, todayIsoDate } from '../utils/date';

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
  selectedDate: string;
  isLoading: boolean;
  loadTasks: (
    visibleDays?: number,
    startDate?: string,
    selectedDate?: string,
  ) => Promise<void>;
  loadArchive: () => Promise<void>;
  navigateDate: (direction: -1 | 1, visibleDays?: number) => Promise<void>;
  goToToday: (visibleDays?: number) => Promise<void>;
  addTask: (input: CreateTaskInput) => Promise<TaskOccurrence>;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<void>;
  updateTaskProgress: (id: string, progressDate: string, percent: number) => Promise<void>;
  postponeTask: (id: string, fromDate: string, toDate: string, sourceProgressPercent?: number) => Promise<void>;
  postponeTasksForDate: (date: string) => Promise<void>;
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
    load().catch((error) => {
      console.error('Scheduled navigation load failed', error);
    });
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

function mergeVisibleTaskDefinition(tasks: TaskOccurrence[], updated: TaskOccurrence): TaskOccurrence[] {
  return tasks.map((task) => {
    if (task.id !== updated.id) {
      return task;
    }

    return {
      ...task,
      userId: updated.userId,
      deviceId: updated.deviceId,
      title: updated.title,
      content: updated.content,
      endDate: updated.endDate,
      priority: updated.priority,
      sourceType: updated.sourceType,
      routineId: updated.routineId,
      parentTaskId: updated.parentTaskId,
      sortOrder: updated.sortOrder,
      postponedAt: updated.postponedAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      syncStatus: updated.syncStatus,
      version: updated.version,
      definitionTaskDate: updated.definitionTaskDate,
      postponementHistory: updated.postponementHistory,
    };
  });
}

function applyDefinitionUpdateInput(tasks: TaskOccurrence[], id: string, input: UpdateTaskInput): TaskOccurrence[] {
  const now = new Date().toISOString();

  return tasks.map((task) => {
    if (task.id !== id) {
      return task;
    }

    return {
      ...task,
      title: input.title ?? task.title,
      content: input.content === undefined ? task.content : input.content,
      sortOrder: input.sortOrder ?? task.sortOrder,
      postponedAt: input.postponedAt === undefined ? task.postponedAt : input.postponedAt,
      updatedAt: now,
      syncStatus: 'pending',
      version: task.version + 1,
    };
  });
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
    set({ ...dateWindow, isLoading: false });
    scheduleNavigationLoad(async () => {
      await get().loadTasks(visibleDays, dateWindow.visibleStartDate, dateWindow.selectedDate);
    });
  },

  async goToToday(visibleDays = get().visibleDays) {
    invalidatePendingLoads();
    set({ isLoading: false });
    const today = todayIsoDate();
    const startDate = resolveVisibleStartForDate(today, get().visibleStartDate, visibleDays);
    await get().loadTasks(visibleDays, startDate, today);
  },

  async addTask(input) {
    invalidatePendingLoads();
    set({ isLoading: false });
    const task = await taskService.addTask(input);
    const startDate = resolveVisibleStartForDate(input.taskDate, get().visibleStartDate, get().visibleDays);
    if (startDate !== get().visibleStartDate) {
      await get().loadTasks(get().visibleDays, startDate, input.taskDate);
      return task;
    }

    set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, task, state.visibleDates)));
    return task;
  },

  async updateTask(id, input) {
    invalidatePendingLoads();
    set({ isLoading: false });
    const isScheduleUpdate = input.taskDate !== undefined || input.endDate !== undefined || input.sourceType !== undefined;
    const current = get().tasks.find((task) => task.id === id);
    if (current) {
      if (isScheduleUpdate) {
        const optimistic: TaskOccurrence = {
          ...current,
          ...input,
          title: input.title ?? current.title,
          content: input.content === undefined ? current.content : input.content,
          taskDate: input.taskDate ?? current.taskDate,
          endDate: input.endDate === undefined ? current.endDate : input.endDate,
          sourceType: input.sourceType ?? current.sourceType,
          postponedAt: input.postponedAt === undefined ? current.postponedAt : input.postponedAt,
          updatedAt: new Date().toISOString(),
          syncStatus: 'pending',
          version: current.version + 1,
        };
        set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, optimistic, state.visibleDates)));
      } else {
        set((state) => taskCollectionPatch(applyDefinitionUpdateInput(state.tasks, id, input)));
      }
    }

    const updated = await taskService.updateTask(id, input);
    const selectedDate = input.taskDate ?? get().selectedDate;
    const startDate = resolveVisibleStartForDate(
      input.taskDate ?? updated.taskDate,
      get().visibleStartDate,
      get().visibleDays,
    );
    if (isScheduleUpdate || startDate !== get().visibleStartDate) {
      await get().loadTasks(get().visibleDays, startDate, selectedDate);
      return;
    }

    set((state) => taskCollectionPatch(mergeVisibleTaskDefinition(state.tasks, updated)));
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
      const updated = await taskService.updateTaskProgress(id, progressDate, percent);
      set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, updated, state.visibleDates)));
    } catch (error) {
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
      throw error;
    }
  },

  async postponeTask(id, fromDate, toDate, sourceProgressPercent) {
    invalidatePendingLoads();
    set({ isLoading: false });
    try {
      await taskService.postponeTask(id, fromDate, toDate, sourceProgressPercent);
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
    } catch (error) {
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
      throw error;
    }
  },

  async postponeTasksForDate(date) {
    const eligibleTasks = (get().tasksByDate[date] ?? []).filter((task) => isBatchPostponeEligibleTask(task, date));
    if (eligibleTasks.length === 0) {
      return;
    }

    const toDate = addDays(date, 1);
    invalidatePendingLoads();
      set({ isLoading: false });
    try {
      for (const task of eligibleTasks) {
        await taskService.postponeTask(task.id, date, toDate, task.progressPercent);
      }
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
    } catch (error) {
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
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
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
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
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
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
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
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
