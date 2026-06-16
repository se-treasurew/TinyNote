import type { Routine } from '../types/routine';
import type { Task, TaskDraft } from '../types/task';
import { addDays, isDateInRange } from '../utils/date';

interface BuildDailyRoutineInstancesInput {
  routines: Routine[];
  visibleDates: string[];
  existingTasks: Task[];
  now: string;
  deviceId: string;
}

interface BuildMultiDayTaskDraftsInput {
  title: string;
  content?: string | null;
  startDate: string;
  endDate: string;
  routineId: string;
  deviceId: string;
  now: string;
}

export function buildDailyRoutineInstances(input: BuildDailyRoutineInstancesInput): TaskDraft[] {
  const existingKeys = new Set(
    input.existingTasks
      .filter((task) => task.routineId)
      .map((task) => `${task.routineId}:${task.taskDate}`),
  );

  return input.routines.flatMap((routine) => {
    if (!routine.isEnabled || routine.deletedAt || routine.routineType !== 'daily') {
      return [];
    }

    return input.visibleDates
      .filter((date) => isDateInRange(date, routine.startDate, routine.endDate))
      .filter((date) => !existingKeys.has(`${routine.id}:${date}`))
      .map((date, index) => createTaskDraft({
        title: routine.title,
        content: routine.description,
        taskDate: date,
        routineId: routine.id,
        sourceType: 'routine_daily',
        deviceId: input.deviceId,
        now: input.now,
        sortOrder: index,
      }));
  });
}

export function buildMultiDayTaskDrafts(input: BuildMultiDayTaskDraftsInput): TaskDraft[] {
  const dates: string[] = [];
  for (let date = input.startDate; date <= input.endDate; date = addDays(date, 1)) {
    dates.push(date);
  }

  return dates.map((date, index) => createTaskDraft({
    title: input.title,
    content: input.content ?? null,
    taskDate: date,
    routineId: input.routineId,
    sourceType: 'multi_day',
    deviceId: input.deviceId,
    now: input.now,
    sortOrder: index,
  }));
}

function createTaskDraft(input: {
  title: string;
  content: string | null;
  taskDate: string;
  routineId: string;
  sourceType: 'routine_daily' | 'multi_day';
  deviceId: string;
  now: string;
  sortOrder: number;
}): TaskDraft {
  return {
    userId: null,
    deviceId: input.deviceId,
    title: input.title,
    content: input.content,
    taskDate: input.taskDate,
    status: 'active',
    priority: 'none',
    sourceType: input.sourceType,
    routineId: input.routineId,
    parentTaskId: null,
    sortOrder: input.sortOrder,
    completedAt: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: input.now,
    updatedAt: input.now,
    syncStatus: 'local',
    version: 1,
  };
}
