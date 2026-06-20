import { TaskRepository } from '../repositories/taskRepository';
import { RoutineRepository } from '../repositories/routineRepository';
import type { CreateTaskInput, Task, TaskDraft, TaskOccurrence, TaskPostponement, TaskProgressEntry, UpdateTaskInput } from '../types/task';
import { getVisibleDateRange } from '../utils/date';
import { getDeviceId, createId } from '../utils/id';
import { normalizeTitle } from '../utils/format';
import { applyComplete, applyDelete, applyRestore, groupActiveTasksByDate } from './taskWorkflow';
import { writeSyncLog } from './syncLogService';
import { buildTaskOccurrences, clampProgressPercent } from './taskOccurrence';
import { isPostponeEligibleTask } from './taskScheduling';

const taskRepository = new TaskRepository();
const routineRepository = new RoutineRepository();

export class TaskService {
  async loadVisibleTasks(
    startDate: string,
    visibleDays: number,
  ): Promise<TaskOccurrence[]> {
    const dates = getVisibleDateRange(startDate, visibleDays);
    const endDate = dates[dates.length - 1] ?? startDate;
    const tasks = await taskRepository.listByDateRange(startDate, endDate);
    const taskIds = tasks.map((task) => task.id);
    const [progressEntries, postponements] = await Promise.all([
      taskRepository.listProgressEntries(taskIds, endDate),
      taskRepository.listPostponements(taskIds),
    ]);
    return buildTaskOccurrences({
      tasks,
      progressEntries,
      postponements,
      visibleDates: dates,
    });
  }

  async loadAll(): Promise<Task[]> {
    return taskRepository.listAll();
  }

  async addTask(input: CreateTaskInput): Promise<TaskOccurrence> {
    const now = new Date().toISOString();
    // Subtasks inherit the parent's schedule (sourceType/taskDate/endDate) and
    // are limited to one level — a subtask cannot have subtasks. Enforce this
    // server-side rather than trusting the UI, using the parent's definition
    // values (a parent Task's taskDate IS the range start, unlike an
    // occurrence whose taskDate is the per-day value).
    let resolvedInput = input;
    if (input.parentTaskId) {
      const parent = await taskRepository.findById(input.parentTaskId);
      if (!parent) {
        throw new Error(`Parent task not found: ${input.parentTaskId}`);
      }
      if (parent.parentTaskId !== null) {
        throw new Error('Cannot create a subtask under another subtask (one level only)');
      }
      resolvedInput = {
        ...input,
        sourceType: parent.sourceType,
        taskDate: parent.taskDate,
        endDate: parent.endDate,
      };
    }

    const task = createTask({
      title: normalizeTitle(resolvedInput.title),
      content: resolvedInput.content ?? null,
      taskDate: resolvedInput.taskDate,
      endDate: resolvedInput.endDate ?? null,
      sourceType: resolvedInput.sourceType ?? 'manual',
      routineId: resolvedInput.routineId ?? null,
      parentTaskId: resolvedInput.parentTaskId ?? null,
      sortOrder: resolvedInput.sortOrder ?? Date.now(),
      now,
    });

    await taskRepository.insert(task);
    await writeSyncLog({ entityType: 'task', entityId: task.id, operation: 'create', payload: task });
    // For subtasks the definition taskDate is the parent's range start (stored
    // above), but the returned occurrence should land on the date the caller is
    // viewing (input.taskDate) so the optimistic merge shows it immediately
    // under the parent without a reload. taskToOccurrence uses input.taskDate as
    // the occurrence date while keeping definitionTaskDate from the stored task.
    return taskToOccurrence(task, input.taskDate, [], []);
  }

  async insertGeneratedTasks(drafts: TaskDraft[]): Promise<Task[]> {
    const tasks = drafts.map((draft) => ({
      ...draft,
      id: draft.id ?? createId('task'),
    }));

    await taskRepository.insertMany(tasks);
    for (const task of tasks) {
      await writeSyncLog({ entityType: 'task', entityId: task.id, operation: 'create', payload: task });
    }
    return tasks;
  }

