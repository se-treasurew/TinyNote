import { todayIsoDate } from '../utils/date';
import type { Task, TaskOccurrence, TaskPostponement, TaskProgressEntry, TaskStatus } from '../types/task';

interface BuildTaskOccurrencesInput {
  tasks: Task[];
  progressEntries: TaskProgressEntry[];
  postponements: TaskPostponement[];
  visibleDates: string[];
  /** ISO date treated as "today" for the carry-forward guard. Defaults to now. */
  today?: string;
}

export function buildTaskOccurrences(input: BuildTaskOccurrencesInput): TaskOccurrence[] {
  const entriesByTask = groupProgressEntries(input.progressEntries);
  const postponementsByTask = groupPostponements(input.postponements);
  const today = input.today ?? todayIsoDate();

  return input.tasks
    .filter((task) => task.status !== 'deleted')
    .flatMap((task) => {
      const entries = entriesByTask.get(task.id) ?? [];
      const taskPostponements = postponementsByTask.get(task.id) ?? [];
      return visibleTaskDates(task, taskPostponements, input.visibleDates)
        .map((date) => buildOccurrence(task, date, entries, taskPostponements, today));
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

function shouldShowTaskOnDate(task: Task, date: string): boolean {
  if (task.sourceType === 'daily') {
    return date >= task.taskDate && (!task.endDate || date <= task.endDate);
  }

  if (task.sourceType === 'multi_day') {
    return date >= task.taskDate && (!task.endDate || date <= task.endDate);
  }

  // manual: only shows on its own date, never carries forward
  return date === task.taskDate;
}

function visibleTaskDates(task: Task, postponements: TaskPostponement[], visibleDates: string[]): string[] {
  const activePostponements = postponements.filter((postponement) => !postponement.deletedAt);
  const dates = new Set<string>();
  for (const date of visibleDates) {
    if (shouldShowTaskOnDate(task, date) || activePostponements.some((postponement) => postponement.toDate === date)) {
      dates.add(date);
    }
  }

  return Array.from(dates);
}

function buildOccurrence(
  task: Task,
  date: string,
  entries: TaskProgressEntry[],
  postponements: TaskPostponement[],
  today: string,
): TaskOccurrence {
  const directEntry = entries.find((entry) => entry.progressDate === date);
  const inheritedEntry = directEntry ?? resolveInheritedProgressEntry(task, date, entries, today);
  const status = resolveOccurrenceStatus(task, directEntry);
  const activePostponements = postponements.filter((postponement) => !postponement.deletedAt);
  const occurrencePostponement = resolveOccurrencePostponement(activePostponements, date);

  return {
    ...task,
    taskDate: date,
    definitionTaskDate: task.taskDate,
    occurrenceDate: date,
    progressPercent: clampProgressPercent(inheritedEntry?.percent ?? 0),
    progressEntryId: directEntry?.id ?? null,
    postponementId: occurrencePostponement?.id ?? null,
    postponedFromDate: occurrencePostponement?.fromDate ?? null,
    postponedToDate: occurrencePostponement?.toDate ?? null,
    postponementHistory: activePostponements,
    status,
    completedAt: directEntry?.completedAt ?? (status === task.status ? task.completedAt : null),
    archivedAt: directEntry?.archivedAt ?? (status === task.status ? task.archivedAt : null),
    deletedAt: directEntry?.deletedAt ?? (status === task.status ? task.deletedAt : null),
  };
}

function resolveInheritedProgressEntry(
  task: Task,
  date: string,
  entries: TaskProgressEntry[],
  today: string,
): TaskProgressEntry | undefined {
  if (task.sourceType !== 'multi_day') {
    return undefined;
  }

  // Multi-day progress carries forward to "today and before" only — never onto
  // future dates. A future day hasn't happened yet, so it shows no carried
  // progress until the day arrives.
  if (date > today) {
    return undefined;
  }

  return entries
    .filter((entry) => entry.progressDate <= date)
    .sort((a, b) => b.progressDate.localeCompare(a.progressDate) || b.updatedAt.localeCompare(a.updatedAt))[0];
}

function resolveOccurrencePostponement(postponements: TaskPostponement[], date: string): TaskPostponement | undefined {
  return postponements
    .filter((postponement) => postponement.fromDate === date || postponement.toDate === date)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.updatedAt.localeCompare(a.updatedAt))[0];
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

function groupPostponements(postponements: TaskPostponement[]): Map<string, TaskPostponement[]> {
  return postponements.reduce<Map<string, TaskPostponement[]>>((groups, postponement) => {
    groups.set(postponement.taskId, [...(groups.get(postponement.taskId) ?? []), postponement]);
    return groups;
  }, new Map());
}
