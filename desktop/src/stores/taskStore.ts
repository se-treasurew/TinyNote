import { create } from 'zustand';
import type { CreateTaskInput, TaskOccurrence, TasksByDate, UpdateTaskInput } from '../types/task';
import { taskService } from '../services/taskService';
import { navigateDate as calculateDateNavigation, resolveVisibleStartForDate } from '../services/dateNavigation';
import { isBatchPostponeEligibleTask } from '../services/taskScheduling';
import {
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
  navigateDate: (direction: -1 | 1, visibleDays?: number) => Promise<void>;
  goToToday: (visibleDays?: number) => Promise<void>;
  addTask: (input: CreateTaskInput) => Promise<TaskOccurrence>;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<void>;
  updateTaskProgress: (id: string, progressDate: string, percent: number) => Promise<void>;
  postponeTask: (id: string, fromDate: string, toDate: string, sourceProgressPercent?: number) => Promise<void>;
  postponeTasksForDate: (date: string) => Promise<void>;
  clearTaskPostponements: (id: string) => Promise<void>;
  completeTask: (id: string, occurrenceDate?: string) => Promise<void>;
  restoreTask: (id: string, occurrenceDate?: string) => Promise<void>;
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

function resolveDisplayDate(task: TaskOccurrence, visibleDates: string[]): string {
  return visibleDates.includes(task.occurrenceDate) ? task.occurrenceDate : task.taskDate;
}

function mergeVisibleTask(tasks: TaskOccurrence[], task: TaskOccurrence, visibleDates: string[]): TaskOccurrence[] {
  const displayDate = resolveDisplayDate(task, visibleDates);
  const visibleTask = task.taskDate === displayDate ? task : { ...task, taskDate: displayDate };
  const withoutTask = tasks.filter((item) => !(item.id === visibleTask.id && resolveDisplayDate(item, visibleDates) === displayDate));
  if (visibleTask.status === 'deleted' || !visibleDates.includes(displayDate)) {
    return withoutTask;
  }

  return [...withoutTask, visibleTask];
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

// Removing a parent must also drop all its descendants from the visible state.
// The service soft-deletes descendants server-side, so collect the whole
// subtree by parentTaskId transitively and filter them out.
function removeTaskAndDescendants(tasks: TaskOccurrence[], id: string): TaskOccurrence[] {
  const removeIds = new Set<string>([id]);
  let added = true;
  while (added) {
    added = false;
    for (const task of tasks) {
      if (task.parentTaskId && removeIds.has(task.parentTaskId) && !removeIds.has(task.id)) {
        removeIds.add(task.id);
        added = true;
      }
    }
  }
  return tasks.filter((task) => !removeIds.has(task.id));
}

function invalidatePendingLoads() {
  cancelPendingNavigationLoad();
  latestTaskLoadId += 1;
}

function findCurrentOccurrence(tasks: TaskOccurrence[], id: string, selectedDate: string): TaskOccurrence | undefined {
  return tasks.find((task) => task.id === id && task.occurrenceDate === selectedDate)
    ?? tasks.find((task) => task.id === id && task.taskDate === selectedDate)
    ?? tasks.find((task) => task.id === id);
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
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

    // Manual tasks show on a single date, so one optimistic occurrence is
    // enough. Daily/multi-day tasks (including subtasks that inherit such a
    // parent) span the range and must appear on every visible date — a single
    // occurrence would only cover the viewing date, leaving other days stale
    // until a manual reload. Reload the window so every date reflects the new
    // task.
    if (task.sourceType === 'daily' || task.sourceType === 'multi_day') {
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
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

  async clearTaskPostponements(id) {
    invalidatePendingLoads();
    set({ isLoading: false });
    try {
      await taskService.clearTaskPostponements(id);
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
    } catch (error) {
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
      throw error;
    }
  },

  async completeTask(id, occurrenceDate) {
    invalidatePendingLoads();
    set({ isLoading: false });
    const targetDate = occurrenceDate ?? get().selectedDate;
    const current = findCurrentOccurrence(get().tasks, id, targetDate);
    if (current) {
      const optimistic = applyComplete({ ...current, taskDate: targetDate, occurrenceDate: targetDate }, new Date().toISOString());
      set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, optimistic, state.visibleDates)));
    }

    try {
      await taskService.completeTask(id, current?.occurrenceDate ?? targetDate);
      // Completing a subtask recomputes ancestor progress server-side, so
      // reload to refresh the parent's badge and percent on every visible date.
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
    } catch (error) {
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
      throw error;
    }
  },

  async restoreTask(id, occurrenceDate) {
    invalidatePendingLoads();
    set({ isLoading: false });
    const targetDate = occurrenceDate ?? get().selectedDate;
    const current = findCurrentOccurrence(get().tasks, id, targetDate);
    if (current) {
      const optimistic = applyRestore({ ...current, taskDate: targetDate, occurrenceDate: targetDate }, new Date().toISOString());
      set((state) => taskCollectionPatch(mergeVisibleTask(state.tasks, optimistic, state.visibleDates)));
    }

    try {
      await taskService.restoreTask(id, current?.occurrenceDate ?? targetDate);
      // Restoring a subtask recomputes ancestor progress server-side; reload to
      // refresh the parent's badge and percent on every visible date.
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
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
      set((state) => taskCollectionPatch(removeTaskAndDescendants(state.tasks, id)));
    }

    try {
      await taskService.deleteTask(id);
      // Deleting cascades to all descendants server-side; reload to drop them
      // from every visible date and refresh ancestor badges.
      await get().loadTasks(get().visibleDays, get().visibleStartDate, get().selectedDate);
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
