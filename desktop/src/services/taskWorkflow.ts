import type { Task } from '../types/task';

export function applyComplete<T extends Task>(task: T, now: string): T {
  return bumpTask({
    ...task,
    status: 'completed',
    completedAt: now,
    archivedAt: null,
    updatedAt: now,
  });
}

export function applyRestore<T extends Task>(task: T, now: string): T {
  return bumpTask({
    ...task,
    status: 'active',
    completedAt: null,
    archivedAt: null,
    deletedAt: null,
    updatedAt: now,
  });
}

export function applyDelete<T extends Task>(task: T, now: string): T {
  return bumpTask({
    ...task,
    status: 'deleted',
    deletedAt: now,
    updatedAt: now,
  });
}

export function groupActiveTasksByDate<T extends Task>(tasks: T[]): Record<string, T[]> {
  return tasks
    .filter((task) => task.status === 'active')
    .sort(sortByOrder)
    .reduce<Record<string, T[]>>((groups, task) => {
      groups[task.taskDate] = groups[task.taskDate] ?? [];
      groups[task.taskDate].push(task);
      return groups;
    }, {});
}

export function groupDateDisplayTasksByDate<T extends Task>(tasks: T[]): Record<string, T[]> {
  return tasks
    .filter((task) => task.status === 'active' || task.status === 'completed' || task.status === 'archived')
    .sort((a, b) => statusWeight(a) - statusWeight(b) || sortByOrder(a, b))
    .reduce<Record<string, T[]>>((groups, task) => {
      groups[task.taskDate] = groups[task.taskDate] ?? [];
      groups[task.taskDate].push(task);
      return groups;
    }, {});
}

export function hasActiveTaskOnDate(tasks: Task[], date: string): boolean {
  return tasks.some((task) => task.taskDate === date && task.status === 'active');
}

export function getActiveCountByDate(tasks: Task[], date: string): number {
  return tasks.filter((task) => task.taskDate === date && task.status === 'active').length;
}

function bumpTask<T extends Task>(task: T): T {
  return {
    ...task,
    syncStatus: 'pending',
    version: task.version + 1,
  };
}

function sortByOrder(a: Task, b: Task): number {
  return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
}

function statusWeight(task: Task): number {
  return task.status === 'active' ? 0 : 1;
}