  async updateTask(id: string, input: UpdateTaskInput): Promise<TaskOccurrence> {
    const task = await this.requireTask(id);
    const now = new Date().toISOString();
    const updated: Task = {
      ...task,
      title: input.title === undefined ? task.title : normalizeTitle(input.title),
      content: input.content === undefined ? task.content : input.content,
      taskDate: input.taskDate ?? task.taskDate,
      endDate: input.endDate === undefined ? task.endDate : input.endDate,
      sourceType: input.sourceType ?? task.sourceType,
      postponedAt: input.postponedAt === undefined ? task.postponedAt : input.postponedAt,
      sortOrder: input.sortOrder ?? task.sortOrder,
      updatedAt: now,
      syncStatus: 'pending',
      version: task.version + 1,
    };

    await taskRepository.save(updated);
    await writeSyncLog({ entityType: 'task', entityId: updated.id, operation: 'update', payload: updated });

    // A top-level parent's schedule change must propagate to its children so
    // the tree stays in sync. Subtask schedule editing is disabled in the UI,
    // so only top-level tasks (parentTaskId === null) propagate.
    const scheduleChanged =
      task.parentTaskId === null &&
      (input.sourceType !== undefined ||
        input.taskDate !== undefined ||
        input.endDate !== undefined);

    if (scheduleChanged) {
      const children = await taskRepository.listByParentId(id);
      if (children.length > 0) {
        const updatedChildren = children.map((child) => ({
          ...child,
          sourceType: updated.sourceType,
          taskDate: updated.taskDate,
          endDate: updated.endDate,
          updatedAt: now,
          syncStatus: 'pending' as const,
          version: child.version + 1,
        }));
        await taskRepository.saveMany(updatedChildren);
        for (const child of updatedChildren) {
          await writeSyncLog({ entityType: 'task', entityId: child.id, operation: 'update', payload: child });
        }
      }
    }

    return this.taskToOccurrenceWithHistory(updated, input.taskDate ?? updated.taskDate);
  }

  async updateTaskProgress(
    id: string,
    progressDate: string,
    percent: number,
  ): Promise<TaskOccurrence> {
    const task = await this.requireTask(id);
    const now = new Date().toISOString();
    const [existing, postponements] = await Promise.all([
      taskRepository.findProgressEntry(id, progressDate),
      taskRepository.listPostponements([id]),
    ]);
    const entry = createProgressEntry({
      existing,
      taskId: id,
      progressDate,
      percent: clampProgressPercent(percent),
      status: existing?.status ?? 'active',
      now,
    });

    await taskRepository.upsertProgressEntry(entry);
    await writeSyncLog({ entityType: 'task_progress', entityId: entry.id, operation: 'update', payload: entry });
    return taskToOccurrence(task, progressDate, [entry], postponements);
  }

  async postponeTask(id: string, fromDate: string, toDate: string, sourceProgressPercent?: number): Promise<TaskOccurrence> {
    const task = await this.requireTask(id);
    if (!isPostponeEligibleTask(task, fromDate)) {
      throw new Error('Task cannot be postponed');
    }

    if (toDate <= fromDate) {
      throw new Error('Postpone target date must be after source date');
    }

    const parentOccurrence = await this.postponeSingle(task, fromDate, toDate, sourceProgressPercent);

    // Cascade to active subtasks that are also eligible on fromDate. Children
    // inherit the parent's range, so manual children are always eligible and
    // multi_day children are eligible iff the parent is. postponeSingle does
    // not itself look up children, so there is no recursion (children cannot
    // have children at one level). Already-completed children are skipped by
    // the eligibility check (status must be active).
    const children = await taskRepository.listByParentId(id);
    for (const child of children) {
      if (isPostponeEligibleTask(child, fromDate)) {
        await this.postponeSingle(child, fromDate, toDate, undefined);
      }
    }

    return parentOccurrence;
  }

