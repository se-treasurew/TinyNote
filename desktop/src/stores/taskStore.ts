import { create } from 'zustand';
import type { CreateTaskInput, Task, TasksByDate, UpdateTaskInput } from '../types/task';
import { taskService } from '../services/taskService';
import { getActiveCountByDate, groupDateDisplayTasksByDate } from '../services/taskWorkflow';
import { getVisibleDateRange, todayIsoDate } from '../utils/date';
import { routineService } from '../services/routineService';

interface TaskState {
  tasks: Task[];
  archiveTasks: Task[];
  tasksByDate: TasksByDate;
  visibleDates: string[];
  visibleStartDate: string;
  visibleDays: number;
  selectedDate: string;
  isLoading: boolean;
  loadTasks: (visibleDays?: number, startDate?: string) => Promise<void>;
  loadArchive: () => Promise<void>;
  addTask: (input: CreateTaskInput) => Promise<void>;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<void>;
  completeTask: (id: string, completeToArchive: boolean) => Promise<void>;
  archiveTask: (id: string) => Promise<void>;
  restoreTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  setSelectedDate: (date: string) => void;
  getActiveCountByDate: (date: string) => number;
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

  async loadTasks(visibleDays = get().visibleDays, startDate = get().visibleStartDate) {
    set({ isLoading: true });
    const rangeStartDate = startDate || todayIsoDate();
    const visibleDates = getVisibleDateRange(rangeStartDate, visibleDays);
    let tasks = await taskService.loadVisibleTasks(rangeStartDate, visibleDays);
    const generated = await routineService.generateVisibleRoutineTasks(visibleDates, tasks);
    if (generated.length > 0) {
      tasks = await taskService.loadVisibleTasks(rangeStartDate, visibleDays);
    }

    set({
      tasks,
      tasksByDate: groupDateDisplayTasksByDate(tasks),
      visibleDates,
      visibleStartDate: rangeStartDate,
      visibleDays,
      selectedDate: visibleDates.includes(get().selectedDate) ? get().selectedDate : rangeStartDate,
      isLoading: false,
    });
  },

  async loadArchive() {
    const archiveTasks = await taskService.loadArchive();
    set({ archiveTasks });
  },

  async addTask(input) {
    await taskService.addTask(input);
    await get().loadTasks();
  },

  async updateTask(id, input) {
    await taskService.updateTask(id, input);
    await get().loadTasks();
  },

  async completeTask(id, completeToArchive) {
    await taskService.completeTask(id, completeToArchive);
    await get().loadTasks();
    await get().loadArchive();
  },

  async archiveTask(id) {
    await taskService.archiveTask(id);
    await get().loadTasks();
    await get().loadArchive();
  },

  async restoreTask(id) {
    await taskService.restoreTask(id);
    await get().loadTasks();
    await get().loadArchive();
  },

  async deleteTask(id) {
    await taskService.deleteTask(id);
    await get().loadTasks();
    await get().loadArchive();
  },

  setSelectedDate(date) {
    set({ selectedDate: date });
  },

  getActiveCountByDate(date) {
    return getActiveCountByDate(get().tasks, date);
  },
}));
