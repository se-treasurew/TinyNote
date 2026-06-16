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
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
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
