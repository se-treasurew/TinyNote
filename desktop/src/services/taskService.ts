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
      // Up to three levels (parent → child → grandchild). The candidate parent's
      // depth must be < 2 for it to accept a child. Walk up the ancestor chain
      // (bounded by the 3-level cap) to compute depth.
      const parentDepth = await this.depthOf(parent);
      if (parentDepth >= 2) {
        throw new Error('Cannot create a subtask beyond three levels (parent → child → grandchild)');
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
      // Propagate to all descendants (children, grandchildren, ...) so the whole
      // tree stays in sync. Schedule editing is disabled for subtasks in the UI,
      // so only top-level tasks (parentTaskId === null) reach here.
      const descendants = await this.collectDescendants(id);
      if (descendants.length > 0) {
        const updatedDescendants = descendants.map((descendant) => ({
          ...descendant,
          sourceType: updated.sourceType,
          taskDate: updated.taskDate,
          endDate: updated.endDate,
          updatedAt: now,
          syncStatus: 'pending' as const,
          version: descendant.version + 1,
        }));
        await taskRepository.saveMany(updatedDescendants);
        for (const descendant of updatedDescendants) {
          await writeSyncLog({ entityType: 'task', entityId: descendant.id, operation: 'update', payload: descendant });
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

    // Cascade to active descendants that are also eligible on fromDate.
    // Children inherit the parent's range, so manual children are always
    // eligible and multi_day children are eligible iff the parent is.
    // postponeSingle does not itself look up children, so there is no double
    // cascade. Already-completed descendants are skipped by the eligibility
    // check (status must be active).
    const descendants = await this.collectDescendants(id);
    for (const descendant of descendants) {
      if (isPostponeEligibleTask(descendant, fromDate)) {
        await this.postponeSingle(descendant, fromDate, toDate, undefined);
      }
    }

    // Cascade up to ancestors: postponing a subtask should also postpone its
    // parent (and grandparents) so the whole branch moves together. Each
    // ancestor is postponed on its own (via postponeSingle, no recursion) to
    // avoid re-delaying the start node's descendants a second time. Siblings of
    // the start node are deliberately left untouched.
    let ancestorId = task.parentTaskId;
    while (ancestorId) {
      const ancestor = await taskRepository.findById(ancestorId);
      if (!ancestor) {
        break;
      }
      if (isPostponeEligibleTask(ancestor, fromDate)) {
        await this.postponeSingle(ancestor, fromDate, toDate, undefined);
      }
      ancestorId = ancestor.parentTaskId;
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
    const effectiveDate = occurrenceDate ?? task.taskDate;
    const occurrence = await this.saveTaskStatusForOccurrence(task, effectiveDate, 'completed');

    // Completing a subtask advances its parent's progress by the ratio of
    // completed direct children. Recompute up the ancestor chain so a
    // grandchild completion also nudges the grandparent.
    if (task.parentTaskId) {
      await this.recomputeAncestorProgress(task.parentTaskId, effectiveDate);
    }

    return occurrence;
  }

  async restoreTask(id: string, occurrenceDate?: string): Promise<TaskOccurrence> {
    const task = await this.requireTask(id);
    const effectiveDate = occurrenceDate ?? task.taskDate;
    const occurrence = await this.saveTaskStatusForOccurrence(task, effectiveDate, 'active');

    // Restoring a subtask decreases its parent's completion ratio. Walk up the
    // ancestor chain so each ancestor's progress reflects the new ratio.
    if (task.parentTaskId) {
      await this.recomputeAncestorProgress(task.parentTaskId, effectiveDate);
    }

    return occurrence;
  }

  async deleteTask(id: string): Promise<TaskOccurrence> {
    const task = await this.requireTask(id);
    const now = new Date().toISOString();
    const updated = applyDelete(task, now);

    // Cascade soft-delete to all descendants (recursive — grandchildren too).
    const descendants = await this.collectDescendants(id);
    const deletedDescendants = descendants.map((descendant) => applyDelete(descendant, now));

    await taskRepository.saveMany([updated, ...deletedDescendants]);
    // Free the routine instance slot so the task can be regenerated later.
    if (task.routineId) {
      await routineRepository.deleteInstanceByTaskId(id);
    }
    await writeSyncLog({ entityType: 'task', entityId: updated.id, operation: 'delete', payload: updated });
    for (const descendant of deletedDescendants) {
      await writeSyncLog({ entityType: 'task', entityId: descendant.id, operation: 'delete', payload: descendant });
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

  /** Depth of a task in the subtask tree: 0 for a top-level task, 1 for a child, 2 for a grandchild. */
  private async depthOf(task: Task): Promise<number> {
    let depth = 0;
    let current = task;
    // Bounded by the 3-level cap; stop if a cycle ever appears defensively.
    while (current.parentTaskId && depth < 3) {
      const ancestor = await taskRepository.findById(current.parentTaskId);
      if (!ancestor) {
        break;
      }
      current = ancestor;
      depth += 1;
    }
    return depth;
  }

  /** Recursively collect all descendants (children, grandchildren, ...) of a task. */
  private async collectDescendants(id: string): Promise<Task[]> {
    const descendants: Task[] = [];
    const visited = new Set<string>([id]);
    const stack = [id];
    while (stack.length > 0) {
      const parentId = stack.pop()!;
      const children = await taskRepository.listByParentId(parentId);
      for (const child of children) {
        if (visited.has(child.id)) {
          // Defensive: a malformed parent_task_id cycle would otherwise loop
          // forever. Skip any id we have already collected.
          continue;
        }
        visited.add(child.id);
        descendants.push(child);
        stack.push(child.id);
      }
    }
    return descendants;
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
      percent: status === 'active' ? 0 : 100,
      status,
      now,
    });

    await taskRepository.upsertProgressEntry(entry);
    await writeSyncLog({ entityType: 'task_progress', entityId: entry.id, operation: 'update', payload: entry });
    return this.taskToOccurrenceWithHistory(task, progressDate, [entry]);
  }

  private async saveTaskStatusForOccurrence(
    task: Task,
    occurrenceDate: string,
    status: 'completed' | 'active',
  ): Promise<TaskOccurrence> {
    if (task.sourceType !== 'manual') {
      return this.updateOccurrenceStatus(task, occurrenceDate, status);
    }

    if (occurrenceDate !== task.taskDate) {
      return this.updateOccurrenceStatus(task, occurrenceDate, status);
    }

    const directEntry = await taskRepository.findProgressEntry(task.id, occurrenceDate);
    if (directEntry) {
      return this.updateOccurrenceStatus(task, occurrenceDate, status);
    }

    return this.saveManualStatus(task, occurrenceDate, status);
  }

  /** Save a manual task's own status (active/completed/...) and return its occurrence. */
  private async saveManualStatus(
    task: Task,
    occurrenceDate: string,
    status: 'completed' | 'active',
  ): Promise<TaskOccurrence> {
    const now = new Date().toISOString();
    const updated = status === 'completed' ? applyComplete(task, now) : applyRestore(task, now);
    await taskRepository.save(updated);
    await writeSyncLog({ entityType: 'task', entityId: updated.id, operation: 'update', payload: updated });
    return this.taskToOccurrenceWithHistory(updated, occurrenceDate);
  }

  /**
   * Recompute progress up the ancestor chain after a child's completion state
   * changes. For each ancestor with direct children: the progress percent is
   * the ratio of completed direct children (manual child → its task.status;
   * daily/multi_day child → that date's progress entry status). A daily/
   * multi_day ancestor writes that ratio as a per-date progress entry; a
   * manual ancestor is auto-completed when all direct children are completed
   * (and restored to active otherwise).
   */
  private async recomputeAncestorProgress(ancestorId: string, occurrenceDate: string): Promise<void> {
    let currentId: string | null = ancestorId;
    // Bounded by the 3-level cap.
    while (currentId) {
      const ancestor = await taskRepository.findById(currentId);
      if (!ancestor) {
        break;
      }
      const children = await taskRepository.listByParentId(currentId);
      if (children.length === 0) {
        break;
      }

      // A child is "done" on this date if it has a completed progress entry
      // for this occurrence, otherwise manual children fall back to their
      // definition status.
      const childEntries = await taskRepository.listProgressEntries(
        children.map((child) => child.id),
        occurrenceDate,
      );
      const entryByChild = new Map(childEntries.map((entry) => [entry.taskId, entry]));
      const doneCount = children.filter((child) => {
        const entry = entryByChild.get(child.id);
        if (entry) {
          return entry.status === 'completed' || entry.status === 'archived';
        }
        if (child.sourceType === 'manual') {
          return child.status === 'completed' || child.status === 'archived';
        }
        return false;
      }).length;
      const total = children.length;
      const percent = clampProgressPercent(Math.round((doneCount / total) * 100));
      const allDone = doneCount === total;

      if (ancestor.sourceType === 'manual' && occurrenceDate === ancestor.taskDate) {
        const targetStatus = allDone ? 'completed' : 'active';
        const ancestorEntry = await taskRepository.findProgressEntry(ancestor.id, occurrenceDate);
        if (ancestorEntry) {
          await this.writeProgressPercent(ancestor, occurrenceDate, percent, allDone);
        } else if ((ancestor.status === 'completed') !== (targetStatus === 'completed')) {
          await this.saveManualStatus(ancestor, occurrenceDate, targetStatus);
        }
      } else {
        await this.writeProgressPercent(ancestor, occurrenceDate, percent, allDone);
      }

      currentId = ancestor.parentTaskId;
    }
  }

  /** Write a per-date progress entry with an explicit percent and derived status. */
  private async writeProgressPercent(
    task: Task,
    progressDate: string,
    percent: number,
    completed: boolean,
  ): Promise<void> {
    const now = new Date().toISOString();
    const existing = await taskRepository.findProgressEntry(task.id, progressDate);
    const status: TaskProgressEntry['status'] = completed ? 'completed' : 'active';
    const entry = createProgressEntry({
      existing,
      taskId: task.id,
      progressDate,
      percent,
      status,
      now,
    });
    await taskRepository.upsertProgressEntry(entry);
    await writeSyncLog({ entityType: 'task_progress', entityId: entry.id, operation: 'update', payload: entry });
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
