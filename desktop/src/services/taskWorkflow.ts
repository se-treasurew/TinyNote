import type { Task, TaskOccurrence } from '../types/task';

export interface TaskTreeNode<T extends TaskOccurrence = TaskOccurrence> {
  task: T;
  subtasks: TaskTreeNode<T>[];
}

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

/**
 * Group a single date's flat occurrence list into parent-with-subtask trees.
 * Subtasks inherit their parent's date range, so within one date each task id
 * appears at most once. An occurrence is a child when it has a parentTaskId
 * pointing at another occurrence present in the same list; otherwise it is a
 * top-level node (covers parentTaskId === null and orphans whose parent is
 * missing/deleted/out-of-range). Nesting is recursive up to three levels
 * (parent → child → grandchild). Both levels sort by (statusWeight, sortOrder,
 * createdAt) to match groupDateDisplayTasksByDate.
 */
export function groupTasksWithSubtasks<T extends TaskOccurrence>(occurrences: T[]): TaskTreeNode<T>[] {
  const byId = new Map<string, T>();
  for (const occurrence of occurrences) {
    byId.set(occurrence.id, occurrence);
  }

  const childrenByParent = new Map<string, T[]>();
  const topLevel: T[] = [];

  for (const occurrence of occurrences) {
    const parentId = occurrence.parentTaskId;
    if (parentId && byId.has(parentId)) {
      const siblings = childrenByParent.get(parentId) ?? [];
      siblings.push(occurrence);
      childrenByParent.set(parentId, siblings);
    } else {
      topLevel.push(occurrence);
    }
  }

  const buildNode = (task: T): TaskTreeNode<T> => {
    const childOccurrences = (childrenByParent.get(task.id) ?? []).slice().sort(
      (a, b) => statusWeight(a) - statusWeight(b) || sortByOrder(a, b),
    );
    return { task, subtasks: childOccurrences.map(buildNode) };
  };

  topLevel.sort((a, b) => statusWeight(a) - statusWeight(b) || sortByOrder(a, b));
  return topLevel.map(buildNode);
}

/**
 * Subtask completion progress shown as an x/y badge on the parent row. Counts
 * direct children only (grandchildren belong to their own parent's badge).
 */
export function subtaskBadge<T extends TaskOccurrence>(subtasks: T[]): { done: number; total: number } {
  const done = subtasks.filter(
    (subtask) => subtask.status === 'completed' || subtask.status === 'archived',
  ).length;
  return { done, total: subtasks.length };
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
