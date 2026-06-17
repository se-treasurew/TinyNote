import { TaskRepository } from '../repositories/taskRepository';
import type { CreateTaskInput, Task, TaskDraft, TaskOccurrence, TaskProgressEntry, UpdateTaskInput } from '../types/task';
import { getVisibleDateRange } from '../utils/date';
import { getDeviceId, createId } from '../utils/id';
import { normalizeTitle } from '../utils/format';
import { applyArchive, applyComplete, applyDelete, applyRestore, groupActiveTasksByDate } from './taskWorkflow';
import { writeSyncLog } from './syncLogService';
import { buildTaskOccurrences, clampProgressPercent } from './taskOccurrence';

const taskRepository = new TaskRepository();

export class TaskService {
  async loadVisibleTasks(startDate: string, visibleDays: number, carryProgressForward = false): Promise<TaskOccurrence[]> {
    const dates = getVisibleDateRange(startDate, visibleDays);
    const endDate = dates[dates.length - 1] ?? startDate;
    const tasks = await taskRepository.listByDateRange(startDate, endDate);
    const progressEntries = await taskRepository.listProgressEntries(tasks.map((task) => task.id), endDate);
    return buildTaskOccurrences({
      tasks,
      progressEntries,
      visibleDates: dates,
      carryProgressForward,
    });
  }

  async loadArchive(): Promise<Task[]> {
    return taskRepository.listArchive();
  }

  async loadAll(): Promise<Task[]> {
    return taskRepository.listAll();
  }

  async addTask(input: CreateTaskInput): Promise<TaskOccurrence> {
    const now = new Date().toISOString();
    const task = createTask({
      title: normalizeTitle(input.title),
      content: input.content ?? null,
      taskDate: input.taskDate,
      endDate: input.endDate ?? null,
      sourceType: input.sourceType ?? 'manual',
      routineId: input.routineId ?? null,
      parentTaskId: input.parentTaskId ?? null,
      sortOrder: input.sortOrder ?? Date.now(),
      now,
    });

    await taskRepository.insert(task);
    await writeSyncLog({ entityType: 'task', entityId: task.id, operation: 'create', payload: task });
    return taskToOccurrence(task, input.taskDate, []);
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
      sortOrder: input.sortOrder ?? task.sortOrder,
      updatedAt: now,
      syncStatus: 'pending',
      version: task.version + 1,
    };

    await taskRepository.save(updated);
    await writeSyncLog({ entityType: 'task', entityId: updated.id, operation: 'update', payload: updated });
    return taskToOccurrence(updated, input.taskDate ?? updated.taskDate, []);
  }

  async updateTaskProgress(
    id: string,
    progressDate: string,
    percent: number,
    carryProgressForward = false,
  ): Promise<TaskOccurrence> {
    const task = await this.requireTask(id);
    const now = new Date().toISOString();
    const existing = await taskRepository.findProgressEntry(id, progressDate);
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
    return taskToOccurrence(task, progressDate, [entry], carryProgressForward);
  }

  async completeTask(id: string, completeToArchive: boolean, occurrenceDate?: string): Promise<TaskOccurrence> {
    const task = await this.requireTask(id);
    if (task.sourceType !== 'manual') {
      return this.updateOccurrenceStatus(task, occurrenceDate ?? task.taskDate, completeToArchive ? 'archived' : 'completed');
    }

    const updated = applyComplete(task, completeToArchive, new Date().toISOString());
    await taskRepository.save(updated);
    await writeSyncLog({ entityType: 'task', entityId: updated.id, operation: 'update', payload: updated });
    return taskToOccurrence(updated, occurrenceDate ?? updated.taskDate, []);
  }

  async archiveTask(id: string): Promise<TaskOccurrence> {
    const task = await this.requireTask(id);
    const updated = applyArchive(task, new Date().toISOString());
    await taskRepository.save(updated);
    await writeSyncLog({ entityType: 'task', entityId: updated.id, operation: 'update', payload: updated });
    return taskToOccurrence(updated, updated.taskDate, []);
  }

  async restoreTask(id: string, occurrenceDate?: string): Promise<TaskOccurrence> {
    const task = await this.requireTask(id);
    if (task.sourceType !== 'manual' && occurrenceDate) {
      return this.updateOccurrenceStatus(task, occurrenceDate, 'active');
    }

    const updated = applyRestore(task, new Date().toISOString());
    await taskRepository.save(updated);
    await writeSyncLog({ entityType: 'task', entityId: updated.id, operation: 'update', payload: updated });
    return taskToOccurrence(updated, occurrenceDate ?? updated.taskDate, []);
  }

  async deleteTask(id: string): Promise<TaskOccurrence> {
    const task = await this.requireTask(id);
    const updated = applyDelete(task, new Date().toISOString());
    await taskRepository.save(updated);
    await writeSyncLog({ entityType: 'task', entityId: updated.id, operation: 'delete', payload: updated });
    return taskToOccurrence(updated, updated.taskDate, []);
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
    return taskToOccurrence(task, progressDate, [entry]);
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

function taskToOccurrence(
  task: Task,
  occurrenceDate: string,
  progressEntries: TaskProgressEntry[],
  carryProgressForward = false,
): TaskOccurrence {
  return buildTaskOccurrences({
    tasks: [task],
    progressEntries,
    visibleDates: [occurrenceDate],
    carryProgressForward,
  })[0] ?? {
    ...task,
    taskDate: occurrenceDate,
    definitionTaskDate: task.taskDate,
    occurrenceDate,
    progressPercent: 0,
    progressEntryId: null,
  };
}