  private async postponeSingle(
    task: Task,
    fromDate: string,
    toDate: string,
    sourceProgressPercent?: number,
  ): Promise<TaskOccurrence> {
    const currentEntry = await this.resolveProgressForPostponement(task, fromDate);
    if (currentEntry && currentEntry.status !== 'active') {
      throw new Error('Task cannot be postponed');
    }

    const now = new Date().toISOString();
    const updated: Task = {
      ...task,
      endDate: task.sourceType === 'multi_day' && (!task.endDate || toDate > task.endDate) ? toDate : task.endDate,
      postponedAt: now,
      updatedAt: now,
      syncStatus: 'pending',
      version: task.version + 1,
    };
    const postponement = createPostponement({
      taskId: task.id,
      fromDate,
      toDate,
      now,
    });

    await taskRepository.save(updated);
    await taskRepository.upsertPostponement(postponement);
    await writeSyncLog({ entityType: 'task', entityId: updated.id, operation: 'update', payload: updated });
    await writeSyncLog({ entityType: 'task_postponement', entityId: postponement.id, operation: 'create', payload: postponement });

    const sourcePercent = currentEntry?.percent ?? clampProgressPercent(sourceProgressPercent ?? 0);
    const existingNextEntry = await taskRepository.findProgressEntry(task.id, toDate);
    const nextEntry = createProgressEntry({
      existing: existingNextEntry,
      taskId: task.id,
      progressDate: toDate,
      // Preserve the target date's existing progress instead of overwriting it
      // with the source date's value. Fall back to the carried source progress
      // only when the target date has no prior progress entry.
      percent: existingNextEntry?.percent ?? sourcePercent,
      status: 'active',
      now,
    });
    await taskRepository.upsertProgressEntry(nextEntry);
    await writeSyncLog({ entityType: 'task_progress', entityId: nextEntry.id, operation: 'update', payload: nextEntry });

    return taskToOccurrence(updated, toDate, [nextEntry], [postponement]);
  }

  async clearTaskPostponements(id: string): Promise<TaskOccurrence> {
    const task = await this.requireTask(id);
    const now = new Date().toISOString();
    const updated: Task = {
      ...task,
      postponedAt: null,
      updatedAt: now,
      syncStatus: 'pending',
      version: task.version + 1,
    };

    await taskRepository.save(updated);
    const deletedPostponements = await taskRepository.softDeletePostponements(id, now);
    await writeSyncLog({ entityType: 'task', entityId: updated.id, operation: 'update', payload: updated });
    for (const postponement of deletedPostponements) {
      await writeSyncLog({
        entityType: 'task_postponement',
        entityId: postponement.id,
        operation: 'delete',
        payload: postponement,
      });
    }

    return taskToOccurrence(updated, updated.taskDate, [], []);
  }

  async completeTask(id: string, occurrenceDate?: string): Promise<TaskOccurrence> {
    const task = await this.requireTask(id);
    if (task.sourceType !== 'manual') {
      return this.updateOccurrenceStatus(task, occurrenceDate ?? task.taskDate, 'completed');
    }

    const updated = applyComplete(task, new Date().toISOString());
    await taskRepository.save(updated);
    await writeSyncLog({ entityType: 'task', entityId: updated.id, operation: 'update', payload: updated });
    return this.taskToOccurrenceWithHistory(updated, occurrenceDate ?? updated.taskDate);
  }

  async restoreTask(id: string, occurrenceDate?: string): Promise<TaskOccurrence> {
    const task = await this.requireTask(id);
    if (task.sourceType !== 'manual' && occurrenceDate) {
      return this.updateOccurrenceStatus(task, occurrenceDate, 'active');
    }

    const updated = applyRestore(task, new Date().toISOString());
    await taskRepository.save(updated);
    await writeSyncLog({ entityType: 'task', entityId: updated.id, operation: 'update', payload: updated });
    return this.taskToOccurrenceWithHistory(updated, occurrenceDate ?? updated.taskDate);
  }

  async deleteTask(id: string): Promise<TaskOccurrence> {
    const task = await this.requireTask(id);
    const now = new Date().toISOString();
    const updated = applyDelete(task, now);

    // Cascade soft-delete to subtasks (one level — children have no children).
    const children = await taskRepository.listByParentId(id);
    const deletedChildren = children.map((child) => applyDelete(child, now));

    await taskRepository.saveMany([updated, ...deletedChildren]);
    // Free the routine instance slot so the task can be regenerated later.
    if (task.routineId) {
      await routineRepository.deleteInstanceByTaskId(id);
    }
    await writeSyncLog({ entityType: 'task', entityId: updated.id, operation: 'delete', payload: updated });
    for (const child of deletedChildren) {
      await writeSyncLog({ entityType: 'task', entityId: child.id, operation: 'delete', payload: child });
    }
    return taskToOccurrence(updated, updated.taskDate, [], []);
  }

  groupActiveTasks(tasks: Task[]) {
    return groupActiveTasksByDate(tasks);
  }

