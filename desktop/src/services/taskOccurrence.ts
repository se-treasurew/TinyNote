import type { Task, TaskOccurrence, TaskProgressEntry, TaskStatus } from '../types/task';

interface BuildTaskOccurrencesInput {
  tasks: Task[];
  progressEntries: TaskProgressEntry[];
  visibleDates: string[];
  carryProgressForward: boolean;
}

export function buildTaskOccurrences(input: BuildTaskOccurrencesInput): TaskOccurrence[] {
  const entriesByTask = groupProgressEntries(input.progressEntries);

  return input.tasks
    .filter((task) => task.status !== 'deleted')
    .flatMap((task) => {
      const entries = entriesByTask.get(task.id) ?? [];
      return input.visibleDates
        .filter((date) => shouldShowTaskOnDate(task, date, input.carryProgressForward))
        .map((date) => buildOccurrence(task, date, entries, input.carryProgressForward));
    })
    .filter((task) => task.status !== 'deleted')
    .sort((a, b) => a.taskDate.localeCompare(b.taskDate) || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

export function clampProgressPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function shouldShowTaskOnDate(task: Task, date: string, carryProgressForward: boolean): boolean {
  if (task.sourceType === 'daily') {
    return date >= task.taskDate && (!task.endDate || date <= task.endDate);
  }

  if (task.sourceType === 'multi_day') {
    return date >= task.taskDate && (!task.endDate || date <= task.endDate);
  }

  if (carryProgressForward && task.status === 'active') {
    return date >= task.taskDate;
  }

  return date === task.taskDate;
}

function buildOccurrence(
  task: Task,
  date: string,
  entries: TaskProgressEntry[],
  carryProgressForward: boolean,
): TaskOccurrence {
  const directEntry = entries.find((entry) => entry.progressDate === date);
  const inheritedEntry =
    directEntry ??
    (shouldCarryProgress(task, carryProgressForward)
      ? entries
          .filter((entry) => entry.progressDate <= date)
          .sort((a, b) => b.progressDate.localeCompare(a.progressDate) || b.updatedAt.localeCompare(a.updatedAt))[0]
      : undefined);
  const status = resolveOccurrenceStatus(task, directEntry);

  return {
    ...task,
    taskDate: date,
    definitionTaskDate: task.taskDate,
    occurrenceDate: date,
    progressPercent: clampProgressPercent(inheritedEntry?.percent ?? 0),
    progressEntryId: directEntry?.id ?? null,
    status,
    completedAt: directEntry?.completedAt ?? (status === task.status ? task.completedAt : null),
    archivedAt: directEntry?.archivedAt ?? (status === task.status ? task.archivedAt : null),
    deletedAt: directEntry?.deletedAt ?? (status === task.status ? task.deletedAt : null),
  };
}

function shouldCarryProgress(task: Task, carryProgressForward: boolean): boolean {
  return carryProgressForward && task.sourceType !== 'daily';
}

function resolveOccurrenceStatus(task: Task, directEntry: TaskProgressEntry | undefined): TaskStatus {
  if (directEntry) {
    return directEntry.status;
  }

  return task.status;
}

function groupProgressEntries(entries: TaskProgressEntry[]): Map<string, TaskProgressEntry[]> {
  return entries.reduce<Map<string, TaskProgressEntry[]>>((groups, entry) => {
    groups.set(entry.taskId, [...(groups.get(entry.taskId) ?? []), entry]);
    return groups;
  }, new Map());
}
