import type { TaskOccurrence, TaskStatus } from '../types/task';

export function isPostponeEligibleTask(task: {
  sourceType: TaskOccurrence['sourceType'];
  status: TaskStatus;
  taskDate: string;
  endDate: string | null;
}, occurrenceDate: string): boolean {
  if (!isTaskPostponeSupported(task)) {
    return false;
  }

  if (task.sourceType === 'manual') {
    return true;
  }

  if (task.sourceType === 'multi_day') {
    return occurrenceDate >= task.taskDate && (!task.endDate || occurrenceDate <= task.endDate);
  }

  return false;
}

export function isBatchPostponeEligibleTask(task: {
  sourceType: TaskOccurrence['sourceType'];
  status: TaskStatus;
  taskDate: string;
  endDate: string | null;
}, occurrenceDate: string): boolean {
  if (!isTaskPostponeSupported(task)) {
    return false;
  }

  if (task.sourceType === 'manual') {
    return true;
  }

  return task.sourceType === 'multi_day' && task.endDate === occurrenceDate;
}

export function isTaskPostponeSupported(task: {
  sourceType: TaskOccurrence['sourceType'];
  status: TaskStatus;
}): boolean {
  if (task.status !== 'active') {
    return false;
  }

  return task.sourceType === 'manual' || task.sourceType === 'multi_day';
}