  private async requireTask(id: string): Promise<Task> {
    const task = await taskRepository.findById(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    return task;
  }

  private async updateOccurrenceStatus(
    task: Task,
    progressDate: string,
    status: TaskProgressEntry['status'],
  ): Promise<TaskOccurrence> {
    const now = new Date().toISOString();
    const existing = await taskRepository.findProgressEntry(task.id, progressDate);
    const entry = createProgressEntry({
      existing,
      taskId: task.id,
      progressDate,
      percent: existing?.percent ?? (status === 'active' ? 0 : 100),
      status,
      now,
    });

    await taskRepository.upsertProgressEntry(entry);
    await writeSyncLog({ entityType: 'task_progress', entityId: entry.id, operation: 'update', payload: entry });
    return this.taskToOccurrenceWithHistory(task, progressDate, [entry]);
  }

  private async taskToOccurrenceWithHistory(
    task: Task,
    occurrenceDate: string,
    progressEntries: TaskProgressEntry[] = [],
  ): Promise<TaskOccurrence> {
    const postponements = await taskRepository.listPostponements([task.id]);
    return taskToOccurrence(task, occurrenceDate, progressEntries, postponements);
  }

  private async resolveProgressForPostponement(task: Task, fromDate: string): Promise<TaskProgressEntry | null> {
    const directEntry = await taskRepository.findProgressEntry(task.id, fromDate);
    if (directEntry || task.sourceType !== 'multi_day') {
      return directEntry;
    }

    const entries = await taskRepository.listProgressEntries([task.id], fromDate);
    return entries
      .filter((entry) => entry.progressDate <= fromDate)
      .sort((a, b) => b.progressDate.localeCompare(a.progressDate) || b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  }
}

export const taskService = new TaskService();

function createTask(input: {
  title: string;
  content: string | null;
  taskDate: string;
  endDate: string | null;
  sourceType: Task['sourceType'];
  routineId: string | null;
  parentTaskId: string | null;
  sortOrder: number;
  now: string;
}): Task {
  return {
    id: createId('task'),
    userId: null,
    deviceId: getDeviceId(),
    title: input.title,
    content: input.content,
    taskDate: input.taskDate,
    endDate: input.endDate,
    status: 'active',
    priority: 'none',
    sourceType: input.sourceType,
    routineId: input.routineId,
    parentTaskId: input.parentTaskId,
    sortOrder: input.sortOrder,
    completedAt: null,
    archivedAt: null,
    deletedAt: null,
    postponedAt: null,
    createdAt: input.now,
    updatedAt: input.now,
    syncStatus: 'local',
    version: 1,
  };
}

function createProgressEntry(input: {
  existing: TaskProgressEntry | null;
  taskId: string;
  progressDate: string;
  percent: number;
  status: TaskProgressEntry['status'];
  now: string;
}): TaskProgressEntry {
  return {
    id: input.existing?.id ?? createId('progress'),
    taskId: input.taskId,
    progressDate: input.progressDate,
    percent: clampProgressPercent(input.percent),
    status: input.status,
    completedAt: input.status === 'completed' || input.status === 'archived' ? input.now : null,
    archivedAt: input.status === 'archived' ? input.now : null,
    deletedAt: input.status === 'deleted' ? input.now : null,
    createdAt: input.existing?.createdAt ?? input.now,
    updatedAt: input.now,
    syncStatus: 'pending',
    version: (input.existing?.version ?? 0) + 1,
  };
}

function createPostponement(input: {
  taskId: string;
  fromDate: string;
  toDate: string;
  now: string;
}): TaskPostponement {
  return {
    id: createId('postpone'),
    taskId: input.taskId,
    fromDate: input.fromDate,
    toDate: input.toDate,
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
    syncStatus: 'pending',
    version: 1,
  };
}

function taskToOccurrence(
  task: Task,
  occurrenceDate: string,
  progressEntries: TaskProgressEntry[],
  postponements: TaskPostponement[],
): TaskOccurrence {
  const directEntry = progressEntries.find((entry) => entry.progressDate === occurrenceDate);
  return buildTaskOccurrences({
    tasks: [task],
    progressEntries,
    postponements,
    visibleDates: [occurrenceDate],
  })[0] ?? {
    ...task,
    taskDate: occurrenceDate,
    definitionTaskDate: task.taskDate,
    occurrenceDate,
    progressPercent: clampProgressPercent(directEntry?.percent ?? 0),
    progressEntryId: directEntry?.id ?? null,
    postponementId: null,
    postponedFromDate: null,
    postponedToDate: null,
    postponementHistory: postponements,
    status: directEntry?.status ?? task.status,
    completedAt: directEntry?.completedAt ?? task.completedAt,
    archivedAt: directEntry?.archivedAt ?? task.archivedAt,
    deletedAt: directEntry?.deletedAt ?? task.deletedAt,
  };
}
