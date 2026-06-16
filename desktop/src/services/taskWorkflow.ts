import type { Task, TasksByDate } from '../types/task';

export function applyComplete(task: Task, completeToArchive: boolean, now: string): Task {
  return bumpTask({
    ...task,
    status: completeToArchive ? 'archived' : 'completed',
    completedAt: now,
    archivedAt: completeToArchive ? now : task.archivedAt,
    updatedAt: now,
  });
}

export function applyArchive(task: Task, now: string): Task {
  return bumpTask({
    ...task,
    status: 'archived',
    archivedAt: now,
    updatedAt: now,
  });
}

export function applyRestore(task: Task, now: string): Task {
  return bumpTask({
    ...task,
    status: 'active',
    completedAt: null,
    archivedAt: null,
    deletedAt: null,
    updatedAt: now,
  });
}

export function applyDelete(task: Task, now: string): Task {
  return bumpTask({
    ...task,
    status: 'deleted',
    deletedAt: now,
    updatedAt: now,
  });
}

export function groupActiveTasksByDate(tasks: Task[]): TasksByDate {
  return tasks
    .filter((task) => task.status === 'active')
    .sort(sortByOrder)
    .reduce<TasksByDate>((groups, task) => {
      groups[task.taskDate] = groups[task.taskDate] ?? [];
      groups[task.taskDate].push(task);
      return groups;
    }, {});
}

export function groupDateDisplayTasksByDate(tasks: Task[]): TasksByDate {
  return tasks
    .filter((task) => task.status === 'active' || task.status === 'completed' || task.status === 'archived')
    .sort((a, b) => statusWeight(a) - statusWeight(b) || sortByOrder(a, b))
    .reduce<TasksByDate>((groups, task) => {
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

function bumpTask(task: Task): Task {
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
